import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CATEGORIES, bestOf, beats, counts, formatDuration, totals } from '../records';
import { RecordsService } from '../records-service';
import { RecordsStore, parseTurn } from '../records-store';
import type { Storage } from '../storage';
import { TurnRecord, applyTurnLine, createTurnTracker } from '../turn-tracker';

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

/** Wednesday 2026-10-21, local noon. */
const NOW = new Date(2026, 9, 21, 12);
const T0 = NOW.getTime() - 60 * 60 * 1000;
const at = (ms: number) => new Date(T0 + ms).toISOString();

const prompt = (id: string, text: string, ms: number, extra: object = {}) => ({
  type: 'user',
  promptId: id,
  timestamp: at(ms),
  cwd: 'C:\\code\\my-app',
  message: { content: text },
  ...extra,
});
const toolUse = (ms: number, name = 'Read', msgId = `m${ms}`, tokens = 10) => ({
  type: 'assistant',
  timestamp: at(ms),
  message: {
    id: msgId,
    stop_reason: 'tool_use',
    usage: { output_tokens: tokens },
    content: [{ type: 'tool_use', id: `t${ms}`, name, input: {} }],
  },
});
const toolResult = (ms: number) => ({
  type: 'user',
  timestamp: at(ms),
  message: { content: [{ type: 'tool_result', tool_use_id: `t${ms}` }] },
});
const endTurn = (ms: number, msgId = `e${ms}`, tokens = 5) => ({
  type: 'assistant',
  timestamp: at(ms),
  message: {
    id: msgId,
    stop_reason: 'end_turn',
    usage: { output_tokens: tokens },
    content: [{ type: 'text', text: 'Done.' }],
  },
});

function turn(over: Partial<TurnRecord> = {}): TurnRecord {
  return {
    promptId: 'p',
    sessionId: 's',
    project: 'app',
    startedAt: T0,
    endedAt: T0 + 60000,
    words: 10,
    chars: 50,
    actions: 5,
    subagents: 0,
    outputTokens: 100,
    outcome: 'done',
    preview: 'fix the bug',
    ...over,
  };
}

describe('turn tracker', () => {
  it('turns a prompt and its work into one record', () => {
    const t = createTurnTracker('s1');
    const lines = [
      prompt('p1', '  Fix   the login bug ', 0),
      toolUse(1000, 'Read'),
      toolResult(1500),
      toolUse(2000, 'Agent'),
      toolUse(2000, 'Task', 'm2000b'),
      endTurn(9000),
    ];
    const out = lines.map((l) => applyTurnLine(t, l)).filter(Boolean);
    expect(out).toEqual([
      {
        promptId: 'p1',
        sessionId: 's1',
        project: 'my-app',
        startedAt: T0,
        endedAt: T0 + 9000,
        words: 4,
        chars: 17,
        actions: 3,
        subagents: 2,
        outputTokens: 35,
        outcome: 'done',
        preview: 'Fix the login bug',
      },
    ]);
  });

  it('counts the usage of a message split over several lines once', () => {
    const t = createTurnTracker('s');
    applyTurnLine(t, prompt('p', 'go', 0));
    applyTurnLine(t, toolUse(1000, 'Read', 'same', 40));
    applyTurnLine(t, toolUse(1100, 'Grep', 'same', 40));
    const rec = applyTurnLine(t, endTurn(2000, 'end', 2));
    expect(rec).toMatchObject({ actions: 2, outputTokens: 42 });
  });

  it('records an interrupted turn as interrupted', () => {
    const t = createTurnTracker('s');
    applyTurnLine(t, prompt('p', 'go', 0));
    const rec = applyTurnLine(t, {
      type: 'user',
      timestamp: at(5000),
      message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] },
    });
    expect(rec).toMatchObject({ promptId: 'p', outcome: 'interrupted', endedAt: T0 + 5000 });
  });

  it('ignores plumbing, meta lines, tool results and turns it saw no prompt for', () => {
    const t = createTurnTracker('s');
    expect(applyTurnLine(t, endTurn(100))).toBeNull();
    applyTurnLine(t, prompt('cmd', '<command-name>/clear</command-name>', 0));
    applyTurnLine(t, prompt('meta', 'caveat', 0, { isMeta: true }));
    expect(applyTurnLine(t, endTurn(200))).toBeNull();
    expect(applyTurnLine(t, null)).toBeNull();
    expect(applyTurnLine(t, 'junk')).toBeNull();
  });

  it('starts over when a new prompt arrives mid-turn', () => {
    const t = createTurnTracker('s');
    applyTurnLine(t, prompt('a', 'first', 0));
    applyTurnLine(t, toolUse(100));
    applyTurnLine(t, prompt('b', 'second one', 200));
    expect(applyTurnLine(t, endTurn(5000))).toMatchObject({ promptId: 'b', actions: 0, words: 2 });
  });

  it('clips long prompts for the preview', () => {
    const t = createTurnTracker('s');
    applyTurnLine(t, prompt('p', 'word '.repeat(100), 0));
    const rec = applyTurnLine(t, endTurn(4000))!;
    expect(rec.preview.length).toBe(80);
    expect(rec.preview.endsWith('...')).toBe(true);
    expect(rec.words).toBe(100);
  });
});

