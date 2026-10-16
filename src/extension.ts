import * as path from 'path';
import * as vscode from 'vscode';
import {
  ACCESSORIES,
  COLOR_PRESETS,
  DEFAULT_NAMES,
  EYE_PRESETS,
  PATTERNS,
  SPECIES,
  readPetConfig,
  PetConfig,
} from './pet-config';
import { StateWatcher } from './state-watcher';
import { ClaudeWatcher } from './claude-watcher';
import { PeonViewProvider } from './PeonViewProvider';
import { CareStore } from './pet-care';

const SPECIES_ICONS: Record<string, string> = { cat: '🐱', dog: '🐶', bird: '🐦', fox: '🦊' };
const ACCESSORY_ICONS: Record<string, string> = {
  none: '🚫',
  bow: '🎀',
  flower: '🌸',
  crown: '👑',
  beanie: '🧢',
  headphones: '🎧',
  glasses: '👓',
  sunglasses: '🕶️',
  bandana: '🔺',
  scarf: '🧣',
  collar: '🔔',
};
const PATTERN_ICONS: Record<string, string> = {
  none: '⬜',
  spots: '🐆',
  stripes: '🐯',
  socks: '🧦',
  mask: '🦝',
  patch: '🏴',
};

function getConfig(): PetConfig {
  const cfg = vscode.workspace.getConfiguration('peon-pet');
  return readPetConfig((key) => cfg.get(key));
}

function save(key: string, value: unknown): Thenable<void> {
  return vscode.workspace
    .getConfiguration('peon-pet')
    .update(key, value, vscode.ConfigurationTarget.Global);
}

function title(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Colour picker with presets, a default option and free CSS input. Returns undefined on Escape. */
async function pickColor(
  heading: string,
  current: string,
  presets: Array<{ label: string; color: string }>,
  defaultLabel: string,
): Promise<string | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: `$(sparkle) ${defaultLabel}`, color: '' },
      ...presets
        .filter((p) => p.color)
        .map((p) => ({ label: p.label, description: p.color, color: p.color })),
      { label: '$(edit) Custom...', color: '?' },
    ],
    { title: heading, placeHolder: current || defaultLabel },
  );
  if (!choice) {
    return undefined;
  }
  if (choice.color !== '?') {
    return choice.color;
  }
  const custom = await vscode.window.showInputBox({
    title: heading,
    prompt: 'Any CSS colour: #ff8800, hotpink, rebeccapurple...',
    value: current,
  });
  return custom?.trim();
}

async function pickFrom(
  heading: string,
  options: readonly string[],
  icons: Record<string, string>,
  current: string,
): Promise<string | undefined> {
  const choice = await vscode.window.showQuickPick(
    options.map((o) => ({
      label: `${icons[o] ?? ''} ${title(o)}`,
      id: o,
      description: o === (current || 'none') ? 'current' : undefined,
    })),
    { title: heading },
  );
  return choice?.id;
}

const COLOR_LABELS: Record<string, string> = {
  color: 'Fur colour',
  accentColor: 'Belly / muzzle colour',
  accessoryColor: 'Accessory colour',
};

/**
 * A menu of everything about the pet. Each change is saved immediately (the
 * pet redraws live), then the menu reopens until the user presses Escape.
 */
