import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { BAG_LEVELS } from '../bags';

interface Room {
  id: string;
  kind: string;
}
interface HouseApi {
  setOpen(on: boolean): void;
  setLevel(n: number): void;
  setReadOnly(on: boolean): void;
  setLayout(layout: object): void;
  layout(): {
    at: { house: string; room: string };
    houses: Record<string, Record<string, unknown>>;
  };
  toggle(id: string): void;
  setTheme(id: string): void;
  goTo(house: string, room?: string): boolean;
  step(dir: number): void;
  target(state: string): number | null;
  kind(): string | null;
  pointerDown(x: number, y: number): boolean;
  drawBack(): void;
  catalogue(): {
    house: { id: string };
    room: Room;
    rooms: Array<Room & { unlocked: boolean }>;
    furniture: Array<{ id: string; unlocked: boolean; how: string }>;
    themes: Array<{ id: string; unlocked: boolean; active: boolean }>;
  };
}

const media = path.join(process.cwd(), 'media');
const sandbox: Record<string, unknown> = {};
for (const file of ['pets.js', 'states.js', 'variants.js', 'scene.js', 'house.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(media, file), 'utf8'), sandbox);
}
const PetHouse = sandbox['PetHouse'] as {
  create(api: object): HouseApi;
  HOUSES: Array<{ id: string; rooms: Room[]; window: string }>;
  FURNITURE: Array<{ id: string; bag?: string; free?: boolean; nap?: boolean; eat?: boolean }>;
  THEMES: Array<{ id: string; bag?: string; free?: boolean }>;
};

function makeHouse(opts: { bags?: string[]; unlocks?: string[]; levels?: boolean } = {}) {
  const saved: Array<{ at: { house: string; room: string } }> = [];
  const ctx = new Proxy({}, { get: () => () => undefined });
  const house = PetHouse.create({
    ctx,
    main: () => ({ x: 100, y: 100, scale: 6 }),
    petPx: () => 192,
    view: () => ({ w: 1000, h: 600 }),
    now: () => 1000,
    config: () => ({ levels: opts.levels !== false, house: true }),
    season: () => 'summer',
    save: (layout: { at: { house: string; room: string } }) =>
      saved.push(JSON.parse(JSON.stringify(layout))),
    bags: () => opts.bags ?? ['starter'],
    unlocks: () => opts.unlocks ?? [],
    toysOut: () => [],
  });
  house.setOpen(true);
  house.setLevel(30);
  return { house, saved };
}

function withItems(house: string, room: string, items: Array<{ id: string; x: number }>) {
  return {
    at: { house, room, changedAt: 1 },
    houses: {
      [house]: { [room]: { items: items.map((i) => ({ ...i, y: 0, at: 1 })), theme: '' } },
    },
  };
}

describe('houses', () => {
  it('has one house per bag with the same rooms as the extension', () => {
    expect(PetHouse.HOUSES.map((h) => [h.id, h.rooms.map((r) => r.id)])).toEqual(
      BAG_LEVELS.map((b) => [b.id, b.rooms]),
    );
    for (const h of PetHouse.HOUSES) {
      for (const r of h.rooms) {
        expect(['bed', 'food', 'play', 'living']).toContain(r.kind);
      }
      expect(['square', 'glass', 'round', 'arch']).toContain(h.window);
    }
  });

  it('gives each themed bag 3 free pieces of furniture and sells 3, with unique ids', () => {
    const ids = PetHouse.FURNITURE.map((f) => f.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    for (const b of BAG_LEVELS.slice(1)) {
      const mine = PetHouse.FURNITURE.filter((f) => f.bag === b.id);
      expect([b.id, mine.filter((f) => f.free).length, mine.filter((f) => !f.free).length]).toEqual(
        [b.id, 3, 3],
      );
    }
  });

  it('gives each themed bag a free room theme and sells two more, with unique ids', () => {
    const ids = PetHouse.THEMES.map((t) => t.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    for (const b of BAG_LEVELS.slice(1)) {
      const mine = PetHouse.THEMES.filter((t) => t.bag === b.id);
      expect([b.id, mine.filter((t) => t.free).length, mine.length]).toEqual([b.id, 1, 3]);
    }
  });

  it("can't enter a locked house or room; a bought room opens", () => {
    const { house } = makeHouse({ bags: ['starter', 'garden'] });
    expect(house.goTo('ocean')).toBe(false);
    expect(house.goTo('garden', 'patch')).toBe(false);
    expect(house.goTo('garden', 'shed')).toBe(true);
    expect(house.catalogue().room.id).toBe('shed');
    const bought = makeHouse({ bags: ['starter', 'garden'], unlocks: ['garden.room.patch'] });
    expect(bought.house.goTo('garden', 'patch')).toBe(true);
    expect(makeHouse().house.goTo('starter', 'kitchen')).toBe(false);
    expect(makeHouse({ unlocks: ['room.kitchen'] }).house.goTo('starter', 'kitchen')).toBe(true);
  });

  it('saves where you are and what each room holds, room by room', () => {
    const { house, saved } = makeHouse({ bags: ['starter', 'garden'] });
    house.toggle('bed');
    house.goTo('garden', 'greenhouse');
    house.toggle('flowerpot');
    house.setTheme('leafy');
    const last = saved[saved.length - 1] as unknown as ReturnType<HouseApi['layout']>;
    expect(last.at).toMatchObject({ house: 'garden', room: 'greenhouse' });
    expect(Object.keys(last.houses).sort()).toEqual(['garden', 'starter']);
    expect(last.houses['garden']['greenhouse']).toMatchObject({ theme: 'leafy' });
    // The arrows step through the open rooms.
    house.step(1);
    expect(house.catalogue().room.id).toBe('shed');
    house.step(1);
    expect(house.catalogue().room.id).toBe('greenhouse');
  });

  it("only offers a locked bag's furniture once its bag is open, and its sold pieces once bought", () => {
    const shut = makeHouse().house.catalogue();
    expect(shut.furniture.some((f) => f.id === 'flowerpot')).toBe(false);
    const open = makeHouse({ bags: ['starter', 'garden'] }).house.catalogue();
    expect(open.furniture.find((f) => f.id === 'flowerpot')).toMatchObject({ unlocked: true });
    expect(open.furniture.find((f) => f.id === 'fountain')).toMatchObject({
      unlocked: false,
      how: expect.stringContaining('Garden'),
    });
  });

  it.each([
    ['bedroom', 'idle', 0.7],
    ['bedroom', 'sleeping', 0.7],
    ['kitchen', 'idle', 0.2],
    ['kitchen', 'sleeping', 0.7],
    ['living', 'sleeping', 0.7],
    ['living', 'idle', null],
    ['yard', 'idle', null],
  ])('in the %s a %s pet heads for the right furniture', (room, state, x) => {
    const { house } = makeHouse({ unlocks: ['room.kitchen', 'room.yard'] });
    house.setLayout(
      withItems('starter', room, [
        { id: 'bed', x: 0.7 },
        { id: 'bowl', x: 0.2 },
      ]),
    );
    expect(house.target(state)).toBe(x === null ? null : x * 1000);
  });

  it('lets the pet wander when nothing suitable is placed', () => {
    const { house } = makeHouse({ unlocks: ['room.kitchen'] });
    house.setLayout(withItems('starter', 'kitchen', [{ id: 'sofa', x: 0.4 }]));
    expect(house.target('idle')).toBeNull();
    expect(house.target('sleeping')).toBeNull();
    expect(house.kind()).toBe('food');
  });

  it('draws every house and window without errors', () => {
    const { house } = makeHouse({ levels: false, bags: BAG_LEVELS.map((b) => b.id) });
    for (const b of BAG_LEVELS) {
      expect(house.goTo(b.id)).toBe(true);
      expect(() => house.drawBack()).not.toThrow();
    }
  });

  it('a visited old house can be looked round but never changed or saved', () => {
    const { house, saved } = makeHouse({ bags: ['starter', 'garden'] });
    house.setReadOnly(true);
    house.setLayout(withItems('starter', 'living', [{ id: 'bed', x: 0.5 }]));
    house.toggle('sofa');
    house.setTheme('mint');
    expect(house.pointerDown(500, 260)).toBe(false);
    house.setReadOnly(false);
    expect(house.pointerDown(500, 260)).toBe(true);
    house.setReadOnly(true);
    expect(house.goTo('garden', 'shed')).toBe(true);
    expect(saved).toEqual([]);
  });
});
