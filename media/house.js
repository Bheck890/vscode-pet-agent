// @ts-check
// The pet's house: a room drawn behind the pet (wall, floor, and a window
// showing the season) with furniture you unlock by levelling up and place
// yourself. The layout is saved in the extension so every window shows the
// same room. webview.js creates one instance; panels.js lists the furniture.
(function (root) {
  'use strict';

  /** `level` unlocks it (everything is open with levels switched off). */
  const FURNITURE = [
    { id: 'bed', emoji: '🛏️', name: 'bed', level: 1, place: 'floor', nap: true },
    { id: 'plant', emoji: '🪴', name: 'house plant', level: 2, place: 'floor' },
    { id: 'clock', emoji: '🕰️', name: 'clock', level: 3, place: 'wall' },
    { id: 'painting', emoji: '🖼️', name: 'painting', level: 4, place: 'wall' },
    { id: 'books', emoji: '📚', name: 'bookshelf', level: 5, place: 'floor' },
    { id: 'sofa', emoji: '🛋️', name: 'sofa', level: 6, place: 'floor' },
    { id: 'tv', emoji: '📺', name: 'TV', level: 7, place: 'floor' },
    { id: 'lamp', emoji: '💡', name: 'lamp', level: 8, place: 'wall' },
    { id: 'chair', emoji: '🪑', name: 'chair', level: 9, place: 'floor' },
    { id: 'piano', emoji: '🎹', name: 'piano', level: 10, place: 'floor' },
    { id: 'fish', emoji: '🐠', name: 'fish tank', level: 12, place: 'floor' },
    { id: 'trophy', emoji: '🏆', name: 'trophy', level: 14, place: 'floor' },
    { id: 'telescope', emoji: '🔭', name: 'telescope', level: 16, place: 'floor' },
    { id: 'radio', emoji: '📻', name: 'radio', level: 18, place: 'floor' },
    { id: 'disco', emoji: '🪩', name: 'disco ball', level: 20, place: 'wall' },
  ];

  const THEMES = [
    { id: 'cozy', name: 'Cozy', level: 1, wall: '#3b3046', trim: '#4d3f5c', floor: '#5a4232' },
    { id: 'mint', name: 'Mint', level: 4, wall: '#2c4a44', trim: '#37605a', floor: '#6b5440' },
    { id: 'night', name: 'Night', level: 8, wall: '#1d2240', trim: '#2a3160', floor: '#3a3048' },
    { id: 'candy', name: 'Candy', level: 12, wall: '#5a2f4f', trim: '#74406a', floor: '#7a5a48' },
    { id: 'space', name: 'Space', level: 16, wall: '#0f1226', trim: '#1c2148', floor: '#2b2b3a' },
  ];

  const SKY = {
    winter: { sky: '#9db7d6', dots: '#ffffff' },
    spring: { sky: '#8fd0ff', dots: '#ffb7d5' },
    summer: { sky: '#5fb8ff', dots: '' },
    autumn: { sky: '#e8b07a', dots: '#d8662b' },
  };

  /**
   * @param {{
   *   ctx: CanvasRenderingContext2D,
   *   main: () => any,
   *   petPx: (p: any) => number,
   *   view: () => {w: number, h: number},
   *   now: () => number,
   *   config: () => any,
   *   season: () => string,
   *   save: (layout: object) => void,
   * }} api
   */
  function create(api) {
    const ctx = api.ctx;
    let open = false;
    let level = 1;
    /** @type {{items: Array<{id: string, x: number, y: number, at: number, removed?: boolean}>, theme: string, themeAt: number}} */
    let layout = { items: [], theme: 'cozy', themeAt: 0 };
    /** @type {null | {id: string, dx: number, dy: number}} */
    let drag = null;

    function levelsOn() {
      const cfg = api.config();
      return !cfg || cfg.levels !== false;
    }

    function unlocked(thing) {
      return !levelsOn() || thing.level <= level;
    }

    function placed() {
      return layout.items.filter(
        (i) => !i.removed && FURNITURE.some((f) => f.id === i.id && unlocked(f)),
      );
    }

    function theme() {
      const t = THEMES.find((x) => x.id === layout.theme);
      return t && unlocked(t) ? t : THEMES[0];
    }

    function geom() {
      const p = api.main();
      const size = api.petPx(p);
      const { w, h } = api.view();
      const floor = p.y + size - p.scale;
      return { p, size, w, h, floor, wallTop: 0, wallH: floor - size * 0.05 };
    }

    function itemPos(item, g) {
      const def = FURNITURE.find((f) => f.id === item.id);
      if (def && def.place === 'wall') {
        // The top of the wall is under the corner buttons and the furniture bar.
        return { x: item.x * g.w, y: g.wallH * (0.45 + 0.4 * item.y), s: g.size * 0.22 };
      }
      return { x: item.x * g.w, y: g.floor, s: g.size * 0.34 };
    }

    function persist() {
      api.save(layout);
    }

    function setLayout(next) {
      if (!drag && next && Array.isArray(next.items)) {
        layout = next;
      }
    }

    /** Puts a piece in the room (or takes it out again). */
    function toggle(id) {
      const def = FURNITURE.find((f) => f.id === id);
      if (!def || !unlocked(def)) {
        return;
      }
      const t = api.now();
      const had = layout.items.find((i) => i.id === id);
      const showing = had && !had.removed;
      const others = layout.items.filter((i) => i.id !== id);
      if (showing) {
        layout = { ...layout, items: [...others, { ...had, removed: true, at: t }] };
      } else {
        // Somewhere along the floor (or wall) away from the middle, where the pet sits.
        const side = placed().length % 2 === 0 ? 0.15 : 0.85;
        const x = Math.min(0.95, Math.max(0.05, side + (Math.random() - 0.5) * 0.2));
        layout = { ...layout, items: [...others, { id, x, y: Math.random(), at: t }] };
      }
      persist();
    }

    function setTheme(id) {
      const t = THEMES.find((x) => x.id === id);
      if (t && unlocked(t)) {
        layout = { ...layout, theme: id, themeAt: api.now() };
        persist();
      }
    }

    function drawWindow(g) {
      const ww = Math.min(g.w * 0.26, g.size * 0.75);
      const wh = Math.min(g.wallH * 0.4, ww * 0.8);
      const x = g.w * 0.06;
      const y = g.wallH * 0.38;
      const sky = SKY[api.season()] || SKY.spring;
      ctx.fillStyle = sky.sky;
      ctx.fillRect(x, y, ww, wh);
      if (sky.dots) {
        ctx.fillStyle = sky.dots;
        const t = api.now() / 1000;
        for (let i = 0; i < 9; i++) {
          const dx = ((i * 37 + t * 8) % ww) | 0;
          const dy = ((i * 53 + t * (12 + i)) % wh) | 0;
          ctx.fillRect(x + dx, y + dy, 2, 2);
        }
      } else {
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(x + ww * 0.72, y + wh * 0.32, Math.max(3, ww * 0.1), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#d9c7a8';
      ctx.lineWidth = Math.max(2, ww * 0.04);
      ctx.strokeRect(x, y, ww, wh);
      ctx.beginPath();
      ctx.moveTo(x + ww / 2, y);
      ctx.lineTo(x + ww / 2, y + wh);
      ctx.moveTo(x, y + wh / 2);
      ctx.lineTo(x + ww, y + wh / 2);
      ctx.stroke();
    }

    /** The room and its furniture, behind everything else. */
    function drawBack() {
      if (!open || !api.main()) {
        return;
      }
      const g = geom();
      const th = theme();
      ctx.save();
      ctx.fillStyle = th.wall;
      ctx.fillRect(0, 0, g.w, g.wallH);
      ctx.fillStyle = th.trim;
      ctx.fillRect(0, g.wallH - g.size * 0.04, g.w, g.size * 0.04);
      ctx.fillStyle = th.floor;
      ctx.fillRect(0, g.wallH, g.w, g.h - g.wallH);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#000000';
      for (let x = 0; x < g.w; x += g.size * 0.35) {
        ctx.fillRect(x, g.wallH, 1, g.h - g.wallH);
      }
      ctx.globalAlpha = 1;
      drawWindow(g);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const item of placed()) {
        const def = FURNITURE.find((f) => f.id === item.id);
        const at = itemPos(item, g);
        ctx.font = `${Math.round(at.s)}px sans-serif`;
        ctx.globalAlpha = drag && drag.id === item.id ? 0.7 : 1;
        ctx.fillText(def.emoji, at.x, at.y);
      }
      ctx.restore();
    }

    function itemAt(x, y) {
      if (!open || !api.main()) {
        return null;
      }
      const g = geom();
      // Topmost first: wall items, then floor items drawn later.
      return (
        [...placed()].reverse().find((item) => {
          const at = itemPos(item, g);
          return Math.abs(x - at.x) < at.s * 0.55 && y <= at.y && y >= at.y - at.s;
        }) || null
      );
    }

    function pointerDown(x, y) {
      const item = itemAt(x, y);
      if (!item) {
        return false;
      }
      const g = geom();
      const at = itemPos(item, g);
      drag = { id: item.id, dx: x - at.x, dy: y - at.y };
      return true;
    }

    function pointerMove(x, y) {
      if (!drag) {
        return;
      }
      const g = geom();
      const item = layout.items.find((i) => i.id === drag.id);
      const def = FURNITURE.find((f) => f.id === drag.id);
      if (!item || !def) {
        return;
      }
      item.x = Math.min(0.97, Math.max(0.03, (x - drag.dx) / g.w));
      if (def.place === 'wall') {
        item.y = Math.min(1, Math.max(0, ((y - drag.dy) / g.wallH - 0.45) / 0.4));
      }
    }

    function pointerUp() {
      if (!drag) {
        return false;
      }
      const item = layout.items.find((i) => i.id === drag.id);
      if (item) {
        item.at = api.now();
      }
      drag = null;
      persist();
      return true;
    }

    /** Where a napping pet heads: its bed, if there is one. Otherwise null. */
    function target() {
      if (!open || !api.main()) {
        return null;
      }
      const bed = placed().find((i) => FURNITURE.find((f) => f.id === i.id && f.nap));
      return bed ? bed.x * api.view().w : null;
    }

    return {
      isOpen: () => open,
      setOpen: (on) => {
        open = !!on && api.config().house !== false;
        drag = null;
      },
      setLayout,
      setLevel: (n) => {
        level = Math.max(1, Number(n) || 1);
      },
      toggle,
      setTheme,
      drawBack,
      pointerDown,
      pointerMove,
      pointerUp,
      target,
      /** Tooltip for furniture under the mouse, or null. */
      hover: (x, y) => {
        const item = itemAt(x, y);
        const def = item && FURNITURE.find((f) => f.id === item.id);
        return def ? { title: `${def.emoji} ${def.name}`, sub: 'Drag to move it' } : null;
      },
      /** The catalogue for the panel: every piece and theme, with what is unlocked and placed. */
      catalogue: () => ({
        level,
        levelsOn: levelsOn(),
        furniture: FURNITURE.map((f) => ({
          ...f,
          unlocked: unlocked(f),
          placed: placed().some((i) => i.id === f.id),
        })),
        themes: THEMES.map((t) => ({ ...t, unlocked: unlocked(t), active: theme().id === t.id })),
      }),
    };
  }

  root.PetHouse = { create, FURNITURE, THEMES };
})(this);
