import * as fs from 'fs';
import * as vscode from 'vscode';
import { PEON_STATE_FILE as STATE_FILE } from './peon-guide';
import {
  isValidSessionId,
  createSessionTracker,
  buildSessionStates,
  EVENT_TO_ANIM,
  SessionState,
} from './session-tracker';

/** How often to poll the state file (ms). */
const POLL_MS = 200;
/** Sessions older than this are pruned from memory. */
const SESSION_PRUNE_MS = 10 * 60 * 1000;
/** A session is "hot" (actively running) within this window. */
const HOT_MS = 30 * 1000;
/** A session is "warm" (recently active) within this window. */
const WARM_MS = 2 * 60 * 1000;
/** Maximum number of concurrent sessions to track. */
const MAX_SESSIONS = 10;

/** Fired when a peon-ping event maps to an animation. */
export interface PeonEvent {
  anim: string;
  event: string;
  /** Folder of the session that raised the event, if peon-ping recorded one. */
  cwd: string | null;
}

/** Fired on every poll cycle with the current session list. */
export interface SessionUpdate {
  sessions: SessionState[];
}

type PeonEventListener = (e: PeonEvent) => void;
type SessionListener = (e: SessionUpdate) => void;

/** The shape of the `last_active` object written by peon-ping. */
interface PeonPingEntry {
  timestamp: number;
  event: string;
  session_id: string;
  cwd?: string;
}

/** Runtime type guard for {@link PeonPingEntry}. */
function isPeonPingEntry(v: unknown): v is PeonPingEntry {
  if (!v || typeof v !== 'object') {
    return false;
  }
  const e = v as Record<string, unknown>;
  return (
    typeof e['timestamp'] === 'number' &&
    typeof e['event'] === 'string' &&
    typeof e['session_id'] === 'string' &&
    (e['cwd'] === undefined || typeof e['cwd'] === 'string')
  );
}

/**
 * Polls `~/.claude/hooks/peon-ping/.state.json` and emits events whenever
 * peon-ping writes a new entry. A single shared instance is used by all
 * webviews; each webview receives its own {@link vscode.Disposable} via
 * {@link onPeonEvent} / {@link onSessionUpdate} so that closing one view does
 * not remove another view's listeners.
 */
export class StateWatcher implements vscode.Disposable {
  private lastTimestamp = 0;
  private tracker = createSessionTracker();
  private sessionCwds = new Map<string, string>();
  private eventListeners: PeonEventListener[] = [];
  private sessionListeners: SessionListener[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;

  /** Start polling the state file. Safe to call multiple times. */
  start(): void {
    if (this.interval) {
      return;
    }
    this.interval = setInterval(() => this.poll(), POLL_MS);
  }

  /** Stop polling. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  dispose(): void {
    this.stop();
  }

  /**
   * Register a listener for animation events. Returns a {@link vscode.Disposable}
   * that removes only this listener when disposed -- safe to use alongside other
   * active webviews.
   */
  onPeonEvent(listener: PeonEventListener): vscode.Disposable {
    this.eventListeners.push(listener);
    return new vscode.Disposable(() => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    });
  }

  /**
   * Register a listener for session-state updates. Returns a {@link vscode.Disposable}
   * that removes only this listener when disposed.
   */
  onSessionUpdate(listener: SessionListener): vscode.Disposable {
    this.sessionListeners.push(listener);
    return new vscode.Disposable(() => {
      this.sessionListeners = this.sessionListeners.filter((l) => l !== listener);
    });
  }

  // -- Private polling pipeline ---------------------------------------------------

  private poll(): void {
    const entry = this.readStateFile();
    if (!entry) {
      return;
    }
    if (entry.timestamp === this.lastTimestamp) {
      return;
    }
    this.lastTimestamp = entry.timestamp;

    const now = Date.now();
    this.handleSessionEvent(entry, now);
    this.fireListeners(entry, now);
  }

  /** Reads and parses the state file. Returns `null` on any I/O or parse error. */
  private readStateFile(): PeonPingEntry | null {
    let raw: string;
    try {
      raw = fs.readFileSync(STATE_FILE, 'utf8');
    } catch {
      return null;
    }

    let state: unknown;
    try {
      state = JSON.parse(raw);
    } catch {
      return null;
    }

    if (!state || typeof state !== 'object') {
      return null;
    }

    const active = (state as Record<string, unknown>)['last_active'];
    return isPeonPingEntry(active) ? active : null;
  }

  /**
   * Updates in-memory session tracking based on the incoming event.
   * Handles `SessionEnd` removal, resume deduplication, and cwd cleanup.
   */
  private handleSessionEvent(entry: PeonPingEntry, now: number): void {
    const { event, session_id, cwd } = entry;

    if (!isValidSessionId(session_id)) {
      return;
    }

    if (event === 'SessionEnd') {
      this.tracker.remove(session_id);
      this.sessionCwds.delete(session_id);
      return;
    }

    // Deduplicate resume events: if exactly one other session started within 5 s, replace it
    if (event === 'SessionStart') {
      const existing = this.tracker.entries();
      const isNew = !existing.some(([id]) => id === session_id);
      if (isNew && existing.length === 1) {
        const [oldId, oldTime] = existing[0];
        if (now - oldTime < 5000) {
          this.tracker.remove(oldId);
        }
      }
    }

    this.tracker.update(session_id, now);
    if (cwd) {
      this.sessionCwds.set(session_id, cwd);
    }

    this.tracker.prune(now - SESSION_PRUNE_MS);

    // Remove cwd entries for sessions that no longer exist in the tracker.
    // Snapshot entries once to avoid O(n²) work.
    const trackedIds = new Set(this.tracker.entries().map(([id]) => id));
    for (const id of this.sessionCwds.keys()) {
      if (!trackedIds.has(id)) {
        this.sessionCwds.delete(id);
      }
    }
  }

  /** Builds the current session-state list and dispatches to all listeners. */
  private fireListeners(entry: PeonPingEntry, now: number): void {
    const sessions = buildSessionStates(this.tracker.entries(), now, HOT_MS, WARM_MS, MAX_SESSIONS);
    const sessionsWithCwd: SessionState[] = sessions.map((s) => ({
      ...s,
      cwd: this.sessionCwds.get(s.id) ?? null,
    }));

    for (const l of this.sessionListeners) {
      l({ sessions: sessionsWithCwd });
    }

    const anim = EVENT_TO_ANIM[entry.event];
    if (anim) {
      for (const l of this.eventListeners) {
        l({
          anim,
          event: entry.event,
          cwd: entry.cwd ?? this.sessionCwds.get(entry.session_id) ?? null,
        });
      }
    }
  }
}
