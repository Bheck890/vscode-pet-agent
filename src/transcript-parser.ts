import * as path from 'path';

/** Everything a pet can be doing. `media/states.js` has a look for each (a test checks). */
export const PET_STATES = [
  'sleeping',
  'idle',
  'waking',
  'thinking',
  'reading',
  'writing',
  'running',
  'testing',
  'browsing',
  'delegating',
  'waiting',
  'error',
  'done',
] as const;
export type PetState = (typeof PET_STATES)[number];

export type JobKind = 'test' | 'build' | 'server' | 'job';

/** A test run, build or background shell. The webview draws a machine for each one. */
export interface Job {
  id: string;
  kind: JobKind;
  label: string;
  background: boolean;
}

/** Live activity of one agent (main session or sub-agent), built from its transcript. */
export interface AgentActivity {
  state: PetState;
  detail: string;
  /** Bumped on every state assignment so repeated states (e.g. two `done`s) still animate. */
  seq: number;
  /** Timestamp (ms) of the newest transcript line seen. */
  lastAt: number;
  /**
   * Transcript timestamp of the line that last changed `state`. Every window
   * reading the transcript agrees on it, so it seeds the animation pick.
   */
  stateAt: number;
  cwd: string | null;
  /** Tool calls that have no result yet, keyed by tool_use id. */
  pending: Map<string, string>;
  /** True once the agent's turn ended (`stop_reason: end_turn`). */
  finished: boolean;
  /** Running tests, builds and background shells, keyed by tool_use id. */
  jobs: Map<string, Job>;
  /** The action that just finished, shown instead of 'thinking' until `until`. */
  linger: { state: PetState; detail: string; until: number } | null;
  /** How many tool calls in a row had the same state. */
  streak: { state: PetState; count: number };
}

/** A pending non-shell tool call this old is most likely sitting on a permission prompt. */
export const PERMISSION_GUESS_MS = 5000;
/** A turn with no new lines for this long was probably abandoned. */
export const STALE_MS = 2 * 60 * 1000;
/**
 * The gap between two tool calls is usually a few seconds of thinking. Holding
 * a single action through it avoids a flicker. Once the same action has
 * happened twice in a row it is held until something different happens.
 */
export const LINGER_MS = 8000;
const STREAK = 2;

const LINGERING = new Set<PetState>([
  'reading',
  'writing',
  'running',
  'testing',
  'browsing',
  'delegating',
]);

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

const SHELLS = new Set(['Bash', 'PowerShell']);

const TEST_RE =
  /\b(?:(?:npm|pnpm|yarn|bun)(?:\s+run)?|go|cargo|flutter|dart|dotnet|mvn|gradlew?|mix|deno|swift|make)\s+test\b|\b(?:jest|vitest|pytest|mocha|karma|playwright|cypress|rspec|phpunit|ctest|tox|unittest)\b/i;
const BUILD_RE =
  /\b(?:(?:npm|pnpm|yarn|bun)(?:\s+run)?\s+(?:build|compile|package)|(?:cargo|go|flutter|dotnet|vite|next)\s+build|gradlew?\s+(?:build|assemble)|mvn\s+(?:package|install|compile)|webpack|tsc|make|msbuild)\b/i;
const SERVER_RE =
  /\b(?:(?:npm|pnpm|yarn|bun)(?:\s+run)?\s+(?:dev|start|serve|watch)|serve|http-server|vite|uvicorn|watch)\b/i;

/** What sort of machine a shell command deserves. */
export function jobKind(command: string): JobKind {
  if (TEST_RE.test(command)) {
    return 'test';
  }
  if (BUILD_RE.test(command)) {
    return 'build';
  }
  return SERVER_RE.test(command) ? 'server' : 'job';
}

