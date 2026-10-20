import { isWebviewState, parseFromWebview } from '../protocol';

describe('parseFromWebview', () => {
  it.each([
    [{ command: 'ready' }, { command: 'ready' }],
    [{ command: 'refresh', extra: 1 }, { command: 'refresh' }],
    [
      { command: 'care', action: 'kibble' },
      { command: 'care', action: 'kibble' },
    ],
    [
      { command: 'log', level: 'warn', message: 'hi' },
      { command: 'log', level: 'warn', message: 'hi' },
    ],
    [
      { command: 'gather-logs', snapshot: '{}' },
      { command: 'gather-logs', snapshot: '{}' },
    ],
    [
      { command: 'gather-logs', snapshot: 5 },
      { command: 'gather-logs', snapshot: null },
    ],
    [
      { command: 'setting', key: 'variety', value: false },
      { command: 'setting', key: 'variety', value: 'classic' },
    ],
    [
      { command: 'save-state', state: { petX: 1, food: 'fish' } },
      { command: 'save-state', state: { petX: 1, food: 'fish' } },
    ],
  ])('accepts %j', (msg, parsed) => {
    expect(parseFromWebview(msg)).toEqual(parsed);
  });

  it.each([
    null,
    undefined,
    'ready',
    42,
    [],
    {},
    { command: 'explode' },
    { command: 'care', action: 'teleport' },
    { command: 'log', level: 'shout', message: 'x' },
    { command: 'log', level: 'info', message: 42 },
    { command: 'setting', key: 'species', value: 'dragon' },
    { command: 'setting', key: 'wander', value: 'yes' },
    { command: 'save-state', state: { petX: 'left' } },
    { command: 'save-state' },
  ])('rejects %j', (msg) => {
    expect(parseFromWebview(msg)).toBeNull();
  });

  it('caps the length of view log lines and debug snapshots', () => {
    const long = 'x'.repeat(10000);
    const log = parseFromWebview({ command: 'log', level: 'info', message: long });
    const snap = parseFromWebview({ command: 'gather-logs', snapshot: long });
    expect(log).toMatchObject({ message: 'x'.repeat(2000) });
    expect(snap).toMatchObject({ snapshot: 'x'.repeat(4000) });
  });
});

describe('isWebviewState', () => {
  it('accepts an empty state and a full one', () => {
    expect(isWebviewState({})).toBe(true);
    expect(
      isWebviewState({
        petX: 1,
        petY: 2,
        bag: { yarn: 2 },
        spent: { yarn: 1 },
        unlocks: ['idle.disco'],
        food: 'fish',
      }),
    ).toBe(true);
  });

  it.each([
    null,
    'state',
    { petY: NaN },
    { bag: { yarn: '2' } },
    { spent: null },
    { unlocks: [1] },
    { food: false },
  ])('rejects %j', (state) => {
    expect(isWebviewState(state)).toBe(false);
  });
});
