import * as path from 'path';
import * as vscode from 'vscode';
import { StateWatcher } from './state-watcher';
import { ClaudeWatcher, PROJECTS_DIR } from './claude-watcher';
import { PeonViewProvider } from './PeonViewProvider';
import { CareStore } from './pet-care';
import { BagStore } from './bag-store';
import { HouseStore } from './house-store';
import { ProgressService } from './progress-service';
import { ProgressStore } from './progress-store';
import { RecordsService } from './records-service';
import { RecordsStore } from './records-store';
import { customizePet } from './customize-menu';
import { connectGames } from './games';
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
  context.subscriptions.push(claude);

  const log = vscode.window.createOutputChannel('Pet Agents', { log: true });
  log.info(`Pet Agents ${String(context.extension.packageJSON.version)} started`);

  // Records and XP: transcript events -> finished turns -> facts.
  const now = () => new Date();
  const records = new RecordsService(
    new RecordsStore(context.globalState),
    context.globalState,
    now,
  );
  const progress = new ProgressService(new ProgressStore(context.globalState), now);
  context.subscriptions.push(...connectGames(claude, records, progress));
  // Started only now, so the first scan's lines reach the records too.
  claude.start();
  // Fill this week's board from older transcripts, once the window has settled.
  const backfill = setTimeout(() => {
    records
      .backfill(PROJECTS_DIR)
      .then((n) => n > 0 && log.info(`Read ${n} earlier prompts from this week's transcripts`))
      .catch((err: unknown) => log.warn(`Backfilling prompt records failed: ${String(err)}`));
  }, 5000);
  context.subscriptions.push(new vscode.Disposable(() => clearTimeout(backfill)));

  const viewProvider = new PeonViewProvider({
    mediaPath,
    peon,
    claude,
    getConfig,
    now,
    care: new CareStore(context.globalState),
    bag: new BagStore(context.globalState),
    records,
    progress,
    house: new HouseStore(context.globalState),
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
