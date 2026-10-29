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
      { command: 'save-state', slot: 'one', state: { petX: 1, food: 'fish' } },
      { command: 'save-state', slot: 'one', state: { petX: 1, food: 'fish' } },
    ],
    [
      { command: 'bag-switch', bag: 'garden', slot: 'one' },
      { command: 'bag-switch', bag: 'garden', slot: 'one' },
    ],
    [
      { command: 'found', bag: 'ocean', toy: 'crab' },
      { command: 'found', bag: 'ocean', toy: 'crab' },
    ],
    [{ command: 'new-save', extra: 1 }, { command: 'new-save' }],
    [{ command: 'start-over' }, { command: 'start-over' }],
    [{ command: 'welcome-done' }, { command: 'welcome-done' }],
    [{ command: 'customize' }, { command: 'customize' }],
    [
      { command: 'peon-copy', step: 2 },
      { command: 'peon-copy', step: 2 },
    ],
    [
      { command: 'visit-profile', id: '2026-10-19-rusty', guest: true },
      { command: 'visit-profile', id: '2026-10-19-rusty', guest: true },
    ],
    [
      { command: 'visit-profile', id: '2026-10-19-rusty' },
      { command: 'visit-profile', id: '2026-10-19-rusty', guest: false },
    ],
    [
      { command: 'profile-hide', id: 'a', hidden: true },
      { command: 'profile-hide', id: 'a', guest: false, hidden: true },
    ],
    [
      { command: 'profile-export', id: null },
      { command: 'profile-export', id: null },
    ],
    [{ command: 'profile-import' }, { command: 'profile-import' }],
    [{ command: 'finish-open' }, { command: 'finish-open' }],
    [
      { command: 'share-copy', toyTotal: 412 },
      { command: 'share-copy', toyTotal: 412 },
    ],
    [
      { command: 'share-copy', toyTotal: -3 },
      { command: 'share-copy', toyTotal: 0 },
    ],
    [
      { command: 'share-post', site: 'bluesky', toyTotal: 4 },
      { command: 'share-post', site: 'bluesky', toyTotal: 4 },
    ],
    [{ command: 'move-out' }, { command: 'move-out' }],
    [
      { command: 'collection', complete: 'all' },
      { command: 'collection', complete: 'all' },
    ],
    [
      { command: 'collection', complete: '' },
      { command: 'collection', complete: '' },
    ],
    [{ command: 'move-in' }, { command: 'move-in' }],
  ])('accepts %j', (msg, parsed) => {
    expect(parseFromWebview(msg)).toEqual(parsed);
  });

  it.each([
    null,
    undefined,
    'ready',
    { command: 'peon-copy', step: -1 },
    { command: 'peon-copy', step: 1.5 },
    { command: 'peon-copy', step: '1' },
    42,
    [],
    {},
    { command: 'explode' },
    { command: 'care', action: 'teleport' },
    { command: 'log', level: 'shout', message: 'x' },
    { command: 'log', level: 'info', message: 42 },
    { command: 'setting', key: 'species', value: 'dragon' },
    { command: 'setting', key: 'wander', value: 'yes' },
    { command: 'save-state', slot: 'one', state: { petX: 'left' } },
    { command: 'save-state', slot: 'one' },
    { command: 'save-state', state: { petX: 1 } },
    { command: 'save-state', slot: '../evil', state: {} },
    { command: 'bag-switch', bag: 'dragons', slot: 'one' },
    { command: 'bag-switch', bag: 'garden' },
    { command: 'found', bag: 'garden', toy: 'Bad Toy' },
    { command: 'found', bag: 'nowhere', toy: 'crab' },
    { command: 'visit-profile', id: '../../etc/passwd' },
    { command: 'visit-profile' },
    { command: 'profile-hide', id: 'a' },
    { command: 'profile-export', id: 'C:/x' },
    { command: 'share-post', site: 'myspace', toyTotal: 1 },
    { command: 'share-card', png: 'data:image/jpeg;base64,/9j/' },
    {
      command: 'share-card',
      png: 'data:image/png;base64,' + Buffer.from('GIF89a').toString('base64'),
    },
    { command: 'share-card', png: 'data:image/png;base64,' + 'A'.repeat(5 * 1024 * 1024) },
    { command: 'share-card', png: 42 },
    { command: 'collection', complete: 'most' },
    { command: 'collection' },
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

describe('share-card', () => {
  it('accepts a PNG data URL and hands over the bytes', () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('rest'),
    ]);
    const msg = parseFromWebview({
      command: 'share-card',
      png: `data:image/png;base64,${png.toString('base64')}`,
    });
    expect(msg).toEqual({ command: 'share-card', png });
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
