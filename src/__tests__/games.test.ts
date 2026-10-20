import { connectGames } from '../games';
import type { WatchEvent } from '../claude-watcher';
import { ProgressService } from '../progress-service';
import { ProgressStore } from '../progress-store';
import { RecordsService } from '../records-service';
import { RecordsStore } from '../records-store';
import type { Storage } from '../storage';

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

const NOW = new Date(2026, 9, 21, 12);
const at = (s: number) => new Date(NOW.getTime() - 3600000 + s * 1000).toISOString();

function setup() {
  let listener: (e: WatchEvent) => void = () => undefined;
  const watcher = {
    onEvent: (l: (e: WatchEvent) => void) => {
      listener = l;
      return { dispose: () => (listener = () => undefined) };
    },
  };
  const storage = memory();
  const records = new RecordsService(new RecordsStore(storage), storage, () => NOW);
  const store = new ProgressStore(storage);
  const progress = new ProgressService(store, () => NOW);
  const subs = connectGames(watcher, records, progress);
  return { fire: (e: WatchEvent) => listener(e), store, records, subs };
}

describe('connectGames', () => {
  it('turns a finished prompt into a record, its XP, and XP for the records it set', () => {
    const { fire, store, records } = setup();
    fire({
      kind: 'line',
      sessionId: 's',
      line: { type: 'user', promptId: 'p1', timestamp: at(0), message: { content: 'go' } },
    });
    fire({
      kind: 'line',
      sessionId: 's',
      line: {
        type: 'assistant',
        timestamp: at(30),
        message: { stop_reason: 'end_turn', content: [] },
      },
    });
    expect(records.snapshot(false).records.length).toBeGreaterThan(0);
    const keys = Object.keys(store.facts());
    expect(keys).toContain('turn:p1');
    expect(keys.some((k) => k.startsWith('record:2026-10-19:'))).toBe(true);
  });

  it('pays for passing runs and finished helpers', () => {
    const { fire, store } = setup();
    fire({
      kind: 'outcome',
      sessionId: 's',
      outcome: { id: 't1', kind: 'test', ok: true, at: NOW.getTime() },
    });
    fire({ kind: 'agent-done', sessionId: 's', agentId: 'a1' });
    fire({ kind: 'session-gone', sessionId: 's' });
    expect(Object.keys(store.facts()).sort()).toEqual(['agent:a1', 'test:t1']);
  });

  it('stops listening once disposed', () => {
    const { fire, store, subs } = setup();
    subs.forEach((d) => d.dispose());
    fire({ kind: 'agent-done', sessionId: 's', agentId: 'a1' });
    expect(store.total()).toBe(0);
  });
});
