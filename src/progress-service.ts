import { localDay, weekId, weekStart } from './calendar';
import type { CareAction } from './pet-care';
import {
  XP,
  challengeProgress,
  isCatchUp,
  levelOf,
  turnXp,
  weeklyChallenges,
  Fact,
  LevelInfo,
} from './progress';
import { ProgressStore } from './progress-store';
import type { Outcome } from './transcript-parser';
import type { TurnRecord } from './turn-tracker';

export interface ChallengeState {
  id: string;
  emoji: string;
  text: string;
  progress: number;
  target: number;
  done: boolean;
}

export interface ProgressUpdate extends LevelInfo {
  week: string;
  /** XP earned since Monday. */
  weekXp: number;
  challenges: ChallengeState[];
}

type Listener = () => void;

/**
 * Turns what happens (prompts finishing, tests passing, helpers, records,
 * care) into XP facts in the {@link ProgressStore}, and completes the weekly
 * challenges. Every key is the same in every window, so each window can
 * report everything it sees.
 */
export class ProgressService {
  private listeners: Listener[] = [];
  /** Failed runs per session and kind since the last pass: the bugs waiting to be squashed. */
  private failing = new Map<string, number>();

  constructor(
    private readonly store: ProgressStore,
    private readonly now: () => Date,
  ) {}

  onChange(listener: Listener): { dispose(): void } {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  }

  private add(key: string, fact: Fact): boolean {
    if (!this.store.add(key, fact, this.now())) {
      return false;
    }
    this.changed();
    return true;
  }

  private changed(): void {
    this.completeChallenges();
    for (const l of this.listeners) {
      l();
    }
  }

  /**
   * Finished prompts, in one write however many there are (a backfill can
   * bring hundreds). Interrupted ones earn nothing.
   */
  turns(turns: TurnRecord[]): void {
    const done = turns.filter((t) => t.outcome === 'done').sort((a, b) => a.endedAt - b.endedAt);
    const times = Object.values(this.store.facts())
      .filter((f) => f.kind === 'turn')
      .map((f) => f.at);
    const entries: Array<[string, Fact]> = done.map((t) => {
      const fact = {
        xp: turnXp(t.actions, isCatchUp(t.endedAt, times)),
        kind: 'turn',
        at: t.endedAt,
      };
      times.push(t.endedAt);
      return [`turn:${t.promptId}`, fact];
    });
    if (entries.length > 0 && this.store.addMany(entries, this.now()).length > 0) {
      this.changed();
    }
  }

  outcome(sessionId: string, o: Outcome): void {
    const slot = `${sessionId}:${o.kind}`;
    if (!o.ok) {
      this.failing.set(slot, (this.failing.get(slot) ?? 0) + 1);
      return;
    }
    this.add(`${o.kind}:${o.id}`, { xp: XP[o.kind], kind: o.kind, at: o.at });
    if ((this.failing.get(slot) ?? 0) > 0) {
      this.failing.delete(slot);
      this.add(`squash:${o.id}`, { xp: XP.squash, kind: 'squash', at: o.at });
    }
  }

  agentDone(agentId: string): void {
    this.add(`agent:${agentId}`, { xp: XP.agent, kind: 'agent', at: this.now().getTime() });
  }

  /** A weekly record category taken this week. */
  record(category: string): void {
    const now = this.now();
    this.add(`record:${weekId(now)}:${category}`, {
      xp: XP.record,
      kind: 'record',
      at: now.getTime(),
    });
  }

  /** A rewarded care action; only the first few each day earn XP. */
  care(action: CareAction): void {
    const now = this.now();
    const day = localDay(now);
    const today = Object.keys(this.store.facts()).filter((k) => k.startsWith(`care:${day}:`));
    if (today.length < XP.carePerDay) {
      this.add(`care:${day}:${today.length}`, {
        xp: XP.care,
        kind: `care:${action}`,
        at: now.getTime(),
      });
    }
  }

  private completeChallenges(): void {
    const now = this.now();
    const week = weekId(now);
    const facts = Object.values(this.store.facts());
    for (const c of weeklyChallenges(week)) {
      const key = `challenge:${week}:${c.id}`;
      if (challengeProgress(c, facts, weekStart(now)) >= c.target && !this.store.has(key)) {
        this.store.add(key, { xp: XP.challenge, kind: 'challenge', at: now.getTime() }, now);
      }
    }
  }

  snapshot(): ProgressUpdate {
    const now = this.now();
    const week = weekId(now);
    const from = weekStart(now);
    const facts = Object.values(this.store.facts());
    return {
      ...levelOf(this.store.total()),
      week,
      weekXp: facts.filter((f) => f.at >= from).reduce((a, f) => a + f.xp, 0),
      challenges: weeklyChallenges(week).map((c) => {
        const progress = challengeProgress(c, facts, from);
        return {
          id: c.id,
          emoji: c.emoji,
          text: c.text,
          progress,
          target: c.target,
          done: progress >= c.target,
        };
      }),
    };
  }
}
