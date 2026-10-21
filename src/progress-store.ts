import { Fact } from './progress';
import { Storage } from './storage';

const FACTS_KEY = 'petXp';
const BANK_KEY = 'petXpBanked';
const LIFETIME_KEY = 'petLifetime';
const FINISH_SEEN_KEY = 'petFinishSeen';

/** Running totals for the finish card; facts are folded away after a month or two. */
export interface Lifetime {
  prompts: number;
  actions: number;
  agentMs: number;
  records: number;
}

const LIFETIME_FIELDS: Array<keyof Lifetime> = ['prompts', 'actions', 'agentMs', 'records'];

export function parseLifetime(v: unknown): Lifetime {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const n = (k: keyof Lifetime) =>
    typeof o[k] === 'number' && Number.isFinite(o[k]) && (o[k] as number) > 0
      ? (o[k] as number)
      : 0;
  return {
    prompts: n('prompts'),
    actions: n('actions'),
    agentMs: n('agentMs'),
    records: n('records'),
  };
}

/** A stored fact map: key -> fact. Anything malformed is dropped. */
export function parseFacts(v: unknown): Record<string, Fact> {
  const out: Record<string, Fact> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return out;
  }
  for (const [key, f] of Object.entries(v)) {
    const o = f as Record<string, unknown>;
    if (
      o &&
      typeof o === 'object' &&
      typeof o['xp'] === 'number' &&
      Number.isFinite(o['xp']) &&
      o['xp'] >= 0 &&
      typeof o['kind'] === 'string' &&
      typeof o['at'] === 'number' &&
      Number.isFinite(o['at'])
    ) {
      out[key] = { xp: o['xp'], kind: o['kind'], at: o['at'] };
    }
  }
  return out;
}

/** Monthly XP totals: "2026-08" -> xp. Anything malformed is dropped. */
export function parseBank(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [month, xp] of Object.entries(v)) {
      if (/^\d{4}-\d{2}$/.test(month) && typeof xp === 'number' && Number.isFinite(xp) && xp > 0) {
        out[month] = xp;
      }
    }
  }
  return out;
}

function monthOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * XP facts in extension globalState, shared by every window. Adding merges
 * with what is stored and a key that exists already is ignored, so windows
 * can report the same thing without double counting. Facts older than last
 * month are folded into a per-month total; folding the same month again
 * keeps the larger total, so two windows tidying at once can't add it twice.
 * The finish fact is never folded: it says the save was finished, for good.
 */
export class ProgressStore {
  constructor(private readonly storage: Storage) {}

  facts(): Record<string, Fact> {
    return parseFacts(this.storage.get(FACTS_KEY));
  }

  has(key: string): boolean {
    return key in this.facts();
  }

  total(): number {
    const banked = Object.values(this.banked()).reduce((a, b) => a + b, 0);
    return banked + Object.values(this.facts()).reduce((a, f) => a + f.xp, 0);
  }

  banked(): Record<string, number> {
    return parseBank(this.storage.get(BANK_KEY));
  }

  /**
   * Fills an empty save with one brought from another computer. Merges like
   * every other write, so bringing a pet back here can only add to what it had.
   */
  restore(facts: Record<string, Fact>, banked: Record<string, number>, lifetime: Lifetime): void {
    void this.storage.update(FACTS_KEY, { ...parseFacts(facts), ...this.facts() });
    const bank = this.banked();
    for (const [month, xp] of Object.entries(parseBank(banked))) {
      bank[month] = Math.max(bank[month] ?? 0, xp);
    }
    void this.storage.update(BANK_KEY, bank);
    const had = this.lifetime();
    const sum = parseLifetime(lifetime);
    for (const k of LIFETIME_FIELDS) {
      sum[k] = Math.max(sum[k], had[k]);
    }
    void this.storage.update(LIFETIME_KEY, sum);
  }

  /** The finish screen has been shown for this save (it shows once, then from the 🏁 button). */
  finishSeen(): boolean {
    return this.storage.get(FINISH_SEEN_KEY) === true;
  }

  markFinishSeen(): void {
    void this.storage.update(FINISH_SEEN_KEY, true);
  }

  lifetime(): Lifetime {
    return parseLifetime(this.storage.get(LIFETIME_KEY));
  }

  /** Adds to the running totals. Callers only add for facts that were new, so nothing counts twice. */
  addLifetime(delta: Partial<Lifetime>): void {
    const sum = this.lifetime();
    for (const k of LIFETIME_FIELDS) {
      sum[k] += delta[k] ?? 0;
    }
    void this.storage.update(LIFETIME_KEY, sum);
  }

  /** Records a fact. False if that key was already there. */
  add(key: string, fact: Fact, now: Date): boolean {
    return this.addMany([[key, fact]], now).length > 0;
  }

  /** Records several facts in one write; returns the keys that were new. */
  addMany(entries: Array<[string, Fact]>, now: Date): string[] {
    const facts = this.facts();
    const added = entries.filter(([key]) => !(key in facts)).map(([key]) => key);
    if (added.length === 0) {
      return added;
    }
    for (const [key, fact] of entries) {
      facts[key] ??= fact;
    }
    // Keep this month and last; everything older becomes a monthly total.
    const keepFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const bank = parseBank(this.storage.get(BANK_KEY));
    const folded: Record<string, number> = {};
    for (const [k, f] of Object.entries(facts)) {
      if (f.at < keepFrom && f.kind !== 'finish') {
        folded[monthOf(f.at)] = (folded[monthOf(f.at)] ?? 0) + f.xp;
        delete facts[k];
      }
    }
    if (Object.keys(folded).length > 0) {
      for (const [month, xp] of Object.entries(folded)) {
        bank[month] = Math.max(bank[month] ?? 0, xp);
      }
      void this.storage.update(BANK_KEY, bank);
    }
    void this.storage.update(FACTS_KEY, facts);
    return added;
  }
}
