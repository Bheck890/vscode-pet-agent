import { STARTER_BAG, bagsUnlocked } from './bags';
import { Storage } from './storage';

const STORAGE_KEY = 'petBag';
const SPENT_KEY = 'petBagSpent';
const UNLOCKS_KEY = 'petUnlocks';
const ACTIVE_KEY = 'petActiveBag';
const COMPLETE_KEY = 'petComplete';

/**
 * How complete the collection is, as the view last worked it out: every
 * regular toy from the open bags ('items'), and every shop item too ('all').
 */
export type Completion = '' | 'items' | 'all';

export function parseCompletion(v: unknown): Completion {
  return v === 'items' || v === 'all' ? v : '';
}

/** A toy bag: toy id -> how many have been found. Anything malformed is dropped. */
export function parseBag(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return out;
  }
  for (const [id, n] of Object.entries(v)) {
    if (/^[a-z]+$/.test(id) && typeof n === 'number' && Number.isInteger(n) && n > 0) {
      out[id] = n;
    }
  }
  return out;
}

/**
 * Shop purchases, e.g. "idle.disco" or "food.fish" from the starter bag's
 * shop, and "garden.idle.watering" from another bag's. Anything malformed is dropped.
 */
export function parseUnlocks(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  const ids = v.filter(
    (id): id is string => typeof id === 'string' && /^([a-z]+\.)?[a-z]+\.[a-zA-Z]+$/.test(id),
  );
  return [...new Set(ids)];
}

/**
 * The toy bag, kept in VS Code's extension storage (globalState, under
 * %APPDATA%\Code\User\globalStorage on Windows) so it survives reloads and
 * reinstalls and every window shares it. Trading toys in at the shop is kept
 * as a separate spent count rather than lowering the found count, so both
 * only ever grow and saving merges with what is stored: a window holding an
 * older copy can't wipe finds, trades or purchases made in another window.
 */
export class BagStore {
  constructor(private readonly storage: Storage) {}

  get(): Record<string, number> {
    return parseBag(this.storage.get(STORAGE_KEY));
  }

  save(bag: unknown): Record<string, number> {
    return this.mergeCounts(STORAGE_KEY, bag);
  }

  getSpent(): Record<string, number> {
    return parseBag(this.storage.get(SPENT_KEY));
  }

  saveSpent(spent: unknown): Record<string, number> {
    return this.mergeCounts(SPENT_KEY, spent);
  }

  getUnlocks(): string[] {
    return parseUnlocks(this.storage.get(UNLOCKS_KEY));
  }

  saveUnlocks(unlocks: unknown): string[] {
    const merged = parseUnlocks([...this.getUnlocks(), ...parseUnlocks(unlocks)]);
    void this.storage.update(UNLOCKS_KEY, merged);
    return merged;
  }

  /** The bag new finds come from. Unknown or not yet unlocked falls back to the starter bag. */
  getActiveBag(level: number, levelsOn: boolean): string {
    const id = this.storage.get(ACTIVE_KEY);
    return typeof id === 'string' && bagsUnlocked(level, levelsOn).includes(id) ? id : STARTER_BAG;
  }

  /** Saves the active bag for every window; the caller checks it is unlocked. */
  setActiveBag(id: string): void {
    void this.storage.update(ACTIVE_KEY, id);
  }

  getCompletion(): Completion {
    return parseCompletion(this.storage.get(COMPLETE_KEY));
  }

  setCompletion(c: Completion): void {
    void this.storage.update(COMPLETE_KEY, c);
  }

  private mergeCounts(key: string, counts: unknown): Record<string, number> {
    const merged = parseBag(this.storage.get(key));
    for (const [id, n] of Object.entries(parseBag(counts))) {
      merged[id] = Math.max(merged[id] ?? 0, n);
    }
    void this.storage.update(key, merged);
    return merged;
  }
}
