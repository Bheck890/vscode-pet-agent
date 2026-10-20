import * as fs from 'fs';

/**
 * Read-only access to Claude Code's JSONL transcripts, which are appended to
 * while an agent works. Nothing here knows what the lines mean; the live pet
 * state (transcript-parser.ts) and anything else that reads transcripts each
 * get the parsed lines through a callback.
 */

/** Where reading a growing transcript got to. */
export interface TailedFile {
  file: string;
  offset: number;
  /** True until the first read, when `offset` may point into the middle of a line. */
  midLine: boolean;
}

export function safeReaddir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function safeStat(file: string): fs.Stats | null {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

/** The `cwd` on the first transcript lines, i.e. where the session was started. */
export function firstCwd(file: string): string | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(buf.toString('utf8', 0, n));
    return m ? (JSON.parse(`"${m[1]}"`) as string) : null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

/**
 * Passes each complete line appended to `t.file` since `t.offset`, parsed, to
 * `onLine`. A trailing partial line is left for the next read. If the file
 * shrank (it was rewritten), the offset goes back to the start, nothing is
 * read and 'restarted' is returned so the caller can drop what it built up.
 */
export function readLines(
  t: TailedFile,
  size: number,
  onLine: (line: unknown) => void,
): 'read' | 'restarted' {
  if (size < t.offset) {
    t.offset = 0;
    t.midLine = false;
    return 'restarted';
  }
  if (size === t.offset) {
    return 'read';
  }
  let fd: number | null = null;
  try {
    fd = fs.openSync(t.file, 'r');
    const buf = Buffer.alloc(size - t.offset);
    const n = fs.readSync(fd, buf, 0, buf.length, t.offset);
    const end = buf.lastIndexOf(0x0a, n - 1);
    if (end < 0) {
      return 'read';
    }
    let start = 0;
    if (t.midLine) {
      start = buf.indexOf(0x0a) + 1;
      t.midLine = false;
    }
    for (const line of buf.toString('utf8', start, end).split('\n')) {
      if (!line.trim()) {
        continue;
      }
      try {
        onLine(JSON.parse(line));
      } catch {
        // Ignore a malformed line rather than losing the whole transcript.
      }
    }
    t.offset += end + 1;
  } catch {
    // File vanished or is locked; try again next tick.
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
  return 'read';
}
