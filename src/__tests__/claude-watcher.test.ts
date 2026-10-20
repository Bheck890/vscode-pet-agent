import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-home-'));

jest.mock('os', () => ({ ...jest.requireActual('os'), homedir: () => mockHome }));
jest.mock(
  'vscode',
  () => ({
    Disposable: class Disposable {
      constructor(private readonly fn: () => void) {}
      dispose(): void {
        this.fn();
      }
    },
  }),
  { virtual: true },
);

import { ClaudeWatcher, ClaudeUpdate } from '../claude-watcher';

const projects = path.join(mockHome, '.claude', 'projects');

function line(obj: Record<string, unknown>, at = new Date()): string {
  return JSON.stringify({ timestamp: at.toISOString(), ...obj }) + '\n';
}

function writeSession(
  project: string,
  id: string,
  cwd: string,
  body: string,
  at = new Date(),
): string {
  const dir = path.join(projects, project);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, line({ type: 'user', cwd, message: { content: 'go' } }, at) + body);
  return dir;
}

function snapshot(folders: string[]): ClaudeUpdate | null {
  const watcher = new ClaudeWatcher(() => folders);
  let update: ClaudeUpdate | null = null;
  watcher.onUpdate((u) => (update = u));
  watcher.start();
  watcher.dispose();
  return update;
}

afterEach(() => fs.rmSync(projects, { recursive: true, force: true }));
afterAll(() => fs.rmSync(mockHome, { recursive: true, force: true }));

