'use strict';

/**
 * Renders the real webview in headless Chrome and records the README
 * screenshots and GIFs into docs/images/, plus the marketplace icon.
 *
 *   npm run media            # everything
 *   npm run media -- hero    # only clips whose name contains "hero"
 *
 * Time, requestAnimationFrame and Math.random are faked inside the page, so
 * frames land exactly one GIF delay apart however slow the screenshots are,
 * and every run produces the same pictures.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer-core');
const { PNG } = require('pngjs');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const ROOT = path.join(__dirname, '..');
const MEDIA = path.join(ROOT, 'media');
const OUT = path.join(ROOT, 'docs', 'images');
const ICON = path.join(MEDIA, 'assets', 'icon.png');
/** GIF delays are in 1/100 s, so use a frame time that is a whole number of those. */
const FRAME_MS = 70;
const SIDEBAR_BG = [0x18, 0x18, 0x18, 255];

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

/** VS Code "Dark Modern" colours, so the shots look like the real sidebar. */
const THEME = `
  :root {
    --vscode-sideBar-background: #181818;
    --vscode-foreground: #cccccc;
    --vscode-font-family: 'Segoe UI', system-ui, sans-serif;
    --vscode-editorWidget-background: #202020;
    --vscode-widget-border: #313131;
    --vscode-button-background: #0078d4;
    --vscode-button-foreground: #ffffff;
    --vscode-button-secondaryBackground: #313131;
    --vscode-button-secondaryHoverBackground: #3c3c3c;
  }
  body { color: #cccccc; }
  html:has(body.transparent) { --vscode-sideBar-background: transparent; }
  body.transparent .corner, body.bare .corner { display: none; }
  #__cursor {
    position: fixed; left: -50px; top: 0; width: 14px; height: 21px;
    pointer-events: none; z-index: 100000;
    background: url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='21' viewBox='0 0 14 21'>` +
        `<path d='M1 1 L1 17 L5 13 L8 20 L10.5 19 L7.5 12 L13 12 Z' fill='white' stroke='black' stroke-width='1.2'/></svg>`,
    )}") no-repeat;
  }
`;

const FAKE_HOST = `
  (() => {
    const start = 1760000000000;
    let t = start;
    Date.now = () => t;
    performance.now = () => t - start;
    let seed = Number(new URLSearchParams(location.search).get('seed') || 1234567);
    Math.random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let queue = [];
    window.requestAnimationFrame = (cb) => queue.push(cb);
    window.cancelAnimationFrame = () => {};
    window.__advance = (ms) => {
      const step = 1000 / 60;
      for (let left = ms; left > 0; left -= step) {
        t += Math.min(step, left);
        const due = queue;
        queue = [];
        due.forEach((cb) => cb(t - start));
      }
    };
    window.__posts = [];
    window.acquireVsCodeApi = () => ({
      postMessage: (m) => window.__posts.push(m),
      setState: () => {},
      getState: () => undefined,
    });
    window.__send = (data) => window.dispatchEvent(new MessageEvent('message', { data }));
    // Pets draw their name centred under them, so the last label drawn says where a pet is.
    window.__labels = {};
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      window.__labels[text] = { x, y };
      return fillText.call(this, text, x, y, ...rest);
    };
    // Headless screenshots leave out the mouse pointer, so draw one.
    window.__showCursor = (on) => {
      let el = document.getElementById('__cursor');
      if (!el) {
        el = document.createElement('div');
        el.id = '__cursor';
        document.body.appendChild(el);
        document.addEventListener('mousemove', (e) => {
          el.style.left = e.clientX + 'px';
          el.style.top = e.clientY + 'px';
          el.style.visibility = document.getElementById('c').style.cursor === 'none' ? 'hidden' : '';
        }, true);
      }
      el.style.display = on ? 'block' : 'none';
    };
  })();