async function customizePet(): Promise<void> {
  for (;;) {
    const c = getConfig();
    const menu = await vscode.window.showQuickPick(
      [
        { id: 'species', label: `${SPECIES_ICONS[c.species]} Species`, description: c.species },
        { id: 'color', label: '🎨 Fur colour', description: c.color || 'default' },
        {
          id: 'accentColor',
          label: '🤍 Belly / muzzle colour',
          description: c.accentColor || 'default',
        },
        { id: 'eyeColor', label: '👁️ Eye colour', description: c.eyeColor || 'black' },
        { id: 'pattern', label: '🐾 Pattern', description: c.pattern || 'none' },
        { id: 'accessory', label: '🎀 Accessory', description: c.accessory || 'none' },
        {
          id: 'accessoryColor',
          label: '🖌️ Accessory colour',
          description: c.accessoryColor || 'default',
        },
        { id: 'name', label: '🏷️ Name', description: c.name },
        { id: 'wander', label: '🚶 Wander when idle', description: c.wander ? 'on' : 'off' },
        { id: 'stateColors', label: '🌈 State colours', description: c.stateColors ? 'on' : 'off' },
        { id: 'artStyle', label: '✏️ Art style', description: c.artStyle },
        {
          id: 'variety',
          label: '🎬 Animation variety',
          description: c.variety === 'random' ? 'random (mix it up)' : 'classic (always the same)',
        },
        { id: 'toys', label: '🧸 Toys & furniture', description: c.toys ? 'on' : 'off' },
        {
          id: 'machines',
          label: '🧺 Machines for tests & jobs',
          description: c.machines ? 'on' : 'off',
        },
        {
          id: 'backgroundPets',
          label: '🐾 Pets for other sessions',
          description: c.backgroundPets ? 'on' : 'off',
        },
        { id: 'random', label: '🎲 Randomize look' },
        { id: 'reset', label: '🔄 Reset look to defaults' },
      ],
      { title: `Customize ${c.name}`, placeHolder: 'Pick something to change (Esc when done)' },
    );
    if (!menu) {
      return;
    }

    switch (menu.id) {
      case 'species': {
        const s = await pickFrom('Species', SPECIES, SPECIES_ICONS, c.species);
        if (s) {
          const customName = c.name !== DEFAULT_NAMES[c.species];
          await save('species', s);
          if (!customName) {
            await save('name', '');
          }
        }
        break;
      }
      case 'color':
      case 'accentColor':
      case 'accessoryColor': {
        const v = await pickColor(COLOR_LABELS[menu.id], c[menu.id], COLOR_PRESETS, 'Default');
        if (v !== undefined) {
          await save(menu.id, v);
        }
        break;
      }
      case 'eyeColor': {
        const v = await pickColor('Eye colour', c.eyeColor, EYE_PRESETS, 'Black');
        if (v !== undefined) {
          await save('eyeColor', v);
        }
        break;
      }
      case 'pattern': {
        const v = await pickFrom('Pattern', PATTERNS, PATTERN_ICONS, c.pattern);
        if (v) {
          await save('pattern', v === 'none' ? '' : v);
        }
        break;
      }
      case 'accessory': {
        const v = await pickFrom('Accessory', ACCESSORIES, ACCESSORY_ICONS, c.accessory);
        if (v) {
          await save('accessory', v === 'none' ? '' : v);
        }
        break;
      }
      case 'name': {
        const v = await vscode.window.showInputBox({ title: 'Name', value: c.name });
        if (v !== undefined) {
          await save('name', v.trim() === DEFAULT_NAMES[c.species] ? '' : v.trim());
        }
        break;
      }
      case 'wander':
        await save('wander', !c.wander);
        break;
      case 'stateColors':
        await save('stateColors', !c.stateColors);
        break;
      case 'artStyle':
        await save('artStyle', c.artStyle === 'smooth' ? 'pixel' : 'smooth');
        break;
      case 'variety':
        await save('variety', c.variety === 'random' ? 'classic' : 'random');
        break;
      case 'toys':
      case 'machines':
      case 'backgroundPets':
        await save(menu.id, !c[menu.id]);
        break;
      case 'random':
        await save('color', pick(COLOR_PRESETS).color);
        await save('accentColor', Math.random() < 0.6 ? '' : pick(COLOR_PRESETS).color);
        await save('eyeColor', pick(EYE_PRESETS).color);
        await save('pattern', pick(PATTERNS).replace('none', ''));
        await save('accessory', pick(ACCESSORIES).replace('none', ''));
        await save('accessoryColor', Math.random() < 0.5 ? '' : pick(COLOR_PRESETS).color);
        break;
      case 'reset':
        for (const key of [
          'color',
          'accentColor',
          'eyeColor',
          'pattern',
          'accessory',
          'accessoryColor',
        ]) {
          await save(key, undefined);
        }
        break;
    }
  }
}

/**
 * Extension entry point. Called once by VS Code / Cursor when the extension
 * first activates (see `activationEvents` in `package.json`).
 */
export function activate(context: vscode.ExtensionContext): void {
  const mediaPath = path.join(context.extensionPath, 'media');

  const peon = new StateWatcher();
  peon.start();
  context.subscriptions.push(peon);

  const claude = new ClaudeWatcher(() =>
    (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
  );
  claude.start();
  context.subscriptions.push(claude);

  const viewProvider = new PeonViewProvider(
    mediaPath,
    peon,
    claude,
    getConfig,
    new CareStore(context.globalState),
    save,
  );
  const careTimer = setInterval(() => viewProvider.sendCare(), 60_000);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PeonViewProvider.viewId, viewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('peon-pet.customize', customizePet),
    new vscode.Disposable(() => clearInterval(careTimer)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('peon-pet')) {
        viewProvider.reinit();
      }
    }),
  );
}

export function deactivate(): void {
  // Watchers are disposed via context.subscriptions.
}
