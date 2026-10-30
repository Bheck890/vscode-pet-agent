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
import { LOOK_KEYS, PetLook, Profiles } from './profiles';
import { RecordsService } from './records-service';
import { RecordsStore } from './records-store';
import { SHARE_SITES, SaveFlows, ShareSite } from './save-flows';
import { Slots } from './slot';
import { scoped } from './storage';
import { Visitors } from './visitors';
import { customizePet } from './customize-menu';
import { peonGuide, peonInstalled } from './peon-guide';
import { connectGames } from './games';
import { getConfig, saveSetting } from './settings';
import { vscodeUi } from './ui';

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

  // The save being played: its stores read and write under the current slot.
  const now = () => new Date();
  const slots = new Slots(
    context.globalState,
    now,
    () => getConfig().name,
    () => getConfig().companion,
  );
  const save = scoped(context.globalState, () => slots.current().id);
  const stores = {
    bag: new BagStore(save),
    house: new HouseStore(save),
    care: new CareStore(save),
    progress: new ProgressStore(save),
  };

  // Records and XP: transcript events -> finished turns -> facts. Records are about you, not the save.
  const recordsStore = new RecordsStore(context.globalState);
  const records = new RecordsService(recordsStore, context.globalState, now);
  const progress = new ProgressService(
    stores.progress,
    now,
    () => slots.current(),
    () => getConfig().companion === 'helper',
  );
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

  const look = (): PetLook => {
    const cfg = getConfig();
    return Object.fromEntries(LOOK_KEYS.map((k) => [k, cfg[k]])) as unknown as PetLook;
  };
  const profiles = new Profiles({
    storage: context.globalState,
    dir: path.join(context.globalStorageUri.fsPath, 'profiles'),
    slots,
    stores,
    look,
    levelsOn: () => getConfig().levels,
    now,
  });
  const flows = new SaveFlows({
    profiles,
    progress,
    records: recordsStore,
    slots,
    ui: vscodeUi,
    look,
    saveSetting,
    companion: () => getConfig().companion,
    now,
    log,
    saveChanged: () => viewProvider.refresh(),
    profilesChanged: () => viewProvider.profilesChanged(),
  });

  // A pet that needs looking after gets visitors, whether or not the view is open.
  const visitors = new Visitors(save, stores.care, () => Object.keys(stores.bag.get()));

  const viewProvider = new PeonViewProvider({
    mediaPath,
    peon,
    claude,
    getConfig,
    now,
    ...stores,
    progress,
    records,
    slots,
    profiles,
    flows,
    visitors,
    saveSetting,
    customize: () => void customizePet(),
    peonGuide: () => peonGuide(process.platform, peonInstalled()),
    copy: (text) =>
      void vscodeUi
        .copy(text)
        .then(() => vscodeUi.info('Pet Agents: copied. Paste it into a terminal.')),
    log,
  });

  const shareProgress = async () => {
    const options: Record<string, () => Promise<void>> = {
      'Copy a summary': () => flows.copySummary(0),
      ...(getConfig().shareButtons
        ? Object.fromEntries(
            (Object.keys(SHARE_SITES) as ShareSite[]).map((site) => [
              `Post to ${site === 'x' ? 'X' : 'Bluesky'}`,
              () => flows.post(site, 0),
            ]),
          )
        : {}),
    };
    const pick = await vscodeUi.choose('Share your progress', Object.keys(options));
    if (pick) {
      await options[pick]();
    }
  };

  const syncTimer = setInterval(() => {
    viewProvider.syncShared();
    const visit = getConfig().visitors ? visitors.tick(Date.now()) : null;
    if (visit) {
      viewProvider.visitor(visit);
    }
  }, 60_000);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PeonViewProvider.viewId, viewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('pet-agents.customize', customizePet),
    vscode.commands.registerCommand('pet-agents.refresh', () => viewProvider.refresh()),
    vscode.commands.registerCommand('pet-agents.showLog', () => log.show()),
    vscode.commands.registerCommand('pet-agents.newSave', () => flows.newSave()),
    vscode.commands.registerCommand('pet-agents.switchSave', () => flows.playSave()),
    vscode.commands.registerCommand('pet-agents.shareProgress', shareProgress),
    vscode.commands.registerCommand('pet-agents.exportProfile', () => flows.exportProfile(null)),
    vscode.commands.registerCommand('pet-agents.importProfile', () => flows.importProfile()),
    vscode.commands.registerCommand('pet-agents.movePet', () => flows.moveOut()),
    vscode.commands.registerCommand('pet-agents.receivePet', () => flows.moveIn()),
    log,
    new vscode.Disposable(() => clearInterval(syncTimer)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      // Switching between pet and helper changes the save being played, so the view starts over.
      if (e.affectsConfiguration('pet-agents.companion')) {
        viewProvider.refresh();
      } else if (e.affectsConfiguration('pet-agents')) {
        viewProvider.reinit();
      }
    }),
  );
}

export function deactivate(): void {
  // Watchers are disposed via context.subscriptions.
}
