import * as path from 'path';
import * as vscode from 'vscode';
import { COLOR_PRESETS, DEFAULT_NAMES, SPECIES, readPetConfig, PetConfig } from './pet-config';
import { StateWatcher } from './state-watcher';
import { ClaudeWatcher } from './claude-watcher';
import { PeonViewProvider } from './PeonViewProvider';

const SPECIES_ICONS: Record<string, string> = { cat: '🐱', dog: '🐶', bird: '🐦', fox: '🦊' };

function getConfig(): PetConfig {
  const cfg = vscode.workspace.getConfiguration('peon-pet');
  return readPetConfig((key) => cfg.get(key));
}

/** Walks the user through species -> colour -> name. Escape at any step keeps earlier picks. */
async function customizePet(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('peon-pet');
  const current = getConfig();
  const save = (key: string, value: unknown) =>
    cfg.update(key, value, vscode.ConfigurationTarget.Global);

  const species = await vscode.window.showQuickPick(
    SPECIES.map((s) => ({
      label: `${SPECIES_ICONS[s]} ${s[0].toUpperCase()}${s.slice(1)}`,
      id: s,
      picked: s === current.species,
    })),
    { title: 'Customize Pet (1/3): species', placeHolder: `Currently: ${current.species}` },
  );
  if (!species) {
    return;
  }
  await save('species', species.id);

  const color = await vscode.window.showQuickPick(
    [
      { label: '$(sparkle) Species default', color: '' },
      ...COLOR_PRESETS.map((p) => ({ label: p.label, description: p.color, color: p.color })),
      { label: '$(edit) Custom...', color: '?' },
    ],
    { title: 'Customize Pet (2/3): colour', placeHolder: current.color || 'Species default' },
  );
  if (!color) {
    return;
  }
  if (color.color === '?') {
    const custom = await vscode.window.showInputBox({
      title: 'Custom colour',
      prompt: 'Any CSS colour: #ff8800, hotpink, rebeccapurple...',
      value: current.color,
    });
    if (custom === undefined) {
      return;
    }
    await save('color', custom.trim());
  } else {
    await save('color', color.color);
  }

  const wasDefaultName = current.name === DEFAULT_NAMES[current.species];
  const name = await vscode.window.showInputBox({
    title: 'Customize Pet (3/3): name',
    value: wasDefaultName ? DEFAULT_NAMES[species.id] : current.name,
  });
  if (name !== undefined) {
    await save('name', name.trim() === DEFAULT_NAMES[species.id] ? '' : name.trim());
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

  const viewProvider = new PeonViewProvider(mediaPath, peon, claude, getConfig);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PeonViewProvider.viewId, viewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('peon-pet.customize', customizePet),
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
