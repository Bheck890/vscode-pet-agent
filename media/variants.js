// @ts-check
// Animation variants per agent state, and the things a pet gets up to on its
// own when idle. Pure data plus pickers, no DOM access, so tests can load it
// via vm. The first variant of every state is the classic look.
//
// Variant fields (all optional, they override STATES in webview.js):
//   label   text under the pet        prop    pixel prop from pets.js
//   motion  body motion (motionFor)   eyes / mouth / bubble / emojis / wag
//   fx      ambient particles         scene   scenery drawn by scene.js
//   roam    'pace' | 'zoomies' | 'fly' | 'chase'  moves the pet around
//   lift    raise the pet (art px)    paws    'typing' draws tapping paws
//   species only for these species    weight  relative pick chance (1)
(function (root) {
  'use strict';

  const NONE = { prop: null, bubble: null };

  const VARIANTS = {
    sleeping: [
      { id: 'classic', weight: 2 },
      { id: 'side', label: 'napping sideways', ...NONE, motion: 'sideSleep', eyes: 'closed' },
      {
        id: 'roll',
        label: 'napping and rolling over',
        ...NONE,
        motion: 'rollSleep',
        eyes: 'closed',
      },
      {
        id: 'belly',
        label: 'napping belly-up',
        ...NONE,
        motion: 'bellyUp',
        eyes: 'closed',
        mouth: 'tongue',
        wag: 0.8,
      },
      { id: 'loaf', label: 'napping as a loaf', ...NONE, motion: 'loaf', eyes: 'closed' },
      { id: 'box', label: 'napping in a box', ...NONE, scene: 'box', eyes: 'closed' },
      {
        id: 'bed',
        label: 'napping in bed',
        motion: 'sideSleep',
        scene: 'bed',
        eyes: 'closed',
        lift: 3,
      },
      {
        id: 'perch',
        label: 'napping on a perch',
        ...NONE,
        scene: 'perch',
        eyes: 'closed',
        lift: 4,
        species: ['bird'],
        weight: 2,
      },
    ],
    waking: [
      { id: 'classic' },
      { id: 'shake', label: 'shaking off sleep', motion: 'shake', eyes: 'closed', fx: 'sparkle' },
      { id: 'spring', label: 'springing awake', motion: 'hop', eyes: 'wide', mouth: 'open' },
    ],
    thinking: [
      { id: 'classic', weight: 2 },
      {
        id: 'bulb',
        label: 'having an idea',
        bubble: null,
        prop: 'bulb',
        eyes: 'wide',
        fx: 'glow',
      },
      { id: 'pace', label: 'pacing and thinking', roam: 'pace', motion: 'walk' },
      {
        id: 'coffee',
        label: 'thinking over coffee',
        bubble: null,
        prop: 'mug',
        motion: 'sip',
        eyes: 'happy',
        fx: 'steam',
      },
      {
        id: 'meditate',
        label: 'meditating on it',
        bubble: null,
        motion: 'levitate',
        eyes: 'closed',
        mouth: 'smile',
        emojis: ['🧘', '✨', '🌀', '☯️'],
        fx: 'sparkle',
      },
      {
        id: 'chalk',
        label: 'doing the maths',
        bubble: null,
        scene: 'chalkboard',
        eyes: 'focus',
        motion: 'scribble',
      },
    ],
    reading: [
      { id: 'classic', weight: 2 },
      { id: 'book', label: 'reading a book', prop: 'book', eyes: 'lookDown', fx: 'pages' },
      {
        id: 'sniff',
        label: 'sniffing out clues',
        prop: null,
        roam: 'pace',
        motion: 'sniff',
        eyes: 'lookDown',
        fx: 'paws',
      },
      {
        id: 'stack',
        label: 'buried in books',
        prop: 'book',
        scene: 'books',
        eyes: 'lookDown',
      },
      { id: 'scroll', label: 'reading the scrolls', prop: 'scroll', eyes: 'lookDown' },
    ],
    writing: [
      { id: 'classic', weight: 2, paws: 'typing' },
      {
        id: 'keyboard',
        label: 'hammering the keyboard',
        prop: 'keyboard',
        paws: 'typing',
        fx: 'code',
      },
      { id: 'notepad', label: 'scribbling notes', prop: 'notepad', motion: 'scribble' },
      {
        id: 'hacker',
        label: 'hacking away',
        paws: 'typing',
        fx: 'matrix',
        emojis: ['💻', '🕶️', '⌨️', '🟩'],
      },
    ],
    running: [
      { id: 'classic', weight: 2 },
      { id: 'wheel', label: 'running in the wheel', scene: 'wheel', fx: null },
      {
        id: 'tinker',
        label: 'tinkering',
        prop: 'wrench',
        motion: 'tinker',
        eyes: 'focus',
        fx: 'sparks',
      },
      { id: 'zoomies', label: 'doing zoomies', roam: 'zoomies', fx: 'dust' },
      {
        id: 'flyLaps',
        label: 'flying laps',
        roam: 'fly',
        motion: 'fly',
        wag: 14,
        fx: null,
        species: ['bird'],
        weight: 3,
      },
    ],
    testing: [
      { id: 'classic', weight: 2 },
      {
        id: 'popcorn',
        label: 'watching the tests with popcorn',
        eyes: 'wide',
        mouth: 'open',
        fx: 'popcorn',
      },
      {
        id: 'nervous',
        label: 'nervously watching the tests',
        motion: 'jitter',
        eyes: 'wide',
        mouth: 'flat',
        fx: 'sweatDrop',
      },
      { id: 'pace', label: 'pacing by the tests', roam: 'pace', motion: 'walk' },
      {
        id: 'crossed',
        label: 'fingers crossed',
        eyes: 'closed',
        mouth: 'flat',
        motion: 'tilt',
        emojis: ['🤞', '🍀', '🙏', '⏳'],
      },
    ],
    browsing: [
      { id: 'classic', weight: 2 },
      { id: 'telescope', label: 'scoping out the web', prop: 'telescope', eyes: 'focus' },
      {
        id: 'surf',
        label: 'surfing the web',
        prop: null,
        scene: 'surfboard',
        motion: 'surf',
        eyes: 'happy',
        mouth: 'open',
        fx: 'splash',
        emojis: ['🌊', '🏄', '🌐', '🔗'],
        lift: 2,
      },
      {
        id: 'dish',
        label: 'scanning the airwaves',
        prop: null,
        scene: 'dish',
        eyes: 'focus',
      },
      {
        id: 'scout',
        label: 'scouting from the sky',
        prop: null,
        roam: 'fly',
        motion: 'fly',
        wag: 14,
        species: ['bird'],
        weight: 3,
      },
    ],
    delegating: [
      { id: 'classic', weight: 2 },
      { id: 'megaphone', label: 'giving orders', prop: 'megaphone', fx: 'shout' },
      {
        id: 'conductor',
        label: 'conducting the team',
        prop: 'baton',
        motion: 'conduct',
        eyes: 'happy',
        fx: 'notes',
      },
    ],
    waiting: [
      { id: 'classic', weight: 2 },
      {
        id: 'sign',
        label: 'holding up a sign',
        bubble: null,
        prop: 'sign',
        motion: 'bob',
        mouth: 'smile',
      },
      {
        id: 'tap',
        label: 'tapping its foot',
        bubble: null,
        motion: 'tap',
        eyes: 'open',
        mouth: 'flat',
        fx: 'clock',
      },
      {
        id: 'wave',
        label: 'waving at you',
        bubble: null,
        motion: 'wave',
        eyes: 'happy',
        mouth: 'open',
        fx: 'wave',
      },
    ],
    error: [
      { id: 'classic', weight: 2 },
      { id: 'fume', label: 'fuming', prop: null, fx: 'fume' },
      {
        id: 'tantrum',
        label: 'throwing a tantrum',
        prop: null,
        motion: 'stomp',
        mouth: 'open',
        fx: 'anger',
      },
      { id: 'flop', label: 'flopped over', prop: null, motion: 'flop', eyes: 'closed' },
    ],
    done: [
      { id: 'classic', weight: 2 },
      {
        id: 'trophy',
        label: 'raising the trophy',
        prop: 'trophy',
        motion: 'bounce',
        fx: 'stars',
      },
      { id: 'dance', label: 'victory dance', prop: null, motion: 'dance', fx: 'notes' },
      { id: 'backflip', label: 'backflip!', prop: null, motion: 'backflip', fx: 'stars' },
    ],
  };

  /**
   * Hobbies for an idle pet. `needs: 'toy'` hands control to scene.js, which
   * walks the pet to a toy. `moves` hobbies are skipped when wandering is off.
   */
  const IDLE = [
    {
      id: 'butterfly',
      label: 'chasing a butterfly',
      dur: [6000, 9000],
      critter: 'butterfly',
      roam: 'chase',
      motion: 'hop',
      eyes: 'wide',
      mouth: 'open',
      wag: 10,
      moves: true,
    },
    {
      id: 'birdwatch',
      label: 'bird watching',
      dur: [5000, 7000],
      critter: 'bird',
      eyes: 'open',
      wag: 6,
    },
    {
      id: 'dig',
      label: 'digging a hole',
      dur: [3000, 5000],
      motion: 'dig',
      eyes: 'focus',
      mouth: 'tongue',
      fx: 'dirt',
    },
    {
      id: 'dance',
      label: 'dancing',
      dur: [3000, 5000],
      motion: 'dance',
      eyes: 'happy',
      mouth: 'open',
      fx: 'notes',
    },
    {
      id: 'daydream',
      label: 'daydreaming',
      dur: [4000, 6000],
      motion: 'tilt',
      eyes: 'happy',
      fx: 'dream',
    },
    {
      id: 'book',
      label: 'reading for fun',
      dur: [5000, 8000],
      prop: 'book',
      eyes: 'lookDown',
      fx: 'pages',
    },
    {
      id: 'coffee',
      label: 'having a coffee',
      dur: [4000, 6000],
      prop: 'mug',
      motion: 'sip',
      eyes: 'happy',
      fx: 'steam',
    },
    {
      id: 'yoga',
      label: 'doing yoga',
      dur: [4000, 6000],
      motion: 'levitate',
      eyes: 'closed',
      mouth: 'smile',
      fx: 'sparkle',
    },
    {
      id: 'roll',
      label: 'rolling around',
      dur: [1800, 1800],
      motion: 'roll',
      eyes: 'happy',
      mouth: 'open',
    },
    {
      id: 'fly',
      label: 'flying around',
      dur: [6000, 10000],
      roam: 'fly',
      motion: 'fly',
      wag: 14,
      species: ['bird'],
      weight: 4,
      moves: true,
    },
    { id: 'toy', label: 'playing', dur: [7000, 11000], needs: 'toy', weight: 5, moves: true },
  ];

  function allowed(v, species) {
    return !v.species || v.species.includes(species);
  }

  /** Weighted random choice; `rand` is injectable for tests. */
  function weighted(list, rand) {
    const total = list.reduce((n, v) => n + (v.weight || 1), 0);
    let r = rand() * total;
    for (const v of list) {
      r -= v.weight || 1;
      if (r < 0) {
        return v;
      }
    }
    return list[list.length - 1];
  }

  /**
   * Picks the look for a state. Classic mode always gets the first variant;
   * random mode avoids repeating the previous one.
   * @param {string} state
   * @param {{classic: boolean, species: string, lastId?: string, rand?: () => number}} opts
   */
  function pick(state, opts) {
    const list = (VARIANTS[state] || []).filter((v) => allowed(v, opts.species));
    if (list.length === 0) {
      return null;
    }
    if (opts.classic) {
      return list[0];
    }
    const fresh = list.filter((v) => v.id !== opts.lastId);
    return weighted(fresh.length > 0 ? fresh : list, opts.rand || Math.random);
  }

  /**
   * Picks an idle hobby, or null if nothing fits.
   * @param {{species: string, wander: boolean, toys: boolean, lastId?: string, rand?: () => number}} opts
   */
  function pickIdle(opts) {
    const list = IDLE.filter(
      (a) =>
        allowed(a, opts.species) &&
        a.id !== opts.lastId &&
        (opts.wander || !a.moves) &&
        (a.needs !== 'toy' || opts.toys),
    );
    return list.length > 0 ? weighted(list, opts.rand || Math.random) : null;
  }

  root.PetVariants = { VARIANTS, IDLE, pick, pickIdle };
})(this);
