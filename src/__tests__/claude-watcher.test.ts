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

function line(obj: Record<string, unknown>): string {
  return JSON.stringify({ timestamp: new Date().toISOString(), ...obj }) + '\n';
}

function writeSession(project: string, id: string, cwd: string, body: string): string {
  const dir = path.join(projects, project);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, line({ type: 'user', cwd, message: { content: 'go' } }) + body);
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
    const u = snapshot([]);
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
    const u = snapshot([]);
    expect(u?.subagents).toHaveLength(1);
    expect(u?.subagents[0]).toMatchObject({
      id: 'abc',
      agentType: 'Explore',
      task: 'Find the login screen',
      state: 'reading',
    });
    expect(u?.subagents[0].name).toMatch(/^(Detective|Scout|Sniffer|Tracker|Sleuth) /);
  });

  it('reports other recently busy sessions as background agents', () => {
    writeSession('p1', 'mine', '/work/mine', '');
    writeSession(
      'p2',
      'other',
      '/work/other-app',
      line({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'r', name: 'Read', input: { file_path: '/a.ts' } }],
        },
      }),
    );
    const u = snapshot(['/work/mine']);
    expect(u?.main?.sessionId).toBe('mine');
    expect(u?.background).toHaveLength(1);
    expect(u?.background[0]).toMatchObject({ id: 'other', project: 'other-app', state: 'reading' });
  });

  it('only replays the tail of a huge transcript and skips the cut-off line', () => {
    const filler = line({ type: 'user', message: { content: 'x'.repeat(300 * 1024) } });
    writeSession(
      'p1',
      'big',
      '/work/app',
      filler + line({ type: 'assistant', message: { stop_reason: 'end_turn', content: [] } }),
    );
    expect(snapshot([])?.main?.state).toBe('done');
  });
});
