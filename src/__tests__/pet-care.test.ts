import { CareStore, applyCare, decay, freshStats, parseStats } from '../pet-care';

const HOUR = 3_600_000;
const T0 = 1_000_000_000_000;

describe('decay', () => {
  it('wears stats down over time and never below zero', () => {
    const s = decay({ fullness: 50, fun: 50, clean: 50, updatedAt: T0 }, T0 + 2 * HOUR);
    expect(s).toEqual({ fullness: 36, fun: 30, clean: 42, updatedAt: T0 + 2 * HOUR });
    expect(decay(freshStats(T0), T0 + 100 * HOUR).fun).toBe(0);
  });
});

describe('applyCare', () => {
  const at = (fullness: number, fun: number, clean: number) => ({
    fullness,
    fun,
    clean,
    updatedAt: T0,
  });

  it('each kibble eaten fills the tummy a little', () => {
    const r = applyCare(at(20, 50, 50), 'kibble', T0);
    expect(r.ok).toBe(true);
    expect(r.stats.fullness).toBe(30);
  });

  it('caps stats at 100', () => {
    const r = applyCare(at(80, 95, 50), 'treat', T0);
    expect(r.stats).toMatchObject({ fullness: 86, fun: 100 });
  });

  it('fetch is fun but messy and tiring', () => {
    expect(applyCare(at(50, 20, 50), 'fetch', T0).stats).toMatchObject({
      fullness: 48,
      fun: 32,
      clean: 47,
    });
  });

  it('five scrubs take a filthy pet to clean', () => {
    let s = at(50, 50, 0);
    for (let i = 0; i < 5; i++) {
      s = applyCare(s, 'scrub', T0).stats;
    }
    expect(s.clean).toBe(100);
    expect(applyCare(s, 'scrub', T0)).toMatchObject({ ok: false });
  });

  it('refuses food when full and play when starving', () => {
    expect(applyCare(at(96, 50, 50), 'kibble', T0)).toMatchObject({
      ok: false,
      reason: "isn't hungry right now",
    });
    expect(applyCare(at(5, 50, 50), 'fetch', T0)).toMatchObject({
      ok: false,
      reason: 'is too hungry to play',
    });
  });
});

describe('parseStats', () => {
  it('starts fresh for missing or corrupt data', () => {
    expect(parseStats(undefined, T0)).toEqual(freshStats(T0));
    expect(parseStats({ fullness: 'lots' }, T0)).toEqual(freshStats(T0));
  });

  it('clamps out-of-range values and future timestamps', () => {
    expect(parseStats({ fullness: 150, fun: -5, clean: 40, updatedAt: T0 + HOUR }, T0)).toEqual({
      fullness: 100,
      fun: 0,
      clean: 40,
      updatedAt: T0,
    });
  });
});

describe('CareStore', () => {
  function memento() {
    const data: Record<string, unknown> = {};
    return {
      data,
      get: <T>(k: string) => data[k] as T | undefined,
      update: (k: string, v: unknown) => {
        data[k] = v;
        return Promise.resolve();
      },
    };
  }

  it('persists successful actions only', () => {
    const m = memento();
    const store = new CareStore(m);
    store.act('kibble', T0);
    store.act('kibble', T0);
    expect(m.data['petCare']).toMatchObject({ fullness: 100 });

    const refused = store.act('kibble', T0 + 1);
    expect(refused.ok).toBe(false);
    expect(m.data['petCare']).toMatchObject({ fullness: 100, updatedAt: T0 });
  });

  it('applies decay when read later', () => {
    const m = memento();
    const store = new CareStore(m);
    store.act('pet', T0);
    expect(store.get(T0 + 10 * HOUR).fun).toBe(0);
  });
});
