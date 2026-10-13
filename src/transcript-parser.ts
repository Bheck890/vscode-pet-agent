import * as path from 'path';

/** Everything a pet can be doing. Mirrored by `STATES` in `media/webview.js`. */
export type PetState =
  | 'sleeping'
  | 'idle'
  | 'waking'
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'running'
  | 'browsing'
  | 'delegating'
  | 'waiting'
  | 'error'
  | 'done';

/** Live activity of one agent (main session or sub-agent), built from its transcript. */
export interface AgentActivity {
  state: PetState;
  detail: string;
  /** Bumped on every state assignment so repeated states (e.g. two `done`s) still animate. */
  seq: number;
  /** Timestamp (ms) of the newest transcript line seen. */
  lastAt: number;
  cwd: string | null;
  /** Tool calls that have no result yet, keyed by tool_use id. */
  pending: Map<string, string>;
  /** True once the agent's turn ended (`stop_reason: end_turn`). */
  finished: boolean;
}

/** A pending non-shell tool call this old is most likely sitting on a permission prompt. */
export const PERMISSION_GUESS_MS = 5000;
/** A turn with no new lines for this long was probably abandoned. */
export const STALE_MS = 2 * 60 * 1000;

const TOOL_STATES: Record<string, PetState> = {
  Read: 'reading',
  Grep: 'reading',
  Glob: 'reading',
  LS: 'reading',
  NotebookRead: 'reading',
  Edit: 'writing',
  MultiEdit: 'writing',
  Write: 'writing',
  NotebookEdit: 'writing',
  Bash: 'running',
  PowerShell: 'running',
  BashOutput: 'running',
  Monitor: 'running',
  WebFetch: 'browsing',
  WebSearch: 'browsing',
  Agent: 'delegating',
  Task: 'delegating',
  TodoWrite: 'thinking',
  AskUserQuestion: 'waiting',
  ExitPlanMode: 'waiting',
};

/** Tools that legitimately run for a long time, so a missing result is not a permission prompt. */
const LONG_RUNNING = new Set([
  'Bash',
  'PowerShell',
  'BashOutput',
  'Monitor',
  'Agent',
  'Task',
  'WebFetch',
  'WebSearch',
]);

export function createActivity(): AgentActivity {
  return {
    state: 'idle',
    detail: '',
    seq: 0,
    lastAt: 0,
    cwd: null,
    pending: new Map(),
    finished: false,
  };
}

export function toolState(name: string): PetState {
  if (TOOL_STATES[name]) {
    return TOOL_STATES[name];
  }
  return name.startsWith('mcp__') ? 'browsing' : 'running';
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function clip(s: string, max = 40): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '...' : flat;
}

/** Short human label for a tool call, e.g. "Edit extension.ts". */
export function toolDetail(name: string, input: unknown): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const file = str(i['file_path']) || str(i['notebook_path']) || str(i['path']);
  if (file && name !== 'Grep' && name !== 'Glob') {
    return `${name} ${path.basename(file.replace(/\\/g, '/'))}`;
  }
  if (name === 'Grep' || name === 'Glob') {
    return `${name} ${clip(str(i['pattern']), 30)}`;
  }
  if (name === 'Agent' || name === 'Task') {
    return clip(str(i['description']) || 'sub-agent');
  }
  if (name === 'WebFetch') {
    try {
      return `Fetch ${new URL(str(i['url'])).host}`;
    } catch {
      return 'Fetch';
    }
  }
  if (name === 'WebSearch') {
    return `Search ${clip(str(i['query']), 30)}`;
  }
  const described = str(i['description']) || str(i['command']);
  if (described) {
    return clip(described);
  }
  return name.startsWith('mcp__') ? name.split('__').slice(1).join(' ') : name;
}

function set(act: AgentActivity, state: PetState, detail: string): void {
  act.state = state;
  act.detail = detail;
  act.seq++;
}

/** Applies one parsed transcript line to the activity. Unknown shapes are ignored. */
export function applyLine(act: AgentActivity, line: unknown): void {
  if (!line || typeof line !== 'object') {
    return;
  }
  const d = line as Record<string, unknown>;
  const ts = Date.parse(str(d['timestamp']));
  if (!Number.isNaN(ts)) {
    act.lastAt = Math.max(act.lastAt, ts);
  }
  if (str(d['cwd'])) {
    act.cwd = str(d['cwd']);
  }
  if (d['isMeta'] === true) {
    return;
  }

  const type = d['type'];
  if (type === 'system' && d['subtype'] === 'compact_boundary') {
    set(act, 'thinking', 'compacting memory');
    return;
  }
  if (type !== 'user' && type !== 'assistant') {
    return;
  }

  const msg = (d['message'] ?? {}) as Record<string, unknown>;
  const content = msg['content'];

  if (type === 'user') {
    if (typeof content === 'string') {
      // Slash-command plumbing and hook output arrive as tagged strings, not prompts.
      if (!content.startsWith('<')) {
        act.finished = false;
        act.pending.clear();
        set(act, 'thinking', '');
      }
      return;
    }
    if (!Array.isArray(content)) {
      return;
    }
    for (const block of content as Record<string, unknown>[]) {
      if (block?.['type'] === 'tool_result') {
        act.pending.delete(str(block['tool_use_id']));
        if (block['is_error'] === true) {
          set(act, 'error', 'a tool call failed');
        } else if (act.pending.size === 0) {
          set(act, 'thinking', '');
        }
      } else if (block?.['type'] === 'text') {
        if (str(block['text']).startsWith('[Request interrupted')) {
          act.pending.clear();
          act.finished = true;
          set(act, 'idle', 'interrupted');
        } else {
          act.finished = false;
          act.pending.clear();
          set(act, 'thinking', '');
        }
      }
    }
    return;
  }

  if (Array.isArray(content)) {
    for (const block of content as Record<string, unknown>[]) {
      if (block?.['type'] === 'thinking') {
        set(act, 'thinking', '');
      } else if (block?.['type'] === 'tool_use') {
        const name = str(block['name']);
        act.pending.set(str(block['id']), name);
        set(act, toolState(name), toolDetail(name, block['input']));
      } else if (block?.['type'] === 'text' && msg['stop_reason'] !== 'end_turn') {
        set(act, 'thinking', '');
      }
    }
  }
  if (msg['stop_reason'] === 'end_turn') {
    act.pending.clear();
    act.finished = true;
    set(act, 'done', 'all done!');
  }
}

/**
 * The state to show right now. Adds two time-based guesses on top of the
 * transcript: a stalled non-shell tool call means a permission prompt, and a
 * long silence means the turn was abandoned.
 */
export function currentState(
  act: AgentActivity,
  now: number,
): { state: PetState; detail: string; seq: number } {
  const silent = now - act.lastAt;
  if (act.pending.size > 0) {
    const names = [...act.pending.values()];
    const asking = names.find((n) => toolState(n) === 'waiting');
    if (asking) {
      return { state: 'waiting', detail: 'has a question for you', seq: act.seq };
    }
    if (silent > PERMISSION_GUESS_MS && names.some((n) => !LONG_RUNNING.has(n))) {
      return { state: 'waiting', detail: 'needs your OK?', seq: act.seq };
    }
  }
  if (silent > STALE_MS && act.state !== 'waiting') {
    return { state: 'idle', detail: '', seq: act.seq };
  }
  return { state: act.state, detail: act.detail, seq: act.seq };
}
