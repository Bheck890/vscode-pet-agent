import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { BAG_LEVELS, EVENT_TOYS } from '../bags';
import { PET_STATES } from '../transcript-parser';

interface Variant {
  id: string;
  prop?: string | null;
  scene?: string;
  species?: string[];
  roam?: string;
  moves?: boolean;
  needs?: string;
  fx?: string | null;
  shop?: string;
  bag?: string;
  critter?: string;
  label?: string;
}

interface VariantsApi {
  VARIANTS: Record<string, Variant[]>;
  IDLE: Variant[];
  pick(
    state: string,
    opts: {
      classic: boolean;
      species: string;
      lastId?: string;
      off?: string[];
      unlocked?: string[];
      bags?: string[];
      rand?: () => number;
    },
  ): Variant | null;
  pickIdle(opts: {
    species: string;
    wander: boolean;
    toys: boolean;
    lastId?: string;
    off?: string[];
    unlocked?: string[];
    bags?: string[];
    rand?: () => number;
  }): Variant | null;
  shopActions(
    bag?: string,
  ): Array<{ id: string; action: string; group: string; icon: string; label: string }>;
  bagActions(bag: string): Array<{ action: string; group: string; label: string }>;
  unlockId(bag: string | undefined, kind: string, id: string): string;
  seeded(key: string): () => number;
}

interface SceneApi {
  update(t: number, dt: number): void;
  setJobs(jobs: Array<{ id: string; kind: string; label: string; background: boolean }>): void;
  hover(x: number, y: number): { title: string; sub: string } | null;
  machineCount(): number;
  machineSide(): number;
  find(): void;
  foundCount(): number;
  toyTotal: number;
  setBag(bag: Record<string, number>, spent?: Record<string, number>): void;
  spares(rarity: string, bag?: string): number;
  spend(rarity: string, n: number, bag?: string): boolean;
  bagList(bag?: string): Array<{ id: string; count: number; out: boolean }>;
  bagCount(bag: string): { found: number; total: number };
  visit(found: Record<string, number> | null): void;
  takeOut(id: string): boolean;
  putAway(id: string): void;
  canPlay(): boolean;
  startToy(until: number, chosen?: object): boolean;
  poke(x: number, y: number): { def: { id: string; kind: string }; vx: number } | null;
  toyLabel(): string;
  grab(x: number, y: number): boolean;
}