`;

const HARNESS = path.join(os.tmpdir(), 'pet-agents-harness.html');

function writeHarness() {
  const url = (f) => pathToFileURL(path.join(MEDIA, f)).href;
  const html = fs
    .readFileSync(path.join(MEDIA, 'webview.html'), 'utf8')
    .replace('<!--CSP_PLACEHOLDER-->', `<style>${THEME}</style><script>${FAKE_HOST}</script>`)
    .replace(/ nonce="<!--NONCE-->"/g, '')
    .replace(/<!--MEDIA:([\w.-]+)-->/g, (_m, file) => url(file));
  fs.writeFileSync(HARNESS, html);
}

function config(over = {}) {
  return {
    species: 'fox',
    color: '',
    accentColor: '',
    eyeColor: '',
    pattern: 'none',
    accessory: 'none',
    accessoryColor: '',
    name: 'Rusty',
    stateColors: true,
    wander: false,
    artStyle: 'smooth',
    variety: 'classic',
    toys: false,
    machines: true,
    backgroundPets: true,
    otherRepoPets: true,
    disabledActions: [],
    size: 200,
    ...over,
  };
}

const SIZES = { small: 150, medium: 200, large: 250 };
const NAMES = { fox: 'Rusty', cat: 'Mochi', dog: 'Biscuit', bird: 'Pip' };

let seq = 0;
/** A `claude-update` message, the same shape ClaudeWatcher sends. */
function claude(state, detail = '', extra = {}) {
  seq += 1;
  return {
    command: 'claude-update',
    main: { sessionId: 'demo', state, detail, seq, project: 'my-app', jobs: extra.jobs || [] },
    subagents: (extra.subagents || []).map((s) => ({ seq, detail: '', jobs: [], ...s })),
    background: extra.background || [],
    sessions: [],
  };
}

const CARE = { fullness: 80, fun: 70, clean: 90 };

/** A pet panel in its own page (`frame` is the page itself) or inside an iframe. */
class Panel {
  constructor(page, frame) {
    this.page = page;
    this.frame = frame;
  }

  static async open(browser, opts = {}) {
    const { width = 320, height = 300, scale = 1, seed } = opts;
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.goto(pathToFileURL(HARNESS).href + (seed ? `?seed=${seed}` : ''));
    const panel = new Panel(page, page.mainFrame());
    await panel.init(opts);
    // Pets start out napping until the first agent update.
    await panel.send(claude('idle'));
    await panel.advance(3000);
    return panel;
  }

  async init({ cfg, state, care, transparent, bare } = {}) {
    await this.frame.evaluate(
      (c, s, k, tr, b) => {
        document.body.classList.toggle('transparent', tr);
        document.body.classList.toggle('bare', b);
        window.__send({ command: 'init', config: c, state: s });
        window.__send({ command: 'care-update', stats: { ...k, updatedAt: Date.now() } });
      },
      config(cfg),
      state || {},
      { ...CARE, ...care },
      !!transparent,
      !!bare,
    );
    await this.advance(100);
  }

  advance(ms) {
    return this.frame.evaluate((m) => window.__advance(m), ms);
  }

  send(msg) {
    return this.frame.evaluate((m) => window.__send(m), msg);
  }

  click(selector) {
    return this.frame.evaluate((s) => document.querySelector(s).click(), selector);
  }

  /** Where the pet called `name` is: the centre of its name label. */
  label(name) {
    return this.frame.evaluate((n) => window.__labels[n], name);
  }

  showCursor(on = true) {
    return this.frame.evaluate((o) => window.__showCursor(o), on);
  }

  /**
   * A screenshot of the page, optionally cropped. Cropping happens here because
   * a clipped capture resizes the viewport, and the webview clears its canvas
   * on resize while the frozen clock keeps it from redrawing.
   */
  async shot(clip) {
    // Chrome only paints the tab in front.
    await this.page.bringToFront();
    const full = PNG.sync.read(await this.page.screenshot({ type: 'png', omitBackground: true }));
    if (!clip) {
      return full;
    }
    const scale = this.page.viewport().deviceScaleFactor;
    const [x, y, w, h] = [clip.x, clip.y, clip.width, clip.height].map((v) =>
      Math.round(v * scale),
    );
    const out = new PNG({ width: w, height: h });
    PNG.bitblt(full, out, x, y, w, h, 0, 0);
    return out;
  }

  close() {
    return this.page.close();
  }
}

/** Collects frames, advancing the fake clock by one frame before each. */
class Recorder {
  constructor(panel, clip) {
    this.panel = panel;
    this.clip = clip;
    this.frames = [];
  }

  async frame(each) {
    if (each) {
      await each();
    }
    await this.panel.advance(FRAME_MS);
    this.frames.push(await this.panel.shot(this.clip));
  }

  async hold(seconds, each) {
    const n = Math.round((seconds * 1000) / FRAME_MS);
    for (let i = 0; i < n; i++) {
      await this.frame(each && (() => each(i, n)));
    }
  }

  /** Moves the mouse in a straight line over `seconds`, recording as it goes. */
  async glide(from, to, seconds) {
    const mouse = this.panel.page.mouse;
    await this.hold(seconds, (i, n) => {
      const k = (i + 1) / n;
      return mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
    });
  }
}

/**
 * Writes an animated GIF. All frames share one palette, and pixels that are
 * unchanged from the previous frame are left transparent, so only the moving
 * parts cost bytes.
 */
function writeGif(file, frames) {
  if (process.env.DUMP_FRAMES) {
    const every = Number(process.env.DUMP_FRAMES);
    const dir = path.join(os.tmpdir(), 'pet-agents-frames');
    fs.mkdirSync(dir, { recursive: true });
    frames.forEach((f, i) => {
      if (i % every === 0) {
        writePng(
          path.join(dir, `${path.basename(file, '.gif')}-${String(i).padStart(3, '0')}.png`),
          f,
        );
      }
    });
  }
  const { width, height } = frames[0];
  const size = width * height * 4;
  const sample = frames.filter((_, i) => i % Math.ceil(frames.length / 12) === 0);
  const all = new Uint8Array(size * sample.length);
  sample.forEach((f, i) => all.set(f.data, i * size));
  const palette = quantize(all, 255);
  const clear = palette.length;
  const withClear = palette.concat([[0, 0, 0]]);
  const gif = GIFEncoder();
  let prev = null;
  for (const f of frames) {
    const index = applyPalette(f.data, palette);
    const next = index.slice();
    if (prev) {
      for (let p = 0; p < index.length; p++) {
        if (index[p] === prev[p]) {
          index[p] = clear;
        }
      }
    }
    gif.writeFrame(index, width, height, {
      palette: withClear,
      delay: FRAME_MS,
      transparent: !!prev,
      transparentIndex: clear,
      dispose: 1,
    });
    prev = next;
  }
  gif.finish();
  fs.writeFileSync(file, gif.bytes());
  return file;
}

function writePng(file, png) {
  fs.writeFileSync(file, PNG.sync.write(png));
  return file;
}

function blank(width, height, bg = SIDEBAR_BG) {
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data.set(bg, i);
  }
  return out;
}

/** Tiles equally sized images into `cols` columns with a gap between them. */
function grid(images, cols, gap = 0, bg = [0x11, 0x11, 0x11, 255]) {
  const { width: w, height: h } = images[0];
  const rows = Math.ceil(images.length / cols);
  const out = blank(cols * w + (cols - 1) * gap, rows * h + (rows - 1) * gap, bg);
  images.forEach((im, i) => {
    PNG.bitblt(im, out, 0, 0, w, h, (i % cols) * (w + gap), Math.floor(i / cols) * (h + gap));
  });
  return out;
}

/**
 * Records several panels in lockstep, one iframe each on a single page, and
 * writes them as one tiled GIF.
 */
async function recordGrid(browser, file, tiles, { cols, seconds, panel }) {
  const { width, height } = panel;
  const rows = Math.ceil(tiles.length / cols);
  const page = await browser.newPage();
  await page.setViewport({
    width: cols * width + (cols - 1) * 2,
    height: rows * height + (rows - 1) * 2,
    deviceScaleFactor: 1,
  });
  const frames = tiles
    .map((_, i) => {
      const src = `${pathToFileURL(HARNESS).href}?seed=${1000 + i * 7919}&tile=${i}`;
      return `<iframe src="${src}" width="${width}" height="${height}"></iframe>`;
    })
    .join('');
  const gridFile = path.join(os.tmpdir(), 'pet-agents-grid.html');
  fs.writeFileSync(
    gridFile,
    `<!doctype html><body style="margin:0;background:#111;display:grid;gap:2px;
      grid-template-columns:repeat(${cols},${width}px)">${frames}</body>`,
  );
  await page.goto(pathToFileURL(gridFile).href);
  const panels = [];
  for (const [i, t] of tiles.entries()) {
    const frame = page.frames().find((f) => f.url().endsWith(`tile=${i}`));
    const p = new Panel(page, frame);
    await p.init({ cfg: t.cfg, bare: true });
    await p.send(claude('idle'));
    await p.advance(3000);
    if (t.setup) {
      await t.setup(p);
    }
    panels.push(p);
  }
  const shots = [];
  const n = Math.round((seconds * 1000) / FRAME_MS);
  for (let i = 0; i < n; i++) {
    for (const p of panels) {
      await p.advance(FRAME_MS);
    }
    shots.push(await panels[0].shot());
  }
  await page.close();
  return writeGif(file, shots);
}

