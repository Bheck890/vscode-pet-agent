import * as path from 'path';
import { localDay, weekId, weekStart } from './calendar';
import { CATEGORIES, WeekTotals, bestOf, formatDuration, totals } from './records';
import { RecordsStore } from './records-store';
import { Storage } from './storage';
import { readLines, safeReaddir, safeStat } from './transcript-tail';
import { TurnRecord, TurnTracker, applyTurnLine, createTurnTracker } from './turn-tracker';

/** One line of the records board. */
export interface RecordEntry {
  id: string;
  emoji: string;
  title: string;
  /** e.g. "4 words -> 12m 30s" */
  value: string;
  project: string | null;
  /** Only when the user turned prompt previews on. */
  preview?: string;
  endedAt: number;
}

export interface RecordsUpdate {
  week: string;
  records: RecordEntry[];
  hallOfFame: RecordEntry[];
  totals: WeekTotals & { agentTime: string };
  /** Categories a turn just took this week; empty unless this update is for that turn. */
  broken: string[];
}

type TurnsListener = (turns: TurnRecord[], broken: string[]) => void;

const BACKFILL_KEY = 'petBackfillDay';
/** Transcripts are read this much at a time during a backfill, yielding in between. */
const CHUNK_BYTES = 2 * 1024 * 1024;

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Turns transcript lines into finished turns, keeps them in the
 * {@link RecordsStore}, and tells listeners (the XP and the view) about new
 * ones. Live lines come from the ClaudeWatcher; a backfill reads this week's
 * older transcripts once a day so the board is full from the first look.
 */
export class RecordsService {
  private trackers = new Map<string, TurnTracker>();
  private listeners: TurnsListener[] = [];

  constructor(
    private readonly store: RecordsStore,
    private readonly storage: Storage,
    private readonly now: () => Date,
  ) {}

  onTurns(listener: TurnsListener): { dispose(): void } {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  }

  /** A line from a main session's transcript. */
  line(sessionId: string, line: unknown): void {
    let tracker = this.trackers.get(sessionId);
    if (!tracker) {
      tracker = createTurnTracker(sessionId);
      this.trackers.set(sessionId, tracker);
    }
    const turn = applyTurnLine(tracker, line);
    if (turn) {
      this.add([turn]);
    }
  }

  /** Forgets a session the watcher stopped following. */
  drop(sessionId: string): void {
    this.trackers.delete(sessionId);
  }

  private add(turns: TurnRecord[]): void {
    const change = this.store.add(turns, this.now());
    if (change.added.length > 0) {
      for (const l of this.listeners) {
        l(change.added, change.broken);
      }
    }
  }

  /**
   * Reads every transcript touched this week from the start, at most once a
   * day per machine. Returns how many turns it found (new or not).
   */
  async backfill(projectsDir: string): Promise<number> {
    const now = this.now();
    const day = localDay(now);
    if (this.storage.get(BACKFILL_KEY) === day) {
      return 0;
    }
    void this.storage.update(BACKFILL_KEY, day);
    const since = weekStart(now);
    const found: TurnRecord[] = [];
    for (const project of safeReaddir(projectsDir)) {
      if (!project.isDirectory()) {
        continue;
      }
      const dir = path.join(projectsDir, project.name);
      for (const entry of safeReaddir(dir)) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
          continue;
        }
        const file = path.join(dir, entry.name);
        const st = safeStat(file);
        if (!st || st.mtimeMs < since) {
          continue;
        }
        const turns = await readTurns(file, entry.name.slice(0, -'.jsonl'.length), st.size);
        found.push(...turns.filter((t) => t.endedAt >= since));
      }
    }
    if (found.length > 0) {
      this.add(found);
    }
    return found.length;
  }

  /** The board, as of now. Prompt previews only if `showPrompts`. */
  snapshot(showPrompts: boolean, broken: string[] = []): RecordsUpdate {
    const now = this.now();
    const week = this.store.week(now);
    const entry = (catId: string, t: TurnRecord): RecordEntry => {
      const cat = CATEGORIES.find((c) => c.id === catId)!;
      return {
        id: cat.id,
        emoji: cat.emoji,
        title: cat.title,
        value: cat.describe(t),
        project: t.project,
        ...(showPrompts ? { preview: t.preview } : {}),
        endedAt: t.endedAt,
      };
    };
    const best = bestOf(week);
    const fame = this.store.hallOfFame();
    const sum = totals(week);
    return {
      week: weekId(now),
      records: CATEGORIES.filter((c) => best[c.id]).map((c) => entry(c.id, best[c.id]!)),
      hallOfFame: CATEGORIES.filter((c) => fame[c.id]).map((c) => entry(c.id, fame[c.id])),
      totals: { ...sum, agentTime: formatDuration(sum.agentMs) },
      broken,
    };
  }
}

/** Every finished turn in one transcript, read in chunks so a big file doesn't block. */
async function readTurns(file: string, sessionId: string, size: number): Promise<TurnRecord[]> {
  const tracker = createTurnTracker(sessionId);
  const turns: TurnRecord[] = [];
  const tail = { file, offset: 0, midLine: false };
  let limit = CHUNK_BYTES;
  while (tail.offset < size) {
    const before = tail.offset;
    readLines(tail, Math.min(size, tail.offset + limit), (line) => {
      const turn = applyTurnLine(tracker, line);
      if (turn) {
        turns.push(turn);
      }
    });
    if (tail.offset === before) {
      // One line longer than the chunk (or a file that vanished): widen, or give up at the end.
      if (tail.offset + limit >= size) {
        break;
      }
      limit *= 2;
    } else {
      limit = CHUNK_BYTES;
    }
    await pause();
  }
  return turns;
}
