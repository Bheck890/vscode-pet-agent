// @ts-check
// Pixel-art pets. Pure data + composition helpers, no DOM access, so the same
// file runs in the webview and in tests (via vm).
//
// Body grids are 32x32 but only the left 16 columns are authored; the right
// half is mirrored, which keeps every front-facing pet symmetric. Palette keys:
//   o outline  b body  l light (belly/muzzle)  d dark accent
//   p pink  k black  w white  y beak/feet
(function (root) {
  'use strict';

  const SIZE = 32;

  /** @typedef {{ x: number, y: number, front?: boolean, frames: string[][] }} Appendage */
  /**
   * @typedef {{
   *   defaultColor: string,
   *   fixed: Record<string, string>,
   *   half: string[],
   *   eyeX: number, eyeY: number,
   *   mouthY: number,
   *   headTop: number,
   *   pawY: number,
   *   neckY: number,
   *   twitch: { x0: number, y0: number, x1: number, y1: number, dx: number, dy: number },
   *   tail?: Appendage,
   *   wings?: Appendage,
   * }} Species
   */

  /** @type {Record<string, Species>} */
  const SPECIES = {
    cat: {
      defaultColor: '#8a8aa0',
      fixed: { p: '#f4a7b9', k: '#1b1b24', w: '#ffffff' },
      eyeX: 8,
      eyeY: 11,
      mouthY: 15,
      headTop: 7,
      pawY: 28,
      neckY: 20,
      twitch: { x0: 0, y0: 2, x1: 8, y1: 5, dx: -1, dy: 0 },
      half: [
        '................',
        '................',
        '....o...........',
        '...obo..........',
        '...obbo.........',
        '...obpbo........',
        '..obppbbo.......',
        '..obppbbbooooooo',
        '..obpbbbbbbbdbbd',
        '..obbbbbbbbbbdbb',
        '.obbbbbbbbbbbbbb',
        '.obbbbbbbbbbbbbb',
        '.obbbbbbbbbbbbbb',
        '.obbbbbbbbbbbbbb',
        'oobbbbbbbbbbbllp',
        '.obbbbbbbbbbllll',
        'oobbbbbbbbblllll',
        '..obbbbbbbbbllll',
        '...obbbbbbbbbbll',
        '....oobbbbbbbbbb',
        '......oooobbbbbb',
        '.....obbbbbbllll',
        '....obbbbbbbllll',
        '....obbbbbbbllll',
        '...obbbbbbbbllll',
        '...obdbbbbbbblll',
        '...obdbbbbbbbbbb',
        '...obbbbbbbobbbb',
        '...obbbbbbolllbo',
        '...obbbbbbolllbo',
        '....oooooooooooo',
        '................',
      ],
      tail: {
        x: 16,
        y: 26,
        front: true,
        frames: [
          [
            '.............',
            '.oo..........',
            'obbo.........',
            'obdbooooooooo',
            '.obbdbbdbbdbo',
            '..ooooooooooo',
          ],
          [
            '.oo..........',
            'obbo.........',
            'obdo.........',
            'obbbooooooooo',
            '.obbdbbdbbdbo',
            '..ooooooooooo',
          ],
        ],
      },
    },

    dog: {
      defaultColor: '#b9804a',
      fixed: { p: '#ff7b93', k: '#1d1612', w: '#ffffff' },
      eyeX: 8,
      eyeY: 11,
      mouthY: 18,
      headTop: 4,
      pawY: 28,
      neckY: 20,
      twitch: { x0: 0, y0: 12, x1: 4, y1: 15, dx: -1, dy: 0 },
      half: [
        '................',
        '................',
        '................',
        '................',
        '......oooooooooo',
        '....oobbbbbbbbbb',
        '..ooddobbbbbbbbb',
        '.oddddobbbbbbbbb',
        '.oddddobbbbbbbbb',
        'odddddobbbbbbbbb',
        'oddddobbbbbbbbbb',
        'oddddobbbbbbbbbb',
        'oddddobbbbbbbbbb',
        'oddddobbbbbbbbbb',
        '.odddobbbbbbllll',
        '..oddobbbbbllkkk',
        '...oobbbbbllllkk',
        '.....obbbbllllll',
        '.....obbbbllllll',
        '......obbblllll',
        '.......ooolllll',
        '.....obbbbbbllll',
        '....obbbbbbbllll',
        '....obbbbbbbllll',
        '...obbbbbbbbllll',
        '...obbbbbbbbblll',
        '...obbbbbbbbbbbb',
        '...obbbbbbbobbbb',
        '...obbbbbbolllbo',
        '...obbbbbbolllbo',
        '....oooooooooooo',
        '................',
      ],
      tail: {
        x: 26,
        y: 19,
        frames: [
          [
            '.....o',
            '....ob',
            '...obo',
            '..obo.',
            '.obbo.',
            'obbo..',
            'obbo..',
            'obo...',
            'oo....',
          ],
          [
            '......',
            'oo....',
            'obo...',
            'obbo..',
            'obbbo.',
            'obbo..',
            'obbo..',
            'obo...',
            'oo....',
          ],
        ],
      },
    },

    fox: {
      defaultColor: '#e8772e',
      fixed: { p: '#3a2418', d: '#2e211a', l: '#fbf3ea', k: '#1a120d', w: '#ffffff' },
      eyeX: 8,
      eyeY: 11,
      mouthY: 17,
      headTop: 7,
      pawY: 28,
      neckY: 19,
      twitch: { x0: 0, y0: 1, x1: 7, y1: 5, dx: -1, dy: 0 },
      half: [
        '................',
        '..o.............',
        '..oo............',
        '..odo...........',
        '..oddo..........',
        '..obpbo.........',
        '..obppbo........',
        '..obppbbooooooo.',
        '..obpbbbbbbbbbbo',
        '..obbbbbbbbbbbbb',
        '.obbbbbbbbbbbbbb',
        '.obbbbbbbbbbbbbb',
        '.obbbbbbbbbbbbbb',
        '.olbbbbbbbbbbbbb',
        '.ollbbbbbbbbblll',
        '.olllbbbbbblllkk',
        '..ollllllllllllk',
        '...olllllllllll',
        '....oollllllllll',
        '.......oooolllll',
        '.....obbbbbbllll',
        '....obbbbbbbllll',
        '....obbbbbbbllll',
        '...obbbbbbbbllll',
        '...obbbbbbbbblll',
        '...obbbbbbbbbbbb',
        '...obbbbbbbobbbb',
        '...obddddddoddbo',
        '...obddddddoddbo',
        '...obddddddoddbo',
        '....oooooooooooo',
        '................',
      ],
      tail: {
        x: 23,
        y: 14,
        frames: [
          [
            '.....ooo.',
            '....olllo',
            '...ollllo',
            '...obllbo',
            '..obbbbo.',
            '..obbbbo.',
            '.obbbbo..',
            '.obbbbo..',
            'obbbbo...',
            'obbbbo...',
            'obbbo....',
            'obbbo....',
            'obbo.....',
            'oo.......',
          ],
          [
            '......oo.',
            '.....ollo',
            '....olllo',
            '...obllbo',
            '...obbbo.',
            '..obbbbo.',
            '.obbbbo..',
            '.obbbbo..',
            'obbbbo...',
            'obbbbo...',
            'obbbo....',
            'obbbo....',
            'obbo.....',
            'oo.......',
          ],
        ],
      },
    },

    bird: {
      defaultColor: '#4aa3df',
      fixed: { y: '#f5a623', k: '#15151c', w: '#ffffff', p: '#ff8fa3' },
      eyeX: 9,
      eyeY: 11,
      mouthY: 15,
      headTop: 5,
      pawY: 29,
      neckY: 18,
      twitch: { x0: 12, y0: 2, x1: 15, y1: 4, dx: -1, dy: 0 },
      half: [
        '................',
        '................',
        '..............o.',
        '.............obo',
        '.............obo',
        '.........oooooob',
        '.......oobbbbbbb',
        '......obbbbbbbbb',
        '.....obbbbbbbbbb',
        '....obbbbbbbbbbb',
        '....obbbbbbbbbbb',
        '...obbbbbbbbbbbb',
        '...obbbbbbbbbbbb',
        '...obbbbbbbbbbbb',
        '..obbbbbbbbbbooy',
        '..obbbbbbbbbbbyy',
        '..obbbbbbbblllly',
        '..obbbbbbbllllll',
        '..obbbbbbbllllll',
        '..obbbbbbbllllll',
        '..obbbbbbbllllll',
        '..obbbbbbbllllll',
        '...obbbbbbllllll',
        '...obbbbbbbbllll',
        '....obbbbbbbbbll',
        '.....oobbbbbbbbb',
        '.......ooooooooo',
        '..........o..o..',
        '..........y..y..',
        '.........yy.yy..',
        '................',
        '................',
      ],
      wings: {
        x: 0,
        y: 14,
        frames: [
          ['...oo', '..odo', '.oddo', '.oddo', 'odddo', 'odddo', 'oddo.', 'odo..', 'oo...'],
          ['.....', 'oo...', 'oddo.', 'odddo', 'odddo', '.oddo', '..odo', '...oo', '.....'],
        ],
      },
    },
  };

  /**
   * Eye patterns, 3x3, drawn for the left eye and mirrored for the right.
   * 'e' is the iris (eye colour), 'k' the pupil. 'open' is built per frame by
   * openEye() so the pupils can look around.
   */
  const EYES = {
    wide: ['eee', 'ewe', 'eee'],
    focus: ['...', 'eee', 'ekk'],
    lookDown: ['...', 'wee', 'ekk'],
    closed: ['...', '...', 'ooo'],
    sleepy: ['...', 'o.o', '.o.'],
    happy: ['.o.', 'o.o', '...'],
    angry: ['e..', 'ee.', 'ekk'],
  };

  /**
   * An open eye in absolute (unmirrored) orientation. look: -1 left, 1 right,
   * 0 = pupils toward the nose, which reads as attentive.
   */
  function openEye(isRight, look) {
    const col = look < 0 ? 0 : look > 0 ? 1 : isRight ? 0 : 1;
    const rows = [
      ['e', 'e', 'e'],
      ['e', 'e', 'e'],
      ['e', 'e', 'e'],
    ];
    rows[0][isRight ? 2 : 0] = 'w';
    for (const r of [1, 2]) {
      rows[r][col] = 'k';
      rows[r][col + 1] = 'k';
    }
    return rows.map((r) => r.join(''));
  }

  /** Mouth patterns, 4 wide, centred on x=14..17. */
  const MOUTHS = {
    neutral: ['o..o', '.oo.'],
    smile: ['o..o', '.oo.'],
    open: ['oooo', 'oppo'],
    yawn: ['.oo.', 'oppo', '.oo.'],
    frown: ['.oo.', 'o..o'],
    tongue: ['oooo', '.pp.'],
    flat: ['....', 'oooo'],
  };

  /** Props: small pixel grids with their own fixed palettes. */
  const PROPS = {
    partyHat: {
      palette: { o: '#3b1d4a', r: '#ff4f7b', y: '#ffd23f', c: '#4fd1ff' },
      grid: [
        '...y...',
        '...o...',
        '..oro..',
        '..oyo..',
        '.orrro.',
        '.ocyco.',
        'orrrrro',
        'ooooooo',
      ],
    },
    nightcap: {
      palette: { o: '#1f2a4d', b: '#4b5fa8', w: '#f2f2ff' },
      grid: [
        '........ww',
        '.......oww',
        '......obo.',
        '....oobbo.',
        '..oobbbbo.',
        '.obbbbbbbo',
        'owwwwwwwwo',
        'oooooooooo',
      ],
    },
    laptop: {
      palette: { o: '#1c1f26', g: '#5d6472', s: '#2a3f5f', c: '#7fe3ff', k: '#9aa3b2' },
      grid: [
        '..oooooooooooo..',
        '..ossssssssssso.',
        '..oscccsccssso..',
        '..osssccsscccso.',
        '..oscsssccsssso.',
        '..ossssssssssso.',
        '..oooooooooooo..',
        'oggggggggggggggo',
        'ogkgkgkgkgkgkggo',
        'oooooooooooooooo',
      ],
    },
    magnifier: {
      palette: { o: '#2b2b33', g: '#bfe9ff', h: '#ffffff', w: '#8b5a2b' },
      grid: [
        '.oooo...',
        'oghggo..',
        'ohgggo..',
        'oggggo..',
        'oggggo..',
        '.oooow..',
        '.....ww.',
        '......ww',
      ],
    },
    binoculars: {
      palette: { o: '#16161c', b: '#3a3a46', g: '#7fd3ff' },
      grid: [
        '.oooo..oooo.',
        'obbbboobbbbo',
        'obggbbbbggbo',
        'obggbobbggbo',
        'obbbbooobbbo',
        '.oooo..oooo.',
      ],
    },
    clipboard: {
      palette: { o: '#3a2a1a', b: '#c48a4a', w: '#fbfbf2', g: '#9a9a9a', m: '#5a5a66' },
      grid: [
        '...omo...',
        '.oommmoo.',
        '.obwwwbo.',
        '.obwggbo.',
        '.obwwwbo.',
        '.obwggbo.',
        '.obwwwbo.',
        '.obwggbo.',
        '.oooooooo',
      ],
    },
    bowl: {
      palette: {
        o: '#2b2b33',
        b: '#d94f4f',
        l: '#ff8a8a',
        f: '#8b5a2b',
        F: '#c48a4a',
      },
      grid: [
        '...fFfFFfFf...',
        '..FfFfffFfFF..',
        'oooooooooooooo',
        'obbbbbbbbbbbbo',
        '.obbbllllbbbo.',
        '..oooooooooo..',
      ],
    },
    cloud: {
      palette: { o: '#2a2d38', g: '#6b7184', l: '#8a90a6', y: '#ffe14d' },
      grid: [
        '....oooo......',
        '..oollllo.oo..',
        '.ollllllloggo.',
        'ollllgllllgggo',
        'oggggggggggggo',
        '.oooooyoooooo.',
        '......yy......',
        '.....yy.......',
        '......y.......',
      ],
    },
  };

  /** Fill patterns, applied to the key grid before colouring. Only fur cells change. */
  const PATTERNS = ['none', 'spots', 'stripes', 'socks', 'mask', 'patch'];

  const SPOTS = [
    [5, 11],
    [25, 14],
    [11, 8],
    [7, 23],
    [23, 25],
    [26, 21],
    [10, 27],
  ];

  function applyPattern(keys, sp, pattern) {
    const set = (x, y, from, to) => {
      if (y >= 0 && y < SIZE && x >= 0 && x < SIZE && from.includes(keys[y][x])) {
        keys[y][x] = to;
      }
    };
    const box = (x0, y0, w, h) => {
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          set(x, y, 'b', 'd');
        }
      }
    };
    switch (pattern) {
      case 'spots':
        for (const [x, y] of SPOTS) {
          box(x, y, 2, 2);
          set(x - 1, y, 'b', 'd');
          set(x + 1, y + 2, 'b', 'd');
        }
        break;
      case 'stripes':
        for (let y = 7; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            const fromMid = Math.floor(Math.abs(x - 15.5));
            if (fromMid > 3 && (fromMid + y) % 5 === 0) {
              set(x, y, 'b', 'd');
            }
          }
        }
        break;
      case 'socks':
        for (let y = sp.pawY - 1; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            set(x, y, 'bd', 'w');
          }
        }
        break;
      case 'mask':
        box(sp.eyeX - 2, sp.eyeY - 1, 7, 5);
        box(SIZE - sp.eyeX - 5, sp.eyeY - 1, 7, 5);
        break;
      case 'patch':
        box(sp.eyeX - 2, sp.eyeY - 2, 7, 7);
        break;
    }
  }

  /** Shifts the left ear (or tuft) region to make a twitch frame. */
  function applyTwitch(keys, t) {
    const copy = keys.map((r) => r.slice());
    for (let y = t.y0; y <= t.y1; y++) {
      for (let x = t.x0; x <= t.x1; x++) {
        keys[y][x] = '.';
      }
    }
    for (let y = t.y0; y <= t.y1; y++) {
      for (let x = t.x0; x <= t.x1; x++) {
        const ny = y + t.dy;
        const nx = x + t.dx;
        if (ny >= 0 && ny < SIZE && nx >= 0 && nx < SIZE && copy[y][x] !== '.') {
          keys[ny][nx] = copy[y][x];
        }
      }
    }
  }

  // -- Accessories ------------------------------------------------------------
  // Keys: a accessory colour, A its darker edge, plus the fixed colours below.

  const ACC_FIXED = {
    k: '#16161c',
    w: '#ffffff',
    y: '#ffd23f',
    Y: '#b8860b',
    r: '#e63946',
    c: '#4fd1ff',
    G: '#3fa34d',
  };

  /** Glasses frames (or filled shades) generated from the species' eye position. */
  function eyewear(sp, shades) {
    const left = sp.eyeX - 1;
    const right = SIZE - sp.eyeX - 4;
    const w = right + 5 - left;
    const h = shades ? 4 : 5;
    const rows = Array.from({ length: h }, () => new Array(w).fill('.'));
    for (const fx of [0, right - left]) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < 5; x++) {
          const corner = (x === 0 || x === 4) && (y === 0 || y === h - 1);
          const edge = x === 0 || x === 4 || y === 0 || y === h - 1;
          if (corner) {
            continue;
          }
          if (shades) {
            rows[y][fx + x] = edge ? 'k' : y === 1 && x === (fx === 0 ? 1 : 3) ? 'w' : 'A';
          } else if (edge) {
            rows[y][fx + x] = 'a';
          }
        }
      }
    }
    for (let x = 5; x < right - left; x++) {
      rows[1][x] = shades ? 'k' : 'a';
    }
    return { grid: rows.map((r) => r.join('')), x: left, y: sp.eyeY - 1 };
  }

  function headphones(sp) {
    const top = sp.headTop - 2;
    const cupTop = sp.eyeY - 1;
    const rows = Array.from({ length: cupTop + 6 - top }, () => new Array(SIZE).fill('.'));
    const put = (x, y, k) => {
      rows[y - top][x] = k;
      rows[y - top][SIZE - 1 - x] = k;
    };
    for (let x = 7; x < 16; x++) {
      put(x, top, 'A');
      put(x, top + 1, 'a');
    }
    put(5, top + 1, 'A');
    put(6, top + 1, 'A');
    for (let y = top + 2; y < cupTop; y++) {
      put(3, y, 'A');
      put(4, y, 'a');
    }
    for (let y = cupTop; y < cupTop + 6; y++) {
      for (let x = 0; x < 4; x++) {
        const edge = x === 0 || y === cupTop || y === cupTop + 5;
        put(x, y, edge ? 'A' : x === 3 ? 'k' : 'a');
      }
    }
    return { grid: rows.map((r) => r.join('')), x: 0, y: top };
  }

  const ACCESSORIES = {
    bow: {
      slot: 'head',
      color: '#ff4f7b',
      build: (sp) => ({
        grid: ['.A...A.', 'AaA.AaA', 'AaaAaaA', 'AaA.AaA', '.A...A.'],
        x: 20,
        y: sp.headTop - 2,
      }),
    },
    flower: {
      slot: 'head',
      color: '#ff8fb8',
      build: (sp) => ({
        grid: ['.a.a.', 'aayaa', '.aya.', 'a.G.a', '..G..'],
        x: 21,
        y: sp.headTop - 3,
      }),
    },
    crown: {
      slot: 'head',
      color: '#ffd23f',
      build: (sp) => ({
        grid: ['y...yy...y', 'yy.yyyy.yy', 'yyyyyyyyyy', 'yryyccyyry', 'YYYYYYYYYY'],
        x: 11,
        y: sp.headTop - 4,
      }),
    },
    beanie: {
      slot: 'head',
      color: '#4f9dff',
      build: (sp) => ({
        grid: [
          '.......ww.......',
          '......AwwA......',
          '....AAaaaaAA....',
          '..AAaaaaaaaaAA..',
          '.AaaaaaaaaaaaaA.',
          'AaAaAaAaaAaAaAaA',
        ],
        x: 8,
        y: sp.headTop - 4,
      }),
    },
    headphones: { slot: 'head', color: '#3a3b46', build: headphones },
    glasses: { slot: 'face', color: '#241a14', build: (sp) => eyewear(sp, false) },
    sunglasses: { slot: 'face', color: '#2a2a38', build: (sp) => eyewear(sp, true) },
    bandana: {
      slot: 'neck',
      color: '#e63946',
      build: (sp) => ({
        grid: [
          'AAAAAAAAAAAAAA',
          'AaaawaaaawaaaA',
          '.AaaaaaaaaaaA.',
          '..AawaaaawaA..',
          '...AaaaaaaA...',
          '....AaawaA....',
          '.....AaaA.....',
          '......AA......',
        ],
        x: 9,
        y: sp.neckY,
      }),
    },
    scarf: {
      slot: 'neck',
      color: '#4f7bff',
      build: (sp) => ({
        grid: [
          'AAAAAAAAAAAAAAAAAA',
          'AaaaaaaaaaaaaaaaaA',
          'AawaawaawaawaawaaA',
          'AAAAAAAAAAAAAaaaAA',
          '.............AawA.',
          '.............AaaA.',
          '.............AawA.',
          '.............AaaA.',
          '.............A.A..',
        ],
        x: 7,
        y: sp.neckY,
      }),
    },
    collar: {
      slot: 'neck',
      color: '#e63946',
      build: (sp) => ({
        grid: ['AaaaaaaaaaaA', '.AAAAyyAAAA.', '.....yy.....', '.....YY.....'],
        x: 10,
        y: sp.neckY,
      }),
    },
  };

  // -- Colour helpers ---------------------------------------------------------

  /** @param {string} hex */
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) {
      return null;
    }
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /** @param {number[]} rgb */
  function rgbToHex(rgb) {
    return (
      '#' +
      rgb
        .map((v) =>
          Math.max(0, Math.min(255, Math.round(v)))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  }

  /** Linear blend of two hex colours; t=0 -> a, t=1 -> b. */
  function mix(a, b, t) {
    const ra = hexToRgb(a);
    const rb = hexToRgb(b);
    if (!ra || !rb) {
      return a;
    }
    return rgbToHex(ra.map((v, i) => v + (rb[i] - v) * t));
  }

  /** Rotates a colour's hue by `deg` degrees (used to give each mini pet its own colour). */
  function rotateHue(hex, deg) {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      return hex;
    }
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) {
        h = (g - b) / d + (g < b ? 6 : 0);
      } else if (max === g) {
        h = (b - r) / d + 2;
      } else {
        h = (r - g) / d + 4;
      }
      h /= 6;
    }
    h = ((((h * 360 + deg) % 360) + 360) % 360) / 360;
    // Greyish colours barely change under hue rotation; give them some saturation.
    s = Math.max(s, 0.45);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return rgbToHex([hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((v) => v * 255));
  }

  /**
   * Builds the full palette for a species from a base colour, optionally tinted
   * toward `tint` (state colour) by `tintAmt`.
   */
  function palette(species, base, tint, tintAmt, opts) {
    const sp = SPECIES[species] || SPECIES.cat;
    const o = opts || {};
    let b = hexToRgb(base) ? base : sp.defaultColor;
    if (tint && tintAmt > 0) {
      b = mix(b, tint, tintAmt);
    }
    const pal = Object.assign(
      {
        o: mix(b, '#000000', 0.68),
        b,
        l: mix(b, '#ffffff', 0.62),
        d: mix(b, '#000000', 0.32),
      },
      sp.fixed,
    );
    if (o.accent && hexToRgb(o.accent)) {
      pal.l = o.accent;
    }
    pal.e = o.eye && hexToRgb(o.eye) ? o.eye : mix(pal.k, '#7a7a96', 0.45);
    return pal;
  }

  // -- Composition ------------------------------------------------------------

  function blank(w, h) {
    return Array.from({ length: h }, () => new Array(w).fill(null));
  }

  function stamp(px, grid, x0, y0, pal, flip) {
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        const key = flip ? row[row.length - 1 - x] : row[x];
        const col = pal[key];
        const py = y0 + y;
        const pxx = x0 + x;
        if (col && py >= 0 && py < px.length && pxx >= 0 && pxx < px[0].length) {
          px[py][pxx] = col;
        }
      }
    }
  }

  function keyStamp(keys, grid, x0, y0, flip) {
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        const key = flip ? row[row.length - 1 - x] : row[x];
        const py = y0 + y;
        const pxx = x0 + x;
        if (key !== '.' && py >= 0 && py < SIZE && pxx >= 0 && pxx < SIZE) {
          keys[py][pxx] = key;
        }
      }
    }
  }

  /**
   * Composes a pet into a 32x32 array of hex colours (or null for transparent).
   * @param {string} species
   * @param {Record<string,string>} pal
   * @param {{ eyes?: string, mouth?: string, frame?: number, look?: number,
   *   twitch?: boolean, pattern?: string, accessory?: string,
   *   accessoryColor?: string, hide?: string[] }} expr
   */
  function compose(species, pal, expr) {
    const sp = SPECIES[species] || SPECIES.cat;
    const keys = Array.from({ length: SIZE }, () => new Array(SIZE).fill('.'));
    const frame = expr.frame || 0;

    const tail = sp.tail ? sp.tail.frames[frame % sp.tail.frames.length] : null;
    if (sp.tail && tail && !sp.tail.front) {
      keyStamp(keys, tail, sp.tail.x, sp.tail.y, false);
    }
    const full = sp.half.map((row) => {
      const left = row.padEnd(16, '.').slice(0, 16);
      return left + left.split('').reverse().join('');
    });
    keyStamp(keys, full, 0, 0, false);
    if (expr.pattern) {
      applyPattern(keys, sp, expr.pattern);
    }
    if (sp.tail && tail && sp.tail.front) {
      keyStamp(keys, tail, sp.tail.x, sp.tail.y, false);
    }
    if (sp.wings) {
      const wing = sp.wings.frames[frame % sp.wings.frames.length];
      keyStamp(keys, wing, sp.wings.x, sp.wings.y, false);
      keyStamp(keys, wing, SIZE - sp.wings.x - wing[0].length, sp.wings.y, true);
    }
    if (expr.twitch) {
      applyTwitch(keys, sp.twitch);
    }

    const px = blank(SIZE, SIZE);
    stamp(px, keys, 0, 0, pal, false);

    const eyesName = expr.eyes || 'open';
    if (eyesName === 'open') {
      stamp(px, openEye(false, expr.look || 0), sp.eyeX, sp.eyeY, pal, false);
      stamp(px, openEye(true, expr.look || 0), SIZE - sp.eyeX - 3, sp.eyeY, pal, false);
    } else {
      const eyes = EYES[eyesName] || EYES.wide;
      stamp(px, eyes, sp.eyeX, sp.eyeY, pal, false);
      stamp(px, eyes, SIZE - sp.eyeX - 3, sp.eyeY, pal, true);
    }

    const mouth = MOUTHS[expr.mouth || 'neutral'] || MOUTHS.neutral;
    stamp(px, mouth, 14, sp.mouthY, pal, false);

    const acc = expr.accessory ? ACCESSORIES[expr.accessory] : null;
    if (acc && !(expr.hide || []).includes(acc.slot)) {
      const a = hexToRgb(expr.accessoryColor || '') ? expr.accessoryColor : acc.color;
      const accPal = Object.assign({ a, A: mix(a, '#000000', 0.45) }, ACC_FIXED);
      const placed = acc.build(sp);
      stamp(px, placed.grid, placed.x, placed.y, accPal, false);
    }

    return px;
  }

  /**
   * Scale2x (EPX) upscaling, applied `passes` times. Rounds off the pixel
   * staircases so the 'smooth' art style looks drawn rather than blocky,
   * while keeping every colour and accessory from the pixel grid.
   */
  function smooth(px, passes) {
    let cur = px;
    for (let n = 0; n < passes; n++) {
      const h = cur.length;
      const w = cur[0].length;
      const src = cur;
      const at = (x, y) => src[Math.max(0, Math.min(h - 1, y))][Math.max(0, Math.min(w - 1, x))];
      const out = Array.from({ length: h * 2 }, () => new Array(w * 2).fill(null));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = src[y][x];
          const up = at(x, y - 1);
          const right = at(x + 1, y);
          const left = at(x - 1, y);
          const down = at(x, y + 1);
          out[2 * y][2 * x] = left === up && left !== down && up !== right ? up : p;
          out[2 * y][2 * x + 1] = up === right && up !== left && right !== down ? right : p;
          out[2 * y + 1][2 * x] = down === left && down !== right && left !== up ? left : p;
          out[2 * y + 1][2 * x + 1] = right === down && right !== up && down !== left ? down : p;
        }
      }
      cur = out;
    }
    return cur;
  }

  /** Renders a prop to a colour array. */
  function composeProp(name) {
    const prop = PROPS[name];
    const w = Math.max(...prop.grid.map((r) => r.length));
    const px = blank(w, prop.grid.length);
    stamp(px, prop.grid, 0, 0, prop.palette, false);
    return px;
  }

  root.PetArt = {
    SIZE,
    SPECIES,
    EYES,
    MOUTHS,
    PROPS,
    PATTERNS,
    ACCESSORIES,
    speciesIds: Object.keys(SPECIES),
    palette,
    compose,
    composeProp,
    smooth,
    mix,
    rotateHue,
    hexToRgb,
  };
})(this);
