import * as crypto from 'crypto';
import { ProfileFile, parseProfile } from './profiles';
import { Slot, parseSlot } from './slot';

/**
 * The `.petsave` file that carries a live save to another computer. Without
 * a password it is plain JSON and prompt previews are left out; with one,
 * the save is encrypted with AES-256-GCM under a key from scrypt, and the
 * header (format, version, kdf) is authenticated too, so editing it breaks
 * decryption. Only Node's built-in crypto is used.
 */
export const MOVE_FORMAT = 'pet-agents-save';
export const MOVE_VERSION = 1;
export const MOVE_MAX_BYTES = 5 * 1024 * 1024;
export const MIN_PASSWORD = 8;

export interface MoveSave {
  exportedAt: number;
  slot: Slot;
  save: ProfileFile;
  /** Prompt records and the hall of fame; previews only travel encrypted. */
  records: { turns: unknown[]; fame: Record<string, unknown> };
  profiles: ProfileFile[];
  guests: ProfileFile[];
}

export type MoveRead =
  | { ok: true; move: MoveSave; encrypted: boolean }
  | { ok: false; reason: 'damaged' | 'password' | 'needs-password' | 'version' };

interface Kdf {
  name: 'scrypt';
  N: number;
  r: number;
  p: number;
  salt: string;
}

const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** The authenticated header, always serialised in the same order. */
function header(kdf: Kdf): Buffer {
  const { name, N, r, p, salt } = kdf;
  return Buffer.from(
    JSON.stringify({ format: MOVE_FORMAT, version: MOVE_VERSION, kdf: { name, N, r, p, salt } }),
  );
}

function keyFor(password: string, kdf: Kdf): Buffer {
  return crypto.scryptSync(password, Buffer.from(kdf.salt, 'base64'), 32, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: SCRYPT.maxmem,
  });
}

/** Without a password: blanks every prompt preview, keeping the numbers. */
export function withoutPrompts(records: MoveSave['records']): MoveSave['records'] {
  const blank = (t: unknown) => (t && typeof t === 'object' ? { ...t, preview: '' } : t);
  return {
    turns: records.turns.map(blank),
    fame: Object.fromEntries(Object.entries(records.fame).map(([k, t]) => [k, blank(t)])),
  };
}

/** The file's text. A fresh salt and IV every time. */
export function encodeMove(move: MoveSave, password: string): string {
  if (!password) {
    const save = { ...move, records: withoutPrompts(move.records) };
    return JSON.stringify({ format: MOVE_FORMAT, version: MOVE_VERSION, encrypted: false, save });
  }
  const kdf: Kdf = {
    name: 'scrypt',
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    salt: crypto.randomBytes(16).toString('base64'),
  };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(password, kdf), iv);
  cipher.setAAD(header(kdf));
  const data = Buffer.concat([cipher.update(JSON.stringify(move), 'utf8'), cipher.final()]);
  return JSON.stringify({
    format: MOVE_FORMAT,
    version: MOVE_VERSION,
    encrypted: true,
    kdf,
    cipher: {
      name: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    },
    data: data.toString('base64'),
  });
}

function parseKdf(v: unknown): Kdf | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  // Only the parameters this version writes, so a doctored file can't ask for huge work.
  return o['name'] === 'scrypt' &&
    o['N'] === SCRYPT.N &&
    o['r'] === SCRYPT.r &&
    o['p'] === SCRYPT.p &&
    typeof o['salt'] === 'string'
    ? { name: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: o['salt'] }
    : null;
}

function parseMove(v: unknown): MoveSave | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const slot = parseSlot(o['slot']);
  const save = parseProfile(o['save']);
  const records = (o['records'] && typeof o['records'] === 'object' ? o['records'] : {}) as Record<
    string,
    unknown
  >;
  const exportedAt = o['exportedAt'];
  if (!slot || !save || save.id !== slot.id || typeof exportedAt !== 'number') {
    return null;
  }
  const profiles = (list: unknown) =>
    (Array.isArray(list) ? list : []).map(parseProfile).filter((p): p is ProfileFile => !!p);
  return {
    exportedAt,
    slot,
    save,
    records: {
      turns: Array.isArray(records['turns']) ? records['turns'] : [],
      fame:
        records['fame'] && typeof records['fame'] === 'object'
          ? (records['fame'] as Record<string, unknown>)
          : {},
    },
    profiles: profiles(o['profiles']),
    guests: profiles(o['guests']),
  };
}

/** True if the file says it is encrypted, so the password can be asked for first. */
export function isEncrypted(text: string): boolean {
  try {
    return (JSON.parse(text) as Record<string, unknown>)?.['encrypted'] === true;
  } catch {
    return false;
  }
}

/**
 * Reads a move file. A wrong password and a damaged file look the same to
 * AES-GCM, so both come back as 'password'. Nothing here touches storage.
 */
export function decodeMove(text: string, password: string): MoveRead {
  if (Buffer.byteLength(text, 'utf8') > MOVE_MAX_BYTES) {
    return { ok: false, reason: 'damaged' };
  }
  let file: Record<string, unknown>;
  try {
    file = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'damaged' };
  }
  if (!file || typeof file !== 'object' || file['format'] !== MOVE_FORMAT) {
    return { ok: false, reason: 'damaged' };
  }
  if (typeof file['version'] === 'number' && file['version'] > MOVE_VERSION) {
    return { ok: false, reason: 'version' };
  }
  if (file['version'] !== MOVE_VERSION) {
    return { ok: false, reason: 'damaged' };
  }
  if (file['encrypted'] === false) {
    const move = parseMove(file['save']);
    return move ? { ok: true, move, encrypted: false } : { ok: false, reason: 'damaged' };
  }
  if (file['encrypted'] !== true) {
    return { ok: false, reason: 'damaged' };
  }
  if (!password) {
    return { ok: false, reason: 'needs-password' };
  }
  const kdf = parseKdf(file['kdf']);
  const c = (file['cipher'] && typeof file['cipher'] === 'object' ? file['cipher'] : {}) as Record<
    string,
    unknown
  >;
  if (
    !kdf ||
    c['name'] !== 'aes-256-gcm' ||
    typeof c['iv'] !== 'string' ||
    typeof c['tag'] !== 'string' ||
    typeof file['data'] !== 'string'
  ) {
    return { ok: false, reason: 'damaged' };
  }
  try {
    const iv = Buffer.from(c['iv'], 'base64');
    const tag = Buffer.from(c['tag'], 'base64');
    if (iv.length !== 12 || tag.length !== 16) {
      return { ok: false, reason: 'password' };
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(password, kdf), iv);
    decipher.setAAD(header(kdf));
    decipher.setAuthTag(tag);
    const json = Buffer.concat([
      decipher.update(Buffer.from(file['data'], 'base64')),
      decipher.final(),
    ]).toString('utf8');
    const move = parseMove(JSON.parse(json));
    return move ? { ok: true, move, encrypted: true } : { ok: false, reason: 'damaged' };
  } catch {
    return { ok: false, reason: 'password' };
  }
}