describe('records', () => {
  it('formats durations', () => {
    expect(formatDuration(4200)).toBe('4s');
    expect(formatDuration(185000)).toBe('3m 05s');
    expect(formatDuration(2 * 3600000 + 7 * 60000)).toBe('2h 07m');
  });

  it('only counts finished turns of a few seconds', () => {
    expect(counts(turn())).toBe(true);
    expect(counts(turn({ outcome: 'interrupted' }))).toBe(false);
    expect(counts(turn({ endedAt: T0 + 1000 }))).toBe(false);
  });

  it('picks a winner per category', () => {
    const tiny = turn({ promptId: 'tiny', words: 2, endedAt: T0 + 600000, actions: 40 });
    const essay = turn({ promptId: 'essay', words: 400, endedAt: T0 + 5000, actions: 1 });
    const helpers = turn({ promptId: 'helpers', subagents: 4 });
    const best = bestOf([tiny, essay, helpers]);
    expect(best['tinyEpic']?.promptId).toBe('tiny');
    expect(best['essay']?.promptId).toBe('essay');
    expect(best['busiest']?.promptId).toBe('tiny');
    expect(best['sniper']?.promptId).toBe('essay');
    expect(best['litter']?.promptId).toBe('helpers');
    expect(best['marathon']?.promptId).toBe('tiny');
  });

  it('leaves a category empty when nothing qualifies', () => {
    const best = bestOf([turn({ subagents: 0, words: 3 })]);
    expect(best['litter']).toBeNull();
    expect(best['essay']).toBeNull();
  });

  it('breaks ties in favour of the earlier turn', () => {
    const busiest = CATEGORIES.find((c) => c.id === 'busiest')!;
    const early = turn({ promptId: 'a', endedAt: T0 + 10000 });
    const late = turn({ promptId: 'b', endedAt: T0 + 20000 });
    expect(beats(busiest, early, late)).toBe(true);
    expect(beats(busiest, late, early)).toBe(false);
  });

  it('every category describes its winner', () => {
    for (const cat of CATEGORIES) {
      expect(cat.describe(turn({ subagents: 2 }))).toMatch(/\d/);
    }
  });

  it('sums the week', () => {
    expect(totals([turn(), turn({ actions: 1, subagents: 2 })])).toEqual({
      prompts: 2,
      actions: 6,
      subagents: 2,
      agentMs: 120000,
    });
  });
});

describe('RecordsStore', () => {
  it('stores each prompt once however often it is added', () => {
    const store = new RecordsStore(memory());
    expect(store.add([turn()], NOW).added).toHaveLength(1);
    expect(store.add([turn()], NOW).added).toHaveLength(0);
    expect(store.turns()).toHaveLength(1);
  });

  it('reports the weekly categories a new turn takes', () => {
    const store = new RecordsStore(memory());
    expect(store.add([turn({ promptId: 'a', actions: 5 })], NOW).broken).toContain('busiest');
    const change = store.add([turn({ promptId: 'b', actions: 9 })], NOW);
    expect(change.broken).toContain('busiest');
    expect(change.broken).not.toContain('sniper');
  });

  it('keeps this week and last, and drops older turns', () => {
    const store = new RecordsStore(memory());
    const day = 24 * 3600000;
    store.add(
      [
        turn({ promptId: 'now' }),
        turn({ promptId: 'lastWeek', startedAt: T0 - 7 * day, endedAt: T0 - 7 * day + 60000 }),
        turn({ promptId: 'old', startedAt: T0 - 20 * day, endedAt: T0 - 20 * day + 60000 }),
      ],
      NOW,
    );
    expect(
      store
        .turns()
        .map((t) => t.promptId)
        .sort(),
    ).toEqual(['lastWeek', 'now']);
    expect(store.week(NOW).map((t) => t.promptId)).toEqual(['now']);
  });

  it('keeps the all-time best even after its week is gone', () => {
    const storage = memory();
    const store = new RecordsStore(storage);
    const day = 24 * 3600000;
    store.add([turn({ promptId: 'legend', actions: 99 })], NOW);
    const later = new Date(NOW.getTime() + 30 * day);
    store.add(
      [
        turn({
          promptId: 'today',
          actions: 3,
          startedAt: later.getTime(),
          endedAt: later.getTime() + 9000,
        }),
      ],
      later,
    );
    expect(store.turns().map((t) => t.promptId)).toEqual(['today']);
    expect(store.hallOfFame()['busiest'].promptId).toBe('legend');
  });

  it('drops malformed stored turns', () => {
    const storage = memory();
    storage.data['petTurns'] = { a: { promptId: 'a' }, b: turn({ promptId: 'b' }), c: 'x' };
    storage.data['petHallOfFame'] = { busiest: { nope: true }, marathon: turn() };
    const store = new RecordsStore(storage);
    expect(store.turns().map((t) => t.promptId)).toEqual(['b']);
    expect(Object.keys(store.hallOfFame())).toEqual(['marathon']);
    expect(parseTurn(turn({ outcome: 'weird' as 'done' }))).toBeNull();
    expect(parseTurn(turn({ actions: -1 }))).toBeNull();
  });
});

