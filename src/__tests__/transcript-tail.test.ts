import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TailedFile, firstCwd, readLines, safeReaddir, safeStat } from '../transcript-tail';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-tail-'));
  file = path.join(dir, 'session.jsonl');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function tail(t: TailedFile): unknown[] {
  const lines: unknown[] = [];
  readLines(t, fs.statSync(t.file).size, (l) => lines.push(l));
  return lines;
}

describe('readLines', () => {
  it('reads complete lines and keeps a partial last line for later', () => {
    fs.writeFileSync(file, '{"n":1}\n{"n":2}\n{"n":');
    const t = { file, offset: 0, midLine: false };
    expect(tail(t)).toEqual([{ n: 1 }, { n: 2 }]);

    fs.appendFileSync(file, '3}\n');
    expect(tail(t)).toEqual([{ n: 3 }]);
    expect(tail(t)).toEqual([]);
  });

  it('skips blank and malformed lines without stalling', () => {
    fs.writeFileSync(file, '{"n":1}\n\nnot json\n{"n":2}\n');
    const t = { file, offset: 0, midLine: false };
    expect(tail(t)).toEqual([{ n: 1 }, { n: 2 }]);
    expect(t.offset).toBe(fs.statSync(file).size);
  });

  it('keeps going when the consumer throws on a line', () => {
    fs.writeFileSync(file, '{"n":1}\n{"n":2}\n');
    const t = { file, offset: 0, midLine: false };
    const seen: unknown[] = [];
    readLines(t, fs.statSync(file).size, (l) => {
      seen.push(l);
      throw new Error('bad line');
    });
    expect(seen).toHaveLength(2);
    expect(t.offset).toBe(fs.statSync(file).size);
  });

  it('drops the line it starts in the middle of', () => {
    fs.writeFileSync(file, '{"skip":true}\n{"n":1}\n');
    const t = { file, offset: 4, midLine: true };
    expect(tail(t)).toEqual([{ n: 1 }]);
    expect(t.midLine).toBe(false);
  });

  it('starts over when the file shrinks', () => {
    fs.writeFileSync(file, '{"n":1}\n{"n":2}\n');
    const t = { file, offset: 0, midLine: false };
    tail(t);
    fs.writeFileSync(file, '{"n":9}\n');
    const size = fs.statSync(file).size;
    expect(readLines(t, size, () => undefined)).toBe('restarted');
    expect(t.offset).toBe(0);
    expect(tail(t)).toEqual([{ n: 9 }]);
  });

  it('survives a file that has vanished', () => {
    const t = { file: path.join(dir, 'gone.jsonl'), offset: 0, midLine: false };
    expect(readLines(t, 10, () => undefined)).toBe('read');
    expect(t.offset).toBe(0);
  });
});

describe('file helpers', () => {
  it('finds where a session started from its first cwd', () => {
    fs.writeFileSync(file, '{"type":"user","cwd":"C:\\\\code\\\\app"}\n{"cwd":"/elsewhere"}\n');
    expect(firstCwd(file)).toBe('C:\\code\\app');
    expect(firstCwd(path.join(dir, 'missing.jsonl'))).toBeNull();
  });

  it('returns empty results instead of throwing for missing paths', () => {
    expect(safeReaddir(path.join(dir, 'nope'))).toEqual([]);
    expect(safeStat(path.join(dir, 'nope'))).toBeNull();
  });
});
