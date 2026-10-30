import {
  CATCH_UP_GAP_MS,
  CHALLENGES,
  XP,
  challengeProgress,
  isCatchUp,
  levelOf,
  turnXp,
  weeklyChallenges,
  xpForLevel,
} from '../progress';
import { BAG_LEVELS, FINISH_LEVEL, bagsUnlocked } from '../bags';
import { ProgressService } from '../progress-service';
import { ProgressStore, parseFacts } from '../progress-store';
import type { Storage } from '../storage';
import type { TurnRecord } from '../turn-tracker';

function memory(): Storage & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: <T>(key: string) => data[key] as T | undefined,
    update: (key: string, value: unknown) => {
      data[key] = JSON.parse(JSON.stringify(value));
      return Promise.resolve();
    },
  };
}

const DAY = 24 * 3600000;
/** Wednesday 2026-10-21, local noon. */
const NOW = new Date(2026, 9, 21, 12);

function turn(over: Partial<TurnRecord> = {}): TurnRecord {
  return {
    promptId: 'p',
    sessionId: 's',
    project: 'app',
    startedAt: NOW.getTime() - 60000,
    endedAt: NOW.getTime(),
    words: 3,
    chars: 12,
    actions: 4,
    subagents: 0,
    outputTokens: 10,
    outcome: 'done',
    preview: 'x',
    ...over,
  };
}

describe('levels', () => {
  it('grows gently and never goes backwards', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
    let last = 0;
    for (let xp = 0; xp < 50000; xp += 37) {
      const info = levelOf(xp);
      expect(info.level).toBeGreaterThanOrEqual(last);
      expect(xp).toBeGreaterThanOrEqual(info.floor);
      expect(xp).toBeLessThan(info.next);
      last = info.level;
    }
  });

  it('pays for prompts by their actions, capped, doubled after a break', () => {
    expect(turnXp(0, false)).toBe(XP.turnBase);
    expect(turnXp(5, false)).toBe(15);
    expect(turnXp(500, false)).toBe(XP.turnCap);
    expect(turnXp(5, true)).toBe(30);
  });
});

describe('catch-up', () => {
  const t0 = NOW.getTime();
  it('is not for a brand-new pet or a steady week', () => {
    expect(isCatchUp(t0, [])).toBe(false);
    expect(isCatchUp(t0, [t0 - DAY, t0 - 2 * DAY])).toBe(false);
  });

  it('covers the first three prompts after a week away, then stops', () => {
    const before = [t0 - 20 * DAY, t0 - 19 * DAY];
    const back = t0 - 19 * DAY + CATCH_UP_GAP_MS;
    expect(isCatchUp(back, before)).toBe(true);
    expect(isCatchUp(back + 1000, [...before, back])).toBe(true);
    expect(isCatchUp(back + 2000, [...before, back, back + 1000])).toBe(true);
    expect(isCatchUp(back + 3000, [...before, back, back + 1000, back + 2000])).toBe(false);
  });
});

describe('weekly challenges', () => {
  it("never gives a helper care or toy challenges it can't do", () => {
    for (const w of ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']) {
      const kinds = weeklyChallenges(w, true).map((c) => c.kind);
      expect(kinds).toHaveLength(3);
      expect(kinds.filter((k) => k.startsWith('care') || k === 'find')).toEqual([]);
    }
  });

  it('picks three different ones, the same all week, changing week to week', () => {
    const a = weeklyChallenges('2026-10-19');
    expect(new Set(a.map((c) => c.id)).size).toBe(3);
    expect(weeklyChallenges('2026-10-19')).toEqual(a);
    const weeks = ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'].map((w) =>
      weeklyChallenges(w)
        .map((c) => c.id)
        .join(),
    );
    expect(new Set(weeks).size).toBeGreaterThan(1);
  });

  it('every challenge can be reached', () => {
    for (const c of CHALLENGES) {
      const facts = Array.from({ length: c.target }, (_, i) => ({
        xp: 1,
        kind: c.kind,
        at: NOW.getTime() - i * (c.days ? DAY : 1000),
      }));
      expect([c.id, challengeProgress(c, facts, NOW.getTime() - 10 * DAY)]).toEqual([
        c.id,
        c.target,
      ]);
    }
  });

  it('counts only this week, and distinct days where asked', () => {
    const days = CHALLENGES.find((c) => c.days)!;
    const sameDay = [0, 1, 2, 3].map((i) => ({ xp: 1, kind: days.kind, at: NOW.getTime() + i }));
    expect(challengeProgress(days, sameDay, 0)).toBe(1);
    const prompts = CHALLENGES.find((c) => c.id === 'prompts')!;
    const old = [{ xp: 1, kind: 'turn', at: NOW.getTime() - 30 * DAY }];
    expect(challengeProgress(prompts, old, NOW.getTime() - DAY)).toBe(0);
  });
});