describe('RecordsService', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-records-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function writeTranscript(project: string, id: string, lines: object[]) {
    fs.mkdirSync(path.join(dir, project), { recursive: true });
    fs.writeFileSync(
      path.join(dir, project, `${id}.jsonl`),
      lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
    );
  }

  it('records live lines per session and tells listeners about new turns', () => {
    const service = new RecordsService(new RecordsStore(memory()), memory(), () => NOW);
    const heard: Array<[string[], string[]]> = [];
    service.onTurns((turns, broken) => heard.push([turns.map((t) => t.promptId), broken]));
    service.line('s1', prompt('p1', 'go', 0));
    service.line('s2', prompt('p2', 'other', 0));
    service.line('s1', toolUse(1000));
    service.line('s1', endTurn(8000));
    expect(heard).toHaveLength(1);
    expect(heard[0][0]).toEqual(['p1']);
    expect(heard[0][1]).toContain('busiest');
    // The same turn from another window's replay changes nothing.
    service.line('s3', prompt('p1', 'go', 0));
    service.line('s3', endTurn(8000));
    expect(heard).toHaveLength(1);
  });

  it("backfills this week's transcripts once a day", async () => {
    const storage = memory();
    const store = new RecordsStore(storage);
    const service = new RecordsService(store, storage, () => NOW);
    writeTranscript('proj', 'sess', [
      prompt('p1', 'go', 0),
      toolUse(1000),
      endTurn(9000),
      prompt('p2', 'again please', 20000),
      endTurn(30000),
    ]);
    expect(await service.backfill(dir)).toBe(2);
    expect(store.turns()).toHaveLength(2);
    expect(await service.backfill(dir)).toBe(0);
  });

  it('skips transcripts untouched this week and copes with a missing folder', async () => {
    const storage = memory();
    const service = new RecordsService(new RecordsStore(storage), storage, () => NOW);
    writeTranscript('proj', 'old', [prompt('p1', 'go', 0), endTurn(9000)]);
    const old = new Date(2026, 8, 1);
    fs.utimesSync(path.join(dir, 'proj', 'old.jsonl'), old, old);
    expect(await service.backfill(dir)).toBe(0);
    storage.data['petBackfillDay'] = undefined;
    expect(await service.backfill(path.join(dir, 'missing'))).toBe(0);
  });

  it('builds the board, hiding prompts unless asked', () => {
    const service = new RecordsService(new RecordsStore(memory()), memory(), () => NOW);
    service.line('s', prompt('p1', 'make it faster', 0));
    service.line('s', toolUse(1000));
    service.line('s', endTurn(65000));
    const hidden = service.snapshot(false);
    expect(hidden.week).toBe('2026-10-19');
    expect(hidden.records.find((r) => r.id === 'busiest')).toMatchObject({
      emoji: '⚙️',
      value: '1 action in 1m 05s',
      project: 'my-app',
    });
    expect(hidden.records.every((r) => r.preview === undefined)).toBe(true);
    expect(hidden.totals).toMatchObject({ prompts: 1, actions: 1, agentTime: '1m 05s' });
    expect(service.snapshot(true).records[0].preview).toBe('make it faster');
    expect(hidden.hallOfFame.length).toBeGreaterThan(0);
  });
});
