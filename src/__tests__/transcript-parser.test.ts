import {
  LINGER_MS,
  PERMISSION_GUESS_MS,
  STALE_MS,
  applyLine,
  createActivity,
  currentState,
  jobKind,
  toolDetail,
  toolState,
} from '../transcript-parser';

const T0 = Date.parse('2026-10-13T10:00:00.000Z');

function at(ms: number): string {
  return new Date(T0 + ms).toISOString();
}

function prompt(text: string, ms = 0) {
  return { type: 'user', timestamp: at(ms), cwd: 'C:\\code\\app', message: { content: text } };
}

function toolUse(id: string, name: string, input: unknown, ms = 0) {
  return {
    type: 'assistant',
    timestamp: at(ms),
    message: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] },
  };
}

function toolResult(id: string, isError = false, ms = 0) {
  return {
    type: 'user',
    timestamp: at(ms),
    message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError }] },
  };
}

function endTurn(ms = 0) {
  return {
    type: 'assistant',
    timestamp: at(ms),
    message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] },
  };
}

describe('since', () => {
  it('is the transcript time of the last state change, not of every line', () => {
    const act = createActivity();
    applyLine(act, prompt('go', 0));
    applyLine(act, toolUse('a', 'Bash', { command: 'ls' }, 1000));
    applyLine(act, toolResult('a', false, 2000));
    applyLine(act, toolUse('b', 'Bash', { command: 'pwd' }, 3000));
    const running = currentState(act, T0 + 3500);
    expect(running.state).toBe('running');
    expect(running.since).toBe(T0 + 3000);

    applyLine(act, toolResult('b', false, 4000));
    applyLine(act, toolUse('c', 'Read', { file_path: 'a.ts' }, 5000));
    expect(currentState(act, T0 + 5500)).toMatchObject({ state: 'reading', since: T0 + 5000 });
  });
});

describe('toolState', () => {
  it('maps known tools to activities', () => {
    expect(toolState('Read')).toBe('reading');
    expect(toolState('Edit')).toBe('writing');
    expect(toolState('Bash')).toBe('running');
    expect(toolState('WebSearch')).toBe('browsing');
    expect(toolState('Agent')).toBe('delegating');
    expect(toolState('AskUserQuestion')).toBe('waiting');
  });

  it('treats MCP tools as browsing and unknown tools as running', () => {
    expect(toolState('mcp__github__get_issue')).toBe('browsing');
    expect(toolState('SomethingNew')).toBe('running');
  });
});

describe('jobKind', () => {
  it.each([
    ['npm test', 'test'],
    ['npm run test:unit -- --watch=false', 'test'],
    ['flutter test test/code_quality', 'test'],
    ['npx jest src', 'test'],
    ['python -m pytest -q', 'test'],
    ['go test ./...', 'test'],
    ['npm run build', 'build'],
    ['npm run compile', 'build'],
    ['cargo build --release', 'build'],
    ['npm run dev', 'server'],
    ['git status', 'job'],
    ['ls src/__tests__', 'job'],
  ])('%s -> %s', (command, kind) => {
    expect(jobKind(command)).toBe(kind);
  });
});

describe('toolDetail', () => {
  it('uses the file name for file tools, including Windows paths', () => {
    expect(toolDetail('Edit', { file_path: 'C:\\code\\app\\src\\main.ts' })).toBe('Edit main.ts');
  });

  it('uses the description for sub-agents and shell commands', () => {
    expect(toolDetail('Agent', { description: 'Find batch screen' })).toBe('Find batch screen');
    expect(toolDetail('Bash', { command: 'npm   test' })).toBe('npm test');
  });

  it('shows only the host for web fetches', () => {
    expect(toolDetail('WebFetch', { url: 'https://example.com/a/b?q=1' })).toBe(
      'Fetch example.com',
    );
  });
});

