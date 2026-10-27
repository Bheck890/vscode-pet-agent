import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { BAG_LEVELS } from '../bags';
import { mediaFiles } from '../media-files';

type Listener = (event: unknown) => void;
type ListenerMap = Record<string, Listener[]>;

function listenerTarget(map: ListenerMap) {
  return (type: string, listener: Listener) => {
    (map[type] ??= []).push(listener);
  };
}

/** A 2D context that accepts any call; only the bits the script reads back are real. */
function fakeContext() {
  const state: Record<string, unknown> = { fillStyle: '#000000' };
  return new Proxy(state, {
    get(target, key: string) {
      if (key in target) {
        return target[key];
      }
      if (key === 'measureText') {
        return (s: string) => ({ width: s.length * 6 });
      }
      if (key === 'createImageData') {
        return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
      }
      if (key === 'createRadialGradient') {
        return () => ({ addColorStop: () => undefined });
      }
      return () => undefined;
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
}

/**
 * Loads webview.js in a fake DOM. Frames that throw are caught and logged by
 * the script, so by default a logged error fails the test.
 */
function runWebviewScript({ libs = true, allowErrors = false } = {}) {
  let frame: (() => void) | null = null;
  const windowListeners: ListenerMap = {};
  const canvasListeners: ListenerMap = {};
  const documentListeners: ListenerMap = {};

  const tooltip = {
    innerHTML: '',
    style: { display: 'none', left: '0px', top: '0px' },
    offsetWidth: 0,
    offsetHeight: 0,
  };

  const makeCanvas = () => ({
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    getContext: () => fakeContext(),
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
    addEventListener: listenerTarget(canvasListeners),
  });
  const canvas = makeCanvas();

  const vscodeApi = {
    postMessage: jest.fn(
      (m: { command?: string; level?: string; message?: string; state?: unknown }) => {
        if (!allowErrors && m?.command === 'log' && m.level === 'error') {
          throw new Error(m.message);
        }
      },
    ),
    setState: jest.fn(),
  };

  const fakeEl = (data: Record<string, string> = {}) => {
    const listeners: ListenerMap = {};
    return {
      hidden: true,
      disabled: false,
      checked: false,
      textContent: '',
      title: '',
      innerHTML: '',
      style: {} as Record<string, string>,
      classList: { toggle: () => undefined },
      dataset: data,
      listeners,
      addEventListener: listenerTarget(listeners),
    };
  };
  const elements: Record<string, ReturnType<typeof fakeEl>> = {};
  for (const id of [
    'care-toggle',
    'care-panel',
    'care-note',
    'bar-fullness',
    'bar-fun',
    'bar-clean',
    'bag-toggle',
    'bag-panel',
    'bag-grid',
    'bag-title',
    'bag-store-all',
    'bag-view',
    'bag-tabs',
    'collection-view',
    'shop-view',
    'gather-logs',
    'food-picker',
    'settings-toggle',
    'settings-panel',
    'action-list',
    'trophy-toggle',
    'trophy-panel',
    'trophy-title',
    'trophy-tabs',
    'trophy-view',
    'house-toggle',
    'house-panel',
    'house-note',
    'house-items',
    'house-themes',
    'house-done',
    'house-picker',
    'house-rooms',
    'house-tabs',
    'house-profiles',
    'house-visit',
    'bag-picker',
    'bag-odds',
    'save-actions',
    'finish-panel',
    'finish-body',
    'finish-actions',
  ]) {
    elements[id] = fakeEl();
  }
  const careButtons = ['feed', 'treat', 'play', 'bath'].map((care) => fakeEl({ care }));
  const switches = ['variety', 'wander', 'toys', 'machines', 'backgroundPets', 'stateColors'].map(
    (setting) => fakeEl({ setting }),
  );

  const windowObj: Record<string, unknown> = {
    addEventListener: listenerTarget(windowListeners),
    devicePixelRatio: 1,
  };

  const body = {
    clientWidth: 600,
    clientHeight: 600,
    html: '',
    insertAdjacentHTML(_where: string, html: string) {
      body.html += html;
    },
  };
  const context: Record<string, unknown> = {
    window: windowObj,
    document: {
      body,
      getElementById: (id: string) =>
        id === 'c' ? canvas : id === 'tooltip' ? tooltip : (elements[id] ?? null),
      querySelectorAll: (sel: string) => (sel === '[data-care]' ? careButtons : switches),
      createElement: () => makeCanvas(),
      addEventListener: listenerTarget(documentListeners),
    },
    acquireVsCodeApi: () => vscodeApi,
    // Unref'd so the 5-minute self-check can't keep Jest running.
    setInterval: (fn: () => void, ms: number) => {
      const timer: { unref?: () => void } = setInterval(fn, ms);
      timer.unref?.();
      return timer;
    },
    requestAnimationFrame: (cb: () => void) => {
      frame = cb;
      return 0;
    },
    Date,
    console,
  };

  // The same scripts, in the same order, as the real page loads.
  const media = path.join(process.cwd(), 'media');
  const scripts = mediaFiles(fs.readFileSync(path.join(media, 'webview.html'), 'utf8')).filter(
    (f) => f.endsWith('.js'),
  );
  for (const file of scripts.slice(0, -1)) {
    vm.runInNewContext(fs.readFileSync(path.join(media, file), 'utf8'), context);
  }
  if (libs) {
    for (const lib of Object.keys(context).filter((k) => k.startsWith('Pet'))) {
      windowObj[lib] = context[lib];
    }
  }
  vm.runInNewContext(
    fs.readFileSync(path.join(media, scripts[scripts.length - 1]), 'utf8'),
    context,
  );

  const send = (data: unknown) => windowListeners['message'].forEach((l) => l({ data }));
  const hover = (offsetX: number, offsetY: number) =>
    canvasListeners['mousemove'].forEach((l) => l({ offsetX, offsetY }));

  const click = (offsetX: number, offsetY: number) => {
    canvasListeners['mousedown'].forEach((l) =>
      l({ button: 0, offsetX, offsetY, preventDefault: () => undefined }),
    );
    documentListeners['mouseup'].forEach((l) => l({}));
  };

  const pressCare = (action: string) =>
    careButtons.find((b) => b.dataset.care === action)!.listeners['click'].forEach((l) => l({}));

  /** Runs the render loop for `ms` of (fake) time. Needs jest fake timers. */
  const runFrames = (ms: number, step = 16) => {
    for (let t = 0; t < ms; t += step) {
      jest.advanceTimersByTime(step);
      frame?.();
    }
  };

  const rightClick = (offsetX: number, offsetY: number) =>
    canvasListeners['contextmenu'].forEach((l) =>
      l({ offsetX, offsetY, preventDefault: () => undefined }),
    );

  return {
    body,
    rightClick,
    runFrames,
    send,
    hover,
    click,
    pressCare,
    elements,
    switches,
    tooltip,
    vscodeApi,
    canvasListeners,
    documentListeners,
  };
}

/** A multi-house layout as the webview sends it. */
interface Layout {
  at: { house: string; room: string; changedAt: number };
  houses: Record<
    string,
    Record<string, { items: Array<{ id: string; x: number }>; theme: string }>
  >;
}

const CONFIG = {
  species: 'fox',
  color: '',
  name: 'Rusty',
  stateColors: true,
  size: 200,
  variety: 'classic',
  toys: false,
  machines: true,
  backgroundPets: true,
};

describe('webview behavior', () => {
  it('signals ready on load', () => {
    const { vscodeApi } = runWebviewScript();
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({ command: 'ready' });
  });

  it('shows the main pet state in its tooltip and escapes agent-provided text', () => {
    const { send, hover, tooltip } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    send({
      command: 'claude-update',
      main: {
        sessionId: 's',
        state: 'writing',
        detail: 'Edit <img src=x onerror=alert(1)>.ts',
        seq: 1,
        project: 'app',
      },
      subagents: [],
      sessions: [],
    });

    hover(50, 80);

    expect(tooltip.style.display).toBe('block');
    expect(tooltip.innerHTML).toContain('<b>Rusty</b>');
    expect(tooltip.innerHTML).not.toContain('<img');
    expect(tooltip.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('applies updates that arrive before init once the pet exists', () => {
    const { send, hover, tooltip } = runWebviewScript();
    send({
      command: 'claude-update',
      main: { sessionId: 's', state: 'reading', detail: 'Read a.ts', seq: 3, project: null },
      subagents: [],
      sessions: [],
    });
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    hover(50, 80);
    expect(tooltip.innerHTML).toContain('Read a.ts');
  });

  it('spawns a mini pet per sub-agent and escapes its task in the tooltip', () => {
    const { send, hover, tooltip } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    send({
      command: 'claude-update',
      main: { sessionId: 's', state: 'delegating', detail: '', seq: 1, project: null },
      subagents: [
        {
          id: 'a1',
          name: 'Detective Noodle',
          agentType: 'Explore',
          task: '<script>bad()</script> find stuff',
          state: 'reading',
          detail: '',
          seq: 1,
        },
      ],
      sessions: [],
    });

    // Minis start at the main pet's centre before gliding to their slot.
    hover(96, 126);

    expect(tooltip.innerHTML).toContain('Detective Noodle');
    expect(tooltip.innerHTML).not.toContain('<script>');
    expect(tooltip.innerHTML).toContain('&lt;script&gt;');
  });

  it('escapes cwd-derived session dot labels', () => {
    const { send, hover, tooltip } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: null });
    send({
      command: 'session-update',
      sessions: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          hot: true,
          warm: true,
          cwd: 'C:\\tmp\\<img onerror=x>',
        },
      ],
    });

    hover(14, 14);

    expect(tooltip.innerHTML).not.toContain('<img');
    expect(tooltip.innerHTML).toContain('&lt;img onerror=x&gt;');
  });

  it('wakes a sleeping pet when clicked, without saving a new position', () => {
    const { send, hover, click, tooltip, vscodeApi } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    hover(50, 80);
    expect(tooltip.innerHTML).toContain('napping');

    click(50, 80);
    hover(50, 80);

    expect(tooltip.innerHTML).toContain('waking up');
    expect(vscodeApi.setState).not.toHaveBeenCalled();
  });

  const working = (state: string) => ({
    command: 'claude-update',
    main: { sessionId: 's', state, detail: '', seq: 7, project: null },
    subagents: [],
    sessions: [],
  });

  it('locks care while the agent is working', () => {
    const { send, pressCare, click, elements, vscodeApi } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    send(working('writing'));
    vscodeApi.postMessage.mockClear();

    pressCare('treat');
    click(50, 80);

    expect(vscodeApi.postMessage).not.toHaveBeenCalled();
    expect(elements['care-note'].textContent).toContain('busy working');
  });

  it('locks care while sub-agents are out, even if the main pet looks idle', () => {
    const { send, pressCare, vscodeApi } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    send({
      command: 'claude-update',
      main: { sessionId: 's', state: 'idle', detail: '', seq: 1, project: null },
      subagents: [
        {
          id: 'a',
          name: 'Scout Bean',
          agentType: 'Explore',
          task: 'x',
          state: 'reading',
          detail: '',
          seq: 1,
        },
      ],
      sessions: [],
    });
    vscodeApi.postMessage.mockClear();
    pressCare('feed');
    expect(vscodeApi.postMessage).not.toHaveBeenCalled();
  });

  it('picks up a care tool when the agent is done, and shows refusals', () => {
    const { send, pressCare, elements, vscodeApi } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    send(working('idle'));
    vscodeApi.postMessage.mockClear();

    pressCare('feed');
    expect(elements['care-note'].textContent).toContain('drop kibble');
    expect(vscodeApi.postMessage).not.toHaveBeenCalled();

    send({
      command: 'care-update',
      action: 'kibble',
      ok: false,
      reason: "isn't hungry right now",
      stats: { fullness: 96, fun: 50, clean: 20, updatedAt: 0 },
    });
    expect(elements['care-note'].textContent).toBe("Rusty isn't hungry right now.");
    expect(elements['bar-clean'].style.width).toBe('20%');
  });

  it('stroking the pet in care mode pets it instead of dragging it', () => {
    const { send, elements, canvasListeners, documentListeners, vscodeApi } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    send(working('idle'));
    elements['care-toggle'].listeners['click'].forEach((l) => l({}));
    vscodeApi.postMessage.mockClear();

    canvasListeners['mousedown'].forEach((l) =>
      l({ button: 0, offsetX: 60, offsetY: 100, preventDefault: () => undefined }),
    );
    for (let i = 0; i < 12; i++) {
      const x = i % 2 ? 140 : 40;
      documentListeners['mousemove'].forEach((l) => l({ clientX: x, clientY: 100 }));
    }
    documentListeners['mouseup'].forEach((l) => l({}));

    expect(vscodeApi.postMessage).toHaveBeenCalledWith({ command: 'care', action: 'pet' });
    expect(vscodeApi.setState).not.toHaveBeenCalled();
  });

  it('toggles the care panel', () => {
    const { elements } = runWebviewScript();
    elements['care-toggle'].listeners['click'].forEach((l) => l({}));
    expect(elements['care-panel'].hidden).toBe(false);
  });

  it('plays a real game of fetch: throw the ball and the pet brings it back', () => {
    jest.useFakeTimers();
    try {
      const {
        send,
        runFrames,
        pressCare,
        elements,
        canvasListeners,
        documentListeners,
        vscodeApi,
      } = runWebviewScript();
      send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
      send(working('idle'));
      send({
        command: 'care-update',
        stats: { fullness: 80, fun: 40, clean: 80, updatedAt: 0 },
      });
      elements['care-toggle'].listeners['click'].forEach((l) => l({}));
      pressCare('play');
      runFrames(100);
      vscodeApi.postMessage.mockClear();

      // The ball starts on the floor to the right of the pet (pet is 192px at x=0, y=30).
      canvasListeners['mousedown'].forEach((l) =>
        l({ button: 0, offsetX: 211, offsetY: 210, preventDefault: () => undefined }),
      );
      for (const [x, y] of [
        [260, 190],
        [330, 160],
        [420, 120],
      ]) {
        jest.advanceTimersByTime(16);
        documentListeners['mousemove'].forEach((l) => l({ clientX: x, clientY: y }));
      }
      documentListeners['mouseup'].forEach((l) => l({}));

      runFrames(8000);

      expect(vscodeApi.postMessage).toHaveBeenCalledWith({ command: 'care', action: 'fetch' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('applies a new state even when seq has not moved (held action ending)', () => {
    jest.useFakeTimers();
    try {
      const { send, hover, tooltip, runFrames } = runWebviewScript();
      send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
      send(working('browsing'));
      runFrames(1000);
      hover(50, 80);
      expect(tooltip.innerHTML).toContain('browsing the web');
      send(working('thinking'));
      hover(50, 80);
      expect(tooltip.innerHTML).toContain('thinking');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows a machine for each running test and dings it away when done', () => {
    jest.useFakeTimers();
    try {
      const { send, runFrames, hover, tooltip } = runWebviewScript();
      send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
      const job = { id: 'j1', kind: 'test', label: 'npm test', background: false };
      send({
        command: 'claude-update',
        main: {
          sessionId: 's',
          state: 'testing',
          detail: 'npm test',
          seq: 1,
          project: null,
          jobs: [job],
        },
        subagents: [],
        background: [],
        sessions: [],
      });
      runFrames(1000);
      hover(50, 80);
      expect(tooltip.innerHTML).toContain('running tests');
      expect(tooltip.innerHTML).toContain('1 job running');
      hover(200, 200);
      expect(tooltip.innerHTML).toContain('washing machine');

      send({
        command: 'claude-update',
        main: { sessionId: 's', state: 'thinking', detail: '', seq: 2, project: null, jobs: [] },
        subagents: [],
        background: [],
        sessions: [],
      });
      runFrames(1000);
      hover(200, 200);
      expect(tooltip.style.display).toBe('none');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows other sessions as small pets that do not lock care', () => {
    const { send, pressCare, elements } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    send({
      command: 'claude-update',
      main: { sessionId: 's', state: 'idle', detail: '', seq: 1, project: null, jobs: [] },
      subagents: [],
      background: [
        {
          id: 'o',
          project: 'other-app',
          local: true,
          state: 'writing',
          detail: '',
          seq: 1,
          jobs: [],
        },
      ],
      sessions: [],
    });
    pressCare('feed');
    expect(elements['care-note'].textContent).toContain('drop kibble');
  });

  it("shows other repos' agents only when the option is on and this repo has none", () => {
    const other = {
      command: 'claude-update',
      main: { sessionId: 's', state: 'idle', detail: '', seq: 1, project: null, jobs: [] },
      subagents: [],
      background: [
        { id: 'x', project: '2LMC', local: false, state: 'reading', detail: '', seq: 1, jobs: [] },
      ],
      sessions: [],
    };
    const off = runWebviewScript();
    off.send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    off.send(other);
    off.hover(96, 126);
    expect(off.tooltip.innerHTML).not.toContain('2LMC');

    const on = runWebviewScript();
    on.send({
      command: 'init',
      config: { ...CONFIG, otherRepoPets: true },
      state: { petX: 0, petY: 30 },
    });
    on.send(other);
    on.hover(96, 126);
    expect(on.tooltip.innerHTML).toContain('2LMC');
    expect(on.tooltip.innerHTML).toContain('Claude session in another repo');
    // A helper starting in this repo takes the row back.
    on.send({
      ...other,
      subagents: [
        {
          id: 'a',
          name: 'Scout Bean',
          agentType: 'Explore',
          task: 't',
          state: 'reading',
          detail: '',
          seq: 1,
          jobs: [],
        },
      ],
    });
    on.hover(96, 126);
    expect(on.tooltip.innerHTML).toContain('Scout Bean');
    expect(on.tooltip.innerHTML).not.toContain('2LMC');
  });

  it('labels other sessions in the tooltip', () => {
    const { send, hover, tooltip } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    send({
      command: 'claude-update',
      main: { sessionId: 's', state: 'idle', detail: '', seq: 1, project: null, jobs: [] },
      subagents: [],
      background: [
        {
          id: 'o',
          project: '<b>x</b>',
          local: true,
          state: 'reading',
          detail: '',
          seq: 1,
          jobs: [],
        },
      ],
      sessions: [],
    });
    // Minis start at the main pet's centre before gliding to their slot.
    hover(96, 126);
    expect(tooltip.innerHTML).toContain('another Claude session in this repo');
    expect(tooltip.innerHTML).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it.each(['cat', 'dog', 'bird', 'fox'])(
    'plays every state, random variants, hobbies and toys as a %s without errors',
    (species) => {
      jest.useFakeTimers();
      try {
        const { send, runFrames, vscodeApi } = runWebviewScript();
        const config = { ...CONFIG, species, variety: 'random', toys: true, wander: true };
        const unlocks = [
          'idle.disco',
          'idle.magic',
          'idle.bubbles',
          'idle.stargaze',
          'idle.spin',
          'idle.party',
          'sleeping.dreamy',
          'done.party',
        ];
        send({ command: 'init', config, state: { petX: 0, petY: 300, unlocks } });
        const states = [
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
          'sleeping',
        ];
        let seq = 1;
        for (let round = 0; round < 6; round++) {
          for (const state of states) {
            send({
              command: 'claude-update',
              main: { sessionId: 's', state, detail: 'x', seq: seq++, project: null, jobs: [] },
              subagents: [
                {
                  id: 'a',
                  name: 'Scout',
                  agentType: 'Explore',
                  task: 't',
                  state,
                  detail: '',
                  seq,
                  jobs: [],
                },
              ],
              background: [{ id: 'b', project: 'p', state, detail: '', seq, jobs: [] }],
              sessions: [],
            });
            runFrames(400, 40);
          }
        }
        send({
          command: 'claude-update',
          main: { sessionId: 's', state: 'idle', detail: '', seq: seq++, project: null, jobs: [] },
          subagents: [],
          background: [],
          sessions: [],
        });
        runFrames(80000, 50);
        // A toy turned up and went into the bag, which is saved with the webview state.
        expect(vscodeApi.setState).toHaveBeenCalledWith(
          expect.objectContaining({ bag: expect.any(Object) }),
        );
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it('shows the bag with found toys and lets you take one out and put it away', () => {
    const { send, elements } = runWebviewScript();
    send({
      command: 'init',
      config: CONFIG,
      state: { petX: 0, petY: 30, bag: { yarn: 2, crown: 1 } },
    });
    elements['bag-toggle'].listeners['click'].forEach((l) => l({}));
    expect(elements['bag-panel'].hidden).toBe(false);
    expect(elements['bag-title'].textContent).toMatch(/2\/\d+ found/);
    expect(elements['bag-grid'].innerHTML).toContain('data-toy="yarn"');
    expect(elements['bag-grid'].innerHTML).toContain('x2');

    const clickToy = (toy: string) =>
      elements['bag-grid'].listeners['click'].forEach((l) =>
        l({ target: { closest: () => ({ dataset: { toy } }) } }),
      );
    clickToy('crown');
    expect(elements['bag-grid'].innerHTML).toMatch(/class="toy out" data-toy="crown"/);
    clickToy('crown');
    expect(elements['bag-grid'].innerHTML).not.toMatch(/class="toy out" data-toy="crown"/);
  });

  it('trades spare toys in at the shop for an animation and a food', () => {
    const { send, elements, vscodeApi } = runWebviewScript();
    send({
      command: 'init',
      config: CONFIG,
      state: { petX: 0, petY: 30, bag: { yarn: 90, box: 32, rocket: 2 } },
    });
    elements['bag-toggle'].listeners['click'].forEach((l) => l({}));
    elements['bag-tabs'].listeners['click'].forEach((l) =>
      l({ target: { closest: () => ({ dataset: { tab: 'shop' } }) } }),
    );
    const shop = () => elements['shop-view'].innerHTML;
    expect(shop()).toContain('Spare toys: 120 common - 1 rare');
    expect(shop()).toMatch(/data-buy="idle\.disco" data-rarity="rare" data-n="5" disabled/);
    expect(elements['food-picker'].hidden).toBe(true);

    const buy = (id: string, rarity: string, n: number) =>
      elements['shop-view'].listeners['click'].forEach((l) =>
        l({ target: { closest: () => ({ dataset: { buy: id, rarity, n: String(n) } }) } }),
      );
    buy('idle.disco', 'common', 20);
    buy('food.fish', 'common', 100);

    expect(shop()).toContain('Unlocked 🐟 fresh fish!');
    expect(shop()).toContain('Spare toys: 0 common - 1 rare');
    expect(shop().match(/✅ Unlocked/g)).toHaveLength(2);
    expect(elements['food-picker'].hidden).toBe(false);
    expect(elements['food-picker'].innerHTML).toContain('data-food="fish" class="active"');
    const saves = vscodeApi.postMessage.mock.calls
      .map(([m]) => m)
      .filter((m) => m.command === 'save-state');
    expect(saves[saves.length - 1].state).toMatchObject({
      bag: { yarn: 90, box: 32, rocket: 2 },
      spent: { yarn: 89, box: 31 },
      unlocks: ['idle.disco', 'food.fish'],
      food: 'fish',
    });

    // Nothing left to pay with, so a second purchase does nothing.
    buy('idle.magic', 'common', 20);
    expect(shop()).not.toContain('Unlocked 🎩');
  });

  it('keeps the care tool in hand after closing the panel until Esc', () => {
    const { send, pressCare, elements, documentListeners } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    const toggleCare = () => elements['care-toggle'].listeners['click'].forEach((l) => l({}));
    toggleCare();
    pressCare('feed');
    toggleCare();
    expect(elements['care-panel'].hidden).toBe(true);
    expect(elements['care-toggle'].textContent).toBe('🍖');

    documentListeners['keydown'].forEach((l) => l({ key: 'Escape' }));
    send({ command: 'care-update', stats: { fullness: 50, fun: 50, clean: 50 } });
    expect(elements['care-toggle'].textContent).toBe('🐾');
  });

  it('opening another panel puts the care tool away', () => {
    const { send, pressCare, elements } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    elements['care-toggle'].listeners['click'].forEach((l) => l({}));
    pressCare('feed');
    elements['bag-toggle'].listeners['click'].forEach((l) => l({}));
    expect(elements['care-toggle'].textContent).toBe('🐾');
  });

  it('logs a failing frame, keeps going, and asks for a refresh if it keeps failing', () => {
    jest.useFakeTimers();
    try {
      const { send, runFrames, vscodeApi } = runWebviewScript({ allowErrors: true });
      send({ command: 'init', config: { ...CONFIG, species: 'dragon' }, state: {} });
      runFrames(11500, 100);
      const sent = vscodeApi.postMessage.mock.calls.map(([m]) => m);
      const errors = sent.filter((m) => m.command === 'log' && m.level === 'error');
      expect(errors[0].message).toContain('Frame failed');
      expect(errors.filter((m) => m.message?.startsWith('Frame failed'))).toHaveLength(1);
      expect(sent.some((m) => m.command === 'refresh')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the same animation for the same agent in two windows', () => {
    const a = runWebviewScript();
    const b = runWebviewScript();
    const config = { ...CONFIG, variety: 'random' };
    const labels = new Set<string>();
    for (const w of [a, b]) {
      w.send({ command: 'init', config, state: { petX: 0, petY: 30 } });
    }
    const states = ['running', 'testing', 'reading', 'running', 'browsing', 'done', 'error'];
    states.forEach((state, i) => {
      const seen = [a, b].map((w) => {
        // Each window numbers updates its own way; only `since` is shared.
        w.send({
          command: 'claude-update',
          main: {
            sessionId: 's1',
            state,
            detail: 'x',
            seq: i + (w === a ? 1 : 50),
            since: i * 1000,
            project: null,
          },
          subagents: [],
          sessions: [],
        });
        w.hover(50, 80);
        return w.tooltip.innerHTML.split('</b> is ')[1].split('<br>')[0];
      });
      expect(seen[0]).toBe(seen[1]);
      labels.add(seen[0]);
    });
    expect(labels.size).toBeGreaterThan(2);
  });

  it('picks up shop purchases made in another window', () => {
    const { send, elements } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    send({ command: 'unlocks', unlocks: ['food.cake'] });
    expect(elements['food-picker'].hidden).toBe(false);
    expect(elements['food-picker'].innerHTML).toContain('data-food="cake"');
  });

  it('has toy, collection and shop tabs; the collection picks food and switches animations', () => {
    const { send, elements, vscodeApi } = runWebviewScript();
    send({
      command: 'init',
      config: CONFIG,
      state: { petX: 0, petY: 30, bag: { yarn: 1 }, unlocks: ['idle.disco', 'food.cake'] },
    });
    elements['bag-toggle'].listeners['click'].forEach((l) => l({}));
    expect(elements['bag-tabs'].innerHTML).toContain('data-tab="toys" class="active"');
    expect(elements['bag-tabs'].innerHTML).toContain('data-tab="collection"');
    expect(elements['bag-tabs'].innerHTML).toContain('data-tab="shop"');

    const tab = (name: string) =>
      elements['bag-tabs'].listeners['click'].forEach((l) =>
        l({ target: { closest: () => ({ dataset: { tab: name } }) } }),
      );
    const clickIn = (dataset: Record<string, string>) =>
      elements['collection-view'].listeners['click'].forEach((l) =>
        l({
          target: {
            closest: (sel: string) => (sel.includes(Object.keys(dataset)[0]) ? { dataset } : null),
          },
        }),
      );
    tab('collection');
    expect(elements['collection-view'].hidden).toBe(false);
    expect(elements['bag-view'].hidden).toBe(true);
    // 8 animations, 4 foods and the starter house's 2 extra rooms.
    expect(elements['bag-title'].textContent).toContain('2/14 unlocked');
    expect(elements['collection-view'].innerHTML).toContain('data-food="kibble" class="active"');
    expect(elements['collection-view'].innerHTML).toContain('data-anim="idle.disco" class="on"');

    clickIn({ food: 'cake' });
    expect(elements['collection-view'].innerHTML).toContain('data-food="cake" class="active"');
    clickIn({ anim: 'idle.disco' });
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      command: 'setting',
      key: 'disabledActions',
      value: ['idle.disco'],
    });
    expect(elements['collection-view'].innerHTML).toContain('data-anim="idle.disco"');
    expect(elements['collection-view'].innerHTML).not.toContain('class="on"');
  });

  it('gathers a debug snapshot from the settings panel', () => {
    const { send, elements, vscodeApi } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    elements['gather-logs'].listeners['click'].forEach((l) => l({}));
    const msg = vscodeApi.postMessage.mock.calls
      .map(([m]) => m)
      .find((m) => m.command === 'gather-logs') as { snapshot: string };
    expect(JSON.parse(msg.snapshot)).toMatchObject({
      pet: { state: 'sleeping' },
      config: { species: 'fox' },
    });
  });

  it('clicking a toy on the floor wakes the pet to play with it; right-click puts it away', () => {
    jest.useFakeTimers();
    try {
      const { send, elements, hover, click, rightClick, runFrames, tooltip } = runWebviewScript();
      send({
        command: 'init',
        config: { ...CONFIG, toys: true },
        state: { petX: 300, petY: 30, bag: { yarn: 1 } },
      });
      elements['bag-toggle'].listeners['click'].forEach((l) => l({}));
      elements['bag-grid'].listeners['click'].forEach((l) =>
        l({ target: { closest: () => ({ dataset: { toy: 'yarn' } }) } }),
      );
      runFrames(400);
      // Find the yarn on the pet's floor line by its tooltip.
      let at = -1;
      for (let x = 0; x <= 600 && at < 0; x += 5) {
        hover(x, 187);
        if (tooltip.innerHTML.includes('ball of yarn')) {
          at = x;
        }
      }
      expect(at).toBeGreaterThanOrEqual(0);
      expect(tooltip.innerHTML).toContain('click to flick it');

      click(at, 187);
      runFrames(1500);
      hover(396, 120);
      expect(tooltip.innerHTML).toContain('playing with the ball of yarn');

      // The yarn rolls and gets batted about at random, so look for it again each try.
      const findYarn = () => {
        for (let y = 140; y <= 200; y += 5) {
          for (let x = 0; x <= 600; x += 5) {
            hover(x, y);
            // The pet's own tooltip also names the yarn while playing with it.
            if (tooltip.innerHTML.includes('right-click to put it away')) {
              return { x, y };
            }
          }
        }
        return null;
      };
      let stored = false;
      for (let i = 0; i < 40 && !stored; i++) {
        const yarn = findYarn();
        if (yarn) {
          rightClick(yarn.x, yarn.y);
        }
        runFrames(600);
        stored = !elements['bag-grid'].innerHTML.includes('class="toy out"');
      }
      expect(stored).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('opening one corner panel closes the others', () => {
    const { elements } = runWebviewScript();
    elements['care-toggle'].listeners['click'].forEach((l) => l({}));
    elements['settings-toggle'].listeners['click'].forEach((l) => l({}));
    expect(elements['settings-panel'].hidden).toBe(false);
    expect(elements['care-panel'].hidden).toBe(true);
  });

  it('settings switches reflect the config and send changes to the extension', () => {
    const { send, switches, vscodeApi } = runWebviewScript();
    send({ command: 'init', config: { ...CONFIG, toys: false }, state: null });
    const variety = switches.find((s) => s.dataset.setting === 'variety')!;
    const toys = switches.find((s) => s.dataset.setting === 'toys')!;
    expect(variety.checked).toBe(false);
    expect(toys.checked).toBe(false);
    toys.checked = true;
    toys.listeners['change'].forEach((l) => l({}));
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      command: 'setting',
      key: 'toys',
      value: true,
    });
  });

  it('lists every action with a tick and sends the ones you untick', () => {
    const { send, elements, vscodeApi } = runWebviewScript();
    send({
      command: 'init',
      config: { ...CONFIG, disabledActions: ['sleeping.belly'] },
      state: null,
    });
    const list = elements['action-list'];
    expect(list.innerHTML).toContain('data-action="running.zoomies" checked');
    expect(list.innerHTML).toContain('data-action="idle.circles" checked');
    expect(list.innerHTML).toMatch(/data-action="sleeping.belly"\s*\/>/);

    list.listeners['change'].forEach((l) =>
      l({ target: { dataset: { action: 'running.zoomies' }, checked: false } }),
    );
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      command: 'setting',
      key: 'disabledActions',
      value: ['sleeping.belly', 'running.zoomies'],
    });
  });

  it('puts the care tool away when the agent starts working', () => {
    jest.useFakeTimers();
    try {
      const { send, runFrames, pressCare, elements } = runWebviewScript();
      send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
      send(working('idle'));
      elements['care-toggle'].listeners['click'].forEach((l) => l({}));
      pressCare('treat');
      send({ ...working('running'), main: { ...working('running').main, seq: 8 } });
      runFrames(50);
      expect(elements['care-note'].textContent).toContain('work to do');
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['sleeping', 'napping'],
    ['idle', 'chilling'],
    ['waking', 'waking up'],
    ['thinking', 'thinking'],
    ['reading', 'reading'],
    ['writing', 'writing code'],
    ['running', 'running commands'],
    ['testing', 'running tests'],
    ['browsing', 'browsing the web'],
    ['delegating', 'bossing helpers around'],
    ['waiting', 'waiting for you'],
    ['error', 'grumpy'],
    ['done', 'all done!'],
  ])('acts out the %s state', (state, label) => {
    jest.useFakeTimers();
    try {
      const { send, hover, tooltip, runFrames } = runWebviewScript();
      send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
      send({
        command: 'claude-update',
        main: { sessionId: 's', state, detail: '', seq: 2, project: 'app' },
        subagents: [],
        sessions: [],
      });
      // A napping pet stretches and yawns before it gets to work.
      for (let i = 0; i < 50 && state !== 'waking'; i++) {
        hover(50, 80);
        if (!tooltip.innerHTML.includes('waking up')) {
          break;
        }
        runFrames(100);
      }
      hover(50, 80);
      expect(tooltip.innerHTML).toContain(`<b>Rusty</b> is ${label}`);
      expect(tooltip.innerHTML).toContain('in app');
    } finally {
      jest.useRealTimers();
    }
  });

  it('reacts to peon-ping events and ignores ones it does not know', () => {
    const { send, hover, tooltip } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    send({ command: 'peon-event', anim: 'celebrate' });
    hover(50, 80);
    expect(tooltip.innerHTML).toContain('all done!');

    send({ command: 'peon-event', anim: 'moonwalk' });
    hover(50, 80);
    expect(tooltip.innerHTML).toContain('all done!');
  });

  it('dragging the pet moves it and remembers where it was dropped', () => {
    const { send, canvasListeners, documentListeners, vscodeApi } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    vscodeApi.postMessage.mockClear();

    canvasListeners['mousedown'].forEach((l) =>
      l({ button: 0, offsetX: 50, offsetY: 80, preventDefault: () => undefined }),
    );
    documentListeners['mousemove'].forEach((l) => l({ clientX: 90, clientY: 90 }));
    documentListeners['mousemove'].forEach((l) => l({ clientX: 120, clientY: 100 }));
    documentListeners['mouseup'].forEach((l) => l({}));

    expect(vscodeApi.setState).toHaveBeenCalledWith(
      expect.objectContaining({ petX: 70, petY: 50 }),
    );
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      command: 'save-state',
      slot: '',
      state: expect.objectContaining({ petX: 70, petY: 50 }),
    });
  });

  it('keeps a dragged pet inside the panel', () => {
    const { send, canvasListeners, documentListeners, vscodeApi } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    canvasListeners['mousedown'].forEach((l) =>
      l({ button: 0, offsetX: 50, offsetY: 80, preventDefault: () => undefined }),
    );
    documentListeners['mousemove'].forEach((l) => l({ clientX: 5000, clientY: -5000 }));
    documentListeners['mouseup'].forEach((l) => l({}));

    // 600px panel, 192px pet: x stops at 408, y at the 24px header.
    expect(vscodeApi.setState).toHaveBeenCalledWith(
      expect.objectContaining({ petX: 408, petY: 24 }),
    );
  });

  it('renames the pet live when the settings change', () => {
    const { send, hover, tooltip } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    send({ command: 'reinit', config: { ...CONFIG, name: 'Duchess', species: 'cat' } });
    hover(50, 80);
    expect(tooltip.innerHTML).toContain('<b>Duchess</b>');
  });

  it.each([null, 'init', 7, {}, { command: 'explode' }])('ignores the message %p', (data) => {
    const { send, hover, tooltip } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    expect(() => send(data)).not.toThrow();
    hover(50, 80);
    expect(tooltip.innerHTML).toContain('<b>Rusty</b>');
  });

  it('asks for a window reload instead of crashing when loaded without its helper scripts', () => {
    const { body, vscodeApi } = runWebviewScript({ libs: false });
    expect(body.html).toContain('Pet Agents was updated');
    expect(body.html).toContain('Developer: Reload Window');
    // Only a log line for the output channel; it never says ready.
    expect(vscodeApi.postMessage.mock.calls).toEqual([
      [expect.objectContaining({ command: 'log', level: 'warn' })],
    ]);
  });

  it('dresses up for holidays, and not when holidays are off', () => {
    jest.useFakeTimers();
    try {
      const { send, hover, tooltip, runFrames } = runWebviewScript();
      send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
      send({ command: 'calendar', day: '2026-10-30', events: ['halloween'], season: 'autumn' });
      runFrames(3000);
      hover(50, 80);
      expect(tooltip.innerHTML).toContain('Halloween');

      send({ command: 'reinit', config: { ...CONFIG, holidays: false } });
      runFrames(100);
      hover(50, 80);
      expect(tooltip.innerHTML).not.toContain('Halloween');
    } finally {
      jest.useRealTimers();
    }
  });

  it('draws every holiday at once without errors', () => {
    jest.useFakeTimers();
    try {
      const { send, runFrames } = runWebviewScript();
      send({
        command: 'init',
        config: { ...CONFIG, artStyle: 'pixel' },
        state: { petX: 0, petY: 30 },
      });
      send({
        command: 'calendar',
        day: '2026-12-31',
        events: ['newyear', 'valentine', 'easter', 'halloween', 'thanksgiving', 'christmas'],
        season: 'winter',
      });
      runFrames(6000);
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores a malformed calendar', () => {
    const { send } = runWebviewScript();
    send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    send({ command: 'calendar', events: 'halloween' });
    send({ command: 'calendar', events: ['not-a-holiday'] });
  });

  /** The view's own debug snapshot, via the settings panel button. */
  function snapshotOf(h: ReturnType<typeof runWebviewScript>): Record<string, unknown> {
    h.elements['gather-logs'].listeners['click'].forEach((l) => l({}));
    const msg = h.vscodeApi.postMessage.mock.calls
      .map(([m]) => m)
      .filter((m) => m.command === 'gather-logs')
      .pop() as unknown as { snapshot: string };
    return JSON.parse(msg.snapshot);
  }

  const clickEl = (el: { listeners: Record<string, Array<(e: unknown) => void>> }, target = {}) =>
    el.listeners['click'].forEach((l) => l({ target }));

  const PROGRESS = {
    command: 'progress-update',
    level: 3,
    xp: 350,
    floor: 300,
    next: 600,
    week: '2026-10-19',
    weekXp: 120,
    challenges: [
      { id: 'tests', emoji: '🧪', text: 'Pass 5 test runs', progress: 2, target: 5, done: false },
      {
        id: 'record',
        emoji: '🏆',
        text: 'Set a weekly prompt record',
        progress: 1,
        target: 1,
        done: true,
      },
    ],
  };

  const RECORDS = {
    command: 'records-update',
    week: '2026-10-19',
    records: [
      {
        id: 'busiest',
        emoji: '⚙️',
        title: 'Busiest prompt',
        value: '40 actions in 9m 00s',
        project: 'app',
        preview: 'make <b>it</b> fast',
        endedAt: 1,
      },
    ],
    hallOfFame: [],
    totals: { prompts: 3, actions: 50, subagents: 1, agentMs: 600000, agentTime: '10m 00s' },
    broken: [],
  };

  it('shows the level, challenges and records in the trophy panel, escaping prompt text', () => {
    const h = runWebviewScript();
    h.send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    h.send(PROGRESS);
    h.send(RECORDS);
    clickEl(h.elements['trophy-toggle']);
    expect(h.elements['trophy-panel'].hidden).toBe(false);
    const level = h.elements['trophy-view'].innerHTML;
    expect(level).toContain('Level 3');
    expect(level).toContain('Pass 5 test runs');
    expect(level).toContain('2/5');
    expect(level).toContain('class="challenge done"');
    h.elements['trophy-tabs'].listeners['click'].forEach((l) =>
      l({ target: { closest: () => ({ dataset: { tab: 'records' } }) } }),
    );
    const board = h.elements['trophy-view'].innerHTML;
    expect(board).toContain('Busiest prompt');
    expect(board).toContain('40 actions in 9m 00s');
    expect(board).toContain('&lt;b&gt;it&lt;/b&gt;');
    expect(board).not.toContain('<b>it</b>');
    expect(board).not.toContain('all-time best');
    h.send({ ...RECORDS, records: [{ ...RECORDS.records[0], allTime: true }] });
    expect(h.elements['trophy-view'].innerHTML).toContain('title="Also your all-time best"');
  });

  it('hides the buttons for switched-off features and closes their panels', () => {
    const h = runWebviewScript();
    h.send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    expect(h.elements['trophy-toggle'].hidden).toBe(false);
    expect(h.elements['house-toggle'].hidden).toBe(false);
    clickEl(h.elements['house-toggle']);
    expect(h.elements['house-panel'].hidden).toBe(false);
    h.send({
      command: 'reinit',
      config: { ...CONFIG, levels: false, records: false, house: false },
    });
    expect(h.elements['trophy-toggle'].hidden).toBe(true);
    expect(h.elements['house-toggle'].hidden).toBe(true);
    expect(h.elements['house-panel'].hidden).toBe(true);
  });

  it('furnishes the house with what the level unlocks, and saves it', () => {
    const h = runWebviewScript();
    h.send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    h.send({ ...PROGRESS, level: 2 });
    clickEl(h.elements['house-toggle']);
    const items = h.elements['house-items'].innerHTML;
    expect(items).toContain('data-furniture="bed"');
    expect(items).toContain('data-furniture="plant"');
    expect(items).not.toContain('data-furniture="sofa"');
    expect(items).toContain('unlocks at level 6');
    h.elements['house-items'].listeners['click'].forEach((l) =>
      l({ target: { closest: () => ({ dataset: { furniture: 'bed' } }) } }),
    );
    const saved = h.vscodeApi.postMessage.mock.calls
      .map(([m]) => m as unknown as { command: string; layout?: Layout })
      .filter((m) => m.command === 'house-save')
      .pop();
    expect(saved?.layout?.houses['starter']['living'].items.map((i) => i.id)).toEqual(['bed']);
    expect(snapshotOf(h)).toMatchObject({ inHouse: true });
    // A locked theme can't be picked.
    const saves = () =>
      h.vscodeApi.postMessage.mock.calls.filter(([m]) => m.command === 'house-save').length;
    const before = saves();
    h.elements['house-themes'].listeners['click'].forEach((l) =>
      l({ target: { closest: () => ({ dataset: { theme: 'space' } }) } }),
    );
    expect(saves()).toBe(before);
    h.elements['house-themes'].listeners['click'].forEach((l) =>
      l({ target: { closest: () => ({ dataset: { theme: 'cozy' } }) } }),
    );
    expect(saves()).toBe(before + 1);
  });

  it('lets you drag furniture around the room', () => {
    jest.useFakeTimers();
    try {
      const h = runWebviewScript();
      h.send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
      h.send({
        command: 'house',
        layout: {
          at: { house: 'starter', room: 'living', changedAt: 0 },
          houses: {
            starter: {
              living: { items: [{ id: 'bed', x: 0.8, y: 0.5, at: 1 }], theme: 'cozy', themeAt: 0 },
            },
          },
        },
      });
      clickEl(h.elements['house-toggle']);
      h.runFrames(100);
      let bed: { x: number; y: number } | null = null;
      for (let y = 100; y <= 260 && !bed; y += 4) {
        for (let x = 300; x <= 600 && !bed; x += 4) {
          h.hover(x, y);
          if (h.tooltip.innerHTML.includes('Drag to move it')) {
            bed = { x, y };
          }
        }
      }
      expect(bed).not.toBeNull();
      h.canvasListeners['mousedown'].forEach((l) =>
        l({ button: 0, offsetX: bed!.x, offsetY: bed!.y, preventDefault: () => undefined }),
      );
      h.documentListeners['mousemove'].forEach((l) => l({ clientX: 60, clientY: bed!.y }));
      h.documentListeners['mouseup'].forEach((l) => l({}));
      const saved = h.vscodeApi.postMessage.mock.calls
        .map(([m]) => m as unknown as { command: string; layout?: Layout })
        .filter((m) => m.command === 'house-save')
        .pop();
      expect(saved?.layout?.houses['starter']['living'].items[0].x).toBeLessThan(0.3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('lets bugs in for failing runs and squashes them on the next pass', () => {
    jest.useFakeTimers();
    try {
      const h = runWebviewScript();
      h.send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
      const update = (outcomes: object[]) => ({
        command: 'claude-update',
        main: { sessionId: 's', state: 'idle', detail: '', seq: 1, project: 'app', outcomes },
        subagents: [],
        sessions: [],
      });
      const fail = { id: 't1', kind: 'test', ok: false, at: Date.now() };
      const buildFail = { id: 'b1', kind: 'build', ok: false, at: Date.now() };
      h.send(update([fail, buildFail]));
      h.runFrames(200);
      expect(snapshotOf(h)).toMatchObject({ enemies: 2 });
      // The same outcomes again change nothing.
      h.send(update([fail, buildFail]));
      expect(snapshotOf(h)).toMatchObject({ enemies: 2 });
      h.send(update([fail, buildFail, { id: 't2', kind: 'test', ok: true, at: Date.now() }]));
      h.runFrames(1000);
      expect(snapshotOf(h)).toMatchObject({ enemies: 1 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('leaves old failures and switched-off enemies alone', () => {
    const h = runWebviewScript();
    h.send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
    const old = Date.now() - 9 * 3600000;
    h.send({
      command: 'claude-update',
      main: {
        sessionId: 's',
        state: 'idle',
        detail: '',
        seq: 1,
        outcomes: [{ id: 'old', kind: 'test', ok: false, at: old }],
      },
      subagents: [],
      sessions: [],
    });
    expect(snapshotOf(h)).toMatchObject({ enemies: 0 });
    h.send({ command: 'reinit', config: { ...CONFIG, enemies: false } });
    h.send({
      command: 'claude-update',
      main: {
        sessionId: 's',
        state: 'idle',
        detail: '',
        seq: 2,
        outcomes: [{ id: 'new', kind: 'test', ok: false, at: Date.now() }],
      },
      subagents: [],
      sessions: [],
    });
    expect(snapshotOf(h)).toMatchObject({ enemies: 0 });
  });

  it('pulls the pet out of its house when the agent starts work', () => {
    jest.useFakeTimers();
    try {
      const h = runWebviewScript();
      h.send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
      clickEl(h.elements['house-toggle']);
      h.runFrames(100);
      expect(h.elements['house-panel'].hidden).toBe(false);
      h.send({
        command: 'claude-update',
        main: { sessionId: 's', state: 'writing', detail: 'Edit a.ts', seq: 1, project: 'app' },
        subagents: [],
        sessions: [],
      });
      h.runFrames(100);
      expect(h.elements['house-panel'].hidden).toBe(true);
      expect(snapshotOf(h)).toMatchObject({ inHouse: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it('cheers level-ups and XP without errors', () => {
    jest.useFakeTimers();
    try {
      const h = runWebviewScript();
      h.send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 } });
      h.send({ ...PROGRESS, level: 1, xp: 90, floor: 0, next: 100 });
      h.send({ ...PROGRESS, level: 1, xp: 95, floor: 0, next: 100 });
      h.send({ ...PROGRESS, level: 2, xp: 120, floor: 100, next: 300 });
      h.send({ ...RECORDS, broken: ['busiest'] });
      h.runFrames(2000);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('bags, houses and saves in the view', () => {
  type Harness = ReturnType<typeof runWebviewScript>;
  type El = Harness['elements'][string];
  const click = (el: El, dataset: Record<string, string> = {}) =>
    el.listeners['click'].forEach((l) =>
      l({
        target: {
          closest: (sel: string) =>
            Object.keys(dataset).some((k) =>
              sel.includes(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)),
            )
              ? { dataset }
              : null,
        },
      }),
    );
  const level = (h: Harness, n: number) =>
    h.send({
      command: 'progress-update',
      level: n,
      xp: 50 * (n - 1) * n,
      floor: 0,
      next: 1e9,
      week: '2026-10-19',
      weekXp: 0,
      challenges: [],
      finished: false,
    });
  const sent = (h: Harness, command: string) =>
    h.vscodeApi.postMessage.mock.calls
      .map(([m]) => m as Record<string, unknown>)
      .filter((m) => m.command === command);
  function snapshotOf(h: Harness): Record<string, unknown> {
    h.elements['gather-logs'].listeners['click'].forEach((l) => l({}));
    const msg = sent(h, 'gather-logs').pop() as { snapshot: string };
    return JSON.parse(msg.snapshot);
  }
  function start(state: Record<string, unknown> = {}, config: Record<string, unknown> = {}) {
    const h = runWebviewScript();
    h.send({
      command: 'init',
      config: { ...CONFIG, ...config },
      state: { petX: 0, petY: 30, ...state },
      bags: BAG_LEVELS,
      slot: 'slot-one',
    });
    return h;
  }
  const PROFILE = {
    version: 1,
    id: '2026-01-02-biscuit',
    name: "Biscuit's first save",
    createdAt: new Date(2026, 0, 2).getTime(),
    endedAt: new Date(2026, 7, 9).getTime(),
    finished: true,
    guest: false,
    pet: {
      species: 'dog',
      color: '#b9804a',
      accentColor: '',
      eyeColor: '',
      pattern: '',
      accessory: '',
      accessoryColor: '',
      name: 'Biscuit',
      style: 'chefHat',
    },
    progress: { xp: 61000, level: 35 },
    bag: { found: { bone: 3, crab: 2 }, spent: {}, unlocks: ['idle.disco'], activeBag: 'ocean' },
    house: {
      at: { house: 'ocean', room: 'hut', changedAt: 1 },
      houses: {
        ocean: { hut: { items: [{ id: 'shellbed', x: 0.5, y: 0, at: 1 }], theme: 'coral' } },
      },
    },
    care: { fullness: 12, fun: 34, clean: 56, updatedAt: 1 },
    summary: {
      days: 219,
      level: 35,
      xp: 61000,
      prompts: 9,
      actions: 9,
      agentHours: 1,
      toys: 2,
      bags: 20,
      houses: 1,
      rooms: 1,
      records: 0,
    },
  };

  it('shows every bag in the picker, locked ones with the level that opens them', () => {
    const h = start({ bag: { yarn: 2 } });
    level(h, 3);
    click(h.elements['bag-toggle']);
    const picker = h.elements['bag-picker'].innerHTML;
    expect(picker).toContain('data-bag="starter" class="active"');
    expect(picker).toContain('data-bag="garden"');
    expect(picker).toContain('data-bag="ocean"');
    expect(picker).not.toContain('data-bag="kitchen"');
    expect(picker).toContain('Kitchen bag: unlocks at level 4');
    expect(h.elements['bag-title'].textContent).toBe('🎒 Starter - 1/24 found - 3/20 bags');
    expect(h.elements['bag-odds'].textContent).toMatch(
      /\d+% common - \d+% uncommon - \d+% rare - \d+% legendary$/,
    );
  });

  it('switching bags changes the toys, collection and shop tabs, and tells the extension', () => {
    const h = start({ bag: { yarn: 30, sunflower: 21 } });
    level(h, 2);
    click(h.elements['bag-toggle']);
    click(h.elements['bag-picker'], { bag: 'garden' });
    expect(sent(h, 'bag-switch')).toEqual([
      { command: 'bag-switch', bag: 'garden', slot: 'slot-one' },
    ]);
    expect(h.elements['bag-title'].textContent).toMatch(/^🌻 Garden - 1\/12 found/);
    expect(h.elements['bag-grid'].innerHTML).toContain('data-toy="sunflower"');
    expect(h.elements['bag-grid'].innerHTML).not.toContain('data-toy="yarn"');
    click(h.elements['bag-tabs'], { tab: 'shop' });
    const shop = h.elements['shop-view'].innerHTML;
    expect(shop).toContain('Spare toys: 20 common - 0 rare');
    expect(shop).toContain('data-buy="garden.idle.buzz"');
    expect(shop).toContain('data-buy="garden.furniture.fountain"');
    expect(shop).toContain('data-buy="garden.room.patch"');
    expect(shop).toContain('data-buy="garden.style.flowerCrownSunny"');
    expect(shop).not.toContain('idle.disco');
    click(h.elements['bag-tabs'], { tab: 'collection' });
    const coll = h.elements['collection-view'].innerHTML;
    expect(coll).toContain('data-anim="idle.watering" class="on"');
    expect(coll).toContain('data-style="flowerCrown"');
    // A locked bag can't be picked.
    click(h.elements['bag-picker'], { bag: 'vault' });
    expect(sent(h, 'bag-switch')).toHaveLength(1);
  });

  it('a shop only spends spares from its own bag, and wearing a bought style posts it', () => {
    const h = start({ bag: { yarn: 90, sunflower: 26 } });
    level(h, 2);
    click(h.elements['bag-toggle']);
    click(h.elements['bag-picker'], { bag: 'garden' });
    click(h.elements['bag-tabs'], { tab: 'shop' });
    const buy = (id: string, n: number) =>
      click(h.elements['shop-view'], { buy: id, rarity: 'common', n: String(n) });
    buy('garden.food.salad', 100);
    expect(h.elements['shop-view'].innerHTML).not.toContain('Unlocked');
    buy('garden.style.flowerCrownSunny', 25);
    expect(h.elements['shop-view'].innerHTML).toContain('Unlocked 🐾 sunny flower crown!');
    const save = sent(h, 'save-state').pop() as { state: { spent: object; unlocks: string[] } };
    expect(save.state.spent).toEqual({ sunflower: 25 });
    expect(save.state.unlocks).toEqual(['garden.style.flowerCrownSunny']);
    expect(sent(h, 'setting').pop()).toEqual({
      command: 'setting',
      key: 'style',
      value: 'flowerCrownSunny',
    });
    click(h.elements['bag-tabs'], { tab: 'collection' });
    click(h.elements['collection-view'], { style: 'none' });
    expect(sent(h, 'setting').pop()).toMatchObject({ key: 'style', value: 'none' });
  });

  it('follows a bag switch made in another window', () => {
    const h = start();
    level(h, 3);
    click(h.elements['bag-toggle']);
    h.send({ command: 'unlocks', unlocks: [], activeBag: 'ocean' });
    expect(h.elements['bag-title'].textContent).toMatch(/^🌊 Ocean/);
  });

  it('names the new bag on the level-up banner, without errors', () => {
    jest.useFakeTimers();
    try {
      const h = start();
      level(h, 4);
      level(h, 5);
      h.runFrames(200);
      expect(snapshotOf(h)).toMatchObject({ activeBag: 'starter' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('switching house and room changes what is drawn and saved; a locked room stays shut', () => {
    jest.useFakeTimers();
    try {
      const h = start();
      level(h, 2);
      click(h.elements['house-toggle']);
      // The strip opens on the furniture, under a bar naming the room.
      expect(h.elements['house-rooms'].innerHTML).toContain('🏡 Living room');
      expect(h.elements['house-tabs'].innerHTML).toContain('data-tab="furniture" class="active"');
      expect(h.elements['house-items'].hidden).toBe(false);
      expect(h.elements['house-picker'].hidden).toBe(true);
      // The room name opens the rooms tab.
      click(h.elements['house-rooms'], { tab: 'rooms' });
      expect(h.elements['house-picker'].hidden).toBe(false);
      expect(h.elements['house-items'].hidden).toBe(true);
      expect(h.elements['house-picker'].innerHTML).toContain('data-house="garden"');
      expect(h.elements['house-picker'].innerHTML).toContain('data-room="living" class="active"');
      expect(h.elements['house-picker'].innerHTML).toContain('🔒 Kitchen');
      click(h.elements['house-picker'], { room: 'kitchen' });
      expect(h.elements['house-picker'].innerHTML).toContain('data-room="living" class="active"');
      click(h.elements['house-picker'], { house: 'garden' });
      expect(h.elements['house-picker'].innerHTML).toContain(
        'data-room="greenhouse" class="active"',
      );
      expect(h.elements['house-rooms'].innerHTML).toContain('🌿 Greenhouse');
      click(h.elements['house-rooms'], { step: '1' });
      expect(h.elements['house-rooms'].innerHTML).toContain('🌿 Potting shed');
      click(h.elements['house-rooms'], { step: '1' });
      click(h.elements['house-tabs'], { tab: 'furniture' });
      click(h.elements['house-items'], { furniture: 'leafbed' });
      const save = sent(h, 'house-save').pop() as {
        slot: string;
        layout: {
          at: { house: string };
          houses: Record<string, Record<string, { items: object[] }>>;
        };
      };
      expect(save.slot).toBe('slot-one');
      expect(save.layout.at.house).toBe('garden');
      expect(save.layout.houses['garden']['greenhouse'].items).toHaveLength(1);
      h.runFrames(100);
    } finally {
      jest.useRealTimers();
    }
  });

  it('lists this save, then earlier saves, then friends in the house menu', () => {
    const h = start();
    click(h.elements['house-toggle']);
    const entry = (id: string, name: string, guest = false) => ({
      ...PROFILE,
      id,
      guest,
      pet: { ...PROFILE.pet, name },
    });
    h.send({ command: 'profiles', profiles: [entry('a', 'Biscuit'), entry('b', 'Pip', true)] });
    const row = h.elements['house-profiles'].innerHTML;
    const order = ['🏠 Rusty', 'Biscuit', '👋 Friends', 'Pip'].map((s) => row.indexOf(s));
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(row).toContain('<img src="data:image/png');
    expect(row).toContain('Biscuit🏁');
    expect(row).not.toContain('💯');
    click(h.elements['house-profiles'], { profile: 'a', guest: '0' });
    expect(sent(h, 'visit-profile')).toEqual([{ command: 'visit-profile', id: 'a', guest: false }]);
  });

  it('visiting an old save shows its pet alive in its house, read-only, with care frozen', () => {
    jest.useFakeTimers();
    try {
      const h = start({ bag: { yarn: 1 } }, { toys: true });
      level(h, 3);
      h.send({ command: 'care-update', stats: { fullness: 90, fun: 90, clean: 90 } });
      h.send({ command: 'profile', profile: PROFILE });
      expect(h.elements['house-panel'].hidden).toBe(false);
      expect(h.elements['house-note'].textContent).toMatch(
        /^Visiting Biscuit's first save \(finished/,
      );
      expect(h.elements['bag-toggle'].hidden).toBe(true);
      expect(h.elements['house-rooms'].innerHTML).toContain('🛖 Hut');
      const before = h.vscodeApi.postMessage.mock.calls.length;
      // Care is off, furniture doesn't move, nothing is saved, nothing is found.
      click(h.elements['care-toggle']);
      expect(h.elements['care-note'].textContent).toContain('Biscuit is happy just to see you');
      click(h.elements['care-toggle']);
      click(h.elements['house-items'], { furniture: 'bed' });
      h.runFrames(4 * 60 * 1000, 1000);
      h.hover(50, 80);
      expect(h.tooltip.innerHTML).toContain('<b>Biscuit</b>');
      expect(h.tooltip.innerHTML).toContain('Level 35');
      h.click(50, 80);
      const after = h.vscodeApi.postMessage.mock.calls.slice(before).map(([m]) => m.command);
      expect(
        after.filter((c) => ['save-state', 'house-save', 'care', 'found'].includes(c!)),
      ).toEqual([]);
      // Live updates wait for coming home.
      h.send({ command: 'care-update', stats: { fullness: 10, fun: 10, clean: 10 } });
      expect(snapshotOf(h)).toMatchObject({ visiting: true });
      // 🏠 comes home.
      click(h.elements['house-toggle']);
      expect(snapshotOf(h)).toMatchObject({ visiting: false, inHouse: true });
      expect(h.elements['bag-toggle'].hidden).toBe(false);
      h.hover(50, 80);
      expect(h.tooltip.innerHTML).toContain('<b>Rusty</b>');
      expect(h.tooltip.innerHTML).toContain('🍖 10');
    } finally {
      jest.useRealTimers();
    }
  });

  it('agent work brings you home from a visit', () => {
    jest.useFakeTimers();
    try {
      const h = start();
      h.send({ command: 'profile', profile: PROFILE });
      h.runFrames(100);
      h.send({
        command: 'claude-update',
        main: { sessionId: 's', state: 'writing', detail: 'Edit a.ts', seq: 1, project: 'app' },
        subagents: [],
        sessions: [],
      });
      h.runFrames(100);
      expect(snapshotOf(h)).toMatchObject({ visiting: false, inHouse: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it('an invited old pet comes over as a mini pet and leaves when sent home', () => {
    jest.useFakeTimers();
    try {
      const h = start();
      h.send({ command: 'profile', profile: PROFILE });
      click(h.elements['house-visit'], { visit: 'invite' });
      expect(snapshotOf(h)).toMatchObject({ visiting: false, guests: 1, minis: 1 });
      // Agent updates don't send it away.
      h.send({ command: 'claude-update', main: null, subagents: [], sessions: [] });
      h.runFrames(1000);
      expect(snapshotOf(h)).toMatchObject({ minis: 1 });
      expect(h.elements['house-visit'].innerHTML).toContain('Send Biscuit home');
      click(h.elements['house-visit'], { visit: `home:guest:${PROFILE.id}` });
      h.runFrames(1000);
      expect(snapshotOf(h)).toMatchObject({ guests: 0, minis: 0 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the finish screen and shares from it', () => {
    jest.useFakeTimers();
    try {
      const h = start();
      h.send({ command: 'finished', summary: PROFILE.summary, finished: true });
      expect(h.elements['finish-panel'].hidden).toBe(false);
      expect(h.elements['finish-body'].innerHTML).toContain('You finished Pet Agents!');
      expect(h.elements['finish-body'].innerHTML).toContain('Rusty the fox - 219 days - level 35');
      expect(h.elements['finish-actions'].innerHTML).toContain('Post to Bluesky');
      click(h.elements['finish-actions'], { finishAction: 'copy' });
      click(h.elements['finish-actions'], { finishAction: 'card' });
      click(h.elements['finish-actions'], { finishAction: 'x' });
      expect(sent(h, 'share-copy')).toEqual([
        { command: 'share-copy', toyTotal: expect.any(Number) },
      ]);
      expect(sent(h, 'share-card')[0].png).toMatch(/^data:image\/png;base64,/);
      expect(sent(h, 'share-post')).toEqual([
        { command: 'share-post', site: 'x', toyTotal: expect.any(Number) },
      ]);
      click(h.elements['finish-actions'], { finishAction: 'new' });
      expect(sent(h, 'new-save')).toHaveLength(1);
      expect(h.elements['finish-panel'].hidden).toBe(true);
      h.runFrames(500);
    } finally {
      jest.useRealTimers();
    }
  });

  it('hides the post buttons when sharing buttons are off', () => {
    const h = start({}, { shareButtons: false });
    h.send({ command: 'finished', summary: PROFILE.summary, finished: true });
    expect(h.elements['finish-actions'].innerHTML).not.toContain('Post to');
  });

  it('offers the 🏁 button in the level panel once finished, and the save actions in settings', () => {
    const h = start();
    h.send({
      command: 'progress-update',
      level: 35,
      xp: 59500,
      floor: 59500,
      next: 63000,
      week: '2026-10-19',
      weekXp: 0,
      challenges: [],
      finished: true,
    });
    click(h.elements['trophy-toggle']);
    expect(h.elements['trophy-view'].innerHTML).toContain('🏁 Finished');
    click(h.elements['trophy-view'], { finish: '1' });
    expect(sent(h, 'finish-open')).toHaveLength(1);
    click(h.elements['save-actions'], { save: 'new' });
    click(h.elements['save-actions'], { save: 'move-out' });
    click(h.elements['save-actions'], { save: 'export' });
    expect(sent(h, 'new-save')).toHaveLength(1);
    expect(sent(h, 'move-out')).toHaveLength(1);
    expect(sent(h, 'profile-export')).toEqual([{ command: 'profile-export', id: null }]);
  });

  it('plays every bag animation as every species without errors', () => {
    jest.useFakeTimers();
    try {
      for (const species of ['cat', 'dog', 'bird', 'fox']) {
        const h = start(
          { bag: { yarn: 1 }, unlocks: [] },
          { species, variety: 'random', toys: true, levels: false, style: 'spaceHelmet' },
        );
        for (const state of ['idle', 'thinking', 'running', 'done', 'sleeping', 'browsing']) {
          h.send({
            command: 'claude-update',
            main: { sessionId: 's', state, detail: '', seq: Math.random(), project: null },
            subagents: [],
            sessions: [],
          });
          h.runFrames(8000, 200);
        }
      }
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('visitors in the view', () => {
  type Harness = ReturnType<typeof runWebviewScript>;
  const snapshot = (h: Harness): Record<string, unknown> => {
    h.elements['gather-logs'].listeners['click'].forEach((l) => l({}));
    const msg = h.vscodeApi.postMessage.mock.calls
      .map(([m]) => m as unknown as { command: string; snapshot: string })
      .filter((m) => m.command === 'gather-logs')
      .pop()!;
    return JSON.parse(msg.snapshot);
  };
  const visitor = (kind: string, toy?: string) => ({
    command: 'visitor',
    kind,
    at: 1760000000000,
    stat: kind === 'feed' ? 'fullness' : kind === 'rain' ? 'clean' : 'fun',
    amount: 33,
    ...(toy ? { toy } : {}),
  });

  it.each(['feed', 'rain'])('acts out a %s visit, then the visitor leaves', (kind) => {
    jest.useFakeTimers();
    try {
      const h = runWebviewScript();
      h.send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 }, bags: BAG_LEVELS });
      h.runFrames(100);
      h.send(visitor(kind));
      h.runFrames(3000);
      expect(snapshot(h)).toMatchObject({ visitor: true });
      h.runFrames(8000, 50);
      expect(snapshot(h)).toMatchObject({ visitor: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it('a playmate takes a toy out of the bag and the pet plays with it', () => {
    jest.useFakeTimers();
    try {
      const h = runWebviewScript();
      h.send({
        command: 'init',
        config: CONFIG,
        state: { petX: 0, petY: 30, bag: { yarn: 2 } },
        bags: BAG_LEVELS,
      });
      h.runFrames(100);
      h.send(visitor('play', 'yarn'));
      h.runFrames(3000);
      h.elements['bag-toggle'].listeners['click'].forEach((l) => l({}));
      expect(h.elements['bag-grid'].innerHTML).toMatch(/class="toy out" data-toy="yarn"/);
      // A napping pet wakes up first, then plays.
      h.runFrames(1500);
      let playing = false;
      for (let y = 40; y <= 240 && !playing; y += 20) {
        for (let x = 0; x <= 400 && !playing; x += 20) {
          h.hover(x, y);
          playing = h.tooltip.innerHTML.includes('ball of yarn');
        }
      }
      expect(playing).toBe(true);
      // The playmate is a made-up fox, like Rusty.
      let friend = '';
      for (let y = 40; y <= 300 && !friend; y += 10) {
        for (let x = 0; x <= 600 && !friend; x += 10) {
          h.hover(x, y);
          friend = h.tooltip.innerHTML.includes('came over to play with Rusty')
            ? h.tooltip.innerHTML
            : '';
        }
      }
      expect(friend).toMatch(/<b>\w+ the fox<\/b>/);
      h.runFrames(12000, 50);
      expect(snapshot(h)).toMatchObject({ visitor: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it('a busy pet is fed but does not stop work to play', () => {
    jest.useFakeTimers();
    try {
      const h = runWebviewScript();
      h.send({
        command: 'init',
        config: CONFIG,
        state: { petX: 0, petY: 30, bag: { yarn: 2 } },
        bags: BAG_LEVELS,
      });
      h.send({
        command: 'claude-update',
        main: { sessionId: 's', state: 'writing', detail: 'Edit a.ts', seq: 1, project: 'app' },
        subagents: [],
        sessions: [],
      });
      h.send(visitor('play', 'yarn'));
      h.runFrames(4000);
      h.elements['bag-toggle'].listeners['click'].forEach((l) => l({}));
      expect(h.elements['bag-grid'].innerHTML).not.toMatch(/class="toy out"/);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the happy emote', () => {
  type Harness = ReturnType<typeof runWebviewScript>;
  const reaction = (h: Harness) => {
    h.elements['gather-logs'].listeners['click'].forEach((l) => l({}));
    const msg = h.vscodeApi.postMessage.mock.calls
      .map(([m]) => m as unknown as { command: string; snapshot: string })
      .filter((m) => m.command === 'gather-logs')
      .pop()!;
    return JSON.parse(msg.snapshot).pet.reaction;
  };
  const awake = () => {
    const h = runWebviewScript();
    h.send({ command: 'init', config: CONFIG, state: { petX: 0, petY: 30 }, bags: BAG_LEVELS });
    h.send({
      command: 'claude-update',
      main: { sessionId: 's', state: 'idle', detail: '', seq: 1, project: null },
      subagents: [],
      sessions: [],
    });
    h.send({ command: 'care-update', stats: { fullness: 20, fun: 20, clean: 20 } });
    return h;
  };

  it.each([
    ['feed', 'fullness'],
    ['rain', 'clean'],
  ])('plays after a visitor %s, as it does when you pet it', (kind, stat) => {
    jest.useFakeTimers();
    try {
      const h = awake();
      h.runFrames(500);
      h.send({ command: 'visitor', kind, at: 1, stat, amount: 33 });
      const seen = new Set<string | null>();
      for (let i = 0; i < 120; i++) {
        h.runFrames(100);
        seen.add(reaction(h));
      }
      expect(seen.has('pet')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('plays when the pet finishes eating what you fed it', () => {
    jest.useFakeTimers();
    try {
      const h = awake();
      h.runFrames(500);
      h.elements['care-toggle'].listeners['click'].forEach((l) => l({}));
      h.pressCare('feed');
      h.click(400, 150);
      const seen = new Set<string | null>();
      for (let i = 0; i < 100; i++) {
        h.runFrames(100);
        seen.add(reaction(h));
      }
      expect(seen.has('pet')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('waits until the agent is done', () => {
    jest.useFakeTimers();
    try {
      const h = awake();
      h.send({
        command: 'claude-update',
        main: { sessionId: 's', state: 'writing', detail: 'Edit a.ts', seq: 2, project: null },
        subagents: [],
        sessions: [],
      });
      h.send({ command: 'visitor', kind: 'feed', at: 1, stat: 'fullness', amount: 33 });
      const seen = new Set<string | null>();
      for (let i = 0; i < 80; i++) {
        h.runFrames(100);
        seen.add(reaction(h));
      }
      expect(seen.has('pet')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('collection progress', () => {
  // The catalogue, loaded as the page loads it, to know what a full starter collection is.
  const lib: Record<string, unknown> = {};
  for (const f of ['pets.js', 'states.js', 'play.js', 'variants.js', 'scene.js', 'house.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), 'media', f), 'utf8'), lib);
  }
  const Scene = lib['PetScene'] as {
    TOYS: Array<{ id: string; bag: string; rarity: string; after?: number }>;
  };
  const Variants = lib['PetVariants'] as { shopActions(bag: string): Array<{ id: string }> };
  const Play = lib['PetPlay'] as {
    FOODS: Array<{ id: string; emoji: string | null; bag?: string }>;
  };
  const House = lib['PetHouse'] as { HOUSES: Array<{ id: string; rooms: Array<{ id: string }> }> };
  const STARTER_TOYS = Scene.TOYS.filter(
    (t) => t.bag === 'starter' && t.rarity !== 'event' && !t.after,
  ).map((t) => t.id);
  const STARTER_SHOP = [
    ...Variants.shopActions('starter').map((a) => a.id),
    ...Play.FOODS.filter((f) => f.emoji && !f.bag).map((f) => `food.${f.id}`),
    ...House.HOUSES[0].rooms.slice(2).map((r) => `room.${r.id}`),
  ];

  function start(bag: Record<string, number>, unlocks: string[] = []) {
    const h = runWebviewScript();
    h.send({
      command: 'init',
      config: CONFIG,
      state: { petX: 0, petY: 30, bag, unlocks },
      bags: BAG_LEVELS,
      slot: 'slot-one',
    });
    h.runFrames(2500, 100);
    return h;
  }
  const reported = (h: ReturnType<typeof runWebviewScript>) =>
    h.vscodeApi.postMessage.mock.calls
      .map(([m]) => m as unknown as { command: string; complete?: string })
      .filter((m) => m.command === 'collection')
      .pop()?.complete;

  it('counts every toy without waiting for a holiday, then every shop item for 💯', () => {
    jest.useFakeTimers();
    try {
      const all = Object.fromEntries(STARTER_TOYS.map((id) => [id, 1]));
      expect(reported(start(all))).toBe('items');
      expect(reported(start(all, STARTER_SHOP))).toBe('all');
      const short = { ...all };
      delete short[STARTER_TOYS[0]];
      expect(reported(start(short, STARTER_SHOP))).toBe('');
      // Holiday toys make no difference either way.
      expect(reported(start({ ...short, pumpkin: 1, egg: 1 }))).toBe('');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows progress bars for toys, food, animations, room stuff and styles in the Profiles tab', () => {
    jest.useFakeTimers();
    try {
      const all = Object.fromEntries(STARTER_TOYS.map((id) => [id, 1]));
      const h = start(all, ['idle.disco', 'food.fish']);
      h.elements['house-toggle'].listeners['click'].forEach((l) => l({}));
      h.elements['house-tabs'].listeners['click'].forEach((l) =>
        l({ target: { closest: () => ({ dataset: { tab: 'profiles' } }) } }),
      );
      const html = h.elements['house-profiles'].innerHTML;
      expect(html).toContain("✅ Rusty's collection");
      expect(html).toMatch(
        /🧸 Bag items<\/span><div class="xp-track">.*?<span class="dim">24\/24</,
      );
      expect(html).toMatch(/🍽️ Shop food<\/span><div class="xp-track">.*?<span class="dim">1\/4</);
      expect(html).toMatch(
        /🎭 Shop animations<\/span><div class="xp-track">.*?<span class="dim">1\/8</,
      );
      expect(html).toMatch(/🛋️ Room stuff<\/span><div class="xp-track">.*?<span class="dim">0\/2</);
      expect(html).toMatch(/🐾 Pet styles<\/span><div class="xp-track">.*?<span class="dim">0\/0</);
      expect(html).toContain('style="width:100%"');
    } finally {
      jest.useRealTimers();
    }
  });
});
