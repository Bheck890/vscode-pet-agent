// @ts-check
// What each agent state looks like: label, colour, face, prop, motion and
// effects. Pure data, no DOM access, so tests can load it via vm. The state
// ids match PET_STATES in src/transcript-parser.ts; variants.js layers
// alternative looks on top of these.
(function (root) {
  'use strict';

  // oneShot states play for `oneShot` ms, then hand back to the base state.
  const STATES = {
    sleeping: {
      label: 'napping',
      emojis: [],
      color: '#5b6ee1',
      eyes: 'sleepy',
      mouth: 'flat',
      prop: 'nightcap',
      motion: 'breathe',
      fx: 'zzz',
      wag: 0,
    },
    idle: {
      label: 'chilling',
      emojis: [],
      color: null,
      eyes: 'open',
      mouth: 'neutral',
      motion: 'idle',
      wag: 1.2,
    },
    waking: {
      label: 'waking up',
      emojis: ['☀️', '⏰', '☕'],
      color: '#ffd45e',
      eyes: 'sleepy',
      mouth: 'yawn',
      motion: 'stretch',
      wag: 2,
      oneShot: 1600,
    },
    thinking: {
      label: 'thinking',
      emojis: ['💭', '🤔', '💡', '✨'],
      color: '#b48cff',
      eyes: 'open',
      mouth: 'neutral',
      motion: 'tilt',
      bubble: 'thought',
      wag: 1.5,
    },
    reading: {
      label: 'reading',
      emojis: ['🔍', '📖', '📄', '👀'],
      color: '#4fd1c5',
      eyes: 'lookDown',
      mouth: 'neutral',
      prop: 'magnifier',
      motion: 'scan',
      wag: 1,
    },
    writing: {
      label: 'writing code',
      emojis: ['✏️', '📝', '⌨️', '💾'],
      color: '#5aa9ff',
      eyes: 'focus',
      mouth: 'tongue',
      prop: 'laptop',
      motion: 'type',
      wag: 3,
    },
    running: {
      label: 'running commands',
      emojis: ['⚙️', '🔧', '⚡', '💻'],
      color: '#ff9f43',
      eyes: 'focus',
      mouth: 'flat',
      motion: 'run',
      fx: 'sweat',
      wag: 6,
    },
    testing: {
      label: 'running tests',
      emojis: ['🧪', '⏳', '🔬', '🫧'],
      color: '#4fe0a0',
      eyes: 'open',
      mouth: 'neutral',
      motion: 'watch',
      wag: 1.5,
    },
    browsing: {
      label: 'browsing the web',
      emojis: ['🌐', '🔗', '📡', '🛰️'],
      color: '#38d9f5',
      eyes: 'open',
      mouth: 'neutral',
      prop: 'binoculars',
      motion: 'scan',
      wag: 2,
    },
    delegating: {
      label: 'bossing helpers around',
      emojis: ['📋', '📣', '👥', '🧩'],
      color: '#6be675',
      eyes: 'open',
      mouth: 'smile',
      prop: 'clipboard',
      motion: 'bounce',
      wag: 5,
    },
    waiting: {
      label: 'waiting for you',
      emojis: ['❓', '❗', '🙋', '⏳'],
      color: '#ffd23f',
      eyes: 'wide',
      mouth: 'open',
      motion: 'hop',
      bubble: 'shout',
      fx: 'alert',
      wag: 7,
    },
    error: {
      label: 'grumpy',
      emojis: ['💢', '💥', '⚠️', '🐛'],
      color: '#ff4d4d',
      eyes: 'angry',
      mouth: 'frown',
      prop: 'cloud',
      motion: 'shake',
      wag: 0,
      oneShot: 2600,
    },
    done: {
      label: 'all done!',
      emojis: ['🎉', '⭐', '🏆', '✅'],
      color: '#ffd700',
      eyes: 'happy',
      mouth: 'open',
      prop: 'partyHat',
      motion: 'jump',
      wag: 8,
      oneShot: 3200,
    },
  };

  /** peon-ping animation names -> pet states. */
  const PEON_TO_STATE = {
    waking: 'waking',
    typing: 'thinking',
    alarmed: 'waiting',
    celebrate: 'done',
    annoyed: 'error',
  };

  /** States where the agent is busy; care actions are locked while any of these show. */
  const WORKING = new Set([
    'thinking',
    'reading',
    'writing',
    'running',
    'testing',
    'browsing',
    'delegating',
    'waiting',
    'error',
  ]);

  root.PetStates = { STATES, PEON_TO_STATE, WORKING };
})(this);
