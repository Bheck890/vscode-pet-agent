import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

interface Outfit {
  id: string;
  name: string;
  costume: string;
  fur?: string;
  alpha?: number;
  float?: boolean;
}
interface EventsApi {
  set(cal: { day: string; events: string[]; season: string }): void;
  outfit(): Outfit;
  costume(): string;
  label(): string;
  drawBack(): void;
  update(t: number): void;
}

const sandbox: Record<string, unknown> = {};
for (const file of ['pets.js', 'events.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), 'media', file), 'utf8'), sandbox);
}
const PetEvents = sandbox['PetEvents'] as {
  create(api: object): EventsApi;
  EVENTS: Record<string, { outfits: Outfit[]; decor: Array<{ floor: string[]; hang: string[] }> }>;
};
const COSTUMES = (sandbox['PetArt'] as { COSTUMES: Record<string, unknown> }).COSTUMES;

/** One window's events helper, with a holiday on. */
function windowOn(event: string, holidays = true) {
  const said: string[] = [];
  const ev = PetEvents.create({
    ctx: new Proxy({}, { get: () => () => undefined }),
    main: () => ({ x: 100, y: 60, scale: 6, name: 'Rusty' }),
    petPx: () => 192,
    view: () => ({ w: 500, h: 500 }),
    now: () => 0,
    emit: () => undefined,
    config: () => ({ holidays }),
    say: (text: string) => said.push(text),
  });
  ev.set({ day: '2026-12-25', events: [event], season: 'winter' });
  return { ev, said };
}

describe('holiday outfits and decorations', () => {
  it.each(Object.keys(PetEvents.EVENTS))(
    '%s has 3 or more outfits and 2 or more decoration sets, all drawable',
    (id) => {
      const { outfits, decor } = PetEvents.EVENTS[id];
      expect(outfits.length).toBeGreaterThanOrEqual(3);
      for (const o of outfits) {
        expect([o.id, o.costume in COSTUMES]).toEqual([o.id, true]);
      }
      expect(decor.length).toBeGreaterThanOrEqual(2);
      for (const d of decor) {
        expect(d.floor).toHaveLength(4);
        expect(d.hang.length).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it('dresses the pet as Santa, an elf, a reindeer or a snowman for Christmas', () => {
    expect(PetEvents.EVENTS['christmas'].outfits.map((o) => o.id)).toEqual([
      'santa',
      'elf',
      'reindeer',
      'snowman',
    ]);
    const ghost = PetEvents.EVENTS['halloween'].outfits.find((o) => o.id === 'ghost')!;
    expect(ghost).toMatchObject({ fur: '#eef0ff', float: true });
    expect(ghost.alpha).toBeLessThan(1);
  });

  it('picks an outfit and decorations when a window opens, keeping them while it is open', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const { ev } = windowOn('christmas');
      const first = ev.outfit().id;
      for (let j = 0; j < 5; j++) {
        expect(ev.outfit().id).toBe(first);
      }
      expect(ev.costume()).toBe(ev.outfit().costume);
      seen.add(first);
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('says what the pet is dressed as', () => {
    const { ev, said } = windowOn('halloween');
    ev.update(0);
    expect(said[0]).toBe(`🎃 Happy Halloween! Rusty is dressed as ${ev.outfit().name}`);
    expect(ev.label()).toBe(`🎃 Halloween (dressed as ${ev.outfit().name})`);
    expect(() => ev.drawBack()).not.toThrow();
  });

  it('wears nothing with holidays switched off', () => {
    const { ev } = windowOn('christmas', false);
    expect(ev.costume()).toBe('');
    expect(ev.outfit().fur).toBeUndefined();
  });
});