const media = path.join(process.cwd(), 'media');
const sandbox: Record<string, unknown> = {};
for (const file of ['pets.js', 'states.js', 'variants.js', 'scene.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(media, file), 'utf8'), sandbox);
}
const V = sandbox['PetVariants'] as VariantsApi;
const Art = sandbox['PetArt'] as { PROPS: Record<string, unknown> };
const PetStates = sandbox['PetStates'] as {
  STATES: Record<string, { label: string; oneShot?: number }>;
  PEON_TO_STATE: Record<string, string>;
  WORKING: Set<string>;
};
const PetScene = sandbox['PetScene'] as {
  create(api: object): SceneApi;
  BAGS: Array<{
    id: string;
    name: string;
    emoji: string;
    weights?: Record<string, number>;
    toys: Array<{ id: string; rarity: string; use: string; kind: string }>;
    styles: Array<{ id: string; name: string }>;
  }>;
  TOYS: Array<{
    id: string;
    rarity: string;
    kind: string;
    event?: string;
    bag: string;
    use: string;
  }>;
  RARITY: Record<string, unknown>;
  PRICES: Record<string, Array<{ rarity: string; n: number }>>;
  CRITTERS: Record<string, unknown>;
  SCENERY: string[];
  USE_LABEL: Record<string, string>;
  rollToy(rand: () => number, bag: string): { id: string; bag: string; rarity: string };
};
const SCENERY = PetScene.SCENERY;

describe('agent states', () => {
  it('has a look for exactly the states the extension reports', () => {
    expect(Object.keys(PetStates.STATES).sort()).toEqual([...PET_STATES].sort());
  });

  it('every state has a label, and every variant group is a real state', () => {
    for (const [id, def] of Object.entries(PetStates.STATES)) {
      expect([id, typeof def.label]).toEqual([id, 'string']);
    }
    for (const state of Object.keys(V.VARIANTS)) {
      expect(PET_STATES).toContain(state);
    }
  });

  it('maps peon-ping animations and busy states onto real states', () => {
    for (const state of [...Object.values(PetStates.PEON_TO_STATE), ...PetStates.WORKING]) {
      expect(PET_STATES).toContain(state);
    }
  });
});

describe('animation variants', () => {
  // Idle has hobbies (IDLE) instead of variants.
  const STATES = PET_STATES.filter((s) => s !== 'idle');

  it.each(STATES)('%s starts with the classic look and has alternatives', (state) => {
    const list = V.VARIANTS[state];
    expect(list[0].id).toBe('classic');
    expect(list.length).toBeGreaterThanOrEqual(3);
  });

  it('only uses props and scenery that exist', () => {
    const all = [...Object.values(V.VARIANTS).flat(), ...V.IDLE];
    for (const v of all) {
      if (v.prop) {
        expect([v.id, Art.PROPS[v.prop] ? 'ok' : v.prop]).toEqual([v.id, 'ok']);
      }
      if (v.scene) {
        expect(SCENERY).toContain(v.scene);
      }
    }
  });

  it('only uses effects that webview.js draws', () => {
    const webview = fs.readFileSync(path.join(media, 'webview.js'), 'utf8');
    const fxEvery = webview.slice(
      webview.indexOf('const FX_EVERY'),
      webview.indexOf('};', webview.indexOf('const FX_EVERY')),
    );
    for (const v of [...Object.values(V.VARIANTS).flat(), ...V.IDLE]) {
      if (v.fx) {
        expect([v.id, fxEvery.includes(`${v.fx}:`) ? 'ok' : v.fx]).toEqual([v.id, 'ok']);
      }
    }
  });

  it('keeps shop actions locked until bought', () => {
    const shop = V.shopActions();
    expect(shop.length).toBeGreaterThanOrEqual(6);
    expect(shop.map((a) => a.id)).toContain('idle.disco');
    expect(shop.map((a) => a.id)).toContain('done.party');
    const seen = (unlocked?: string[]) => {
      const ids = new Set<string>();
      for (let i = 0; i < 400; i++) {
        ids.add(`idle.${V.pickIdle({ species: 'cat', wander: true, toys: true, unlocked })?.id}`);
        ids.add(`done.${V.pick('done', { classic: false, species: 'cat', unlocked })?.id}`);
      }
      return ids;
    };
    const locked = seen();
    expect(shop.filter((a) => locked.has(a.id))).toEqual([]);
    const open = seen(['idle.disco', 'done.party']);
    expect(open.has('idle.disco')).toBe(true);
    expect(open.has('done.party')).toBe(true);
    expect(open.has('idle.magic')).toBe(false);
  });

  it('picks the same variant for the same seed and spreads across seeds', () => {
    const pickFor = (key: string) =>
      V.pick('running', { classic: false, species: 'cat', rand: V.seeded(key) })?.id;
    expect(pickFor('s1:1000:running')).toBe(pickFor('s1:1000:running'));
    const ids = new Set(Array.from({ length: 40 }, (_, i) => pickFor(`s1:${i}:running`)));
    expect(ids.size).toBeGreaterThan(2);
  });

  it('classic mode always picks the first variant', () => {
    for (let i = 0; i < 5; i++) {
      expect(V.pick('sleeping', { classic: true, species: 'cat' })?.id).toBe('classic');
    }
  });

  it('random mode never repeats the previous variant', () => {
    for (let i = 0; i < 30; i++) {
      expect(V.pick('done', { classic: false, species: 'fox', lastId: 'dance' })?.id).not.toBe(
        'dance',
      );
    }
  });

  it('never picks an action that was switched off', () => {
    const off = ['running.zoomies', 'running.circles', 'idle.butterfly', 'idle.circles'];
    for (let i = 0; i < 100; i++) {
      expect(['zoomies', 'circles']).not.toContain(
        V.pick('running', { classic: false, species: 'dog', off })?.id,
      );
      expect(['butterfly', 'circles']).not.toContain(
        V.pickIdle({ species: 'dog', wander: true, toys: true, off })?.id,
      );
    }
  });

  it('falls back to the classic look when every variant is switched off', () => {
    const off = V.VARIANTS['done'].map((v) => `done.${v.id}`);
    expect(V.pick('done', { classic: false, species: 'cat', off })?.id).toBe('classic');
  });

  it('keeps bird-only variants and hobbies to birds', () => {
    const ids = (species: string) => {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        seen.add(V.pick('running', { classic: false, species })?.id ?? '');
        seen.add(V.pickIdle({ species, wander: true, toys: false })?.id ?? '');
      }
      return seen;
    };
    expect(ids('dog').has('flyLaps')).toBe(false);
    expect(ids('dog').has('fly')).toBe(false);
    expect(ids('bird').has('flyLaps')).toBe(true);
    expect(ids('bird').has('fly')).toBe(true);
  });

  it('skips moving hobbies when wandering is off and toy play when there are no toys', () => {
    for (let i = 0; i < 100; i++) {
      const h = V.pickIdle({ species: 'bird', wander: false, toys: false });
      expect(h?.moves).toBeFalsy();
      expect(h?.needs).toBeUndefined();
    }
  });
});

