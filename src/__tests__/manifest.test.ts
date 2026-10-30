import * as fs from 'fs';
import * as path from 'path';
import { ACCESSORIES, HELPERS, PATTERNS, SPECIES, readPetConfig } from '../pet-config';
import { mediaFiles } from '../media-files';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

interface Command {
  command: string;
  title: string;
}
interface Property {
  type: string;
  default: unknown;
  enum?: string[];
}
const pkg = JSON.parse(read('package.json'));
const commands: Command[] = pkg.contributes.commands;
const props: Record<string, Property> = pkg.contributes.configuration.properties;
const PREFIX = 'pet-agents.';
const settingKeys = Object.keys(props).map((k) => k.slice(PREFIX.length));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(path.join(root, file));
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('marketplace manifest', () => {
  it('names the extension Pet Agents under its own publisher', () => {
    expect(pkg.name).toBe('pet-agents');
    expect(pkg.displayName).toBe('Pet Agents');
    expect(pkg.publisher).toMatch(/^[a-z0-9][a-z0-9-]*$/i);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.license).toBe('MIT');
    expect(pkg.description.length).toBeGreaterThan(20);
  });

  it('points at a public https repository', () => {
    for (const url of [pkg.repository.url, pkg.homepage, pkg.bugs.url]) {
      expect(url).toMatch(/^https:\/\/github\.com\/Bheck890\/vscode-pet-agent/);
    }
  });

  it('has a square PNG icon of at least 128px', () => {
    expect(pkg.icon).toMatch(/\.png$/);
    const { width, height } = pngSize(pkg.icon);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(128);
  });

  it('uses marketplace categories that exist', () => {
    const known = [
      'AI',
      'Chat',
      'Data Science',
      'Debuggers',
      'Education',
      'Formatters',
      'Keymaps',
      'Linters',
      'Notebooks',
      'Other',
      'Programming Languages',
      'SCM Providers',
      'Snippets',
      'Testing',
      'Themes',
      'Visualization',
    ];
    for (const c of pkg.categories) {
      expect(known).toContain(c);
    }
    expect(pkg.keywords.length).toBeLessThanOrEqual(30);
  });

  it('has a changelog entry for this version', () => {
    expect(read('CHANGELOG.md')).toContain(`## [${pkg.version}]`);
  });
});

describe('contributions', () => {
  const extensionSource = read('src/extension.ts');
  const settingsSource = read('src/settings.ts');
  const providerSource = read('src/PeonViewProvider.ts');

  it('registers every contributed command, and contributes every registered one', () => {
    const registered = [...extensionSource.matchAll(/registerCommand\(\s*'([^']+)'/g)].map(
      (m) => m[1],
    );
    expect(registered.sort()).toEqual(commands.map((c) => c.command).sort());
  });

  it('prefixes every command and its title with the extension name', () => {
    for (const c of commands) {
      expect(c.command.startsWith(PREFIX)).toBe(true);
      expect(c.title.startsWith('Pet Agents: ')).toBe(true);
    }
  });

  it('menus only reference contributed commands', () => {
    const ids = commands.map((c) => c.command);
    for (const items of Object.values(pkg.contributes.menus) as Array<Array<Command>>) {
      for (const item of items) {
        expect(ids).toContain(item.command);
      }
    }
  });

  it('uses the same view id in the manifest, activation events and provider', () => {
    const viewId = providerSource.match(/viewId = '([^']+)'/)?.[1];
    expect(pkg.contributes.views.explorer.map((v: { id: string }) => v.id)).toEqual([viewId]);
    expect(pkg.activationEvents).toContain(`onView:${viewId}`);
    expect(pkg.contributes.menus['view/title'][0].when).toBe(`view == ${viewId}`);
  });

  it('reads settings from the same section the manifest declares', () => {
    expect(Object.keys(props).every((k) => k.startsWith(PREFIX))).toBe(true);
    const sections = [
      ...(extensionSource + settingsSource).matchAll(
        /(?:getConfiguration|affectsConfiguration)\('([^']+)'\)/g,
      ),
    ];
    expect(sections.length).toBeGreaterThan(0);
    for (const m of sections) {
      expect(`${m[1]}.`.startsWith(PREFIX)).toBe(true);
    }
  });
});

