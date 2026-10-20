import { HouseStore, mergeLayouts, parseLayout } from '../house-store';
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

describe('parseLayout', () => {
  it('keeps good items and drops bad ones', () => {
    const layout = parseLayout({
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
    expect(layout).toEqual({
      items: [
        { id: 'bed', x: 0.2, y: 0.5, at: 10 },
        { id: 'tv', x: 0.5, y: 0.5, at: 5, removed: true },
      ],
      theme: 'mint',
      themeAt: 3,
    });
  });

  it('starts an empty cozy room from nothing or junk', () => {
    const empty = { items: [], theme: 'cozy', themeAt: 0 };
    expect(parseLayout(undefined)).toEqual(empty);
    expect(parseLayout('house')).toEqual(empty);
    expect(parseLayout({ items: 'bed', theme: '<b>' })).toEqual(empty);
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
    expect(mergeLayouts(mine, theirs)).toEqual({
      items: [
        { id: 'bed', x: 0.1, y: 0, at: 50 },
        { id: 'lamp', x: 0.5, y: 0, at: 30, removed: true },
        { id: 'tv', x: 0.3, y: 0, at: 5 },
      ],
      theme: 'night',
      themeAt: 20,
    });
  });
});

describe('HouseStore', () => {
  it('saves merged layouts so an older window cannot undo a newer change', () => {
    const storage = memory();
    const store = new HouseStore(storage);
    store.save({ items: [{ id: 'bed', x: 0.2, y: 0, at: 100 }], theme: 'cozy', themeAt: 0 });
    store.save({ items: [{ id: 'bed', x: 0.8, y: 0, at: 50 }], theme: 'cozy', themeAt: 0 });
    expect(store.get().items).toEqual([{ id: 'bed', x: 0.2, y: 0, at: 100 }]);
  });
});

describe('house-save message', () => {
  it('is checked before it reaches the store', () => {
    expect(
      parseFromWebview({
        command: 'house-save',
        layout: { items: [{ id: 'bed', x: 0.5, y: 0.5, at: 1 }, { id: 'X' }], theme: 'cozy' },
      }),
    ).toEqual({
      command: 'house-save',
      layout: { items: [{ id: 'bed', x: 0.5, y: 0.5, at: 1 }], theme: 'cozy', themeAt: 0 },
    });
    expect(parseFromWebview({ command: 'house-save' })).toBeNull();
    expect(parseFromWebview({ command: 'house-save', layout: 5 })).toBeNull();
  });
});
