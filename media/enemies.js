// @ts-check
// Bugs to squash: a failing test run lets a bug in, a failing build a
// gremlin, and waiting a long time for your OK lets a slime creep up. The
// next passing run of the same kind squashes them (the extension pays the XP
// for that; this file only acts it out). Outcomes arrive with every agent
// update, oldest first, and are replayed in order, so a reload ends up with
// the same enemies. webview.js creates one instance.
(function (root) {
  'use strict';

  const KINDS = {
    test: { emoji: '🐛', name: 'bug', why: 'a test run failed' },
    build: { emoji: '👾', name: 'gremlin', why: 'a build failed' },
    wait: { emoji: '🦠', name: 'slime', why: 'it has been waiting for your OK' },
  };

  /** At most this many on screen; more failures just keep the oldest. */
  const MAX = 5;
  /** Unfixed for this long, an enemy wanders off on its own. Nothing is lost. */
  const WANDER_OFF_MS = 8 * 60 * 60 * 1000;
  /** Waiting for the user this long lets a slime in. */
  const SLIME_AFTER_MS = 60 * 1000;
  /** Outcomes older than this are replayed silently (a reload, not news). */
  const NEWS_MS = 15 * 1000;
  const SQUASH_MS = 600;

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
   *   waiting: () => boolean,
   * }} api
   */
  function create(api) {
    const ctx = api.ctx;
    /** @type {Array<{id: string, kind: string, x: number, dir: number, born: number, seed: number, squashAt: number}>} */
    let enemies = [];
    const seen = new Set();
    let waitingSince = 0;

    function on() {
      const cfg = api.config();
      return !!cfg && cfg.enemies !== false;
    }

    function geom() {
      const p = api.main();
      const size = api.petPx(p);
      return { p, size, floor: p.y + size - p.scale };
    }

    function spawn(id, kind, born, news) {
      if (!api.main() || enemies.some((e) => e.id === id)) {
        return;
      }
      if (enemies.filter((e) => !e.squashAt).length >= MAX) {
        return;
      }
      const { w } = api.view();
      const fromLeft = Math.random() < 0.5;
      enemies.push({
        id,
        kind,
        x: news ? (fromLeft ? -10 : w + 10) : 20 + Math.random() * (w - 40),
        dir: fromLeft ? 1 : -1,
        born,
        seed: Math.random() * 10,
        squashAt: 0,
      });
      if (news) {
        api.say(
          `${KINDS[kind].emoji} A ${KINDS[kind].name} got in: ${KINDS[kind].why}!`,
          '#ff7a59',
          3500,
        );
      }
    }

    function squash(kind, t, news) {
      const hit = enemies.filter((e) => e.kind === kind && !e.squashAt);
      if (hit.length === 0) {
        return;
      }
      if (!news) {
        enemies = enemies.filter((e) => !hit.includes(e));
        return;
      }
      const g = geom();
      for (const e of hit) {
        e.squashAt = t;
        api.emit({
          x: e.x,
          y: g.floor - g.size * 0.08,
          text: '💥',
          size: g.size * 0.14,
          life: 0.6,
        });
      }
      const name = KINDS[kind].name;
      api.say(`💥 Squashed ${hit.length} ${name}${hit.length > 1 ? 's' : ''}!`, '#6be675', 3000);
    }

    /**
     * Every agent's recent test and build outcomes, merged. New ones are
     * applied in order; ones seen before are skipped.
     * @param {Array<{id: string, kind: string, ok: boolean, at: number}>} outcomes
     */
    function setOutcomes(outcomes) {
      const t = api.now();
      const fresh = outcomes
        .filter((o) => o && typeof o.id === 'string' && !seen.has(o.id) && KINDS[o.kind])
        .sort((a, b) => a.at - b.at);
      for (const o of fresh) {
        seen.add(o.id);
        if (!on() || t - o.at > WANDER_OFF_MS) {
          continue;
        }
        const news = t - o.at < NEWS_MS;
        if (o.ok) {
          squash(o.kind, t, news);
        } else {
          spawn(o.id, o.kind, o.at, news);
        }
      }
    }

    function update(t, dt) {
      if (!api.main()) {
        return;
      }
      if (!on()) {
        enemies = [];
        return;
      }
      // A slime creeps in during a long wait for the user, and slinks off when it ends.
      if (api.waiting()) {
        waitingSince = waitingSince || t;
        if (t - waitingSince > SLIME_AFTER_MS && !enemies.some((e) => e.kind === 'wait')) {
          spawn(`wait:${waitingSince}`, 'wait', t, true);
        }
      } else {
        waitingSince = 0;
        for (const e of enemies.filter((x) => x.kind === 'wait' && !x.squashAt)) {
          e.squashAt = t;
        }
      }
      const { w } = api.view();
      const g = geom();
      enemies = enemies.filter(
        (e) => t - e.born < WANDER_OFF_MS && (!e.squashAt || t - e.squashAt < SQUASH_MS),
      );
      for (const e of enemies) {
        if (e.squashAt) {
          continue;
        }
        const speed = g.size * (e.kind === 'wait' ? 0.08 : 0.2);
        e.x += e.dir * speed * dt;
        if (e.x < 10 || e.x > w - 10) {
          e.dir = e.x < 10 ? 1 : -1;
        }
        if (Math.random() < dt * 0.3) {
          e.dir = -e.dir;
        }
      }
    }

    function draw(t) {
      if (!api.main() || enemies.length === 0) {
        return;
      }
      const g = geom();
      const s = g.size * 0.13;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = `${Math.round(s)}px sans-serif`;
      for (const e of enemies) {
        const squashed = e.squashAt ? Math.min(1, (t - e.squashAt) / SQUASH_MS) : 0;
        ctx.save();
        ctx.translate(e.x, g.floor);
        ctx.globalAlpha = 1 - squashed;
        ctx.scale(e.dir > 0 ? -1 : 1, 1 - squashed * 0.8);
        const wiggle = squashed ? 0 : Math.sin(t / 90 + e.seed) * 0.12;
        ctx.rotate(wiggle);
        ctx.fillText(KINDS[e.kind].emoji, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }

    /** Tooltip text for an enemy under the mouse, or null. */
    function hover(x, y) {
      if (!api.main()) {
        return null;
      }
      const g = geom();
      const s = g.size * 0.13;
      const e = enemies.find(
        (en) => !en.squashAt && Math.abs(x - en.x) < s * 0.6 && y <= g.floor && y >= g.floor - s,
      );
      if (!e) {
        return null;
      }
      const k = KINDS[e.kind];
      return {
        title: `${k.emoji} A ${k.name}`,
        sub:
          e.kind === 'wait'
            ? 'It leaves as soon as you answer.'
            : `In because ${k.why}. The next passing ${e.kind === 'test' ? 'test run' : 'build'} squashes it.`,
      };
    }

    return {
      setOutcomes,
      update,
      draw,
      hover,
      count: () => enemies.filter((e) => !e.squashAt).length,
    };
  }

  root.PetEnemies = { create, KINDS };
})(this);
