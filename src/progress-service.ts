import { FINISH_LEVEL, STARTER_BAG } from './bags';
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
import type { Slot } from './slot';
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
  /** The save reached {@link FINISH_LEVEL}: its last bag is open. */
  finished: boolean;
}

type Listener = () => void;

/**
 * Turns what happens (prompts finishing, tests passing, helpers, records,
 * care) into XP facts in the {@link ProgressStore}, and completes the weekly
 * challenges. Every key is the same in every window, so each window can
 * report everything it sees. Facts dated before the current save started
 * belong to an earlier save and are ignored.
 */
export class ProgressService {
  private listeners: Listener[] = [];
  /** Failed runs per session and kind since the last pass: the bugs waiting to be squashed. */
  private failing = new Map<string, number>();

  constructor(
    private readonly store: ProgressStore,
    private readonly now: () => Date,
    private readonly slot: () => Slot,
  ) {}

  onChange(listener: Listener): { dispose(): void } {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  }

  private add(key: string, fact: Fact): boolean {
    if (fact.at < this.slot().startedAt || !this.store.add(key, fact, this.now())) {
      return false;
    }
    this.changed();
    return true;
  }

  private changed(): void {
    this.completeChallenges();
    this.checkFinish();
    for (const l of this.listeners) {
      l();
    }
  }

  /**
   * Finished prompts, in one write however many there are (a backfill can
   * bring hundreds). Interrupted ones earn nothing.
   */
  turns(turns: TurnRecord[]): void {
    const since = this.slot().startedAt;
    const done = turns
      .filter((t) => t.outcome === 'done' && t.endedAt >= since)
      .sort((a, b) => a.endedAt - b.endedAt);
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
    const added = new Set(this.store.addMany(entries, this.now()));
    if (added.size === 0) {
      return;
    }
    const counted = done.filter((t) => added.has(`turn:${t.promptId}`));
    this.store.addLifetime({
      prompts: counted.length,
      actions: counted.reduce((n, t) => n + t.actions, 0),
      agentMs: counted.reduce((n, t) => n + Math.max(0, t.endedAt - t.startedAt), 0),
    });
    this.changed();
  }

  outcome(sessionId: string, o: Outcome): void {
    const run = `${sessionId}:${o.kind}`;
    if (!o.ok) {
      this.failing.set(run, (this.failing.get(run) ?? 0) + 1);
      return;
    }
    this.add(`${o.kind}:${o.id}`, { xp: XP[o.kind], kind: o.kind, at: o.at });
    if ((this.failing.get(run) ?? 0) > 0) {
      this.failing.delete(run);
      this.add(`squash:${o.id}`, { xp: XP.squash, kind: 'squash', at: o.at });
    }
  }

  agentDone(agentId: string): void {
    this.add(`agent:${agentId}`, { xp: XP.agent, kind: 'agent', at: this.now().getTime() });
  }

  /**
   * A weekly record category taken this week by turns that finished at `at`;
   * one taken by turns from before the save started earns nothing.
   */
  record(category: string, at: number): void {
    const now = this.now();
    const fact = { xp: XP.record, kind: 'record', at };
    if (this.add(`record:${weekId(now)}:${category}`, fact)) {
      this.store.addLifetime({ records: 1 });
    }
  }

  /** A kind of toy found for the first time; ones from bags past the first count for the collector. */
  found(bag: string, toy: string): void {
    if (bag !== STARTER_BAG) {
      this.add(`find:${toy}`, { xp: 0, kind: 'find', at: this.now().getTime() });
    }
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

  private finishKey(): string {
    return `finish:${this.slot().id}`;
  }

  /** Reaching the finish level once records it; levelling on past it changes nothing. */
  private checkFinish(): void {
    if (levelOf(this.store.total()).level >= FINISH_LEVEL && !this.store.has(this.finishKey())) {
      this.store.add(
        this.finishKey(),
        { xp: 0, kind: 'finish', at: this.now().getTime() },
        this.now(),
      );
    }
  }

  /** True the first time it is asked once the save has finished, so the finish screen shows once. */
  firstFinish(): boolean {
    if (!this.store.has(this.finishKey()) || this.store.finishSeen()) {
      return false;
    }
    this.store.markFinishSeen();
    return true;
  }

  /** A save that has neither picked its pet nor earned anything yet opens with the welcome screen. */
  needsWelcome(): boolean {
    return !this.store.welcomed() && this.store.total() === 0;
  }

  welcomed(): void {
    this.store.markWelcomed();
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
      finished: this.store.has(this.finishKey()),
    };
  }
}
