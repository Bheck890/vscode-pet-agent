import { BagStore, parseBag, parseUnlocks } from '../bag-store';

function memory() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: <T>(key: string) => data[key] as T | undefined,
    update: (key: string, value: unknown) => {
      data[key] = value;
      return Promise.resolve();
    },
  };
}

describe('BagStore', () => {
  it('starts empty and keeps what is saved', () => {
    const store = new BagStore(memory());
    expect(store.get()).toEqual({});
    store.save({ yarn: 2 });
    expect(store.get()).toEqual({ yarn: 2 });
  });

  it("merges, so a window with an older copy can't wipe another window's finds", () => {
    const storage = memory();
    new BagStore(storage).save({ yarn: 3, crown: 1 });
    expect(new BagStore(storage).save({ yarn: 1, bone: 1 })).toEqual({
      yarn: 3,
      crown: 1,
      bone: 1,
    });
  });

  it('drops malformed entries', () => {
    expect(parseBag({ yarn: 2, crown: -1, bone: 1.5, 'x y': 1, rocket: '3' })).toEqual({ yarn: 2 });
    expect(parseBag(['yarn'])).toEqual({});
    expect(parseBag(null)).toEqual({});
  });

  it('merges shop trades and purchases so neither can go backwards', () => {
    const storage = memory();
    const a = new BagStore(storage);
    a.saveSpent({ yarn: 12, box: 8 });
    a.saveUnlocks(['idle.disco']);
    const b = new BagStore(storage);
    expect(b.saveSpent({ yarn: 5, bone: 3 })).toEqual({ yarn: 12, box: 8, bone: 3 });
    expect(b.saveUnlocks(['food.fish', 'idle.disco'])).toEqual(['idle.disco', 'food.fish']);
    expect(a.getSpent()).toEqual({ yarn: 12, box: 8, bone: 3 });
    expect(a.getUnlocks()).toEqual(['idle.disco', 'food.fish']);
  });

  it('drops malformed unlocks', () => {
    expect(parseUnlocks(['idle.disco', 'disco', 3, 'idle.disco', 'a.b c'])).toEqual(['idle.disco']);
    expect(parseUnlocks({ 'idle.disco': true })).toEqual([]);
  });
});

describe('active bag', () => {
  it('survives reloads and is shared by every window', () => {
    const storage = memory();
    new BagStore(storage).setActiveBag('ocean');
    expect(new BagStore(storage).getActiveBag(3, true)).toBe('ocean');
  });

  it('falls back to the starter bag when unknown or not yet unlocked', () => {
    const storage = memory();
    const store = new BagStore(storage);
    expect(store.getActiveBag(1, true)).toBe('starter');
    store.setActiveBag('ocean');
    expect(store.getActiveBag(2, true)).toBe('starter');
    // With levels switched off, every bag is open.
    expect(store.getActiveBag(1, false)).toBe('ocean');
    storage.data['petActiveBag'] = 'atlantis';
    expect(store.getActiveBag(99, true)).toBe('starter');
  });

  it("keeps each bag's shop purchases under the bag's name", () => {
    expect(
      parseUnlocks(['garden.idle.buzz', 'ocean.room.rockpool', 'a.b.c.d', 'Garden.idle.x']),
    ).toEqual(['garden.idle.buzz', 'ocean.room.rockpool']);
  });
});
