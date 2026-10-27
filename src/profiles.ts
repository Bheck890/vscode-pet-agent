import * as fs from 'fs';
import * as path from 'path';
import { STARTER_BAG, bagsUnlocked, isBagId, isEventToy } from './bags';
import { BagStore, Completion, parseBag, parseCompletion, parseUnlocks } from './bag-store';
import { HouseLayout, HouseStore, parseLayout } from './house-store';
import { ACCESSORIES, PATTERNS, STYLES, isSpecies } from './pet-config';
import { CareStats, CareStore, parseStats } from './pet-care';
import { Fact, levelOf } from './progress';
import { Lifetime, ProgressStore, parseBank, parseFacts, parseLifetime } from './progress-store';
import { Slot, Slots, isSlotId, slotId } from './slot';
import { Storage } from './storage';

/** The pet's look, copied from the `pet-agents.*` settings. */
export interface PetLook {
  species: string;
  color: string;
  accentColor: string;
  eyeColor: string;
  pattern: string;
  accessory: string;
  accessoryColor: string;
  name: string;
  style: string;
}

export const LOOK_KEYS: Array<keyof PetLook> = [
  'species',
  'color',
  'accentColor',
  'eyeColor',
  'pattern',
  'accessory',
  'accessoryColor',
  'name',
  'style',
];

/** The numbers on the finish card. Never any prompt text, file or repo names. */
export interface FinishSummary {
  days: number;
  level: number;
  xp: number;
  prompts: number;
  actions: number;
  agentHours: number;
  /** Kinds of toy found, across every bag. */
  toys: number;
  bags: number;
  /** Houses and rooms with furniture in. */
  houses: number;
  rooms: number;
  records: number;
}

const SUMMARY_KEYS: Array<keyof FinishSummary> = [
  'days',
  'level',
  'xp',
  'prompts',
  'actions',
  'agentHours',
  'toys',
  'bags',
  'houses',
  'rooms',
  'records',
];

export interface ProfileFile {
  version: 1;
  /** The slot id, e.g. "2026-10-19-rusty". */
  id: string;
  /** "Rusty's first save"; renamable. */
  name: string;
  createdAt: number;
  endedAt: number;
  /** False if a new save was started before finishing. */
  finished: boolean;
  /** The pet moved to another computer from here. */
  moved?: boolean;
  /** Every regular toy found ('items'), and every shop item bought too ('all'). */
  complete?: 'items' | 'all';
  pet: PetLook;
  progress: {
    xp: number;
    level: number;
    facts: Record<string, Fact>;
    banked: Record<string, number>;
    lifetime: Lifetime;
  };
  bag: {
    found: Record<string, number>;
    spent: Record<string, number>;
    unlocks: string[];
    activeBag: string;
  };
  house: HouseLayout;
  care: CareStats;
  summary: FinishSummary;
}

/** One line of the profile index, enough for the house menu without reading every file. */
export interface ProfileEntry {
  id: string;
  name: string;
  finished: boolean;
  moved?: boolean;
  complete?: 'items' | 'all';
  createdAt: number;
  endedAt: number;
  /** Hidden from the house menu; the file stays on disk. */
  hidden?: boolean;
  /** A friend's profile, imported from a file. */
  guest?: boolean;
  pet: PetLook;
  summary: FinishSummary;
}

export const PROFILE_VERSION = 1;
const INDEX_KEY = 'petProfiles';
/** A friend's profile bigger than this is refused. */
export const GUEST_MAX_BYTES = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

