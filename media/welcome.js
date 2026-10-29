// @ts-check
// The welcome screen: a new save (a fresh install, a new save or starting
// over) opens with it to pick the pet's species, name and look. Each pick
// is saved as a setting straight away, like the Customize Pet menu, so the
// pet redraws live. webview.js creates one instance, like the other helpers.
(function (root) {
  'use strict';

  const SPECIES_EMOJI = { cat: '🐱', dog: '🐶', bird: '🐦', fox: '🦊' };
  const PATTERN_EMOJI = {
    none: '⬜',
    spots: '🐆',
    stripes: '🐯',
    socks: '🧦',
    mask: '🦝',
    patch: '🏴',
  };
  const ACCESSORY_EMOJI = {
    none: '🚫',
    bow: '🎀',
    flower: '🌸',
    crown: '👑',
    beanie: '🧢',
    headphones: '🎧',
    glasses: '👓',
    sunglasses: '🕶️',
    bandana: '🔺',
    scarf: '🧣',
    collar: '🔔',
  };
  const LOOK_KEYS = ['species', 'name', 'color', 'eyeColor', 'pattern', 'accessory'];

  const title = (s) => s[0].toUpperCase() + s.slice(1);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  /**
   * @param {{
   *   post: (msg: object) => void,
   *   escapeHtml: (s: string) => string,
   *   config: () => any,
   *   spriteUrl: (look: any) => string,
   *   celebrate: (text: string, color: string) => void,
   * }} api
   */
  function create(api) {
    const { escapeHtml } = api;
    const Art = root.PetArt;
    const panel = /** @type {HTMLElement} */ (document.getElementById('welcome-panel'));
    const patterns = Art.PATTERNS;
    const accessories = ['none', ...Object.keys(Art.ACCESSORIES)];
    /** @type {{colors: Array<{label: string, color: string}>, eyes: Array<{label: string, color: string}>, names: Record<string, string>}} */
    let presets = { colors: [], eyes: [], names: {} };
    /** The look being picked; '' is the default (and for the name, the species' own). */
    let look = /** @type {Record<string, string>} */ ({});

    const defaultName = () => presets.names[look.species] || 'Pet';

    function set(key, value) {
      look[key] = value;
      api.post({ command: 'setting', key, value });
    }

    function choices(key, options) {
      return (
        '<div class="food-choices">' +
        options
          .map(
            ([value, label, extra]) =>
              `<button data-welcome="${key}" data-value="${escapeHtml(value)}"` +
              `${(look[key] || '') === value ? ' class="active"' : ''}${extra || ''}>${label}</button>`,
          )
          .join('') +
        '</div>'
      );
    }

    /** Colour presets as swatches; the first is the default. */
    function swatches(key, list, defaultLabel) {
      return choices(key, [
        ['', `✨ ${defaultLabel}`],
        ...list
          .filter((p) => p.color)
          .map((p) => [
            p.color,
            `<span class="swatch" style="background:${escapeHtml(p.color)}"></span>`,
            ` title="${escapeHtml(p.label)}"`,
          ]),
      ]);
    }

    function render() {
      const name = look.name || defaultName();
      const img = api.spriteUrl({ ...api.config(), ...look });
      panel.innerHTML =
        '<div class="panel-head"><span>👋 Welcome to Pet Agents!</span></div>' +
        '<div class="panel-note">Your pet acts out what your AI agent is doing, and grows as ' +
        'you work together. Pick your pet: it starts at level 1.</div>' +
        `<div class="welcome-pet">${img ? `<img src="${img}" alt="" />` : ''}` +
        `<b>${escapeHtml(name)}</b> the ${escapeHtml(look.species)}</div>` +
        '<div class="group">Species</div>' +
        choices(
          'species',
          Art.speciesIds.map((s) => [s, `${SPECIES_EMOJI[s] || '🐾'} ${title(s)}`]),
        ) +
        '<div class="group">Name</div>' +
        `<input id="welcome-name" maxlength="40" placeholder="${escapeHtml(defaultName())}"` +
        ` value="${escapeHtml(look.name)}" />` +
        '<div class="group">Fur colour</div>' +
        swatches('color', presets.colors, 'Default') +
        '<div class="group">Eyes</div>' +
        swatches('eyeColor', presets.eyes, 'Black') +
        '<div class="group">Pattern</div>' +
        choices(
          'pattern',
          patterns.map((p) => [p === 'none' ? '' : p, `${PATTERN_EMOJI[p] || ''} ${title(p)}`]),
        ) +
        '<div class="group">Accessory</div>' +
        choices(
          'accessory',
          accessories.map((a) => [
            a === 'none' ? '' : a,
            `${ACCESSORY_EMOJI[a] || ''} ${title(a)}`,
          ]),
        ) +
        '<div class="food-choices welcome-actions">' +
        '<button data-welcome-action="random">🎲 Surprise me</button>' +
        '<button data-welcome-action="more" title="Every option, in the Customize Pet menu">' +
        '⚙️ More options...</button>' +
        `<button data-welcome-action="done" class="go">✨ Start with ${escapeHtml(name)}</button>` +
        '</div>';
    }

    panel.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const choice = /** @type {HTMLElement | null} */ (target.closest('[data-welcome]'));
      if (choice) {
        const key = choice.dataset.welcome || '';
        const value = choice.dataset.value || '';
        if (key === 'species' && value !== look.species) {
          // A default name follows the species; one the user typed stays.
          set('species', value);
          if (!look.name) {
            set('name', '');
          }
        } else if (key !== 'species') {
          set(key, value);
        }
        render();
        return;
      }
      const action = /** @type {HTMLElement | null} */ (target.closest('[data-welcome-action]'));
      switch (action && action.dataset.welcomeAction) {
        case 'random':
          set('color', pick(presets.colors).color);
          set('eyeColor', pick(presets.eyes).color);
          set('pattern', pick(patterns).replace('none', ''));
          set('accessory', pick(accessories).replace('none', ''));
          render();
          break;
        case 'more':
          api.post({ command: 'customize' });
          break;
        case 'done':
          panel.hidden = true;
          api.post({ command: 'welcome-done' });
          api.celebrate(`🎉 Say hi to ${look.name || defaultName()}!`, '#ffd23f');
          break;
      }
    });

    panel.addEventListener('change', (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      if (input.id === 'welcome-name') {
        const typed = input.value.trim();
        set('name', typed === defaultName() ? '' : typed);
        render();
      }
    });

    return {
      /** Opens the screen on the current look, with the extension's colour presets and names. */
      show(msg) {
        presets = {
          colors: Array.isArray(msg.colors) ? msg.colors : [],
          eyes: Array.isArray(msg.eyes) ? msg.eyes : [],
          names: msg.names && typeof msg.names === 'object' ? msg.names : {},
        };
        const config = api.config() || {};
        look = Object.fromEntries(LOOK_KEYS.map((k) => [k, String(config[k] || '')]));
        if (!Art.SPECIES[look.species]) {
          look.species = Art.speciesIds[0];
        }
        if (look.name === presets.names[look.species]) {
          look.name = '';
        }
        render();
        panel.hidden = false;
      },
      /** The look changed elsewhere (the Customize Pet menu): follow it. */
      sync() {
        if (panel.hidden) {
          return;
        }
        const config = api.config() || {};
        for (const k of LOOK_KEYS) {
          look[k] = String(config[k] || '');
        }
        if (look.name === presets.names[look.species]) {
          look.name = '';
        }
        render();
      },
      isOpen: () => !panel.hidden,
    };
  }

  root.PetWelcome = { create };
})(this);
