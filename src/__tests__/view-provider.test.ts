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

import * as path from 'path';
import { PeonViewProvider } from '../PeonViewProvider';
import { CareStore, CareStorage } from '../pet-care';
import { BagStore } from '../bag-store';
import { readPetConfig } from '../pet-config';
import type { StateWatcher } from '../state-watcher';
import type { ClaudeWatcher, ClaudeUpdate } from '../claude-watcher';

type Fn = (arg: unknown) => void;

function memory(): CareStorage & { data: Record<string, unknown> } {
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

function setup(opts: { latest?: ClaudeUpdate | null; state?: unknown; settings?: object } = {}) {
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
  const provider = new PeonViewProvider(
    MEDIA,
    watchers.peon,
    watchers.claude,
    () => readPetConfig((k) => settings[k]),
    new CareStore(careStorage),
    new BagStore(bagStorage),
    saveSetting,
    log,
  );
  const v = fakeView();
  const resolve = (view = v) =>
    provider.resolveWebviewView(view.view as never, { state: opts.state } as never, {} as never);
  resolve();
  return { provider, v, watchers, careStorage, bagStorage, saveSetting, settings, resolve, log };
}

describe('PeonViewProvider', () => {
  it('sets up a scripted webview limited to the media folder', () => {
    const { v } = setup();
    const options = v.webview.options as { enableScripts: boolean; localResourceRoots: unknown[] };
    expect(options.enableScripts).toBe(true);
    expect(options.localResourceRoots).toEqual([{ fsPath: MEDIA }]);
    expect(v.webview.html).toContain('Content-Security-Policy');
    expect(v.webview.html).toMatch(/script-src 'nonce-[0-9a-f]{32}'/);
    expect(v.webview.html).not.toMatch(/<!--[A-Z_]+-->/);
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

    v.send({ command: 'save-state', state: { petX: 80, petY: 90, bag: { yarn: 1, crown: 1 } } });
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
    v.send({ command: 'save-state', state });
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

  it('sends shop purchases from other windows with the care tick', () => {
    const { v, provider, bagStorage } = setup();
    bagStorage.data['petUnlocks'] = ['idle.disco'];
    provider.sendCare();
    expect(v.last('unlocks')).toEqual({ command: 'unlocks', unlocks: ['idle.disco'] });
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
    provider.sendCare();
    expect(v.last('reinit')).toMatchObject({ config: { name: 'Duchess' } });
    expect(v.last('care-update')).toBeDefined();

    v.close();
    v.posted.length = 0;
    provider.reinit();
    provider.sendCare();
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
});
