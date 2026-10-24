import type { CareStat, CareStats, CareStore } from './pet-care';
import { Storage } from './storage';

/**
 * Help for a pet that needs it. While any care stat is at 40 or below,
 * someone looks in every 40 minutes, and every 30 once all three are at
 * zero: a passer-by feeds it, a rain shower gives it a bath, or (very
 * rarely) a friend of its own kind drops in to play with a toy from its
 * bag. Each tops up a third of one stat. Looking after the pet yourself
 * pushes the next visit back to an hour away.
 */
export type VisitorKind = 'feed' | 'rain' | 'play';

export interface Visitor {
  kind: VisitorKind;
  /** When it happened (ms); the view picks the passer-by's look from it. */
  at: number;
  /** For `play`: the toy taken out of the bag. */
  toy?: string;
  /** The stat it raised, and how far. */
  stat: CareStat;
  amount: number;
}

/** A stat at or below this counts as low. */
export const LOW = 40;
/** How long after the last visit (or after the pet started needing help) the next comes. */
export const VISIT_EVERY_MS = { low: 40 * 60 * 1000, empty: 30 * 60 * 1000 };
/** How long after you looked after the pet the next visit comes, if it still needs one. */
export const AFTER_CARE_MS = 60 * 60 * 1000;
/** A third of a stat. */
export const VISITOR_BOOST = 100 / 3;
/** How often a visit is a friend of the pet's own kind coming to play, rather than food or rain. */
export const PLAY_CHANCE = 0.04;

const STAT: Record<VisitorKind, CareStat> = { feed: 'fullness', rain: 'clean', play: 'fun' };
const STATS: CareStat[] = ['fullness', 'fun', 'clean'];
const WAIT_KEY = 'petVisitorWait';
/** Decay stops at 0 but stats are fractional, so below this is zero. */
const EMPTY = 1;

/** Since when the next visit is being waited for, and whether you looked after the pet then. */
interface Wait {
  since: number;
  cared: boolean;
}

function parseWait(v: unknown): Wait | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return typeof o['since'] === 'number' && Number.isFinite(o['since'])
    ? { since: o['since'], cared: o['cared'] === true }
    : null;
}

/**
 * What turns up: very rarely a playmate (if there are toys); otherwise food
 * or rain, whichever helps a low stat (either, if both or neither are low).
 */
export function pickVisitor(
  rand: () => number,
  toys: string[],
  stats: Pick<CareStats, CareStat>,
): { kind: VisitorKind; toy?: string } {
  if (toys.length > 0 && rand() < PLAY_CHANCE) {
    return { kind: 'play', toy: toys[Math.floor(rand() * toys.length)] };
  }
  const helps = (['feed', 'rain'] as const).filter((k) => stats[STAT[k]] <= LOW);
  const pool = helps.length > 0 ? helps : (['feed', 'rain'] as const);
  return { kind: pool[Math.floor(rand() * pool.length)] };
}

/**
 * Keeps the wait for the next visit with the save, so every window agrees
 * on it; whichever window ticks past it first makes the visit and starts
 * the next wait. A pet with nothing low has no wait at all.
 */
export class Visitors {
  constructor(
    private readonly storage: Storage,
    private readonly care: CareStore,
    private readonly toys: () => string[],
    private readonly rand: () => number = Math.random,
  ) {}

  private wait(since: number, cared: boolean): void {
    void this.storage.update(WAIT_KEY, { since, cared });
  }

  /** You looked after the pet: if it still needs help, the next visit is an hour away. */
  cared(now: number): void {
    this.wait(now, true);
  }

  /** Call every so often. Returns the visit if one was due (its stat already raised), else null. */
  tick(now: number): Visitor | null {
    const stats = this.care.get(now);
    const low = STATS.some((s) => stats[s] <= LOW);
    const empty = STATS.every((s) => stats[s] < EMPTY);
    const wait = parseWait(this.storage.get(WAIT_KEY));
    if (!low) {
      if (wait) {
        void this.storage.update(WAIT_KEY, undefined);
      }
      return null;
    }
    if (!wait) {
      this.wait(now, false);
      return null;
    }
    const gap = wait.cared ? AFTER_CARE_MS : empty ? VISIT_EVERY_MS.empty : VISIT_EVERY_MS.low;
    if (now < wait.since + gap) {
      return null;
    }
    this.wait(now, false);
    const { kind, toy } = pickVisitor(this.rand, this.toys(), stats);
    const stat = STAT[kind];
    this.care.boost(stat, VISITOR_BOOST, now);
    return { kind, at: now, stat, amount: Math.round(VISITOR_BOOST), ...(toy ? { toy } : {}) };
  }
}
