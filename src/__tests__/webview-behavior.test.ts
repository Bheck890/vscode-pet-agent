import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

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

function runWebviewScript({ libs = true } = {}) {
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
    addEventListener: listenerTarget(canvasListeners),
  });
  const canvas = makeCanvas();

  const vscodeApi = { postMessage: jest.fn(), setState: jest.fn() };

  const fakeEl = (data: Record<string, string> = {}) => {
    const listeners: ListenerMap = {};
    return {
      hidden: true,
      disabled: false,
      checked: false,
      textContent: '',
      innerHTML: '',
      style: {} as Record<string, string>,
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
    'settings-toggle',
    'settings-panel',
    'action-list',
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
    requestAnimationFrame: (cb: () => void) => {
      frame = cb;
      return 0;
    },
    Date,
    console,
  };

  const media = path.join(process.cwd(), 'media');
  vm.runInNewContext(fs.readFileSync(path.join(media, 'pets.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(path.join(media, 'play.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(path.join(media, 'variants.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(path.join(media, 'scene.js'), 'utf8'), context);
  if (libs) {
    for (const lib of ['PetArt', 'PetPlay', 'PetVariants', 'PetScene']) {
      windowObj[lib] = context[lib];
    }
  }
  vm.runInNewContext(fs.readFileSync(path.join(media, 'webview.js'), 'utf8'), context);

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

  return {
    body,
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
        send({ command: 'init', config, state: { petX: 0, petY: 300 } });
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
    expect(elements['bag-title'].textContent).toContain('2/24 found');
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
    expect(vscodeApi.postMessage).not.toHaveBeenCalled();
  });
});
