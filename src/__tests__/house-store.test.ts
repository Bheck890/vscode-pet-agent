import { HouseStore, mergeLayouts, parseLayout, parseRoom } from '../house-store';
import { parseFromWebview } from '../protocol';
import type { Storage } from '../storage';

function memory(): Storage & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: <T>(key: string) => data[key] as T | undefined,
    update: (key: string, value: unknown) => {
      data[key] = JSON.parse(JSON.stringify(value));
      return Promise.resolve();
    },
  };
}

const at = (house: string, room: string, changedAt = 0) => ({ house, room, changedAt });

describe('parseRoom', () => {
  it('keeps good items and drops bad ones', () => {
    const room = parseRoom({
      items: [
        { id: 'bed', x: 0.2, y: 0.5, at: 10 },
        { id: 'bed', x: 0.9, y: 0.5, at: 99 },
        { id: 'Sofa', x: 0.2, y: 0.5, at: 10 },
        { id: 'lamp', x: 2, y: 0.5, at: 10 },
        { id: 'plant', x: 0.5, y: 0.5, at: 'soon' },
        { id: 'tv', x: 0.5, y: 0.5, at: 5, removed: true },
        null,
      ],
      theme: 'mint',
      themeAt: 3,
    });
    expect(room).toEqual({
      items: [
        { id: 'bed', x: 0.2, y: 0.5, at: 10 },
        { id: 'tv', x: 0.5, y: 0.5, at: 5, removed: true },
      ],
      theme: 'mint',
      themeAt: 3,
    });
  });
});

describe('parseLayout', () => {
  it('starts with no rooms in the starter living room from nothing or junk', () => {
    const empty = { at: at('starter', 'living'), houses: {} };
    expect(parseLayout(undefined)).toEqual(empty);
    expect(parseLayout('house')).toEqual(empty);
    expect(parseLayout({ houses: 'bed', at: '<b>' })).toEqual(empty);
  });

  it('moves the old one-room layout into the starter living room, unchanged', () => {
    const old = {
      items: [{ id: 'bed', x: 0.2, y: 0.5, at: 10 }],
      theme: 'night',
      themeAt: 7,
    };
    expect(parseLayout(old)).toEqual({
      at: at('starter', 'living'),
      houses: { starter: { living: old } },
    });
  });

  it('drops unknown houses and rooms, and a room that is not in its house', () => {
    const layout = parseLayout({
      at: { house: 'garden', room: 'kitchen', changedAt: 5 },
      houses: {
        garden: { shed: { items: [], theme: 'leafy' }, kitchen: { items: [] } },
        dragonland: { lair: { items: [] } },
        starter: { yard: { items: [{ id: 'bed', x: 0.5, y: 0, at: 1 }] } },
      },
    });
    expect(Object.keys(layout.houses).sort()).toEqual(['garden', 'starter']);
    expect(Object.keys(layout.houses['garden'])).toEqual(['shed']);
    expect(layout.at).toEqual(at('starter', 'living', 5));
  });
});

describe('mergeLayouts', () => {
  it('keeps the newest change to each piece and to the theme', () => {
    const mine = parseLayout({
      items: [
        { id: 'bed', x: 0.1, y: 0, at: 50 },
        { id: 'lamp', x: 0.5, y: 0, at: 10 },
      ],
      theme: 'night',
      themeAt: 20,
    });
    const theirs = parseLayout({
      items: [
        { id: 'bed', x: 0.9, y: 0, at: 40 },
        { id: 'lamp', x: 0.5, y: 0, at: 30, removed: true },
        { id: 'tv', x: 0.3, y: 0, at: 5 },
      ],
      theme: 'mint',
      themeAt: 10,
    });
    expect(mergeLayouts(mine, theirs).houses['starter']['living']).toEqual({
      items: [
        { id: 'bed', x: 0.1, y: 0, at: 50 },
        { id: 'lamp', x: 0.5, y: 0, at: 30, removed: true },
        { id: 'tv', x: 0.3, y: 0, at: 5 },
      ],
      theme: 'night',
      themeAt: 20,
    });
  });

  it('merges rooms independently, so two windows decorating different rooms never clash', () => {
    const living = { items: [{ id: 'sofa', x: 0.3, y: 0, at: 9 }], theme: 'cozy', themeAt: 0 };
    const shed = { items: [{ id: 'leafbed', x: 0.6, y: 0, at: 3 }], theme: 'leafy', themeAt: 4 };
    const a = parseLayout({ at: at('starter', 'living', 10), houses: { starter: { living } } });
    const b = parseLayout({ at: at('garden', 'shed', 20), houses: { garden: { shed } } });
    expect(mergeLayouts(a, b)).toEqual({
      at: at('garden', 'shed', 20),
      houses: { starter: { living }, garden: { shed } },
    });
    expect(mergeLayouts(b, a).at).toEqual(at('garden', 'shed', 20));
  });
});

describe('HouseStore', () => {
  it('saves merged layouts so an older window cannot undo a newer change', () => {
    const storage = memory();
    const store = new HouseStore(storage);
    store.save({ items: [{ id: 'bed', x: 0.2, y: 0, at: 100 }], theme: 'cozy', themeAt: 0 });
    store.save({ items: [{ id: 'bed', x: 0.8, y: 0, at: 50 }], theme: 'cozy', themeAt: 0 });
    expect(store.get().houses['starter']['living'].items).toEqual([
      { id: 'bed', x: 0.2, y: 0, at: 100 },
    ]);
  });

  it('reads a stored old-shape room as the starter living room', () => {
    const storage = memory();
    storage.data['petHouse'] = { items: [{ id: 'bed', x: 0.4, y: 0, at: 1 }], theme: 'mint' };
    expect(new HouseStore(storage).get().houses['starter']['living'].theme).toBe('mint');
  });
});

describe('house-save message', () => {
  it('is checked before it reaches the store', () => {
    expect(
      parseFromWebview({
        command: 'house-save',
        slot: 'one',
        layout: {
          at: at('starter', 'bedroom', 2),
          houses: {
            starter: { bedroom: { items: [{ id: 'bed', x: 0.5, y: 0.5, at: 1 }, { id: 'X' }] } },
          },
        },
      }),
    ).toEqual({
      command: 'house-save',
      slot: 'one',
      layout: {
        at: at('starter', 'bedroom', 2),
        houses: {
          starter: {
            bedroom: { items: [{ id: 'bed', x: 0.5, y: 0.5, at: 1 }], theme: 'cozy', themeAt: 0 },
          },
        },
      },
    });
    expect(parseFromWebview({ command: 'house-save', slot: 'one' })).toBeNull();
    expect(parseFromWebview({ command: 'house-save', slot: 'one', layout: 5 })).toBeNull();
    expect(parseFromWebview({ command: 'house-save', layout: {} })).toBeNull();
  });
});