export function createActivity(): AgentActivity {
  return {
    state: 'idle',
    detail: '',
    seq: 0,
    lastAt: 0,
    stateAt: 0,
    cwd: null,
    pending: new Map(),
    finished: false,
    jobs: new Map(),
    linger: null,
    streak: { state: 'idle', count: 0 },
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
  if (state !== act.state) {
    act.stateAt = act.lastAt;
  }
  act.state = state;
  act.detail = detail;
  act.seq++;
}

/** Foreground jobs end with their turn; background ones run until their notification. */
function clearForeground(act: AgentActivity): void {
  act.pending.clear();
  for (const [id, job] of act.jobs) {
    if (!job.background) {
      act.jobs.delete(id);
    }
  }
}

/** Something other than the held action happened, so stop holding it. */
function breakStreak(act: AgentActivity): void {
  act.linger = null;
  act.streak = { state: 'idle', count: 0 };
}

function newTurn(act: AgentActivity): void {
  act.finished = false;
  breakStreak(act);
  clearForeground(act);
  set(act, 'thinking', '');
}

/** `<task-notification>` text names the tool_use id of the background job it ends. */
function endJobs(act: AgentActivity, text: string): void {
  if (/<status>running<\/status>/.test(text)) {
    return;
  }
  for (const m of text.matchAll(/<tool-use-id>([^<]+)<\/tool-use-id>/g)) {
    act.jobs.delete(m[1]);
  }
}

function startTool(act: AgentActivity, block: Record<string, unknown>): void {
  const name = str(block['name']);
  const id = str(block['id']);
  const input = (block['input'] ?? {}) as Record<string, unknown>;
  act.pending.set(id, name);
  let state = toolState(name);
  if (SHELLS.has(name)) {
    const kind = jobKind(str(input['command']));
    const background = input['run_in_background'] === true;
    if (kind === 'test') {
      state = 'testing';
    }
    if (background || kind === 'test' || kind === 'build') {
      act.jobs.set(id, { id, kind, label: toolDetail(name, input), background });
    }
  }
  const same = act.streak.state === state;
  act.streak = { state, count: same ? act.streak.count + 1 : 1 };
  set(act, state, toolDetail(name, input));
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
  // Background jobs finishing are enqueued here first, then replayed as a user message.
  if (type === 'queue-operation') {
    endJobs(act, str(d['content']));
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
      if (content.startsWith('<task-notification>')) {
        endJobs(act, content);
      } else if (!content.startsWith('<')) {
        newTurn(act);
      }
      return;
    }
    if (!Array.isArray(content)) {
      return;
    }
    for (const block of content as Record<string, unknown>[]) {
      if (block?.['type'] === 'tool_result') {
        const id = str(block['tool_use_id']);
        act.pending.delete(id);
        if (!act.jobs.get(id)?.background) {
          act.jobs.delete(id);
        }
        if (block['is_error'] === true) {
          breakStreak(act);
          set(act, 'error', 'a tool call failed');
        } else if (act.pending.size === 0) {
          if (LINGERING.has(act.state)) {
            const from = Number.isNaN(ts) ? act.lastAt : ts;
            const until = act.streak.count >= STREAK ? Infinity : from + LINGER_MS;
            act.linger = { state: act.state, detail: act.detail, until };
          }
          set(act, 'thinking', '');
        }
      } else if (block?.['type'] === 'text') {
        if (str(block['text']).startsWith('[Request interrupted')) {
          clearForeground(act);
          breakStreak(act);
          act.finished = true;
          set(act, 'idle', 'interrupted');
        } else {
          newTurn(act);
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
        startTool(act, block);
      } else if (block?.['type'] === 'text' && msg['stop_reason'] !== 'end_turn') {
        set(act, 'thinking', '');
      }
    }
  }
  if (msg['stop_reason'] === 'end_turn') {
    clearForeground(act);
    breakStreak(act);
    act.finished = true;
    set(act, 'done', 'all done!');
  }
}

/**
 * The state to show right now. Adds time-based guesses on top of the
 * transcript: a stalled non-shell tool call means a permission prompt, a long
 * silence means the turn was abandoned, and thinking between tool calls keeps
 * showing the last action (see LINGER_MS).
 */
export function currentState(
  act: AgentActivity,
  now: number,
): { state: PetState; detail: string; seq: number; since: number; jobs: Job[] } {
  const jobs = [...act.jobs.values()];
  const silent = now - act.lastAt;
  if (act.pending.size > 0) {
    const names = [...act.pending.values()];
    const asking = names.find((n) => toolState(n) === 'waiting');
    if (asking) {
      return {
        state: 'waiting',
        detail: 'has a question for you',
        seq: act.seq,
        since: act.stateAt,
        jobs,
      };
    }
    if (silent > PERMISSION_GUESS_MS && names.some((n) => !LONG_RUNNING.has(n))) {
      return { state: 'waiting', detail: 'needs your OK?', seq: act.seq, since: act.stateAt, jobs };
    }
  }
  if (silent > STALE_MS && act.state !== 'waiting') {
    return { state: 'idle', detail: '', seq: act.seq, since: act.stateAt, jobs };
  }
  if (act.state === 'thinking' && act.linger && now < act.linger.until) {
    return {
      state: act.linger.state,
      detail: act.linger.detail,
      seq: act.seq,
      since: act.stateAt,
      jobs,
    };
  }
  return { state: act.state, detail: act.detail, seq: act.seq, since: act.stateAt, jobs };
}
