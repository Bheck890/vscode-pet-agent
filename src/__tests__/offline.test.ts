import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { peonGuide, peonInstalled, peonSteps } from '../peon-guide';

const ROOT = process.cwd();
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const files = (dir: string, ext: RegExp) =>
  fs
    .readdirSync(path.join(ROOT, dir))
    .filter((f) => ext.test(f))
    .map((f) => path.join(dir, f));

/** Everything that ships: the extension host sources and the webview. */
const SHIPPED = [...files('src', /\.ts$/), ...files('media', /\.(js|html)$/)];

/** The only addresses in the code: share intents (opened in the browser on a click) and the peon-ping guide's commands. */
const ALLOWED_URLS = [
  'https://x.com/intent/post?text=',
  'https://bsky.app/intent/compose?text=',
  'https://raw.githubusercontent.com/PeonPing/peon-ping/main',
];

describe('offline', () => {
  it('never imports a network or process module', () => {
    const banned =
      /from ['"](node:)?(http|https|http2|net|tls|dgram|dns|child_process|worker_threads)['"]|require\(['"](node:)?(http|https|net|tls|dgram|dns|child_process)['"]\)/;
    for (const f of SHIPPED) {
      expect([f, banned.test(read(f))]).toEqual([f, false]);
    }
  });

  it('never fetches from the webview or the extension', () => {
    const calls =
      /\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|navigator\.(sendBeacon|serviceWorker)/;
    for (const f of SHIPPED) {
      expect([f, calls.test(read(f))]).toEqual([f, false]);
    }
  });

  it('has no addresses but the share intents and the peon-ping guide', () => {
    for (const f of SHIPPED) {
      const urls = read(f).match(/https?:\/\/[^\s'"`)<>]+/g) ?? [];
      for (const url of urls) {
        expect([f, ALLOWED_URLS.some((a) => url.startsWith(a))]).toEqual([f, true]);
      }
    }
  });

  it('opens links only through the share flow', () => {
    const opens = SHIPPED.filter((f) => /openExternal/.test(read(f)));
    expect(opens).toEqual([path.join('src', 'ui.ts')]);
  });

  it('locks the webview down: no connections, scripts only by nonce', () => {
    const html = read('src/webview-html.ts');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/connect-src|frame-src|'unsafe-eval'/);
  });

  it('ships with no runtime dependencies', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies?: object };
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});

describe('peon-ping guide', () => {
  it.each(['win32', 'darwin', 'linux'])(
    'downloads the installer to a file to read before running it (%s)',
    (platform) => {
      const commands = peonSteps(platform)
        .map((s) => s.command)
        .filter((c): c is string => !!c);
      expect(commands.length).toBeGreaterThanOrEqual(4);
      for (const c of commands) {
        // Never piped straight into a shell, never run from a string.
        expect(c).not.toMatch(/\|\s*(ba|z)?sh\b|\biex\b|Invoke-Expression/);
      }
      expect(commands.join('\n')).toMatch(/uninstall/);
    },
  );

  it('uses PowerShell on Windows and a POSIX shell elsewhere', () => {
    expect(
      peonSteps('win32')
        .map((s) => s.command ?? '')
        .join(),
    ).toContain('install.ps1');
    expect(
      peonSteps('darwin')
        .map((s) => s.command ?? '')
        .join(),
    ).toContain('install.sh');
  });

  it('says whether peon-ping is installed, and what it sends', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peon-'));
    expect(peonInstalled(dir)).toBe(true);
    expect(peonInstalled(path.join(dir, 'missing'))).toBe(false);
    const guide = peonGuide('linux', false);
    expect(guide.installed).toBe(false);
    expect(guide.notes.join(' ')).toMatch(/GitHub/);
  });
});
