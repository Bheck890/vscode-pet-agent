export const SPECIES = ['cat', 'dog', 'bird', 'fox'] as const;
export type Species = (typeof SPECIES)[number];

/** Must match PATTERNS in media/pets.js. */
export const PATTERNS = ['none', 'spots', 'stripes', 'socks', 'mask', 'patch'] as const;
/** Must match ACCESSORIES in media/pets.js. */
export const ACCESSORIES = [
  'none',
  'bow',
  'flower',
  'crown',
  'beanie',
  'headphones',
  'glasses',
  'sunglasses',
  'bandana',
  'scarf',
  'collar',
] as const;

/** Pet styles from the bags' packs: each base look, then its colour variants. Must match STYLES in media/pets.js. */
export const STYLES = [
  'none',
  'flowerCrown',
  'flowerCrownSunny',
  'flowerCrownBluebell',
  'snorkel',
  'snorkelCoral',
  'snorkelGold',
  'chefHat',
  'chefHatPink',
  'chefHatBlack',
  'rockShades',
  'rockShadesGold',
  'rockShadesNeon',
  'sweatband',
  'sweatbandBlue',
  'sweatbandGreen',
  'spaceHelmet',
  'spaceHelmetGold',
  'spaceHelmetPink',
  'vampireCape',
  'vampireCapeBlue',
  'vampireCapeGreen',
  'retroVisor',
  'retroVisorGreen',
  'retroVisorPink',
  'strawHat',
  'strawHatRed',
  'strawHatBlue',
  'rangerHat',
  'rangerHatGreen',
  'rangerHatRed',
  'beret',
  'beretBlue',
  'beretGreen',
  'labGoggles',
  'labGogglesGreen',
  'labGogglesPink',
  'earmuffs',
  'earmuffsBlue',
  'earmuffsGreen',
  'explorerHat',
  'explorerHatGreen',
  'explorerHatWhite',
  'knightHelm',
  'knightHelmGold',
  'knightHelmBlack',
  'antenna',
  'antennaRed',
  'antennaBlue',
  'headwrap',
  'headwrapBlue',
  'headwrapRed',
  'aviator',
  'aviatorRed',
  'aviatorBlue',
  'halo',
  'haloPink',
  'haloBlue',
] as const;

export const DEFAULT_NAMES: Record<Species, string> = {
  cat: 'Mochi',
  dog: 'Biscuit',
  bird: 'Pip',
  fox: 'Rusty',
};

/** Colour presets offered by the "Customize Pet" command. Any CSS colour also works. */
export const COLOR_PRESETS: Array<{ label: string; color: string }> = [
  { label: 'Orange', color: '#e8772e' },
  { label: 'Ginger', color: '#d9822b' },
  { label: 'Chocolate', color: '#7b4a2a' },
  { label: 'Golden', color: '#e0b24f' },
  { label: 'Slate', color: '#8a8aa0' },
  { label: 'Midnight', color: '#3a3f5c' },
  { label: 'Snow', color: '#e8e8ee' },
  { label: 'Sky Blue', color: '#4aa3df' },
  { label: 'Mint', color: '#5cc9a7' },
  { label: 'Lavender', color: '#a98be0' },
  { label: 'Bubblegum', color: '#f27fb2' },
  { label: 'Lime', color: '#9ad94a' },
  { label: 'Cream', color: '#fbf3ea' },
  { label: 'Red', color: '#e63946' },
  { label: 'Black', color: '#22222a' },
];

export const EYE_PRESETS: Array<{ label: string; color: string }> = [
  { label: 'Black', color: '' },
  { label: 'Blue', color: '#3a7bd5' },
  { label: 'Green', color: '#2f9e5a' },
  { label: 'Amber', color: '#e09b1f' },
  { label: 'Violet', color: '#8a4fd8' },
  { label: 'Red', color: '#d63a3a' },
];

