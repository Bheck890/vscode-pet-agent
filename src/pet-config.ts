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
  size: number;
}

export function isSpecies(v: unknown): v is Species {
  return typeof v === 'string' && (SPECIES as readonly string[]).includes(v);
}

/** Converts the `peon-pet.size` setting string to a pixel value. */
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
    size: sizeFromSetting(typeof size === 'string' ? size : 'medium'),
  };
}
