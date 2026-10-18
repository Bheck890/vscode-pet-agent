import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

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
    rand?: () => number;
  }): Variant | null;
  shopActions(): Array<{ id: string; group: string; icon: string; label: string }>;
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
  spares(rarity: string): number;
  spend(rarity: string, n: number): boolean;
  bagList(): Array<{ id: string; count: number; out: boolean }>;
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
for (const file of ['pets.js', 'variants.js', 'scene.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(media, file), 'utf8'), sandbox);
}
const V = sandbox['PetVariants'] as VariantsApi;
const Art = sandbox['PetArt'] as { PROPS: Record<string, unknown> };
const PetScene = sandbox['PetScene'] as {
  create(api: object): SceneApi;
  TOYS: Array<{ id: string; rarity: string; kind: string }>;
  RARITY: Record<string, unknown>;
  PRICES: Record<string, Array<{ rarity: string; n: number }>>;
};

/** Must match the scenery names handled by scene.js. */
const SCENERY = ['box', 'bed', 'perch', 'wheel', 'surfboard', 'dish', 'chalkboard', 'books'];

describe('animation variants', () => {
  const STATES = [
    'sleeping',
    'waking',
    'thinking',
    'reading',
    'writing',
    'running',
    'testing',
    'browsing',
    'delegating',
    'waiting',
    'error',
    'done',
  ];

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

  function makeScene(config: Record<string, unknown>) {
    const saved: Array<Record<string, number>> = [];
    const spent: Array<Record<string, number>> = [];
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
    });
    return { scene, saved, spent };
  }

  it('has toys in every rarity', () => {
    for (const rarity of Object.keys(PetScene.RARITY)) {
      expect(PetScene.TOYS.some((t) => t.rarity === rarity)).toBe(true);
    }
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
    scene.setBag({ yarn: 3, dragon: 1 });
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
