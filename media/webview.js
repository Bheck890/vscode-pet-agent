// @ts-check
// Pet webview: canvas renderer, state machine and sub-agent minis.
// Runs inside a VS Code webview (sandboxed iframe). Art comes from pets.js.
(function () {
  'use strict';

  // After an update, VS Code keeps running the old extension until the window
  // reloads, and that can serve this script without the files it needs.
  if (
    !window.PetArt ||
    !window.PetStates ||
    !window.PetPlay ||
    !window.PetPanels ||
    !window.PetVariants ||
    !window.PetScene
  ) {
    acquireVsCodeApi().postMessage({
      command: 'log',
      level: 'warn',
      message: 'Helper scripts missing (extension updated without a reload)',
    });
    document.body.insertAdjacentHTML(
      'beforeend',
      '<p class="stale">Pet Agents was updated. Run <b>Developer: Reload Window</b> to finish.</p>',
    );
    return;
  }

  const Art = window.PetArt;
  const Variants = window.PetVariants;

  const { STATES, PEON_TO_STATE, WORKING } = window.PetStates;

  const MAX_DOTS = 10;
  const DOT_R = 4;
  const DOT_GAP = 4;
  const CONFETTI = ['#ff4f7b', '#ffd23f', '#4fd1ff', '#6be675', '#b48cff', '#ff9f43'];

  // -- DOM --------------------------------------------------------------------
  const vscodeApi = acquireVsCodeApi();

  /** Writes to the "Pet Agents" output channel (Pet Agents: Show Log). */
  function log(level, message) {
    vscodeApi.postMessage({ command: 'log', level, message: String(message).slice(0, 2000) });
  }

  window.addEventListener('error', (e) =>
    log('error', `${e.message} (${e.filename || 'webview'}:${e.lineno || 0})`),
  );
  window.addEventListener('unhandledrejection', (e) => log('error', `Unhandled: ${e.reason}`));
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
  const tooltip = /** @type {HTMLDivElement} */ (document.getElementById('tooltip'));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  // -- World state ------------------------------------------------------------
  /** @type {null | {species: string, color: string, name: string, stateColors: boolean, size: number}} */
  let config = null;
  let viewW = 300;
  let viewH = 300;
  /**
   * Persisted by VS Code across reloads: where the pet was dragged, the toy
   * bag, toys traded in at the shop, what was bought there and the food in use.
   */
  /** @type {{petX?: number, petY?: number, bag?: Record<string, number>, spent?: Record<string, number>, unlocks?: string[], food?: string}} */
  let saved = {};
  /** @type {any} */
  let main = null;
  /** @type {Map<string, any>} */
  const minis = new Map();
  /** @type {any[]} */
  let particles = [];
  /** @type {Array<{id: string, hot: boolean, warm: boolean, cwd: string|null}>} */
  let peonSessions = [];
  /** @type {Array<{id: string, hot: boolean, warm: boolean, cwd: string|null}>} */
  let claudeSessions = [];
  /** @type {any} */
  let pendingClaude = null;
  let project = '';
  let fgColor = '#cccccc';
  let lastFrame = 0;
  /** @type {{x: number, y: number, at: number} | null} */
  let mouse = null;
  let dragging = false;
  /** @type {any} */
  let press = null;
  /** @type {{pet: any, at: number}} */
  let lastClick = { pet: null, at: 0 };
  /** @type {null | {fullness: number, fun: number, clean: number}} */
  let care = null;
  let lastPetCareAt = 0;

  /** Short reactions played during hands-on care (see play.js). */
  const CARE_MS = { eat: 900, catch: 1000, shake: 1100, refuse: 900 };

  // -- Helpers ----------------------------------------------------------------
  function now() {
    return Date.now();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function leafDirName(cwd) {
    if (!cwd) {
      return null;
    }
    const segments = String(cwd).split(/[\\/]/).filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : null;
  }

  function clipText(text, maxW) {
    if (ctx.measureText(text).width <= maxW) {
      return text;
    }
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '...').width > maxW) {
      s = s.slice(0, -1);
    }
    return s + '...';
  }

  /** Normalises any CSS colour to #rrggbb using the canvas parser; '' or invalid -> null. */
  function cssToHex(input) {
    if (!input) {
      return null;
    }
    const probe = '#010203';
    ctx.fillStyle = probe;
    ctx.fillStyle = input;
    const out = String(ctx.fillStyle);
    if (out === probe && input.toLowerCase() !== probe) {
      return null;
    }
    if (Art.hexToRgb(out)) {
      return out;
    }
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(out);
    if (!m) {
      return null;
    }
    return '#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('');
  }

  function baseColor() {
    if (!config) {
      return '#888888';
    }
    return cssToHex(config.color) || Art.SPECIES[config.species].defaultColor;
  }

  function easeOutBack(t) {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }

  // -- Sprite cache -----------------------------------------------------------
  const spriteCache = new Map();

  function smoothArt() {
    return !!config && config.artStyle === 'smooth';
  }

  /** Sprites are 8x larger in smooth style; props divide by this to keep their logical size. */
  function artFactor() {
    return smoothArt() ? 8 : 1;
  }

  function toCanvas(grid) {
    const px = smoothArt() ? Art.smooth(grid, 3) : grid;
    const h = px.length;
    const w = px[0].length;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cx = c.getContext('2d');
    const img = cx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const rgb = px[y][x] ? Art.hexToRgb(px[y][x]) : null;
        if (rgb) {
          const i = (y * w + x) * 4;
          img.data[i] = rgb[0];
          img.data[i + 1] = rgb[1];
          img.data[i + 2] = rgb[2];
          img.data[i + 3] = 255;
        }
      }
    }
    cx.putImageData(img, 0, 0);
    return c;
  }

  function cached(key, build) {
    let c = spriteCache.get(key);
    if (!c) {
      if (spriteCache.size > (smoothArt() ? 160 : 400)) {
        spriteCache.clear();
      }
      c = toCanvas(build());
      spriteCache.set(key, c);
    }
    return c;
  }

  function petPalette(color, tint) {
    return Art.palette(config.species, color, tint, tint ? 0.22 : 0, {
      accent: cssToHex(config.accentColor) || '',
      eye: cssToHex(config.eyeColor) || '',
    });
  }

  /** Pattern and accessory come from config; the cache is cleared whenever config changes. */
  function petSprite(o) {
    const key = ['pet', o.color, o.tint, o.eyes, o.mouth, o.frame, o.look, o.twitch, o.hide].join(
      '|',
    );
    return cached(key, () =>
      Art.compose(config.species, petPalette(o.color, o.tint), {
        eyes: o.eyes,
        mouth: o.mouth,
        frame: o.frame,
        look: o.look,
        twitch: o.twitch,
        pattern: config.pattern,
        accessory: config.accessory,
        accessoryColor: cssToHex(config.accessoryColor) || '',
        hide: o.hide,
      }),
    );
  }

  function propSprite(name) {
    return cached('prop|' + name, () => Art.composeProp(name));
  }

  // -- Pets -------------------------------------------------------------------
  function makePet(opts) {
    const t = now();
    return Object.assign(
      {
        id: 'main',
        name: '',
        task: '',
        agentType: '',
        detail: '',
        scale: 6,
        x: 0,
        y: 0,
        tx: 0,
        ty: 0,
        hue: 0,
        base: 'sleeping',
        oneShot: null,
        oneShotUntil: 0,
        oneShotNext: 'idle',
        stateSince: t,
        lastActivity: t,
        seq: -1,
        spawnAt: 0,
        leavingAt: 0,
        blinkEvery: 2800 + Math.random() * 2500,
        fxAt: 0,
        wx: 0,
        wxTarget: 0,
        wy: 0,
        wyTarget: 0,
        wz: 0,
        wzTarget: 0,
        roamAngle: 0,
        walking: 0,
        wanderNext: t + 5000,
        roamDir: 1,
        roamNext: 0,
        fidget: null,
        fidgetNext: t + 3000,
        hobbyLast: '',
        reaction: null,
        twitchAt: 0,
        twitchNext: t + 2000 + Math.random() * 4000,
        napUntil: t + 60000 + Math.random() * 60000,
        variant: null,
        lastVariant: {},
        reported: '',
        background: false,
      },
      opts,
    );
  }

  function displayState(p) {
    return p.oneShot || p.base;
  }

  function classic() {
    return !!config && config.variety === 'classic';
  }

  /**
   * STATES[state] with the pet's variant on top. A new variant is picked each
   * time the state changes. Agents from a transcript pick from a seed every
   * window shares, so the same agent looks the same in every panel.
   */
  function stateDef(p, state) {
    if (!p.variant || p.variant.state !== state) {
      const v = Variants.pick(state, {
        classic: classic(),
        species: config.species,
        lastId: p.syncKey ? undefined : p.lastVariant[state],
        off: config.disabledActions,
        unlocked: saved.unlocks,
        rand: p.syncKey ? Variants.seeded(`${p.syncKey}:${state}`) : Math.random,
      });
      p.lastVariant[state] = v ? v.id : '';
      p.variant = { state, def: v ? Object.assign({}, STATES[state], v) : STATES[state] };
    }
    return p.variant.def;
  }

  /** The state's look, plus the idle hobby the pet is busy with, if any. */
  function lookOf(p, state, t) {
    const def = stateDef(p, state);
    const f = p.fidget;
    if (state !== 'idle' || !f || !f.hobby || t >= f.until) {
      return def;
    }
    const label = (f.hobby.needs === 'toy' && scene.toyLabel()) || f.hobby.label;
    return Object.assign({}, def, f.hobby, { label });
  }

  /** How long an idle pet stays awake. With variety on it has hobbies to fill the time. */
  function sleepAfter() {
    return classic() ? 30000 : 90000;
  }

  function startOneShot(p, state, next) {
    const t = now();
    p.oneShot = state;
    p.oneShotUntil = t + STATES[state].oneShot;
    p.oneShotNext = next;
    p.stateSince = t;
    onEnter(p, state);
  }

  /** Feeds a new agent state into a pet, handling one-shots and waking from sleep. */
  function applyState(p, state, detail) {
    if (!STATES[state]) {
      return;
    }
    const t = now();
    p.detail = detail || '';
    p.lastActivity = t;
    const def = STATES[state];
    if (WORKING.has(state)) {
      p.care = null;
    }

    if (def.oneShot) {
      const next = state === 'error' ? (p.base === 'sleeping' ? 'idle' : p.base) : 'idle';
      startOneShot(p, state, next);
      return;
    }

    const wasAsleep = displayState(p) === 'sleeping';
    if (p.oneShot) {
      p.oneShotNext = state;
      p.base = state;
      return;
    }
    if (wasAsleep && state !== 'sleeping' && state !== 'idle') {
      p.base = state;
      startOneShot(p, 'waking', state);
      p.oneShotUntil = t + 900;
      return;
    }
    if (p.base !== state) {
      p.base = state;
      p.stateSince = t;
      onEnter(p, state);
    }
  }

  function tickState(p, t) {
    if (p.oneShot && t >= p.oneShotUntil) {
      p.oneShot = null;
      p.base = p.oneShotNext;
      p.stateSince = t;
      onEnter(p, p.base);
    }
    if (!p.oneShot && p.base === 'idle' && t - p.lastActivity > sleepAfter()) {
      p.base = 'sleeping';
      p.stateSince = t;
      p.napUntil = t + 180000 + Math.random() * 120000;
    }
    // With variety on, a napping pet gets up on its own now and then.
    if (p === main && !classic() && !p.oneShot && p.base === 'sleeping' && t > p.napUntil) {
      p.base = 'idle';
      p.lastActivity = t;
      startOneShot(p, 'waking', 'idle');
    }
  }

  function petPx(p) {
    return p.scale * Art.SIZE;
  }

  /**
   * Depth: wz runs from 0 (front, the pet's normal spot) to 1 (far back).
   * Further back the pet is drawn smaller and higher up the panel.
   */
  const DEPTH_SHRINK = 0.4;
  const DEPTH_RISE = 0.45;

  function depthK(p) {
    return 1 - DEPTH_SHRINK * p.wz;
  }

  /** The square the sprite is drawn in this frame, allowing for flight and depth. */
  function spriteBox(p) {
    const size = petPx(p);
    const s = size * depthK(p);
    return {
      x: p.x + p.wx + (size - s) / 2,
      y: p.y + p.wy + size - p.wz * size * DEPTH_RISE - s,
      s,
    };
  }

  function center(p) {
    const b = spriteBox(p);
    return { x: b.x + b.s / 2, y: b.y + b.s / 2 };
  }

  // -- Care -------------------------------------------------------------------
  /** The agent is working if the main pet shows a working state or any helper is out. */
  function isBusy() {
    if (!main) {
      return false;
    }
    // While a one-shot plays (e.g. waking up into work), what follows it counts too.
    const upNext = main.oneShot ? main.oneShotNext : main.base;
    if (WORKING.has(displayState(main)) || WORKING.has(upNext)) {
      return true;
    }
    return [...minis.values()].some((m) => !m.leavingAt && !m.background);
  }

  function startCareAnim(kind) {
    const t = now();
    if (displayState(main) === 'sleeping') {
      startOneShot(main, 'waking', 'idle');
      main.oneShotUntil = t + 600;
    }
    main.care = { kind, start: t, until: t + CARE_MS[kind], fxAt: 0, burst: false };
    main.fidget = null;
    main.reaction = null;
    main.lastActivity = t;
  }

  function lowestStat() {
    if (!care) {
      return null;
    }
    const [stat, value] = Object.entries(care)
      .filter(([k]) => k !== 'updatedAt')
      .sort((a, b) => a[1] - b[1])[0];
    return value < 30 ? stat : null;
  }

  const MOOD = {
    fullness: { label: 'hungry', emoji: '🍖' },
    fun: { label: 'bored', emoji: '🥺' },
    clean: { label: 'needs a bath', emoji: '🪰' },
  };

  /** Effects for care animations, plus mood hints when the pet is idle and a stat is low. */
  function careFx(p, t, size, x0) {
    const cr = p.care && t < p.care.until ? p.care : null;
    const sp = Art.SPECIES[config.species];
    const cx = x0 + size / 2;
    const mouthY = p.y + (size * sp.mouthY) / Art.SIZE;
    if (!cr) {
      const low = lowestStat();
      if (low && displayState(p) === 'idle' && t - p.fxAt > 4500) {
        p.fxAt = t;
        emit({
          x: cx + size * 0.3,
          y: p.y + size * 0.15,
          vy: -size * 0.2,
          text: MOOD[low].emoji,
          size: size * 0.14,
          life: 1.8,
        });
      }
      return;
    }
    switch (cr.kind) {
      case 'eat':
        if (t - cr.fxAt > 200) {
          cr.fxAt = t;
          emit({
            x: cx + (Math.random() - 0.5) * size * 0.2,
            y: mouthY,
            vx: (Math.random() - 0.5) * size * 0.6,
            vy: -size * 0.3,
            g: size * 2.5,
            size: Math.max(2, p.scale * 0.7),
            color: '#c48a4a',
            life: 0.6,
          });
        }
        break;
      case 'catch':
        if (!cr.burst) {
          cr.burst = true;
          for (let i = 0; i < 6; i++) {
            emit({
              x: cx + (Math.random() - 0.5) * size * 0.5,
              y: p.y + size * 0.2,
              vx: (Math.random() - 0.5) * size * 0.4,
              vy: -size * (0.4 + Math.random() * 0.3),
              text: i % 2 ? '💖' : '✨',
              size: size * 0.11,
              life: 1.1,
            });
          }
        }
        break;
      case 'shake':
        if (t - cr.fxAt > 60) {
          cr.fxAt = t;
          const side = Math.random() < 0.5 ? -1 : 1;
          emit({
            x: cx + side * size * 0.3,
            y: p.y + size * (0.3 + Math.random() * 0.4),
            vx: side * size * (0.8 + Math.random()),
            vy: -size * 0.5,
            g: size * 3,
            size: Math.max(2, p.scale * 0.8),
            color: '#7fd3ff',
            life: 0.6,
          });
        }
        break;
      case 'refuse':
        if (!cr.burst) {
          cr.burst = true;
          emit({ x: cx, y: p.y, vy: -30, text: '🙅', size: size * 0.16, life: 1 });
        }
        break;
    }
  }

  // -- Idle life: fidgets, wandering, ear twitches ------------------------------
  const FIDGETS = [
    ['lookL', 1400],
    ['lookR', 1400],
    ['twitch', 700],
    ['yawn', 1700],
    ['hop', 900],
    ['chase', 1600],
    ['groom', 1500],
    ['wag', 1500],
  ];

  /** Starts a hobby (variety on, 60% of the time) or a short classic fidget. */
  function startFidget(p, t) {
    const hobby =
      !classic() && Math.random() < 0.6
        ? Variants.pickIdle({
            species: config.species,
            wander: config.wander,
            toys: scene.canPlay(),
            lastId: p.hobbyLast,
            off: config.disabledActions,
            unlocked: saved.unlocks,
          })
        : null;
    if (hobby) {
      const dur = hobby.dur[0] + Math.random() * (hobby.dur[1] - hobby.dur[0]);
      if (hobby.needs !== 'toy' || scene.startToy(t + dur)) {
        p.hobbyLast = hobby.id;
        p.fidget = { kind: hobby.id, start: t, until: t + dur, hobby };
        p.fidgetNext = t + dur + 2000 + Math.random() * 4000;
        if (hobby.critter) {
          scene.startCritter(hobby.critter, t + dur);
        }
        return;
      }
    }
    const [kind, dur] = FIDGETS[Math.floor(Math.random() * FIDGETS.length)];
    p.fidget = { kind, start: t, until: t + dur };
    p.fidgetNext = t + dur + 3000 + Math.random() * 5000;
  }

  /** Speeds in pet-widths per second for variants and hobbies that move around. */
  const ROAM_SPEED = { pace: 0.6, zoomies: 1.5, fly: 1.5, chase: 1.6, circle: 1.8 };
  /** Roams that move the pet back and forth in depth. */
  const DEPTH_ROAMS = new Set(['zoomies', 'circle']);

  /** Picks the next spot for a roaming pet once it reaches the last one. */
  function roam(p, def, t, dt, size) {
    const arrived =
      Math.abs(p.wxTarget - p.wx) <= 1 &&
      Math.abs(p.wyTarget - p.wy) <= 1 &&
      Math.abs(p.wzTarget - p.wz) < 0.02;
    switch (def.roam) {
      case 'circle': {
        // Laps around its spot, going round the back and coming forward again.
        p.roamAngle += dt * 1.6;
        p.wxTarget = Math.cos(p.roamAngle) * Math.min(size * 0.9, viewW * 0.3);
        p.wzTarget = 0.35 * (1 - Math.sin(p.roamAngle));
        break;
      }
      case 'chase': {
        const c = scene.critter();
        if (c) {
          p.wxTarget = c.x - (p.x + size / 2);
        }
        break;
      }
      case 'pace':
        if (arrived) {
          p.wxTarget = p.roamDir * size * 0.6;
          p.roamDir = -p.roamDir;
        }
        break;
      case 'zoomies':
        // Short dashes near home, darting to the back and front.
        if (arrived) {
          p.wxTarget = p.roamDir * size * (0.5 + Math.random() * 0.5);
          p.wzTarget = Math.random() * 0.7;
          p.roamDir = -p.roamDir;
        }
        break;
      case 'fly':
        if (arrived || t > p.roamNext) {
          p.wxTarget = Math.random() * (viewW - size) - p.x;
          p.wyTarget = -size * 0.3 - Math.random() * Math.max(0, p.y - size * 0.3);
          p.roamNext = t + 2500;
        }
        break;
    }
  }

  function tickLife(p, t, dt) {
    if (t > p.twitchNext) {
      p.twitchAt = t;
      p.twitchNext = t + 3500 + Math.random() * 6000;
    }
    if (p !== main) {
      return;
    }
    const state = displayState(p);
    const def = lookOf(p, state, t);
    const size = petPx(p);
    const reacting = (p.reaction && t < p.reaction.until) || (p.care && t < p.care.until);
    const hobby = !!(p.fidget && p.fidget.hobby && t < p.fidget.until);
    const careSteer = play.target();
    const toySteer = careSteer === null ? scene.target() : null;
    const steer = careSteer !== null ? careSteer : toySteer;
    if (def.roam !== 'fly') {
      p.wyTarget = 0;
    }
    const resting = state === 'idle' || state === 'sleeping';
    if (!DEPTH_ROAMS.has(def.roam) && (!resting || steer !== null)) {
      p.wzTarget = 0;
    }
    if (careSteer !== null) {
      p.wxTarget = careSteer - (p.x + size / 2);
      p.fidget = null;
    } else if (play.tool()) {
      p.wxTarget = p.wx;
    } else if (toySteer !== null) {
      p.wxTarget = toySteer - (p.x + size / 2);
    } else if (def.roam && !dragging && !reacting) {
      roam(p, def, t, dt, size);
    } else if (state === 'idle' && !reacting && !dragging) {
      if (config.wander && !hobby && !p.walking && t > p.wanderNext) {
        p.wxTarget = (Math.random() - 0.5) * viewW * 0.8;
        // Sometimes stroll off towards the back of the panel, or come forward again.
        p.wzTarget = Math.random() < 0.35 ? Math.random() * 0.8 : 0;
        p.wanderNext = t + 7000 + Math.random() * 7000;
      }
      if (!p.walking && t > p.fidgetNext && (!p.fidget || t > p.fidget.until)) {
        startFidget(p, t);
      }
    } else if (state === 'sleeping') {
      p.wxTarget = p.wx;
    } else {
      // Work started: run back home.
      p.wxTarget = 0;
    }
    if (!config.wander && !play.tool()) {
      p.wxTarget = 0;
      p.wyTarget = 0;
      p.wzTarget = 0;
    }
    p.wxTarget = Math.max(-p.x, Math.min(viewW - size - p.x, p.wxTarget));
    p.wyTarget = Math.max(-(p.y - 6), Math.min(0, p.wyTarget));
    const diff = p.wxTarget - p.wx;
    const speed =
      steer !== null
        ? size * 1.8
        : def.roam
          ? size * ROAM_SPEED[def.roam]
          : state === 'idle'
            ? size * 0.7
            : size * 2.5;
    if (Math.abs(diff) > 1) {
      p.wx += Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
      p.walking = Math.sign(diff);
    } else {
      p.wx = p.wxTarget;
      p.walking = 0;
    }
    const dy = p.wyTarget - p.wy;
    p.wy += Math.sign(dy) * Math.min(Math.abs(dy), size * 1.2 * dt);
    const dz = p.wzTarget - p.wz;
    p.wz += Math.sign(dz) * Math.min(Math.abs(dz), (def.roam === 'circle' ? 1.2 : 0.5) * dt);
    if (p.wz > 0.02 && Math.abs(diff) <= 1 && Math.abs(dz) > 0.01) {
      p.walking = p.walking || p.roamDir;
    }
  }

  /** Click = pet it (hearts), double-click = trick (spin jump). Clicking wakes it up. */
  /**
   * The pet comes over to play with a toy (or use an object) you clicked. A
   * napping pet wakes up first; a busy one stays at work.
   */
  function playWith(toy) {
    if (!main) {
      return;
    }
    const t = now();
    main.wantsToy = null;
    if (isBusy() || play.tool() || dragging) {
      if (toy.def.kind === 'object') {
        scene.say(`🛠️ ${main.name} is busy. Play after the task!`, '#ffd23f', 2500);
      }
      return;
    }
    if (displayState(main) === 'sleeping') {
      startOneShot(main, 'waking', 'idle');
      main.oneShotUntil = t + 900;
    }
    if (displayState(main) !== 'idle') {
      main.wantsToy = toy;
      return;
    }
    const hobby = Variants.IDLE.find((h) => h.needs === 'toy');
    const dur = hobby.dur[0] + Math.random() * (hobby.dur[1] - hobby.dur[0]);
    if (scene.startToy(t + dur, toy)) {
      main.lastActivity = t;
      main.reaction = null;
      main.hobbyLast = hobby.id;
      main.fidget = { kind: hobby.id, start: t, until: t + dur, hobby };
      main.fidgetNext = t + dur + 2000 + Math.random() * 4000;
    }
  }

  function clickPet(p) {
    const t = now();
    if (isBusy()) {
      const c = center(p);
      emit({ x: c.x, y: p.y, vy: -30, text: '🛠️', size: petPx(p) * 0.18, life: 1 });
      panels.note(`🛠️ ${main.name} is busy working! Try again when the task is done.`);
      return;
    }
    if (p === main && t - lastPetCareAt > 3000) {
      lastPetCareAt = t;
      vscodeApi.postMessage({ command: 'care', action: 'pet' });
    }
    const double = lastClick.pet === p && t - lastClick.at < 350;
    lastClick = { pet: p, at: t };
    if (displayState(p) === 'sleeping') {
      startOneShot(p, 'waking', 'idle');
      p.oneShotUntil = t + 900;
    }
    p.lastActivity = t;
    p.fidget = null;
    const c = center(p);
    const s = petPx(p);
    if (double) {
      p.reaction = { kind: 'trick', start: t, until: t + 1200 };
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        emit({
          x: c.x,
          y: c.y,
          vx: Math.cos(a) * s * 0.9,
          vy: Math.sin(a) * s * 0.9,
          text: '⭐',
          size: s * 0.12,
          life: 0.8,
        });
      }
    } else {
      p.reaction = { kind: 'pet', start: t, until: t + 1500 };
      const hearts = ['💖', '💕', '💗'];
      for (let i = 0; i < 5; i++) {
        emit({
          x: c.x + (Math.random() - 0.5) * s * 0.5,
          y: p.y + s * 0.25,
          vx: (Math.random() - 0.5) * s * 0.3,
          vy: -s * (0.35 + Math.random() * 0.3),
          text: hearts[i % hearts.length],
          size: s * 0.12,
          life: 1.2,
        });
      }
    }
  }

  // -- Particles --------------------------------------------------------------
  function emit(part) {
    particles.push(
      Object.assign({ vx: 0, vy: 0, g: 0, life: 1, age: 0, size: 6, color: '#fff', spin: 0 }, part),
    );
  }

  function onEnter(p, state) {
    const c = center(p);
    const s = petPx(p);
    if (state === 'done') {
      for (let i = 0; i < (p === main ? 46 : 16); i++) {
        emit({
          x: c.x + (Math.random() - 0.5) * s * 0.4,
          y: p.y + s * 0.2,
          vx: (Math.random() - 0.5) * s * 2.2,
          vy: -Math.random() * s * 2.4 - s * 0.6,
          g: s * 4,
          life: 1.6 + Math.random() * 0.6,
          size: Math.max(2, p.scale * 0.9),
          color: CONFETTI[i % CONFETTI.length],
          spin: (Math.random() - 0.5) * 12,
        });
      }
    } else if (state === 'error') {
      emit({
        x: c.x + s * 0.32,
        y: p.y + s * 0.1,
        text: '💢',
        size: s * 0.2,
        life: 1.2,
        vy: -s * 0.15,
      });
    }
  }

  /** Milliseconds between puffs of each ambient effect. */
  const FX_EVERY = {
    zzz: 1300,
    sweat: 380,
    alert: 900,
    sparkle: 600,
    glow: 700,
    steam: 600,
    pages: 1600,
    paws: 700,
    code: 160,
    matrix: 90,
    sparks: 110,
    dust: 220,
    splash: 260,
    notes: 550,
    shout: 900,
    clock: 1100,
    wave: 1000,
    fume: 260,
    anger: 650,
    stars: 380,
    popcorn: 450,
    sweatDrop: 1100,
    dirt: 80,
    dream: 1500,
    disco: 420,
    magic: 480,
    bubbles: 380,
    twinkle: 340,
    confetti: 70,
  };
  const CODE_CHARS = '{}();<>=+*/[]01$#&|!?';
  const CODE_COLORS = ['#5aa9ff', '#ffd23f', '#b48cff', '#6be675', '#ff9f43'];

  function pickOne(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function ambientFx(p, def, t) {
    const every = def.fx ? FX_EVERY[def.fx] : 0;
    if (!every || t - p.fxAt < every) {
      return;
    }
    p.fxAt = t;
    const s = petPx(p);
    const c = center(p);
    const top = p.y + p.wy;
    const feet = p.y + s * 0.92;
    const r = Math.random;
    const side = r() < 0.5 ? -1 : 1;
    const dir = p.walking || side;
    const bit = Math.max(2, p.scale * 0.7);
    const txt = (text, x, y, extra) => emit(Object.assign({ x, y, text, size: s * 0.1 }, extra));
    switch (def.fx) {
      case 'zzz':
        emit({
          x: c.x + s * 0.25,
          y: top + s * 0.3,
          vx: s * 0.12,
          vy: -s * 0.22,
          text: r() < 0.5 ? 'z' : 'Z',
          font: true,
          size: s * 0.1,
          grow: 1.2,
          life: 2.2,
          color: fgColor,
        });
        break;
      case 'sweat':
        txt('💨', c.x + side * s * 0.38, feet, { vx: side * s * 0.3, vy: -s * 0.05, life: 0.6 });
        emit({
          x: c.x + side * s * 0.2,
          y: top + s * 0.18,
          vx: side * s * 0.5,
          vy: -s * 0.6,
          g: s * 2.5,
          size: bit,
          color: '#7fd3ff',
          life: 0.7,
        });
        break;
      case 'alert':
        if (p !== main) {
          txt('❗', c.x, top, { vy: -s * 0.4, size: s * 0.22, life: 0.9 });
        }
        break;
      case 'sparkle':
        txt('✨', c.x + (r() - 0.5) * s * 0.8, top + r() * s * 0.6, { vy: -s * 0.15, life: 0.9 });
        break;
      case 'glow':
        txt('✨', c.x + (r() - 0.5) * s * 0.3, top, { vy: -s * 0.2, size: s * 0.08, life: 0.9 });
        break;
      case 'steam':
        txt('〰️', c.x + s * 0.22, top + s * 0.5, { vy: -s * 0.25, size: s * 0.07, life: 1.4 });
        break;
      case 'pages':
        txt('📄', c.x + side * s * 0.2, top + s * 0.7, {
          vx: side * s * 0.3,
          vy: -s * 0.3,
          g: s * 0.6,
          size: s * 0.08,
          life: 1.2,
        });
        break;
      case 'paws':
        txt('🐾', c.x - dir * s * 0.3, feet, { size: s * 0.07, life: 1.6 });
        break;
      case 'code':
        emit({
          x: c.x + (r() - 0.5) * s * 0.4,
          y: top + s * 0.75,
          vx: (r() - 0.5) * s * 0.6,
          vy: -s * (0.4 + r() * 0.3),
          g: s * 0.5,
          text: pickOne(CODE_CHARS),
          font: true,
          size: s * 0.08,
          color: pickOne(CODE_COLORS),
          life: 1,
        });
        break;
      case 'matrix':
        emit({
          x: c.x + (r() - 0.5) * s * 1.2,
          y: top,
          vy: s * 0.6,
          text: r() < 0.5 ? '0' : '1',
          font: true,
          size: s * 0.07,
          color: '#5ae38a',
          life: 1.4,
        });
        break;
      case 'sparks':
        for (let i = 0; i < 2; i++) {
          emit({
            x: c.x + s * 0.3,
            y: top + s * 0.6,
            vx: (r() - 0.3) * s * 1.2,
            vy: -s * r() * 0.9,
            g: s * 3,
            size: bit * 0.7,
            color: r() < 0.5 ? '#ffd23f' : '#ff9f43',
            life: 0.5,
          });
        }
        break;
      case 'dust':
        txt('💨', c.x - dir * s * 0.35, feet, { vx: -dir * s * 0.3, life: 0.6 });
        break;
      case 'splash':
        emit({
          x: c.x + (r() - 0.5) * s * 0.9,
          y: feet,
          vx: (r() - 0.5) * s * 0.6,
          vy: -s * (0.5 + r() * 0.4),
          g: s * 2.5,
          size: bit,
          color: '#7fd3ff',
          life: 0.7,
        });
        break;
      case 'notes':
        txt(r() < 0.5 ? '🎵' : '🎶', c.x + side * s * 0.4, top + s * 0.3, {
          vx: side * s * 0.15,
          vy: -s * 0.3,
          life: 1.4,
        });
        break;
      case 'shout':
        emit({
          x: c.x + s * 0.6,
          y: top + s * 0.4,
          vx: s * 0.35,
          vy: -s * 0.05,
          text: pickOne(['GO!', 'HUP!', '!!']),
          font: true,
          size: s * 0.08,
          color: '#ffd23f',
          life: 0.9,
        });
        break;
      case 'clock':
        txt('⏰', c.x + s * 0.4, top + s * 0.15, { vy: -s * 0.2, life: 1.1 });
        break;
      case 'wave':
        txt('👋', c.x + s * 0.42, top + s * 0.35, { vy: -s * 0.15, size: s * 0.12, life: 0.9 });
        break;
      case 'fume':
        txt('💨', c.x + side * s * 0.3, top + s * 0.15, {
          vx: side * s * 0.25,
          vy: -s * 0.35,
          size: s * 0.09,
          life: 0.8,
        });
        break;
      case 'anger':
        txt('💢', c.x + (r() - 0.5) * s * 0.6, top + s * 0.1, {
          vy: -s * 0.2,
          size: s * 0.13,
          life: 0.8,
        });
        break;
      case 'stars':
        txt('⭐', c.x + (r() - 0.5) * s * 0.9, top + s * 0.2, {
          vx: (r() - 0.5) * s * 0.6,
          vy: -s * 0.6,
          g: s * 1.2,
          size: s * 0.08,
          life: 1.1,
        });
        break;
      case 'popcorn':
        txt('🍿', c.x + s * 0.18, top + s * 0.62, {
          vx: (r() - 0.5) * s * 0.3,
          vy: -s * (0.5 + r() * 0.3),
          g: s * 2.5,
          size: s * 0.07,
          life: 0.8,
        });
        break;
      case 'sweatDrop':
        txt('💦', c.x + side * s * 0.3, top + s * 0.2, { vy: s * 0.1, size: s * 0.09, life: 0.9 });
        break;
      case 'dirt':
        emit({
          x: c.x + (r() - 0.5) * s * 0.3,
          y: feet,
          vx: side * s * (0.6 + r() * 0.6),
          vy: -s * (0.4 + r() * 0.4),
          g: s * 3,
          size: bit,
          color: r() < 0.5 ? '#8b5a2b' : '#6b4a26',
          life: 0.7,
        });
        break;
      case 'dream':
        txt(pickOne(['💭', '☁️', '🌙', '🦋']), c.x + s * 0.35, top + s * 0.1, {
          vy: -s * 0.15,
          life: 1.6,
        });
        break;
      case 'disco':
        txt(pickOne(['🪩', '✨', '🎶', '💫']), c.x + (r() - 0.5) * s, top + r() * s * 0.4, {
          vy: -s * 0.2,
          life: 1.2,
        });
        break;
      case 'magic':
        txt(pickOne(['✨', '⭐', '🐇', '🎩']), c.x + side * s * 0.35, top + s * 0.3, {
          vx: side * s * 0.2,
          vy: -s * 0.4,
          g: s * 0.6,
          life: 1,
        });
        break;
      case 'bubbles':
        txt('🫧', c.x + dir * s * 0.25, top + s * 0.45, {
          vx: dir * s * (0.1 + r() * 0.15),
          vy: -s * (0.15 + r() * 0.15),
          size: s * (0.06 + r() * 0.06),
          life: 1.8,
        });
        break;
      case 'twinkle':
        txt(pickOne(['⭐', '✨', '🌟']), c.x + (r() - 0.3) * s * 1.2, top - r() * s * 0.3, {
          size: s * 0.07,
          life: 0.8,
        });
        break;
      case 'confetti':
        emit({
          x: c.x + (r() - 0.5) * s,
          y: top,
          vx: (r() - 0.5) * s * 0.4,
          vy: -s * (0.2 + r() * 0.3),
          g: s * 0.8,
          size: bit,
          color: pickOne(CONFETTI),
          spin: (r() - 0.5) * 12,
          life: 1.4,
        });
        break;
    }
  }

  function stepParticles(dt) {
    particles = particles.filter((q) => {
      q.age += dt;
      q.vy += q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      return q.age < q.life;
    });
  }

  function drawParticles() {
    for (const q of particles) {
      const fade = 1 - q.age / q.life;
      ctx.globalAlpha = Math.max(0, Math.min(1, fade * 1.5));
      if (q.text) {
        const size = q.size * (1 + (q.grow || 0) * (q.age / q.life));
        ctx.font = q.font ? `bold ${size}px monospace` : `${size}px sans-serif`;
        ctx.fillStyle = q.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(q.text, q.x, q.y);
      } else {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.spin * q.age);
        ctx.fillStyle = q.color;
        ctx.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  // -- Drawing ----------------------------------------------------------------
  /**
   * Rotates the pet about the middle of its sprite instead of its feet (the
   * canvas pivot), then lifts it so the lowest corner still touches the floor.
   */
  function roll(m, a) {
    const h = Art.SIZE / 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    m.rot = a;
    m.dx += -h * sn;
    m.dy += -h * (1 - c) - h * (Math.abs(c) + Math.abs(sn) - 1);
  }

  function smoothstep(u) {
    return 0.5 - 0.5 * Math.cos(Math.max(0, Math.min(1, u)) * Math.PI);
  }

  function motionFor(name, tt, p) {
    const m = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 };
    const breath = Math.sin(tt * 1.8);
    switch (name) {
      case 'sideSleep':
        roll(m, -Math.PI / 2);
        m.sx = 1 + 0.035 * breath;
        break;
      case 'rollSleep': {
        // Flips from one side to the other every 8 seconds.
        const k = Math.floor(tt / 8);
        const from = -Math.PI / 2 - Math.max(0, k - 1) * Math.PI;
        const to = -Math.PI / 2 - k * Math.PI;
        roll(m, k === 0 ? to : from + (to - from) * smoothstep((tt - k * 8) / 1.2));
        m.sx = 1 + 0.035 * breath;
        break;
      }
      case 'bellyUp':
        roll(m, Math.PI);
        m.sy = 1 + 0.03 * breath;
        break;
      case 'loaf':
        m.sx = 1.12 + 0.02 * breath;
        m.sy = 0.8 - 0.02 * breath;
        break;
      case 'levitate':
        m.dy = -4 - Math.sin(tt * 2) * 1.5;
        break;
      case 'sip':
        m.rot = -Math.max(0, Math.sin(tt * 1.4)) * 0.12;
        break;
      case 'sniff':
        m.dy = 1.5;
        m.rot = (p.walking || 1) * 0.12 + Math.sin(tt * 9) * 0.02;
        break;
      case 'scribble':
        m.dx = Math.sin(tt * 22) * 0.3;
        m.rot = Math.sin(tt * 11) * 0.025;
        break;
      case 'tinker':
        m.dy = -Math.abs(Math.sin(tt * 8)) * 0.8;
        m.rot = Math.sin(tt * 8) * 0.05;
        break;
      case 'surf':
        m.dy = Math.sin(tt * 2.2) * 1.2;
        m.rot = Math.sin(tt * 2.2 + 1) * 0.1;
        break;
      case 'conduct':
        m.rot = Math.sin(tt * 5) * 0.09;
        m.dy = -Math.abs(Math.sin(tt * 5));
        break;
      case 'bob':
        m.dy = Math.sin(tt * 3);
        break;
      case 'tap': {
        const up = Math.floor(tt * 4) % 2;
        m.dy = up ? -0.6 : 0;
        m.rot = up ? 0.02 : -0.01;
        break;
      }
      case 'wave':
        m.rot = Math.sin(tt * 6) * 0.1;
        break;
      case 'stomp': {
        const h = Math.abs(Math.sin(tt * 9));
        m.dy = -h * 2.5;
        m.dx = Math.sin(tt * 4.5) * 1.5;
        m.sy = h < 0.15 ? 0.88 : 1;
        m.sx = h < 0.15 ? 1.08 : 1;
        break;
      }
      case 'flop':
        roll(m, (Math.PI / 2) * smoothstep(tt * 2.5));
        break;
      case 'dance':
        m.rot = Math.sin(tt * 4) * 0.18;
        m.dy = -Math.abs(Math.sin(tt * 8)) * 2;
        m.dx = Math.sin(tt * 4) * 1.5;
        break;
      case 'backflip': {
        const u = (tt % 1.6) / 1.6;
        roll(m, -smoothstep((u - 0.1) / 0.6) * Math.PI * 2);
        m.dy -= Math.sin(Math.min(1, u / 0.8) * Math.PI) * 12;
        break;
      }
      case 'roll':
        roll(m, smoothstep(tt / 1.8) * Math.PI * 2);
        break;
      case 'fly':
        m.dy = Math.sin(tt * 6) * 1.2;
        m.rot = p.walking * 0.12;
        break;
      case 'dig':
        m.dy = 1.5 + Math.abs(Math.sin(tt * 12)) * 0.6;
        m.rot = 0.08 + Math.sin(tt * 12) * 0.03;
        break;
      case 'watch':
        m.dy = Math.sin(tt * 1.2) * 0.3;
        m.rot = Math.sin(tt * 0.6) * 0.03;
        break;
      case 'jitter':
        m.dx = (Math.random() - 0.5) * 0.7;
        m.dy = Math.sin(tt * 1.5) * 0.3;
        break;
      case 'breathe':
        m.sy = 1 + 0.035 * Math.sin(tt * 1.8);
        m.sx = 1 - 0.015 * Math.sin(tt * 1.8);
        break;
      case 'idle':
        m.dy = Math.sin(tt * 1.6) * 0.4;
        break;
      case 'stretch':
        m.sy = 1 + 0.1 * Math.sin(Math.min(tt / 1.2, 1) * Math.PI);
        m.sx = 1 - 0.05 * Math.sin(Math.min(tt / 1.2, 1) * Math.PI);
        break;
      case 'tilt':
        m.rot = Math.sin(tt * 1.3) * 0.07;
        m.dy = Math.sin(tt * 2.6) * 0.4;
        break;
      case 'scan':
        m.dx = Math.sin(tt * 1.4) * 1.2;
        m.rot = Math.sin(tt * 1.4) * 0.03;
        break;
      case 'type':
        m.dy = Math.floor(tt * 9) % 2 ? -0.6 : 0;
        break;
      case 'run':
        m.dy = -Math.abs(Math.sin(tt * 11)) * 2;
        m.rot = Math.sin(tt * 11) * 0.04;
        break;
      case 'bounce':
        m.dy = -Math.abs(Math.sin(tt * 4.5)) * 2;
        break;
      case 'hop': {
        const h = Math.abs(Math.sin(tt * 6));
        m.dy = -h * 4;
        m.sy = 1 + (h < 0.15 ? -0.08 : 0.04);
        break;
      }
      case 'shake': {
        const k = Math.max(0, 1 - tt / 1.4);
        m.dx = (Math.random() - 0.5) * 3 * k;
        m.rot = (Math.random() - 0.5) * 0.06 * k;
        break;
      }
      case 'jump': {
        const h = Math.abs(Math.sin(tt * 5.5));
        m.dy = -h * 7;
        m.sy = h < 0.12 ? 0.86 : 1.06;
        m.sx = h < 0.12 ? 1.1 : 0.96;
        m.rot = Math.sin(tt * 2.75) * 0.08;
        break;
      }
      case 'walk':
        m.dy = -Math.abs(Math.sin(tt * 9)) * 1.5;
        m.rot = p.walking * 0.06;
        break;
      case 'wiggle': {
        const k = Math.max(0, 1 - tt / 1.5);
        m.rot = Math.sin(tt * 14) * 0.07 * k;
        m.sy = 1 + Math.sin(tt * 14) * 0.04 * k;
        break;
      }
      case 'trick': {
        const u = Math.min(tt / 1.2, 1);
        m.dy = -Math.sin(u * Math.PI) * 9;
        m.sx = Math.cos(u * Math.PI * 2);
        break;
      }
      case 'spin':
        m.sx = Math.cos(tt * Math.PI * 2.5);
        m.dx = Math.sin(tt * Math.PI * 2.5) * 2;
        break;
      case 'groom':
        m.rot = Math.sin(tt * 3) * 0.1;
        m.dy = Math.sin(tt * 7) * 0.3;
        break;
      case 'eat':
        m.dy = 1 + Math.abs(Math.sin(tt * 10)) * 0.8;
        break;
    }
    if (name !== 'breathe') {
      m.sy *= 1 + 0.012 * Math.sin(now() / 450 + p.hue);
    }
    if (p !== main) {
      m.dy += -Math.abs(Math.sin(tt * 3 + p.hue)) * 0.6;
    }
    return m;
  }

  /**
   * Everything about how the pet looks this frame. Layers, lowest priority
   * first: agent state, idle fidget, walking, click reaction, mouse-following
   * pupils, ear twitch, blink.
   */
  function pose(p, def, state, tt, t) {
    const out = {
      eyes: def.eyes,
      mouth: def.mouth,
      look: 0,
      twitch: false,
      wag: def.wag,
      motion: def.motion,
      mt: tt,
    };
    if (state === 'waking') {
      out.eyes = tt < 0.7 ? 'sleepy' : 'open';
    }
    if (state === 'reading' && Math.floor(tt / 1.6) % 3 === 2) {
      out.eyes = 'open';
    }

    const f = state === 'idle' && p.fidget && t < p.fidget.until ? p.fidget : null;
    if (f) {
      const ft = (t - f.start) / 1000;
      out.mt = ft;
      switch (f.kind) {
        case 'lookL':
          out.look = -1;
          break;
        case 'lookR':
          out.look = 1;
          break;
        case 'twitch':
          out.twitch = Math.floor(ft * 8) % 2 === 0;
          break;
        case 'yawn':
          out.eyes = 'closed';
          out.mouth = 'yawn';
          out.motion = 'stretch';
          break;
        case 'hop':
          out.eyes = 'happy';
          out.motion = 'hop';
          break;
        case 'chase':
          out.mouth = 'open';
          out.motion = 'spin';
          out.wag = 10;
          break;
        case 'groom':
          out.eyes = 'happy';
          out.mouth = 'tongue';
          out.motion = 'groom';
          break;
        case 'wag':
          out.eyes = 'happy';
          out.mouth = 'smile';
          out.wag = 9;
          break;
      }
    }

    if (p.walking && def.roam) {
      out.look = p.walking;
    } else if (p.walking) {
      out.motion = 'walk';
      out.mt = t / 1000;
      out.look = p.walking;
      out.wag = 5;
    }
    if (p.wy < -2) {
      out.motion = 'fly';
      out.mt = t / 1000;
      out.wag = 14;
    }
    const critter = def.critter ? scene.critter() : null;
    if (critter) {
      out.look = Math.sign(critter.x - center(p).x);
    }
    if (p === main && state === 'testing' && !p.walking && scene.machineCount() > 0) {
      out.look = scene.machineSide();
    }

    const hint = p === main ? play.pose() || scene.pose() : null;
    if (hint) {
      Object.assign(out, hint);
      if (hint.motion) {
        out.mt = t / 1000;
      }
    }

    const cr = p.care && t < p.care.until ? p.care : null;
    if (cr) {
      const ct = (t - cr.start) / 1000;
      out.mt = ct;
      out.look = 0;
      switch (cr.kind) {
        case 'eat':
          out.eyes = 'happy';
          out.mouth = Math.floor(ct * 6) % 2 ? 'open' : 'neutral';
          out.motion = 'eat';
          out.wag = 6;
          break;
        case 'catch':
          out.eyes = 'happy';
          out.mouth = 'smile';
          out.motion = 'jump';
          out.wag = 10;
          break;
        case 'shake':
          out.eyes = 'closed';
          out.mouth = 'flat';
          out.motion = 'shake';
          break;
        case 'refuse':
          out.eyes = 'closed';
          out.mouth = 'frown';
          out.motion = 'shake';
          out.wag = 0;
          break;
      }
    } else if (state === 'idle' && !f && !hint && lowestStat() === 'fun') {
      out.mouth = 'frown';
    }

    const r = p.reaction && t < p.reaction.until ? p.reaction : null;
    if (r) {
      out.mt = (t - r.start) / 1000;
      out.eyes = 'happy';
      out.mouth = r.kind === 'trick' ? 'open' : 'smile';
      out.motion = r.kind === 'trick' ? 'trick' : 'wiggle';
      out.wag = 10;
    }

    if (out.eyes === 'open' && out.look === 0 && mouse && t - mouse.at < 4000) {
      const cx = center(p).x;
      const band = petPx(p) * 0.2;
      out.look = mouse.x < cx - band ? -1 : mouse.x > cx + band ? 1 : 0;
    }
    if (state !== 'sleeping' && t - p.twitchAt < 260) {
      out.twitch = true;
    }
    const blinkable = out.eyes === 'open' || out.eyes === 'lookDown' || out.eyes === 'focus';
    if (blinkable && (t + p.hue * 1000) % p.blinkEvery < 130) {
      out.eyes = 'closed';
    }
    return out;
  }

  function drawAura(p, def, t) {
    if (!config || !config.stateColors || !def.color) {
      return;
    }
    const c = center(p);
    const s = petPx(p);
    const r = s * 0.62;
    const pulse = 0.22 + 0.1 * Math.sin(t / 380);
    const rgb = Art.hexToRgb(def.color);
    const g = ctx.createRadialGradient(c.x, c.y + s * 0.08, s * 0.1, c.x, c.y + s * 0.08, r);
    g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${pulse})`);
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y + s * 0.08, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Emojis orbit the main pet; the half behind it is drawn before the sprite. */
  function drawOrbit(p, def, tt, front) {
    const n = def.emojis.length;
    if (n === 0) {
      return;
    }
    const c = center(p);
    const s = petPx(p);
    ctx.font = `${Math.round(s * 0.13)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const a = tt * 0.9 + (i * Math.PI * 2) / n;
      const isFront = Math.sin(a) > 0;
      if (isFront !== front) {
        continue;
      }
      const depth = 0.75 + 0.25 * Math.sin(a);
      ctx.globalAlpha = 0.55 + 0.45 * depth;
      ctx.save();
      ctx.translate(c.x + Math.cos(a) * s * 0.62, c.y - s * 0.05 + Math.sin(a) * s * 0.22);
      ctx.scale(depth, depth);
      ctx.fillText(def.emojis[i], 0, Math.sin(tt * 3 + i) * s * 0.02);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawBubble(p, def, tt) {
    const s = petPx(p);
    const px = p.x + p.wx;
    const top = p.y + p.wy;
    const bx = px + s * 0.88;
    const by = top + s * 0.02;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#22222a';
    ctx.lineWidth = Math.max(1.5, p.scale * 0.4);
    if (def.bubble === 'thought') {
      const dots = [
        [px + s * 0.7, top + s * 0.22, s * 0.03],
        [px + s * 0.78, top + s * 0.12, s * 0.045],
      ];
      for (const [x, y, r] of dots) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(bx, by, s * 0.17, s * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#22222a';
      const shown = Math.floor(tt * 2.5) % 4;
      for (let i = 0; i < shown; i++) {
        ctx.beginPath();
        ctx.arc(bx - s * 0.07 + i * s * 0.07, by, s * 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (def.bubble === 'shout') {
      const w = s * 0.24;
      const h = s * 0.2;
      const wob = Math.sin(tt * 8) * s * 0.01;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(bx - w / 2, by - h / 2 + wob);
      ctx.lineTo(bx + w / 2, by - h / 2 - wob);
      ctx.lineTo(bx + w / 2, by + h / 2 + wob);
      ctx.lineTo(bx - w * 0.05, by + h / 2);
      ctx.lineTo(bx - w * 0.35, by + h * 0.85);
      ctx.lineTo(bx - w * 0.25, by + h / 2);
      ctx.lineTo(bx - w / 2, by + h / 2 - wob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#22222a';
      ctx.font = `bold ${Math.round(h * 0.8)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.floor(tt * 1.4) % 2 ? '?' : '!', bx, by + h * 0.04);
    }
  }

  /** A rect in pixel style, a rounded blob in smooth style. */
  function blob(x, y, w, h) {
    if (smoothArt()) {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, w, h);
    }
  }

  /** Paws tapping on the laptop keyboard while writing. */
  function drawTypingPaws(p, pal, tt) {
    const s = p.scale;
    const sp = Art.SPECIES[config ? config.species : 'cat'];
    const y = sp.pawY - 8 + 7;
    const up = Math.floor(tt * 9) % 2;
    for (const [x, lift] of [
      [11, up],
      [18, 1 - up],
    ]) {
      ctx.fillStyle = pal.o;
      blob((x - 16) * s, (y - lift - 32) * s, 4 * s, 3 * s);
      ctx.fillStyle = pal.l;
      blob((x - 15) * s, (y - lift - 31) * s, 2 * s, 1 * s);
    }
  }

  function propPlacement(name, sp, tt) {
    switch (name) {
      case 'partyHat':
        return { x: 12, y: sp.headTop - 7 };
      case 'nightcap':
        return { x: 12, y: sp.headTop - 6 };
      case 'laptop':
        return { x: 8, y: sp.pawY - 8 };
      case 'magnifier':
        return { x: 21, y: 15 + Math.round(Math.sin(tt * 2.5)) };
      case 'binoculars':
        return { x: 10, y: sp.eyeY - 1 };
      case 'clipboard':
        return { x: 1, y: 17 + Math.round(Math.sin(tt * 3)) };
      case 'cloud':
        return { x: 9, y: sp.headTop - 13 + Math.round(Math.sin(tt * 2)) };
      case 'bulb':
        return { x: 13, y: sp.headTop - 11 + Math.round(Math.sin(tt * 2)) };
      case 'mug':
        return { x: 20, y: sp.pawY - 10 };
      case 'book':
      case 'scroll':
        return { x: 9, y: sp.pawY - 8 };
      case 'keyboard':
        return { x: 6, y: sp.pawY - 3 };
      case 'notepad':
        return { x: 10, y: sp.pawY - 8 };
      case 'wrench':
        return { x: 21, y: 18 + Math.round(Math.sin(tt * 8)) };
      case 'telescope':
        return { x: 21, y: sp.eyeY - 6 };
      case 'megaphone':
        return { x: 22, y: sp.mouthY - 3 };
      case 'baton':
        return { x: 22, y: 12 + Math.round(Math.sin(tt * 5) * 2) };
      case 'sign':
        return { x: 22, y: 6 + Math.round(Math.sin(tt * 3)) };
      case 'trophy':
        return { x: 11, y: sp.headTop - 12 + Math.round(Math.abs(Math.sin(tt * 4)) * -2) };
      default:
        return { x: 0, y: 0 };
    }
  }

  /** Props that sit on (or are held over) the head, so a hat accessory steps aside. */
  const HEAD_PROPS = new Set(['partyHat', 'nightcap', 'bulb', 'trophy']);

  function drawPet(p, t) {
    if (!config) {
      return;
    }
    const state = displayState(p);
    const def = lookOf(p, state, t);
    const tt = (t - p.stateSince) / 1000;
    const s = p.scale;
    const size = petPx(p);
    const species = config.species;
    const sp = Art.SPECIES[species];
    const color = p === main ? baseColor() : Art.rotateHue(baseColor(), p.hue);
    const tint = config.stateColors && def.color ? def.color : '';
    const ps = pose(p, def, state, tt, t);
    const frame = ps.wag > 0 ? Math.floor((t / 1000) * ps.wag) % 2 : 0;
    const m = motionFor(ps.motion, ps.mt, p);
    const lift = (def.lift || 0) + (p === main ? scene.lift() / s : 0);
    const x0 = p.x + p.wx;
    const dk = depthK(p);
    const back = p.wz * size * DEPTH_RISE;
    const floor = p.y + size - s - back;
    const hide = [];
    if (HEAD_PROPS.has(def.prop)) {
      hide.push('head');
    }
    if (def.prop === 'binoculars') {
      hide.push('face');
    }

    let k = 1;
    if (p.spawnAt) {
      k = easeOutBack(Math.min(1, (t - p.spawnAt) / 450));
    }
    if (p.leavingAt) {
      k = Math.max(0, 1 - (t - p.leavingAt) / 450);
    }
    if (k <= 0.001) {
      return;
    }

    drawAura(p, def, t);
    if (p === main) {
      drawOrbit(p, def, tt, false);
    }

    // Ground shadow, shrinking as a flying pet climbs.
    const air = 1 - Math.min(0.6, -p.wy / (size * 2));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(
      x0 + size / 2,
      floor,
      size * 0.32 * k * air * dk,
      size * 0.05 * k * air * dk,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    if (def.scene) {
      scene.scenery(def.scene, 'back', x0 + size / 2, floor, size * dk, s * dk, t);
    }

    ctx.save();
    ctx.translate(
      Math.round(x0 + size / 2 + m.dx * s * dk),
      Math.round(p.y + p.wy + size - back + (m.dy - lift) * s * dk),
    );
    ctx.rotate(m.rot);
    ctx.scale(m.sx * k * dk, m.sy * k * dk);
    const sprite = petSprite({
      color,
      tint,
      eyes: ps.eyes,
      mouth: ps.mouth,
      frame,
      look: ps.look,
      twitch: ps.twitch,
      hide: hide.join(','),
    });
    ctx.drawImage(sprite, -size / 2, -size, size, size);
    if (p === main) {
      play.drawOnPet(p, s);
    }

    if (state === 'sleeping') {
      // Snot bubble
      const r = (0.6 + 0.6 * (0.5 + 0.5 * Math.sin(tt * 1.8))) * s;
      ctx.fillStyle = 'rgba(190,230,255,0.75)';
      ctx.beginPath();
      ctx.arc(2 * s, (sp.mouthY - 1 - 32) * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (def.prop) {
      const at = propPlacement(def.prop, sp, tt);
      if (def.prop !== 'cloud' || Math.floor(tt * 6) % 4 !== 0) {
        const lit = def.prop === 'bulb' && Math.floor(tt * 1.5) % 3 !== 0;
        const img = propSprite(lit ? 'bulbOn' : def.prop);
        const f = artFactor();
        ctx.drawImage(
          img,
          (at.x - 16) * s,
          (at.y - 32) * s,
          (img.width / f) * s,
          (img.height / f) * s,
        );
      }
    }
    if (def.paws === 'typing') {
      drawTypingPaws(p, petPalette(color, tint), tt);
    }
    ctx.restore();
    if (def.scene) {
      scene.scenery(def.scene, 'front', x0 + size / 2, floor, size * dk, s * dk, t);
    }

    if (p === main) {
      drawOrbit(p, def, tt, true);
      drawBubble(p, def, tt);
    } else if (def.emojis.length > 0) {
      const e = def.emojis[Math.floor(tt / 1.2) % def.emojis.length];
      ctx.font = `${Math.round(size * 0.3)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e, x0 + size * 0.95, p.y + p.wy + size * 0.12 + Math.sin(tt * 4) * 2);
    }
    ambientFx(p, def, t);
    if (p === main) {
      careFx(p, t, size, x0);
    }
    drawLabels(p, def, k);
  }

  function drawLabels(p, def, k) {
    const size = petPx(p);
    const cx = center(p).x;
    const b = spriteBox(p);
    const y = b.y + b.s + 4;
    const isMain = p === main;
    const maxW = Math.min(viewW - 8, Math.max(size + 30, isMain ? 220 : 110));
    // Keep the text inside the panel when the pet stands near an edge.
    const put = (text, ty) => {
      const half = ctx.measureText(text).width / 2;
      ctx.fillText(text, Math.max(half + 4, Math.min(viewW - half - 4, cx)), ty);
    };
    ctx.globalAlpha = k * (p.background ? 0.75 : 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = fgColor;
    ctx.font = `bold ${isMain ? 13 : 10}px sans-serif`;
    put(clipText(p.name, maxW), y);
    ctx.globalAlpha = 0.7 * k;
    ctx.font = `${isMain ? 11 : 9}px sans-serif`;
    const low = isMain && displayState(p) === 'idle' ? lowestStat() : null;
    const second = isMain
      ? (low ? MOOD[low].label + ' ' + MOOD[low].emoji : def.label) +
        (p.detail && def.color ? ' - ' + p.detail : '')
      : p.task || def.label;
    put(clipText(second, maxW), y + (isMain ? 16 : 12));
    ctx.globalAlpha = 1;
  }

  // -- Session dots -----------------------------------------------------------
  function allSessions() {
    const seen = new Set();
    return claudeSessions.concat(peonSessions).filter((s) => {
      if (seen.has(s.id)) {
        return false;
      }
      seen.add(s.id);
      return true;
    });
  }

  function dotCenter(i) {
    return { x: 10 + DOT_R + i * (DOT_R * 2 + DOT_GAP), y: 10 + DOT_R };
  }

  function drawDots(t) {
    const sessions = allSessions().slice(0, MAX_DOTS);
    sessions.forEach((s, i) => {
      const c = dotCenter(i);
      if (s.hot) {
        const pulse = (Math.sin(t * 0.004 + i) + 1) / 2;
        ctx.fillStyle = `rgba(68,255,68,${0.25 * pulse})`;
        ctx.beginPath();
        ctx.arc(c.x, c.y, DOT_R + 2 + pulse * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(c.x, c.y, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = s.hot ? '#44ff44' : s.warm ? '#1a7d1a' : '#555';
      ctx.fill();
    });
  }

  // -- Layout -----------------------------------------------------------------
  function mainScale() {
    return Math.max(2, Math.floor((config ? config.size : 200) / Art.SIZE));
  }

  function clampMain() {
    if (!main) {
      return;
    }
    const s = petPx(main);
    main.x = Math.max(0, Math.min(main.x, viewW - s));
    main.y = Math.max(24, Math.min(main.y, viewH - s - 34));
  }

  function defaultMainPos() {
    const s = petPx(main);
    main.x = (viewW - s) / 2;
    main.y = Math.max(28, viewH * 0.38 - s / 2);
  }

  /**
   * Minis line up along the bottom of the panel: sub-agents first, then other
   * sessions. If the main pet is in the way they go just below it, or above it.
   */
  function layoutMinis() {
    if (!main) {
      return;
    }
    const list = [...minis.values()].filter((m) => !m.leavingAt);
    const n = list.length;
    if (n === 0) {
      return;
    }
    const mpx = petPx(list[0]);
    const cellW = Math.max(mpx + 30, 100);
    const cellH = mpx + 34;
    const size = petPx(main);
    // The band to use: [left, right) across, starting at `top`.
    let left = 0;
    let right = viewW;
    let cols = Math.max(1, Math.floor(viewW / cellW));
    let rows = Math.ceil(n / cols);
    let top = viewH - rows * cellH - 4;
    const below = main.y + size + 40;
    let front = false;
    if (top < below) {
      const above = main.y - rows * cellH - 8;
      const roomRight = viewW - (main.x + size);
      const side = Math.max(roomRight, main.x);
      if (below + rows * cellH <= viewH) {
        top = below;
      } else if (above >= 24) {
        top = above;
      } else if (side >= cellW) {
        // No room above or below: stack them beside the pet instead of on it.
        [left, right] = roomRight >= main.x ? [main.x + size, viewW] : [0, main.x];
        cols = Math.max(1, Math.floor(side / cellW));
        rows = Math.ceil(n / cols);
        top = Math.max(24, viewH - rows * cellH - 4);
      } else {
        // Nowhere free: keep them along the bottom, drawn in front of the pet.
        front = true;
      }
    }
    list.forEach((m, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const inRow = Math.min(cols, n - row * cols);
      const startX = left + (right - left - inRow * cellW) / 2;
      m.tx = startX + col * cellW + (cellW - mpx) / 2;
      m.ty = top + row * cellH;
      m.front = front;
    });
  }

  function resizeCanvas() {
    viewW = document.body.clientWidth || 300;
    viewH = document.body.clientHeight || 300;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = smoothArt();
    canvas.style.imageRendering = smoothArt() ? 'auto' : 'pixelated';
    clampMain();
    layoutMinis();
  }

  // -- Applying updates -------------------------------------------------------
  function applyConfig(next) {
    config = next;
    spriteCache.clear();
    if (typeof getComputedStyle === 'function') {
      fgColor = getComputedStyle(document.body).color || fgColor;
    }
    if (!main) {
      main = makePet({ scale: mainScale(), name: config.name });
      if (typeof saved.petX === 'number' && typeof saved.petY === 'number') {
        main.x = saved.petX;
        main.y = saved.petY;
      } else {
        defaultMainPos();
      }
    } else {
      main.scale = mainScale();
      main.name = config.name;
      main.variant = null;
    }
    const miniScale = Math.max(2, Math.floor(main.scale * 0.45));
    minis.forEach((m) => {
      m.scale = miniScale;
      m.variant = null;
    });
    resizeCanvas();
    panels.syncConfig();
    if (pendingClaude) {
      applyClaude(pendingClaude);
      pendingClaude = null;
    }
  }

  /** Feeds an agent update into a pet. A changed state counts even when seq did not move. */
  /** `key` names the agent the same way in every window: its session or sub-agent id. */
  function feed(p, u, key) {
    if (u.seq !== p.seq || u.state !== p.reported) {
      p.seq = u.seq;
      p.reported = u.state;
      p.syncKey = `${key}:${u.since}`;
      applyState(p, u.state, u.detail);
    } else {
      p.detail = u.detail || p.detail;
    }
  }

  /** Creates the mini for a sub-agent or background session on first sight. */
  function upsertMini(id, key, info, u, t) {
    let m = minis.get(id);
    if (!m) {
      const c = center(main);
      const miniScale = Math.max(2, Math.floor(main.scale * 0.45));
      const half = (miniScale * Art.SIZE) / 2;
      m = makePet(
        Object.assign(
          {
            id,
            scale: miniScale,
            x: c.x - half,
            y: c.y - half,
            base: 'idle',
            hue: 40 + minis.size * 67,
            spawnAt: t,
          },
          info,
        ),
      );
      minis.set(id, m);
      for (let i = 0; i < 10; i++) {
        emit({
          x: c.x,
          y: c.y,
          vx: (Math.random() - 0.5) * 160,
          vy: (Math.random() - 0.5) * 160,
          text: '✨',
          size: 12,
          life: 0.7,
        });
      }
    }
    feed(m, u, key);
  }

  function applyClaude(msg) {
    claudeSessions = msg.sessions || [];
    if (!main) {
      pendingClaude = msg;
      return;
    }
    if (msg.main) {
      project = msg.main.project || '';
      feed(main, msg.main, msg.main.sessionId);
    }

    const t = now();
    const live = new Set();
    const subagents = msg.subagents || [];
    subagents.forEach((sa) => {
      live.add(sa.id);
      upsertMini(sa.id, sa.id, { name: sa.name, task: sa.task, agentType: sa.agentType }, sa, t);
    });
    // The row is for this repo's agents. Other repos' sessions only fill it
    // while nothing is running here, and step aside when a helper starts.
    const background = msg.background || [];
    const localRow = background.filter((b) => b.local && config.backgroundPets);
    const idleHere = subagents.length === 0 && localRow.length === 0;
    const otherRow = idleHere && config.otherRepoPets ? background.filter((b) => !b.local) : [];
    localRow.concat(otherRow).forEach((b) => {
      const id = 'bg:' + b.id;
      live.add(id);
      const info = {
        name: b.project || 'another session',
        agentType: 'session',
        background: true,
        otherRepo: !b.local,
      };
      upsertMini(id, b.id, info, b, t);
    });
    minis.forEach((m, id) => {
      if (!live.has(id) && !m.leavingAt) {
        m.leavingAt = t;
        const c = center(m);
        emit({ x: c.x, y: c.y, text: '💨', size: petPx(m) * 0.5, life: 0.8, vy: -20 });
      }
    });
    scene.setJobs(
      ((msg.main && msg.main.jobs) || []).concat(...subagents.map((sa) => sa.jobs || [])),
    );
    layoutMinis();
  }

  // -- Render loop ------------------------------------------------------------
  // Each frame clears the canvas first, so a frame that throws leaves the
  // panel blank. Errors are logged; the view heals itself and, if frames keep
  // failing, asks the extension for a refresh.
  const CHECK_EVERY_MS = 5 * 60 * 1000;
  const REFRESH_AFTER_MS = 10000;
  let frames = 0;
  let frameErrors = 0;
  let lastFrameError = '';
  let failingSince = 0;

  function render() {
    requestAnimationFrame(render);
    try {
      drawFrame();
      frames++;
      failingSince = 0;
    } catch (err) {
      frameFailed(err);
    }
  }

  function frameFailed(err) {
    const t = now();
    const text = err instanceof Error ? err.stack || err.message : String(err);
    frameErrors++;
    if (text !== lastFrameError) {
      lastFrameError = text;
      log('error', `Frame failed: ${text}`);
    }
    if (!failingSince) {
      failingSince = t;
      heal('a frame failed');
    } else if (t - failingSince > REFRESH_AFTER_MS) {
      failingSince = t;
      log('error', 'Frames keep failing, asking for a refresh');
      vscodeApi.postMessage({ command: 'refresh' });
    }
  }

  /** A pet with a NaN position draws nowhere without any error. */
  function rescuePet() {
    if (!main || [main.x, main.y, main.wx, main.wy, main.wz].every(Number.isFinite)) {
      return;
    }
    log('warn', `Pet position was lost (${main.x}, ${main.y}), moving it home`);
    main.wx = main.wxTarget = main.wy = main.wyTarget = main.wz = main.wzTarget = 0;
    defaultMainPos();
  }

  /** Rebuilds the sprites and canvas size. Runs every 5 minutes and after any failure. */
  function heal(reason) {
    spriteCache.clear();
    resizeCanvas();
    rescuePet();
    log(
      frameErrors > 0 ? 'warn' : 'debug',
      `Self-check (${reason}): ${viewW}x${viewH}px, ${frames} frames and ${frameErrors} errors since the last check`,
    );
    frames = 0;
    frameErrors = 0;
  }

  setInterval(() => heal('every 5 minutes'), CHECK_EVERY_MS);
  canvas.addEventListener('contextlost', () => log('warn', 'Canvas context lost'));
  canvas.addEventListener('contextrestored', () => heal('canvas context restored'));

  function drawFrame() {
    const t = now();
    const dt = Math.min((t - (lastFrame || t)) / 1000, 0.1);
    lastFrame = t;
    ctx.clearRect(0, 0, viewW, viewH);
    if (!main) {
      return;
    }

    tickState(main, t);
    if (main.wantsToy && displayState(main) === 'idle') {
      playWith(main.wantsToy);
    }
    tickLife(main, t, dt);
    rescuePet();
    minis.forEach((m, id) => {
      tickState(m, t);
      tickLife(m, t, dt);
      m.x += (m.tx - m.x) * Math.min(1, dt * 5);
      m.y += (m.ty - m.y) * Math.min(1, dt * 5);
      if (m.leavingAt && t - m.leavingAt > 500) {
        minis.delete(id);
        layoutMinis();
      }
    });

    play.update(t, dt);
    scene.update(t, dt);
    panels.tick(t);
    drawDots(t);
    scene.drawBack(t);
    // Further back means drawn first, so nearer pets overlap it.
    const bottom = (p) => spriteBox(p).y + spriteBox(p).s + (p.front ? viewH : 0);
    const drawOrder = [...minis.values(), main].sort((a, b) => bottom(a) - bottom(b));
    drawOrder.forEach((p) => drawPet(p, t));
    play.draw(t);
    scene.drawFront(t);
    stepParticles(dt);
    drawParticles();
  }

  requestAnimationFrame(render);

  // -- Messages ---------------------------------------------------------------
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') {
      return;
    }
    switch (msg.command) {
      case 'init':
        saved = msg.state && typeof msg.state === 'object' ? msg.state : {};
        scene.setBag(saved.bag, saved.spent);
        applyConfig(msg.config);
        panels.refreshUnlocks();
        break;
      case 'reinit':
        applyConfig(msg.config);
        break;
      case 'peon-event': {
        const state = PEON_TO_STATE[msg.anim];
        if (main && state) {
          applyState(main, state, '');
        }
        break;
      }
      case 'session-update':
        peonSessions = msg.sessions || [];
        break;
      case 'claude-update':
        applyClaude(msg);
        break;
      case 'unlocks': {
        // Purchases made in another window.
        const mine = saved.unlocks || [];
        const fresh = (msg.unlocks || []).filter((id) => !mine.includes(id));
        if (fresh.length > 0) {
          saved.unlocks = [...mine, ...fresh];
          panels.refreshUnlocks();
        }
        break;
      }
      case 'care-update':
        care = msg.stats;
        if (main && msg.action && msg.ok === false) {
          panels.note(`${main.name} ${msg.reason}.`);
          startCareAnim('refuse');
        }
        panels.refreshCare();
        break;
    }
  });

  window.addEventListener('resize', resizeCanvas);

  // -- Tooltip ----------------------------------------------------------------
  function hit(p, x, y) {
    const b = spriteBox(p);
    return x >= b.x && x <= b.x + b.s && y >= b.y && y <= b.y + b.s;
  }

  function tooltipHtml(x, y) {
    const thing = scene.hover(x, y);
    if (thing) {
      return `<b>${escapeHtml(thing.title)}</b><br><span class="dim">${escapeHtml(thing.sub)}</span>`;
    }
    for (const m of minis.values()) {
      if (!m.leavingAt && hit(m, x, y)) {
        const def = lookOf(m, displayState(m), now());
        const what = m.otherRepo
          ? 'Claude session in another repo'
          : m.background
            ? 'another Claude session in this repo'
            : m.agentType;
        return (
          `<b>${escapeHtml(m.name)}</b> <span class="dim">(${escapeHtml(what)})</span><br>` +
          (m.background ? '' : `${escapeHtml(m.task || 'helping out')}<br>`) +
          `<span class="dim">${escapeHtml(def.label)}${m.detail ? ': ' + escapeHtml(m.detail) : ''}</span>`
        );
      }
    }
    if (main && hit(main, x, y)) {
      const def = lookOf(main, displayState(main), now());
      const helpers = [...minis.values()].filter((m) => !m.leavingAt && !m.background).length;
      const jobs = scene.machineCount();
      return (
        `<b>${escapeHtml(main.name)}</b> is ${escapeHtml(def.label)}` +
        (main.detail ? `<br>${escapeHtml(main.detail)}` : '') +
        (project ? `<br><span class="dim">in ${escapeHtml(project)}</span>` : '') +
        (care
          ? `<br>🍖 ${Math.round(care.fullness)} &nbsp;💖 ${Math.round(care.fun)} &nbsp;🫧 ${Math.round(care.clean)}`
          : '') +
        (helpers
          ? `<br><span class="dim">${helpers} helper${helpers > 1 ? 's' : ''} working</span>`
          : '') +
        (jobs ? `<br><span class="dim">${jobs} job${jobs > 1 ? 's' : ''} running</span>` : '') +
        `<br><span class="dim">🎒 ${scene.foundCount()}/${scene.toyTotal} toys in the bag</span>`
      );
    }
    const sessions = allSessions().slice(0, MAX_DOTS);
    for (let i = 0; i < sessions.length; i++) {
      const c = dotCenter(i);
      if ((x - c.x) ** 2 + (y - c.y) ** 2 < (DOT_R * 2) ** 2) {
        const s = sessions[i];
        const label = leafDirName(s.cwd) || '...' + s.id.slice(-8);
        const status = s.hot ? 'active' : s.warm ? 'idle' : 'cold';
        return `${escapeHtml(label)} &bull; ${status}`;
      }
    }
    return null;
  }

  function petAt(x, y) {
    for (const m of minis.values()) {
      if (!m.leavingAt && hit(m, x, y)) {
        return m;
      }
    }
    return main && hit(main, x, y) ? main : null;
  }

  canvas.addEventListener('mousemove', (e) => {
    mouse = { x: e.offsetX, y: e.offsetY, at: now() };
    if (dragging) {
      return;
    }
    const over = petAt(e.offsetX, e.offsetY);
    const careCursor = panels.careOn() ? play.cursor(e.offsetX, e.offsetY) : null;
    canvas.style.cursor =
      careCursor ??
      (over === main ? (panels.careOn() ? 'pointer' : 'grab') : over ? 'pointer' : '');
    const html = play.tool() ? null : tooltipHtml(e.offsetX, e.offsetY);
    if (!html) {
      tooltip.style.display = 'none';
      return;
    }
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    tooltip.style.left = Math.max(4, Math.min(e.offsetX + 10, viewW - tw - 4)) + 'px';
    tooltip.style.top = Math.max(4, Math.min(e.offsetY + 12, viewH - th - 4)) + 'px';
  });

  canvas.addEventListener('contextmenu', (e) => {
    if (scene.grab(e.offsetX, e.offsetY)) {
      tooltip.style.display = 'none';
      e.preventDefault();
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
    play.pointerLeave();
  });

  // -- Care, toys and panels ------------------------------------------------
  const play = window.PetPlay.create({
    ctx,
    main: () => main,
    busy: isBusy,
    care: () => care,
    sendCare: (action) => vscodeApi.postMessage({ command: 'care', action }),
    emit,
    note: (text, ms) => panels.note(text, ms),
    anim: startCareAnim,
    animating: () => !!main && !!main.care && now() < main.care.until,
    petPx,
    species: () => Art.SPECIES[config.species],
    view: () => ({ w: viewW, h: viewH }),
    now,
    toolChanged: () => panels.refreshCare(),
    food: () => saved.food || 'kibble',
  });

  /** Saves position, toy collection and shop purchases where VS Code keeps webview state. */
  function persist() {
    vscodeApi.setState(saved);
    vscodeApi.postMessage({ command: 'save-state', state: saved });
  }

  const scene = window.PetScene.create({
    ctx,
    main: () => main,
    petPx,
    view: () => ({ w: viewW, h: viewH }),
    now,
    emit,
    config: () => config,
    playing: () =>
      !!main &&
      displayState(main) === 'idle' &&
      !isBusy() &&
      !play.tool() &&
      !dragging &&
      !!main.fidget &&
      main.fidget.kind === 'toy',
    onBag: (bag) => {
      saved.bag = bag;
      persist();
      panels.refreshBag();
    },
    // The purchase that spent them persists both together.
    onSpent: (spent) => {
      saved.spent = spent;
    },
  });

  const panels = window.PetPanels.create({
    post: (msg) => vscodeApi.postMessage(msg),
    main: () => main,
    config: () => config,
    saved: () => saved,
    care: () => care,
    busy: isBusy,
    persist,
    play,
    scene,
    now,
    escapeHtml,
    debugSnapshot,
  });

  /** What the view is doing right now, for the debug log. No agent text or file paths. */
  function debugSnapshot() {
    const pet = main && {
      x: Math.round(main.x),
      y: Math.round(main.y),
      wx: Math.round(main.wx),
      wy: Math.round(main.wy),
      wz: main.wz,
      state: displayState(main),
      look: lookOf(main, displayState(main), now()).label,
    };
    return JSON.stringify({
      view: `${viewW}x${viewH}`,
      canvas: `${canvas.width}x${canvas.height}`,
      dpr: window.devicePixelRatio || 1,
      hidden: document.hidden,
      pet,
      minis: minis.size,
      particles: particles.length,
      sprites: spriteCache.size,
      framesSinceCheck: frames,
      errorsSinceCheck: frameErrors,
      lastFrameError: lastFrameError.split('\n')[0],
      careTool: play.tool(),
      toysFound: scene.foundCount(),
      unlocks: (saved.unlocks || []).length,
      config: config && {
        species: config.species,
        size: config.size,
        variety: config.variety,
        wander: config.wander,
        toys: config.toys,
        machines: config.machines,
        disabledActions: (config.disabledActions || []).length,
      },
    });
  }

  // -- Click and drag ---------------------------------------------------------
  // A press becomes a drag (main pet only) once the mouse moves 4px; otherwise
  // releasing it counts as a click.

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) {
      return;
    }
    const pet = petAt(e.offsetX, e.offsetY);
    if (panels.careOn() && play.pointerDown(e.offsetX, e.offsetY, pet === main)) {
      tooltip.style.display = 'none';
      e.preventDefault();
      return;
    }
    const toy = scene.poke(e.offsetX, e.offsetY);
    if (toy) {
      tooltip.style.display = 'none';
      playWith(toy);
      e.preventDefault();
      return;
    }
    if (!pet) {
      return;
    }
    press = {
      pet,
      x: e.offsetX,
      y: e.offsetY,
      offX: e.offsetX - pet.x - pet.wx,
      offY: e.offsetY - pet.y,
    };
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (panels.careOn()) {
      play.pointerMove(e.clientX, e.clientY, () => petAt(e.clientX, e.clientY) === main);
    }
    if (!press || press.pet !== main) {
      return;
    }
    if (!dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4) {
      dragging = true;
      main.wx = 0;
      main.wxTarget = 0;
      main.wy = 0;
      main.wyTarget = 0;
      main.wz = 0;
      main.wzTarget = 0;
      canvas.style.cursor = 'grabbing';
      tooltip.style.display = 'none';
    }
    if (dragging) {
      main.x = e.clientX - press.offX;
      main.y = e.clientY - press.offY;
      clampMain();
      layoutMinis();
    }
  });

  document.addEventListener('mouseup', () => {
    if (panels.careOn() && play.pointerUp()) {
      return;
    }
    if (!press) {
      return;
    }
    if (dragging && main) {
      saved.petX = Math.round(main.x);
      saved.petY = Math.round(main.y);
      persist();
    } else {
      clickPet(press.pet);
    }
    dragging = false;
    press = null;
    canvas.style.cursor = '';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && play.tool()) {
      play.setTool(null);
    }
  });

  vscodeApi.postMessage({ command: 'ready' });
})();
