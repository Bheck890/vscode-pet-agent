// @ts-check
// Holiday events: what the scene wears while one is on. The extension works
// out which events are running from the local date (src/calendar.ts) and
// sends them; this file dresses the pet in one of the holiday's outfits (a
// costume from pets.js COSTUMES, sometimes with a fur colour, see-through
// and floating for a ghost), puts decorations along the floor, strings a
// garland above, and adds a little weather. Each window picks its own outfit
// and decorations when it opens, so every panel looks a bit different. Event
// toys live in scene.js (TOYS with an `event`). webview.js creates one instance.
(function (root) {
  'use strict';

  /**
   * outfits: who the pet dresses up as (`name` follows "dressed as").
   * decor: sets of four emojis along the floor, two either side of the pet's
   * home spot, and a garland (`hang`) above. fx: ambient particles.
   */
  const EVENTS = {
    halloween: {
      name: 'Halloween',
      greeting: '🎃 Happy Halloween!',
      outfits: [
        { id: 'witch', name: 'a witch', costume: 'witchHat' },
        {
          id: 'ghost',
          name: 'a ghost',
          costume: 'ghostHem',
          fur: '#eef0ff',
          accent: '#ffffff',
          alpha: 0.85,
          float: true,
        },
        { id: 'vampire', name: 'a vampire', costume: 'vampireCollar' },
        { id: 'pumpkin', name: 'a pumpkin', costume: 'pumpkinHat' },
      ],
      decor: [
        { floor: ['🎃', '🕸️', '🍬', '👻'], hang: ['🦇', '🎃', '🦇', '🎃', '🦇'] },
        { floor: ['🪦', '🕯️', '💀', '🕯️'], hang: ['🕸️', '🦇', '🕸️', '🦇'] },
        { floor: ['🍭', '🎃', '🧹', '🍬'], hang: ['👻', '🍬', '👻', '🍬', '👻'] },
      ],
      fx: { emojis: ['🦇'], every: 2600, fall: false },
    },
    thanksgiving: {
      name: 'Thanksgiving',
      greeting: '🦃 Happy Thanksgiving!',
      outfits: [
        { id: 'pilgrim', name: 'a pilgrim', costume: 'pilgrimHat' },
        { id: 'turkey', name: 'a turkey', costume: 'turkeyFan' },
        { id: 'scarecrow', name: 'a scarecrow', costume: 'scarecrowHat' },
      ],
      decor: [
        { floor: ['🌽', '🍂', '🥧', '🍁'], hang: ['🍂', '🍁', '🍂', '🍁'] },
        { floor: ['🦃', '🎃', '🌾', '🍎'], hang: ['🌽', '🍂', '🌽'] },
      ],
      fx: { emojis: ['🍂', '🍁'], every: 1500, fall: true },
    },
    christmas: {
      name: 'Christmas',
      greeting: '🎄 Merry Christmas!',
      outfits: [
        { id: 'santa', name: 'Santa', costume: 'santaHat' },
        { id: 'elf', name: 'an elf', costume: 'elfHat' },
        { id: 'reindeer', name: 'a reindeer', costume: 'antlers' },
        {
          id: 'snowman',
          name: 'a snowman',
          costume: 'topHat',
          fur: '#f4f8ff',
          accent: '#ffffff',
        },
      ],
      decor: [
        { floor: ['🎄', '🎁', '🎁', '🕯️'], hang: ['🔴', '🟢', '🔴', '🟢', '🔴', '🟢'] },
        { floor: ['⭐', '🎁', '⛄', '🎄'], hang: ['❄️', '🔔', '❄️', '🔔', '❄️'] },
        { floor: ['🦌', '🍪', '🥛', '🎁'], hang: ['🧦', '🎄', '🧦', '🎄'] },
      ],
      fx: { emojis: ['❄️'], every: 700, fall: true },
    },
    newyear: {
      name: 'New Year',
      greeting: '🎆 Happy New Year!',
      outfits: [
        { id: 'party', name: 'a party animal', costume: 'partyCone' },
        { id: 'tophat', name: 'a dapper guest', costume: 'topHat' },
        { id: 'tiara', name: 'royalty', costume: 'tiara' },
      ],
      decor: [
        { floor: ['🍾', '🎊', '🥂', '🎈'], hang: ['🎉', '✨', '🎉', '✨'] },
        { floor: ['🎆', '🕛', '🎇', '🥳'], hang: ['🎈', '🎊', '🎈', '🎊'] },
      ],
      fx: { emojis: ['🎆', '✨', '🎇'], every: 1800, fall: false },
    },
    valentine: {
      name: "Valentine's Day",
      greeting: "💝 Happy Valentine's Day!",
      outfits: [
        { id: 'hearts', name: 'a sweetheart', costume: 'heartBand' },
        { id: 'cupid', name: 'Cupid', costume: 'cupidHalo' },
        { id: 'roses', name: 'a rose', costume: 'roseCrown' },
      ],
      decor: [
        { floor: ['🌹', '💌', '🧸', '💐'], hang: ['💕', '💖', '💕', '💖'] },
        { floor: ['🍫', '💘', '🌷', '💝'], hang: ['💗', '🌹', '💗'] },
      ],
      fx: { emojis: ['💕', '💗'], every: 1800, fall: false },
    },
    easter: {
      name: 'Easter',
      greeting: '🐣 Happy Easter!',
      outfits: [
        { id: 'bunny', name: 'a bunny', costume: 'bunnyEars' },
        { id: 'chick', name: 'a chick', costume: 'eggShell' },
        { id: 'spring', name: 'springtime', costume: 'springCrown' },
      ],
      decor: [
        { floor: ['🌷', '🥚', '🐣', '🌼'], hang: ['🌸', '🥚', '🌸', '🥚'] },
        { floor: ['🐰', '🧺', '🥕', '🌱'], hang: ['🐣', '🌼', '🐣'] },
      ],
      fx: { emojis: ['🌸'], every: 1600, fall: true },
    },
  };

  const NO_OUTFIT = { id: '', name: '', costume: '' };

  /**
   * @param {{
   *   ctx: CanvasRenderingContext2D,
   *   main: () => any,
   *   petPx: (p: any) => number,
   *   view: () => {w: number, h: number},
   *   now: () => number,
   *   emit: (part: object) => void,
   *   config: () => any,
   *   say: (text: string, color: string, ms: number) => void,
   * }} api
   */
  function create(api) {
    const ctx = api.ctx;
    /** @type {{day: string, events: string[], season: string}} */
    let calendar = { day: '', events: [], season: 'spring' };
    /** Events already greeted in this view, so the banner shows once per event. */
    const greeted = new Set();
    /** This window's outfit and decorations for each event, picked the first time it shows. */
    /** @type {Map<string, {outfit: any, decor: any}>} */
    const picked = new Map();
    let nextFx = 0;

    function pickFor(id) {
      let p = picked.get(id);
      if (!p) {
        const ev = EVENTS[id];
        const any = (list) => list[Math.floor(Math.random() * list.length)];
        p = { outfit: any(ev.outfits), decor: any(ev.decor) };
        picked.set(id, p);
      }
      return p;
    }

    /** Events showing right now: none when holidays are switched off. */
    function active() {
      const cfg = api.config();
      return cfg && cfg.holidays !== false
        ? calendar.events.filter((id) => Object.prototype.hasOwnProperty.call(EVENTS, id))
        : [];
    }

    function set(next) {
      calendar = {
        day: String(next.day || ''),
        events: Array.isArray(next.events) ? next.events.map(String) : [],
        season: String(next.season || 'spring'),
      };
    }

    /** The outfit for the first event on, or none. */
    function outfit() {
      const live = active();
      return live.length > 0 ? pickFor(live[0]).outfit : NO_OUTFIT;
    }

    function update(t) {
      const p = api.main();
      if (!p) {
        return;
      }
      const live = active();
      for (const id of live) {
        if (!greeted.has(id)) {
          greeted.add(id);
          const dress = id === live[0] ? outfit() : null;
          api.say(
            `${EVENTS[id].greeting}${dress ? ` ${p.name} is dressed as ${dress.name}` : ''}`,
            '#ff8c2a',
            5000,
          );
        }
      }
      if (live.length === 0 || t < nextFx) {
        return;
      }
      const fx = EVENTS[live[Math.floor(Math.random() * live.length)]].fx;
      nextFx = t + fx.every * (0.6 + Math.random() * 0.8);
      const { w, h } = api.view();
      const size = api.petPx(p);
      const text = fx.emojis[Math.floor(Math.random() * fx.emojis.length)];
      if (fx.fall) {
        api.emit({
          x: Math.random() * w,
          y: -10,
          vx: (Math.random() - 0.5) * 20,
          vy: h * 0.12,
          text,
          size: size * 0.08,
          life: 8,
          spin: (Math.random() - 0.5) * 2,
        });
      } else {
        const fromLeft = Math.random() < 0.5;
        api.emit({
          x: fromLeft ? -10 : w + 10,
          y: Math.random() * Math.max(20, p.y),
          vx: (fromLeft ? 1 : -1) * w * 0.15,
          vy: (Math.random() - 0.5) * 10,
          text,
          size: size * 0.09,
          life: 7,
        });
      }
    }

    /** A garland strung across the panel, sagging in the middle, below the corner buttons. */
    function drawGarland(hang, y, w, em) {
      const sag = em * 0.8;
      ctx.strokeStyle = 'rgba(200, 190, 170, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(w / 2, y + sag * 2, w, y);
      ctx.stroke();
      ctx.font = `${Math.round(em * 0.75)}px sans-serif`;
      ctx.textBaseline = 'top';
      hang.forEach((emoji, i) => {
        const k = (i + 1) / (hang.length + 1);
        // Hung on the curve: the quadratic's height at k is y + 4 * sag * k * (1 - k).
        ctx.fillText(emoji, k * w, y + 4 * sag * k * (1 - k) - em * 0.1);
      });
    }

    /** Decorations along the floor either side of the pet's home spot and a garland, behind the pets. */
    function drawBack() {
      const p = api.main();
      const live = active();
      if (!p || live.length === 0) {
        return;
      }
      const size = api.petPx(p);
      const floor = p.y + size - p.scale;
      const { w } = api.view();
      const em = size * 0.16;
      // Room either side of where the pet sits; tight panels push them to the edges.
      const left = Math.max(em * 1.6, p.x + size * 0.15);
      const right = Math.max(em * 1.6, w - (p.x + size * 0.85));
      const xs = [left * 0.25, left * 0.7, w - right * 0.7, w - right * 0.25];
      ctx.save();
      ctx.textAlign = 'center';
      drawGarland(pickFor(live[0]).decor.hang, 44, w, em);
      ctx.font = `${Math.round(em)}px sans-serif`;
      ctx.textBaseline = 'bottom';
      live.forEach((id, i) => {
        pickFor(id).decor.floor.forEach((emoji, j) => {
          // A second event at once stacks its decorations a little higher so both show.
          ctx.fillText(emoji, xs[j], floor - i * em * 0.9);
        });
      });
      ctx.restore();
    }

    return {
      set,
      update,
      drawBack,
      active,
      season: () => calendar.season,
      /** The costume for the first event on, or '' for none. */
      costume: () => outfit().costume,
      /** The whole outfit: costume, and for some a fur colour, see-through and floating. */
      outfit,
      /** A short line for the pet's tooltip, e.g. "🎃 Halloween (dressed as a ghost)". */
      label: () =>
        active()
          .map(
            (id, i) =>
              `${EVENTS[id].greeting.split(' ')[0]} ${EVENTS[id].name}` +
              (i === 0 ? ` (dressed as ${outfit().name})` : ''),
          )
          .join(' '),
    };
  }

  root.PetEvents = { create, EVENTS };
})(this);
