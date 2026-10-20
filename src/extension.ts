import * as path from 'path';
import * as vscode from 'vscode';
import { StateWatcher } from './state-watcher';
import { ClaudeWatcher } from './claude-watcher';
import { PeonViewProvider } from './PeonViewProvider';
import { CareStore } from './pet-care';
import { BagStore } from './bag-store';
import { customizePet } from './customize-menu';
import { getConfig, saveSetting } from './settings';

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

  const log = vscode.window.createOutputChannel('Pet Agents', { log: true });
  log.info(`Pet Agents ${String(context.extension.packageJSON.version)} started`);
  const viewProvider = new PeonViewProvider({
    mediaPath,
    peon,
    claude,
    getConfig,
    care: new CareStore(context.globalState),
    bag: new BagStore(context.globalState),
    saveSetting,
    log,
  });
  const syncTimer = setInterval(() => viewProvider.syncShared(), 60_000);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PeonViewProvider.viewId, viewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('pet-agents.customize', customizePet),
    vscode.commands.registerCommand('pet-agents.refresh', () => viewProvider.refresh()),
    vscode.commands.registerCommand('pet-agents.showLog', () => log.show()),
    log,
    new vscode.Disposable(() => clearInterval(syncTimer)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('pet-agents')) {
        viewProvider.reinit();
      }
    }),
  );
}

export function deactivate(): void {
  // Watchers are disposed via context.subscriptions.
}
