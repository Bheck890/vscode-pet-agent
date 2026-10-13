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

  /** Eye patterns, 3x3, drawn for the left eye and mirrored for the right. */
  const EYES = {
    open: ['wkk', 'kkk', 'kkk'],
    wide: ['kkk', 'kwk', 'kkk'],
    focus: ['...', 'kkk', 'kkk'],
    lookDown: ['...', 'wkk', 'kkk'],
    closed: ['...', '...', 'ooo'],
    sleepy: ['...', 'o.o', '.o.'],
    happy: ['.o.', 'o.o', '...'],
    angry: ['k..', 'kk.', 'kkk'],
  };

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
  function palette(species, base, tint, tintAmt) {
    const sp = SPECIES[species] || SPECIES.cat;
    let b = hexToRgb(base) ? base : sp.defaultColor;
    if (tint && tintAmt > 0) {
      b = mix(b, tint, tintAmt);
    }
    return Object.assign(
      {
        o: mix(b, '#000000', 0.68),
        b,
        l: mix(b, '#ffffff', 0.62),
        d: mix(b, '#000000', 0.32),
      },
      sp.fixed,
    );
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

  /**
   * Composes a pet into a 32x32 array of hex colours (or null for transparent).
   * @param {string} species
   * @param {Record<string,string>} pal
   * @param {{ eyes?: string, mouth?: string, frame?: number }} expr
   */
  function compose(species, pal, expr) {
    const sp = SPECIES[species] || SPECIES.cat;
    const px = blank(SIZE, SIZE);
    const frame = expr.frame || 0;

    const tail = sp.tail ? sp.tail.frames[frame % sp.tail.frames.length] : null;
    if (sp.tail && tail && !sp.tail.front) {
      stamp(px, tail, sp.tail.x, sp.tail.y, pal, false);
    }

    const full = sp.half.map((row) => {
      const left = row.padEnd(16, '.').slice(0, 16);
      return left + left.split('').reverse().join('');
    });
    stamp(px, full, 0, 0, pal, false);

    if (sp.tail && tail && sp.tail.front) {
      stamp(px, tail, sp.tail.x, sp.tail.y, pal, false);
    }

    if (sp.wings) {
      const wing = sp.wings.frames[frame % sp.wings.frames.length];
      stamp(px, wing, sp.wings.x, sp.wings.y, pal, false);
      stamp(px, wing, SIZE - sp.wings.x - wing[0].length, sp.wings.y, pal, true);
    }

    const eyes = EYES[expr.eyes || 'open'] || EYES.open;
    stamp(px, eyes, sp.eyeX, sp.eyeY, pal, false);
    stamp(px, eyes, SIZE - sp.eyeX - 3, sp.eyeY, pal, true);

    const mouth = MOUTHS[expr.mouth || 'neutral'] || MOUTHS.neutral;
    stamp(px, mouth, 14, sp.mouthY, pal, false);

    return px;
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
    speciesIds: Object.keys(SPECIES),
    palette,
    compose,
    composeProp,
    mix,
    rotateHue,
    hexToRgb,
  };
})(this);
