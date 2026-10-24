import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { CareStore } from '../pet-care';
import { AFTER_CARE_MS, PLAY_CHANCE, VISIT_EVERY_MS, Visitors, pickVisitor } from '../visitors';
import { memory } from './save-helpers';

const MIN = 60 * 1000;
const T0 = new Date(2026, 9, 24, 12).getTime();

function setup(toys: string[] = [], rand: () => number = Math.random) {
  const storage = memory();
  const care = new CareStore(storage);
  /** Sets the stats as they stand at `at`, so decay doesn't muddy the sums. */
  const stats = (at: number, fullness: number, fun: number, clean: number) =>
    (storage.data['petCare'] = { fullness, fun, clean, updatedAt: at });
  stats(T0, 0, 0, 0);
  return { storage, care, stats, visitors: new Visitors(storage, care, () => toys, rand) };
}

describe('visitors', () => {
  it('never come to a pet with nothing at 40 or below', () => {
    const { stats, storage, visitors } = setup();
    for (let m = 0; m < 300; m += 10) {
      stats(T0 + m * MIN, 60, 41, 90);
      expect(visitors.tick(T0 + m * MIN)).toBeNull();
    }
    expect(storage.data['petVisitorWait']).toBeUndefined();
  });

  it('come every 40 minutes while any stat is at 40 or below', () => {
    const { stats, visitors } = setup();
    stats(T0, 80, 40, 80);
    expect(visitors.tick(T0)).toBeNull();
    stats(T0 + 39 * MIN, 80, 40, 80);
    expect(visitors.tick(T0 + 39 * MIN)).toBeNull();
    stats(T0 + 40 * MIN, 80, 40, 80);
    expect(visitors.tick(T0 + 40 * MIN)).not.toBeNull();
    stats(T0 + 79 * MIN, 80, 40, 80);
    expect(visitors.tick(T0 + 79 * MIN)).toBeNull();
    stats(T0 + 80 * MIN, 80, 40, 80);
    expect(visitors.tick(T0 + 80 * MIN)).not.toBeNull();
    expect(VISIT_EVERY_MS).toEqual({ low: 40 * MIN, empty: 30 * MIN });
  });

  it('come every 30 minutes once every stat is at zero', () => {
    const { stats, visitors } = setup();
    visitors.tick(T0);
    stats(T0 + 29 * MIN, 0, 0, 0);
    expect(visitors.tick(T0 + 29 * MIN)).toBeNull();
    stats(T0 + 30 * MIN, 0, 0, 0);
    const visit = visitors.tick(T0 + 30 * MIN);
    expect(visit).toMatchObject({ at: T0 + 30 * MIN, amount: 33 });
    // That visit lifted one stat, so the pet is low rather than empty: 40 minutes now.
    expect(visitors.tick(T0 + 60 * MIN)).toBeNull();
    expect(visitors.tick(T0 + 70 * MIN)).not.toBeNull();
  });

  it('wait an hour after you look after a pet that still needs help, then go back to the usual gap', () => {
    const { stats, visitors } = setup();
    visitors.tick(T0);
    visitors.cared(T0 + 10 * MIN);
    stats(T0 + 40 * MIN, 0, 0, 0);
    expect(visitors.tick(T0 + 40 * MIN)).toBeNull();
    stats(T0 + 69 * MIN, 0, 0, 0);
    expect(visitors.tick(T0 + 69 * MIN)).toBeNull();
    stats(T0 + 70 * MIN, 0, 0, 0);
    expect(visitors.tick(T0 + 70 * MIN)).not.toBeNull();
    expect(AFTER_CARE_MS).toBe(60 * MIN);
    stats(T0 + 100 * MIN, 0, 0, 0);
    expect(visitors.tick(T0 + 100 * MIN)).not.toBeNull();
  });

  it('stop once nothing is low, and start a fresh wait when something is again', () => {
    const { stats, storage, visitors } = setup();
    visitors.tick(T0);
    stats(T0 + 5 * MIN, 50, 50, 50);
    expect(visitors.tick(T0 + 5 * MIN)).toBeNull();
    expect(storage.data['petVisitorWait']).toBeUndefined();
    stats(T0 + 10 * MIN, 50, 20, 50);
    expect(visitors.tick(T0 + 10 * MIN)).toBeNull();
    expect(storage.data['petVisitorWait']).toEqual({ since: T0 + 10 * MIN, cared: false });
  });

  it('top up a third of the stat they help, never past 100', () => {
    const { care, stats, visitors } = setup();
    visitors.tick(T0);
    // Not every stat is zero, so the gap is 40 minutes.
    stats(T0 + 40 * MIN, 10, 0, 95);
    // Only fullness is low among food and bath, so the help is food.
    const visit = visitors.tick(T0 + 40 * MIN)!;
    expect(visit).toMatchObject({ kind: 'feed', stat: 'fullness', amount: 33 });
    expect(Math.round(care.get(T0 + 40 * MIN).fullness)).toBe(43);
  });

  it('a second window ticking straight after finds the next visit 30 or 40 minutes away', () => {
    const { stats, visitors } = setup();
    visitors.tick(T0);
    stats(T0 + 30 * MIN, 0, 0, 0);
    expect(visitors.tick(T0 + 30 * MIN)).not.toBeNull();
    expect(visitors.tick(T0 + 30 * MIN + 1000)).toBeNull();
  });

  it('send food or a bath, whichever helps; either when both are low', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      kinds.add(pickVisitor(Math.random, [], { fullness: 0, fun: 50, clean: 0 }).kind);
      expect(pickVisitor(Math.random, [], { fullness: 90, fun: 0, clean: 5 }).kind).toBe('rain');
    }
    expect([...kinds].sort()).toEqual(['feed', 'rain']);
  });

  it('very rarely send a playmate, with a toy from the bag', () => {
    const low = { fullness: 0, fun: 0, clean: 0 };
    let n = 0;
    const picks = Array.from({ length: 5000 }, () =>
      pickVisitor(Math.random, ['yarn', 'crab'], low),
    );
    for (const p of picks) {
      if (p.kind === 'play') {
        n++;
        expect(['yarn', 'crab']).toContain(p.toy);
      }
    }
    expect(n / picks.length).toBeGreaterThan(PLAY_CHANCE / 2);
    expect(n / picks.length).toBeLessThan(PLAY_CHANCE * 2);
    expect(pickVisitor(() => 0, [], low)).toEqual({ kind: 'feed' });
    expect(pickVisitor(() => 0, ['yarn'], low)).toEqual({ kind: 'play', toy: 'yarn' });
  });

  it('a playmate raises happiness', () => {
    const { storage, care, visitors } = setup(['yarn'], () => 0);
    storage.data['petVisitorWait'] = { since: T0 - 30 * MIN, cared: false };
    expect(visitors.tick(T0)).toMatchObject({ kind: 'play', toy: 'yarn', stat: 'fun' });
    expect(Math.round(care.get(T0).fun)).toBe(33);
  });
});

