/**
 * Levels and weekly challenges. XP is never a running counter: it is the sum
 * of stored facts, each under a key that is the same in every window (a
 * prompt id, a tool_use id...), so recording a fact twice changes nothing.
 * Challenge progress is counted from this week's facts, never stored.
 */

/** Something that earned XP. `kind` is e.g. 'turn', 'test', 'care:scrub'. */
export interface Fact {
  xp: number;
  kind: string;
  at: number;
}

export const XP = {
  turnBase: 10,
  turnPerAction: 1,
  turnCap: 40,
  test: 15,
  build: 10,
  /** A passing run after failures: the bugs get squashed. */
  squash: 20,
  agent: 5,
  record: 50,
  care: 2,
  /** Care facts that earn XP per day. */
  carePerDay: 10,
  challenge: 100,
};

/** Away this long, and the next few prompts earn double. */
export const CATCH_UP_GAP_MS = 7 * 24 * 60 * 60 * 1000;
export const CATCH_UP_TURNS = 3;

/** Total XP needed to reach `level` (level 1 needs none): 0, 100, 300, 600, 1000... */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export interface LevelInfo {
  level: number;
  xp: number;
  /** XP where this level started and where the next begins. */
  floor: number;
  next: number;
}

export function levelOf(xp: number): LevelInfo {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) {
    level++;
  }
  return { level, xp, floor: xpForLevel(level), next: xpForLevel(level + 1) };
}

/** XP for a finished prompt, doubled when it is one of the first few after a long break. */
export function turnXp(actions: number, catchUp: boolean): number {
  const base = Math.min(XP.turnCap, XP.turnBase + XP.turnPerAction * actions);
  return catchUp ? base * 2 : base;
}

/**
 * True if a prompt finished at `at` is one of the first few after a gap of a
 * week or more, given when the other prompts finished.
 */
export function isCatchUp(at: number, earlierTurns: number[]): boolean {
  const times = [...earlierTurns.filter((t) => t < at), at].sort((a, b) => a - b);
  const i = times.length - 1;
  let j = i;
  while (j > 0 && times[j] - times[j - 1] < CATCH_UP_GAP_MS) {
    j--;
  }
  // j is the first prompt after the latest gap; no gap at all (j = 0) is just a new pet.
  return j > 0 && i - j < CATCH_UP_TURNS;
}

export interface Challenge {
  id: string;
  emoji: string;
  text: string;
  /** Facts whose kind starts with this count towards it. */
  kind: string;
  target: number;
  /** Count distinct local days instead of facts. */
  days?: boolean;
}

export const CHALLENGES: Challenge[] = [
  { id: 'tests', emoji: '🧪', text: 'Pass 5 test runs', kind: 'test', target: 5 },
  { id: 'builds', emoji: '🏗️', text: 'Pass 3 builds', kind: 'build', target: 3 },
  { id: 'helpers', emoji: '🐣', text: 'Have 3 helpers finish', kind: 'agent', target: 3 },
  { id: 'record', emoji: '🏆', text: 'Set a weekly prompt record', kind: 'record', target: 1 },
  { id: 'baths', emoji: '🛁', text: 'Scrub your pet 3 times', kind: 'care:scrub', target: 3 },
  { id: 'feed', emoji: '🍖', text: 'Feed your pet 5 times', kind: 'care:kibble', target: 5 },
  { id: 'fetch', emoji: '🎾', text: 'Play fetch 5 times', kind: 'care:fetch', target: 5 },
  { id: 'prompts', emoji: '💬', text: 'Finish 20 prompts', kind: 'turn', target: 20 },
  {
    id: 'days',
    emoji: '📅',
    text: 'Ship on 4 different days',
    kind: 'turn',
    target: 4,
    days: true,
  },
  { id: 'squash', emoji: '🐛', text: 'Squash 3 bugs', kind: 'squash', target: 3 },
];

/** A small string hash, so every window picks the same challenges for a week. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** This week's three challenges, picked from the week id. */
export function weeklyChallenges(week: string): Challenge[] {
  const pool = [...CHALLENGES];
  const picked: Challenge[] = [];
  let h = hash(week);
  while (picked.length < 3) {
    picked.push(pool.splice(h % pool.length, 1)[0]);
    h = hash(String(h));
  }
  return picked;
}

function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** How far a challenge has got from facts since `from` (capped at its target). */
export function challengeProgress(c: Challenge, facts: Fact[], from: number): number {
  const mine = facts.filter((f) => f.at >= from && f.kind.startsWith(c.kind));
  const n = c.days ? new Set(mine.map((f) => localDay(f.at))).size : mine.length;
  return Math.min(c.target, n);
}
