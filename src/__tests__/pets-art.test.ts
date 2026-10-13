import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

interface PetArtApi {
  SIZE: number;
  SPECIES: Record<string, { half: string[]; fixed: Record<string, string> }>;
  PROPS: Record<string, { grid: string[]; palette: Record<string, string> }>;
  speciesIds: string[];
  palette(species: string, base: string, tint?: string, amt?: number): Record<string, string>;
  compose(species: string, pal: Record<string, string>, expr: object): (string | null)[][];
  rotateHue(hex: string, deg: number): string;
}

const source = fs.readFileSync(path.join(process.cwd(), 'media', 'pets.js'), 'utf8');
const sandbox: { PetArt?: PetArtApi } = {};
vm.runInNewContext(source, sandbox);
const Art = sandbox.PetArt as PetArtApi;

describe('pet art', () => {
  it('only uses printable ASCII in the art file', () => {
    expect(source).toMatch(/^[\x20-\x7e\n]*$/);
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
});
