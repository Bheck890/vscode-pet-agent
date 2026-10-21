import { weekStart } from './calendar';
import { CATEGORIES, beats, bestOf, counts } from './records';
import { Storage } from './storage';
import type { TurnRecord } from './turn-tracker';

const TURNS_KEY = 'petTurns';
const FAME_KEY = 'petHallOfFame';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** A stored turn, or null if anything about it is off. */
export function parseTurn(v: unknown): TurnRecord | null {
  if (!v || typeof v !== 'object') {
    return null;
  }
  const o = v as Record<string, unknown>;
  const num = (k: string) => typeof o[k] === 'number' && Number.isFinite(o[k]) && o[k] >= 0;
  const text = (k: string) => typeof o[k] === 'string';
  const ok =
    text('promptId') &&
    (o['promptId'] as string).length > 0 &&
    text('sessionId') &&
    (o['project'] === null || text('project')) &&
    ['startedAt', 'endedAt', 'words', 'chars', 'actions', 'subagents', 'outputTokens'].every(num) &&
    (o['outcome'] === 'done' || o['outcome'] === 'interrupted') &&
    text('preview');
  return ok ? (o as unknown as TurnRecord) : null;
}

function parseTurns(v: unknown): Record<string, TurnRecord> {
  const out: Record<string, TurnRecord> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const t of Object.values(v)) {
      const turn = parseTurn(t);
      if (turn) {
        out[turn.promptId] = turn;
      }
    }
  }
  return out;
}

/** What adding turns changed. */
export interface RecordsChange {
  added: TurnRecord[];
  /** Weekly categories now held by one of the added turns. */
  broken: string[];
}

/**
 * Finished turns of this week and last, plus the all-time best per category,
 * in extension globalState. Turns are keyed by prompt id and saving merges
 * with what is stored, so every window (and a backfill) can add the same
 * turn without counting it twice.
 */
export class RecordsStore {
  constructor(private readonly storage: Storage) {}

  turns(): TurnRecord[] {
    return Object.values(parseTurns(this.storage.get(TURNS_KEY)));
  }

  /** This week's turns, as of `now`. */
  week(now: Date): TurnRecord[] {
    const from = weekStart(now);
    return this.turns().filter((t) => t.endedAt >= from);
  }

  /** The all-time best turn per category id. */
  hallOfFame(): Record<string, TurnRecord> {
    const raw = this.storage.get<Record<string, unknown>>(FAME_KEY);
    const fame: Record<string, TurnRecord> = {};
    for (const cat of CATEGORIES) {
      const t = raw && typeof raw === 'object' ? parseTurn(raw[cat.id]) : null;
      if (t) {
        fame[cat.id] = t;
      }
    }
    return fame;
  }

  /**
   * Merges records brought from another computer: recent turns join this
   * week's board and each hall of fame entry is kept if it beats ours.
   */
  importAll(turns: unknown, fame: unknown, now: Date): void {
    const incoming = (Array.isArray(turns) ? turns : [])
      .map(parseTurn)
      .filter((t): t is TurnRecord => !!t);
    this.add(incoming, now);
    const mine = this.hallOfFame();
    const raw = fame && typeof fame === 'object' ? (fame as Record<string, unknown>) : {};
    let changed = false;
    for (const cat of CATEGORIES) {
      const t = parseTurn(raw[cat.id]);
      if (t && counts(t) && cat.eligible(t) && beats(cat, t, mine[cat.id])) {
        mine[cat.id] = t;
        changed = true;
      }
    }
    if (changed) {
      void this.storage.update(FAME_KEY, mine);
    }
  }

  /** Every stored turn and the hall of fame, raw, for a move to another computer. */
  exportAll(): { turns: TurnRecord[]; fame: Record<string, TurnRecord> } {
    return { turns: this.turns(), fame: this.hallOfFame() };
  }

  add(turns: TurnRecord[], now: Date): RecordsChange {
    const stored = parseTurns(this.storage.get(TURNS_KEY));
    const added = turns.filter((t) => !stored[t.promptId]);
    if (added.length === 0) {
      return { added, broken: [] };
    }
    const from = weekStart(now);
    const before = bestOf(Object.values(stored).filter((t) => t.endedAt >= from));
    const keepFrom = from - WEEK_MS;
    const merged: Record<string, TurnRecord> = {};
    for (const t of [...Object.values(stored), ...added]) {
      if (t.endedAt >= keepFrom) {
        merged[t.promptId] = t;
      }
    }
    void this.storage.update(TURNS_KEY, merged);

    const after = bestOf(Object.values(merged).filter((t) => t.endedAt >= from));
    const addedIds = new Set(added.map((t) => t.promptId));
    const broken = CATEGORIES.filter((c) => {
      const holder = after[c.id];
      return holder && addedIds.has(holder.promptId) && before[c.id]?.promptId !== holder.promptId;
    }).map((c) => c.id);

    const fame = this.hallOfFame();
    let fameChanged = false;
    for (const cat of CATEGORIES) {
      for (const t of added) {
        if (counts(t) && cat.eligible(t) && beats(cat, t, fame[cat.id])) {
          fame[cat.id] = t;
          fameChanged = true;
        }
      }
    }
    if (fameChanged) {
      void this.storage.update(FAME_KEY, fame);
    }
    return { added, broken };
  }
}
