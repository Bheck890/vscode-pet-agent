import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RecordsStore } from '../records-store';
import { PetUi, SHARE_SITES, SaveFlows, shareText } from '../save-flows';
import type { TurnRecord } from '../turn-tracker';
import { makeSave } from './save-helpers';

const PASSWORD = 'tr0ub4dor&3';

function ui(answers: {
  confirm?: boolean;
  ask?: Array<string | undefined>;
  choose?: string;
  file?: string;
}) {
  const calls: string[] = [];
  const u: PetUi = {
    confirm: jest.fn(async (m: string) => (calls.push(m), answers.confirm ?? true)),
    ask: jest.fn(async () => (answers.ask ?? []).shift()),
    choose: jest.fn(async (_t: string, options: string[]) => answers.choose ?? options[0]),
    saveFile: jest.fn(async () => answers.file),
    openFile: jest.fn(async () => answers.file),
    copy: jest.fn(async () => undefined),
    openUrl: jest.fn(async () => true),
    info: jest.fn(),
    error: jest.fn(),
  };
  return { ui: u, calls };
}

function turn(over: Partial<TurnRecord> = {}): TurnRecord {
  return {
    promptId: 'p1',
    sessionId: 's',
    project: 'secret-repo',
    startedAt: new Date(2026, 9, 19, 10).getTime(),
    endedAt: new Date(2026, 9, 19, 11).getTime(),
    words: 2,
    chars: 9,
    actions: 3,
    subagents: 0,
    outputTokens: 1,
    outcome: 'done',
    preview: 'the secret prompt text',
    ...over,
  };
}

function setup(answers: Parameters<typeof ui>[0] = {}) {
  const s = makeSave();
  const records = new RecordsStore(s.storage);
  const { ui: u, calls } = ui(answers);
  const log = { info: jest.fn(), warn: jest.fn() };
  const saveSetting = jest.fn(() => Promise.resolve());
  const saveChanged = jest.fn();
  const flows = new SaveFlows({
    profiles: s.profiles,
    progress: s.progress,
    records,
    slots: s.slots,
    ui: u,
    look: () => s.profiles.current(false).pet,
    saveSetting,
    companion: () => 'pet',
    now: () => new Date(2026, 9, 19, 12),
    log,
    saveChanged,
    profilesChanged: jest.fn(),
  });
  return { ...s, records, ui: u, calls, log, saveSetting, saveChanged, flows };
}

const tmpFile = (name: string) =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pet-move-')), name);

/** Level 100 (495,000 XP) and the 💯 collection: what a save needs to become a new profile. */
function ready(t: ReturnType<typeof setup>, complete = true) {
  t.stores.progress.add('grind', { xp: 495000, kind: 'test', at: Date.now() }, new Date());
  if (complete) {
    t.stores.bag.setCompletion('all');
  }
}

describe('new save', () => {
  it('only opens at level 100 with the full collection', async () => {
    const t = setup();
    const slot = t.slots.current().id;
    await t.flows.newSave();
    expect(t.ui.info).toHaveBeenCalledWith(
      expect.stringMatching(/level 100 .*this one is level 1/),
    );
    ready(t, false);
    await t.flows.newSave();
    expect(t.ui.info).toHaveBeenLastCalledWith(expect.stringMatching(/💯 collection/));
    expect(t.ui.confirm).not.toHaveBeenCalled();
    expect(t.slots.current().id).toBe(slot);
    t.stores.bag.setCompletion('all');
    await t.flows.newSave();
    expect(t.slots.current().id).not.toBe(slot);
  });

  it('asks first, and cancelling changes nothing', async () => {
    const t = setup({ confirm: false });
    ready(t);
    t.stores.bag.save({ yarn: 1 });
    const slot = t.slots.current().id;
    await t.flows.newSave();
    expect(t.calls[0]).toMatch(/new save/i);
    expect(t.slots.current().id).toBe(slot);
    expect(t.saveChanged).not.toHaveBeenCalled();
  });

  it('archives the save and starts a fresh one', async () => {
    const t = setup();
    ready(t);
    t.stores.bag.save({ yarn: 1 });
    await t.flows.newSave();
    expect(t.profiles.list()).toHaveLength(1);
    expect(t.stores.bag.get()).toEqual({});
    expect(t.saveChanged).toHaveBeenCalled();
  });
});

