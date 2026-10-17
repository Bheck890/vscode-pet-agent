jest.mock(
  'vscode',
  () => ({
    Disposable: class Disposable {
      private readonly fn: () => void;
      constructor(fn: () => void) {
        this.fn = fn;
      }
      dispose(): void {
        this.fn();
      }
    },
  }),
  { virtual: true },
);
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: jest.fn(),
  };
});

import * as fs from 'fs';
import { StateWatcher } from '../state-watcher';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

function stateFilePayload(timestamp: number, event: string, sessionId = SESSION_ID): string {
  return JSON.stringify({
    last_active: {
      timestamp,
      event,
      session_id: sessionId,
      cwd: '/Users/me/workspace',
    },
  });
}

describe('StateWatcher', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    (fs.readFileSync as jest.Mock).mockReset();
  });

  it('emits mapped animation + session update for valid entries', () => {
    jest.useFakeTimers();
    const watcher = new StateWatcher();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const readSpy = fs.readFileSync as jest.Mock;
    readSpy.mockReturnValue(
      stateFilePayload(1, 'UserPromptSubmit') as unknown as ReturnType<typeof fs.readFileSync>,
    );

    const events: string[] = [];
    const sessionCounts: number[] = [];
    watcher.onPeonEvent((event) => events.push(event.anim));
    watcher.onSessionUpdate((update) => sessionCounts.push(update.sessions.length));

    watcher.start();
    jest.advanceTimersByTime(200);
    watcher.stop();

    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['typing']);
    expect(sessionCounts).toEqual([1]);
    nowSpy.mockRestore();
  });

  it('removes a session after SessionEnd and emits empty session list', () => {
    jest.useFakeTimers();
    const watcher = new StateWatcher();
    jest.spyOn(Date, 'now').mockReturnValue(2_000);
    const readSpy = fs.readFileSync as jest.Mock;
    readSpy
      .mockReturnValueOnce(
        stateFilePayload(1, 'SessionStart') as unknown as ReturnType<typeof fs.readFileSync>,
      )
      .mockReturnValueOnce(
        stateFilePayload(2, 'SessionEnd') as unknown as ReturnType<typeof fs.readFileSync>,
      );

    const sessionCounts: number[] = [];
    watcher.onSessionUpdate((update) => sessionCounts.push(update.sessions.length));

    watcher.start();
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    watcher.stop();

    expect(sessionCounts).toEqual([1, 0]);
  });

  it('ignores invalid JSON without throwing or notifying listeners', () => {
    jest.useFakeTimers();
    const watcher = new StateWatcher();
    (fs.readFileSync as jest.Mock).mockReturnValue(
      '{this is not json' as unknown as ReturnType<typeof fs.readFileSync>,
    );

    const onEvent = jest.fn();
    const onSession = jest.fn();
    watcher.onPeonEvent(onEvent);
    watcher.onSessionUpdate(onSession);

    expect(() => {
      watcher.start();
      jest.advanceTimersByTime(200);
      watcher.stop();
    }).not.toThrow();
    expect(onEvent).not.toHaveBeenCalled();
    expect(onSession).not.toHaveBeenCalled();
  });

  /** Polls once per payload (a string, or an Error to throw) and collects what came out. */
  function pollEach(payloads: Array<string | Error>, now = 10_000) {
    jest.useFakeTimers();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const watcher = new StateWatcher();
    const read = fs.readFileSync as jest.Mock;
    for (const p of payloads) {
      if (p instanceof Error) {
        read.mockImplementationOnce(() => {
          throw p;
        });
      } else {
        read.mockReturnValueOnce(p);
      }
    }
    const events: Array<{ anim: string; event: string; cwd: string | null }> = [];
    const sessions: Array<Array<{ id: string; cwd: string | null }>> = [];
    watcher.onPeonEvent((e) => events.push(e));
    watcher.onSessionUpdate((u) => sessions.push(u.sessions));
    watcher.start();
    for (let i = 0; i < payloads.length; i++) {
      jest.advanceTimersByTime(200);
    }
    watcher.stop();
    return { events, sessions, read };
  }

  it('stays quiet when peon-ping is not installed', () => {
    const { events, sessions } = pollEach([new Error('ENOENT')]);
    expect(events).toEqual([]);
    expect(sessions).toEqual([]);
  });

  it.each([
    ['null', 'null'],
    ['no last_active', JSON.stringify({ other: 1 })],
    [
      'a text timestamp',
      JSON.stringify({ last_active: { timestamp: '1', event: 'Stop', session_id: SESSION_ID } }),
    ],
    ['no session id', JSON.stringify({ last_active: { timestamp: 1, event: 'Stop' } })],
    [
      'a numeric cwd',
      JSON.stringify({
        last_active: { timestamp: 1, event: 'Stop', session_id: SESSION_ID, cwd: 5 },
      }),
    ],
  ])('ignores a state file with %s', (_label, payload) => {
    const { events, sessions } = pollEach([payload]);
    expect(events).toEqual([]);
    expect(sessions).toEqual([]);
  });

  it('fires once per new entry, not once per poll', () => {
    const same = stateFilePayload(5, 'Stop');
    const { events, read } = pollEach([same, same, same, stateFilePayload(6, 'Stop')]);
    expect(read).toHaveBeenCalledTimes(4);
    expect(events.map((e) => e.anim)).toEqual(['celebrate', 'celebrate']);
  });

  it('updates sessions for events that have no animation', () => {
    const { events, sessions } = pollEach([stateFilePayload(1, 'SomethingNew')]);
    expect(events).toEqual([]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0][0]).toMatchObject({ id: SESSION_ID, cwd: '/Users/me/workspace' });
  });

  it('still animates for a malformed session id but does not track it', () => {
    const { events, sessions } = pollEach([stateFilePayload(1, 'Stop', 'not-a-uuid')]);
    expect(events.map((e) => e.anim)).toEqual(['celebrate']);
    expect(sessions).toEqual([[]]);
  });

  it('treats a quick second SessionStart as a resume of the first session', () => {
    const other = '650e8400-e29b-41d4-a716-446655440000';
    const { sessions } = pollEach([
      stateFilePayload(1, 'SessionStart'),
      stateFilePayload(2, 'SessionStart', other),
    ]);
    expect(sessions[1].map((s) => s.id)).toEqual([other]);
  });

  it('remembers a session folder for later events that leave it out', () => {
    const noCwd = JSON.stringify({
      last_active: { timestamp: 2, event: 'Stop', session_id: SESSION_ID },
    });
    const { events } = pollEach([stateFilePayload(1, 'SessionStart'), noCwd]);
    expect(events[1]).toEqual({ anim: 'celebrate', event: 'Stop', cwd: '/Users/me/workspace' });
  });

  it('disposing one listener leaves the others listening', () => {
    jest.useFakeTimers();
    const watcher = new StateWatcher();
    (fs.readFileSync as jest.Mock).mockReturnValue(stateFilePayload(1, 'Stop'));
    const kept = jest.fn();
    const dropped = jest.fn();
    watcher.onPeonEvent(kept);
    watcher.onPeonEvent(dropped).dispose();
    watcher.start();
    watcher.start();
    jest.advanceTimersByTime(200);
    watcher.dispose();
    jest.advanceTimersByTime(1000);

    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });
});
