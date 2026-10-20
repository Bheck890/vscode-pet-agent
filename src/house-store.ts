import { Storage } from './storage';

/** A piece of furniture in the house, at fractions of the room's width and height. */
export interface HouseItem {
  id: string;
  x: number;
  y: number;
  /** When it was last moved, placed or taken out (ms); newest wins across windows. */
  at: number;
  /** Taken out of the room. Kept so an older window can't put it back. */
  removed?: boolean;
}

export interface HouseLayout {
  items: HouseItem[];
  theme: string;
  themeAt: number;
}

const STORAGE_KEY = 'petHouse';
const ID = /^[a-z]+$/;

const fraction = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** A stored or sent layout. Bad items are dropped; a bad theme is the default room. */
export function parseLayout(v: unknown): HouseLayout {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const items: HouseItem[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(o['items']) ? o['items'] : []) {
    const i = raw as Record<string, unknown>;
    if (
      i &&
      typeof i['id'] === 'string' &&
      ID.test(i['id']) &&
      !seen.has(i['id']) &&
      fraction(i['x']) &&
      fraction(i['y']) &&
      typeof i['at'] === 'number' &&
      Number.isFinite(i['at'])
    ) {
      seen.add(i['id']);
      items.push({
        id: i['id'],
        x: i['x'] as number,
        y: i['y'] as number,
        at: i['at'],
        ...(i['removed'] === true ? { removed: true } : {}),
      });
    }
  }
  const theme = typeof o['theme'] === 'string' && ID.test(o['theme']) ? o['theme'] : 'cozy';
  const themeAt =
    typeof o['themeAt'] === 'number' && Number.isFinite(o['themeAt']) ? o['themeAt'] : 0;
  return { items, theme, themeAt };
}

/** Item by item and the theme, whichever was changed last wins. */
export function mergeLayouts(a: HouseLayout, b: HouseLayout): HouseLayout {
  const byId = new Map<string, HouseItem>();
  for (const item of [...a.items, ...b.items]) {
    const had = byId.get(item.id);
    if (!had || item.at > had.at) {
      byId.set(item.id, item);
    }
  }
  const theme = b.themeAt > a.themeAt ? b : a;
  return { items: [...byId.values()], theme: theme.theme, themeAt: theme.themeAt };
}

/** The pet's house, in extension globalState so every window shows the same room. */
export class HouseStore {
  constructor(private readonly storage: Storage) {}

  get(): HouseLayout {
    return parseLayout(this.storage.get(STORAGE_KEY));
  }

  save(layout: unknown): HouseLayout {
    const merged = mergeLayouts(this.get(), parseLayout(layout));
    void this.storage.update(STORAGE_KEY, merged);
    return merged;
  }
}