describe('switching saves', () => {
  /** A save with 5 XP archived by starting a new one; returns its id. */
  async function archived(t: ReturnType<typeof setup>) {
    ready(t);
    t.progress.agentDone('old');
    const id = t.slots.current().id;
    await t.flows.newSave();
    return id;
  }

  it('carries on with an old save where it left off, keeping the one being played', async () => {
    const t = setup();
    const old = await archived(t);
    // The save being played made it to level 100 too, so it can become a profile.
    ready(t);
    const accidental = t.slots.current().id;
    expect(t.profiles.list().map((p) => p.id)).toEqual([old]);
    await t.flows.playSave(old);
    expect(t.slots.current().id).toBe(old);
    expect(t.stores.progress.total()).toBe(495005);
    expect(t.profiles.list().map((p) => p.id)).toEqual([accidental]);
    expect(t.saveSetting).toHaveBeenCalledWith('name', 'Rusty');
    expect(t.saveChanged).toHaveBeenCalled();
  });

  it('can leave the save being played out of the menu; its data stays in storage', async () => {
    const t = setup({ choose: "Leave Rusty's save out of the house menu" });
    const old = await archived(t);
    t.progress.agentDone('new');
    const accidental = t.slots.current().id;
    await t.flows.playSave(old);
    expect(t.slots.current().id).toBe(old);
    expect(t.profiles.list()).toEqual([]);
    expect(t.storage.data[`petXp:${accidental}`]).toBeDefined();
  });

  it('picks from a list when no save is named, and says so when there is none', async () => {
    const none = setup();
    await none.flows.playSave();
    expect(none.ui.info).toHaveBeenCalledWith(expect.stringMatching(/no other saves/));
    const t = setup();
    const old = await archived(t);
    await t.flows.playSave();
    expect(t.ui.choose).toHaveBeenCalledWith('Switch to which save?', [
      expect.stringMatching(/^Rusty the fox - level 100 - /),
    ]);
    expect(t.slots.current().id).toBe(old);
  });

  it("won't resume a save that moved to another computer", async () => {
    const t = setup();
    t.progress.agentDone('old');
    const moved = t.slots.current().id;
    t.profiles.startNewSave(false, true);
    const here = t.slots.current().id;
    await t.flows.playSave(moved);
    expect(t.ui.error).toHaveBeenCalledWith(expect.stringMatching(/moved to another computer/));
    expect(t.slots.current().id).toBe(here);
  });

  it("switches to the helper for a helper's save, with the helper's own settings", async () => {
    const t = setup();
    t.setLook({ species: 'wizard', name: 'Alder', style: '' });
    const old = await archived(t);
    await t.flows.playSave(old);
    expect(t.saveSetting).toHaveBeenCalledWith('companion', 'helper');
    expect(t.saveSetting).toHaveBeenCalledWith('helper', 'wizard');
    expect(t.saveSetting).toHaveBeenCalledWith('helperName', 'Alder');
    expect(t.saveSetting).not.toHaveBeenCalledWith('style', expect.anything());
  });
});

describe('starting over', () => {
  it('starts straight over when there is nothing to lose', async () => {
    const t = setup();
    const slot = t.slots.current().id;
    await t.flows.startOver();
    expect(t.ui.choose).not.toHaveBeenCalled();
    expect(t.slots.current().id).not.toBe(slot);
    expect(t.profiles.list()).toHaveLength(0);
    expect(t.saveChanged).toHaveBeenCalled();
  });

  it('only offers to start over without keeping a save below level 100', async () => {
    const t = setup();
    t.progress.agentDone('a1');
    await t.flows.startOver();
    expect(t.ui.choose).toHaveBeenCalledWith(expect.stringMatching(/New saves open at level 100/), [
      "Start over without keeping Rusty's save",
    ]);
    expect(t.profiles.list()).toHaveLength(0);
    expect(t.stores.progress.total()).toBe(0);
  });

  it('lets a switched-back save be kept again, since it is a profile already', async () => {
    const t = setup();
    ready(t);
    t.progress.agentDone('a1');
    const old = t.slots.current().id;
    await t.flows.newSave();
    await t.flows.playSave(old);
    // Back on the old save, below nothing new: keeping it just updates its profile.
    t.stores.bag.setCompletion('');
    t.progress.agentDone('a2');
    await t.flows.startOver();
    expect(t.ui.choose).toHaveBeenLastCalledWith(expect.any(String), [
      "Keep Rusty's save as a profile to visit",
      "Start over without keeping Rusty's save",
    ]);
  });

  it('keeps the old save as a profile, or leaves it out, as asked', async () => {
    const keep = setup();
    ready(keep);
    keep.progress.agentDone('a1');
    await keep.flows.startOver();
    expect(keep.profiles.list()).toHaveLength(1);
    expect(keep.stores.progress.total()).toBe(0);

    const drop = setup({ choose: "Start over without keeping Rusty's save" });
    drop.progress.agentDone('a1');
    await drop.flows.startOver();
    expect(drop.profiles.list()).toHaveLength(0);
    expect(drop.stores.progress.total()).toBe(0);
  });

  it('changes nothing when cancelled', async () => {
    const t = setup({ choose: '' });
    t.progress.agentDone('a1');
    const slot = t.slots.current().id;
    await t.flows.startOver();
    expect(t.slots.current().id).toBe(slot);
    expect(t.saveChanged).not.toHaveBeenCalled();
  });
});

