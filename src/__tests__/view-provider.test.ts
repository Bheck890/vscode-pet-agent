jest.mock(
  'vscode',
  () => ({
    Uri: { file: (fsPath: string) => ({ fsPath }) },
    window: { showErrorMessage: jest.fn() },
    Disposable: class Disposable {
      constructor(private readonly fn: () => void) {}
      dispose(): void {
        this.fn();
      }
    },
  }),
  { virtual: true },
);

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PeonViewProvider } from '../PeonViewProvider';
import { CareStore } from '../pet-care';
import type { Storage } from '../storage';
import { BagStore } from '../bag-store';
import { HouseStore } from '../house-store';
import { ProgressService } from '../progress-service';
import { ProgressStore } from '../progress-store';
import { RecordsService } from '../records-service';
import { RecordsStore } from '../records-store';
import { peonGuide } from '../peon-guide';
import { readPetConfig } from '../pet-config';
import { LOOK_KEYS, PetLook, Profiles } from '../profiles';
import { PetUi, SaveFlows } from '../save-flows';
import { Slots } from '../slot';
import { Visitors } from '../visitors';
import type { StateWatcher } from '../state-watcher';
import type { ClaudeWatcher, ClaudeUpdate } from '../claude-watcher';

type Fn = (arg: unknown) => void;