const num = (v: unknown, min = 0) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min ? v : null;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : null);
const obj = (v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function oneOf(v: unknown, allowed: readonly string[]): string {
  return typeof v === 'string' && allowed.includes(v) && v !== 'none' ? v : '';
}

/** A look from a file. Unknown patterns, accessories and styles are dropped; a bad species fails. */
export function parseLook(v: unknown): PetLook | null {
  const o = obj(v);
  if (!o || !isSpecies(o['species'])) {
    return null;
  }
  const colour = (k: string) => {
    const c = text(o[k], 40) ?? '';
    return /^[#a-zA-Z0-9(),.% ]*$/.test(c) ? c : '';
  };
  return {
    species: o['species'],
    color: colour('color'),
    accentColor: colour('accentColor'),
    eyeColor: colour('eyeColor'),
    pattern: oneOf(o['pattern'], PATTERNS),
    accessory: oneOf(o['accessory'], ACCESSORIES),
    accessoryColor: colour('accessoryColor'),
    name: text(o['name'], 40) || 'Pet',
    style: oneOf(o['style'], STYLES),
  };
}

function parseSummary(v: unknown): FinishSummary | null {
  const o = obj(v);
  if (!o) {
    return null;
  }
  const out = {} as FinishSummary;
  for (const k of SUMMARY_KEYS) {
    const n = num(o[k]);
    if (n === null) {
      return null;
    }
    out[k] = n;
  }
  return out;
}

/**
 * A profile file, checked with the same parsers the stores use: unknown
 * toys, furniture, houses and styles are dropped, and anything missing or
 * the wrong shape rejects the whole file (null).
 */
export function parseProfile(v: unknown): ProfileFile | null {
  const o = obj(v);
  const progress = obj(o?.['progress']);
  const bag = obj(o?.['bag']);
  if (!o || !progress || !bag || o['version'] !== PROFILE_VERSION || !isSlotId(o['id'])) {
    return null;
  }
  const name = text(o['name'], 80);
  const createdAt = num(o['createdAt']);
  const endedAt = num(o['endedAt']);
  const pet = parseLook(o['pet']);
  const summary = parseSummary(o['summary']);
  const xp = num(progress['xp']);
  const level = num(progress['level'], 1);
  if (
    !name ||
    createdAt === null ||
    endedAt === null ||
    !pet ||
    !summary ||
    xp === null ||
    !level
  ) {
    return null;
  }
  if (typeof o['finished'] !== 'boolean' || !obj(o['house']) || !obj(o['care'])) {
    return null;
  }
  const complete = parseCompletion(o['complete']);
  return {
    version: PROFILE_VERSION,
    id: o['id'],
    name,
    createdAt,
    endedAt,
    finished: o['finished'],
    ...(o['moved'] === true ? { moved: true } : {}),
    ...(complete ? { complete } : {}),
    pet,
    progress: {
      xp,
      level: Math.floor(level),
      facts: parseFacts(progress['facts']),
      banked: parseBank(progress['banked']),
      lifetime: parseLifetime(progress['lifetime']),
    },
    bag: {
      found: parseBag(bag['found']),
      spent: parseBag(bag['spent']),
      unlocks: parseUnlocks(bag['unlocks']),
      activeBag: isBagId(bag['activeBag']) ? bag['activeBag'] : STARTER_BAG,
    },
    house: parseLayout(o['house']),
    care: parseStats(o['care'], endedAt),
    summary,
  };
}

function entryOf(p: ProfileFile, guest: boolean, hidden: boolean): ProfileEntry {
  return {
    id: p.id,
    name: p.name,
    finished: p.finished,
    ...(p.moved ? { moved: true } : {}),
    ...(p.complete ? { complete: p.complete } : {}),
    createdAt: p.createdAt,
    endedAt: p.endedAt,
    ...(hidden ? { hidden: true } : {}),
    ...(guest ? { guest: true } : {}),
    pet: p.pet,
    summary: p.summary,
  };
}

function parseEntries(v: unknown): ProfileEntry[] {
  return Array.isArray(v)
    ? v.filter(
        (e): e is ProfileEntry =>
          !!obj(e) && isSlotId(e.id) && typeof e.name === 'string' && !!parseLook(e.pet),
      )
    : [];
}

/** What a profile shares with a friend: the save without its fact history. */
export function sharable(p: ProfileFile): ProfileFile {
  return { ...p, moved: undefined, progress: { ...p.progress, facts: {}, banked: {} } };
}

/** The stores of the current save. */
export interface SaveStores {
  bag: BagStore;
  house: HouseStore;
  care: CareStore;
  progress: ProgressStore;
}

export interface ProfilesDeps {
  /** Extension globalState, not slot-scoped: the index lives beside the slots. */
  storage: Storage;
  /** `<globalStorageUri>/profiles`. */
  dir: string;
  slots: Slots;
  stores: SaveStores;
  look: () => PetLook;
  levelsOn: () => boolean;
  now: () => Date;
}

type Import = { ok: true; profile: ProfileFile } | { ok: false; reason: string };

/**
 * Save slots and the profiles they become. Ending a save writes everything
 * that belongs to it to `profiles/<slot>.json`, reads it back to be sure,
 * and only then starts a fresh slot. An index in globalState lists the
 * profiles for the house menu; if it and the folder disagree, the folder wins.
 */
export class Profiles {
  constructor(private readonly deps: ProfilesDeps) {}

  private file(id: string, guest: boolean): string {
    return path.join(this.deps.dir, ...(guest ? ['guests'] : []), `${id}.json`);
  }

  private read(file: string): ProfileFile | null {
    try {
      return parseProfile(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      return null;
    }
  }

  /** Writes a profile and reads it back; throws unless what is on disk is what was meant. */
  private write(p: ProfileFile, guest: boolean): void {
    const file = this.file(p.id, guest);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const json = JSON.stringify(p);
    fs.writeFileSync(`${file}.tmp`, json, 'utf8');
    fs.renameSync(`${file}.tmp`, file);
    const back = this.read(file);
    if (!back || JSON.stringify(back) !== JSON.stringify(parseProfile(JSON.parse(json)))) {
      throw new Error('the profile file did not read back the same');
    }
  }

  /** When the current save began: its slot's start, or for the first slot its oldest XP. */
  private firstPlayed(slot: Slot): number {
    if (slot.startedAt > 0) {
      return slot.startedAt;
    }
    const { progress } = this.deps.stores;
    const times = [
      ...Object.values(progress.facts()).map((f) => f.at),
      ...Object.keys(progress.banked()).map((m) => new Date(`${m}-01T00:00:00`).getTime()),
    ];
    return times.length > 0 ? Math.min(...times) : this.deps.now().getTime();
  }

  /** The numbers for the finish card, for the save being played. */
  summary(): FinishSummary {
    const { bag, house, progress } = this.deps.stores;
    const now = this.deps.now().getTime();
    const { level, xp } = levelOf(progress.total());
    const life = progress.lifetime();
    const rooms = Object.values(house.get().houses).map(
      (h) => Object.values(h).filter((r) => r.items.some((i) => !i.removed)).length,
    );
    return {
      days: Math.max(1, Math.ceil((now - this.firstPlayed(this.deps.slots.current())) / DAY_MS)),
      level,
      xp,
      prompts: life.prompts,
      actions: life.actions,
      agentHours: Math.round(life.agentMs / 3_600_000),
      // Holiday toys are a bonus, never part of the collection.
      toys: Object.keys(bag.get()).filter((id) => !isEventToy(id)).length,
      bags: bagsUnlocked(level, this.deps.levelsOn()).length,
      houses: rooms.filter((n) => n > 0).length,
      rooms: rooms.reduce((a, b) => a + b, 0),
      records: life.records,
    };
  }

  /** The save being played, as a profile (not written anywhere). */
  current(finished: boolean, moved = false): ProfileFile {
    const { bag, house, care, progress } = this.deps.stores;
    const slot = this.deps.slots.current();
    const now = this.deps.now();
    const pet = this.deps.look();
    const summary = this.summary();
    const complete = this.completion();
    const ordinal = this.list({ hidden: true }).filter((p) => !p.guest).length + 1;
    return {
      version: PROFILE_VERSION,
      id: slot.id,
      name: `${pet.name}'s ${ORDINALS[ordinal - 1] ?? `#${ordinal}`} save`,
      createdAt: this.firstPlayed(slot),
      endedAt: now.getTime(),
      finished,
      ...(moved ? { moved: true } : {}),
      ...(complete ? { complete } : {}),
      pet,
      progress: {
        xp: summary.xp,
        level: summary.level,
        facts: progress.facts(),
        banked: progress.banked(),
        lifetime: progress.lifetime(),
      },
      bag: {
        found: bag.get(),
        spent: bag.getSpent(),
        unlocks: bag.getUnlocks(),
        activeBag: bag.getActiveBag(summary.level, this.deps.levelsOn()),
      },
      house: house.get(),
      care: care.get(now.getTime()),
      summary,
    };
  }

  /** How complete the current save's collection is, as the view last reported. */
  completion(): Completion {
    return this.deps.stores.bag.getCompletion();
  }

  /** True if the current save has anything worth keeping. */
  hasProgress(): boolean {
    const { bag, progress } = this.deps.stores;
    return progress.total() > 0 || Object.keys(bag.get()).length > 0;
  }

  private index(): ProfileEntry[] {
    return parseEntries(this.deps.storage.get(INDEX_KEY));
  }

  private saveIndex(entries: ProfileEntry[]): void {
    void this.deps.storage.update(INDEX_KEY, entries);
  }

  private onDisk(guest: boolean): string[] {
    try {
      return fs
        .readdirSync(path.dirname(this.file('x', guest)))
        .filter((f) => f.endsWith('.json') && isSlotId(f.slice(0, -5)))
        .map((f) => f.slice(0, -5));
    } catch {
      return [];
    }
  }

  /** The index, rebuilt from the folder if the two disagree. Hidden flags survive a rebuild. */
  private entries(): ProfileEntry[] {
    const index = this.index();
    const key = (id: string, guest: boolean) => `${guest ? 'g' : 'p'}:${id}`;
    const want = [
      ...this.onDisk(false).map((id) => key(id, false)),
      ...this.onDisk(true).map((id) => key(id, true)),
    ].sort();
    const have = index.map((e) => key(e.id, !!e.guest)).sort();
    if (want.join() === have.join()) {
      return index;
    }
    const hidden = new Set(index.filter((e) => e.hidden).map((e) => key(e.id, !!e.guest)));
    const rebuilt: ProfileEntry[] = [];
    for (const guest of [false, true]) {
      for (const id of this.onDisk(guest)) {
        const p = this.read(this.file(id, guest));
        if (p) {
          rebuilt.push(entryOf(p, guest, hidden.has(key(id, guest))));
        }
      }
    }
    this.saveIndex(rebuilt);
    return rebuilt;
  }

  /** Earlier saves newest first, then friends' profiles. Never the save being played. */
  list(opts: { hidden?: boolean } = {}): ProfileEntry[] {
    const current = this.deps.slots.current().id;
    return this.entries()
      .filter((e) => (e.guest || e.id !== current) && (opts.hidden || !e.hidden))
      .sort((a, b) => Number(!!a.guest) - Number(!!b.guest) || b.endedAt - a.endedAt);
  }

  load(id: string, guest = false): ProfileFile | null {
    return isSlotId(id) ? this.read(this.file(id, guest)) : null;
  }

  /** Writes the current save to its profile file. Throws, changing nothing, if that fails. */
  archive(finished: boolean, moved = false): ProfileFile {
    const p = this.current(finished, moved);
    this.write(p, false);
    const others = this.entries().filter((e) => e.guest || e.id !== p.id);
    this.saveIndex([...others, entryOf(p, false, false)]);
    return p;
  }

  /**
   * Ends the current save: archives it, then starts a fresh slot at level 1.
   * Holiday toys come along, since they can only be found during their event.
   */
  startNewSave(finished: boolean, moved = false): ProfileFile {
    const old = this.archive(finished, moved);
    const now = this.deps.now();
    const taken = new Set([old.id, ...this.entries().map((e) => e.id)]);
    this.deps.slots.start({
      id: slotId(this.deps.look().name, now, (id) => taken.has(id)),
      startedAt: now.getTime(),
    });
    const holiday = Object.fromEntries(
      Object.entries(old.bag.found).filter(([id]) => isEventToy(id)),
    );
    if (Object.keys(holiday).length > 0) {
      this.deps.stores.bag.save(holiday);
    }
    return old;
  }

  private update(id: string, guest: boolean, change: (e: ProfileEntry) => ProfileEntry): void {
    this.saveIndex(this.entries().map((e) => (e.id === id && !!e.guest === guest ? change(e) : e)));
  }

  rename(id: string, guest: boolean, name: string): boolean {
    const p = this.load(id, guest);
    const clean = name.trim().slice(0, 80);
    if (!p || !clean) {
      return false;
    }
    this.write({ ...p, name: clean }, guest);
    this.update(id, guest, (e) => ({ ...e, name: clean }));
    return true;
  }

  /** Hides a profile from the house menu (or shows it again). The file stays on disk. */
  hide(id: string, guest: boolean, hidden: boolean): void {
    this.update(id, guest, (e) => {
      const next: ProfileEntry = { ...e, hidden: true };
      if (!hidden) {
        delete next.hidden;
      }
      return next;
    });
  }

  /** A profile to send to a friend, as JSON text: no fact history, no paths, no prompts. */
  exportJson(id: string | null): string | null {
    const p = id === null ? this.current(this.finishedNow()) : this.load(id);
    return p ? JSON.stringify(sharable(p), null, 2) : null;
  }

  private finishedNow(): boolean {
    return Object.values(this.deps.stores.progress.facts()).some((f) => f.kind === 'finish');
  }

  /** Reads a friend's `.petprofile.json`. A newer copy of the same friend replaces the older one. */
  importGuest(json: string): Import {
    if (Buffer.byteLength(json, 'utf8') > GUEST_MAX_BYTES) {
      return { ok: false, reason: 'That profile is too big (over 1 MB).' };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return { ok: false, reason: "That file isn't a Pet Agents profile, or it is damaged." };
    }
    const version = obj(raw)?.['version'];
    if (typeof version === 'number' && version > PROFILE_VERSION) {
      return {
        ok: false,
        reason: 'That profile is from a newer Pet Agents. Update Pet Agents first.',
      };
    }
    const parsed = parseProfile(raw);
    if (!parsed) {
      return { ok: false, reason: "That file isn't a Pet Agents profile, or it is damaged." };
    }
    const profile = sharable(parsed);
    const had = this.load(profile.id, true);
    if (had && had.endedAt >= profile.endedAt) {
      return { ok: true, profile: had };
    }
    this.write(profile, true);
    const hidden = this.entries().some((e) => e.guest && e.id === profile.id && e.hidden);
    const others = this.entries().filter((e) => !(e.guest && e.id === profile.id));
    this.saveIndex([...others, entryOf(profile, true, hidden)]);
    return { ok: true, profile };
  }

  /** Every own profile and every friend's, for a move to another computer. */
  all(): { profiles: ProfileFile[]; guests: ProfileFile[] } {
    const load = (guest: boolean) =>
      this.onDisk(guest)
        .map((id) => this.load(id, guest))
        .filter((p): p is ProfileFile => !!p);
    return { profiles: load(false), guests: load(true) };
  }

  /** Adds profiles that came with a moved pet; a copy already here wins if it is newer. */
  adopt(profiles: ProfileFile[], guests: ProfileFile[]): void {
    for (const [list, guest] of [
      [profiles, false],
      [guests, true],
    ] as const) {
      for (const p of list) {
        const had = this.load(p.id, guest);
        if (!had || had.endedAt < p.endedAt) {
          this.write(p, guest);
        }
      }
    }
    // The next read sees the folder changed and rebuilds the index.
  }

  /**
   * Makes `save` the current save: its slot, then everything it holds. The
   * stores merge, so if this slot was here before (a pet coming back) it
   * keeps the best of both.
   */
  install(slot: Slot, save: ProfileFile): void {
    this.deps.slots.start(slot);
    const { bag, house, care, progress } = this.deps.stores;
    bag.save(save.bag.found);
    bag.saveSpent(save.bag.spent);
    bag.saveUnlocks(save.bag.unlocks);
    bag.setActiveBag(save.bag.activeBag);
    house.save(save.house);
    care.restore(save.care);
    progress.restore(save.progress.facts, save.progress.banked, save.progress.lifetime);
  }
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
