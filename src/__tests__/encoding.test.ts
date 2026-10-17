import * as fs from 'fs';
import * as path from 'path';

const root = process.cwd();

function files(dir: string, ext: RegExp): string[] {
  return fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name), ext)
        : ext.test(e.name)
          ? [path.join(dir, e.name)]
          : [],
    );
}

const SOURCES = [
  ...files('src', /\.ts$/),
  ...files('media', /\.(js|css|html)$/),
  ...files('scripts', /\.js$/),
  'package.json',
];

/** Typographic characters that have plain ASCII stand-ins, and mojibake from double encoding. */
const BANNED: Array<[RegExp, string]> = [
  [/\u2014/, 'em dash (use --)'],
  [/\u2013/, 'en dash (use -)'],
  [/\u2192/, 'arrow (use ->)'],
  [/\u2022/, 'bullet (use -)'],
  [/\u2026/, 'ellipsis (use ...)'],
  [/[\u2500-\u257f]/, 'box drawing (use -)'],
  [/\u00c2[\u0080-\u00bf]|\u00e2\u20ac|\u00e2\u201d/, 'mojibake'],
];

describe('source encoding', () => {
  it.each(SOURCES)('%s is UTF-8 without a BOM', (file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)).toBe(true);
  });

  it.each(SOURCES)('%s has no typographic stand-ins or mojibake', (file) => {
    const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
    const found = lines.flatMap((line, i) =>
      BANNED.filter(([re]) => re.test(line)).map(([, what]) => `${file}:${i + 1} ${what}`),
    );
    expect(found).toEqual([]);
  });
});
