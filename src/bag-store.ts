import { CareStorage } from './pet-care';

const STORAGE_KEY = 'petBag';

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
 * The toy bag, kept in VS Code's extension storage (globalState, under
 * %APPDATA%\Code\User\globalStorage on Windows) so it survives reloads and
 * reinstalls and every window shares it. Counts only ever grow, so saving
 * merges with what is stored: a window holding an older copy can't wipe
 * finds made in another window.
 */
export class BagStore {
  constructor(private readonly storage: CareStorage) {}

  get(): Record<string, number> {
    return parseBag(this.storage.get(STORAGE_KEY));
  }

  save(bag: unknown): Record<string, number> {
    const merged = this.get();
    for (const [id, n] of Object.entries(parseBag(bag))) {
      merged[id] = Math.max(merged[id] ?? 0, n);
    }
    void this.storage.update(STORAGE_KEY, merged);
    return merged;
  }
}
