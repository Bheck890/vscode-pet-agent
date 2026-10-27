// @ts-check
// The finish screen: when the last bag unlocks, a party and a panel summing
// up the save, with buttons to copy a summary, save a share card, post
// (only on a click) or start a new save. Only numbers, the pet's name and
// look and the bags ever appear: no prompt text, file or repo names.
// webview.js creates one instance, like the other helpers.
(function (root) {
  'use strict';

  const CARD_W = 1200;
  const CARD_H = 630;

  const n = (v) => Math.round(v).toLocaleString('en-US');

  /**
   * The summary as lines of text, the same on the panel and the card.
   * @param {any} s the FinishSummary
   * @param {{name: string, species: string}} pet
   * @param {boolean} finished
   * @param {number} toyTotal
   */
  function lines(s, pet, finished, toyTotal) {
    return [
      finished ? '🏆 You finished Pet Agents!' : `🐾 ${pet.name}'s save so far`,
      `${pet.name} the ${pet.species} - ${n(s.days)} days - level ${s.level} - ${n(s.xp)} XP`,
      `${n(s.prompts)} prompts - ${n(s.actions)} actions - ${n(s.agentHours)}h with your agent`,
      `🧸 ${n(s.toys)}/${n(toyTotal)} toys - 🏠 ${s.houses} houses, ${s.rooms} rooms - 🏆 ${n(s.records)} weekly records`,
    ];
  }

  /**
   * The badge row: finished, the collection (💯 every toy and shop item, ✅
   * every toy; holiday toys never count), and how many bags.
   */
  function badges(s, finished, complete) {
    return [
      finished ? '🏁' : '',
      complete === 'all' ? '💯' : complete === 'items' ? '✅' : '',
      `🎒 ${s.bags}`,
    ].filter(Boolean);
  }

  /**
   * @param {{
   *   post: (msg: object) => void,
   *   escapeHtml: (s: string) => string,
   *   pet: () => {name: string, species: string},
   *   config: () => any,
   *   toyTotal: () => number,
   *   complete: () => string,
   *   celebrate: (text: string, color: string) => void,
   *   sprite: () => any,
   * }} api
   */
  function create(api) {
    const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
    const panel = byId('finish-panel');
    const body = byId('finish-body');
    const actions = byId('finish-actions');
    /** @type {null | {summary: any, finished: boolean}} */
    let shown = null;

    function render() {
      if (!shown) {
        return;
      }
      const { summary, finished } = shown;
      const [title, ...rest] = lines(summary, api.pet(), finished, api.toyTotal());
      body.innerHTML =
        `<div class="finish-title">${api.escapeHtml(title)}</div>` +
        rest.map((l) => `<div>${api.escapeHtml(l)}</div>`).join('') +
        `<div class="finish-badges">${badges(summary, finished, api.complete()).join(' ')}</div>`;
      const share = api.config() && api.config().shareButtons !== false;
      actions.innerHTML =
        '<button data-finish-action="copy">📋 Copy summary</button>' +
        '<button data-finish-action="card">🖼️ Save share card</button>' +
        (share
          ? '<button data-finish-action="x">Post to X</button>' +
            '<button data-finish-action="bluesky">Post to Bluesky</button>'
          : '') +
        '<button data-finish-action="new">➕ Start a new save</button>' +
        '<button data-finish-action="later">Later</button>';
    }

    /** Draws the 1200x630 share card and returns it as a PNG data URL. */
    function card() {
      if (!shown) {
        return '';
      }
      const { summary, finished } = shown;
      const c = /** @type {HTMLCanvasElement} */ (document.createElement('canvas'));
      c.width = CARD_W;
      c.height = CARD_H;
      const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
      ctx.fillStyle = '#2a2350';
      ctx.fillRect(0, 0, CARD_W, CARD_H);
      ctx.fillStyle = '#3b3270';
      ctx.fillRect(0, CARD_H - 120, CARD_W, 120);
      const sprite = api.sprite();
      if (sprite) {
        // The pet at 8x its 32px art.
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite, 60, CARD_H - 120 - 256, 256, 256);
      }
      const [title, ...rest] = lines(summary, api.pet(), finished, api.toyTotal());
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 56px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(title, 60, 50);
      ctx.fillStyle = '#ffffff';
      ctx.font = '32px sans-serif';
      rest.forEach((l, i) => ctx.fillText(l, 360, 170 + i * 64));
      ctx.font = '56px sans-serif';
      ctx.fillText(badges(summary, finished, api.complete()).join('  '), 360, 380);
      ctx.fillStyle = '#c8c0ff';
      ctx.font = '26px sans-serif';
      ctx.fillText('Pet Agents for VS Code', 360, CARD_H - 78);
      return c.toDataURL('image/png');
    }

    actions.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-finish-action]');
      const what = el && /** @type {HTMLElement} */ (el).dataset.finishAction;
      const toyTotal = api.toyTotal();
      switch (what) {
        case 'copy':
          api.post({ command: 'share-copy', toyTotal });
          break;
        case 'card':
          api.post({ command: 'share-card', png: card() });
          break;
        case 'x':
        case 'bluesky':
          api.post({ command: 'share-post', site: what, toyTotal });
          break;
        case 'new':
          panel.hidden = true;
          api.post({ command: 'new-save' });
          break;
        case 'later':
          panel.hidden = true;
          break;
      }
    });

    return {
      /** Shows the screen; a finished save gets a party too. */
      show(summary, finished) {
        shown = { summary, finished };
        render();
        panel.hidden = false;
        if (finished) {
          api.celebrate('🏆 You finished Pet Agents! Every bag is open', '#ffd23f');
        }
      },
      isOpen: () => !panel.hidden,
      card,
    };
  }

  root.PetFinish = { create, lines, badges };
})(this);