describe('ClaudeWatcher', () => {
  it('reports nothing when there are no transcripts', () => {
    const u = snapshot([]);
    expect(u?.main ?? null).toBeNull();
  });

  it('reports the main session state and project name', () => {
    writeSession(
      'p1',
      'sess-1',
      '/work/my-app',
      line({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }],
        },
      }),
    );
    const u = snapshot(['/work/my-app']);
    expect(u?.main).toMatchObject({ sessionId: 'sess-1', state: 'testing', project: 'my-app' });
    expect(u?.main?.jobs).toEqual([
      { id: 't1', kind: 'test', label: 'npm test', background: false },
    ]);
    expect(u?.sessions[0]).toMatchObject({ id: 'sess-1', hot: true, cwd: '/work/my-app' });
  });

  it('prefers a session inside the open workspace over a newer one elsewhere', () => {
    writeSession('p1', 'mine', 'C:\\Code\\Mine\\sub', '');
    const other = writeSession('p2', 'other', '/elsewhere', '');
    const later = new Date(Date.now() + 1000);
    fs.utimesSync(path.join(other, 'other.jsonl'), later, later);
    expect(snapshot(['c:\\code\\mine'])?.main?.sessionId).toBe('mine');
  });

  it('spawns sub-agents with a funny name and their task', () => {
    const dir = writeSession('p1', 'sess-1', '/work/app', '');
    const subDir = path.join(dir, 'sess-1', 'subagents');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(
      path.join(subDir, 'agent-abc.meta.json'),
      JSON.stringify({ agentType: 'Explore', description: 'Find the login screen' }),
    );
    fs.writeFileSync(
      path.join(subDir, 'agent-abc.jsonl'),
      line({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'x', name: 'Grep', input: { pattern: 'login' } }],
        },
      }),
    );
    const u = snapshot(['/work/app']);
    expect(u?.subagents).toHaveLength(1);
    expect(u?.subagents[0]).toMatchObject({
      id: 'abc',
      agentType: 'Explore',
      task: 'Find the login screen',
      state: 'reading',
    });
    expect(u?.subagents[0].name).toMatch(/^(Detective|Scout|Sniffer|Tracker|Sleuth) /);
  });

  it('reports a second busy session in this workspace as a background agent', () => {
    // Older by its transcript times as well as its file time: lines written in the
    // same millisecond as the newer session's would tie on a fast machine.
    const earlier = new Date(Date.now() - 30_000);
    const dir = writeSession('p1', 'older', '/work/mine/tools', '', earlier);
    fs.utimesSync(path.join(dir, 'older.jsonl'), earlier, earlier);
    writeSession(
      'p2',
      'newer',
      '/work/mine',
      line({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'r', name: 'Read', input: { file_path: '/a.ts' } }],
        },
      }),
    );
    const u = snapshot(['/work/mine']);
    expect(u?.main?.sessionId).toBe('newer');
    expect(u?.background).toHaveLength(1);
    expect(u?.background[0]).toMatchObject({ id: 'older', project: 'tools', local: true });
  });

  it('names a session after the folder it started in, not where its shell wandered', () => {
    writeSession(
      'p1',
      'sess-1',
      '/work/2LMC',
      line({ type: 'user', cwd: '/tmp/oc-mcp', message: { content: 'keep going' } }),
    );
    const u = snapshot(['/work/2LMC']);
    expect(u?.main).toMatchObject({ sessionId: 'sess-1', project: '2LMC' });
  });

  it("never takes over another window's session, even with none of its own", () => {
    writeSession('p2', 'other', 'D:\\Code\\Other', '');
    const u = snapshot(['C:\\Code\\Mine']);
    expect(u?.main).toBeNull();
    // It is still reported, marked as another repo, for the opt-in other-repo minis.
    expect(u?.background).toMatchObject([{ id: 'other', project: 'Other', local: false }]);
  });

  it('does not count a session whose shell only wandered into this workspace', () => {
    writeSession(
      'p2',
      'other',
      '/work/other',
      line({ type: 'user', cwd: '/work/mine', message: { content: 'look over there' } }),
    );
    expect(snapshot(['/work/mine'])?.main).toBeNull();
  });

  it('matches Git Bash style paths to the Windows workspace folder', () => {
    writeSession('p1', 'mine', '/d/Code/App', '');
    expect(snapshot(['D:\\Code\\App'])?.main?.sessionId).toBe('mine');
  });

  it('only replays the tail of a huge transcript and skips the cut-off line', () => {
    const filler = line({ type: 'user', message: { content: 'x'.repeat(300 * 1024) } });
    writeSession(
      'p1',
      'big',
      '/work/app',
      filler + line({ type: 'assistant', message: { stop_reason: 'end_turn', content: [] } }),
    );
    expect(snapshot(['/work/app'])?.main?.state).toBe('done');
  });

  it('passes main-session lines on and reports test and build outcomes once', () => {
    const dir = writeSession(
      'p1',
      'sess-1',
      '/work/app',
      line({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }],
        },
      }) +
        line({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }] },
        }),
    );
    const subDir = path.join(dir, 'sess-1', 'subagents');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(
      path.join(subDir, 'agent-abc.jsonl'),
      line({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm run build' } },
          ],
        },
      }) +
        line({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 'b1' }] },
        }) +
        line({ type: 'assistant', message: { stop_reason: 'end_turn', content: [] } }),
    );
    const watcher = new ClaudeWatcher(() => ['/work/app']);
    const events: Array<Record<string, unknown>> = [];
    watcher.onEvent((e) => events.push(e as unknown as Record<string, unknown>));
    watcher.start();
    // A second tick with nothing new must not repeat anything.
    (watcher as unknown as { tick(): void }).tick();
    watcher.dispose();

    expect(events.filter((e) => e.kind === 'line')).toHaveLength(3);
    expect(events.filter((e) => e.kind === 'line').every((e) => e.sessionId === 'sess-1')).toBe(
      true,
    );
    const outcomes = events.filter((e) => e.kind === 'outcome');
    expect(outcomes.map((e) => e.outcome)).toEqual([
      expect.objectContaining({ id: 't1', kind: 'test', ok: false }),
      expect.objectContaining({ id: 'b1', kind: 'build', ok: true }),
    ]);
    expect(outcomes.every((e) => e.sessionId === 'sess-1')).toBe(true);
    expect(events.filter((e) => e.kind === 'agent-done')).toEqual([
      { kind: 'agent-done', sessionId: 'sess-1', agentId: 'abc' },
    ]);
  });

  it('includes recent outcomes in the main pet update', () => {
    writeSession(
      'p1',
      'sess-1',
      '/work/app',
      line({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'pytest' } }],
        },
      }) +
        line({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] },
        }),
    );
    expect(snapshot(['/work/app'])?.main?.outcomes).toEqual([
      expect.objectContaining({ id: 't1', kind: 'test', ok: true }),
    ]);
  });
});