describe('playmates', () => {
  // The view's helpers, loaded as the page loads them.
  const sandbox: Record<string, unknown> = {};
  for (const file of ['pets.js', 'variants.js', 'scene.js', 'visitors.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), 'media', file), 'utf8'), sandbox);
  }
  type Look = Record<string, string>;
  const { friendLook } = sandbox['PetVisitors'] as {
    friendLook(species: string, at: number): Look;
  };
  const Art = sandbox['PetArt'] as { PATTERNS: string[]; ACCESSORIES: Record<string, unknown> };

  it.each(['cat', 'dog', 'bird', 'fox'])(
    'are always a %s like the pet, rolled fresh each visit',
    (species) => {
      const looks = Array.from({ length: 40 }, (_, i) => friendLook(species, T0 + i * 60 * MIN));
      expect(looks.every((l) => l.species === species)).toBe(true);
      for (const key of ['color', 'name', 'pattern', 'accessory']) {
        expect([key, new Set(looks.map((l) => l[key])).size > 2]).toEqual([key, true]);
      }
      for (const l of looks) {
        expect(['', ...Art.PATTERNS]).toContain(l.pattern);
        expect(['', ...Object.keys(Art.ACCESSORIES)]).toContain(l.accessory);
      }
    },
  );

  it('look the same in every window for the same visit', () => {
    expect(friendLook('fox', T0)).toEqual(friendLook('fox', T0));
  });
});
