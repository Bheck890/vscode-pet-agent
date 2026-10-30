// @ts-check
// The welcome screen: a new save (a fresh install, a new save or starting
// over) opens with it to pick the pet's species, name and look, then a short
// tour of the corner buttons. Both can be skipped, and the tour replayed
// from the settings panel. Each pick is saved as a setting straight away,
// like the Customize Pet menu, so the pet redraws live. webview.js creates
// one instance, like the other helpers.
(function (root) {
  'use strict';

  const SPECIES_EMOJI = {
    cat: '🐱',
    dog: '🐶',
    bird: '🐦',
    fox: '🦊',
    wizard: '🧙',
    robot: '🤖',
    monitor: '🖥️',
    floppy: '💾',
  };
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

  /**
   * The tour: each stop lights up its corner button (none for the first).
   * Helpers skip the pet-only stops and get their own words where they differ.
   */
  const TOUR = [
    {
      target: '',
      title: '🤖 Your agent, acted out',
      text: (name) =>
        `${name} acts out what your AI coding agent is doing: reading, writing, running tests, ` +
        'waiting for you. Helpers it sends off turn up as mini pets. Claude Code works straight away.',
    },
    {
      target: 'care-toggle',
      petOnly: true,
      title: '🐾 Look after it',
      text: () =>
        'Feed it, give it a treat, play fetch or give it a bath while your agent is idle. ' +
        "If you're away, visitors drop by to help.",
    },
    {
      target: 'bag-toggle',
      petOnly: true,
      title: '🎒 Toys',
      text: () =>
        'Toys turn up as you work. Take them out to play, and trade spares in the shop ' +
        'for new animations and food.',
    },
    {
      target: 'trophy-toggle',
      title: '🏆 Levels',
      text: (_name, helper) =>
        'You start at level 1 with 0 XP. Finished prompts, passing tests and builds earn XP, ' +
        'and weekly challenges and prompt records earn more' +
        (helper ? '.' : ', and levelling up opens new bags.'),
    },
    {
      target: 'house-toggle',
      title: '🏠 Home',
      text: (_name, helper) =>
        helper
          ? 'Helpers have no house: 🏠 lists your old saves and friends, and 🔄 Start over ' +
            'gives you a fresh helper.'
          : 'Furnish its houses room by room. The 👤 Profiles tab keeps your old saves, ' +
            'and 🔄 Start over gives you a fresh pet.',
    },
    {
      target: 'settings-toggle',
      title: '⚙️ Settings',
      text: (_name, helper) =>
        'Switch any feature off, set up peon-ping for other agents (Cursor, Codex...), ' +
        `switch to your ${helper ? 'pet' : 'helper'}, and replay this tour.`,
    },
  ];

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
    /** -1 while picking the pet, else the tour stop being shown. */
    let stop = -1;

    const defaultName = () => presets.names[look.species] || 'Pet';
    const helper = () => (api.config() || {}).companion === 'helper';
    /** The species to pick from: pets, or helpers, never both. */
    const kinds = () => Art.speciesIds.filter((s) => !!Art.SPECIES[s].helper === helper());
    const tour = () => TOUR.filter((s) => !(helper() && s.petOnly));

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

    function glow(on) {
      const id = stop >= 0 ? tour()[stop].target : '';
      const el = id && document.getElementById(id);
      if (el) {
        el.classList.toggle('tour', on);
      }
    }

    function go(next) {
      glow(false);
      stop = next;
      glow(true);
      render();
    }

    function finish() {
      glow(false);
      stop = -1;
      panel.hidden = true;
      api.post({ command: 'welcome-done' });
      api.celebrate(`🎉 Say hi to ${look.name || defaultName()}!`, '#ffd23f');
    }

    function renderTour() {
      const stops = tour();
      const s = stops[stop];
      const last = stop === stops.length - 1;
      panel.innerHTML =
        `<div class="panel-head"><span>${s.title}</span>` +
        `<span class="dim">${stop + 1} / ${stops.length}</span></div>` +
        `<div class="tour-text">${escapeHtml(s.text(look.name || defaultName(), helper()))}</div>` +
        '<div class="food-choices welcome-actions">' +
        '<button data-welcome-action="skip-tour">Skip tutorial</button>' +
        (stop > 0 ? '<button data-welcome-action="back">◀ Back</button>' : '') +
        (last
          ? `<button data-welcome-action="finish" class="go">✨ Let's go!</button>`
          : '<button data-welcome-action="next" class="go">Next ▶</button>') +
        '</div>';
    }

    function render() {
      if (stop >= 0) {
        renderTour();
        return;
      }
      const name = look.name || defaultName();
      const img = api.spriteUrl({ ...api.config(), ...look });
      panel.innerHTML =
        '<div class="panel-head"><span>👋 Welcome to Pet Agents!</span></div>' +
        '<div class="food-choices">' +
        `<button data-welcome-action="mode-pet"${helper() ? '' : ' class="active"'}` +
        ' title="A pet to look after, with toys, bags and a house">🐾 Pet</button>' +
        `<button data-welcome-action="mode-helper"${helper() ? ' class="active"' : ''}` +
        ' title="A retro helper: no care, bags or house">🧙 Helper</button></div>' +
        (helper()
          ? '<div class="panel-note">Your helper acts out what your AI agent is doing. Helpers ' +
            'just help: no feeding, toys or house. Pick yours: it starts at level 1.</div>'
          : '<div class="panel-note">Your pet acts out what your AI agent is doing, and grows as ' +
            'you work together. Pick your pet: it starts at level 1.</div>') +
        `<div class="welcome-pet">${img ? `<img src="${img}" alt="" />` : ''}` +
        `<b>${escapeHtml(name)}</b> the ${escapeHtml(look.species)}</div>` +
        '<div class="group">Species</div>' +
        choices(
          'species',
          kinds().map((s) => [s, `${SPECIES_EMOJI[s] || '🐾'} ${title(s)}`]),
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
        '<button data-welcome-action="skip" title="Keep this look; change it any time from Customize Pet">' +
        'Skip</button>' +
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
        case 'mode-pet':
        case 'mode-helper': {
          // The other one has its own save: the view switches to it and welcomes it there.
          const mode = action && action.dataset.welcomeAction === 'mode-helper' ? 'helper' : 'pet';
          if (mode !== (api.config() || {}).companion) {
            api.post({ command: 'setting', key: 'companion', value: mode });
          }
          break;
        }
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
        case 'skip':
        case 'done':
          go(0);
          break;
        case 'next':
          go(Math.min(tour().length - 1, stop + 1));
          break;
        case 'back':
          go(Math.max(0, stop - 1));
          break;
        case 'skip-tour':
        case 'finish':
          finish();
          break;
      }
    });

    const replay = document.getElementById('replay-tour');
    if (replay) {
      replay.addEventListener('click', () => {
        go(0);
        panel.hidden = false;
      });
    }

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
        if (!kinds().includes(look.species)) {
          look.species = kinds()[0];
        }
        if (look.name === presets.names[look.species]) {
          look.name = '';
        }
        glow(false);
        stop = -1;
        render();
        panel.hidden = false;
      },
      /** The look changed elsewhere (the Customize Pet menu): follow it. */
      sync() {
        if (panel.hidden || stop >= 0) {
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
