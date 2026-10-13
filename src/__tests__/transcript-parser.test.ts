import {
  PERMISSION_GUESS_MS,
  STALE_MS,
  applyLine,
  createActivity,
  currentState,
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
    applyLine(act, toolUse('t1', 'Bash', { command: 'npm test' }));
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