describe('scene', () => {
  const pet = { x: 0, y: 30, wx: 0, scale: 6 };

  function makeScene(config: Record<string, unknown>, events: string[] = [], bag = 'starter') {
    const saved: Array<Record<string, number>> = [];
    const spent: Array<Record<string, number>> = [];
    const found: string[] = [];
    const ctx = new Proxy(
      {},
      { get: (_t, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined) },
    );
    const scene = PetScene.create({
      ctx,
      main: () => pet,
      petPx: () => 192,
      view: () => ({ w: 600, h: 600 }),
      now: () => Date.now(),
      emit: () => undefined,
      config: () => config,
      playing: () => false,
      onBag: (bag: Record<string, number>) => saved.push(bag),
      onSpent: (s: Record<string, number>) => spent.push(s),
      onFound: (toy: { id: string }) => found.push(toy.id),
      events: () => events,
      activeBag: () => bag,
    });
    return { scene, saved, spent, found };
  }

  it('has toys in every rarity', () => {
    for (const rarity of Object.keys(PetScene.RARITY)) {
      expect(PetScene.TOYS.some((t) => t.rarity === rarity)).toBe(true);
    }
  });

  it('has one holiday toy per event, and only holiday toys are of the event rarity', () => {
    const eventToys = PetScene.TOYS.filter((t) => t.event);
    expect(eventToys.map((t) => t.event).sort()).toEqual(
      ['christmas', 'easter', 'halloween', 'newyear', 'thanksgiving', 'valentine'].sort(),
    );
    expect(eventToys.every((t) => t.rarity === 'event')).toBe(true);
    expect(PetScene.TOYS.filter((t) => t.rarity === 'event')).toHaveLength(eventToys.length);
  });

  it('never finds a holiday toy outside its event', () => {
    const { scene, saved } = makeScene({ toys: true, machines: true });
    for (let i = 0; i < 300; i++) {
      scene.find();
    }
    const found = Object.keys(saved[saved.length - 1]);
    const holiday = new Set(PetScene.TOYS.filter((t) => t.event).map((t) => t.id));
    expect(found.filter((id) => holiday.has(id))).toEqual([]);
  });

  it("finds the running event's toy while it is on, and no other event's", () => {
    const { scene, saved } = makeScene({ toys: true, machines: true }, ['halloween']);
    for (let i = 0; i < 60; i++) {
      scene.find();
    }
    const found = Object.keys(saved[saved.length - 1]);
    expect(found).toContain('pumpkin');
    expect(found).not.toContain('snowman');
  });

  it('puts every find straight into the bag and saves it', () => {
    const { scene, saved } = makeScene({ toys: true, machines: true });
    scene.find();
    scene.find();
    expect(saved).toHaveLength(2);
    const total = Object.values(saved[1]).reduce((a, b) => a + b, 0);
    expect(total).toBe(2);
    expect(scene.foundCount()).toBe(Object.keys(saved[1]).length);
    expect(scene.toyTotal).toBe(PetScene.TOYS.length);
  });

  it('restores the bag, ignoring unknown toys, and takes toys out and back', () => {
    const { scene } = makeScene({ toys: false, machines: true });
    scene.setBag({ yarn: 3, griffin: 1 });
    expect(scene.foundCount()).toBe(1);
    expect(scene.bagList().find((t) => t.id === 'yarn')).toMatchObject({ count: 3, out: false });
    expect(scene.takeOut('crown')).toBe(false);
    expect(scene.takeOut('yarn')).toBe(true);
    expect(scene.bagList().find((t) => t.id === 'yarn')?.out).toBe(true);
    scene.putAway('yarn');
    expect(scene.bagList().find((t) => t.id === 'yarn')?.out).toBe(false);
  });

  it('sorts every find into a real toy or an object', () => {
    const kinds = new Set(PetScene.TOYS.map((t) => t.kind));
    expect([...kinds].sort()).toEqual(['object', 'toy']);
    const kindOf = (id: string) => PetScene.TOYS.find((t) => t.id === id)?.kind;
    expect([kindOf('yarn'), kindOf('frisbee'), kindOf('couch'), kindOf('bed')]).toEqual([
      'toy',
      'toy',
      'object',
      'object',
    ]);
  });

  it('flicks a real toy when clicked but leaves an object where it is', () => {
    const pokeOut = (id: string) => {
      const { scene } = makeScene({ toys: false, machines: true });
      scene.setBag({ [id]: 1 });
      scene.takeOut(id);
      for (let x = 0; x <= 600; x += 5) {
        const toy = scene.poke(x, 187);
        if (toy) {
          return { scene, toy };
        }
      }
      throw new Error(`${id} not found on the floor`);
    };
    expect(Math.abs(pokeOut('yarn').toy.vx)).toBeGreaterThan(0);

    const { scene, toy } = pokeOut('couch');
    expect(toy.vx).toBe(0);
    expect(scene.startToy(Date.now() + 5000, toy)).toBe(true);
    expect(scene.toyLabel()).toBe('lounging on the couch');
    expect(scene.poke(9999, 9999)).toBeNull();
  });

  it('right-clicking a toy on the floor puts it back in the bag', () => {
    const { scene } = makeScene({ toys: false, machines: true });
    scene.setBag({ yarn: 1 });
    scene.takeOut('yarn');
    // Toys rest on the pet's floor line; find this one by sweeping across it.
    let hit = false;
    for (let x = 0; x <= 600 && !hit; x += 5) {
      hit = scene.grab(x, 187);
    }
    expect(hit).toBe(true);
    expect(scene.bagList().find((t) => t.id === 'yarn')?.out).toBe(false);
  });

  it('pulls a toy out of the bag to play with only when toys are on', () => {
    const off = makeScene({ toys: false, machines: true }).scene;
    off.setBag({ yarn: 1 });
    expect(off.canPlay()).toBe(false);

    const on = makeScene({ toys: true, machines: true }).scene;
    on.setBag({ yarn: 1 });
    expect(on.startToy(Date.now() + 5000)).toBe(true);
    expect(on.bagList().find((t) => t.id === 'yarn')?.out).toBe(true);
  });

  it('always pulls a real toy out of a bag with several kinds in it', () => {
    const bag = { yarn: 2, box: 1, guitar: 1, skateboard: 1, balloon: 1, crown: 1 };
    for (let i = 0; i < 40; i++) {
      const { scene } = makeScene({ toys: true, machines: true });
      scene.setBag(bag);
      expect(scene.startToy(Date.now() + 5000)).toBe(true);
      const out = scene.bagList().filter((t) => t.out);
      expect(out).toHaveLength(1);
      expect(Object.keys(bag)).toContain(out[0].id);
      expect(() => scene.update(Date.now() + 100, 0.016)).not.toThrow();
    }
  });

  it('charges 20 commons or 5 rares for an animation and 100 commons for a food', () => {
    expect(PetScene.PRICES.animation).toEqual([
      { rarity: 'common', n: 20 },
      { rarity: 'rare', n: 5 },
    ]);
    expect(PetScene.PRICES.food).toEqual([{ rarity: 'common', n: 100 }]);
  });

  it('trades in spares only, most plentiful kind first, and keeps one of each', () => {
    const { scene, spent } = makeScene({ toys: false, machines: true });
    scene.setBag({ yarn: 15, box: 8, bone: 1, rocket: 3 });
    expect(scene.spares('common')).toBe(21);
    expect(scene.spares('rare')).toBe(2);
    expect(scene.spend('rare', 5)).toBe(false);
    expect(spent).toHaveLength(0);

    expect(scene.spend('common', 20)).toBe(true);
    expect(spent[0]).toEqual({ yarn: 14, box: 6 });
    const count = (id: string) => scene.bagList().find((t) => t.id === id)?.count;
    expect([count('yarn'), count('box'), count('bone')]).toEqual([1, 2, 1]);
    expect(scene.spares('common')).toBe(1);
    expect(scene.foundCount()).toBe(4);
  });

  it('restores what was traded in', () => {
    const { scene } = makeScene({ toys: false, machines: true });
    scene.setBag({ yarn: 25 }, { yarn: 20, crown: 1 });
    expect(scene.bagList().find((t) => t.id === 'yarn')?.count).toBe(5);
    expect(scene.spares('common')).toBe(4);
  });

  it('puts a machine next to the pet for each job, washing machines for tests in classic', () => {
    const { scene } = makeScene({ toys: false, machines: true, variety: 'classic' });
    scene.setJobs([
      { id: 'a', kind: 'test', label: 'npm test', background: false },
      { id: 'b', kind: 'build', label: 'npm run build', background: true },
    ]);
    scene.update(Date.now() + 500, 0.016);
    expect(scene.machineCount()).toBe(2);
    expect(scene.machineSide()).toBe(1);

    // The pet is 192px wide at x=0, so the first machine starts at ~173px.
    const tip = scene.hover(200, 200);
    expect(tip?.title).toContain('washing machine');
    expect(tip?.sub).toContain('npm test');

    scene.setJobs([{ id: 'b', kind: 'build', label: 'npm run build', background: true }]);
    expect(scene.machineCount()).toBe(1);
  });
});

