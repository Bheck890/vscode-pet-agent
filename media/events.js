// @ts-check
// Holiday events: what the scene wears while one is on. The extension works
// out which events are running from the local date (src/calendar.ts) and
// sends them; this file dresses the pet (a costume from pets.js COSTUMES),
// puts decorations along the floor and adds a little weather. Event toys
// live in scene.js (TOYS with an `event`). webview.js creates one instance.
(function (root) {
  'use strict';

  /**
   * decor: four emojis along the floor, two either side of the pet's home
   * spot. fx: ambient particles.
   */
  const EVENTS = {
    halloween: {
      name: 'Halloween',
      greeting: '🎃 Happy Halloween!',
      costume: 'witchHat',
      decor: ['🎃', '🕸️', '🍬', '👻'],
      fx: { emojis: ['🦇'], every: 2600, fall: false },
    },
    thanksgiving: {
      name: 'Thanksgiving',
      greeting: '🦃 Happy Thanksgiving!',
      costume: 'pilgrimHat',
      decor: ['🌽', '🍂', '🥧', '🍁'],
      fx: { emojis: ['🍂', '🍁'], every: 1500, fall: true },
    },
    christmas: {
      name: 'Christmas',
      greeting: '🎄 Merry Christmas!',
      costume: 'santaHat',
      decor: ['🎄', '🎁', '🎁', '🕯️'],
      fx: { emojis: ['❄️'], every: 700, fall: true },
    },
    newyear: {
      name: 'New Year',
      greeting: '🎆 Happy New Year!',
      costume: 'partyCone',
      decor: ['🍾', '🎊', '🥂', '🎈'],
      fx: { emojis: ['🎆', '✨', '🎇'], every: 1800, fall: false },
    },
    valentine: {
      name: "Valentine's Day",
      greeting: "💝 Happy Valentine's Day!",
      costume: 'heartBand',
      decor: ['🌹', '💌', '🧸', '💐'],
      fx: { emojis: ['💕', '💗'], every: 1800, fall: false },
    },
    easter: {
      name: 'Easter',
      greeting: '🐣 Happy Easter!',
      costume: 'bunnyEars',
      decor: ['🌷', '🥚', '🐣', '🌼'],
      fx: { emojis: ['🌸'], every: 1600, fall: true },
    },
  };

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
    let nextFx = 0;

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

    function update(t) {
      const p = api.main();
      if (!p) {
        return;
      }
      const live = active();
      for (const id of live) {
        if (!greeted.has(id)) {
          greeted.add(id);
          api.say(EVENTS[id].greeting, '#ff8c2a', 5000);
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

    /** Decorations along the floor either side of the pet's home spot, behind the pets. */
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
      ctx.font = `${Math.round(em)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      live.forEach((id, i) => {
        EVENTS[id].decor.forEach((emoji, j) => {
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
      costume: () => {
        const live = active();
        return live.length > 0 ? EVENTS[live[0]].costume : '';
      },
      /** A short line for the pet's tooltip, e.g. "🎃 Halloween". */
      label: () =>
        active()
          .map((id) => `${EVENTS[id].greeting.split(' ')[0]} ${EVENTS[id].name}`)
          .join(' '),
    };
  }

  root.PetEvents = { create, EVENTS };
})(this);
