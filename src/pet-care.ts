import { Storage } from './storage';

export type CareStat = 'fullness' | 'fun' | 'clean';
/** One rewarded moment of hands-on care: a kibble eaten, a fetch returned, a scrub stroke... */
export type CareAction = 'kibble' | 'treat' | 'fetch' | 'scrub' | 'pet';

export interface CareStats {
  fullness: number;
  fun: number;
  clean: number;
  updatedAt: number;
}

export interface CareResult {
  stats: CareStats;
  action: CareAction;
  ok: boolean;
  /** Why the pet refused, e.g. "isn't hungry right now". */
  reason?: string;
}

const STATS: CareStat[] = ['fullness', 'fun', 'clean'];
export const CARE_ACTIONS: CareAction[] = ['kibble', 'treat', 'fetch', 'scrub', 'pet'];

/** Points lost per hour. Full to empty takes roughly 14h / 10h / 25h. */
export const DECAY_PER_HOUR: Record<CareStat, number> = { fullness: 7, fun: 10, clean: 4 };

export const EFFECTS: Record<CareAction, Partial<Record<CareStat, number>>> = {
  kibble: { fullness: 10 },
  treat: { fullness: 6, fun: 12 },
  fetch: { fun: 12, fullness: -2, clean: -3 },
  scrub: { clean: 20 },
  pet: { fun: 4 },
};

const STORAGE_KEY = 'petCare';

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function freshStats(now: number): CareStats {
  return { fullness: 80, fun: 80, clean: 80, updatedAt: now };
}

/** Validates stored stats; anything malformed starts the pet fresh. */
export function parseStats(v: unknown, now: number): CareStats {
  if (!v || typeof v !== 'object') {
    return freshStats(now);
  }
  const o = v as Record<string, unknown>;
  const ok = [...STATS, 'updatedAt'].every(
    (k) => typeof o[k] === 'number' && Number.isFinite(o[k]),
  );
  if (!ok) {
    return freshStats(now);
  }
  return {
    fullness: clamp(o['fullness'] as number),
    fun: clamp(o['fun'] as number),
    clean: clamp(o['clean'] as number),
    updatedAt: Math.min(o['updatedAt'] as number, now),
  };
}

/** Applies time-based decay since `updatedAt`. */
export function decay(s: CareStats, now: number): CareStats {
  const hours = Math.max(0, now - s.updatedAt) / 3_600_000;
  return {
    fullness: clamp(s.fullness - DECAY_PER_HOUR.fullness * hours),
    fun: clamp(s.fun - DECAY_PER_HOUR.fun * hours),
    clean: clamp(s.clean - DECAY_PER_HOUR.clean * hours),
    updatedAt: now,
  };
}

function refusal(s: CareStats, action: CareAction): string | undefined {
  switch (action) {
    case 'kibble':
      return s.fullness >= 95 ? "isn't hungry right now" : undefined;
    case 'treat':
      return s.fullness >= 98 ? 'is too full for treats' : undefined;
    case 'fetch':
      return s.fullness < 10 ? 'is too hungry to play' : undefined;
    case 'scrub':
      return s.clean >= 100 ? 'is already squeaky clean' : undefined;
    default:
      return undefined;
  }
}

export function applyCare(s: CareStats, action: CareAction, now: number): CareResult {
  const current = decay(s, now);
  const reason = refusal(current, action);
  if (reason) {
    return { stats: current, action, ok: false, reason };
  }
  const next = { ...current };
  for (const [stat, delta] of Object.entries(EFFECTS[action]) as [CareStat, number][]) {
    next[stat] = clamp(next[stat] + delta);
  }
  return { stats: next, action, ok: true };
}

export function isCareAction(v: unknown): v is CareAction {
  return typeof v === 'string' && (CARE_ACTIONS as string[]).includes(v);
}

/** Persists care stats in extension global state so they survive restarts. */
export class CareStore {
  constructor(private readonly storage: Storage) {}

  get(now = Date.now()): CareStats {
    return decay(parseStats(this.storage.get(STORAGE_KEY), now), now);
  }

  /** Puts back stats brought from another computer. */
  restore(stats: CareStats): void {
    void this.storage.update(STORAGE_KEY, stats);
  }

  act(action: CareAction, now = Date.now()): CareResult {
    const result = applyCare(this.get(now), action, now);
    if (result.ok) {
      void this.storage.update(STORAGE_KEY, result.stats);
    }
    return result;
  }
}