describe('bags', () => {
  const ALL = [...Object.values(V.VARIANTS).flat(), ...V.IDLE];
  const NORMAL = ['common', 'uncommon', 'rare', 'legendary'];
  const pet = { x: 0, y: 30, wx: 0, scale: 6 };

  function makeScene(config: Record<string, unknown>, events: string[] = [], bag = 'starter') {
    const saved: Array<Record<string, number>> = [];
    const found: string[] = [];
    const ctx = new Proxy(
      {},
      { get: (_t, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined) },
    );
    const scene = PetScene.create({
      ctx,
      main: () => pet,
      petPx: () => 192,
      view: () => ({ w: 600, h: 600 }),
      now: () => Date.now(),
      emit: () => undefined,
      config: () => config,
      playing: () => false,
      onBag: (b: Record<string, number>) => saved.push(b),
      onSpent: () => undefined,
      onFound: (toy: { id: string }) => found.push(toy.id),
      events: () => events,
      activeBag: () => bag,
    });
    return { scene, saved, found };
  }

  it('has the same bags, in the same order, as the extension', () => {
    expect(PetScene.BAGS.map((b) => b.id)).toEqual(BAG_LEVELS.map((b) => b.id));
    expect(PetScene.BAGS).toHaveLength(20);
  });

  it('keeps toy ids unique across every bag, and the holiday toys under the starter bag', () => {
    const ids = PetScene.TOYS.map((t) => t.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(ids.every((id) => /^[a-z]+$/.test(id))).toBe(true);
    const holiday = PetScene.TOYS.filter((t) => t.rarity === 'event');
    expect(holiday.map((t) => t.id).sort()).toEqual([...EVENT_TOYS].sort());
    expect(holiday.every((t) => t.bag === 'starter')).toBe(true);
  });

  it.each(PetScene.BAGS.map((b) => [b.id, b] as const))(
    '%s has 12 or more toys across the four rarities, each with a known use',
    (_id, bag) => {
      const toys = bag.toys.filter((t) => t.rarity !== 'event');
      expect(toys.length).toBeGreaterThanOrEqual(12);
      for (const rarity of NORMAL) {
        expect([rarity, toys.some((t) => t.rarity === rarity)]).toEqual([rarity, true]);
      }
      for (const t of toys) {
        expect([t.id, t.use in PetScene.USE_LABEL]).toEqual([t.id, true]);
        expect(['toy', 'object']).toContain(t.kind);
      }
    },
  );

  it('gives every bag past the first a free style and two colour variants', () => {
    for (const bag of PetScene.BAGS.slice(1)) {
      expect([bag.id, bag.styles.length]).toEqual([bag.id, 3]);
    }
    expect(PetScene.BAGS[0].styles).toEqual([]);
  });

  it('finds only come from the active bag', () => {
    const { scene, saved } = makeScene({ toys: true, machines: true }, [], 'garden');
    for (let i = 0; i < 200; i++) {
      scene.find();
    }
    const bags = new Set(
      Object.keys(saved[saved.length - 1]).map((id) => PetScene.TOYS.find((t) => t.id === id)?.bag),
    );
    expect([...bags]).toEqual(['garden']);
  });

  it('still turns up holiday toys during their event, whichever bag is active', () => {
    const { scene, saved } = makeScene({ toys: true, machines: true }, ['halloween'], 'space');
    for (let i = 0; i < 60; i++) {
      scene.find();
    }
    expect(Object.keys(saved[saved.length - 1])).toContain('pumpkin');
  });

  it('reports each kind of toy the first time it is found', () => {
    const { scene, found } = makeScene({ toys: true, machines: true }, [], 'ocean');
    for (let i = 0; i < 100; i++) {
      scene.find();
    }
    expect(new Set(found).size).toBe(found.length);
    expect(found.length).toBe(scene.bagCount('ocean').found);
  });

  it("rolls a toy from the bag's own catalogue whatever the roll", () => {
    for (const bag of PetScene.BAGS) {
      for (const r of [0, 0.7, 0.92, 0.999]) {
        const toy = PetScene.rollToy(() => r, bag.id);
        expect([bag.id, toy.bag]).toEqual([bag.id, bag.id]);
        expect(toy.rarity).not.toBe('event');
      }
    }
    // An unknown bag falls back to the starter bag.
    expect(PetScene.rollToy(() => 0, 'nowhere').bag).toBe('starter');
  });

  it('boosts legendary finds in the legendary vault', () => {
    const share = (bag: string) => {
      let n = 0;
      for (let i = 0; i < 2000; i++) {
        n += PetScene.rollToy(Math.random, bag).rarity === 'legendary' ? 1 : 0;
      }
      return n / 2000;
    };
    expect(share('vault')).toBeGreaterThan(0.12);
    expect(share('garden')).toBeLessThan(0.08);
  });

  it("a bag's shop only takes that bag's spares", () => {
    const { scene } = makeScene({ toys: false, machines: true }, [], 'garden');
    scene.setBag({ yarn: 30, sunflower: 4 });
    expect(scene.spares('common', 'starter')).toBe(29);
    expect(scene.spares('common', 'garden')).toBe(3);
    expect(scene.spares('common')).toBe(3);
    expect(scene.spend('common', 20, 'garden')).toBe(false);
    expect(scene.spend('common', 3, 'garden')).toBe(true);
    expect(scene.bagList('starter').find((t) => t.id === 'yarn')?.count).toBe(30);
    expect(scene.bagList('garden').find((t) => t.id === 'sunflower')?.count).toBe(1);
  });

  it('visits an old bag without finding or spending anything, then comes home', () => {
    const { scene, saved } = makeScene({ toys: true, machines: true });
    scene.setBag({ yarn: 2 });
    scene.visit({ crab: 4, shell: 1 });
    expect(scene.bagCount('ocean').found).toBe(2);
    expect(scene.bagList('starter').find((t) => t.id === 'yarn')?.count).toBe(0);
    scene.find();
    expect(saved).toHaveLength(0);
    expect(scene.spend('common', 1, 'ocean')).toBe(false);
    expect(scene.startToy(Date.now() + 5000)).toBe(true);
    scene.visit(null);
    expect(scene.bagCount('ocean').found).toBe(0);
    expect(scene.bagList('starter').find((t) => t.id === 'yarn')?.count).toBe(2);
  });

  it('uses only critters scene.js draws', () => {
    for (const v of ALL.filter((x) => x.critter)) {
      expect([v.id, v.critter! in PetScene.CRITTERS]).toEqual([v.id, true]);
    }
  });

  it('every bag animation belongs to a real bag, never the starter one', () => {
    for (const v of ALL.filter((x) => x.bag)) {
      expect([v.id, BAG_LEVELS.some((b) => b.id === v.bag && b.id !== 'starter')]).toEqual([
        v.id,
        true,
      ]);
    }
  });

  it.each(PetScene.BAGS.slice(1).map((b) => b.id))(
    '%s comes with 2 hobbies and a state variant, and sells 2 or more animations',
    (bag) => {
      const free = V.bagActions(bag);
      expect(free.filter((a) => a.group === 'idle')).toHaveLength(2);
      expect(free.filter((a) => a.group !== 'idle')).toHaveLength(1);
      const sold = V.shopActions(bag);
      expect(sold.length).toBeGreaterThanOrEqual(2);
      expect(sold.every((a) => a.id.startsWith(`${bag}.`))).toBe(true);
    },
  );

  it('never plays a bag animation before its bag is open, and a shop one needs buying too', () => {
    const seen = (bags?: string[], unlocked?: string[]) => {
      const ids = new Set<string>();
      for (let i = 0; i < 1500; i++) {
        ids.add(V.pickIdle({ species: 'cat', wander: true, toys: true, bags, unlocked })?.id ?? '');
        ids.add(V.pick('thinking', { classic: false, species: 'cat', bags, unlocked })?.id ?? '');
      }
      return ids;
    };
    const locked = seen(['starter']);
    expect(ALL.filter((v) => v.bag && locked.has(v.id))).toEqual([]);
    const open = seen(['starter', 'garden']);
    expect(open.has('watering')).toBe(true);
    expect(open.has('flowers')).toBe(true);
    expect(open.has('buzz')).toBe(false);
    expect(seen(['starter', 'garden'], ['garden.idle.buzz']).has('buzz')).toBe(true);
    // Bought, but its bag isn't open (levels went back on): still locked.
    expect(seen(['starter'], ['garden.idle.buzz']).has('buzz')).toBe(false);
  });

  it('namespaces unlock ids by bag, keeping the starter bag as it was', () => {
    expect(V.unlockId('starter', 'idle', 'disco')).toBe('idle.disco');
    expect(V.unlockId(undefined, 'food', 'fish')).toBe('food.fish');
    expect(V.unlockId('garden', 'idle', 'buzz')).toBe('garden.idle.buzz');
  });
});