/** Everything the webview needs to draw the pet. Colours are any CSS colour or '' for default. */
export interface PetConfig {
  species: Species;
  color: string;
  accentColor: string;
  eyeColor: string;
  pattern: string;
  accessory: string;
  accessoryColor: string;
  name: string;
  /** Tint the pet and its aura with a colour per agent state. */
  stateColors: boolean;
  /** Let the pet roam around the panel when idle. */
  wander: boolean;
  /** 'smooth' rounds the pixel art off; 'pixel' keeps the crisp blocks. */
  artStyle: 'smooth' | 'pixel';
  /** 'random' picks a different animation each time; 'classic' always uses the first one. */
  variety: 'random' | 'classic';
  /** Toys and furniture of varying rarity turn up around the pet. */
  toys: boolean;
  /** A machine (washer, oven, computer...) appears for each test run or background job. */
  machines: boolean;
  /** Other busy Claude sessions show as small pets along the bottom. */
  backgroundPets: boolean;
  /** When no agents are running in this repo, show busy sessions from other repos instead. */
  otherRepoPets: boolean;
  /** Animations and hobbies switched off, as `state.variant` / `idle.hobby` ids. */
  disabledActions: string[];
  /** Holiday decorations, costumes and event toys. */
  holidays: boolean;
  /** Which way round the seasons go outside the house window. */
  hemisphere: 'north' | 'south';
  /** Weekly prompt records board. */
  records: boolean;
  /** Show prompt previews on the records board (they never leave this machine). */
  recordsShowPrompts: boolean;
  /** XP, levels and weekly challenges. */
  levels: boolean;
  /** Failing tests and builds turn up as bugs the pet squashes. */
  enemies: boolean;
  /** The pet's house, furnished with level unlocks. */
  house: boolean;
  /** A themed look from a bag's pack, or '' for none. */
  style: string;
  /** Show the post-to-X and Bluesky buttons on the finish screen. */
  shareButtons: boolean;
  /** Passers-by feed the pet, rain bathes it, and now and then someone drops in to play. */
  visitors: boolean;
  size: number;
}

/** Settings the webview's settings panel can switch. `variety` maps on/off to random/classic. */
const PANEL_SWITCHES = [
  'variety',
  'wander',
  'toys',
  'machines',
  'backgroundPets',
  'otherRepoPets',
  'stateColors',
  'holidays',
  'records',
  'recordsShowPrompts',
  'levels',
  'enemies',
  'house',
  'visitors',
];

/** A list of action ids like `running.zoomies`, or null if it isn't one. */
function actionIds(v: unknown): string[] | null {
  return Array.isArray(v) &&
    v.every((id) => typeof id === 'string' && /^[a-z]+\.[A-Za-z]+$/.test(id))
    ? (v as string[])
    : null;
}

/** Validates a change made in the webview's settings panel and returns the setting to save, or null. */
export function panelSetting(key: unknown, on: unknown): [string, unknown] | null {
  if (key === 'disabledActions') {
    const ids = actionIds(on);
    return ids ? [key, ids] : null;
  }
  if (key === 'style') {
    return typeof on === 'string' && (STYLES as readonly string[]).includes(on) ? [key, on] : null;
  }
  if (typeof key !== 'string' || !PANEL_SWITCHES.includes(key) || typeof on !== 'boolean') {
    return null;
  }
  return [key, key === 'variety' ? (on ? 'random' : 'classic') : on];
}

export function isSpecies(v: unknown): v is Species {
  return typeof v === 'string' && (SPECIES as readonly string[]).includes(v);
}

/** Converts the `pet-agents.size` setting string to a pixel value. */
export function sizeFromSetting(setting: string): number {
  switch (setting) {
    case 'small':
      return 150;
    case 'large':
      return 250;
    default:
      return 200;
  }
}

function oneOf(v: unknown, allowed: readonly string[]): string {
  return typeof v === 'string' && allowed.includes(v) && v !== 'none' ? v : '';
}

/** Builds a {@link PetConfig} from a settings getter, applying defaults for bad values. */
export function readPetConfig(get: (key: string) => unknown): PetConfig {
  const text = (key: string) => {
    const v = get(key);
    return typeof v === 'string' ? v.trim() : '';
  };
  const rawSpecies = get('species');
  const species: Species = isSpecies(rawSpecies) ? rawSpecies : 'fox';
  const size = get('size');
  return {
    species,
    color: text('color'),
    accentColor: text('accentColor'),
    eyeColor: text('eyeColor'),
    pattern: oneOf(get('pattern'), PATTERNS),
    accessory: oneOf(get('accessory'), ACCESSORIES),
    accessoryColor: text('accessoryColor'),
    name: text('name') || DEFAULT_NAMES[species],
    stateColors: get('stateColors') !== false,
    wander: get('wander') !== false,
    artStyle: get('artStyle') === 'pixel' ? 'pixel' : 'smooth',
    variety: get('variety') === 'classic' ? 'classic' : 'random',
    toys: get('toys') !== false,
    machines: get('machines') !== false,
    backgroundPets: get('backgroundPets') !== false,
    otherRepoPets: get('otherRepoPets') !== false,
    disabledActions: actionIds(get('disabledActions')) ?? [],
    holidays: get('holidays') !== false,
    hemisphere: get('hemisphere') === 'south' ? 'south' : 'north',
    records: get('records') !== false,
    recordsShowPrompts: get('recordsShowPrompts') === true,
    levels: get('levels') !== false,
    enemies: get('enemies') !== false,
    house: get('house') !== false,
    style: oneOf(get('style'), STYLES),
    shareButtons: get('shareButtons') !== false,
    visitors: get('visitors') !== false,
    size: sizeFromSetting(typeof size === 'string' ? size : 'medium'),
  };
}
