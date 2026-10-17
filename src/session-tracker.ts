const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns `true` if `id` is a well-formed UUID (the format peon-ping uses for session IDs). */
export function isValidSessionId(id: unknown): id is string {
  if (!id || typeof id !== 'string') {
    return false;
  }
  return UUID_RE.test(id);
}

/** A minimal map from session ID -> last-seen timestamp. */
export interface SessionTracker {
  /** Record or refresh a session, defaulting to `Date.now()`. */
  update(sessionId: string, timestamp?: number): void;
  /** Remove all sessions whose timestamp is older than `cutoff`. */
  prune(cutoff: number): void;
  /** Number of tracked sessions. */
  size(): number;
  /** Returns `[id, timestamp]` pairs for all tracked sessions. */
  entries(): [string, number][];
  /** Explicitly remove a single session (e.g. on `SessionEnd`). */
  remove(sessionId: string): void;
}

/** Creates a new in-memory {@link SessionTracker}. */
export function createSessionTracker(): SessionTracker {
  const map = new Map<string, number>();
  return {
    update(sessionId, timestamp = Date.now()) {
      map.set(sessionId, timestamp);
    },
    prune(cutoff) {
      for (const [id, t] of map) {
        if (t < cutoff) {
          map.delete(id);
        }
      }
    },
    size() {
      return map.size;
    },
    entries() {
      return [...map.entries()];
    },
    remove(sessionId) {
      map.delete(sessionId);
    },
  };
}

/** The display state of a single tracked session, used by the webview for dot rendering. */
export interface SessionState {
  /** peon-ping session UUID. */
  id: string;
  /** `true` if the session had activity within the last 30 s. */
  hot: boolean;
  /** `true` if the session had activity within the last 2 min. */
  warm: boolean;
  /** Working directory reported by peon-ping, or `null` if unknown. */
  cwd: string | null;
}

/**
 * Converts raw tracker entries into {@link SessionState} objects sorted by
 * recency, capped at `maxCount`.
 */
export function buildSessionStates(
  entries: [string, number][],
  now: number,
  hotMs: number,
  warmMs: number,
  maxCount: number,
): SessionState[] {
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([id, t]) => ({
      id,
      hot: now - t < hotMs,
      warm: now - t < warmMs,
      cwd: null,
    }));
}

/**
 * Maps peon-ping event names to sprite animation names.
 * Events not in this map are tracked for session state but do not trigger an animation.
 */
export const EVENT_TO_ANIM: Record<string, string> = {
  SessionStart: 'waking',
  Stop: 'celebrate',
  UserPromptSubmit: 'typing',
  PermissionRequest: 'alarmed',
  PostToolUseFailure: 'annoyed',
  PreCompact: 'alarmed',
};
