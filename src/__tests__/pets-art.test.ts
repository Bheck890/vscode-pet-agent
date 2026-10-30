import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as petConfig from '../pet-config';

interface PetArtApi {
  SIZE: number;
  SPECIES: Record<
    string,
    {
      half: string[];
      fixed: Record<string, string>;
      helper?: boolean;
      eyeColor?: string;
      faceInk?: string;
      eyeX: number;
      eyeY: number;
      looks?: Record<string, { prop?: string; label?: string }>;
    }
  >;
  PROPS: Record<string, { grid: string[]; palette: Record<string, string> }>;
  PATTERNS: string[];
  ACCESSORIES: Record<string, { slot: string; color: string }>;
  COSTUMES: Record<string, { slot: string; color: string; build(sp: unknown): { grid: string[] } }>;
  STYLES: Record<string, { slot: string; color: string; build(sp: unknown): { grid: string[] } }>;
  speciesIds: string[];
  palette(
    species: string,
    base: string,
    tint?: string,
    amt?: number,
    opts?: Record<string, string>,
  ): Record<string, string>;
  compose(species: string, pal: Record<string, string>, expr: object): (string | null)[][];
  rotateHue(hex: string, deg: number): string;
}

type Expr = Record<string, unknown>;

function render(species: string, expr: Expr, opts?: Record<string, string>) {
  return Art.compose(species, Art.palette(species, '#336699', '', 0, opts), expr);
}

function diff(a: (string | null)[][], b: (string | null)[][]): number {
  return a.flat().filter((c, i) => c !== b.flat()[i]).length;
}

const source = fs.readFileSync(path.join(process.cwd(), 'media', 'pets.js'), 'utf8');
const sandbox: { PetArt?: PetArtApi } = {};
vm.runInNewContext(source, sandbox);
const Art = sandbox.PetArt as PetArtApi;

