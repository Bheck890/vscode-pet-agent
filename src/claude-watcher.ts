import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildSessionStates, SessionState } from './session-tracker';
import { funnyName } from './pet-names';
import { inFolders } from './workspace';
import { TailedFile, firstCwd, readLines, safeReaddir, safeStat } from './transcript-tail';
import {
  AgentActivity,
  Job,
  PetState,
  applyLine,
  createActivity,
  currentState,
} from './transcript-parser';

/** Claude Code writes one JSONL transcript per session (and per sub-agent) under here. */
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

const TICK_MS = 500;
const SCAN_MS = 3000;
/** Sessions whose transcript was touched within this window are tracked. */
const ACTIVE_MS = 10 * 60 * 1000;
/** On first sight only the tail of a transcript is replayed; they can be many MB. */
const INITIAL_TAIL_BYTES = 256 * 1024;
/** A sub-agent transcript older than this when first seen is history, not a live helper. */
const SUBAGENT_FRESH_MS = 60 * 1000;
const SUBAGENT_DONE_LINGER_MS = 6000;
const SUBAGENT_STALE_MS = 2 * 60 * 1000;
const HOT_MS = 30 * 1000;
const WARM_MS = 2 * 60 * 1000;
const MAX_SESSIONS = 10;
const MAX_SUBAGENTS = 8;
const MAX_BACKGROUND = 4;

export interface MainPetUpdate {
  sessionId: string;
  state: PetState;
  detail: string;
  seq: number;
  /** Transcript time of the last state change; seeds the animation pick. */
  since: number;
  project: string | null;
  jobs: Job[];
}

export interface SubagentUpdate {
  id: string;
  name: string;
  agentType: string;
  task: string;
  state: PetState;
  detail: string;
  seq: number;
  /** Transcript time of the last state change; seeds the animation pick. */
  since: number;
  jobs: Job[];
}

/**
 * Another recently busy Claude session, shown as a mini pet: one in this
 * workspace (`local`, e.g. a second chat) or, if the user opts in, one in
 * another repo. Either way it never drives this window's main pet.
 */
export interface BackgroundUpdate {
  id: string;
  project: string | null;
  local: boolean;
  state: PetState;
  detail: string;
  seq: number;
  /** Transcript time of the last state change; seeds the animation pick. */
  since: number;
  jobs: Job[];
}

export interface ClaudeUpdate {
  main: MainPetUpdate | null;
  subagents: SubagentUpdate[];
  background: BackgroundUpdate[];
  sessions: SessionState[];
}

function projectName(cwd: string | null): string | null {
  return cwd ? path.basename(cwd.replace(/\\/g, '/')) : null;
}

type Listener = (u: ClaudeUpdate) => void;

interface Tracked extends TailedFile {
  mtime: number;
  act: AgentActivity;
}

/** Feeds the lines appended to a transcript since the last read into its activity. */
function readNewLines(t: Tracked, size: number): void {
  if (readLines(t, size, (line) => applyLine(t.act, line)) === 'restarted') {
    t.act = createActivity();
    readLines(t, size, (line) => applyLine(t.act, line));
  }
}

interface TrackedSession extends Tracked {
  id: string;
  dir: string;
  /** The folder the session started in. The shell may wander off later (e.g. into a temp dir). */
  root: string | null;
}

interface TrackedSubagent extends Tracked {
  id: string;
  sessionId: string;
  name: string;
  agentType: string;
  task: string;
  doneAt: number | null;
}

/**
 * Tails Claude Code transcripts (`~/.claude/projects/<project>/<session>.jsonl`
 * and `<session>/subagents/agent-*.jsonl`) read-only and reports what the
 * main agent and each live sub-agent are doing. The session shown on the pet
 * is the most recently active one inside the open workspace, falling back to
 * the most recent overall.
 */
export class ClaudeWatcher implements vscode.Disposable {
  private sessions = new Map<string, TrackedSession>();
  private subagents = new Map<string, TrackedSubagent>();
  private listeners: Listener[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private lastJson = '';

  constructor(private readonly workspaceFolders: () => string[]) {}

  start(): void {
    if (this.timers.length > 0) {
      return;
    }
    this.scan();
    this.tick();
    this.timers.push(setInterval(() => this.scan(), SCAN_MS));
    this.timers.push(setInterval(() => this.tick(), TICK_MS));
  }

  dispose(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  /** Register a listener. The returned Disposable removes only this listener. */
  onUpdate(listener: Listener): vscode.Disposable {
    this.listeners.push(listener);
    return new vscode.Disposable(() => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    });
  }

  /** The last update sent, so newly opened views don't wait for a change. */
  latest(): ClaudeUpdate | null {
    return this.lastJson ? (JSON.parse(this.lastJson) as ClaudeUpdate) : null;
  }

  // -- Discovery --------------------------------------------------------------

  private scan(now = Date.now()): void {
    for (const project of safeReaddir(PROJECTS_DIR)) {
      if (!project.isDirectory()) {
        continue;
      }
      const dir = path.join(PROJECTS_DIR, project.name);
      for (const entry of safeReaddir(dir)) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
          continue;
        }
        const id = entry.name.slice(0, -'.jsonl'.length);
        if (this.sessions.has(id)) {
          continue;
        }
        const file = path.join(dir, entry.name);
        const st = safeStat(file);
        if (st && now - st.mtimeMs < ACTIVE_MS) {
          const s: TrackedSession = {
            id,
            dir,
            root: firstCwd(file),
            file,
            offset: Math.max(0, st.size - INITIAL_TAIL_BYTES),
            midLine: st.size > INITIAL_TAIL_BYTES,
            mtime: st.mtimeMs,
            act: createActivity(),
          };
          readNewLines(s, st.size);
          this.sessions.set(id, s);
        }
      }
    }

