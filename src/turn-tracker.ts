import * as path from 'path';
import { promptText } from './transcript-parser';

/** One prompt from start to finish, as kept for the records board and XP. */
export interface TurnRecord {
  /** The prompt's id in the transcript; the same in every window, so it dedupes. */
  promptId: string;
  sessionId: string;
  /** Folder name the session ran in. */
  project: string | null;
  startedAt: number;
  endedAt: number;
  words: number;
  chars: number;
  /** Tool calls the main agent made (sub-agents' own calls are theirs). */
  actions: number;
  /** Sub-agents it started. */
  subagents: number;
  outputTokens: number;
  outcome: 'done' | 'interrupted';
  /** The start of the prompt. Stays on this machine; shown only if the user asks. */
  preview: string;
}

interface OpenTurn {
  promptId: string;
  project: string | null;
  startedAt: number;
  words: number;
  chars: number;
  preview: string;
  actions: number;
  subagents: number;
  /** Assistant messages are split over several lines that repeat the usage; one count per id. */
  tokens: Map<string, number>;
}

export interface TurnTracker {
  sessionId: string;
  open: OpenTurn | null;
}

const PREVIEW_CHARS = 80;
const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);

export function createTurnTracker(sessionId: string): TurnTracker {
  return { sessionId, open: null };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function close(t: TurnTracker, endedAt: number, outcome: TurnRecord['outcome']): TurnRecord {
  const o = t.open!;
  t.open = null;
  return {
    promptId: o.promptId,
    sessionId: t.sessionId,
    project: o.project,
    startedAt: o.startedAt,
    endedAt: Math.max(endedAt, o.startedAt),
    words: o.words,
    chars: o.chars,
    actions: o.actions,
    subagents: o.subagents,
    outputTokens: [...o.tokens.values()].reduce((a, b) => a + b, 0),
    outcome,
    preview: o.preview,
  };
}

/**
 * Feeds one transcript line of a main session. Returns the finished turn when
 * this line ends one. A turn seen without its prompt (the transcript was
 * picked up mid-turn) is never reported.
 */
export function applyTurnLine(t: TurnTracker, line: unknown): TurnRecord | null {
  if (!line || typeof line !== 'object') {
    return null;
  }
  const d = line as Record<string, unknown>;
  if (d['isMeta'] === true) {
    return null;
  }
  const ts = Date.parse(str(d['timestamp']));
  const msg = (d['message'] ?? {}) as Record<string, unknown>;
  const content = msg['content'];

  if (d['type'] === 'user') {
    if (
      Array.isArray(content) &&
      content.some(
        (b) => str(b?.['text']).startsWith('[Request interrupted') && b?.['type'] === 'text',
      )
    ) {
      return t.open && !Number.isNaN(ts) ? close(t, ts, 'interrupted') : null;
    }
    const text = promptText(content);
    const id = str(d['promptId']) || str(d['uuid']);
    if (text === null || !id || Number.isNaN(ts)) {
      return null;
    }
    const flat = text.replace(/\s+/g, ' ').trim();
    const cwd = str(d['cwd']);
    // Replaces any turn still open: a prompt sent mid-turn means that one never finished.
    t.open = {
      promptId: id,
      project: cwd ? path.basename(cwd.replace(/\\/g, '/')) : null,
      startedAt: ts,
      words: flat ? flat.split(' ').length : 0,
      chars: flat.length,
      preview: flat.length > PREVIEW_CHARS ? flat.slice(0, PREVIEW_CHARS - 3) + '...' : flat,
      actions: 0,
      subagents: 0,
      tokens: new Map(),
    };
    return null;
  }

  if (d['type'] !== 'assistant' || !t.open) {
    return null;
  }
  if (Array.isArray(content)) {
    for (const block of content as Record<string, unknown>[]) {
      if (block?.['type'] === 'tool_use') {
        t.open.actions++;
        if (SUBAGENT_TOOLS.has(str(block['name']))) {
          t.open.subagents++;
        }
      }
    }
  }
  const usage = (msg['usage'] ?? {}) as Record<string, unknown>;
  const out = usage['output_tokens'];
  if (typeof out === 'number' && Number.isFinite(out)) {
    const key = str(msg['id']) || str(d['requestId']) || str(d['uuid']);
    t.open.tokens.set(key, Math.max(t.open.tokens.get(key) ?? 0, out));
  }
  if (msg['stop_reason'] === 'end_turn' && !Number.isNaN(ts)) {
    return close(t, ts, 'done');
  }
  return null;
}
