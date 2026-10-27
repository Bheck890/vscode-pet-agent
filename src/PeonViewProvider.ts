import * as vscode from 'vscode';
import { BAG_LEVELS, bagsUnlocked } from './bags';
import { PetConfig } from './pet-config';
import { StateWatcher } from './state-watcher';
import { ClaudeWatcher } from './claude-watcher';
import { CareStore } from './pet-care';
import { BagStore } from './bag-store';
import { calendarFor } from './calendar';
import { HouseStore } from './house-store';
import { ProgressService } from './progress-service';
import { Profiles } from './profiles';
import { RecordsService } from './records-service';
import { SaveFlows } from './save-flows';
import { Slots } from './slot';
import type { Visitor, Visitors } from './visitors';
import { FromWebview, ToWebview, WebviewState, parseFromWebview } from './protocol';
import { getNonce, getWebviewOptions, buildHtml } from './webview-html';

/** The slice of vscode.LogOutputChannel the view writes to. */
export type PetLog = Pick<vscode.LogOutputChannel, 'debug' | 'info' | 'warn' | 'error' | 'show'>;

/** The view can ask for a refresh when its frames keep failing; at most this often. */
const AUTO_REFRESH_MS = 5 * 60 * 1000;

/** Everything the pet view reads from or writes to. */
export interface PetViewDeps {
  mediaPath: string;
  peon: StateWatcher;
  claude: ClaudeWatcher;
  getConfig: () => PetConfig;
  /** The current time, so tests can pin the date. */
  now: () => Date;
  care: CareStore;
  bag: BagStore;
  records: RecordsService;
  progress: ProgressService;
  house: HouseStore;
  slots: Slots;
  profiles: Profiles;
  flows: SaveFlows;
  /** Told when you look after the pet, which puts off the next visitor. */
  visitors: Visitors;
  saveSetting: (key: string, value: unknown) => Thenable<void>;
  log: PetLog;
}

/**
 * {@link vscode.WebviewViewProvider} that renders the pet in the Explorer
 * sidebar. VS Code creates exactly one instance and calls
 * {@link resolveWebviewView} each time the panel becomes visible.
 */