function memory(): Storage & { data: Record<string, unknown> } {
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

/** Watchers that count live listeners and let the test fire events. */
function fakeWatchers(latest: ClaudeUpdate | null = null) {
  const listeners = { peon: new Set<Fn>(), session: new Set<Fn>(), claude: new Set<Fn>() };
  const add = (set: Set<Fn>) => (fn: Fn) => {
    set.add(fn);
    return { dispose: () => set.delete(fn) };
  };
  const peon = { onPeonEvent: add(listeners.peon), onSessionUpdate: add(listeners.session) };
  const claude = {
    onUpdate: add(listeners.claude),
    latest: () => latest,
    ownsDir: (dir: string | null) => dir === '/work/app',
  };
  return {
    listeners,
    peon: peon as unknown as StateWatcher,
    claude: claude as unknown as ClaudeWatcher,
  };
}

function fakeView() {
  const posted: Array<Record<string, unknown>> = [];
  let onMessage: Fn = () => undefined;
  let onDispose: () => void = () => undefined;
  const webview = {
    options: undefined as unknown,
    html: '',
    cspSource: 'vscode-resource:',
    asWebviewUri: (u: { fsPath: string }) => ({ toString: () => `vscode-resource:${u.fsPath}` }),
    postMessage: (m: Record<string, unknown>) => {
      posted.push(m);
      return Promise.resolve(true);
    },
    onDidReceiveMessage: (fn: Fn) => {
      onMessage = fn;
      return { dispose: () => undefined };
    },
  };
  const view = {
    webview,
    visible: true,
    onDidChangeVisibility: () => ({ dispose: () => undefined }),
    onDidDispose: (fn: () => void) => {
      onDispose = fn;
      return { dispose: () => undefined };
    },
  };
  return {
    view,
    webview,
    posted,
    send: (m: unknown) => onMessage(m),
    close: () => onDispose(),
    last: (command: string) => [...posted].reverse().find((m) => m.command === command),
  };
}

const MEDIA = path.join(process.cwd(), 'media');
/** The save every setup() plays: today's date and the pet's name. */
const SLOT = '2026-10-30-mochi';

/** Dialogs that answer as told; `asked` records every prompt. */
function fakeUi(
  answers: { confirm?: boolean; ask?: string[]; choose?: string; file?: string } = {},
) {
  const asked: string[] = [];
  const ui: PetUi & { asked: string[] } = {
    asked,
    confirm: jest.fn(async (m: string) => {
      asked.push(m);
      return answers.confirm ?? true;
    }),
    ask: jest.fn(async (m: string) => {
      asked.push(m);
      return (answers.ask ?? []).shift();
    }),
    choose: jest.fn(async () => answers.choose),
    saveFile: jest.fn(async () => answers.file),
    openFile: jest.fn(async () => answers.file),
    copy: jest.fn(async () => undefined),
    openUrl: jest.fn(async () => true),
    info: jest.fn(),
    error: jest.fn(),
  };
  return ui;
}

function setup(
  opts: {
    latest?: ClaudeUpdate | null;
    state?: unknown;
    settings?: object;
    ui?: Parameters<typeof fakeUi>[0];
  } = {},
) {
  const watchers = fakeWatchers(opts.latest ?? null);
  const careStorage = memory();
  const bagStorage = memory();
  const saveSetting = jest.fn(() => Promise.resolve());
  const log = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    show: jest.fn(),
  };
  const settings: Record<string, unknown> = { species: 'cat', name: 'Mochi', ...opts.settings };
  const now = () => new Date(2026, 9, 30, 12);
  const gameStorage = memory();
  const recordsStore = new RecordsStore(gameStorage);
  const records = new RecordsService(recordsStore, gameStorage, now);
  const slots = new Slots(gameStorage, now, () => 'Mochi');
  const progressStore = new ProgressStore(gameStorage);
  const progress = new ProgressService(progressStore, now, () => slots.current());
  const getConfig = () => readPetConfig((k) => settings[k]);
  const look = () =>
    Object.fromEntries(LOOK_KEYS.map((k) => [k, getConfig()[k]])) as unknown as PetLook;
  const stores = {
    bag: new BagStore(bagStorage),
    house: new HouseStore(gameStorage),
    care: new CareStore(careStorage),
    progress: progressStore,
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-profiles-'));
  const profiles = new Profiles({
    storage: gameStorage,
    dir,
    slots,
    stores,
    look,
    levelsOn: () => getConfig().levels,
    now,
  });
  const ui = fakeUi(opts.ui);
  const refresh = jest.fn();
  const flows = new SaveFlows({
    profiles,
    progress,
    records: recordsStore,
    slots,
    ui,
    look,
    saveSetting,
    companion: () => 'pet',
    now,
    log,
    saveChanged: refresh,
    profilesChanged: refresh,
  });
  const visitors = new Visitors(gameStorage, stores.care, () => []);
  const customize = jest.fn();
  const copy = jest.fn();
  const provider = new PeonViewProvider({
    mediaPath: MEDIA,
    peon: watchers.peon,
    claude: watchers.claude,
    getConfig,
    now,
    ...stores,
    records,
    progress,
    slots,
    profiles,
    flows,
    visitors,
    saveSetting,
    customize,
    peonGuide: () => peonGuide('linux', false),
    copy,
    log,
  });
  const v = fakeView();
  const resolve = (view = v) =>
    provider.resolveWebviewView(view.view as never, { state: opts.state } as never, {} as never);
  resolve();
  return {
    provider,
    v,
    watchers,
    careStorage,
    bagStorage,
    gameStorage,
    records,
    progress,
    saveSetting,
    settings,
    resolve,
    log,
    slots,
    profiles,
    progressStore,
    stores,
    ui,
    dir,
    refresh,
    customize,
    copy,
  };
}

describe('PeonViewProvider', () => {
  it('sets up a scripted webview limited to the media folder', () => {
    const { v } = setup();
    const options = v.webview.options as { enableScripts: boolean; localResourceRoots: unknown[] };
    expect(options.enableScripts).toBe(true);
    expect(options.localResourceRoots).toEqual([{ fsPath: MEDIA }]);
    expect(v.webview.html).toContain('Content-Security-Policy');
    expect(v.webview.html).toMatch(/script-src 'nonce-[0-9a-f]{32}'/);
    expect(v.webview.html).not.toContain('<!--');
  });

  it('answers ready with the config, saved position, bag and care stats', () => {
    const latest: ClaudeUpdate = { main: null, subagents: [], background: [], sessions: [] };
    const { v, bagStorage } = setup({ latest, state: { petX: 12, petY: 40 } });
    bagStorage.data['petBag'] = { yarn: 2 };

    v.send({ command: 'ready' });

    const init = v.last('init');
    expect(init).toMatchObject({
      config: { species: 'cat', name: 'Mochi' },
      state: { petX: 12, petY: 40, bag: { yarn: 2 } },
    });
    expect(v.last('claude-update')).toMatchObject({ command: 'claude-update', main: null });
    const care = v.last('care-update') as { stats: Record<string, number> };
    expect(Object.keys(care.stats).sort()).toEqual(['clean', 'fullness', 'fun', 'updatedAt']);
  });

  it('does not send a claude update on ready when there is no session yet', () => {
    const { v } = setup();
    v.send({ command: 'ready' });
    expect(v.last('claude-update')).toBeUndefined();
  });

  it('keeps a dragged position for the next init and merges the bag into storage', () => {
    const { v, bagStorage } = setup();
    bagStorage.data['petBag'] = { yarn: 3, box: 1 };

    v.send({
      command: 'save-state',
      slot: SLOT,
      state: { petX: 80, petY: 90, bag: { yarn: 1, crown: 1 } },
    });
    v.send({ command: 'ready' });

    expect(bagStorage.data['petBag']).toEqual({ yarn: 3, box: 1, crown: 1 });
    expect(v.last('init')).toMatchObject({
      state: { petX: 80, petY: 90, bag: { yarn: 3, box: 1, crown: 1 } },
    });
  });

  it('stores shop trades and purchases globally and sends them back on init', () => {
    const { v, bagStorage } = setup();
    v.send({
      command: 'save-state',
      slot: SLOT,
      state: { bag: { yarn: 21 }, spent: { yarn: 20 }, unlocks: ['idle.disco'], food: 'fish' },
    });
    v.send({ command: 'ready' });

    expect(bagStorage.data['petBagSpent']).toEqual({ yarn: 20 });
    expect(bagStorage.data['petUnlocks']).toEqual(['idle.disco']);
    expect(v.last('init')).toMatchObject({
      state: { bag: { yarn: 21 }, spent: { yarn: 20 }, unlocks: ['idle.disco'], food: 'fish' },
    });
  });

  it.each([
    ['a string position', { petX: '80', petY: 90 }],
    ['an infinite position', { petX: Infinity }],
    ['a bag with text counts', { bag: { yarn: 'lots' } }],
    ['a null bag', { bag: null }],
    ['unlocks that are not a list', { unlocks: 'idle.disco' }],
    ['a numeric food', { food: 3 }],
    ['no state at all', null],
  ])('ignores save-state with %s', (_label, state) => {
    const { v, bagStorage } = setup({ state: { petX: 1, petY: 2 } });
    v.send({ command: 'save-state', slot: SLOT, state });
    v.send({ command: 'ready' });
    expect(v.last('init')).toMatchObject({ state: { petX: 1, petY: 2 } });
    expect(bagStorage.data['petBag']).toBeUndefined();
  });

  it('writes view log lines to the output channel and drops malformed ones', () => {
    const { v, log } = setup();
    v.send({ command: 'log', level: 'error', message: 'Frame failed: boom' });
    v.send({ command: 'log', level: 'shout', message: 'nope' });
    v.send({ command: 'log', level: 'info', message: 42 });
    expect(log.error).toHaveBeenCalledWith('view: Frame failed: boom');
    expect(log.info).not.toHaveBeenCalledWith(expect.stringContaining('nope'));
    expect(log.info).not.toHaveBeenCalledWith(expect.stringContaining('42'));
  });

  it('gathers debug logs from both sides and opens the log', () => {
    const { v, log } = setup();
    v.send({ command: 'gather-logs', snapshot: '{"view":"300x400"}' });
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Debug snapshot (extension)'));
    expect(log.info).toHaveBeenCalledWith('Debug snapshot (view): {"view":"300x400"}');
    expect(log.show).toHaveBeenCalledWith(true);
  });

  it('refreshes a failing view at most once every 5 minutes', () => {
    const { v, log } = setup();
    v.webview.html = '';
    v.send({ command: 'refresh' });
    expect(v.webview.html).toContain('Content-Security-Policy');
    v.webview.html = '';
    v.send({ command: 'refresh' });
    expect(v.webview.html).toBe('');
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('skipped'));
  });

  it('sends shop purchases from other windows with the shared-state tick', () => {
    const { v, provider, bagStorage } = setup();
    bagStorage.data['petUnlocks'] = ['idle.disco'];
    provider.syncShared();
    expect(v.last('unlocks')).toEqual({
      command: 'unlocks',
      unlocks: ['idle.disco'],
      activeBag: 'starter',
    });
  });

  it('applies care actions and reports refusals', () => {
    const { v, careStorage } = setup();
    careStorage.data['petCare'] = { fullness: 99, fun: 50, clean: 50, updatedAt: Date.now() };

    v.send({ command: 'care', action: 'kibble' });
    expect(v.last('care-update')).toMatchObject({ action: 'kibble', ok: false });

    v.send({ command: 'care', action: 'pet' });
    expect(v.last('care-update')).toMatchObject({ action: 'pet', ok: true });
    expect((careStorage.data['petCare'] as { fun: number }).fun).toBeGreaterThan(50);
  });

  it('ignores unknown care actions', () => {
    const { v } = setup();
    v.send({ command: 'care', action: 'teleport' });
    expect(v.posted).toHaveLength(0);
  });

  it("saves a helper's look to its own settings, and only a helper as its kind", () => {
    const { v, saveSetting } = setup({ settings: { companion: 'helper' } });
    v.send({ command: 'setting', key: 'color', value: '#ff0000' });
    v.send({ command: 'setting', key: 'species', value: 'robot' });
    v.send({ command: 'setting', key: 'species', value: 'cat' });
    v.send({ command: 'setting', key: 'wander', value: false });
    v.send({ command: 'setting', key: 'companion', value: 'pet' });
    expect(saveSetting.mock.calls).toEqual([
      ['helperColor', '#ff0000'],
      ['helper', 'robot'],
      ['wander', false],
      ['companion', 'pet'],
    ]);
  });

  it("doesn't look after a helper, and keeps a pet species out of a pet's helper key", () => {
    const helper = setup({ settings: { companion: 'helper' } });
    helper.v.send({ command: 'care', action: 'feed' });
    expect(helper.v.last('care-update')).toBeUndefined();
    const pet = setup();
    pet.v.send({ command: 'setting', key: 'species', value: 'wizard' });
    expect(pet.saveSetting).not.toHaveBeenCalled();
  });

  it('saves valid settings from the panel and drops anything else', () => {
    const { v, saveSetting } = setup();
    v.send({ command: 'setting', key: 'variety', value: false });
    v.send({ command: 'setting', key: 'wander', value: true });
    v.send({ command: 'setting', key: 'disabledActions', value: ['idle.butterfly'] });
    v.send({ command: 'setting', key: 'species', value: 'dragon' });
    v.send({ command: 'setting', key: 'wander', value: 'yes' });
    expect(saveSetting.mock.calls).toEqual([
      ['variety', 'classic'],
      ['wander', true],
      ['disabledActions', ['idle.butterfly']],
    ]);
  });

  it.each([null, undefined, 'ready', 42, { command: 'nope' }])('ignores the message %p', (msg) => {
    const { v, saveSetting } = setup();
    v.send(msg);
    expect(v.posted).toHaveLength(0);
    expect(saveSetting).not.toHaveBeenCalled();
  });

  it('forwards agent activity, but only peon-ping events from this workspace', () => {
    const { v, watchers } = setup();
    watchers.listeners.peon.forEach((fn) => fn({ anim: 'celebrate', cwd: '/work/app' }));
    watchers.listeners.peon.forEach((fn) => fn({ anim: 'annoyed', cwd: '/other/repo' }));
    watchers.listeners.session.forEach((fn) => fn({ sessions: [] }));
    watchers.listeners.claude.forEach((fn) => fn({ main: null, subagents: [], sessions: [] }));

    expect(v.posted.map((m) => m.command)).toEqual([
      'peon-event',
      'session-update',
      'claude-update',
    ]);
    expect(v.posted[0]).toMatchObject({ anim: 'celebrate' });
  });

  it('rebinds watchers when the view is resolved again and unbinds them when it closes', () => {
    const { watchers, resolve, v } = setup();
    const count = () =>
      watchers.listeners.peon.size +
      watchers.listeners.session.size +
      watchers.listeners.claude.size;
    expect(count()).toBe(3);

    const second = fakeView();
    resolve(second);
    expect(count()).toBe(3);

    second.close();
    expect(count()).toBe(0);
    v.posted.length = 0;
  });

  it('pushes settings and care to an open view, and nothing once it is closed', () => {
    const { provider, v, settings } = setup();
    settings['name'] = 'Duchess';
    provider.reinit();
    provider.syncShared();
    expect(v.last('reinit')).toMatchObject({ config: { name: 'Duchess' } });
    expect(v.last('care-update')).toBeDefined();

    v.close();
    v.posted.length = 0;
    provider.reinit();
    provider.syncShared();
    provider.refresh();
    expect(v.posted).toHaveLength(0);
  });

  it('refresh rebuilds the page with a fresh nonce', () => {
    const { provider, v } = setup();
    const before = v.webview.html;
    provider.refresh();
    expect(v.webview.html).not.toBe(before);
    expect(v.webview.html.replace(/[0-9a-f]{32}/g, '')).toBe(before.replace(/[0-9a-f]{32}/g, ''));
  });

  it('sends the local calendar on ready, with settings changes and every sync', () => {
    const { v, provider, settings } = setup();
    v.send({ command: 'ready' });
    expect(v.last('calendar')).toEqual({
      command: 'calendar',
      day: '2026-10-30',
      events: ['halloween'],
      season: 'autumn',
    });
    settings['hemisphere'] = 'south';
    v.posted.length = 0;
    provider.reinit();
    expect(v.last('calendar')).toMatchObject({ season: 'spring' });
    v.posted.length = 0;
    provider.syncShared();
    expect(v.last('calendar')).toMatchObject({ events: ['halloween'] });
  });

  it('sends the house, records and level on ready', () => {
    const { v } = setup();
    v.send({ command: 'ready' });
    expect(v.last('house')).toMatchObject({
      layout: { at: { house: 'starter', room: 'living' }, houses: {} },
    });
    expect(v.last('records-update')).toMatchObject({ week: '2026-10-26', records: [] });
    expect(v.last('progress-update')).toMatchObject({ level: 1, xp: 0 });
  });

  it('earns XP for care that worked, not for refusals', () => {
    const { v, careStorage, gameStorage } = setup();
    careStorage.data['petCare'] = { fullness: 99, fun: 50, clean: 50, updatedAt: Date.now() };
    v.send({ command: 'care', action: 'kibble' });
    expect(Object.keys((gameStorage.data['petXp'] as object) ?? {})).toHaveLength(0);
    v.send({ command: 'care', action: 'pet' });
    expect(Object.keys(gameStorage.data['petXp'] as object)).toHaveLength(1);
    expect(v.last('progress-update')).toMatchObject({ xp: 2 });
  });

  it('saves the house layout, merged with what other windows saved', () => {
    const { v, gameStorage } = setup();
    gameStorage.data['petHouse'] = {
      items: [{ id: 'bed', x: 0.2, y: 0.9, at: 100 }],
      theme: 'cozy',
      themeAt: 0,
    };
    v.send({
      command: 'house-save',
      slot: SLOT,
      layout: { items: [{ id: 'lamp', x: 0.5, y: 0.9, at: 200 }], theme: 'mint', themeAt: 5 },
    });
    v.send({ command: 'house-save', slot: SLOT, layout: 'nope' });
    expect(gameStorage.data['petHouse']).toMatchObject({
      houses: {
        starter: {
          living: {
            items: [
              { id: 'bed', x: 0.2 },
              { id: 'lamp', x: 0.5 },
            ],
            theme: 'mint',
          },
        },
      },
    });
  });

  it('cheers new records and hides prompt text unless the user wants it', () => {
    const { v, records, settings } = setup();
    const at = (ms: number) => new Date(2026, 9, 30, 11, 0, ms / 1000).toISOString();
    records.line('s', {
      type: 'user',
      promptId: 'p1',
      timestamp: at(0),
      message: { content: 'go' },
    });
    records.line('s', {
      type: 'assistant',
      timestamp: at(9000),
      message: { stop_reason: 'end_turn', content: [] },
    });
    const update = v.last('records-update') as { broken: string[]; records: object[] };
    expect(update.broken).toContain('marathon');
    expect(update.records[0]).not.toHaveProperty('preview');
    settings['recordsShowPrompts'] = true;
    records.line('s', {
      type: 'user',
      promptId: 'p2',
      timestamp: at(10000),
      message: { content: 'more' },
    });
    records.line('s', {
      type: 'assistant',
      timestamp: at(30000),
      message: { stop_reason: 'end_turn', content: [] },
    });
    expect(
      (v.last('records-update') as { records: Array<{ preview?: string }> }).records[0].preview,
    ).toBeDefined();
  });
});

