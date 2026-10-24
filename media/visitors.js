// @ts-check
// Visitors: when a pet has been left with every care stat at zero, 1 to 3
// hours later (the extension decides when, and has already raised the stat)
// someone looks in on it. A passer-by walks up and feeds it, a rain cloud
// drifts over and gives it a bath, or, very rarely, a friend of its own kind
// (a randomly made-up pet of the same species) drops in to play with a toy
// from its bag. webview.js creates one instance and acts each visit out here.
(function (root) {
  'use strict';

  /** Who walks by; picked from the visit's time so every window shows the same person. */
  const PEOPLE = ['🧑', '👩', '👨', '👧', '👦', '👵', '👴', '🧒'];
  /** How long walking in (and out) takes, and how long each visitor stays. */
  const WALK_MS = 2600;
  const STAY_MS = { feed: 2400, play: 9000 };
  const DRIFT_MS = 1400;
  const RAIN_MS = 5500;
  /** Clouds strung across the top during a shower. */
  const CLOUDS = ['☁️', '🌧️', '☁️', '🌧️', '☁️'];

  /** A fixed pseudo-random number in [0, 1) for drop `n`, so the rain is the same every frame. */
  function hash(n) {
    const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /** What a playmate can look like; each one is rolled from these. */
  const FRIEND_COLORS = [
    '#e8772e',
    '#d9822b',
    '#7b4a2a',
    '#e0b24f',
    '#8a8aa0',
    '#3a3f5c',
    '#e8e8ee',
    '#4aa3df',
    '#5cc9a7',
    '#a98be0',
    '#f27fb2',
    '#9ad94a',
    '#22222a',
  ];
  const FRIEND_EYES = ['', '#3a7bd5', '#2f9e5a', '#e09b1f', '#8a4fd8'];
  const FRIEND_NAMES = [
    'Pepper',
    'Nugget',
    'Ziggy',
    'Maple',
    'Tofu',
    'Clover',
    'Bean',
    'Waffles',
    'Juniper',
    'Pickles',
    'Sprout',
    'Mango',
    'Biscotti',
    'Noodle',
    'Pebble',
    'Sunny',
    'Marble',
    'Toffee',
    'Kiwi',
    'Olive',
    'Rocket',
    'Dumpling',
    'Fig',
    'Comet',
    'Pistachio',
    'Ginger',
    'Domino',
    'Peanut',
    'Saffron',
    'Button',
    'Cosmo',
    'Hazel',
  ];

  /**
   * A made-up friend of the pet's own species: random colour, eyes, pattern,
   * accessory and name. Rolled from the visit's time, so every window sees
   * the same friend, and every visit a new one.
   * @param {string} species
   * @param {number} at
   */
  function friendLook(species, at) {
    const rand = root.PetVariants.seeded(`friend:${at}`);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const Art = root.PetArt;
    return {
      species,
      color: pick(FRIEND_COLORS),
      accentColor: '',
      eyeColor: pick(FRIEND_EYES),
      pattern: rand() < 0.5 ? pick(Art.PATTERNS.filter((x) => x !== 'none')) : '',
      accessory: rand() < 0.6 ? pick(Object.keys(Art.ACCESSORIES)) : '',
      accessoryColor: '',
      name: pick(FRIEND_NAMES),
      style: '',
    };
  }

  /**
   * @param {{
   *   ctx: CanvasRenderingContext2D,
   *   main: () => any,
   *   petPx: (p: any) => number,
   *   view: () => {w: number, h: number},
   *   now: () => number,
   *   emit: (part: object) => void,
   *   say: (text: string, color: string, ms: number) => void,
   *   react: (kind: string) => void,
   *   play: (toy: string) => void,
   *   species: () => string,
   *   sprite: (look: any, o: object) => any,
   * }} api
   */
  function create(api) {
    const ctx = api.ctx;
    /** @type {any} */
    let visit = null;

    function geom() {
      const p = api.main();
      const size = api.petPx(p);
      return { size, cx: p.x + p.wx + size / 2, floor: p.y + size - p.scale, top: p.y + p.wy };
    }

    /** Starts acting out a visit from the extension. A new one replaces any still going. */
    function start(v, name) {
      if (!api.main()) {
        return;
      }
      const g = geom();
      const w = api.view().w;
      // Come in from the side with more room, and stand beside the pet on that side.
      const side = g.cx < w / 2 ? 1 : -1;
      const toy = v.toy && root.PetScene.TOYS.find((d) => d.id === v.toy);
      visit = {
        kind: v.kind,
        who: PEOPLE[Math.abs(Math.floor(v.at / 1000)) % PEOPLE.length],
        friend: v.kind === 'play' ? friendLook(api.species(), v.at) : null,
        name,
        toy: toy || null,
        side,
        edge: side > 0 ? w + g.size * 0.4 : -g.size * 0.4,
        start: api.now(),
        acted: false,
        waved: false,
        dropAt: 0,
        fxAt: 0,
      };
      const amount = v.amount ? ` +${v.amount}` : '';
      if (v.kind === 'rain') {
        api.say(`🌧️ Rain gave ${name} a bath!${amount} 🫧`, '#7fd3ff', 4500);
      } else if (v.kind === 'play') {
        api.say(
          `${toy ? toy.emoji : '🎉'} ${visit.friend.name} came to play with ${name}!${amount} 💖`,
          '#ff9fc4',
          5000,
        );
      } else {
        api.say(`🍖 A passer-by fed ${name}!${amount}`, '#ffd23f', 4500);
      }
    }

    /** How long the whole visit lasts. */
    function length(v) {
      return v.kind === 'rain' ? DRIFT_MS * 2 + RAIN_MS : WALK_MS * 2 + STAY_MS[v.kind];
    }

    /** A playmate is drawn this much smaller than the pet. */
    const FRIEND_K = 0.72;

    /** Where a walking visitor is: x, and whether it is on the move. */
    function walker(v, t, g) {
      const w = api.view().w;
      const away = v.friend ? 0.5 + FRIEND_K / 2 + 0.05 : 0.62;
      const half = v.friend ? (g.size * FRIEND_K) / 2 : g.size * 0.2;
      const spot = Math.min(w - half, Math.max(half, g.cx + v.side * g.size * away));
      const e = t - v.start;
      const stayEnd = WALK_MS + STAY_MS[v.kind];
      if (e < WALK_MS) {
        return { x: v.edge + (spot - v.edge) * (e / WALK_MS), moving: true, dir: -v.side };
      }
      if (e < stayEnd) {
        return { x: spot, moving: false, dir: -v.side };
      }
      return { x: spot + (v.edge - spot) * ((e - stayEnd) / WALK_MS), moving: true, dir: v.side };
    }

    /**
     * How heavy the shower is, 0 to 1: it rolls in, pours over the whole
     * panel, then clears.
     */
    function storm(v, t) {
      const e = t - v.start;
      if (e < DRIFT_MS) {
        return e / DRIFT_MS;
      }
      if (e < DRIFT_MS + RAIN_MS) {
        return 1;
      }
      return Math.max(0, 1 - (e - DRIFT_MS - RAIN_MS) / DRIFT_MS);
    }

    function update(t) {
      if (!visit || !api.main()) {
        return;
      }
      const v = visit;
      if (t - v.start > length(v)) {
        visit = null;
        return;
      }
      const g = geom();
      if (v.kind === 'rain') {
        // A few big drops land on the pet itself.
        if (storm(v, t) === 1 && t - v.fxAt > 160) {
          v.fxAt = t;
          api.emit({
            x: g.cx + (Math.random() - 0.5) * g.size * 0.7,
            y: g.top + g.size * 0.1,
            vy: g.size * 2.4,
            text: '💧',
            size: g.size * 0.06,
            life: 0.4,
          });
        }
        if (!v.acted && t - v.start > DRIFT_MS + RAIN_MS) {
          v.acted = true;
          api.react('shake');
        }
        return;
      }
      const arrived = t - v.start >= WALK_MS;
      if (arrived && !v.acted) {
        v.acted = true;
        const at = walker(v, t, g);
        if (v.kind === 'feed') {
          // A treat tossed from the hand lands in front of the pet.
          api.emit({
            x: at.x,
            y: g.floor - g.size * 0.35,
            vx: (g.cx - at.x) * 1.4,
            vy: -g.size * 0.6,
            g: g.size * 3,
            text: '🍖',
            size: g.size * 0.12,
            life: 0.9,
          });
          v.dropAt = t + 800;
        } else if (v.toy) {
          api.play(v.toy.id);
        }
      }
      if (v.dropAt && t > v.dropAt) {
        v.dropAt = 0;
        api.react('eat');
      }
      // Waving the playmate off, the pet is all hearts.
      if (v.kind === 'play' && !v.waved && t - v.start >= WALK_MS + STAY_MS.play) {
        v.waved = true;
        api.react('happy');
      }
      if (v.kind === 'play' && arrived && t - v.fxAt > 1600) {
        v.fxAt = t;
        const at = walker(v, t, g);
        api.emit({
          x: at.x,
          y: g.floor - g.size * 0.6,
          vy: -g.size * 0.25,
          text: Math.random() < 0.5 ? '🎉' : '😄',
          size: g.size * 0.1,
          life: 1.1,
        });
      }
    }

    /** A shower darkens the whole panel and brings clouds over the top, behind the pets. */
    function drawBack(t) {
      if (!visit || visit.kind !== 'rain' || !api.main()) {
        return;
      }
      const k = storm(visit, t);
      const { w, h } = api.view();
      const g = geom();
      ctx.save();
      ctx.fillStyle = `rgba(18, 28, 48, ${0.42 * k})`;
      ctx.fillRect(0, 0, w, h);
      // Clouds slide in from the side the shower came from, and back out.
      const size = Math.max(28, Math.min(g.size * 0.36, w / 4));
      const slide = (1 - k) * w * (visit.side > 0 ? 1 : -1);
      ctx.globalAlpha = k;
      ctx.font = `${Math.round(size)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      CLOUDS.forEach((c, i) => {
        const x = ((i + 0.5) / CLOUDS.length) * w + slide + Math.sin(t / 1200 + i) * size * 0.15;
        ctx.fillText(c, x, 44 + size * 0.45 + (i % 2) * size * 0.25);
      });
      ctx.restore();
    }

    /** Rain over the whole panel, slanting a little, splashing along the floor. */
    function drawRain(t) {
      const k = storm(visit, t);
      if (k <= 0) {
        return;
      }
      const { w, h } = api.view();
      const g = geom();
      const drops = Math.min(320, Math.round((w * h) / 700));
      ctx.save();
      ctx.strokeStyle = `rgba(175, 205, 255, ${0.6 * k})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < Math.round(drops * k); i++) {
        const speed = h * (1.1 + hash(i) * 0.7);
        const len = 9 + hash(i + 500) * 12;
        const y = (((t / 1000) * speed + hash(i + 1000) * (h + 40)) % (h + 40)) - 20;
        const x = (hash(i + 2000) * (w + 40) - 20 + y * 0.18) % (w + 40);
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * 0.18, y - len);
      }
      ctx.stroke();
      // Little splashes along the floor line.
      ctx.fillStyle = `rgba(190, 215, 255, ${0.5 * k})`;
      for (let i = 0; i < 14; i++) {
        const phase = (((t / 600 + hash(i + 3000)) % 1) + 1) % 1;
        const x = hash(i + 4000 + Math.floor(t / 600 + hash(i + 3000))) * w;
        ctx.beginPath();
        ctx.ellipse(x, g.floor, 2 + phase * 7, 1 + phase * 2, 0, 0, Math.PI * 2);
        ctx.globalAlpha = 1 - phase;
        ctx.fill();
      }
      ctx.restore();
    }

    /** The visitor, in front of the pet. */
    function draw(t) {
      if (!visit || !api.main()) {
        return;
      }
      const v = visit;
      const g = geom();
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      if (v.kind === 'rain') {
        drawRain(t);
      } else if (v.friend) {
        // The friend trots in, then bounces about while they play.
        const at = walker(v, t, g);
        const f = g.size * FRIEND_K;
        const bob = -Math.abs(Math.sin(t / (at.moving ? 140 : 220))) * f * (at.moving ? 0.05 : 0.1);
        const sprite = api.sprite(v.friend, {
          eyes: at.moving ? 'open' : 'happy',
          mouth: at.moving ? 'neutral' : 'open',
          frame: Math.floor(t / 250) % 2,
        });
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(at.x, g.floor, f * 0.32, f * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(sprite, at.x - f / 2, g.floor - f + bob, f, f);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(9, Math.round(f * 0.09))}px sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(v.friend.name, at.x, g.floor + 3);
      } else {
        const at = walker(v, t, g);
        const bob = at.moving ? -Math.abs(Math.sin(t / 140)) * g.size * 0.04 : 0;
        ctx.translate(at.x, g.floor + bob);
        // Emoji people face left; mirror them when walking right.
        ctx.scale(at.dir > 0 ? -1 : 1, 1);
        ctx.font = `${Math.round(g.size * 0.4)}px sans-serif`;
        ctx.fillText(v.who, 0, 0);
        if (!at.moving && v.kind === 'feed') {
          ctx.font = `${Math.round(g.size * 0.14)}px sans-serif`;
          ctx.fillText('👋', -g.size * 0.14, -g.size * 0.36);
        }
      }
      ctx.restore();
    }

    /** Tooltip for the visitor under the mouse, or null. */
    function hover(x, y) {
      if (!visit || visit.kind === 'rain' || !api.main()) {
        return null;
      }
      const g = geom();
      const at = walker(visit, api.now(), g);
      const s = visit.friend ? g.size * FRIEND_K : g.size * 0.4;
      if (Math.abs(x - at.x) > s / 2 || y > g.floor || y < g.floor - s) {
        return null;
      }
      return visit.friend
        ? {
            title: `${visit.friend.name} the ${visit.friend.species}`,
            sub: `came over to play with ${visit.name}`,
          }
        : { title: `${visit.who} A passer-by`, sub: `stopped to feed ${visit.name}` };
    }

    return {
      start,
      update,
      drawBack,
      draw,
      hover,
      /** True while someone is visiting. */
      active: () => !!visit,
    };
  }

  root.PetVisitors = { create, PEOPLE, friendLook };
})(this);