describe('settings', () => {
  it('reads every declared setting, and declares every setting it reads', () => {
    // The helper reads its own look settings, so ask as both.
    const asked = new Set<string>();
    for (const companion of ['pet', 'helper']) {
      readPetConfig((key) => {
        asked.add(key);
        return key === 'companion' ? companion : undefined;
      });
    }
    expect([...asked].sort()).toEqual([...settingKeys].sort());
  });

  it('manifest defaults give the same pet as missing settings', () => {
    const fromDefaults = readPetConfig((key) => props[PREFIX + key]?.default);
    const fromNothing = readPetConfig(() => undefined);
    expect(fromDefaults).toEqual(fromNothing);
  });

  it('declares the same choices the code accepts', () => {
    expect(props['pet-agents.species'].enum).toEqual([...SPECIES]);
    expect(props['pet-agents.pattern'].enum).toEqual([...PATTERNS]);
    expect(props['pet-agents.accessory'].enum).toEqual([...ACCESSORIES]);
    expect(props['pet-agents.helper'].enum).toEqual([...HELPERS]);
    expect(props['pet-agents.helperPattern'].enum).toEqual([...PATTERNS]);
    expect(props['pet-agents.helperAccessory'].enum).toEqual([...ACCESSORIES]);
    expect(props['pet-agents.companion'].enum).toEqual(['pet', 'helper']);
    expect(props['pet-agents.size'].enum).toEqual(['small', 'medium', 'large']);
    expect(props['pet-agents.artStyle'].enum).toEqual(['smooth', 'pixel']);
    expect(props['pet-agents.variety'].enum).toEqual(['random', 'classic']);
  });

  it('gives every enum choice a description where the manifest lists descriptions', () => {
    for (const p of Object.values(props) as Array<Property & { enumDescriptions?: string[] }>) {
      if (p.enumDescriptions) {
        expect(p.enumDescriptions).toHaveLength(p.enum!.length);
      }
    }
  });

  it('documents every setting in the README', () => {
    const readme = read('README.md');
    for (const key of Object.keys(props)) {
      expect([key, readme.includes(`\`${key}\``)]).toEqual([key, true]);
    }
  });
});

describe('packaging', () => {
  const ignore = read('.vscodeignore')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  it('leaves sources, scripts and README images out of the VSIX', () => {
    for (const pattern of [
      'src/**',
      'scripts/**',
      'docs/**',
      'node_modules/**',
      '*.vsix',
      'coverage/**',
    ]) {
      expect(ignore).toContain(pattern);
    }
  });

  it('keeps everything the webview loads inside the VSIX', () => {
    expect(ignore.some((l) => l.startsWith('media'))).toBe(false);
    const files = mediaFiles(read('media/webview.html'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect([file, fs.existsSync(path.join(root, 'media', file))]).toEqual([file, true]);
    }
  });

  it('has no leftovers of the old Peon Pet identifiers', () => {
    const files = [
      'package.json',
      'media/webview.html',
      'media/webview.js',
      ...fs
        .readdirSync(path.join(root, 'src'))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => `src/${f}`),
    ];
    for (const file of files) {
      const text = read(file);
      expect([file, /peon-pet\.|'peon-pet'|peonPetView|Peon Pet/.test(text)]).toEqual([
        file,
        false,
      ]);
    }
  });
});

describe('README', () => {
  const readme = read('README.md');
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)|<img[^>]+src="([^"]+)"/g)].map(
    (m) => m[1] ?? m[2],
  );

  it('shows screenshots and GIFs', () => {
    expect(images.filter((src) => src.endsWith('.gif')).length).toBeGreaterThanOrEqual(3);
    expect(images.filter((src) => src.endsWith('.png')).length).toBeGreaterThanOrEqual(1);
  });

  it('only links images that exist, and no SVGs (the marketplace rejects them)', () => {
    for (const src of images) {
      if (/^https?:/.test(src)) {
        expect(src.startsWith('https://')).toBe(true);
        continue;
      }
      expect(src.endsWith('.svg')).toBe(false);
      expect([src, fs.existsSync(path.join(root, src))]).toEqual([src, true]);
    }
  });

  it('keeps every GIF small enough to load quickly', () => {
    for (const src of images.filter((s) => s.endsWith('.gif') && !s.startsWith('http'))) {
      expect([src, fs.statSync(path.join(root, src)).size < 3 * 1024 * 1024]).toEqual([src, true]);
    }
  });

  it('documents every command', () => {
    for (const c of commands) {
      expect([c.command, readme.includes(c.title)]).toEqual([c.command, true]);
    }
  });

  it('documents bags, houses, styles and saves', () => {
    for (const heading of [
      '### Bags',
      '### Pet styles',
      '### The house',
      '### Finishing, saves and old pets',
    ]) {
      expect([heading, readme.includes(heading)]).toEqual([heading, true]);
    }
  });

  it('tells people how to install it from the marketplace', () => {
    expect(readme).toContain(`ext install ${pkg.publisher}.${pkg.name}`);
  });
});