describe('pet art', () => {
  it('only uses printable ASCII in the art file', () => {
    expect(source).toMatch(/^[\x20-\x7e\r\n]*$/);
  });

  it.each([...petConfig.SPECIES, ...petConfig.HELPERS])(
    '%s has a well-formed 32x32 body',
    (species) => {
      const sp = Art.SPECIES[species];
      expect(sp.half).toHaveLength(Art.SIZE);
      for (const row of sp.half) {
        expect(row.length).toBeLessThanOrEqual(16);
      }
      const px = Art.compose(species, Art.palette(species, '#336699'), {});
      expect(px).toHaveLength(32);
      expect(px.every((r) => r.length === 32)).toBe(true);
      expect(px.flat().filter(Boolean).length).toBeGreaterThan(300);
    },
  );

  it('draws the same pets and helpers the settings offer, flagged as such', () => {
    expect(Art.speciesIds.filter((s) => !Art.SPECIES[s].helper).sort()).toEqual(
      [...petConfig.SPECIES].sort(),
    );
    expect(Art.speciesIds.filter((s) => Art.SPECIES[s].helper)).toEqual([...petConfig.HELPERS]);
    for (const id of Art.speciesIds) {
      expect([id, petConfig.DEFAULT_NAMES[id as petConfig.Species]]).toEqual([
        id,
        expect.any(String),
      ]);
    }
  });

  it('gives helpers their own looks, using props that exist', () => {
    for (const id of petConfig.HELPERS) {
      const looks = Art.SPECIES[id].looks ?? {};
      expect(Object.keys(looks).length).toBeGreaterThan(0);
      for (const look of Object.values(looks)) {
        expect([id, look.prop === undefined || look.prop in Art.PROPS]).toEqual([id, true]);
      }
    }
  });

  it('draws a screen face in its glowing ink, not the outline colour', () => {
    const sp = Art.SPECIES.robot;
    expect(sp.faceInk).toBe('e');
    const pal = Art.palette('robot', '#d8cbb0');
    expect(pal.e).toBe(sp.eyeColor);
    const px = Art.compose('robot', pal, { eyes: 'happy' });
    // The happy eye's top pixel is a face line: drawn in the eye colour on the screen.
    expect(px[sp.eyeY][sp.eyeX + 1]).toBe(sp.eyeColor);
    expect(Art.palette('robot', '#d8cbb0', '', 0, { eye: '#ff0000' }).e).toBe('#ff0000');
  });

  it('has a colour for every palette key used by every species', () => {
    for (const species of Art.speciesIds) {
      const pal = Art.palette(species, '#336699');
      const keys = new Set(Art.SPECIES[species].half.join('').replace(/\./g, ''));
      for (const k of keys) {
        expect([species, k, pal[k]]).toEqual([species, k, expect.stringMatching(/^#[0-9a-f]{6}$/)]);
      }
    }
  });

  it('has a colour for every key used by every prop', () => {
    for (const [name, prop] of Object.entries(Art.PROPS)) {
      for (const k of new Set(prop.grid.join('').replace(/\./g, ''))) {
        expect([name, k, prop.palette[k]]).toEqual([name, k, expect.any(String)]);
      }
    }
  });

  it('recolours the body but keeps fixed colours', () => {
    const red = Art.palette('fox', '#ff0000');
    const blue = Art.palette('fox', '#0000ff');
    expect(red.b).not.toBe(blue.b);
    expect(red.l).toBe(blue.l);
  });

  it('falls back to the species default for an invalid colour', () => {
    expect(Art.palette('dog', 'not-a-colour').b).toBe(Art.palette('dog', '#b9804a').b);
  });

  it('rotates hue into a valid, different colour', () => {
    const out = Art.rotateHue('#e8772e', 120);
    expect(out).toMatch(/^#[0-9a-f]{6}$/);
    expect(out).not.toBe('#e8772e');
  });

  it('pattern and settings names match the extension settings', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties;
    expect(props['pet-agents.pattern'].enum).toEqual(Art.PATTERNS);
    expect(props['pet-agents.accessory'].enum).toEqual(['none', ...Object.keys(Art.ACCESSORIES)]);
    expect([...petConfig.PATTERNS]).toEqual(Art.PATTERNS);
    expect([...petConfig.ACCESSORIES]).toEqual(['none', ...Object.keys(Art.ACCESSORIES)]);
  });

  it.each(['cat', 'dog', 'bird', 'fox'])('every accessory and pattern changes the %s', (sp) => {
    const plain = render(sp, {});
    for (const accessory of Object.keys(Art.ACCESSORIES)) {
      expect([accessory, diff(render(sp, { accessory }), plain) > 4]).toEqual([accessory, true]);
    }
    for (const pattern of Art.PATTERNS.filter(
      (x) => x !== 'none' && !(sp === 'bird' && x === 'socks'),
    )) {
      expect([pattern, diff(render(sp, { pattern }), plain) > 2]).toEqual([pattern, true]);
    }
  });

  it.each(['cat', 'dog', 'bird', 'fox'])('every holiday costume shows on the %s', (sp) => {
    const plain = render(sp, {});
    for (const costume of Object.keys(Art.COSTUMES)) {
      expect([costume, diff(render(sp, { costume }), plain) > 4]).toEqual([costume, true]);
    }
  });

  it("gives way to the user's own accessory in the same slot, and to state props", () => {
    const crowned = render('cat', { accessory: 'crown' });
    expect(diff(render('cat', { accessory: 'crown', costume: 'witchHat' }), crowned)).toBe(0);
    const scarfed = render('cat', { accessory: 'scarf' });
    expect(
      diff(render('cat', { accessory: 'scarf', costume: 'witchHat' }), scarfed),
    ).toBeGreaterThan(4);
    expect(diff(render('cat', { costume: 'santaHat', hide: ['head'] }), render('cat', {}))).toBe(0);
  });

  it('every costume only uses accessory colour keys', () => {
    for (const [id, costume] of Object.entries(Art.COSTUMES)) {
      const keys = new Set(costume.build(Art.SPECIES.cat).grid.join(''));
      const unknown = [...keys].filter((k) => !'.aAkwyYrcGP'.includes(k));
      expect([id, unknown]).toEqual([id, []]);
    }
  });

  it('hides an accessory when its slot is taken by a state prop', () => {
    const plain = render('cat', {});
    expect(diff(render('cat', { accessory: 'crown', hide: ['head'] }), plain)).toBe(0);
  });

  it('pupils move with look, and ears twitch', () => {
    const centre = render('fox', { look: 0 });
    expect(diff(render('fox', { look: -1 }), centre)).toBeGreaterThan(0);
    expect(diff(render('fox', { look: 1 }), centre)).toBeGreaterThan(0);
    expect(diff(render('fox', { twitch: true }), centre)).toBeGreaterThan(0);
  });

  it('applies eye and accent colours', () => {
    const px = render('cat', {}, { eye: '#00ff00', accent: '#ff00ff' }).flat();
    expect(px).toContain('#00ff00');
    expect(px).toContain('#ff00ff');
  });

  it('style names match the extension setting', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const enumOf = pkg.contributes.configuration.properties['pet-agents.style'].enum;
    expect(enumOf).toEqual(['none', ...Object.keys(Art.STYLES)]);
    expect([...petConfig.STYLES]).toEqual(['none', ...Object.keys(Art.STYLES)]);
  });

  it.each(['cat', 'dog', 'bird', 'fox'])('every pet style shows on the %s', (sp) => {
    const plain = render(sp, {});
    for (const style of Object.keys(Art.STYLES)) {
      expect([style, diff(render(sp, { style }), plain) > 4]).toEqual([style, true]);
    }
  });

  it('colour variants of a style differ only in colour', () => {
    const base = render('cat', { style: 'chefHat' });
    const pink = render('cat', { style: 'chefHatPink' });
    expect(diff(base, pink)).toBeGreaterThan(4);
    const shape = (px: (string | null)[][]) => px.flat().map((c) => c !== null);
    expect(shape(base)).toEqual(shape(pink));
  });

  it("gives way to the user's own accessory and to a holiday costume in its slot", () => {
    const crowned = render('dog', { accessory: 'crown' });
    expect(diff(render('dog', { accessory: 'crown', style: 'beret' }), crowned)).toBe(0);
    const witch = render('dog', { costume: 'witchHat' });
    expect(diff(render('dog', { costume: 'witchHat', style: 'beret' }), witch)).toBe(0);
    // A style in another slot still shows beside them.
    expect(
      diff(render('dog', { accessory: 'crown', style: 'labGoggles' }), crowned),
    ).toBeGreaterThan(4);
    expect(diff(render('dog', { style: 'beret', hide: ['head'] }), render('dog', {}))).toBe(0);
  });

  it('every style only uses accessory colour keys', () => {
    for (const [id, style] of Object.entries(Art.STYLES)) {
      for (const sp of ['cat', 'dog', 'bird', 'fox']) {
        const keys = new Set(style.build(Art.SPECIES[sp]).grid.join(''));
        const unknown = [...keys].filter((k) => !'.aAkwyYrcGP'.includes(k));
        expect([id, sp, unknown]).toEqual([id, sp, []]);
      }
    }
  });
});
