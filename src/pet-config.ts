export const SPECIES = ['cat', 'dog', 'bird', 'fox'] as const;
export type Species = (typeof SPECIES)[number];

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
];

/** Everything the webview needs to draw the pet. */
export interface PetConfig {
  species: Species;
  /** Any CSS colour, or '' for the species default. Validated in the webview. */
  color: string;
  name: string;
  /** Tint the pet and its aura with a colour per agent state. */
  stateColors: boolean;
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

/** Builds a {@link PetConfig} from a settings getter, applying defaults for bad values. */
export function readPetConfig(get: (key: string) => unknown): PetConfig {
  const rawSpecies = get('species');
  const species: Species = isSpecies(rawSpecies) ? rawSpecies : 'cat';
  const color = typeof get('color') === 'string' ? (get('color') as string).trim() : '';
  const name = typeof get('name') === 'string' ? (get('name') as string).trim() : '';
  const size = get('size');
  return {
    species,
    color,
    name: name || DEFAULT_NAMES[species],
    stateColors: get('stateColors') !== false,
    size: sizeFromSetting(typeof size === 'string' ? size : 'medium'),
  };
}
