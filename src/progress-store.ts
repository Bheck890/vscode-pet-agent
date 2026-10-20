import { Fact } from './progress';
import { Storage } from './storage';

const FACTS_KEY = 'petXp';
const BANK_KEY = 'petXpBanked';

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

function parseBank(v: unknown): Record<string, number> {
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
    const banked = Object.values(parseBank(this.storage.get(BANK_KEY))).reduce((a, b) => a + b, 0);
    return banked + Object.values(this.facts()).reduce((a, f) => a + f.xp, 0);
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
      if (f.at < keepFrom) {
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
