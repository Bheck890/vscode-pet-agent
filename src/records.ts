import type { TurnRecord } from './turn-tracker';

/**
 * The weekly prompt records. Each category scores a finished turn (higher
 * wins; ties go to the earlier turn) and says how to show the winner.
 */
export interface RecordCategory {
  id: string;
  emoji: string;
  title: string;
  score(t: TurnRecord): number;
  eligible(t: TurnRecord): boolean;
  /** The winning numbers, e.g. "4 words -> 12m 30s". */
  describe(t: TurnRecord): string;
}

/** Turns shorter than this are too quick to count (a typo, an instant answer). */
export const MIN_TURN_MS = 3000;

const secs = (t: TurnRecord) => Math.max(1, (t.endedAt - t.startedAt) / 1000);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) {
    return `${s}s`;
  }
  const m = Math.floor(s / 60);
  if (m < 60) {
    return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  }
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const took = (t: TurnRecord) => formatDuration(t.endedAt - t.startedAt);

export const CATEGORIES: RecordCategory[] = [
  {
    id: 'tinyEpic',
    emoji: '🪄',
    title: 'Tiny prompt, epic run',
    score: (t) => secs(t) / Math.max(1, t.words),
    eligible: (t) => t.words > 0,
    describe: (t) => `${plural(t.words, 'word')} -> ${took(t)}`,
  },
  {
    id: 'essay',
    emoji: '📜',
    title: 'Essay for a one-liner',
    score: (t) => t.words / secs(t),
    eligible: (t) => t.words >= 20,
    describe: (t) => `${plural(t.words, 'word')} -> ${took(t)}`,
  },
  {
    id: 'busiest',
    emoji: '⚙️',
    title: 'Busiest prompt',
    score: (t) => t.actions,
    eligible: (t) => t.actions > 0,
    describe: (t) => `${plural(t.actions, 'action')} in ${took(t)}`,
  },
  {
    id: 'sniper',
    emoji: '🎯',
    title: 'Sniper',
    score: (t) => -t.actions,
    eligible: (t) => t.actions > 0,
    describe: (t) => `done in ${plural(t.actions, 'action')}`,
  },
  {
    id: 'litter',
    emoji: '🐣',
    title: 'Biggest litter',
    score: (t) => t.subagents,
    eligible: (t) => t.subagents > 0,
    describe: (t) => plural(t.subagents, 'helper'),
  },
  {
    id: 'marathon',
    emoji: '⏱️',
    title: 'Marathon',
    score: (t) => t.endedAt - t.startedAt,
    eligible: () => true,
    describe: (t) => `${took(t)}, ${plural(t.actions, 'action')}`,
  },
];

/** Only finished turns of a few seconds or more can hold a record. */
export function counts(t: TurnRecord): boolean {
  return t.outcome === 'done' && t.endedAt - t.startedAt >= MIN_TURN_MS;
}

/** True if `a` beats `b` in a category. */
export function beats(
  cat: RecordCategory,
  a: TurnRecord,
  b: TurnRecord | null | undefined,
): boolean {
  if (!b) {
    return true;
  }
  const sa = cat.score(a);
  const sb = cat.score(b);
  return sa > sb || (sa === sb && a.endedAt < b.endedAt);
}

/** The best turn per category among `turns`, or null where none qualifies. */
export function bestOf(turns: TurnRecord[]): Record<string, TurnRecord | null> {
  const out: Record<string, TurnRecord | null> = {};
  for (const cat of CATEGORIES) {
    let best: TurnRecord | null = null;
    for (const t of turns) {
      if (counts(t) && cat.eligible(t) && beats(cat, t, best)) {
        best = t;
      }
    }
    out[cat.id] = best;
  }
  return out;
}

export interface WeekTotals {
  prompts: number;
  actions: number;
  subagents: number;
  agentMs: number;
}

export function totals(turns: TurnRecord[]): WeekTotals {
  return turns.reduce(
    (sum, t) => ({
      prompts: sum.prompts + 1,
      actions: sum.actions + t.actions,
      subagents: sum.subagents + t.subagents,
      agentMs: sum.agentMs + (t.endedAt - t.startedAt),
    }),
    { prompts: 0, actions: 0, subagents: 0, agentMs: 0 },
  );
}