describe('ProgressStore', () => {
  it('ignores a key it already has, from this window or another', () => {
    const storage = memory();
    const a = new ProgressStore(storage);
    const b = new ProgressStore(storage);
    expect(a.add('turn:p', { xp: 10, kind: 'turn', at: NOW.getTime() }, NOW)).toBe(true);
    expect(b.add('turn:p', { xp: 10, kind: 'turn', at: NOW.getTime() }, NOW)).toBe(false);
    expect(a.total()).toBe(10);
  });

  it('folds old facts into monthly totals without losing or doubling XP', () => {
    const storage = memory();
    const store = new ProgressStore(storage);
    const old = new Date(2026, 6, 10).getTime();
    store.add('turn:a', { xp: 10, kind: 'turn', at: old }, new Date(2026, 6, 11));
    store.add('turn:b', { xp: 15, kind: 'turn', at: old + DAY }, new Date(2026, 6, 12));
    expect(store.total()).toBe(25);
    store.add('turn:c', { xp: 5, kind: 'turn', at: NOW.getTime() }, NOW);
    expect(Object.keys(store.facts())).toEqual(['turn:c']);
    expect(store.total()).toBe(30);
    // Another window folding the same month again keeps the larger total.
    storage.data['petXp'] = {
      ...(storage.data['petXp'] as object),
      'turn:a': { xp: 10, kind: 'turn', at: old },
    };
    store.add('turn:d', { xp: 5, kind: 'turn', at: NOW.getTime() }, NOW);
    expect(store.total()).toBe(35);
  });

  it('drops malformed facts', () => {
    expect(
      parseFacts({
        ok: { xp: 1, kind: 'turn', at: 1 },
        neg: { xp: -1, kind: 'turn', at: 1 },
        text: { xp: '5', kind: 'turn', at: 1 },
        none: null,
      }),
    ).toEqual({ ok: { xp: 1, kind: 'turn', at: 1 } });
  });
});