describe('bags and saves in the view', () => {
  it('starts the view with every bag level, the active bag and the save it plays', () => {
    const { v } = setup();
    v.send({ command: 'ready' });
    const init = v.last('init') as { bags: Array<{ id: string }>; slot: string; state: object };
    expect(init.bags).toHaveLength(20);
    expect(init.slot).toBe(SLOT);
    expect(init.state).toMatchObject({ activeBag: 'starter' });
  });

  it('switches to an unlocked bag and echoes it; a locked one is ignored', () => {
    const { v, bagStorage, progressStore } = setup();
    v.send({ command: 'ready' });
    v.send({ command: 'bag-switch', bag: 'garden', slot: SLOT });
    expect(bagStorage.data['petActiveBag']).toBeUndefined();
    progressStore.add('xp', { xp: 300, kind: 'test', at: Date.now() }, new Date());
    v.send({ command: 'bag-switch', bag: 'garden', slot: SLOT });
    expect(bagStorage.data['petActiveBag']).toBe('garden');
    expect(v.last('unlocks')).toMatchObject({ activeBag: 'garden' });
    v.send({ command: 'bag-switch', bag: 'vault', slot: SLOT });
    expect(bagStorage.data['petActiveBag']).toBe('garden');
  });

  it('opens every bag with levels switched off', () => {
    const { v, bagStorage } = setup({ settings: { levels: false } });
    v.send({ command: 'bag-switch', bag: 'vault', slot: SLOT });
    expect(bagStorage.data['petActiveBag']).toBe('vault');
  });

  it('drops a change from an earlier save and restarts that view', () => {
    const { v, bagStorage } = setup();
    v.send({ command: 'save-state', slot: '2025-01-01-mochi', state: { bag: { yarn: 50 } } });
    v.send({ command: 'house-save', slot: 'old', layout: { items: [] } });
    v.send({ command: 'bag-switch', bag: 'starter', slot: 'old' });
    expect(bagStorage.data['petBag']).toBeUndefined();
    expect(v.posted.filter((m) => m.command === 'init')).toHaveLength(3);
  });

  it('rebuilds the view on the sync tick after a new save starts in another window', () => {
    const { v, provider, slots } = setup();
    v.send({ command: 'ready' });
    v.webview.html = '';
    slots.start({ id: 'elsewhere', startedAt: 5 });
    provider.syncShared();
    expect(v.webview.html).toContain('Content-Security-Policy');
  });

  it('opens a new save with the welcome screen until the pet is picked', () => {
    const { v } = setup();
    v.send({ command: 'ready' });
    expect(v.last('welcome')).toMatchObject({ names: { cat: 'Mochi' } });
    v.posted.length = 0;
    v.send({ command: 'welcome-done' });
    v.send({ command: 'ready' });
    expect(v.last('welcome')).toBeUndefined();
  });

  it('skips the welcome screen for a save that has earned XP', () => {
    const { v, progress } = setup();
    progress.agentDone('a');
    v.send({ command: 'ready' });
    expect(v.last('welcome')).toBeUndefined();
  });

  it('sends the peon-ping guide and copies only its own commands', () => {
    const { v, provider, copy } = setup();
    v.send({ command: 'ready' });
    const guide = v.last('peon') as { installed: boolean; steps: Array<{ command?: string }> };
    expect(guide.installed).toBe(false);
    const step = guide.steps.findIndex((s) => s.command);
    v.send({ command: 'peon-copy', step });
    expect(copy).toHaveBeenCalledWith(guide.steps[step].command);
    v.send({ command: 'peon-copy', step: 0 });
    v.send({ command: 'peon-copy', step: 99 });
    expect(copy).toHaveBeenCalledTimes(1);
    v.posted.length = 0;
    provider.syncShared();
    expect(v.last('peon')).toBeDefined();
  });

  it('opens the Customize Pet menu and starts over when asked', async () => {
    const { v, customize, slots, refresh } = setup();
    v.send({ command: 'customize' });
    expect(customize).toHaveBeenCalled();
    const slot = slots.current().id;
    v.send({ command: 'start-over' });
    await new Promise((r) => setTimeout(r, 0));
    expect(slots.current().id).not.toBe(slot);
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the finish screen once, at the finish level, then on asking', () => {
    const { v, progress, progressStore } = setup();
    v.send({ command: 'ready' });
    progressStore.add('xp', { xp: 59500, kind: 'test', at: Date.now() }, new Date());
    progress.agentDone('a');
    const finished = () => v.posted.filter((m) => m.command === 'finished');
    expect(finished()).toHaveLength(1);
    expect(finished()[0]).toMatchObject({ finished: true, summary: { level: 35 } });
    progress.agentDone('b');
    expect(finished()).toHaveLength(1);
    v.send({ command: 'finish-open' });
    expect(finished()).toHaveLength(2);
  });

  it('sends an old save to visit without its fact history; unknown ids get nothing', () => {
    const { v, profiles, slots, stores } = setup();
    stores.bag.save({ yarn: 2 });
    const p = profiles.startNewSave(false);
    expect(slots.current().id).not.toBe(p.id);
    v.send({ command: 'visit-profile', id: p.id });
    const sent = v.last('profile') as { profile: { id: string; progress: object; bag: object } };
    expect(sent.profile).toMatchObject({ id: p.id, bag: { found: { yarn: 2 } }, guest: false });
    expect(sent.profile.progress).toEqual({ xp: 0, level: 1 });
    v.posted.length = 0;
    v.send({ command: 'visit-profile', id: 'never-was' });
    expect(v.last('profile')).toBeUndefined();
  });

  it('lists the profiles on the sync tick, and after hiding one', () => {
    const { v, provider, profiles, stores } = setup();
    stores.bag.save({ yarn: 2 });
    const p = profiles.startNewSave(false);
    provider.syncShared();
    expect(v.last('profiles')).toMatchObject({ profiles: [{ id: p.id }] });
    v.send({ command: 'profile-hide', id: p.id, hidden: true });
    expect(v.last('profiles')).toMatchObject({ profiles: [{ id: p.id, hidden: true }] });
  });

  it('only opens post links when the share buttons are on', async () => {
    const off = setup({ settings: { shareButtons: false } });
    off.v.send({ command: 'share-post', site: 'x', toyTotal: 1 });
    const on = setup();
    on.v.send({ command: 'share-post', site: 'x', toyTotal: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(off.ui.openUrl).not.toHaveBeenCalled();
    expect(on.ui.openUrl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/x\.com\//));
  });

  it('counts a first find from a new bag for the collector challenge', () => {
    const { v, progressStore } = setup();
    v.send({ command: 'found', bag: 'garden', toy: 'snail' });
    expect(progressStore.facts()['find:snail']).toMatchObject({ kind: 'find' });
  });
});

describe('visitors in the view', () => {
  it('puts off the next visitor when you look after the pet, not when care is refused', () => {
    const { v, careStorage, gameStorage } = setup();
    careStorage.data['petCare'] = { fullness: 99, fun: 10, clean: 10, updatedAt: Date.now() };
    v.send({ command: 'care', action: 'kibble' });
    expect(gameStorage.data['petVisitorWait']).toBeUndefined();
    v.send({ command: 'care', action: 'pet' });
    expect(gameStorage.data['petVisitorWait']).toMatchObject({ cared: true });
  });

  it('acts out a visit with the stat it raised, and nothing without a view', () => {
    const { v, provider, careStorage, stores } = setup();
    careStorage.data['petCare'] = { fullness: 20, fun: 50, clean: 50, updatedAt: Date.now() };
    stores.care.boost('fullness', 33);
    provider.visitor({ kind: 'feed', at: 1, stat: 'fullness', amount: 33 });
    expect(v.last('visitor')).toEqual({
      command: 'visitor',
      kind: 'feed',
      at: 1,
      stat: 'fullness',
      amount: 33,
    });
    expect(
      (v.last('care-update') as { stats: { fullness: number } }).stats.fullness,
    ).toBeGreaterThan(50);
    v.close();
    v.posted.length = 0;
    provider.visitor({ kind: 'rain', at: 2, stat: 'clean', amount: 33 });
    expect(v.posted).toEqual([]);
  });
});
