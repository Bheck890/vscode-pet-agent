import {
  isValidSessionId,
  createSessionTracker,
  buildSessionStates,
  EVENT_TO_ANIM,
} from '../session-tracker';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('isValidSessionId', () => {
  it('accepts a well-formed UUID', () => {
    expect(isValidSessionId(VALID_UUID)).toBe(true);
  });

  it('accepts a UUID with uppercase hex digits', () => {
    expect(isValidSessionId('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('rejects a string that is not a UUID', () => {
    expect(isValidSessionId('not-a-uuid')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidSessionId('')).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidSessionId(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidSessionId(undefined)).toBe(false);
  });

  it('rejects a number', () => {
    expect(isValidSessionId(42)).toBe(false);
  });
});

describe('createSessionTracker', () => {
  it('starts empty', () => {
    const t = createSessionTracker();
    expect(t.size()).toBe(0);
    expect(t.entries()).toEqual([]);
  });

  it('tracks a session after update', () => {
    const t = createSessionTracker();
    t.update(VALID_UUID, 1000);
    expect(t.size()).toBe(1);
    expect(t.entries()).toEqual([[VALID_UUID, 1000]]);
  });

  it('overwrites timestamp on repeated update', () => {
    const t = createSessionTracker();
    t.update(VALID_UUID, 1000);
    t.update(VALID_UUID, 2000);
    expect(t.size()).toBe(1);
    expect(t.entries()[0][1]).toBe(2000);
  });

  it('removes a session', () => {
    const t = createSessionTracker();
    t.update(VALID_UUID, 1000);
    t.remove(VALID_UUID);
    expect(t.size()).toBe(0);
  });

  it('prunes sessions older than cutoff', () => {
    const t = createSessionTracker();
    t.update('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100);
    t.update('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 900);
    t.prune(500);
    expect(t.size()).toBe(1);
    expect(t.entries()[0][0]).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  });

  it('prune is a no-op when no sessions are stale', () => {
    const t = createSessionTracker();
    t.update(VALID_UUID, 1000);
    t.prune(500);
    expect(t.size()).toBe(1);
  });
});

describe('buildSessionStates', () => {
  const id1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const id2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const now = 60_000;
  const HOT = 30_000;
  const WARM = 120_000;

  it('marks a recent session as hot and warm', () => {
    const states = buildSessionStates([[id1, now - 5_000]], now, HOT, WARM, 10);
    expect(states).toHaveLength(1);
    expect(states[0].hot).toBe(true);
    expect(states[0].warm).toBe(true);
    expect(states[0].cwd).toBeNull();
  });

  it('marks a session as warm but not hot after HOT window', () => {
    const states = buildSessionStates([[id1, now - 35_000]], now, HOT, WARM, 10);
    expect(states[0].hot).toBe(false);
    expect(states[0].warm).toBe(true);
  });

  it('marks a session as neither hot nor warm after WARM window', () => {
    const states = buildSessionStates([[id1, now - 130_000]], now, HOT, WARM, 10);
    expect(states[0].hot).toBe(false);
    expect(states[0].warm).toBe(false);
  });

  it('sorts sessions by recency, most recent first', () => {
    const entries: [string, number][] = [
      [id1, now - 10_000],
      [id2, now - 1_000],
    ];
    const states = buildSessionStates(entries, now, HOT, WARM, 10);
    expect(states[0].id).toBe(id2);
    expect(states[1].id).toBe(id1);
  });

  it('caps results at maxCount', () => {
    const entries: [string, number][] = [
      [id1, now - 1_000],
      [id2, now - 2_000],
    ];
    const states = buildSessionStates(entries, now, HOT, WARM, 1);
    expect(states).toHaveLength(1);
    expect(states[0].id).toBe(id1);
  });

  it('returns empty array for no entries', () => {
    expect(buildSessionStates([], now, HOT, WARM, 10)).toEqual([]);
  });
});

describe('EVENT_TO_ANIM', () => {
  it('maps expected events to animations', () => {
    expect(EVENT_TO_ANIM['SessionStart']).toBe('waking');
    expect(EVENT_TO_ANIM['Stop']).toBe('celebrate');
    expect(EVENT_TO_ANIM['UserPromptSubmit']).toBe('typing');
    expect(EVENT_TO_ANIM['PermissionRequest']).toBe('alarmed');
    expect(EVENT_TO_ANIM['PostToolUseFailure']).toBe('annoyed');
    expect(EVENT_TO_ANIM['PreCompact']).toBe('alarmed');
  });

  it('does not map SessionEnd to an animation', () => {
    expect(EVENT_TO_ANIM['SessionEnd']).toBeUndefined();
  });
});