describe('ProgressService', () => {
  function service(slot = { id: 'one', startedAt: 0 }) {
    const storage = memory();
    const store = new ProgressStore(storage);
    const svc = new ProgressService(
      store,
      () => NOW,
      () => slot,
    );
    const changes = jest.fn();
    svc.onChange(changes);
    return { svc, store, storage, changes };
  }

  it('earns XP for prompts once, however many windows report them', () => {
    const { svc, store, changes } = service();
    svc.turns([turn()]);
    svc.turns([turn()]);
    svc.turns([turn({ promptId: 'q', outcome: 'interrupted' })]);
    expect(store.total()).toBe(turnXp(4, false));
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('adds a backfill of many prompts in one write and one change', () => {
    const { svc, store, changes } = service();
    const update = jest.spyOn(store, 'addMany');
    const many = Array.from({ length: 200 }, (_, i) =>
      turn({ promptId: `p${i}`, endedAt: NOW.getTime() - i * 1000 }),
    );
    svc.turns(many);
    expect(update).toHaveBeenCalledTimes(1);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(Object.keys(store.facts()).filter((k) => k.startsWith('turn:'))).toHaveLength(200);
  });

  it('doubles the first prompts back after a long break, within one batch too', () => {
    const { svc, store } = service();
    const t0 = NOW.getTime();
    svc.turns([turn({ promptId: 'old', endedAt: t0 - 20 * DAY })]);
    svc.turns(
      [1, 2, 3, 4].map((i) => turn({ promptId: `back${i}`, endedAt: t0 + i * 1000, actions: 0 })),
    );
    const xp = [1, 2, 3, 4].map((i) => store.facts()[`turn:back${i}`].xp);
    expect(xp).toEqual([20, 20, 20, 10]);
  });

  it('pays for passing runs, and a pass after failures squashes the bugs', () => {
    const { svc, store } = service();
    const at = NOW.getTime();
    svc.outcome('s', { id: 't1', kind: 'test', ok: false, at });
    svc.outcome('s', { id: 't2', kind: 'test', ok: false, at });
    expect(store.total()).toBe(0);
    svc.outcome('s', { id: 't3', kind: 'test', ok: true, at });
    expect(store.facts()['squash:t3']).toMatchObject({ xp: XP.squash });
    svc.outcome('s', { id: 't4', kind: 'test', ok: true, at });
    expect(store.facts()['squash:t4']).toBeUndefined();
    svc.outcome('s', { id: 'b1', kind: 'build', ok: true, at });
    expect(store.total()).toBe(XP.test * 2 + XP.squash + XP.build);
  });

  it("doesn't let one session's pass squash another's bugs", () => {
    const { svc, store } = service();
    const at = NOW.getTime();
    svc.outcome('a', { id: 't1', kind: 'test', ok: false, at });
    svc.outcome('b', { id: 't2', kind: 'test', ok: true, at });
    expect(store.facts()['squash:t2']).toBeUndefined();
  });

  it('caps care XP per day', () => {
    const { svc, store } = service();
    for (let i = 0; i < 30; i++) {
      svc.care('pet');
    }
    expect(store.total()).toBe(XP.care * XP.carePerDay);
  });

  it('pays for helpers and records once each', () => {
    const { svc, store } = service();
    svc.agentDone('a1');
    svc.agentDone('a1');
    svc.record('busiest', NOW.getTime());
    svc.record('busiest', NOW.getTime());
    expect(store.total()).toBe(XP.agent + XP.record);
  });

  it("completes this week's challenges and reports them", () => {
    const { svc, store } = service();
    const snap = svc.snapshot();
    expect(snap.week).toBe('2026-10-19');
    expect(snap.challenges).toHaveLength(3);
    expect(snap.level).toBe(1);
    const [first] = weeklyChallenges(snap.week);
    for (let i = 0; i < first.target; i++) {
      const at = new Date(2026, 9, 19, 9).getTime() + i * (first.days ? DAY : 1000);
      store.add(`fake:${i}`, { xp: 0, kind: first.kind, at }, NOW);
    }
    svc.agentDone('trigger');
    expect(store.facts()[`challenge:2026-10-19:${first.id}`]).toMatchObject({
      xp: XP.challenge,
    });
    expect(svc.snapshot().challenges.find((c) => c.id === first.id)?.done).toBe(true);
  });
});

describe('bag ladder', () => {
  it('covers 20 bags, one each for levels 1 to 5, then every 2 levels', () => {
    expect(BAG_LEVELS).toHaveLength(20);
    expect(BAG_LEVELS.map((b) => b.level)).toEqual([
      1, 2, 3, 4, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35,
    ]);
    expect(bagsUnlocked(1)).toEqual(['starter']);
    expect(bagsUnlocked(6)).toHaveLength(5);
    expect(bagsUnlocked(1, false)).toHaveLength(20);
  });

  it('gives every house two free rooms and at most four', () => {
    for (const b of BAG_LEVELS) {
      expect([b.id, b.rooms.length >= 3 && b.rooms.length <= 4]).toEqual([b.id, true]);
      expect(b.rooms.every((r) => /^[a-z]+$/.test(r))).toBe(true);
    }
  });

  it('finishes at the level of the last bag', () => {
    expect(FINISH_LEVEL).toBe(BAG_LEVELS[BAG_LEVELS.length - 1].level);
  });
});

describe('finishing and saves', () => {
  function service(slot = { id: 'one', startedAt: 0 }) {
    const storage = memory();
    const store = new ProgressStore(storage);
    return {
      svc: new ProgressService(
        store,
        () => NOW,
        () => slot,
      ),
      store,
    };
  }

  it('records the finish once, when the finish level is reached, and keeps it for good', () => {
    const { svc, store } = service();
    store.add('big', { xp: 59000, kind: 'test', at: NOW.getTime() }, NOW);
    svc.agentDone('a');
    expect(svc.snapshot().finished).toBe(false);
    store.add('bigger', { xp: 2000, kind: 'test', at: NOW.getTime() }, NOW);
    svc.agentDone('b');
    expect(svc.snapshot()).toMatchObject({ level: 35, finished: true });
    svc.agentDone('c');
    expect(Object.keys(store.facts()).filter((k) => k.startsWith('finish:'))).toEqual([
      'finish:one',
    ]);
    expect(svc.firstFinish()).toBe(true);
    expect(svc.firstFinish()).toBe(false);
    // Two months on, everything else is folded into the bank; the finish stays.
    const later = new Date(2027, 0, 5);
    store.add('next', { xp: 1, kind: 'agent', at: later.getTime() }, later);
    expect(Object.keys(store.facts())).toEqual(expect.arrayContaining(['finish:one', 'next']));
    expect(store.facts()['big']).toBeUndefined();
  });

  it('ignores facts dated before the save started, so a replay pays nothing', () => {
    const { svc, store } = service({ id: 'two', startedAt: NOW.getTime() - 1000 });
    svc.turns([turn({ promptId: 'old', endedAt: NOW.getTime() - 5000 })]);
    svc.outcome('s', { kind: 'test', ok: true, id: 't-old', at: NOW.getTime() - 5000 } as never);
    expect(store.total()).toBe(0);
    svc.turns([turn({ promptId: 'new' })]);
    expect(store.total()).toBeGreaterThan(0);
  });

  it('keeps lifetime totals for the finish card, counting each prompt once', () => {
    const { svc, store } = service();
    const t = turn({ promptId: 'a', actions: 4, startedAt: NOW.getTime() - 3600000 });
    svc.turns([t]);
    svc.turns([t]);
    svc.record('marathon', NOW.getTime());
    svc.record('marathon', NOW.getTime());
    expect(store.lifetime()).toEqual({ prompts: 1, actions: 4, agentMs: 3600000, records: 1 });
  });

  it('counts first finds from bags past the starter one for the collector challenge', () => {
    const { svc, store } = service();
    svc.found('starter', 'yarn');
    svc.found('garden', 'snail');
    svc.found('garden', 'snail');
    svc.found('ocean', 'crab');
    expect(Object.keys(store.facts()).sort()).toEqual(['find:crab', 'find:snail']);
    expect(store.total()).toBe(0);
  });
});