/** Switches off every other variant of `state`, so `random` variety must pick `id`. */
function onlyVariant(state, id) {
  const vm = require('vm');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(MEDIA, 'variants.js'), 'utf8'), sandbox);
  return sandbox.PetVariants.VARIANTS[state]
    .filter((v) => v.id !== id)
    .map((v) => `${state}.${v.id}`);
}

// -- Clips ---------------------------------------------------------------------

const CLIPS = {};

/** A mock VS Code window: the pet in the Explorer sidebar, Claude Code in the terminal. */
CLIPS.hero = async (browser) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 860, height: 500, deviceScaleFactor: 1 });
  const frameFile = path.join(os.tmpdir(), 'pet-agents-hero.html');
  fs.writeFileSync(frameFile, heroFrameHtml());
  await page.goto(pathToFileURL(frameFile).href);
  const frame = page.frames().find((f) => f.url().includes('pet-agents-harness'));
  const panel = new Panel(page, frame);
  await panel.init({ cfg: { size: SIZES.small } });
  const rec = new Recorder(panel);
  const term = (html) =>
    page.evaluate((h) => {
      const t = document.getElementById('term');
      t.insertAdjacentHTML('beforeend', `<div>${h}</div>`);
      while (t.children.length > 7) {
        t.firstElementChild.remove();
      }
    }, html);

  const tool = (name, arg) => `<span class="dot">●</span> <b>${name}</b>(${arg})`;
  const helpers = [
    {
      id: 'a1',
      name: 'Detective Noodle',
      agentType: 'Explore',
      task: 'Find every login caller',
      state: 'reading',
    },
    {
      id: 'a2',
      name: 'Professor Pickles',
      agentType: 'Plan',
      task: 'Plan the redirect fix',
      state: 'thinking',
    },
  ];

  await panel.send(claude('sleeping'));
  await rec.hold(1.4);
  await term('<span class="you">&gt; fix the login redirect bug</span>');
  await panel.send(claude('waking'));
  await rec.hold(1.2);
  await term('<span class="dim">✻ Thinking...</span>');
  await panel.send(claude('thinking'));
  await rec.hold(1.6);
  await term(tool('Task', 'Find every login caller'));
  await panel.send(claude('delegating', '2 helpers', { subagents: helpers }));
  await rec.hold(2.2);
  await panel.send(
    claude('delegating', '2 helpers', {
      subagents: [
        { ...helpers[0], state: 'browsing', detail: 'docs' },
        { ...helpers[1], state: 'writing', detail: 'plan.md' },
      ],
    }),
  );
  await rec.hold(1.6);
  await panel.send(
    claude('delegating', '2 helpers', { subagents: helpers.map((h) => ({ ...h, state: 'done' })) }),
  );
  await rec.hold(1.4);
  await term(tool('Read', 'src/auth/login.ts'));
  await panel.send(claude('reading', 'src/auth/login.ts'));
  await rec.hold(1.6);
  await term(tool('Update', 'src/auth/login.ts'));
  await panel.send(claude('writing', 'src/auth/login.ts'));
  await rec.hold(1.8);
  await term(tool('Bash', 'npm test'));
  await panel.send(
    claude('testing', 'npm test', {
      jobs: [{ id: 'j1', kind: 'test', label: 'npm test', background: false }],
    }),
  );
  await rec.hold(2.2);
  await term('<span class="bad">  ⎿ 1 failed, 41 passed</span>');
  await panel.send(claude('error', 'npm test'));
  await rec.hold(1.6);
  await term(tool('Update', 'src/auth/redirect.ts'));
  await panel.send(claude('writing', 'src/auth/redirect.ts'));
  await rec.hold(1.4);
  await term('<span class="ask">Do you want to make this edit? 1. Yes  2. No</span>');
  await panel.send(claude('waiting', 'permission'));
  await rec.hold(1.8);
  await term(tool('Bash', 'npm test'));
  await term('<span class="good">  ⎿ 42 passed</span>');
  await term('<span class="dim">✻ Done. The login redirect keeps the return URL now.</span>');
  await panel.send(claude('done'));
  await rec.hold(2.6);
  await page.close();
  return writeGif(path.join(OUT, 'hero.gif'), rec.frames);
};

