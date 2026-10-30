/**
 * The bag ladder: which level unlocks each themed pack, and the rooms of the
 * house that pack brings (each bag has one house with the bag's id). The
 * toys, art and names live in the webview (media/scene.js, media/house.js);
 * the webview gets this list in `init`, and tests keep the ids in step.
 */
export interface BagLevel {
  id: string;
  level: number;
  /** The house's rooms: the first two come with the bag, the rest are sold in its shop. */
  rooms: string[];
}

export const STARTER_BAG = 'starter';

export const BAG_LEVELS: BagLevel[] = [
  { id: 'starter', level: 1, rooms: ['living', 'bedroom', 'kitchen', 'yard'] },
  { id: 'garden', level: 2, rooms: ['greenhouse', 'shed', 'patch'] },
  { id: 'ocean', level: 3, rooms: ['hut', 'deck', 'rockpool'] },
  { id: 'kitchen', level: 4, rooms: ['shopfloor', 'bakehouse', 'loft'] },
  { id: 'music', level: 5, rooms: ['booth', 'stage', 'greenroom'] },
  { id: 'sports', level: 7, rooms: ['lockers', 'pitch', 'canteen'] },
  { id: 'space', level: 9, rooms: ['airlock', 'observatory', 'dome', 'bunks'] },
  { id: 'spooky', level: 11, rooms: ['hall', 'crypt', 'attic'] },
  { id: 'retro', level: 13, rooms: ['arcade', 'den', 'snackbar'] },
  { id: 'farm', level: 15, rooms: ['barn', 'farmkitchen', 'field'] },
  { id: 'camping', level: 17, rooms: ['tent', 'campfire', 'lake'] },
  { id: 'art', level: 19, rooms: ['studio', 'gallery', 'attic'] },
  { id: 'lab', level: 21, rooms: ['lab', 'library', 'dorm'] },
  { id: 'winter', level: 23, rooms: ['lodge', 'cabin', 'slope'] },
  { id: 'jungle', level: 25, rooms: ['treehouse', 'hammock', 'river'] },
  { id: 'castle', level: 27, rooms: ['throne', 'tower', 'feast', 'courtyard'] },
  { id: 'robots', level: 29, rooms: ['workshop', 'charging', 'track'] },
  { id: 'desert', level: 31, rooms: ['oasis', 'bazaar', 'palace'] },
  { id: 'sky', level: 33, rooms: ['cloudhall', 'nest', 'balloon'] },
  { id: 'vault', level: 35, rooms: ['vault', 'hoard', 'trophies'] },
];

/** The holidays, in the order media/events.js and the bags' holiday toys use. */
export const HOLIDAYS = [
  'halloween',
  'thanksgiving',
  'christmas',
  'newyear',
  'valentine',
  'easter',
];

/** The starter bag's holiday toys; every other bag's are named `<bag><holiday>`. */
export const STARTER_EVENT_TOYS = ['pumpkin', 'pie', 'snowman', 'popper', 'chocolates', 'egg'];

/**
 * True for a holiday toy (rarity `event` in media/scene.js). They can only
 * be found while their holiday is on, so they come along into a new save.
 */
export function isEventToy(id: string): boolean {
  return (
    STARTER_EVENT_TOYS.includes(id) ||
    BAG_LEVELS.some((b) => b.id !== STARTER_BAG && HOLIDAYS.some((h) => id === `${b.id}${h}`))
  );
}

export function isBagId(v: unknown): v is string {
  return typeof v === 'string' && BAG_LEVELS.some((b) => b.id === v);
}

/** True if `room` is one of `house`'s rooms. */
export function isRoom(house: string, room: string): boolean {
  return !!BAG_LEVELS.find((b) => b.id === house)?.rooms.includes(room);
}

/** The bags open at `level`, in ladder order. With levels switched off, every bag is open. */
export function bagsUnlocked(level: number, levelsOn = true): string[] {
  return BAG_LEVELS.filter((b) => !levelsOn || b.level <= level).map((b) => b.id);
}

/** The level that unlocks the last bag: reaching it finishes the save. */
export const FINISH_LEVEL = Math.max(...BAG_LEVELS.map((b) => b.level));
/** A save can become a profile (and a new one start) from this level, with the full collection. */
export const NEW_SAVE_LEVEL = 100;
