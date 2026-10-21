import { STARTER_BAG, isRoom } from './bags';
import { Storage } from './storage';

/** A piece of furniture in a room, at fractions of the room's width and height. */
export interface HouseItem {
  id: string;
  x: number;
  y: number;
  /** When it was last moved, placed or taken out (ms); newest wins across windows. */
  at: number;
  /** Taken out of the room. Kept so an older window can't put it back. */
  removed?: boolean;
}

export interface RoomLayout {
  items: HouseItem[];
  theme: string;
  themeAt: number;
}

export interface HouseLayout {
  /** Where you were last: shared by every window, newest wins. */
  at: { house: string; room: string; changedAt: number };
  /** house id -> room id -> that room's layout. */
  houses: Record<string, Record<string, RoomLayout>>;
}

const STORAGE_KEY = 'petHouse';
const ID = /^[a-z]+$/;
/** The room every layout from before there were several houses becomes. */
const FIRST_ROOM = { house: STARTER_BAG, room: 'living' };

const fraction = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const record = (v: unknown) =>
  (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;

/** One room. Bad items are dropped; a bad theme is the house's default. */
export function parseRoom(v: unknown): RoomLayout {
  const o = record(v);
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
  return { items, theme, themeAt: time(o['themeAt']) };
}

export function emptyLayout(): HouseLayout {
  return { at: { ...FIRST_ROOM, changedAt: 0 }, houses: {} };
}

/**
 * A stored or sent layout. Unknown houses and rooms are dropped. The old
 * one-room shape (`{ items, theme, themeAt }`) becomes the starter house's
 * living room, unchanged.
 */
export function parseLayout(v: unknown): HouseLayout {
  const o = record(v);
  if (!('houses' in o) && Array.isArray(o['items'])) {
    return { at: { ...FIRST_ROOM, changedAt: 0 }, houses: { starter: { living: parseRoom(o) } } };
  }
  const houses: HouseLayout['houses'] = {};
  for (const [house, rooms] of Object.entries(record(o['houses']))) {
    for (const [room, layout] of Object.entries(record(rooms))) {
      if (isRoom(house, room)) {
        (houses[house] ??= {})[room] = parseRoom(layout);
      }
    }
  }
  const at = record(o['at']);
  const where =
    typeof at['house'] === 'string' &&
    typeof at['room'] === 'string' &&
    isRoom(at['house'], at['room'])
      ? { house: at['house'], room: at['room'] }
      : FIRST_ROOM;
  return { at: { ...where, changedAt: time(at['changedAt']) }, houses };
}

/** Item by item and the theme, whichever was changed last wins. */
export function mergeRooms(a: RoomLayout, b: RoomLayout): RoomLayout {
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

/** Room by room, so two windows decorating different rooms never clash. */
export function mergeLayouts(a: HouseLayout, b: HouseLayout): HouseLayout {
  const houses: HouseLayout['houses'] = {};
  for (const layout of [a, b]) {
    for (const [house, rooms] of Object.entries(layout.houses)) {
      for (const [room, r] of Object.entries(rooms)) {
        const had = houses[house]?.[room];
        (houses[house] ??= {})[room] = had ? mergeRooms(had, r) : r;
      }
    }
  }
  return { at: b.at.changedAt > a.at.changedAt ? b.at : a.at, houses };
}

/** The pet's houses, in extension globalState so every window shows the same rooms. */
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
