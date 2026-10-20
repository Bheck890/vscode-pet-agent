import type { ClaudeUpdate } from './claude-watcher';
import type { PetConfig } from './pet-config';
import type { CareAction, CareResult, CareStats } from './pet-care';
import type { PeonEvent, SessionUpdate } from './state-watcher';
import { panelSetting } from './pet-config';
import { isCareAction } from './pet-care';

/**
 * The message contract between the extension and the webview (media/*.js).
 * Everything the webview sends is untrusted until {@link parseFromWebview}
 * has checked it.
 */

/**
 * Persisted across reloads: where the pet was dragged, its bag of toys
 * (id -> count found), toys traded in at the shop (id -> count), shop
 * purchases, and the food it is fed.
 */
export interface WebviewState {
  petX?: number;
  petY?: number;
  bag?: Record<string, number>;
  spent?: Record<string, number>;
  unlocks?: string[];
  food?: string;
}

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Messages the webview sends to the extension, after validation. */
export type FromWebview =
  | { command: 'ready' }
  | { command: 'care'; action: CareAction }
  | { command: 'log'; level: LogLevel; message: string }
  | { command: 'refresh' }
  | { command: 'gather-logs'; snapshot: string | null }
  | { command: 'setting'; key: string; value: unknown }
  | { command: 'save-state'; state: WebviewState };

/** Messages the extension sends to the webview. */
export type ToWebview =
  | { command: 'init'; config: PetConfig; state: WebviewState | null }
  | { command: 'reinit'; config: PetConfig }
  | ({ command: 'claude-update' } & ClaudeUpdate)
  | ({ command: 'peon-event' } & PeonEvent)
  | ({ command: 'session-update' } & SessionUpdate)
  | ({ command: 'care-update' } & (CareResult | { stats: CareStats }))
  | { command: 'unlocks'; unlocks: string[] };

export function isWebviewState(value: unknown): value is WebviewState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const state = value as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const counts = (v: unknown) =>
    v === undefined || (typeof v === 'object' && v !== null && Object.values(v).every(num));
  const unlocks = state['unlocks'];
  return (
    (state['petX'] === undefined || num(state['petX'])) &&
    (state['petY'] === undefined || num(state['petY'])) &&
    counts(state['bag']) &&
    counts(state['spent']) &&
    (unlocks === undefined ||
      (Array.isArray(unlocks) && unlocks.every((id) => typeof id === 'string'))) &&
    (state['food'] === undefined || typeof state['food'] === 'string')
  );
}

/** Checks a message from the webview, or returns null for anything malformed or unknown. */
export function parseFromWebview(msg: unknown): FromWebview | null {
  if (!msg || typeof msg !== 'object') {
    return null;
  }
  const m = msg as Record<string, unknown>;
  switch (m['command']) {
    case 'ready':
    case 'refresh':
      return { command: m['command'] };
    case 'care':
      return isCareAction(m['action']) ? { command: 'care', action: m['action'] } : null;
    case 'log':
      return LOG_LEVELS.includes(m['level'] as LogLevel) && typeof m['message'] === 'string'
        ? { command: 'log', level: m['level'] as LogLevel, message: m['message'].slice(0, 2000) }
        : null;
    case 'gather-logs':
      return {
        command: 'gather-logs',
        snapshot: typeof m['snapshot'] === 'string' ? m['snapshot'].slice(0, 4000) : null,
      };
    case 'setting': {
      const change = panelSetting(m['key'], m['value']);
      return change ? { command: 'setting', key: change[0], value: change[1] } : null;
    }
    case 'save-state':
      return isWebviewState(m['state']) ? { command: 'save-state', state: m['state'] } : null;
    default:
      return null;
  }
}
