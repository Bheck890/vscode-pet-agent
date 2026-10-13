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

function runWebviewScript() {
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

  const windowObj: Record<string, unknown> = {
    addEventListener: listenerTarget(windowListeners),
    devicePixelRatio: 1,
  };

  const context: Record<string, unknown> = {
    window: windowObj,
    document: {
      body: { clientWidth: 600, clientHeight: 600 },
      getElementById: (id: string) => (id === 'c' ? canvas : id === 'tooltip' ? tooltip : null),
      createElement: () => makeCanvas(),
      addEventListener: listenerTarget(documentListeners),
    },
    acquireVsCodeApi: () => vscodeApi,
    requestAnimationFrame: () => 0,
    console,
  };

  const media = path.join(process.cwd(), 'media');
  vm.runInNewContext(fs.readFileSync(path.join(media, 'pets.js'), 'utf8'), context);
  windowObj['PetArt'] = context['PetArt'];
  vm.runInNewContext(fs.readFileSync(path.join(media, 'webview.js'), 'utf8'), context);

  const send = (data: unknown) => windowListeners['message'].forEach((l) => l({ data }));
  const hover = (offsetX: number, offsetY: number) =>
    canvasListeners['mousemove'].forEach((l) => l({ offsetX, offsetY }));

  return { send, hover, tooltip, vscodeApi };
}

const CONFIG = { species: 'fox', color: '', name: 'Rusty', stateColors: true, size: 200 };

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
          cwd: 'C:\\tmp\\<b>x</b>',
        },
      ],
    });

    hover(14, 14);

    expect(tooltip.innerHTML).not.toContain('<b>x');
    expect(tooltip.innerHTML).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
