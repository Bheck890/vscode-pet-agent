import type { Companion } from './pet-config';
import { Storage } from './storage';

/** One save: everything from level 1 up, until it is archived as a profile. */
export interface Slot {
  id: string;
  /** Facts dated before this belong to an earlier save and earn nothing here. */
  startedAt: number;
}

const SLOT_KEY = 'petSlot';
/** The helper's save is its own, so switching never touches the pet's progress. */
const HELPER_SLOT_KEY = 'petHelperSlot';
const SLOT_ID = /^[a-z0-9-]{1,64}$/;

/** Everything that belongs to a save, stored per slot. Records and settings carry over. */
export const SLOT_KEYS = [
  'petBag',
  'petBagSpent',
  'petUnlocks',
  'petActiveBag',
  'petHouse',
  'petXp',
  'petXpBanked',
  'petCare',
  'petLifetime',
  'petFinishSeen',
  'petVisitorWait',
  'petComplete',
];

export function isSlotId(v: unknown): v is string {
  return typeof v === 'string' && SLOT_ID.test(v);
}

export function parseSlot(v: unknown): Slot | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return isSlotId(o['id']) && typeof o['startedAt'] === 'number' && Number.isFinite(o['startedAt'])
    ? { id: o['id'], startedAt: o['startedAt'] }
    : null;
}

/** A readable slot id from the start date and the pet's name, e.g. "2026-10-19-rusty". */
export function slotId(petName: string, at: Date, taken: (id: string) => boolean): string {
  const day = [at.getFullYear(), at.getMonth() + 1, at.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-');
  const name =
    petName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'pet';
  const base = `${day}-${name}`;
  let id = base;
  for (let n = 2; taken(id); n++) {
    id = `${base}-${n}`;
  }
  return id;
}

/**
 * The current save, in globalState so every window plays the same one. Pets
 * and helpers each have their own. The first time the pet's is asked for,
 * the data from before there were saves becomes slot one: each key is copied
 * to its slot key and the old keys are left alone.
 */
export class Slots {
  constructor(
    private readonly storage: Storage,
    private readonly now: () => Date,
    private readonly petName: () => string,
    private readonly companion: () => Companion = () => 'pet',
  ) {}

  private key(): string {
    return this.companion() === 'helper' ? HELPER_SLOT_KEY : SLOT_KEY;
  }

  current(): Slot {
    const slot = parseSlot(this.storage.get(this.key()));
    if (slot) {
      return slot;
    }
    // Data from before there were saves keeps everything earned, so it counts facts from any time.
    // A fresh install counts from now: older transcripts must not level up a brand-new pet.
    const legacy =
      this.key() === SLOT_KEY && SLOT_KEYS.some((key) => this.storage.get(key) !== undefined);
    const now = this.now();
    const taken = new Set(this.ids());
    const first = {
      id: slotId(this.petName(), now, (id) => taken.has(id)),
      startedAt: legacy ? 0 : now.getTime(),
    };
    for (const key of legacy ? SLOT_KEYS : []) {
      const old = this.storage.get(key);
      if (old !== undefined && this.storage.get(`${key}:${first.id}`) === undefined) {
        void this.storage.update(`${key}:${first.id}`, old);
      }
    }
    void this.storage.update(this.key(), first);
    return first;
  }

  /** The saves being played by the pet and the helper, so a new one never takes either id. */
  ids(): string[] {
    return [SLOT_KEY, HELPER_SLOT_KEY]
      .map((k) => parseSlot(this.storage.get(k)))
      .filter((s): s is Slot => !!s)
      .map((s) => s.id);
  }

  /** Starts a fresh save, or moves to `slot` (a pet brought from another computer). */
  start(slot: Slot): void {
    void this.storage.update(this.key(), slot);
  }
}
