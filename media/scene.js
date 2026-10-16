// @ts-check
// The world around the pet: toys and furniture that turn up with a rarity,
// a machine for every test run or background job, critters to chase, and
// the scenery some animation variants need (hamster wheel, surfboard...).
// webview.js creates one instance and hands it a small API, like play.js.
(function (root) {
  'use strict';

  const RARITY = {
    common: { weight: 62, color: '', label: 'Common' },
    uncommon: { weight: 25, color: '#5ad17a', label: 'Uncommon' },
    rare: { weight: 10, color: '#4fa3ff', label: 'Rare' },
    legendary: { weight: 3, color: '#ffc93d', label: 'Legendary' },
  };

  /** `use` decides what the pet does with it; `floats` items hover instead of resting. */
  const TOYS = [
    { id: 'yarn', emoji: '🧶', name: 'ball of yarn', rarity: 'common', use: 'play' },
    { id: 'box', emoji: '📦', name: 'cardboard box', rarity: 'common', use: 'hide' },
    { id: 'bone', emoji: '🦴', name: 'bone', rarity: 'common', use: 'chew' },
    { id: 'teddy', emoji: '🧸', name: 'teddy bear', rarity: 'common', use: 'cuddle' },
    { id: 'frisbee', emoji: '🥏', name: 'frisbee', rarity: 'common', use: 'play' },
    { id: 'plant', emoji: '🪴', name: 'potted plant', rarity: 'common', use: 'sniff' },
    { id: 'balloon', emoji: '🎈', name: 'balloon', rarity: 'common', use: 'float', floats: true },
    { id: 'chair', emoji: '🪑', name: 'chair', rarity: 'uncommon', use: 'sit' },
    { id: 'couch', emoji: '🛋️', name: 'couch', rarity: 'uncommon', use: 'sit' },
    { id: 'bed', emoji: '🛏️', name: 'comfy bed', rarity: 'uncommon', use: 'nap' },
    { id: 'guitar', emoji: '🎸', name: 'guitar', rarity: 'uncommon', use: 'music' },
    { id: 'drum', emoji: '🥁', name: 'drum', rarity: 'uncommon', use: 'music' },
    { id: 'skateboard', emoji: '🛹', name: 'skateboard', rarity: 'uncommon', use: 'ride' },
    { id: 'kite', emoji: '🪁', name: 'kite', rarity: 'uncommon', use: 'float', floats: true },
    { id: 'basketball', emoji: '🏀', name: 'basketball', rarity: 'uncommon', use: 'play' },
    { id: 'rocket', emoji: '🚀', name: 'toy rocket', rarity: 'rare', use: 'admire' },
    { id: 'arcade', emoji: '🕹️', name: 'arcade stick', rarity: 'rare', use: 'game' },
    { id: 'tent', emoji: '⛺', name: 'tent', rarity: 'rare', use: 'hide' },
    { id: 'ufo', emoji: '🛸', name: 'tiny UFO', rarity: 'rare', use: 'float', floats: true },
    { id: 'castle', emoji: '🏰', name: 'castle', rarity: 'rare', use: 'admire' },
    { id: 'crown', emoji: '👑', name: 'golden crown', rarity: 'legendary', use: 'admire' },
    { id: 'gem', emoji: '💎', name: 'giant diamond', rarity: 'legendary', use: 'admire' },
    { id: 'unicorn', emoji: '🦄', name: 'unicorn plush', rarity: 'legendary', use: 'cuddle' },
    { id: 'rainbow', emoji: '🌈', name: 'pocket rainbow', rarity: 'legendary', use: 'admire' },
  ];

  const USE_LABEL = {
    play: 'playing with the',
    hide: 'hiding in the',
    chew: 'chewing the',
    cuddle: 'cuddling the',
    sniff: 'sniffing the',
    float: 'jumping for the',
    sit: 'lounging on the',
    nap: 'napping on the',
    music: 'jamming on the',
    ride: 'riding the',
    admire: 'admiring the',
    game: 'gaming on the',
  };

  /** Uses where the pet stands on (or in) the toy rather than beside it. */
  const ON_TOP = new Set(['sit', 'nap', 'ride', 'hide']);

  const MACHINE_POOLS = {
    test: ['washer', 'oven', 'microwave', 'computer', 'engine'],
    build: ['engine', 'oven', 'computer'],
    server: ['server', 'computer'],
    job: ['computer', 'engine', 'washer', 'server', 'microwave'],
  };

  const MACHINE_NAMES = {
    washer: 'washing machine',
    oven: 'oven',
    microwave: 'microwave',
    computer: 'computer',
    engine: 'engine',
    server: 'server rack',
  };

  /** At most this many toys are out of the bag at once. */
  const MAX_OUT = 3;
  const MAX_MACHINES = 4;
  /** How long a store-into-the-bag flight takes, ms. */
  const STORE_MS = 650;

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /** Weighted rarity roll, then a toy of that rarity. */
  function rollToy(rand) {
    const tiers = Object.entries(RARITY);
    const total = tiers.reduce((n, [, r]) => n + r.weight, 0);
    let r = rand() * total;
    let tier = tiers[0][0];
    for (const [name, info] of tiers) {
      r -= info.weight;
      if (r < 0) {
        tier = name;
        break;
      }
    }
    const pool = TOYS.filter((toy) => toy.rarity === tier);
    return pool[Math.floor(rand() * pool.length)];
  }

  /**
   * @param {{
   *   ctx: CanvasRenderingContext2D,
   *   main: () => any,
   *   petPx: (p: any) => number,
   *   view: () => {w: number, h: number},
   *   now: () => number,
   *   emit: (part: object) => void,
   *   config: () => any,
   *   playing: () => boolean,
   *   onBag: (bag: Record<string, number>) => void,
   * }} api
   */
  function create(api) {
    const ctx = api.ctx;
    /** @type {any[]} */
    let toys = [];
    /** @type {any[]} */
    let machines = [];
    /** @type {any} */
    let use = null;
    /** @type {any} */
    let critter = null;
    /** @type {any} */
    let banner = null;
    /** The inventory: toy id -> how many have been found. */
    /** @type {Map<string, number>} */
    const bag = new Map();
    let nextFind = api.now() + rnd(8000, 15000);
    let toysWereOn = true;
    let pose = null;
    let target = null;
    let lift = 0;

    function geom() {
      const p = api.main();
      const size = api.petPx(p);
      return { p, size, s: p.scale, cx: p.x + p.wx + size / 2, floor: p.y + size - p.scale };
    }

    function toySize(g) {
      return g.size * 0.3;
    }

    function toyY(toy, g) {
      const base = toy.def.floats ? g.size * 0.55 + Math.sin(api.now() / 600 + toy.seed) * 4 : 0;
      return g.floor - toySize(g) * 0.5 - base - toy.h;
    }

    function say(text, color, ms) {
      banner = { text, color, until: api.now() + ms, start: api.now() };
    }

    // -- Toys and the bag -------------------------------------------------------
    // Every find goes straight into the bag. Toys only spend a while on the
    // floor (a fresh find, one the pet pulls out to play with, or one you take
    // out) and then fly back into the bag.

    /** Where the bag button sits, in canvas coordinates. */
    function bagSpot() {
      return { x: api.view().w - 51, y: 19 };
    }

    function saveBag() {
      api.onBag(Object.fromEntries(bag));
    }

    function freeX(g) {
      const ts = toySize(g);
      const w = api.view().w;
      let x = rnd(ts, w - ts);
      for (let i = 0; i < 6 && toys.some((o) => Math.abs(o.x - x) < ts * 1.2); i++) {
        x = rnd(ts, w - ts);
      }
      return x;
    }

    function sparkle(x, y, g, n) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        api.emit({
          x,
          y,
          vx: Math.cos(a) * g.size * 0.6,
          vy: Math.sin(a) * g.size * 0.6,
          text: '✨',
          size: g.size * 0.07,
          life: 0.9,
        });
      }
    }

    /** Puts a toy on the floor. A fresh find drops from the sky; a toy from the bag just appears. */
    function placeToy(def, x, t, stay, fresh) {
      const g = geom();
      const toy = {
        def,
        x,
        h: fresh ? g.size * 1.2 : 0,
        vx: 0,
        vh: 0,
        seed: Math.random() * 10,
        bornAt: t,
        until: t + stay,
        storing: 0,
      };
      toys.push(toy);
      if (fresh ? RARITY[def.rarity].color : true) {
        sparkle(x, g.floor - toySize(g), g, fresh ? 12 : 8);
      }
      return toy;
    }

    /** A brand-new find: rolls a rarity, adds it to the bag and shows it off. */
    function find(t) {
      const g = geom();
      const def = rollToy(Math.random);
      const count = (bag.get(def.id) || 0) + 1;
      bag.set(def.id, count);
      saveBag();
      if (toys.filter((o) => !o.storing).length < MAX_OUT) {
        placeToy(def, freeX(g), t, rnd(40000, 80000), true);
      }
      const rarity = RARITY[def.rarity];
      if (count === 1) {
        say(
          `New find! ${def.emoji} ${def.name} (${rarity.label}) - ${bag.size}/${TOYS.length} in the bag`,
          rarity.color || '#ffffff',
          5000,
        );
      } else {
        say(`Found another ${def.emoji} ${def.name} (x${count})`, rarity.color || '#ffffff', 3500);
      }
    }

    function isOut(id) {
      return toys.some((o) => o.def.id === id && !o.storing);
    }

    /** Sends a toy flying back into the bag. */
    function store(toy, t) {
      if (!toy.storing) {
        toy.storing = t;
        if (use && use.toy === toy) {
          use = null;
        }
      }
    }

    function takeOut(id) {
      const def = TOYS.find((d) => d.id === id);
      if (!def || !bag.has(id) || isOut(id) || !api.main()) {
        return false;
      }
      const g = geom();
      const out = toys.filter((o) => !o.storing);
      if (out.length >= MAX_OUT) {
        store(out[0], api.now());
      }
      const x = clamp(
        g.cx + (Math.random() < 0.5 ? -1 : 1) * g.size * 0.7,
        g.size * 0.2,
        api.view().w - g.size * 0.2,
      );
      placeToy(def, x, api.now(), 5 * 60000, false);
      return true;
    }

    function putAway(id) {
      toys.filter((o) => o.def.id === id).forEach((o) => store(o, api.now()));
    }

    function putAllAway() {
      toys.forEach((o) => store(o, api.now()));
    }

    function toyPos(toy, g, t) {
      const y = toyY(toy, g);
      if (!toy.storing) {
        return { x: toy.x, y, k: Math.min(1, (t - toy.bornAt) / 300) };
      }
      const u = Math.min(1, (t - toy.storing) / STORE_MS);
      const to = bagSpot();
      const e = u * u;
      return {
        x: toy.x + (to.x - toy.x) * e,
        y: y + (to.y - y) * e - Math.sin(u * Math.PI) * g.size * 0.4,
        k: 1 - u * 0.85,
      };
    }

    function stepToys(g, t, dt) {
      const w = api.view().w;
      const ts = toySize(g);
      toys = toys.filter((toy) => !toy.storing || t - toy.storing < STORE_MS);
      for (const toy of toys) {
        if (toy.storing) {
          continue;
        }
        if (toy.h > 0 || toy.vh !== 0) {
          toy.vh -= g.size * 6 * dt;
          toy.h += toy.vh * dt;
          if (toy.h <= 0) {
            toy.h = 0;
            toy.vh = Math.abs(toy.vh) > g.size * 0.5 ? -toy.vh * 0.4 : 0;
          }
        }
        toy.x += toy.vx * dt;
        if (toy.h === 0) {
          toy.vx *= Math.pow(0.15, dt);
        }
        if (toy.x < ts / 2 || toy.x > w - ts / 2) {
          toy.x = clamp(toy.x, ts / 2, w - ts / 2);
          toy.vx = -toy.vx * 0.6;
        }
        if (toy.def.rarity === 'legendary' && Math.random() < dt * 1.5) {
          api.emit({
            x: toy.x + rnd(-ts / 2, ts / 2),
            y: toyY(toy, g) + rnd(-ts / 2, ts / 2),
            vy: -12,
            text: '✨',
            size: ts * 0.25,
            life: 1,
          });
        }
      }
      const done = toys.find((toy) => !toy.storing && t > toy.until && (!use || use.toy !== toy));
      if (done) {
        store(done, t);
      }
    }

    function kick(toy, dir, g) {
      toy.vx = dir * g.size * rnd(1.4, 2.4);
      toy.vh = g.size * rnd(0.8, 1.4);
      toy.h = Math.max(toy.h, 0.01);
    }

    // -- Toy use (an idle hobby) ------------------------------------------------

    /** Something to play with: a toy on the floor, or (with toys on) one in the bag. */
    function canPlay() {
      return toys.some((o) => !o.storing) || (api.config().toys && bag.size > 0);
    }

    /**
     * Starts the toy hobby with the nearest toy on the floor. If the floor is
     * empty the pet pulls a random toy out of the bag, out of nowhere, and it
     * goes back in a few seconds after playtime.
     */
    function startToy(until) {
      if (!canPlay()) {
        return false;
      }
      const g = geom();
      let floor = toys.filter((o) => !o.storing);
      if (floor.length === 0) {
        const ids = [...bag.keys()];
        const def = TOYS.find((d) => d.id === ids[Math.floor(Math.random() * ids.length)]);
        const x = clamp(
          g.cx + (Math.random() < 0.5 ? -1 : 1) * g.size * 0.8,
          g.size * 0.2,
          api.view().w - g.size * 0.2,
        );
        floor = [placeToy(def, x, api.now(), until - api.now() + 3000, false)];
      }
      const toy = floor.reduce((a, b) => (Math.abs(b.x - g.cx) < Math.abs(a.x - g.cx) ? b : a));
      use = { toy, until, since: 0, lastKick: 0, fxAt: 0, rideTo: toy.x };
      return true;
    }

    function stopToy() {
      use = null;
    }

    function updateUse(g, t) {
      const toy = use.toy;
      const kind = toy.def.use;
      const side = Math.sign(toy.x - g.cx) || 1;
      const onTop = ON_TOP.has(kind);
      const standX = onTop ? toy.x : toy.x - side * g.size * 0.36;
      const arrived = Math.abs(g.cx - standX) < g.size * 0.08;
      if (!arrived && !(kind === 'ride' && use.since)) {
        target = standX;
        pose = { eyes: 'open', mouth: 'tongue', look: side, wag: 6 };
        return;
      }
      if (!use.since) {
        use.since = t;
      }
      const ut = (t - use.since) / 1000;
      const ts = toySize(g);
      const every = (ms) => {
        if (t - use.fxAt > ms) {
          use.fxAt = t;
          return true;
        }
        return false;
      };
      switch (kind) {
        case 'play':
          pose = { eyes: 'wide', mouth: 'open', look: side, wag: 10, motion: 'hop' };
          if (toy.h === 0 && t - use.lastKick > 900) {
            use.lastKick = t;
            kick(toy, side, g);
          }
          target = standX;
          break;
        case 'float':
          pose = { eyes: 'wide', mouth: 'open', look: 0, wag: 8, motion: 'hop' };
          break;
        case 'sit':
          pose = { eyes: 'happy', mouth: 'smile', look: 0, wag: 3 };
          lift = ts * 0.55;
          break;
        case 'nap':
          pose = { eyes: 'closed', mouth: 'flat', look: 0, wag: 0, motion: 'sideSleep' };
          lift = ts * 0.45;
          if (every(1300)) {
            api.emit({
              x: g.cx + g.size * 0.25,
              y: g.floor - g.size * 0.6,
              vx: g.size * 0.12,
              vy: -g.size * 0.22,
              text: 'z',
              font: true,
              size: g.size * 0.1,
              grow: 1.2,
              life: 2.2,
            });
          }
          break;
        case 'hide': {
          const peek = ut % 3 > 2.1;
          pose = { eyes: peek ? 'open' : 'closed', look: peek ? (ut % 6 > 3 ? -1 : 1) : 0 };
          lift = peek ? g.size * 0.12 : 0;
          break;
        }
        case 'ride':
          pose = {
            eyes: 'happy',
            mouth: 'open',
            look: Math.sign(use.rideTo - g.cx),
            motion: 'surf',
          };
          lift = ts * 0.3;
          toy.x = g.cx;
          if (Math.abs(use.rideTo - g.cx) < g.size * 0.1) {
            use.rideTo = rnd(g.size * 0.5, api.view().w - g.size * 0.5);
          }
          target = use.rideTo;
          break;
        case 'chew':
          pose = {
            eyes: 'happy',
            mouth: Math.floor(ut * 6) % 2 ? 'open' : 'neutral',
            look: side,
            motion: 'eat',
            wag: 6,
          };
          break;
        case 'cuddle':
          pose = { eyes: 'happy', mouth: 'smile', look: side, motion: 'groom', wag: 8 };
          if (every(900)) {
            api.emit({
              x: toy.x,
              y: toyY(toy, g) - ts * 0.4,
              vy: -30,
              text: '💕',
              size: ts * 0.3,
              life: 1.2,
            });
          }
          break;
        case 'sniff':
          pose = { eyes: 'lookDown', mouth: 'neutral', look: side, motion: 'sniff', wag: 4 };
          break;
        case 'music':
          pose = { eyes: 'happy', mouth: 'open', look: side, motion: 'conduct', wag: 8 };
          if (every(500)) {
            api.emit({
              x: toy.x + rnd(-ts / 2, ts / 2),
              y: toyY(toy, g) - ts * 0.4,
              vx: rnd(-20, 20),
              vy: -40,
              text: Math.random() < 0.5 ? '🎵' : '🎶',
              size: ts * 0.3,
              life: 1.4,
            });
          }
          break;
        case 'admire':
          pose = { eyes: 'happy', mouth: 'open', look: side, motion: 'tilt', wag: 9 };
          if (every(400)) {
            api.emit({
              x: toy.x + rnd(-ts / 2, ts / 2),
              y: toyY(toy, g) + rnd(-ts / 2, ts / 4),
              vy: -15,
              text: '✨',
              size: ts * 0.25,
              life: 0.9,
            });
          }
          break;
        case 'game':
          pose = { eyes: 'focus', mouth: 'tongue', look: side, motion: 'type', wag: 5 };
          if (every(800)) {
            api.emit({
              x: toy.x,
              y: toyY(toy, g) - ts * 0.5,
              vy: -30,
              text: '⭐',
              size: ts * 0.25,
              life: 1,
            });
          }
          break;
      }
    }

    // -- Critters -------------------------------------------------------------

    function startCritter(kind, until) {
      const g = geom();
      const w = api.view().w;
      const fromLeft = Math.random() < 0.5;
      critter = {
        kind,
        until,
        x: fromLeft ? -20 : w + 20,
        y: kind === 'bird' ? rnd(20, Math.max(30, g.p.y)) : g.floor - g.size * 0.8,
        tx: g.cx,
        ty: g.floor - g.size * rnd(0.5, 1),
        dir: fromLeft ? 1 : -1,
        retarget: 0,
      };
    }

    function stepCritter(g, t, dt) {
      const c = critter;
      const w = api.view().w;
      if (c.kind === 'bird') {
        c.x += c.dir * w * 0.12 * dt;
        c.y += Math.sin(t / 300) * 0.6;
        if (c.x < -40 || c.x > w + 40) {
          critter = null;
        }
        return;
      }
      if (t > c.until) {
        c.tx = c.x + c.dir * 200;
        c.ty = -60;
      } else if (t > c.retarget) {
        c.retarget = t + rnd(900, 1800);
        c.tx = clamp(g.cx + rnd(-g.size, g.size), 20, w - 20);
        c.ty = g.floor - g.size * rnd(0.35, 1.1);
      }
      c.x += (c.tx - c.x) * Math.min(1, dt * 1.6);
      c.y += (c.ty - c.y) * Math.min(1, dt * 1.6) + Math.sin(t / 120) * 0.8;
      c.dir = c.tx >= c.x ? 1 : -1;
      if (c.y < -40) {
        critter = null;
      }
    }

    function drawCritter(g, t) {
      const c = critter;
      ctx.save();
      ctx.translate(c.x, c.y);
      // Emoji face left; mirror them when heading right.
      const flap = c.kind === 'butterfly' ? 0.4 + 0.6 * Math.abs(Math.sin(t / 70)) : 1;
      ctx.scale(-c.dir * flap, 1);
      ctx.font = `${Math.round(g.size * (c.kind === 'bird' ? 0.13 : 0.11))}px sans-serif`;
      ctx.fillText(c.kind === 'bird' ? '🐦' : '🦋', 0, 0);
      ctx.restore();
    }

    // -- Machines -------------------------------------------------------------

    function setJobs(jobs) {
      const t = api.now();
      const classic = api.config().variety === 'classic';
      const ids = new Set(jobs.map((j) => j.id));
      for (const j of jobs) {
        const m = machines.find((x) => x.id === j.id);
        if (m) {
          m.label = j.label;
          m.leavingAt = 0;
          continue;
        }
        const pool = MACHINE_POOLS[j.kind] || MACHINE_POOLS.job;
        machines.push({
          id: j.id,
          kind: j.kind,
          label: j.label,
          type: classic ? pool[0] : pool[Math.floor(Math.random() * pool.length)],
          bornAt: t,
          leavingAt: 0,
          x: 0,
          w: 0,
        });
      }
      for (const m of machines) {
        if (!ids.has(m.id) && !m.leavingAt) {
          m.leavingAt = t;
          if (api.main()) {
            const g = geom();
            api.emit({
              x: m.x + m.w / 2,
              y: g.floor - m.w * 1.1,
              vy: -30,
              text: '🔔',
              size: m.w * 0.3,
              life: 1.2,
            });
          }
        }
      }
    }

    /**
     * Machines stand beside the pet's home spot: on the right if a full-size
     * one fits, else on the roomier side. They shrink to fit, and whatever
     * still does not fit is counted in the "+N" label.
     */
    function layoutMachines(g) {
      const live = machines.filter((m) => !m.leavingAt);
      if (live.length === 0) {
        return { side: 1, extra: 0, x0: 0, row: 0 };
      }
      const p = g.p;
      const full = g.size * 0.42;
      const right = api.view().w - 4 - (p.x + g.size * 0.9);
      const left = p.x + g.size * 0.1 - 4;
      const side = right >= full || right >= left ? 1 : -1;
      const space = Math.max(0, side > 0 ? right : left);
      let n = Math.min(MAX_MACHINES, live.length);
      let w = Math.min(full, space / (n + (n - 1) * 0.15));
      if (w < g.size * 0.22) {
        w = g.size * 0.22;
        n = Math.max(1, Math.min(n, Math.floor((space + w * 0.15) / (w * 1.15))));
      }
      const gap = w * 0.15;
      const row = n * w + (n - 1) * gap;
      const x0 = side > 0 ? p.x + g.size * 0.9 : p.x + g.size * 0.1 - row;
      live.forEach((m, i) => {
        m.w = w;
        m.x = i < n ? x0 + i * (w + gap) : -9999;
      });
      return { side, extra: live.length - n, x0, row };
    }

    let machineLayout = { side: 1, extra: 0, x0: 0, row: 0 };

    function rrect(x, y, w, h, r) {
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
      } else {
        ctx.rect(x, y, w, h);
      }
    }

    function box(x, y, w, h, r, fill, stroke, lw) {
      rrect(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }

    function timer(m, t) {
      const secs = Math.floor((t - m.bornAt) / 1000);
      return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }

    function drawMachine(m, g, t) {
      const w = m.w;
      const lw = Math.max(1.5, g.s * 0.5);
      const pop = Math.min(1, (t - m.bornAt) / 400);
      const out = m.leavingAt ? Math.max(0, 1 - (t - m.leavingAt) / 500) : 1;
      const k = pop * out;
      if (k <= 0.01) {
        return;
      }
      const shake = m.type === 'washer' ? Math.sin(t / 25) * w * 0.012 : 0;
      ctx.save();
      ctx.translate(m.x + w / 2 + shake, g.floor + g.s);
      ctx.scale(k, k);
      ctx.translate(-w / 2, 0);
      const ink = '#22252e';
      switch (m.type) {
        case 'washer': {
          box(0, -w * 1.05, w, w * 1.05, w * 0.08, '#e9edf2', ink, lw);
          ctx.fillStyle = '#c9d0db';
          ctx.fillRect(lw, -w * 1.05 + lw, w - lw * 2, w * 0.18);
          ctx.fillStyle = Math.floor(t / 400) % 2 ? '#5ad17a' : '#2f6b3f';
          ctx.fillRect(w * 0.12, -w * 0.97, w * 0.08, w * 0.05);
          ctx.fillStyle = '#7a8291';
          for (const kx of [0.62, 0.8]) {
            ctx.beginPath();
            ctx.arc(w * kx, -w * 0.95, w * 0.05, 0, Math.PI * 2);
            ctx.fill();
          }
          const cy = -w * 0.45;
          const r = w * 0.3;
          ctx.fillStyle = '#9aa3b2';
          ctx.beginPath();
          ctx.arc(w / 2, cy, r + lw * 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#bfe2ff';
          ctx.beginPath();
          ctx.arc(w / 2, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.beginPath();
          ctx.arc(w / 2, cy, r, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = '#4f9dff';
          ctx.fillRect(0, cy - r * 0.1 + Math.sin(t / 180) * r * 0.15, w, r * 2);
          const socks = ['#ff4f7b', '#ffd23f', '#6be675'];
          socks.forEach((c, i) => {
            const a = t / 160 + (i * Math.PI * 2) / socks.length;
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(
              w / 2 + Math.cos(a) * r * 0.5,
              cy + Math.sin(a) * r * 0.5,
              r * 0.22,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          });
          ctx.restore();
          break;
        }
        case 'oven': {
          box(0, -w * 1.0, w, w * 1.0, w * 0.06, '#3a3f4b', ink, lw);
          ctx.fillStyle = '#2a2e38';
          ctx.fillRect(lw, -w + lw, w - lw * 2, w * 0.2);
          ctx.fillStyle = '#ff9f43';
          ctx.font = `bold ${Math.round(w * 0.12)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(timer(m, t), w / 2, -w * 0.9);
          const glow = 0.55 + 0.25 * Math.sin(t / 300);
          box(
            w * 0.12,
            -w * 0.68,
            w * 0.76,
            w * 0.5,
            w * 0.05,
            `rgba(255,140,40,${glow})`,
            ink,
            lw,
          );
          ctx.fillStyle = '#8b5a2b';
          const rise = Math.min(1, (t - m.bornAt) / 20000);
          for (const cx of [0.32, 0.5, 0.68]) {
            ctx.beginPath();
            ctx.ellipse(w * cx, -w * 0.26, w * 0.07, w * (0.03 + 0.03 * rise), 0, Math.PI, 0);
            ctx.fill();
          }
          ctx.fillStyle = '#9aa3b2';
          ctx.fillRect(w * 0.12, -w * 0.12, w * 0.76, w * 0.04);
          if (Math.random() < 0.04) {
            api.emit({
              x: m.x + w / 2,
              y: g.floor - w * 1.1,
              vy: -25,
              text: '〰️',
              size: w * 0.18,
              life: 1.2,
            });
          }
          break;
        }
        case 'microwave': {
          box(0, -w * 0.62, w, w * 0.62, w * 0.05, '#cfd5e0', ink, lw);
          box(w * 0.07, -w * 0.54, w * 0.6, w * 0.46, w * 0.03, '#2a2e38', ink, lw * 0.6);
          ctx.fillStyle = `rgba(255,214,80,${0.35 + 0.15 * Math.sin(t / 200)})`;
          ctx.fillRect(w * 0.07, -w * 0.54, w * 0.6, w * 0.46);
          const a = t / 500;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(w * 0.37, -w * 0.16, w * 0.2, w * 0.05, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#e85d5d';
          ctx.beginPath();
          ctx.arc(
            w * 0.37 + Math.cos(a) * w * 0.12,
            -w * 0.19 + Math.sin(a) * w * 0.02,
            w * 0.06,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.fillStyle = '#1c1f26';
          ctx.fillRect(w * 0.72, -w * 0.54, w * 0.22, w * 0.1);
          ctx.fillStyle = '#6be675';
          ctx.font = `bold ${Math.round(w * 0.07)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(timer(m, t), w * 0.83, -w * 0.49);
          ctx.fillStyle = '#7a8291';
          for (let i = 0; i < 6; i++) {
            ctx.fillRect(
              w * (0.74 + (i % 2) * 0.1),
              -w * (0.38 - Math.floor(i / 2) * 0.09),
              w * 0.06,
              w * 0.05,
            );
          }
          break;
        }
        case 'computer': {
          box(0, -w * 0.95, w, w * 0.68, w * 0.05, '#2a2e38', ink, lw);
          ctx.fillStyle = '#0b1d12';
          ctx.fillRect(w * 0.07, -w * 0.88, w * 0.86, w * 0.54);
          ctx.save();
          ctx.beginPath();
          ctx.rect(w * 0.07, -w * 0.88, w * 0.86, w * 0.46);
          ctx.clip();
          const scroll = (t / 90) % 6;
          for (let i = 0; i < 9; i++) {
            const n = Math.floor(t / 540) + i;
            ctx.fillStyle = (n * 7) % 11 === 0 ? '#ff6b6b' : '#5ae38a';
            const len = 0.25 + ((n * 37) % 50) / 100;
            ctx.fillRect(
              w * 0.1,
              -w * 0.86 + (i * 6 - scroll) * w * 0.012,
              w * 0.8 * len,
              w * 0.035,
            );
          }
          ctx.restore();
          const prog = ((t - m.bornAt) / 8000) % 1;
          ctx.fillStyle = '#1f3a28';
          ctx.fillRect(w * 0.1, -w * 0.4, w * 0.8, w * 0.04);
          ctx.fillStyle = '#5ae38a';
          ctx.fillRect(w * 0.1, -w * 0.4, w * 0.8 * prog, w * 0.04);
          ctx.fillStyle = '#4a4f5c';
          ctx.fillRect(w * 0.44, -w * 0.27, w * 0.12, w * 0.17);
          box(w * 0.22, -w * 0.1, w * 0.56, w * 0.1, w * 0.03, '#4a4f5c', ink, lw * 0.6);
          break;
        }
        case 'engine': {
          box(0, -w * 0.7, w * 0.78, w * 0.7, w * 0.04, '#7a828f', ink, lw);
          ctx.fillStyle = '#5d6472';
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(w * 0.08, -w * (0.6 - i * 0.13), w * 0.62, w * 0.05);
          }
          const pist = Math.abs(Math.sin(t / 120)) * w * 0.12;
          box(w * 0.18, -w * 0.82 - pist, w * 0.14, w * 0.14 + pist, 2, '#b0b7c3', ink, lw * 0.6);
          box(
            w * 0.46,
            -w * 0.82 - (w * 0.12 - pist),
            w * 0.14,
            w * 0.26 - pist,
            2,
            '#b0b7c3',
            ink,
            lw * 0.6,
          );
          const gx = w * 0.8;
          const gy = -w * 0.35;
          const gr = w * 0.2;
          ctx.save();
          ctx.translate(gx, gy);
          ctx.rotate(t / 300);
          ctx.fillStyle = '#ffb347';
          ctx.strokeStyle = ink;
          ctx.lineWidth = lw * 0.6;
          ctx.beginPath();
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const rr = i % 2 ? gr * 0.78 : gr;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.arc(0, 0, gr * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          if (Math.random() < 0.05) {
            api.emit({
              x: m.x + w * 0.3,
              y: g.floor - w * 0.95,
              vx: 8,
              vy: -30,
              text: '💨',
              size: w * 0.18,
              life: 1.1,
            });
          }
          break;
        }
        case 'server': {
          const h = w * 1.15;
          box(w * 0.18, -h, w * 0.64, h, w * 0.04, '#2a2e38', ink, lw);
          for (let i = 0; i < 6; i++) {
            const y = -h + w * 0.06 + (i * (h - w * 0.1)) / 6;
            ctx.fillStyle = '#3a3f4b';
            ctx.fillRect(w * 0.23, y, w * 0.54, (h - w * 0.2) / 6);
            for (let j = 0; j < 3; j++) {
              const on = (Math.floor(t / 150) * (i + 3) * (j + 7)) % 5 < 2;
              ctx.fillStyle = on ? (j === 2 ? '#ffb347' : '#5ae38a') : '#1f2229';
              ctx.fillRect(w * (0.28 + j * 0.08), y + w * 0.04, w * 0.05, w * 0.05);
            }
          }
          break;
        }
      }
      ctx.restore();
    }

    // -- Variant scenery --------------------------------------------------------

    /**
     * Scenery for animation variants, drawn behind (`back`) or in front of
     * (`front`) the pet. x is the pet's centre, y the floor under it.
     */
    function scenery(name, layer, x, y, size, s, t) {
      const lw = Math.max(1.5, s * 0.5);
      const ink = '#22252e';
      ctx.save();
      if (name === 'box' && layer === 'front') {
        const w = size * 0.78;
        const h = size * 0.36;
        box(x - w / 2, y - h, w, h, 2, '#c8955a', '#6b4a26', lw);
        ctx.fillStyle = '#b07d45';
        for (const dir of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x + (dir * w) / 2, y - h);
          ctx.lineTo(x + dir * (w / 2 + size * 0.1), y - h - size * 0.12);
          ctx.lineTo(x + dir * (w / 2 - size * 0.12), y - h - size * 0.1);
          ctx.lineTo(x + dir * (w / 2 - size * 0.18), y - h);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#6b4a26';
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x - size * 0.06, y - h, size * 0.12, h);
      } else if (name === 'bed' && layer === 'back') {
        ctx.fillStyle = '#5b4bb5';
        ctx.beginPath();
        ctx.ellipse(x, y - size * 0.06, size * 0.52, size * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8b7cf0';
        ctx.beginPath();
        ctx.ellipse(x, y - size * 0.09, size * 0.44, size * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(
          x - size * 0.34,
          y - size * 0.15,
          size * 0.12,
          size * 0.06,
          -0.2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else if (name === 'perch' && layer === 'back') {
        ctx.strokeStyle = '#6b4a26';
        ctx.lineCap = 'round';
        ctx.lineWidth = s * 2;
        ctx.beginPath();
        ctx.moveTo(x - size * 0.55, y - s * 2);
        ctx.lineTo(x + size * 0.55, y - s * 3);
        ctx.stroke();
        ctx.lineWidth = s;
        ctx.beginPath();
        ctx.moveTo(x - size * 0.2, y - s * 2.3);
        ctx.lineTo(x - size * 0.3, y + s * 2);
        ctx.stroke();
        ctx.font = `${Math.round(size * 0.14)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🍃', x + size * 0.55, y - s * 5);
        ctx.fillText('🍃', x - size * 0.55, y - s * 4);
      } else if (name === 'wheel' && layer === 'back') {
        const r = size * 0.52;
        const cy = y - r;
        ctx.strokeStyle = '#7a8291';
        ctx.lineWidth = lw * 1.5;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.4, y + s);
        ctx.lineTo(x, cy);
        ctx.lineTo(x + r * 0.4, y + s);
        ctx.stroke();
        ctx.strokeStyle = '#c9d0db';
        ctx.lineWidth = lw * 2;
        ctx.beginPath();
        ctx.arc(x, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(201,208,219,0.6)';
        ctx.lineWidth = lw * 0.8;
        for (let i = 0; i < 10; i++) {
          const a = t / 140 + (i / 10) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(x, cy);
          ctx.lineTo(x + Math.cos(a) * r, cy + Math.sin(a) * r);
          ctx.stroke();
        }
      } else if (name === 'surfboard') {
        if (layer === 'back') {
          ctx.fillStyle = '#ff9f43';
          ctx.strokeStyle = '#7a3f10';
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.ellipse(
            x,
            y - s * 3,
            size * 0.46,
            size * 0.055,
            Math.sin(t / 450) * 0.1,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(79,157,255,0.75)';
          ctx.beginPath();
          ctx.moveTo(x - size * 0.7, y + s);
          for (let i = 0; i <= 20; i++) {
            const wx = x - size * 0.7 + (i / 20) * size * 1.4;
            ctx.lineTo(wx, y - s * 1.5 + Math.sin(i * 0.9 + t / 160) * s * 1.6);
          }
          ctx.lineTo(x + size * 0.7, y + s);
          ctx.closePath();
          ctx.fill();
        }
      } else if (name === 'dish' && layer === 'back') {
        const dx = x + size * 0.58;
        ctx.strokeStyle = '#7a8291';
        ctx.lineWidth = lw * 1.4;
        ctx.beginPath();
        ctx.moveTo(dx, y + s);
        ctx.lineTo(dx, y - size * 0.35);
        ctx.stroke();
        ctx.fillStyle = '#e9edf2';
        ctx.strokeStyle = ink;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.ellipse(dx, y - size * 0.42, size * 0.16, size * 0.07, -0.6, 0, Math.PI);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#4fd1c5';
        for (let i = 0; i < 3; i++) {
          const ph = ((t / 900 + i / 3) % 1) * size * 0.3;
          ctx.globalAlpha = 1 - ph / (size * 0.3);
          ctx.beginPath();
          ctx.arc(dx + size * 0.05, y - size * 0.5, size * 0.06 + ph, -1.9, -0.5);
          ctx.stroke();
        }
      } else if (name === 'chalkboard' && layer === 'back') {
        const w = size * 0.55;
        const h = size * 0.42;
        const bx = x - size * 0.42 - w;
        const by = y - size * 0.82;
        box(bx, by, w, h, 2, '#2f4f3a', '#8b5a2b', lw * 1.6);
        ctx.strokeStyle = '#8b5a2b';
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(bx + w * 0.2, by + h);
        ctx.lineTo(bx + w * 0.1, y + s);
        ctx.moveTo(bx + w * 0.8, by + h);
        ctx.lineTo(bx + w * 0.9, y + s);
        ctx.stroke();
        const lines = ['f(x) = ?', 'Σ x² + 1', '2 + 2 = 4', '∴ it works'];
        const shown = Math.floor(t / 120);
        ctx.fillStyle = '#f2f2e8';
        ctx.font = `${Math.max(7, Math.round(h * 0.17))}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let budget = shown % 60;
        lines.forEach((text, i) => {
          const part = text.slice(0, Math.max(0, budget));
          budget -= text.length;
          ctx.fillText(part, bx + w * 0.08, by + h * (0.08 + i * 0.22));
        });
      } else if (name === 'books' && layer === 'back') {
        ctx.font = `${Math.round(size * 0.22)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('📚', x + size * 0.5, y + s);
        ctx.fillText('📚', x + size * 0.5, y - size * 0.16);
        ctx.fillText('📚', x - size * 0.52, y + s);
      }
      ctx.restore();
    }

    // -- Per-frame ------------------------------------------------------------

    function update(t, dt) {
      target = null;
      pose = null;
      lift = 0;
      const p = api.main();
      if (!p) {
        return;
      }
      const g = geom();
      const cfg = api.config();
      if (cfg.toys && t > nextFind) {
        nextFind = t + rnd(120000, 240000);
        find(t);
      }
      // Turning toys off tidies everything away; the bag keeps them.
      if (toysWereOn && !cfg.toys) {
        putAllAway();
      }
      toysWereOn = cfg.toys;
      stepToys(g, t, dt);
      if (use) {
        if (!toys.includes(use.toy) || use.toy.storing || t > use.until || !api.playing()) {
          use = null;
        } else {
          updateUse(g, t);
        }
      }
      if (critter) {
        stepCritter(g, t, dt);
      }
      machines = machines.filter((m) => !m.leavingAt || t - m.leavingAt < 600);
      machineLayout = layoutMachines(g);
    }

    /** A toy the pet is sitting, napping or riding on is drawn under it; the rest in front. */
    function under(toy) {
      return !!use && !!use.since && use.toy === toy && ON_TOP.has(toy.def.use);
    }

    function drawToy(toy, g, t) {
      const ts = toySize(g);
      const at = toyPos(toy, g, t);
      const glow = RARITY[toy.def.rarity].color;
      if (glow && !toy.storing) {
        const pulse = 0.25 + 0.15 * Math.sin(t / 300 + toy.seed);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(toy.x, g.floor + g.s, ts * 0.55, ts * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.scale(at.k, at.k);
      if (toy.def.use === 'play' && toy.h > 0 && !toy.storing) {
        ctx.rotate(toy.x / (ts * 0.4));
      }
      ctx.font = `${Math.round(ts)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(toy.def.emoji, 0, 0);
      ctx.restore();
    }

    function drawBack(t) {
      const p = api.main();
      if (!p) {
        return;
      }
      const g = geom();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (api.config().machines) {
        for (const m of machines) {
          drawMachine(m, g, t);
        }
        if (machineLayout.extra > 0) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.round(g.size * 0.08)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(
            `+${machineLayout.extra}`,
            machineLayout.x0 + machineLayout.row / 2,
            g.floor - g.size * 0.55,
          );
        }
      }
      for (const toy of toys) {
        if (under(toy)) {
          drawToy(toy, g, t);
        }
      }
    }

    function drawFront(t) {
      const p = api.main();
      if (!p) {
        return;
      }
      const g = geom();
      for (const toy of toys) {
        if (!under(toy)) {
          drawToy(toy, g, t);
        }
      }
      if (critter) {
        drawCritter(g, t);
      }
      if (use && use.since && use.toy.def.use === 'hide') {
        // A big copy in front of the pet so only its head pokes out.
        const big = g.size * 0.62;
        ctx.font = `${Math.round(big)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(use.toy.def.emoji, use.toy.x, g.floor + g.s - big * 0.5);
      }
      if (banner && t < banner.until) {
        const fade = Math.min(1, (banner.until - t) / 600, (t - banner.start) / 200);
        ctx.globalAlpha = Math.max(0, fade);
        ctx.font = 'bold 11px sans-serif';
        const w = Math.min(api.view().w - 16, ctx.measureText(banner.text).width + 18);
        const x = api.view().w / 2;
        const y = 30;
        box(x - w / 2, y - 10, w, 20, 10, 'rgba(8,8,16,0.85)', banner.color, 1.5);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(banner.text, x, y + 1, w - 12);
        ctx.globalAlpha = 1;
      }
    }

    /** What's under the mouse, for the tooltip. */
    function hover(x, y) {
      if (!api.main()) {
        return null;
      }
      const g = geom();
      const ts = toySize(g);
      for (const toy of toys) {
        if (!toy.storing && Math.abs(x - toy.x) < ts / 2 && Math.abs(y - toyY(toy, g)) < ts / 2) {
          const r = RARITY[toy.def.rarity];
          const n = bag.get(toy.def.id) || 0;
          return {
            title: `${toy.def.emoji} ${toy.def.name}`,
            sub: `${r.label}${n > 1 ? ` - x${n} in the bag` : ''} - click to put it in the bag`,
          };
        }
      }
      if (api.config().machines) {
        for (const m of machines) {
          if (
            !m.leavingAt &&
            x >= m.x &&
            x <= m.x + m.w &&
            y <= g.floor &&
            y >= g.floor - m.w * 1.15
          ) {
            return {
              title: `${MACHINE_NAMES[m.type]} (${m.kind === 'job' ? 'background job' : m.kind})`,
              sub: `${m.label} - ${timer(m, api.now())}`,
            };
          }
        }
      }
      return null;
    }

    /** Clicking a toy on the floor puts it in the bag. Returns true when a toy was hit. */
    function grab(x, y) {
      if (!api.main()) {
        return false;
      }
      const g = geom();
      const ts = toySize(g);
      const toy = toys.find(
        (o) => !o.storing && Math.abs(x - o.x) < ts / 2 && Math.abs(y - toyY(o, g)) < ts / 2,
      );
      if (!toy) {
        return false;
      }
      store(toy, api.now());
      return true;
    }

    return {
      update,
      drawBack,
      drawFront,
      scenery,
      setJobs,
      hover,
      grab,
      startToy,
      stopToy,
      startCritter,
      canPlay,
      toyLabel: () => (use ? `${USE_LABEL[use.toy.def.use]} ${use.toy.def.name}` : ''),
      critter: () => (critter ? { x: critter.x, y: critter.y } : null),
      machineCount: () => machines.filter((m) => !m.leavingAt).length,
      machineSide: () => machineLayout.side,
      /** Restores the saved inventory. */
      setBag: (saved) => {
        for (const [id, n] of Object.entries(saved || {})) {
          if (TOYS.some((d) => d.id === id) && n > 0) {
            bag.set(id, n);
          }
        }
        if (bag.size > 0) {
          nextFind = api.now() + rnd(60000, 120000);
        }
      },
      /** Every toy in catalogue order, with how many are in the bag and whether one is out. */
      bagList: () =>
        TOYS.map((d) => ({
          id: d.id,
          emoji: d.emoji,
          name: d.name,
          rarity: RARITY[d.rarity].label,
          color: RARITY[d.rarity].color,
          count: bag.get(d.id) || 0,
          out: isOut(d.id),
        })),
      takeOut,
      putAway,
      putAllAway,
      foundCount: () => bag.size,
      toyTotal: TOYS.length,
      /** Where the toy hobby wants the pet's centre to go, or null. */
      target: () => target,
      /** Pose overrides while playing with a toy. */
      pose: () => pose,
      /** Pixels to raise (or, negative, sink) the pet, e.g. sitting on a couch. */
      lift: () => lift,
      /** Make a new find right now (used by tests). */
      find: () => find(api.now()),
    };
  }

  root.PetScene = { create, TOYS, RARITY };
})(this);