describe('sharing', () => {
  it('shares numbers only: no prompt text, file names or repo names', async () => {
    const t = setup();
    // After the save started (12:00), so it counts.
    const t1 = turn({
      startedAt: new Date(2026, 9, 19, 12).getTime(),
      endedAt: new Date(2026, 9, 19, 13).getTime(),
    });
    t.records.add([t1], new Date(2026, 9, 19, 13));
    t.progress.turns([t1]);
    const text = t.flows.summaryText(412);
    expect(text).toContain('Rusty the fox');
    expect(text).toContain('1 prompts - 3 actions');
    expect(text).toMatch(/\/412 toys/);
    expect(text).not.toMatch(/secret|\.ts|repo/);
    await t.flows.copySummary(412);
    expect(t.ui.copy).toHaveBeenCalledWith(text);
  });

  it('opens a pre-filled post only when asked', async () => {
    const t = setup();
    await t.flows.post('bluesky', 10);
    expect(t.ui.openUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/bsky\.app\/intent/),
    );
    expect(SHARE_SITES.x('hi there')).toBe('https://x.com/intent/post?text=hi%20there');
  });

  it('marks a collection of every toy, but not every shop item, with a tick', () => {
    const summary = {
      days: 1,
      level: 5,
      xp: 1000,
      prompts: 1,
      actions: 1,
      agentHours: 0,
      toys: 60,
      bags: 5,
      houses: 1,
      rooms: 1,
      records: 0,
    };
    const look = { name: 'Rusty', species: 'fox' };
    expect(shareText(look, summary, false, 60, 'items').split('\n').pop()).toBe('🧸✅ 🎒x5 ⭐x5');
    expect(shareText(look, summary, false, 60).split('\n').pop()).toBe('🎒x5 ⭐x5');
  });

  it('marks a finished save and a complete collection', () => {
    const summary = {
      days: 412,
      level: 35,
      xp: 61240,
      prompts: 2318,
      actions: 9870,
      agentHours: 214,
      toys: 412,
      bags: 20,
      houses: 20,
      rooms: 57,
      records: 31,
    };
    const text = shareText({ name: 'Rusty', species: 'fox' }, summary, true, 412, 'all');
    expect(text.split('\n')).toEqual([
      '🏆 I finished Pet Agents!',
      'Rusty the fox - 412 days - level 35 - 61,240 XP',
      '2,318 prompts - 9,870 actions - 214h with my agent',
      '🧸 412/412 toys - 🏠 20 houses, 57 rooms - 🏆 31 weekly records',
      '🏁 💯 🎒x20 ⭐x35',
    ]);
  });
});

