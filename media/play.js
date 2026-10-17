// @ts-check
// Hands-on pet care: drop kibble, tease with a treat, play fetch, scrub in
// the bath, and stroke the pet. webview.js creates one instance and hands it
// a small API into the renderer; this file owns the items and their physics.
(function (root) {
  'use strict';

  /** Where dirt smudges sit on a dirty pet, in 32x32 art coordinates. */
  const DIRT_SPOTS = [
    [9, 22],
    [22, 24],
    [12, 10],
    [23, 14],
    [16, 27],
  ];

  /** Kibble is free; the rest are bought in the shop. `emoji` null draws the kibble pellet. */
  const FOODS = [
    { id: 'kibble', emoji: null, name: 'kibble' },
    { id: 'fish', emoji: '🐟', name: 'fresh fish' },
    { id: 'steak', emoji: '🥩', name: 'steak' },
    { id: 'berries', emoji: '🍓', name: 'strawberries' },
    { id: 'cake', emoji: '🍰', name: 'cake' },
  ];

  const HINTS = {
    treat: 'Hold the treat above your pet, then click to drop it 🍪',
    play: 'Grab the ball and throw it! 🎾',
    bath: 'Hold the mouse button and scrub your pet 🧽',
  };

  const STROKE_PX = 220;
  const MAX_KIBBLE = 6;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /**
   * @param {{
   *   ctx: CanvasRenderingContext2D,
   *   main: () => any,
   *   busy: () => boolean,
   *   care: () => any,
   *   sendCare: (action: string) => void,
   *   emit: (part: object) => void,
   *   note: (text: string, ms?: number) => void,
   *   anim: (kind: string) => void,
   *   animating: () => boolean,
   *   petPx: (p: any) => number,
   *   species: () => any,
   *   view: () => {w: number, h: number},
   *   now: () => number,
   *   toolChanged: () => void,
   *   food: () => string,
   * }} api
   */
  function create(api) {
    const ctx = api.ctx;
    /** @type {string | null} */
    let tool = null;
    /** @type {Array<{x: number, y: number, vy: number, landed: boolean, food: any}>} */
    let kibbles = [];
    /** @type {any} */
    let treat = null;
    /** @type {any} */
    let ball = null;
    /** @type {any} */
    let scrub = null;
    /** @type {any} */
    let stroke = null;
    let lastStrokeCare = 0;
    let refusedAt = 0;
    let fetches = 0;
    /** @type {number | null} */
    let target = null;
    /** @type {any} */
    let poseHint = null;
    const pointer = { x: -1, y: -1, over: false };
    /** @type {Array<{x: number, y: number, t: number}>} */
    const samples = [];

    function geom() {
      const p = api.main();
      const size = api.petPx(p);
      const sp = api.species();
      return {
        p,
        size,
        s: p.scale,
        cx: p.x + p.wx + size / 2,
        top: p.y,
        floor: p.y + (size * 30) / 32,
        mouthY: p.y + (size * sp.mouthY) / 32,
      };
    }

    function bumpLocal(changes) {
      const c = api.care();
      if (!c) {
        return;
      }
      for (const [k, d] of Object.entries(changes)) {
        c[k] = clamp(c[k] + d, 0, 100);
      }
    }

    function reward(action, changes) {
      api.sendCare(action);
      // Optimistic so refusals ("not hungry") kick in before the extension replies.
      bumpLocal(changes);
    }

    function velocity() {
      if (samples.length < 2) {
        return { x: 0, y: 0 };
      }
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = (b.t - a.t) / 1000;
      return dt < 0.01 ? { x: 0, y: 0 } : { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
    }

    function hearts(x, y, size) {
      for (let i = 0; i < 3; i++) {
        api.emit({
          x: x + (Math.random() - 0.5) * size * 0.3,
          y,
          vx: (Math.random() - 0.5) * size * 0.3,
          vy: -size * (0.3 + Math.random() * 0.3),
          text: i === 1 ? '💕' : '💖',
          size: size * 0.1,
          life: 1,
        });
      }
    }

    // -- Tools --------------------------------------------------------------

    function food() {
      return FOODS.find((f) => f.id === api.food()) || FOODS[0];
    }

    function setTool(name) {
      if (scrub && scrub.foam.length > 0) {
        api.anim('shake');
      }
      tool = name;
      kibbles = [];
      treat = null;
      ball = null;
      scrub = null;
      fetches = 0;
      const p = api.main();
      if (!name || !p) {
        tool = null;
        api.toolChanged();
        return;
      }
      const g = geom();
      const c = api.care();
      if (name === 'treat') {
        treat = { state: 'held', x: pointer.x, y: pointer.y, vx: 0, vy: 0, readyAt: 0 };
      } else if (name === 'play') {
        ball = {
          x: clamp(g.cx + g.size * 0.6, 20, api.view().w - 20),
          y: g.floor,
          vx: 0,
          vy: 0,
          held: false,
          carried: false,
          thrown: false,
          resting: true,
          returnX: g.cx,
        };
      } else if (name === 'bath') {
        const clean = c ? c.clean : 50;
        scrub = { down: false, progress: clean, sent: clean, foam: [], lastX: 0, lastY: 0 };
      }
      if (name === 'bath' && c && c.clean >= 99) {
        api.note(`${p.name} is already squeaky clean! ✨`, 3000);
      } else {
        api.note(name === 'feed' ? `Click anywhere to drop ${food().name} 🥣` : HINTS[name], 4000);
      }
      api.toolChanged();
    }

    function updateKibble(g, t, dt) {
      for (const k of kibbles) {
        if (!k.landed) {
          k.vy += g.size * 6 * dt;
          k.y += k.vy * dt;
          if (k.y >= g.floor) {
            k.y = g.floor;
            k.landed = true;
          }
        }
      }
      const landed = kibbles.filter((k) => k.landed);
      if (landed.length === 0 || api.animating()) {
        return;
      }
      const c = api.care();
      if (c && c.fullness >= 92) {
        if (t - refusedAt > 4000) {
          refusedAt = t;
          api.anim('refuse');
          api.note(`${g.p.name} isn't hungry right now.`);
        }
        return;
      }
      const k = landed.reduce((a, b) => (Math.abs(b.x - g.cx) < Math.abs(a.x - g.cx) ? b : a));
      target = k.x;
      poseHint = { eyes: 'open', mouth: 'tongue', look: Math.sign(k.x - g.cx) };
      if (Math.abs(k.x - g.cx) < g.size * 0.12) {
        kibbles.splice(kibbles.indexOf(k), 1);
        api.anim('eat');
        reward('kibble', { fullness: 10 });
      }
    }

    function eatTreat(g, caught) {
      const c = api.care();
      if (c && c.fullness >= 98) {
        api.anim('refuse');
        api.note(`${g.p.name} is too full for treats.`);
      } else {
        api.anim(caught ? 'catch' : 'eat');
        reward('treat', { fullness: 6, fun: 12 });
        api.note(caught ? 'Nice catch! 🍪' : 'Yum! 🍪', 1800);
      }
      treat = {
        state: 'held',
        x: pointer.x,
        y: pointer.y,
        vx: 0,
        vy: 0,
        readyAt: api.now() + 1200,
      };
    }

    function updateTreat(g, t, dt) {
      if (treat.state === 'held') {
        if (t < treat.readyAt || !pointer.over || api.animating()) {
          return;
        }
        target = treat.x;
        const begging =
          Math.abs(treat.x - g.cx) < g.size * 0.45 &&
          treat.y < g.mouthY &&
          treat.y > g.top - g.size;
        poseHint = begging
          ? { eyes: 'wide', mouth: 'tongue', motion: 'hop', look: 0, wag: 10 }
          : { eyes: 'open', mouth: 'tongue', look: Math.sign(treat.x - g.cx) };
        return;
      }
      if (treat.state === 'falling') {
        treat.vy += g.size * 6 * dt;
        treat.x += treat.vx * dt;
        treat.y += treat.vy * dt;
        const inMouthZone =
          Math.abs(treat.x - g.cx) < g.size * 0.3 &&
          treat.y >= g.top + g.size * 0.2 &&
          treat.y <= g.mouthY + g.size * 0.1;
        if (inMouthZone) {
          eatTreat(g, true);
          return;
        }
        if (treat.y >= g.floor) {
          treat.y = g.floor;
          treat.state = 'landed';
        }
        target = treat.x;
        poseHint = { eyes: 'wide', mouth: 'open', look: Math.sign(treat.x - g.cx) };
        return;
      }
      if (api.animating()) {
        return;
      }
      target = treat.x;
      poseHint = { eyes: 'open', mouth: 'tongue', look: Math.sign(treat.x - g.cx) };
      if (Math.abs(treat.x - g.cx) < g.size * 0.12) {
        eatTreat(g, false);
      }
    }

    function updateBall(g, t, dt) {
      const r = g.size * 0.065;
      if (ball.carried) {
        ball.x = g.cx + g.p.walking * g.size * 0.06;
        ball.y = g.mouthY + g.size * 0.06;
        target = ball.returnX;
        poseHint = { eyes: 'happy', mouth: 'neutral', wag: 10 };
        if (Math.abs(ball.returnX - g.cx) < g.size * 0.1) {
          ball.carried = false;
          ball.thrown = false;
          ball.resting = true;
          ball.x = clamp(g.cx + g.size * 0.35, r, api.view().w - r);
          ball.y = g.floor;
          fetches++;
          api.anim('catch');
          reward('fetch', { fun: 12, fullness: -2, clean: -3 });
          api.note(fetches > 1 ? `Fetch x${fetches}! 🎾` : 'Good fetch! 🎾', 1800);
        }
        return;
      }
      if (ball.held) {
        poseHint = {
          eyes: 'wide',
          mouth: 'tongue',
          motion: 'hop',
          look: Math.sign(ball.x - g.cx),
          wag: 10,
        };
        return;
      }
      if (!ball.resting) {
        const w = api.view().w;
        ball.vy += g.size * 7 * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if (ball.x < r || ball.x > w - r) {
          ball.x = clamp(ball.x, r, w - r);
          ball.vx = -ball.vx * 0.7;
        }
        if (ball.y < r) {
          ball.y = r;
          ball.vy = Math.abs(ball.vy) * 0.5;
        }
        if (ball.y >= g.floor) {
          ball.y = g.floor;
          ball.vy = Math.abs(ball.vy) > g.size * 0.6 ? -ball.vy * 0.55 : 0;
          ball.vx *= Math.pow(0.2, dt);
          if (ball.vy === 0 && Math.abs(ball.vx) < 5) {
            ball.resting = true;
          }
        }
      }
      if (!ball.thrown) {
        return;
      }
      const c = api.care();
      if (c && c.fullness < 10) {
        if (t - refusedAt > 5000) {
          refusedAt = t;
          api.note(`${g.p.name} is too hungry to play. Feed them first!`);
        }
        return;
      }
      target = ball.x;
      poseHint = { eyes: 'open', mouth: 'open', look: Math.sign(ball.x - g.cx), wag: 8 };
      if (Math.abs(ball.x - g.cx) < g.size * 0.22 && ball.y > g.floor - g.size * 0.35) {
        ball.carried = true;
      }
    }

    function finishBath(g) {
      if (scrub.sent < 100) {
        scrub.sent = 100;
        reward('scrub', { clean: 20 });
      }
      scrub.foam = [];
      api.anim('shake');
      api.note(`${g.p.name} is squeaky clean! ✨`, 2500);
    }

    // -- Per-frame ----------------------------------------------------------

    function update(t, dt) {
      target = null;
      poseHint = null;
      const p = api.main();
      if (!p) {
        return;
      }
      if (api.busy()) {
        stroke = null;
        if (tool) {
          setTool(null);
          api.note(`🛠️ ${p.name} has work to do! Care is paused.`, 3000);
        }
        return;
      }
      const g = geom();
      if (stroke && t - stroke.movedAt < 300) {
        poseHint = { eyes: 'happy', mouth: 'smile', motion: 'wiggle', wag: 10 };
      }
      if (tool === 'feed') {
        updateKibble(g, t, dt);
      } else if (tool === 'treat' && treat) {
        updateTreat(g, t, dt);
      } else if (tool === 'play' && ball) {
        updateBall(g, t, dt);
      } else if (tool === 'bath' && scrub && scrub.down) {
        poseHint = { eyes: 'happy', mouth: 'smile', motion: 'wiggle', wag: 6 };
      }
    }

    function draw(t) {
      const p = api.main();
      if (!p) {
        return;
      }
      const g = geom();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const k of kibbles) {
        if (k.food.emoji) {
          ctx.font = `${Math.round(g.size * 0.11)}px sans-serif`;
          ctx.fillText(k.food.emoji, k.x, k.y - g.size * 0.045);
          continue;
        }
        ctx.fillStyle = '#7a4a22';
        ctx.beginPath();
        ctx.ellipse(k.x, k.y - g.s, g.s * 1.4, g.s * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c48a4a';
        ctx.beginPath();
        ctx.arc(k.x - g.s * 0.4, k.y - g.s * 1.4, g.s * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      if (treat && !(treat.state === 'held' && (t < treat.readyAt || !pointer.over))) {
        ctx.font = `${Math.round(g.size * 0.14)}px sans-serif`;
        ctx.fillText('🍪', treat.x, treat.y - (treat.state === 'held' ? 0 : g.size * 0.05));
      }
      if (ball) {
        ctx.font = `${Math.round(g.size * 0.13)}px sans-serif`;
        ctx.fillText('🎾', ball.x, ball.y - g.size * 0.065);
      }
      if (pointer.over && tool === 'feed') {
        ctx.font = `${Math.round(g.size * 0.15)}px sans-serif`;
        ctx.fillText('🥣', pointer.x, pointer.y);
      }
      if (pointer.over && tool === 'bath') {
        ctx.save();
        ctx.translate(pointer.x, pointer.y);
        ctx.rotate(scrub && scrub.down ? Math.sin(t / 60) * 0.3 : 0);
        ctx.font = `${Math.round(g.size * 0.15)}px sans-serif`;
        ctx.fillText('🧽', 0, 0);
        ctx.restore();
      }
    }

    /** Dirt and bath foam, drawn inside the pet's transform so they move with it. */
    function drawOnPet(p, s) {
      const c = api.care();
      const clean = scrub ? scrub.progress : c ? c.clean : 100;
      if (clean < 60) {
        const n = Math.min(DIRT_SPOTS.length, Math.ceil((60 - clean) / 12));
        ctx.fillStyle = 'rgba(105, 70, 35, 0.5)';
        for (let i = 0; i < n; i++) {
          const [x, y] = DIRT_SPOTS[i];
          ctx.beginPath();
          ctx.ellipse((x - 16) * s, (y - 32) * s, s * 1.8, s * 1.2, 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (scrub) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.strokeStyle = 'rgba(150, 200, 255, 0.8)';
        ctx.lineWidth = Math.max(1, s * 0.3);
        for (const f of scrub.foam) {
          ctx.beginPath();
          ctx.arc((f.ax - 16) * s, (f.ay - 32) * s, s * f.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // -- Input --------------------------------------------------------------

    /** Returns true when the press was used by care mode (so it must not drag the pet). */
    function pointerDown(x, y, overPet) {
      pointer.x = x;
      pointer.y = y;
      pointer.over = true;
      samples.length = 0;
      if (api.busy() || !api.main()) {
        return false;
      }
      const g = geom();
      switch (tool) {
        case null:
          if (!overPet) {
            return false;
          }
          stroke = { dist: 0, lastX: x, lastY: y, movedAt: 0 };
          return true;
        case 'feed':
          if (kibbles.length < MAX_KIBBLE) {
            kibbles.push({
              x: clamp(x, g.size * 0.3, api.view().w - g.size * 0.3),
              y: Math.min(y, g.floor),
              vy: 0,
              landed: false,
              food: food(),
            });
          }
          return true;
        case 'treat':
          if (treat && treat.state === 'held' && api.now() >= treat.readyAt) {
            treat.state = 'falling';
            treat.x = clamp(x, g.size * 0.2, api.view().w - g.size * 0.2);
            treat.y = y;
            treat.vx = velocity().x * 0.3;
            treat.vy = 0;
          }
          return true;
        case 'play':
          if (ball && !ball.carried && Math.hypot(x - ball.x, y - ball.y) < g.size * 0.2) {
            ball.held = true;
            ball.resting = false;
          }
          return true;
        case 'bath':
          if (overPet && scrub) {
            scrub.down = true;
            scrub.lastX = x;
            scrub.lastY = y;
          }
          return true;
      }
      return false;
    }

    function pointerMove(x, y, isOverPet) {
      const t = api.now();
      samples.push({ x, y, t });
      while (samples.length > 5) {
        samples.shift();
      }
      pointer.x = x;
      pointer.y = y;
      pointer.over = true;
      if (!api.main()) {
        return;
      }
      const g = geom();
      if (stroke) {
        if (isOverPet()) {
          stroke.dist += Math.hypot(x - stroke.lastX, y - stroke.lastY);
          stroke.movedAt = t;
        }
        stroke.lastX = x;
        stroke.lastY = y;
        if (stroke.dist > STROKE_PX) {
          stroke.dist = 0;
          hearts(g.cx, g.top + g.size * 0.25, g.size);
          if (t - lastStrokeCare > 1200) {
            lastStrokeCare = t;
            reward('pet', { fun: 4 });
          }
        }
      }
      if (ball && ball.held) {
        ball.x = x;
        ball.y = Math.min(y, g.floor);
      }
      if (treat && treat.state === 'held') {
        treat.x = x;
        treat.y = y;
      }
      if (scrub && scrub.down && isOverPet()) {
        const d = Math.hypot(x - scrub.lastX, y - scrub.lastY);
        scrub.progress = Math.min(100, scrub.progress + (d * 100) / (g.size * 14));
        if (scrub.foam.length < 40 && Math.random() < d / 25) {
          scrub.foam.push({
            ax: (x - g.cx) / g.s + 16,
            ay: (y - (g.p.y + g.size)) / g.s + 32,
            r: 1.1 + Math.random() * 1.2,
          });
        }
        if (Math.random() < d / 60) {
          api.emit({ x, y, vy: -g.size * 0.25, text: '🫧', size: g.size * 0.08, life: 1.2 });
        }
        while (scrub.progress - scrub.sent >= 20) {
          scrub.sent += 20;
          reward('scrub', { clean: 20 });
        }
        if (scrub.progress >= 100 && scrub.foam.length > 0) {
          finishBath(g);
        }
      }
      if (scrub) {
        scrub.lastX = x;
        scrub.lastY = y;
      }
    }

    /** Returns true when the release belonged to care mode. */
    function pointerUp() {
      if (stroke) {
        stroke = null;
        return true;
      }
      if (scrub) {
        scrub.down = false;
      }
      if (ball && ball.held && api.main()) {
        const g = geom();
        const v = velocity();
        const max = g.size * 9;
        ball.held = false;
        ball.thrown = true;
        ball.vx = clamp(v.x, -max, max);
        ball.vy = clamp(v.y, -max, max);
        ball.returnX = clamp(pointer.x, g.size / 2, api.view().w - g.size / 2);
        return true;
      }
      return tool !== null;
    }

    function pointerLeave() {
      pointer.over = false;
    }

    /** CSS cursor for care mode, or null to let the renderer decide. */
    function cursor(x, y) {
      if (tool === 'feed' || tool === 'bath') {
        return 'none';
      }
      if (tool === 'treat') {
        return treat && treat.state === 'held' ? 'none' : 'default';
      }
      if (tool === 'play' && ball) {
        const near = Math.hypot(x - ball.x, y - ball.y) < api.petPx(api.main()) * 0.2;
        return ball.held ? 'grabbing' : near ? 'grab' : 'default';
      }
      return null;
    }

    return {
      tool: () => tool,
      setTool,
      update,
      draw,
      drawOnPet,
      pointerDown,
      pointerMove,
      pointerUp,
      pointerLeave,
      cursor,
      /** Where the activity wants the pet's centre to go, or null. */
      target: () => target,
      /** Pose overrides for the pet while an activity is going on. */
      pose: () => poseHint,
    };
  }

  root.PetPlay = { create, FOODS };
})(this);