function heroFrameHtml() {
  const code = [
    `<span class="k">export</span> <span class="k">async function</span> <span class="f">login</span>(req: <span class="t">Request</span>) {`,
    `  <span class="k">const</span> user = <span class="k">await</span> <span class="f">verify</span>(req.body);`,
    `  <span class="k">const</span> next = req.query.<span class="f">get</span>(<span class="s">'next'</span>);`,
    `  <span class="k">if</span> (!user) {`,
    `    <span class="k">return</span> <span class="f">redirect</span>(<span class="s">'/login'</span>);`,
    `  }`,
    `  <span class="k">return</span> <span class="f">redirect</span>(<span class="f">safeNext</span>(next) ?? <span class="s">'/'</span>);`,
    `}`,
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 860px; height: 500px; background: #1f1f1f; color: #ccc; overflow: hidden;
      font: 12px 'Segoe UI', system-ui, sans-serif; display: grid;
      grid-template: 30px 1fr / 48px 300px 1fr; }
    .title { grid-column: 1 / 4; display: flex; align-items: center; justify-content: center;
      background: #1f1f1f; border-bottom: 1px solid #2b2b2b; color: #9d9d9d; position: relative; }
    .lights { position: absolute; left: 12px; display: flex; gap: 8px; }
    .lights i { width: 12px; height: 12px; border-radius: 50%; display: block; }
    .bar { background: #181818; border-right: 1px solid #2b2b2b; display: flex; flex-direction: column;
      align-items: center; gap: 22px; padding-top: 14px; }
    .bar i { width: 22px; height: 22px; border: 2px solid #868686; border-radius: 4px; display: block; }
    .bar i.on { border-color: #e7e7e7; }
    .side { background: #181818; border-right: 1px solid #2b2b2b; display: flex; flex-direction: column; }
    .side h2 { font-size: 11px; font-weight: 400; padding: 9px 20px; color: #ccc; letter-spacing: .4px; }
    .sec { font-size: 11px; font-weight: 700; padding: 3px 6px; border-top: 1px solid #2b2b2b; }
    iframe { border: 0; flex: 1; width: 100%; }
    .main { display: grid; grid-template-rows: 35px 1fr 180px; min-width: 0; }
    .tabs { background: #181818; display: flex; }
    .tab { background: #1f1f1f; padding: 9px 14px; border-top: 1px solid #0078d4; color: #fff; }
    pre { font: 13px/20px Consolas, monospace; padding: 10px 16px; color: #ccc; }
    pre n { color: #6e7681; display: inline-block; width: 26px; }
    .k { color: #569cd6; } .f { color: #dcdcaa; } .s { color: #ce9178; } .t { color: #4ec9b0; }
    .panel { border-top: 1px solid #2b2b2b; background: #181818; padding: 0 16px; }
    .panel h3 { font-size: 11px; font-weight: 400; padding: 8px 0; color: #e7e7e7;
      border-bottom: 1px solid #e7e7e7; display: inline-block; margin-bottom: 6px; }
    #term { font: 12.5px/20px Consolas, monospace; }
    #term b { color: #e7e7e7; } .dot { color: #4ec9b0; } .dim { color: #9d9d9d; }
    .you { color: #e7e7e7; } .bad { color: #f14c4c; } .good { color: #23d18b; }
    .ask { color: #e5c07b; }
  </style></head><body>
    <div class="title"><div class="lights"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>login.ts - my-app - Visual Studio Code</div>
    <div class="bar"><i class="on"></i><i></i><i></i><i></i></div>
    <div class="side"><h2>EXPLORER</h2><div class="sec">&#8250; MY-APP</div><div class="sec">&#8964; PET AGENTS</div>
      <iframe src="${pathToFileURL(HARNESS).href}"></iframe></div>
    <div class="main"><div class="tabs"><div class="tab">login.ts</div></div>
      <pre>${code.map((l, i) => `<n>${i + 1}</n>${l}`).join('\n')}</pre>
      <div class="panel"><h3>TERMINAL</h3><div id="term"><div class="dim">claude</div></div></div></div>
  </body></html>`;
}

CLIPS.species = (browser) =>
  recordGrid(
    browser,
    path.join(OUT, 'species.gif'),
    [
      { cfg: { species: 'fox', name: 'Rusty' } },
      { cfg: { species: 'cat', name: 'Mochi' } },
      { cfg: { species: 'dog', name: 'Biscuit' } },
      { cfg: { species: 'bird', name: 'Pip' } },
    ].map((t) => ({ ...t, cfg: { ...t.cfg, size: SIZES.small, stateColors: false } })),
    { cols: 4, seconds: 3.5, panel: { width: 200, height: 210 } },
  );

CLIPS.looks = (browser) =>
  recordGrid(
    browser,
    path.join(OUT, 'looks.gif'),
    [
      { species: 'cat', name: 'Duchess', color: '#a98be0', pattern: 'stripes', accessory: 'crown' },
      { species: 'dog', name: 'Bandit', color: '#7b4a2a', pattern: 'mask', accessory: 'bandana' },
      { species: 'bird', name: 'DJ Pip', color: '#5cc9a7', accessory: 'headphones' },
      { species: 'fox', name: 'Frost', color: '#e8e8ee', eyeColor: '#3a7bd5', accessory: 'scarf' },
      { species: 'cat', name: 'Shadow', color: '#22222a', eyeColor: '#e09b1f', accessory: 'bow' },
      {
        species: 'dog',
        name: 'Sunny',
        color: '#e0b24f',
        pattern: 'patch',
        accessory: 'sunglasses',
      },
      { species: 'fox', name: 'Pixel', artStyle: 'pixel', pattern: 'socks', accessory: 'beanie' },
      { species: 'bird', name: 'Rosie', color: '#f27fb2', accessory: 'flower' },
    ].map((cfg) => ({ cfg: { ...cfg, size: SIZES.small, stateColors: false } })),
    { cols: 4, seconds: 3, panel: { width: 200, height: 200 } },
  );

CLIPS.variants = (browser) =>
  recordGrid(
    browser,
    path.join(OUT, 'variants.gif'),
    [
      ['sleeping', 'box', 'fox'],
      ['running', 'wheel', 'cat'],
      ['browsing', 'surf', 'dog'],
      ['thinking', 'chalk', 'bird'],
      ['writing', 'hacker', 'cat'],
      ['done', 'trophy', 'fox'],
    ].map(([state, id, species]) => ({
      cfg: {
        species,
        name: NAMES[species],
        variety: 'random',
        disabledActions: onlyVariant(state, id),
        size: SIZES.small,
      },
      setup: async (p) => {
        await p.send(claude(state));
        await p.advance(600);
      },
    })),
    { cols: 3, seconds: 3.5, panel: { width: 240, height: 230 } },
  );

CLIPS.subagents = async (browser) => {
  const panel = await Panel.open(browser, { width: 340, height: 380, cfg: { size: SIZES.small } });
  const rec = new Recorder(panel);
  const a = {
    id: 'a',
    name: 'Detective Noodle',
    agentType: 'Explore',
    task: 'Find the flaky test',
  };
  const b = { id: 'b', name: 'Professor Pickles', agentType: 'Plan', task: 'Plan the migration' };
  const c = {
    id: 'c',
    name: 'Inspector Waffles',
    agentType: 'code-reviewer',
    task: 'Review the diff',
  };
  await panel.send(claude('thinking'));
  await rec.hold(1);
  await panel.send(claude('delegating', '', { subagents: [{ ...a, state: 'reading' }] }));
  await rec.hold(1.2);
  await panel.send(
    claude('delegating', '', {
      subagents: [
        { ...a, state: 'reading' },
        { ...b, state: 'thinking' },
      ],
    }),
  );
  await rec.hold(1.2);
  const three = [
    { ...a, state: 'browsing' },
    { ...b, state: 'writing' },
    { ...c, state: 'reading' },
  ];
  await panel.send(claude('delegating', '', { subagents: three }));
  await rec.hold(2.4);
  await panel.send(
    claude('delegating', '', {
      subagents: [
        { ...a, state: 'done' },
        { ...b, state: 'running' },
        { ...c, state: 'error' },
      ],
    }),
  );
  await rec.hold(1.6);
  await panel.send(
    claude('delegating', '', {
      subagents: [
        { ...b, state: 'done' },
        { ...c, state: 'done' },
      ],
    }),
  );
  await rec.hold(1.4);
  await panel.send(claude('done'));
  await rec.hold(2.2);
  await panel.close();
  return writeGif(path.join(OUT, 'subagents.gif'), rec.frames);
};

CLIPS.machines = async (browser) => {
  const panel = await Panel.open(browser, {
    width: 360,
    height: 300,
    cfg: { size: SIZES.small, variety: 'random' },
    seed: 99,
  });
  const rec = new Recorder(panel);
  const test = { id: 't', kind: 'test', label: 'npm test', background: false };
  const build = { id: 'b', kind: 'build', label: 'npm run build', background: true };
  const server = { id: 's', kind: 'server', label: 'npm run dev', background: true };
  await panel.send(claude('running', 'npm run dev', { jobs: [server] }));
  await rec.hold(1.6);
  await panel.send(claude('testing', 'npm test', { jobs: [server, test] }));
  await rec.hold(2);
  await panel.send(claude('testing', 'npm test', { jobs: [server, test, build] }));
  await rec.hold(3);
  await panel.send(claude('testing', 'npm test', { jobs: [server, build] }));
  await rec.hold(2);
  await panel.send(claude('done', '', { jobs: [server] }));
  await rec.hold(2);
  await panel.close();
  return writeGif(path.join(OUT, 'machines.gif'), rec.frames);
};

CLIPS.care = async (browser) => {
  const panel = await Panel.open(browser, {
    width: 320,
    height: 340,
    cfg: { size: SIZES.small, name: 'Mochi', species: 'cat', color: '#e0b24f' },
    care: { fullness: 35, fun: 40, clean: 35 },
  });
  const rec = new Recorder(panel);
  const mouse = panel.page.mouse;
  const s = Math.floor(SIZES.small / 32) * 32;
  // The pet only walks sideways, so its height stays where defaultMainPos put it.
  const top = Math.max(28, 340 * 0.38 - s / 2);
  const floor = top + (s * 30) / 32;
  const petX = async () => (await panel.label('Mochi')).x;

  await panel.showCursor();
  await mouse.move(300, 20);
  await rec.hold(0.5);
  await panel.click('#care-toggle');
  await rec.hold(0.8);
  await panel.click('[data-care="feed"]');
  await rec.glide({ x: 300, y: 20 }, { x: 90, y: 110 }, 0.6);
  let at = { x: 90, y: 110 };
  for (const next of [
    { x: 110, y: 100 },
    { x: 215, y: 90 },
    { x: 165, y: 110 },
  ]) {
    await rec.glide(at, next, 0.25);
    await mouse.down();
    await mouse.up();
    await rec.hold(0.25);
    at = next;
  }
  await rec.hold(4.5);

  await panel.click('[data-care="play"]');
  await rec.hold(0.4);
  const cx = await petX();
  const ball = { x: Math.min(cx + s * 0.6, 300), y: floor };
  await rec.glide(at, ball, 0.5);
  await mouse.down();
  const lift = { x: ball.x - 10, y: ball.y - 30 };
  await rec.glide(ball, lift, 0.2);
  const fling = { x: cx - 50, y: floor - 90 };
  await rec.glide(lift, fling, 0.14);
  await mouse.up();
  await rec.hold(6);

  await panel.click('[data-care="bath"]');
  const bx = await petX();
  const belly = { x: bx, y: top + s * 0.55 };
  await rec.glide(fling, belly, 0.5);
  await mouse.down();
  await rec.hold(3.4, (i) => mouse.move(bx + (i % 2 ? 36 : -36), belly.y + ((i % 3) - 1) * 10));
  await mouse.up();
  await rec.hold(2.5);
  await panel.close();
  return writeGif(path.join(OUT, 'care.gif'), rec.frames);
};

CLIPS.idle = async (browser) => {
  const panel = await Panel.open(browser, {
    width: 360,
    height: 260,
    cfg: {
      size: SIZES.small,
      species: 'dog',
      name: 'Biscuit',
      variety: 'random',
      wander: true,
      toys: true,
    },
    state: { bag: { yarn: 2, skateboard: 1, guitar: 1, balloon: 1, box: 1 } },
    seed: 4242,
  });
  const rec = new Recorder(panel);
  await panel.send(claude('done'));
  await panel.advance(60000);
  await rec.hold(14);
  await panel.close();
  return writeGif(path.join(OUT, 'idle.gif'), rec.frames);
};

/** The three corner panels side by side, at 2x for crisp text. */
CLIPS.panels = async (browser) => {
  const opts = { width: 300, height: 380, scale: 2, cfg: { size: SIZES.small } };
  const bag = await Panel.open(browser, {
    ...opts,
    state: {
      bag: {
        yarn: 3,
        box: 1,
        bone: 2,
        teddy: 1,
        balloon: 1,
        couch: 1,
        guitar: 1,
        skateboard: 1,
        ufo: 1,
        crown: 1,
      },
    },
  });
  await bag.click('#bag-toggle');
  await bag.advance(300);
  const settings = await Panel.open(browser, opts);
  await settings.click('#settings-toggle');
  await settings.advance(300);
  const care = await Panel.open(browser, { ...opts, care: { fullness: 82, fun: 55, clean: 24 } });
  await care.click('#care-toggle');
  await care.advance(1200);
  const shots = [await care.shot(), await bag.shot(), await settings.shot()];
  await Promise.all([bag, settings, care].map((p) => p.close()));
  return writePng(path.join(OUT, 'panels.png'), grid(shots, 3, 8));
};

CLIPS.tooltip = async (browser) => {
  const panel = await Panel.open(browser, {
    width: 340,
    height: 340,
    scale: 2,
    cfg: { size: SIZES.small },
    state: { bag: { yarn: 1, box: 1, couch: 1, ufo: 1 } },
  });
  await panel.send(
    claude('writing', 'src/auth/login.ts', {
      subagents: [
        {
          id: 'a',
          name: 'Detective Noodle',
          agentType: 'Explore',
          task: 'Find callers',
          state: 'reading',
        },
      ],
    }),
  );
  await panel.advance(4000);
  await panel.page.mouse.move(150, 110);
  await panel.advance(100);
  await panel.page.mouse.move(152, 112);
  await panel.advance(100);
  const png = await panel.shot();
  await panel.close();
  return writePng(path.join(OUT, 'tooltip.png'), png);
};

/** The marketplace icon: the default fox on a rounded tile. */
CLIPS.icon = async (browser) => {
  const scale = 8;
  const px = 32 * scale;
  const panel = await Panel.open(browser, {
    width: 300,
    height: 420,
    transparent: true,
    cfg: { size: px, stateColors: false, accessory: 'headphones', accessoryColor: '#4fd1ff' },
  });
  const x = (300 - px) / 2;
  const y = Math.max(28, 420 * 0.38 - px / 2);
  const pet = await panel.shot({ x, y, width: px, height: px });
  await panel.close();

  const page = await browser.newPage();
  await page.setViewport({ width: 128, height: 128, deviceScaleFactor: 2 });
  const src = 'data:image/png;base64,' + PNG.sync.write(pet).toString('base64');
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
    <div style="position:absolute;inset:4px;border-radius:26px;overflow:hidden;
      background:radial-gradient(circle at 50% 38%, #4b3a8f 0%, #2a2350 55%, #17142b 100%);
      box-shadow:inset 0 0 0 2px rgba(255,255,255,.08)">
      <div style="position:absolute;left:22px;right:22px;bottom:11px;height:9px;border-radius:50%;
        background:rgba(0,0,0,.35)"></div>
      <img src="${src}" style="position:absolute;left:12px;top:12px;width:96px;height:96px">
    </div></body></html>`);
  const png = PNG.sync.read(await page.screenshot({ type: 'png', omitBackground: true }));
  await page.close();
  return writePng(ICON, png);
};

async function main() {
  const executablePath = CHROME_PATHS.find((p) => fs.existsSync(p));
  if (!executablePath) {
    throw new Error('No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser.');
  }
  fs.mkdirSync(OUT, { recursive: true });
  writeHarness();
  const only = process.argv[2];
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--allow-file-access-from-files'],
  });
  try {
    for (const [name, clip] of Object.entries(CLIPS)) {
      if (only && !name.includes(only)) {
        continue;
      }
      const started = Date.now();
      const file = await clip(browser);
      const kb = Math.round(fs.statSync(file).size / 1024);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`${name.padEnd(10)} ${path.relative(ROOT, file)}  ${kb} KB  (${secs}s)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