    for (const s of this.sessions.values()) {
      this.scanSubagents(s, now);
    }
  }

  private scanSubagents(session: TrackedSession, now: number): void {
    const subDir = path.join(session.dir, session.id, 'subagents');
    for (const entry of safeReaddir(subDir)) {
      const m = /^agent-(.+)\.jsonl$/.exec(entry.name);
      if (!m || this.subagents.has(m[1])) {
        continue;
      }
      const file = path.join(subDir, entry.name);
      const st = safeStat(file);
      if (!st || now - st.mtimeMs > SUBAGENT_FRESH_MS) {
        continue;
      }
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(
          fs.readFileSync(path.join(subDir, `agent-${m[1]}.meta.json`), 'utf8'),
        ) as Record<string, unknown>;
      } catch {
        // meta.json may not be written yet; fall back to generic labels.
      }
      const agentType = typeof meta['agentType'] === 'string' ? meta['agentType'] : 'agent';
      const task = typeof meta['description'] === 'string' ? meta['description'] : '';
      const taken = new Set([...this.subagents.values()].map((a) => a.name));
      const sub: TrackedSubagent = {
        id: m[1],
        sessionId: session.id,
        name: funnyName(m[1], `${agentType} ${task}`, taken),
        agentType,
        task,
        file,
        offset: 0,
        midLine: false,
        mtime: st.mtimeMs,
        act: createActivity(),
        doneAt: null,
      };
      readNewLines(sub, st.size);
      this.subagents.set(m[1], sub);
    }
  }

  // -- Polling ----------------------------------------------------------------

  private tick(now = Date.now()): void {
    for (const [id, s] of this.sessions) {
      const st = safeStat(s.file);
      if (!st || now - st.mtimeMs > ACTIVE_MS) {
        this.sessions.delete(id);
        continue;
      }
      s.mtime = st.mtimeMs;
      readNewLines(s, st.size);
    }

    for (const [id, a] of this.subagents) {
      const st = safeStat(a.file);
      if (st) {
        a.mtime = st.mtimeMs;
        readNewLines(a, st.size);
      }
      if (a.act.finished && a.doneAt === null) {
        a.doneAt = now;
      }
      const lingeredOut = a.doneAt !== null && now - a.doneAt > SUBAGENT_DONE_LINGER_MS;
      const stale = now - Math.max(a.act.lastAt, a.mtime) > SUBAGENT_STALE_MS;
      if (!st || lingeredOut || stale || !this.sessions.has(a.sessionId)) {
        this.subagents.delete(id);
      }
    }

    this.emit(this.snapshot(now));
  }

  private lastActive(t: Tracked): number {
    return Math.max(t.act.lastAt, t.mtime);
  }

  /** True if `dir` is inside a folder open in this VS Code window. */
  ownsDir(dir: string | null | undefined): boolean {
    return inFolders(dir, this.workspaceFolders());
  }

  /**
   * The session this window's pet acts out: the most recent one started in
   * this window's workspace. Sessions from other windows never take over, even
   * when this window has none, so each pet stays in its own lane. Where the
   * session started counts, not where its shell has wandered since.
   */
  private pickMain(): TrackedSession | null {
    const all = [...this.sessions.values()].sort((a, b) => this.lastActive(b) - this.lastActive(a));
    return all.find((s) => this.ownsDir(s.root ?? s.act.cwd)) ?? null;
  }

  private snapshot(now: number): ClaudeUpdate {
    const main = this.pickMain();
    const subagents = main
      ? [...this.subagents.values()]
          .filter((a) => a.sessionId === main.id)
          .slice(0, MAX_SUBAGENTS)
          .map((a) => ({
            id: a.id,
            name: a.name,
            agentType: a.agentType,
            task: a.task,
            ...currentState(a.act, now),
          }))
      : [];

    const background = [...this.sessions.values()]
      .filter((s) => s !== main && now - this.lastActive(s) < WARM_MS)
      .map((s) => ({ s, local: this.ownsDir(s.root ?? s.act.cwd) }))
      // This repo's sessions first, so other repos never crowd them out.
      .sort(
        (a, b) => Number(b.local) - Number(a.local) || this.lastActive(b.s) - this.lastActive(a.s),
      )
      .slice(0, MAX_BACKGROUND)
      .map(({ s, local }) => ({
        id: s.id,
        project: projectName(s.root ?? s.act.cwd),
        local,
        ...currentState(s.act, now),
      }));

    const entries: [string, number][] = [...this.sessions.values()].map((s) => [
      s.id,
      this.lastActive(s),
    ]);
    const sessions = buildSessionStates(entries, now, HOT_MS, WARM_MS, MAX_SESSIONS).map((s) => ({
      ...s,
      cwd: this.sessions.get(s.id)?.act.cwd ?? null,
    }));

    return {
      main: main
        ? {
            sessionId: main.id,
            project: projectName(main.root ?? main.act.cwd),
            ...currentState(main.act, now),
          }
        : null,
      subagents,
      background,
      sessions,
    };
  }

  private emit(update: ClaudeUpdate): void {
    const json = JSON.stringify(update);
    if (json === this.lastJson) {
      return;
    }
    this.lastJson = json;
    for (const l of this.listeners) {
      l(update);
    }
  }
}
