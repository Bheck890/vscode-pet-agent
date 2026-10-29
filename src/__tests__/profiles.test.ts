import * as fs from 'fs';
import * as path from 'path';
import { parseProfile, sharable } from '../profiles';
import { slotId } from '../slot';
import { scoped } from '../storage';
import { makeSave, memory } from './save-helpers';

describe('slots', () => {
  it('turns the data from before there were saves into slot one, leaving the old keys', () => {
    const storage = memory();
    storage.data['petBag'] = { yarn: 3 };
    storage.data['petXp'] = { 'turn:a': { xp: 10, kind: 'turn', at: 5 } };
    storage.data['petTurns'] = { kept: 'as is' };
    const { slots, stores } = makeSave({ storage });
    const first = slots.current();
    expect(first).toEqual({ id: '2026-10-19-rusty', startedAt: 0 });
    expect(storage.data['petBag:2026-10-19-rusty']).toEqual({ yarn: 3 });
    expect(storage.data['petBag']).toEqual({ yarn: 3 });
    expect(storage.data['petTurns:2026-10-19-rusty']).toBeUndefined();
    expect(stores.bag.get()).toEqual({ yarn: 3 });
    expect(stores.progress.total()).toBe(10);
  });

  it('starts a fresh install from now, so older prompts earn nothing', () => {
    const { slots, progress, stores } = makeSave();
    const first = slots.current();
    expect(first).toEqual({
      id: '2026-10-19-rusty',
      startedAt: new Date(2026, 9, 19, 12).getTime(),
    });
    progress.agentDone('a1');
    progress.turns([
      {
        promptId: 'last-week',
        sessionId: 's',
        project: null,
        startedAt: new Date(2026, 9, 19, 9).getTime(),
        endedAt: new Date(2026, 9, 19, 10).getTime(),
        words: 3,
        chars: 20,
        actions: 2,
        subagents: 0,
        outputTokens: 5,
        outcome: 'done',
        preview: '',
      },
    ]);
    progress.record('busiest', new Date(2026, 9, 19, 10).getTime());
    expect(stores.progress.total()).toBe(5);
  });

  it('makes readable ids that never clash', () => {
    const day = new Date(2026, 0, 2);
    expect(slotId('Mr. Biscuit!', day, () => false)).toBe('2026-01-02-mr-biscuit');
    expect(slotId('', day, () => false)).toBe('2026-01-02-pet');
    const taken = new Set(['2026-01-02-pip', '2026-01-02-pip-2']);
    expect(slotId('Pip', day, (id) => taken.has(id))).toBe('2026-01-02-pip-3');
  });

  it('keeps each save under its own keys', () => {
    const storage = memory();
    let id = 'a';
    const s = scoped(storage, () => id);
    void s.update('petBag', { yarn: 1 });
    id = 'b';
    expect(s.get('petBag')).toBeUndefined();
    void s.update('petBag', { box: 1 });
    expect(storage.data).toEqual({ 'petBag:a': { yarn: 1 }, 'petBag:b': { box: 1 } });
  });
});