describe('applyLine / currentState', () => {
  it('walks through a full turn', () => {
    const act = createActivity();
    applyLine(act, prompt('fix the bug'));
    expect(act.state).toBe('thinking');
    expect(act.cwd).toBe('C:\\code\\app');

    applyLine(act, toolUse('t1', 'Read', { file_path: '/x/a.ts' }, 100));
    expect(act.state).toBe('reading');
    expect(act.detail).toBe('Read a.ts');

    applyLine(act, toolResult('t1', false, 200));
    expect(act.state).toBe('thinking');

    applyLine(act, toolUse('t2', 'Edit', { file_path: '/x/a.ts' }, 300));
    expect(act.state).toBe('writing');
    applyLine(act, toolResult('t2', true, 400));
    expect(act.state).toBe('error');

    applyLine(act, endTurn(500));
    expect(act.state).toBe('done');
    expect(act.finished).toBe(true);
    expect(act.lastAt).toBe(T0 + 500);
  });

  it('bumps seq on every assignment so repeated states are distinguishable', () => {
    const act = createActivity();
    applyLine(act, endTurn());
    const first = act.seq;
    applyLine(act, endTurn());
    expect(act.seq).toBeGreaterThan(first);
  });

  it('ignores tagged command strings and meta lines', () => {
    const act = createActivity();
    applyLine(act, prompt('<command-name>/clear</command-name>'));
    applyLine(act, { ...prompt('hello'), isMeta: true });
    expect(act.state).toBe('idle');
  });

  it('goes idle when the user interrupts', () => {
    const act = createActivity();
    applyLine(act, toolUse('t1', 'Bash', { command: 'sleep 100' }));
    applyLine(act, {
      type: 'user',
      timestamp: at(50),
      message: { content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] },
    });
    expect(act.state).toBe('idle');
    expect(act.pending.size).toBe(0);
  });

  it('guesses a permission prompt when a non-shell tool stalls', () => {
    const act = createActivity();
    applyLine(act, toolUse('t1', 'Edit', { file_path: '/x/a.ts' }));
    expect(currentState(act, T0 + 1000).state).toBe('writing');
    expect(currentState(act, T0 + PERMISSION_GUESS_MS + 1).state).toBe('waiting');
  });

  it('does not treat a long shell command as a permission prompt', () => {
    const act = createActivity();
    applyLine(act, toolUse('t1', 'Bash', { command: 'npm run lint' }));
    expect(currentState(act, T0 + 60_000).state).toBe('running');
  });

  it('waits immediately for AskUserQuestion', () => {
    const act = createActivity();
    applyLine(act, toolUse('t1', 'AskUserQuestion', {}));
    expect(currentState(act, T0).state).toBe('waiting');
  });

  it('reports an abandoned turn as idle', () => {
    const act = createActivity();
    applyLine(act, endTurn());
    expect(currentState(act, T0 + 1000).state).toBe('done');
    expect(currentState(act, T0 + STALE_MS + 1).state).toBe('idle');
  });

  it('runs tests as their own state with a job while they run', () => {
    const act = createActivity();
    applyLine(act, toolUse('t1', 'Bash', { command: 'npm test' }));
    expect(act.state).toBe('testing');
    expect(currentState(act, T0).jobs).toEqual([
      { id: 't1', kind: 'test', label: 'npm test', background: false },
    ]);
    applyLine(act, toolResult('t1', false, 100));
    expect(currentState(act, T0 + 100).jobs).toEqual([]);
  });

  it('keeps a background job until its task notification arrives', () => {
    const act = createActivity();
    applyLine(
      act,
      toolUse('bg1', 'Bash', { command: 'npm run watch', run_in_background: true }, 0),
    );
    applyLine(act, toolResult('bg1', false, 50));
    applyLine(act, endTurn(100));
    expect(currentState(act, T0 + 200).jobs).toMatchObject([
      { id: 'bg1', kind: 'server', background: true },
    ]);

    applyLine(act, {
      type: 'queue-operation',
      operation: 'enqueue',
      timestamp: at(300),
      content: '<task-notification>\n<tool-use-id>bg1</tool-use-id>\n<status>completed</status>',
    });
    expect(currentState(act, T0 + 300).jobs).toEqual([]);
  });

  it('also ends a background job from the replayed user notification', () => {
    const act = createActivity();
    applyLine(act, toolUse('bg2', 'Bash', { command: 'npx jest', run_in_background: true }));
    applyLine(act, toolResult('bg2'));
    applyLine(act, {
      type: 'user',
      timestamp: at(10),
      message: {
        content: '<task-notification><tool-use-id>bg2</tool-use-id><status>failed</status>',
      },
    });
    expect(act.jobs.size).toBe(0);
    expect(act.state).toBe('thinking');
  });

  it('holds a single action briefly through the think after it', () => {
    const act = createActivity();
    applyLine(act, prompt('research it'));
    applyLine(act, toolUse('w1', 'WebSearch', { query: 'pets' }, 100));
    applyLine(act, toolResult('w1', false, 1000));
    expect(act.state).toBe('thinking');
    expect(currentState(act, T0 + 2000)).toMatchObject({
      state: 'browsing',
      detail: 'Search pets',
    });
    expect(currentState(act, T0 + 1000 + LINGER_MS + 1).state).toBe('thinking');
  });

  it('keeps doing an action done twice in a row until something different happens', () => {
    const act = createActivity();
    applyLine(act, prompt('build the page'));
    for (let i = 0; i < 5; i++) {
      applyLine(act, toolUse(`w${i}`, 'Write', { file_path: `/x/f${i}.ts` }, i * 100));
      applyLine(act, toolResult(`w${i}`, false, i * 100 + 50));
    }
    // A long think after the run of writes still shows typing.
    applyLine(act, {
      type: 'assistant',
      timestamp: at(1000),
      message: { content: [{ type: 'thinking', thinking: '...' }] },
    });
    expect(currentState(act, T0 + 60_000)).toMatchObject({
      state: 'writing',
      detail: 'Write f4.ts',
    });

    // A different action takes over, and on its own only gets the short hold.
    applyLine(act, toolUse('r1', 'Read', { file_path: '/x/a.ts' }, 61_000));
    applyLine(act, toolResult('r1', false, 61_100));
    expect(currentState(act, T0 + 62_000).state).toBe('reading');
    expect(currentState(act, T0 + 61_100 + LINGER_MS + 1).state).toBe('thinking');
  });

  it('does not count alternating actions as a run', () => {
    const act = createActivity();
    applyLine(act, toolUse('a', 'Read', { file_path: '/x/a.ts' }, 0));
    applyLine(act, toolResult('a', false, 10));
    applyLine(act, toolUse('b', 'Edit', { file_path: '/x/a.ts' }, 20));
    applyLine(act, toolResult('b', false, 30));
    expect(currentState(act, T0 + 30 + LINGER_MS + 1).state).toBe('thinking');
  });

  it('stops holding a run when the turn ends or goes quiet', () => {
    const act = createActivity();
    for (const id of ['g1', 'g2']) {
      applyLine(act, toolUse(id, 'Grep', { pattern: 'x' }));
      applyLine(act, toolResult(id));
    }
    expect(currentState(act, T0 + 60_000).state).toBe('reading');
    expect(currentState(act, T0 + STALE_MS + 1).state).toBe('idle');

    applyLine(act, endTurn(100));
    expect(currentState(act, T0 + 200).state).toBe('done');
    applyLine(act, prompt('again', 300));
    expect(currentState(act, T0 + 400).state).toBe('thinking');
  });

  it('does not hold an action after an error or a new prompt', () => {
    const act = createActivity();
    applyLine(act, toolUse('e1', 'Edit', { file_path: '/x/a.ts' }));
    applyLine(act, toolResult('e1', false, 10));
    applyLine(act, prompt('actually, stop', 20));
    expect(currentState(act, T0 + 30).state).toBe('thinking');

    applyLine(act, toolUse('e2', 'Edit', { file_path: '/x/a.ts' }, 40));
    applyLine(act, toolResult('e2', true, 50));
    expect(currentState(act, T0 + 60).state).toBe('error');
  });

  it('survives junk lines', () => {
    const act = createActivity();
    expect(() => {
      applyLine(act, null);
      applyLine(act, 42);
      applyLine(act, { type: 'assistant', message: { content: 'not an array' } });
      applyLine(act, { type: 'user', message: { content: [null, { type: 'mystery' }] } });
    }).not.toThrow();
  });
});