export class PeonViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'petAgentsView';

  private view?: vscode.WebviewView;
  private watcherDisposable?: vscode.Disposable;
  private savedState?: WebviewState;
  private lastAutoRefresh = 0;
  /** The save the view was last started on; a different one means it must rebuild. */
  private shownSlot = '';

  constructor(private readonly deps: PetViewDeps) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext<WebviewState>,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    const { log, mediaPath } = this.deps;

    webviewView.webview.options = getWebviewOptions(mediaPath);
    webviewView.webview.html = buildHtml(webviewView.webview, mediaPath, getNonce());

    if (context.state) {
      this.savedState = context.state;
    }
    log.info(`Pet view opened${context.state ? ' (restored)' : ''}`);
    webviewView.onDidChangeVisibility(() =>
      log.debug(`Pet view ${webviewView.visible ? 'shown' : 'hidden'}`),
    );

    webviewView.webview.onDidReceiveMessage((msg: unknown) => {
      const message = parseFromWebview(msg);
      if (message) {
        this.handle(webviewView, message);
      }
    });

    // Replace any stale watcher binding with a fresh one
    this.watcherDisposable?.dispose();
    this.watcherDisposable = this.attachWatchers(webviewView.webview);

    webviewView.onDidDispose(() => {
      log.info('Pet view closed');
      this.watcherDisposable?.dispose();
      this.watcherDisposable = undefined;
      this.view = undefined;
    });
  }

  private level(): { level: number; levelsOn: boolean } {
    return { level: this.deps.progress.snapshot().level, levelsOn: this.deps.getConfig().levels };
  }

  private activeBag(): string {
    const { level, levelsOn } = this.level();
    return this.deps.bag.getActiveBag(level, levelsOn);
  }

  /** Starts the view on the current save. Also sent to a view still on an older one. */
  private sendInit(webview: vscode.Webview): void {
    const { bag, claude, getConfig, house, slots } = this.deps;
    this.shownSlot = slots.current().id;
    const state = {
      ...this.savedState,
      bag: bag.get(),
      spent: bag.getSpent(),
      unlocks: bag.getUnlocks(),
      activeBag: this.activeBag(),
    };
    post(webview, {
      command: 'init',
      config: getConfig(),
      state,
      bags: BAG_LEVELS,
      slot: this.shownSlot,
    });
    post(webview, { command: 'house', layout: house.get() });
    const latest = claude.latest();
    if (latest) {
      post(webview, { command: 'claude-update', ...latest });
    }
    this.syncShared();
  }

  /** True if a save message is for the save being played; otherwise the view is re-started. */
  private current(webview: vscode.Webview, slot: string): boolean {
    if (slot === this.deps.slots.current().id) {
      return true;
    }
    this.deps.log.info('Dropped a change from an earlier save; restarting the view');
    this.sendInit(webview);
    return false;
  }

  private handle(webviewView: vscode.WebviewView, message: FromWebview): void {
    const { bag, care, flows, log, profiles, saveSetting } = this.deps;
    const webview = webviewView.webview;
    switch (message.command) {
      case 'ready':
        this.sendInit(webview);
        break;
      case 'care': {
        // The webview only sends this when the agent is not working.
        const result = care.act(message.action);
        post(webview, { command: 'care-update', ...result });
        if (result.ok) {
          this.deps.progress.care(message.action);
          this.deps.visitors.cared(Date.now());
        }
        break;
      }
      case 'house-save':
        if (this.current(webview, message.slot)) {
          this.deps.house.save(message.layout);
        }
        break;
      case 'bag-switch': {
        const { level, levelsOn } = this.level();
        if (
          this.current(webview, message.slot) &&
          bagsUnlocked(level, levelsOn).includes(message.bag)
        ) {
          bag.setActiveBag(message.bag);
          post(webview, { command: 'unlocks', unlocks: bag.getUnlocks(), activeBag: message.bag });
        }
        break;
      }
      case 'found':
        this.deps.progress.found(message.bag, message.toy);
        break;
      case 'collection':
        bag.setCompletion(message.complete);
        break;
      case 'log':
        log[message.level](`view: ${message.message}`);
        break;
      case 'refresh':
        this.autoRefresh();
        break;
      case 'gather-logs':
        this.gatherLogs(webviewView, message.snapshot);
        break;
      case 'setting':
        void saveSetting(message.key, message.value);
        break;
      case 'save-state': {
        if (!this.current(webview, message.slot)) {
          break;
        }
        // Position and food stay with this view; the bag and shop go to extension storage.
        const { bag: found, spent, unlocks, ...view } = message.state;
        this.savedState = view;
        if (found) {
          bag.save(found);
        }
        if (spent) {
          bag.saveSpent(spent);
        }
        if (unlocks) {
          bag.saveUnlocks(unlocks);
        }
        break;
      }
      case 'new-save':
        void flows.newSave();
        break;
      case 'visit-profile': {
        const p = profiles.load(message.id, message.guest);
        if (p) {
          const { progress, ...rest } = p;
          post(webview, {
            command: 'profile',
            profile: {
              ...rest,
              progress: { xp: progress.xp, level: progress.level },
              guest: message.guest,
            },
          });
        }
        break;
      }
      case 'profile-rename':
        void flows.rename(message.id, message.guest);
        break;
      case 'profile-hide':
        profiles.hide(message.id, message.guest, message.hidden);
        this.sendProfiles(webview);
        break;
      case 'profile-export':
        void flows.exportProfile(message.id);
        break;
      case 'profile-import':
        void flows.importProfile();
        break;
      case 'finish-open':
        this.sendFinish(webview);
        break;
      case 'share-copy':
        void flows.copySummary(message.toyTotal);
        break;
      case 'share-post':
        if (this.deps.getConfig().shareButtons) {
          void flows.post(message.site, message.toyTotal);
        }
        break;
      case 'share-card':
        void flows.saveCard(message.png);
        break;
      case 'move-out':
        void flows.moveOut();
        break;
      case 'move-in':
        void flows.moveIn();
        break;
    }
  }

  /**
   * Forwards peon-ping and Claude transcript events into the webview. The
   * returned Disposable removes only this webview's listeners.
   */
  private attachWatchers(webview: vscode.Webview): vscode.Disposable {
    const { peon, claude, records, progress } = this.deps;
    const disposables = [
      records.onTurns((_turns, broken) => this.sendRecords(webview, broken)),
      progress.onChange(() => {
        post(webview, { command: 'progress-update', ...progress.snapshot() });
        if (progress.firstFinish()) {
          this.sendFinish(webview);
        }
      }),
      // peon-ping reports every agent on the machine; only this workspace's move this pet.
      peon.onPeonEvent((e) => {
        if (claude.ownsDir(e.cwd)) {
          post(webview, { command: 'peon-event', ...e });
        }
      }),
      peon.onSessionUpdate((e) => post(webview, { command: 'session-update', ...e })),
      claude.onUpdate((e) => post(webview, { command: 'claude-update', ...e })),
    ];
    return new vscode.Disposable(() => disposables.forEach((d) => d.dispose()));
  }

  /** The finish screen's numbers. */
  private sendFinish(webview: vscode.Webview): void {
    const { progress, profiles } = this.deps;
    post(webview, {
      command: 'finished',
      summary: profiles.summary(),
      finished: progress.snapshot().finished,
    });
  }

  private sendProfiles(webview: vscode.Webview): void {
    post(webview, { command: 'profiles', profiles: this.deps.profiles.list({ hidden: true }) });
  }

  /**
   * Pushes state every window shares, if the view is open: current (decayed)
   * care stats, and shop purchases, which another window may have made. A
   * new save started in another window rebuilds the view.
   */
  syncShared(): void {
    if (!this.view) {
      return;
    }
    const { care, bag, slots } = this.deps;
    if (this.shownSlot && slots.current().id !== this.shownSlot) {
      this.refresh();
      return;
    }
    const webview = this.view.webview;
    post(webview, { command: 'care-update', stats: care.get() });
    post(webview, { command: 'unlocks', unlocks: bag.getUnlocks(), activeBag: this.activeBag() });
    this.sendCalendar(webview);
    this.sendRecords(webview);
    post(webview, { command: 'progress-update', ...this.deps.progress.snapshot() });
    post(webview, { command: 'house', layout: this.deps.house.get() });
    this.sendProfiles(webview);
    if (this.deps.progress.firstFinish()) {
      this.sendFinish(webview);
    }
  }

  /** Someone looked in on the pet: the view acts it out, with the stat it raised. */
  visitor(v: Visitor): void {
    if (this.view) {
      post(this.view.webview, { command: 'visitor', ...v });
      post(this.view.webview, { command: 'care-update', stats: this.deps.care.get() });
    }
  }

  /** The profile list changed (renamed, hidden, a friend added). */
  profilesChanged(): void {
    if (this.view) {
      this.sendProfiles(this.view.webview);
    }
  }

  /** The records board; `broken` names categories a turn just took, for a cheer. */
  private sendRecords(webview: vscode.Webview, broken: string[] = []): void {
    const { records, getConfig } = this.deps;
    post(webview, {
      command: 'records-update',
      ...records.snapshot(getConfig().recordsShowPrompts, broken),
    });
  }

  /** Today's holiday events and season; re-sent on every tick so midnight rolls over. */
  private sendCalendar(webview: vscode.Webview): void {
    const { getConfig, now } = this.deps;
    post(webview, { command: 'calendar', ...calendarFor(now(), getConfig().hemisphere) });
  }

  /** The settings panel's "Gather debug logs": both sides' state into the log, then show it. */
  private gatherLogs(webviewView: vscode.WebviewView, snapshot: string | null): void {
    const { claude, log } = this.deps;
    const latest = claude.latest();
    log.info(
      `Debug snapshot (extension): ${JSON.stringify({
        vscode: vscode.version,
        platform: process.platform,
        viewVisible: webviewView.visible,
        mainState: latest?.main?.state ?? null,
        subagents: latest?.subagents.length ?? 0,
        background: latest?.background.length ?? 0,
        sessions: latest?.sessions.length ?? 0,
        lastAutoRefresh: this.lastAutoRefresh ? new Date(this.lastAutoRefresh).toISOString() : null,
      })}`,
    );
    log.info(`Debug snapshot (view): ${snapshot ?? 'none'}`);
    log.show(true);
  }

  private autoRefresh(): void {
    const now = Date.now();
    if (now - this.lastAutoRefresh < AUTO_REFRESH_MS) {
      this.deps.log.warn('Pet view asked for a refresh again within 5 minutes; skipped');
      return;
    }
    this.lastAutoRefresh = now;
    this.deps.log.warn('Pet view kept failing to draw; refreshing it');
    this.refresh();
  }

  /** Rebuilds the pet view from scratch; it keeps its position, bag, purchases and care stats. */
  refresh(): void {
    this.deps.log.info('Refreshing pet view');
    this.shownSlot = '';
    if (this.view) {
      this.view.webview.html = buildHtml(this.view.webview, this.deps.mediaPath, getNonce());
    }
  }

  /** Call when a pet setting changes to redraw with the new look. */
  reinit(): void {
    if (this.view) {
      post(this.view.webview, { command: 'reinit', config: this.deps.getConfig() });
      this.sendCalendar(this.view.webview);
      this.sendRecords(this.view.webview);
    }
  }
}

function post(webview: vscode.Webview, message: ToWebview): void {
  void webview.postMessage(message);
}
