import { BagLevel, isBagId } from './bags';
import type { Calendar } from './calendar';
import type { ClaudeUpdate } from './claude-watcher';
import type { PetConfig } from './pet-config';
import type { CareAction, CareResult, CareStats } from './pet-care';
import type { HouseLayout } from './house-store';
import type { ProgressUpdate } from './progress-service';
import type { FinishSummary, ProfileEntry, ProfileFile } from './profiles';
import type { RecordsUpdate } from './records-service';
import type { ShareSite } from './save-flows';
import type { PeonEvent, SessionUpdate } from './state-watcher';
import { panelSetting } from './pet-config';
import { isCareAction } from './pet-care';
import { parseLayout } from './house-store';
import { isSlotId } from './slot';

/**
 * The message contract between the extension and the webview (media/*.js).
 * Everything the webview sends is untrusted until {@link parseFromWebview}
 * has checked it.
 */

/**
 * Persisted across reloads: where the pet was dragged, its bag of toys
 * (id -> count found), toys traded in at the shop (id -> count), shop
 * purchases, the food it is fed, and (from the extension) the active bag.
 */
export interface WebviewState {
  petX?: number;
  petY?: number;
  bag?: Record<string, number>;
  spent?: Record<string, number>;
  unlocks?: string[];
  food?: string;
  activeBag?: string;
}

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** The share card PNG, as a data URL, at most this long. */
export const SHARE_CARD_MAX = 4 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Messages the webview sends to the extension, after validation. */
export type FromWebview =
  | { command: 'ready' }
  | { command: 'care'; action: CareAction }
  | { command: 'log'; level: LogLevel; message: string }
  | { command: 'refresh' }
  | { command: 'gather-logs'; snapshot: string | null }
  | { command: 'setting'; key: string; value: unknown }
  | { command: 'save-state'; state: WebviewState; slot: string }
  | { command: 'house-save'; layout: HouseLayout; slot: string }
  | { command: 'bag-switch'; bag: string; slot: string }
  | { command: 'found'; bag: string; toy: string }
  | { command: 'new-save' }
  | { command: 'visit-profile'; id: string; guest: boolean }
  | { command: 'profile-rename'; id: string; guest: boolean }
  | { command: 'profile-hide'; id: string; guest: boolean; hidden: boolean }
  | { command: 'profile-export'; id: string | null }
  | { command: 'profile-import' }
  | { command: 'finish-open' }
  | { command: 'share-copy'; toyTotal: number }
  | { command: 'share-post'; site: ShareSite; toyTotal: number }
  | { command: 'share-card'; png: Buffer }
  | { command: 'move-out' }
  | { command: 'move-in' };

/** An old save to visit: everything but its fact history. */
export type VisitProfile = Omit<ProfileFile, 'progress'> & {
  progress: { xp: number; level: number };
  guest: boolean;
};

/** Messages the extension sends to the webview. */
export type ToWebview =
  | {
      command: 'init';
      config: PetConfig;
      state: WebviewState | null;
      bags: BagLevel[];
      slot: string;
    }
  | { command: 'reinit'; config: PetConfig }
  | ({ command: 'claude-update' } & ClaudeUpdate)
  | ({ command: 'peon-event' } & PeonEvent)
  | ({ command: 'session-update' } & SessionUpdate)
  | ({ command: 'care-update' } & (CareResult | { stats: CareStats }))
  | { command: 'unlocks'; unlocks: string[]; activeBag: string }
  | ({ command: 'calendar' } & Calendar)
  | ({ command: 'records-update' } & RecordsUpdate)
  | ({ command: 'progress-update' } & ProgressUpdate)
  | { command: 'house'; layout: HouseLayout }
  | { command: 'profiles'; profiles: ProfileEntry[] }
  | { command: 'profile'; profile: VisitProfile }
  | { command: 'finished'; summary: FinishSummary; finished: boolean };

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
    (state['food'] === undefined || typeof state['food'] === 'string') &&
    (state['activeBag'] === undefined || typeof state['activeBag'] === 'string')
  );
}

/** A share card: a PNG data URL, not too big. */
function parsePng(v: unknown): Buffer | null {
  const prefix = 'data:image/png;base64,';
  if (typeof v !== 'string' || v.length > SHARE_CARD_MAX || !v.startsWith(prefix)) {
    return null;
  }
  const png = Buffer.from(v.slice(prefix.length), 'base64');
  return png.subarray(0, 8).equals(PNG_MAGIC) ? png : null;
}

const toyTotal = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100000 ? v : 0;

/** Checks a message from the webview, or returns null for anything malformed or unknown. */
export function parseFromWebview(msg: unknown): FromWebview | null {
  if (!msg || typeof msg !== 'object') {
    return null;
  }
  const m = msg as Record<string, unknown>;
  const slot = m['slot'];
  const guest = m['guest'] === true;
  switch (m['command']) {
    case 'ready':
    case 'refresh':
    case 'new-save':
    case 'profile-import':
    case 'finish-open':
    case 'move-out':
    case 'move-in':
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
      return isWebviewState(m['state']) && isSlotId(slot)
        ? { command: 'save-state', state: m['state'], slot }
        : null;
    case 'house-save':
      return m['layout'] && typeof m['layout'] === 'object' && isSlotId(slot)
        ? { command: 'house-save', layout: parseLayout(m['layout']), slot }
        : null;
    case 'bag-switch':
      return isBagId(m['bag']) && isSlotId(slot)
        ? { command: 'bag-switch', bag: m['bag'], slot }
        : null;
    case 'found':
      return isBagId(m['bag']) && typeof m['toy'] === 'string' && /^[a-z]+$/.test(m['toy'])
        ? { command: 'found', bag: m['bag'], toy: m['toy'] }
        : null;
    case 'visit-profile':
    case 'profile-rename':
      return isSlotId(m['id']) ? { command: m['command'], id: m['id'], guest } : null;
    case 'profile-hide':
      return isSlotId(m['id']) && typeof m['hidden'] === 'boolean'
        ? { command: 'profile-hide', id: m['id'], guest, hidden: m['hidden'] }
        : null;
    case 'profile-export':
      return m['id'] === null || isSlotId(m['id'])
        ? { command: 'profile-export', id: m['id'] }
        : null;
    case 'share-copy':
      return { command: 'share-copy', toyTotal: toyTotal(m['toyTotal']) };
    case 'share-post':
      return m['site'] === 'x' || m['site'] === 'bluesky'
        ? { command: 'share-post', site: m['site'], toyTotal: toyTotal(m['toyTotal']) }
        : null;
    case 'share-card': {
      const png = parsePng(m['png']);
      return png ? { command: 'share-card', png } : null;
    }
    default:
      return null;
  }
}
