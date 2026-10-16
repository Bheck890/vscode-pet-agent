import { funnyName } from '../pet-names';
import { DEFAULT_NAMES, panelSetting, readPetConfig, sizeFromSetting } from '../pet-config';

describe('sizeFromSetting', () => {
  it('maps small/medium/large and falls back to 200', () => {
    expect(sizeFromSetting('small')).toBe(150);
    expect(sizeFromSetting('medium')).toBe(200);
    expect(sizeFromSetting('large')).toBe(250);
    expect(sizeFromSetting('huge')).toBe(200);
    expect(sizeFromSetting('')).toBe(200);
  });
});

const DEFAULTS = {
  species: 'fox',
  color: '',
  accentColor: '',
  eyeColor: '',
  pattern: '',
  accessory: '',
  accessoryColor: '',
  name: DEFAULT_NAMES.fox,
  stateColors: true,
  wander: true,
  artStyle: 'smooth',
  variety: 'random',
  toys: true,
  machines: true,
  backgroundPets: true,
  disabledActions: [],
  size: 200,
};

describe('readPetConfig', () => {
  it('applies defaults for missing or invalid settings', () => {
    expect(readPetConfig(() => undefined)).toEqual(DEFAULTS);
    expect(readPetConfig((k) => (k === 'species' ? 'dragon' : undefined)).species).toBe('fox');
  });

  it('uses the species default name when name is blank', () => {
    const values: Record<string, unknown> = { species: 'fox', name: '   ' };
    expect(readPetConfig((k) => values[k]).name).toBe('Rusty');
  });

  it('drops unknown patterns and accessories, and treats none as empty', () => {
    const values: Record<string, unknown> = { pattern: 'plaid', accessory: 'none' };
    const cfg = readPetConfig((k) => values[k]);
    expect(cfg.pattern).toBe('');
    expect(cfg.accessory).toBe('');
  });

  it('passes through user choices', () => {
    const values: Record<string, unknown> = {
      species: 'bird',
      color: ' hotpink ',
      accentColor: '#ffeeaa',
      eyeColor: 'blue',
      pattern: 'spots',
      accessory: 'crown',
      accessoryColor: 'gold',
      name: 'Tweety',
      stateColors: false,
      wander: false,
      artStyle: 'pixel',
      variety: 'classic',
      toys: false,
      machines: false,
      backgroundPets: false,
      disabledActions: ['running.zoomies', 'idle.butterfly'],
      size: 'large',
    };
    expect(readPetConfig((k) => values[k])).toEqual({
      species: 'bird',
      color: 'hotpink',
      accentColor: '#ffeeaa',
      eyeColor: 'blue',
      pattern: 'spots',
      accessory: 'crown',
      accessoryColor: 'gold',
      name: 'Tweety',
      stateColors: false,
      wander: false,
      artStyle: 'pixel',
      variety: 'classic',
      toys: false,
      machines: false,
      backgroundPets: false,
      disabledActions: ['running.zoomies', 'idle.butterfly'],
      size: 250,
    });
  });
});

describe('panelSetting', () => {
  it('maps the settings panel switches to settings', () => {
    expect(panelSetting('toys', false)).toEqual(['toys', false]);
    expect(panelSetting('variety', true)).toEqual(['variety', 'random']);
    expect(panelSetting('variety', false)).toEqual(['variety', 'classic']);
  });

  it('accepts a list of switched-off actions', () => {
    expect(panelSetting('disabledActions', ['running.zoomies'])).toEqual([
      'disabledActions',
      ['running.zoomies'],
    ]);
    expect(panelSetting('disabledActions', ['<script>'])).toBeNull();
    expect(
      readPetConfig((k) => (k === 'disabledActions' ? 'zoomies' : undefined)).disabledActions,
    ).toEqual([]);
  });

  it('rejects anything else', () => {
    expect(panelSetting('species', true)).toBeNull();
    expect(panelSetting('toys', 'yes')).toBeNull();
    expect(panelSetting(undefined, true)).toBeNull();
  });
});

describe('funnyName', () => {
  it('is deterministic per agent id', () => {
    expect(funnyName('abc123', 'Explore', new Set())).toBe(
      funnyName('abc123', 'Explore', new Set()),
    );
  });

  it('picks a title that matches the job', () => {
    expect(funnyName('a1', 'Explore Find the batch screen', new Set())).toMatch(
      /^(Detective|Scout|Sniffer|Tracker|Sleuth) /,
    );
    expect(funnyName('a1', 'Plan design the API', new Set())).toMatch(
      /^(Professor|Architect|Strategist|Dr\.) /,
    );
  });

  it('avoids names already in use', () => {
    const first = funnyName('same', 'general-purpose', new Set());
    const second = funnyName('same', 'general-purpose', new Set([first]));
    expect(second).not.toBe(first);
  });
});