describe('profiles', () => {
  function played() {
    const s = makeSave();
    s.stores.bag.save({ yarn: 4, pumpkin: 1, sunflower: 2 });
    s.stores.bag.saveUnlocks(['idle.disco', 'garden.idle.buzz']);
    s.stores.house.save({ items: [{ id: 'bed', x: 0.3, y: 0, at: 1 }], theme: 'mint', themeAt: 2 });
    s.progress.agentDone('a1');
    return s;
  }

  it('starts over without keeping the save as a profile; holiday toys come along', () => {
    const s = played();
    const old = s.slots.current().id;
    s.profiles.startOver();
    expect(s.slots.current().id).not.toBe(old);
    expect(s.profiles.list()).toHaveLength(0);
    expect(fs.readdirSync(s.dir)).toHaveLength(0);
    expect(s.stores.bag.get()).toEqual({ pumpkin: 1 });
    expect(s.stores.progress.total()).toBe(0);
    expect(s.storage.data[`petBag:${old}`]).toEqual({ yarn: 4, pumpkin: 1, sunflower: 2 });
  });

  it('archives the save to a file that parses back the same', () => {
    const { profiles, dir, slots } = played();
    const p = profiles.archive(false);
    const file = path.join(dir, `${slots.current().id}.json`);
    const back = parseProfile(JSON.parse(fs.readFileSync(file, 'utf8')));
    expect(back).toEqual(p);
    expect(p).toMatchObject({
      id: '2026-10-19-rusty',
      name: "Rusty's first save",
      finished: false,
      pet: { species: 'fox', name: 'Rusty', style: 'flowerCrown' },
      bag: { found: { yarn: 4, pumpkin: 1, sunflower: 2 }, activeBag: 'starter' },
      // The jack-o-lantern is a holiday toy, which never counts towards the collection.
      summary: { level: 1, toys: 2, houses: 1, rooms: 1 },
    });
    expect(p.house.houses['starter']['living'].theme).toBe('mint');
  });

  it('remembers how complete the collection was, in the file and the index', () => {
    const s = played();
    s.stores.bag.setCompletion('all');
    const p = s.profiles.archive(true);
    s.slots.start({ id: 'next', startedAt: 1 });
    expect(s.profiles.load(p.id)?.complete).toBe('all');
    expect(s.profiles.list()[0].complete).toBe('all');
  });

  it('starts a new save at level 1, keeping only the holiday toys', () => {
    const s = played();
    s.setNow(new Date(2026, 9, 20, 9));
    const old = s.profiles.startNewSave(false);
    const slot = s.slots.current();
    expect(slot).toEqual({ id: '2026-10-20-rusty', startedAt: new Date(2026, 9, 20, 9).getTime() });
    expect(s.stores.bag.get()).toEqual({ pumpkin: 1 });
    expect(s.stores.bag.getUnlocks()).toEqual([]);
    expect(s.stores.progress.total()).toBe(0);
    expect(s.stores.house.get().houses).toEqual({});
    expect(s.stores.care.get(s.slots.current().startedAt)).toMatchObject({ fullness: 80 });
    // The old save's keys are left alone, and its profile is listed.
    expect(s.storage.data[`petBag:${old.id}`]).toEqual({ yarn: 4, pumpkin: 1, sunflower: 2 });
    expect(s.profiles.list().map((p) => p.id)).toEqual([old.id]);
  });

  it("can't be written into by an older save's counts once a new save starts", () => {
    const s = played();
    s.setNow(new Date(2026, 9, 20, 9));
    s.profiles.startNewSave(false);
    // A window still holding the old bag merges it in: it lands in the new slot's key...
    s.stores.bag.save({ yarn: 1 });
    expect(s.stores.bag.get()).toEqual({ pumpkin: 1, yarn: 1 });
    // ...and the old save's facts, dated before the new slot, pay nothing.
    s.progress.agentDone('late');
    const before = s.stores.progress.total();
    s.progress.outcome('s', { kind: 'test', ok: true, id: 'old', at: 1000 } as never);
    expect(s.stores.progress.total()).toBe(before);
  });

  it('never lists the save being played, and lists newest first with friends after', () => {
    const s = played();
    s.setNow(new Date(2026, 9, 20));
    s.profiles.startNewSave(false);
    s.setNow(new Date(2026, 9, 21));
    s.setLook({ name: 'Biscuit', species: 'dog' });
    s.stores.bag.save({ bone: 1 });
    s.profiles.startNewSave(true);
    const friend = makeSave();
    friend.setLook({ name: 'Pip', species: 'bird' });
    friend.stores.bag.save({ kite: 1 });
    const json = friend.profiles.exportJson(null)!;
    expect(s.profiles.importGuest(json).ok).toBe(true);
    expect(s.profiles.list().map((p) => [p.pet.name, !!p.guest, p.finished])).toEqual([
      ['Biscuit', false, true],
      ['Rusty', false, false],
      ['Pip', true, false],
    ]);
  });

  it('rebuilds the index from the folder when they disagree', () => {
    const s = played();
    const p = s.profiles.archive(true);
    delete s.storage.data['petProfiles'];
    s.setNow(new Date(2026, 9, 22));
    s.slots.start({ id: 'later', startedAt: 1 });
    expect(s.profiles.list().map((e) => e.id)).toEqual([p.id]);
    // A file that disappeared drops out.
    fs.unlinkSync(path.join(s.dir, `${p.id}.json`));
    expect(s.profiles.list()).toEqual([]);
  });

  it('hides a profile from the menu but keeps the file, and shows it again', () => {
    const s = played();
    const p = s.profiles.archive(false);
    s.slots.start({ id: 'next', startedAt: 1 });
    s.profiles.hide(p.id, false, true);
    expect(s.profiles.list()).toEqual([]);
    expect(s.profiles.list({ hidden: true })[0]).toMatchObject({ id: p.id, hidden: true });
    expect(fs.existsSync(path.join(s.dir, `${p.id}.json`))).toBe(true);
    // Hidden survives an index rebuild.
    fs.writeFileSync(path.join(s.dir, 'stray.json'), '{}');
    expect(s.profiles.list({ hidden: true })[0].hidden).toBe(true);
    s.profiles.hide(p.id, false, false);
    expect(s.profiles.list()[0].hidden).toBeUndefined();
  });

  it('renames a profile in its file and the index', () => {
    const s = played();
    const p = s.profiles.archive(false);
    s.slots.start({ id: 'next', startedAt: 1 });
    expect(s.profiles.rename(p.id, false, '  The fox years  ')).toBe(true);
    expect(s.profiles.load(p.id)?.name).toBe('The fox years');
    expect(s.profiles.list()[0].name).toBe('The fox years');
    expect(s.profiles.rename('nope', false, 'x')).toBe(false);
  });

  it('rejects a corrupt or foreign file whole, with no partial import', () => {
    const s = played();
    const before = JSON.stringify(s.storage.data);
    for (const junk of [
      'not json',
      '{"hello":"world"}',
      JSON.stringify({ version: 1, id: '../x' }),
    ]) {
      expect(s.profiles.importGuest(junk)).toEqual({ ok: false, reason: expect.any(String) });
    }
    expect(JSON.stringify(s.storage.data)).toBe(before);
    expect(fs.existsSync(path.join(s.dir, 'guests'))).toBe(false);
  });

  it('refuses a friend profile over 1 MB or from a newer version', () => {
    const s = played();
    const big = JSON.stringify({ version: 1, pad: 'x'.repeat(1024 * 1024) });
    expect(s.profiles.importGuest(big)).toEqual({
      ok: false,
      reason: expect.stringMatching(/1 MB/),
    });
    const newer = JSON.stringify({ ...JSON.parse(s.profiles.exportJson(null)!), version: 2 });
    expect(s.profiles.importGuest(newer)).toEqual({
      ok: false,
      reason: expect.stringMatching(/Update Pet Agents/),
    });
  });

  it('exports with no fact history, paths or repo names, and imports back the same', () => {
    const s = played();
    s.progress.turns([
      {
        promptId: 'secret-prompt',
        sessionId: 's',
        project: 'my-secret-repo',
        startedAt: 1,
        endedAt: new Date(2026, 9, 19, 13).getTime(),
        words: 3,
        chars: 20,
        actions: 2,
        subagents: 0,
        outputTokens: 5,
        outcome: 'done',
        preview: 'refactor C:\\Users\\me\\secret.ts',
      },
    ]);
    const json = s.profiles.exportJson(null)!;
    expect(json).not.toMatch(/secret|C:\\\\|Users|my-secret-repo/);
    const friend = makeSave();
    const result = friend.profiles.importGuest(json);
    expect(result.ok).toBe(true);
    const back = friend.profiles.load(s.slots.current().id, true);
    expect(back).toEqual(sharable(parseProfile(JSON.parse(json))!));
    expect(back?.summary.prompts).toBe(1);
  });

  it("keeps the rest of a friend's file when some items are unknown", () => {
    const s = played();
    const p = JSON.parse(s.profiles.exportJson(null)!);
    p.bag.found['Not A Toy'] = 3;
    p.bag.unlocks.push('x y z');
    p.house.houses['atlantis'] = { hall: { items: [] } };
    p.pet.style = 'tophat';
    const friend = makeSave();
    const result = friend.profiles.importGuest(JSON.stringify(p));
    expect(result.ok).toBe(true);
    const back = friend.profiles.load(p.id, true)!;
    expect(back.bag.found).toEqual({ yarn: 4, pumpkin: 1, sunflower: 2 });
    expect(back.bag.unlocks).toEqual(['idle.disco', 'garden.idle.buzz']);
    expect(Object.keys(back.house.houses)).toEqual(['starter']);
    expect(back.pet.style).toBe('');
  });

  it('replaces a friend with a newer copy, never an older one', () => {
    const friend = makeSave();
    const me = makeSave();
    const first = friend.profiles.exportJson(null)!;
    friend.setNow(new Date(2026, 9, 25));
    friend.stores.bag.save({ crown: 1 });
    const second = friend.profiles.exportJson(null)!;
    me.profiles.importGuest(second);
    me.profiles.importGuest(first);
    const id = friend.slots.current().id;
    expect(me.profiles.load(id, true)?.bag.found).toMatchObject({ crown: 1 });
    expect(me.profiles.list().filter((p) => p.guest)).toHaveLength(1);
  });
});
