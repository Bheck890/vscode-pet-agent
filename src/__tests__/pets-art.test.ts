import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as petConfig from '../pet-config';

interface PetArtApi {
  SIZE: number;
  SPECIES: Record<string, { half: string[]; fixed: Record<string, string> }>;
  PROPS: Record<string, { grid: string[]; palette: Record<string, string> }>;
  PATTERNS: string[];
  ACCESSORIES: Record<string, { slot: string; color: string }>;
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

  it.each(['cat', 'dog', 'bird', 'fox'])('%s has a well-formed 32x32 body', (species) => {
    const sp = Art.SPECIES[species];
    expect(sp.half).toHaveLength(Art.SIZE);
    for (const row of sp.half) {
      expect(row.length).toBeLessThanOrEqual(16);
    }
    const px = Art.compose(species, Art.palette(species, '#336699'), {});
    expect(px).toHaveLength(32);
    expect(px.every((r) => r.length === 32)).toBe(true);
    expect(px.flat().filter(Boolean).length).toBeGreaterThan(300);
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
});
