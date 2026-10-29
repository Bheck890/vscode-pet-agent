import type { WatchEvent } from './claude-watcher';
import type { ProgressService } from './progress-service';
import type { RecordsService } from './records-service';

/**
 * How the game systems hang together: transcript events become finished
 * turns (records) and XP facts (progress); new turns and records earn XP.
 */
export function connectGames(
  watcher: { onEvent(listener: (e: WatchEvent) => void): { dispose(): void } },
  records: RecordsService,
  progress: ProgressService,
): Array<{ dispose(): void }> {
  return [
    records.onTurns((turns, broken) => {
      progress.turns(turns);
      const at = Math.max(...turns.map((t) => t.endedAt));
      broken.forEach((category) => progress.record(category, at));
    }),
    watcher.onEvent((e) => {
      switch (e.kind) {
        case 'line':
          records.line(e.sessionId, e.line);
          break;
        case 'outcome':
          progress.outcome(e.sessionId, e.outcome);
          break;
        case 'agent-done':
          progress.agentDone(e.agentId);
          break;
        case 'session-gone':
          records.drop(e.sessionId);
          break;
      }
    }),
  ];
}
