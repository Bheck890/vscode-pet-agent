import { BagStore, parseBag } from '../bag-store';

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
});