describe('moving to another computer', () => {
  it('only lets go of the pet here once the file is written and read back', async () => {
    const file = tmpFile('Rusty.petsave');
    const t = setup({ ask: [PASSWORD, PASSWORD], file });
    t.stores.bag.save({ yarn: 2 });
    const slot = t.slots.current().id;
    await t.flows.moveOut();
    expect(fs.existsSync(file)).toBe(true);
    expect(t.slots.current().id).not.toBe(slot);
    expect(t.profiles.load(slot)).toMatchObject({ moved: true });
    expect(t.stores.bag.get()).toEqual({});
  });

  it('changes nothing if the file cannot be written', async () => {
    const t = setup({
      ask: ['', undefined],
      file: path.join(os.tmpdir(), 'no-such-dir', 'x', 'a.petsave'),
    });
    t.stores.bag.save({ yarn: 2 });
    const slot = t.slots.current().id;
    await t.flows.moveOut();
    expect(t.slots.current().id).toBe(slot);
    expect(t.stores.bag.get()).toEqual({ yarn: 2 });
    expect(t.ui.error).toHaveBeenCalled();
  });

  it('cancels on a short or mismatched password', async () => {
    for (const ask of [['short'], [PASSWORD, 'different!!']]) {
      const t = setup({ ask, file: tmpFile('a.petsave') });
      const slot = t.slots.current().id;
      await t.flows.moveOut();
      expect(t.slots.current().id).toBe(slot);
      expect(t.ui.saveFile).not.toHaveBeenCalled();
    }
  });

  it('never puts the password in storage or the log', async () => {
    const t = setup({ ask: [PASSWORD, PASSWORD], file: tmpFile('a.petsave') });
    const update = jest.spyOn(t.storage, 'update');
    await t.flows.moveOut();
    const stored = JSON.stringify(update.mock.calls);
    const logged = JSON.stringify([t.log.info.mock.calls, t.log.warn.mock.calls]);
    expect(stored).not.toContain(PASSWORD);
    expect(logged).not.toContain(PASSWORD);
  });

  it('brings the pet in on the other computer, look and records too', async () => {
    const file = tmpFile('Rusty.petsave');
    const out = setup({ ask: [PASSWORD, PASSWORD], file });
    out.stores.bag.save({ yarn: 2, crab: 1 });
    out.progress.agentDone('a1');
    out.records.add([turn()], new Date(2026, 9, 19, 12));
    const movedSlot = out.slots.current();
    await out.flows.moveOut();

    const into = setup({ ask: [PASSWORD], file });
    await into.flows.moveIn();
    expect(into.slots.current()).toEqual(movedSlot);
    expect(into.stores.bag.get()).toEqual({ yarn: 2, crab: 1 });
    expect(into.stores.progress.total()).toBe(5);
    expect(into.records.turns()[0].preview).toBe('the secret prompt text');
    expect(into.saveSetting).toHaveBeenCalledWith('species', 'fox');
    expect(into.saveSetting).toHaveBeenCalledWith('style', 'flowerCrown');
    expect(into.saveChanged).toHaveBeenCalled();
  });

  it('without a password, prompt previews stay behind', async () => {
    const file = tmpFile('a.petsave');
    const out = setup({ ask: [''], file });
    out.records.add([turn()], new Date(2026, 9, 19, 12));
    await out.flows.moveOut();
    expect(fs.readFileSync(file, 'utf8')).not.toContain('secret prompt');
    const into = setup({ file });
    await into.flows.moveIn();
    expect(into.records.turns()[0].preview).toBe('');
  });

  it('says wrong password, and changes nothing', async () => {
    const file = tmpFile('a.petsave');
    await setup({ ask: [PASSWORD, PASSWORD], file }).flows.moveOut();
    const into = setup({ ask: ['nope nope nope'], file });
    into.stores.bag.save({ bone: 1 });
    const before = JSON.stringify(into.storage.data);
    await into.flows.moveIn();
    expect(into.ui.error).toHaveBeenCalledWith(expect.stringMatching(/wrong password/i));
    expect(JSON.stringify(into.storage.data)).toBe(before);
  });

  it('asks before replacing a save with progress, and keeps it as a profile', async () => {
    const file = tmpFile('a.petsave');
    await setup({ ask: [''], file }).flows.moveOut();
    const no = setup({ file, confirm: false });
    no.stores.bag.save({ bone: 1 });
    const mine = no.slots.current().id;
    await no.flows.moveIn();
    expect(no.slots.current().id).toBe(mine);

    const yes = setup({ file });
    yes.setLook({ name: 'Biscuit' });
    yes.stores.bag.save({ bone: 1 });
    await yes.flows.moveIn();
    expect(yes.calls.some((c) => /Keep Biscuit as a profile and bring Rusty here/.test(c))).toBe(
      true,
    );
    expect(yes.profiles.list().map((p) => p.pet.name)).toContain('Biscuit');
  });

  it('refuses a file from a newer Pet Agents', async () => {
    const file = tmpFile('a.petsave');
    await setup({ ask: [''], file }).flows.moveOut();
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...raw, version: 9 }));
    const into = setup({ file });
    await into.flows.moveIn();
    expect(into.ui.error).toHaveBeenCalledWith(expect.stringMatching(/Update Pet Agents first/));
  });

  it('bringing the same pet back keeps whichever copy is newer', async () => {
    const file = tmpFile('a.petsave');
    const t = setup({ ask: ['', ''], file });
    t.stores.bag.save({ yarn: 2 });
    const slot = t.slots.current();
    await t.flows.moveOut();
    // Back on the first computer, the moved profile is here and the file is the same age.
    await t.flows.moveIn();
    expect(t.slots.current()).toEqual(slot);
    expect(t.stores.bag.get()).toEqual({ yarn: 2 });
  });
});
