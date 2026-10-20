import * as vscode from 'vscode';
import { PetConfig } from './pet-config';
import { StateWatcher } from './state-watcher';
import { ClaudeWatcher } from './claude-watcher';
import { CareStore } from './pet-care';
import { BagStore } from './bag-store';
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
  care: CareStore;
  bag: BagStore;
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

  private handle(webviewView: vscode.WebviewView, message: FromWebview): void {
    const { bag, care, claude, getConfig, log, saveSetting } = this.deps;
    switch (message.command) {
      case 'ready': {
        const state = {
          ...this.savedState,
          bag: bag.get(),
          spent: bag.getSpent(),
          unlocks: bag.getUnlocks(),
        };
        post(webviewView.webview, { command: 'init', config: getConfig(), state });
        const latest = claude.latest();
        if (latest) {
          post(webviewView.webview, { command: 'claude-update', ...latest });
        }
        this.syncShared();
        break;
      }
      case 'care':
        // The webview only sends this when the agent is not working.
        post(webviewView.webview, { command: 'care-update', ...care.act(message.action) });
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
    }
  }

  /**
   * Forwards peon-ping and Claude transcript events into the webview. The
   * returned Disposable removes only this webview's listeners.
   */
  private attachWatchers(webview: vscode.Webview): vscode.Disposable {
    const { peon, claude } = this.deps;
    const disposables = [
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

  /**
   * Pushes state every window shares, if the view is open: current (decayed)
   * care stats, and shop purchases, which another window may have made.
   */
  syncShared(): void {
    if (!this.view) {
      return;
    }
    const { care, bag } = this.deps;
    post(this.view.webview, { command: 'care-update', stats: care.get() });
    post(this.view.webview, { command: 'unlocks', unlocks: bag.getUnlocks() });
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
    if (this.view) {
      this.view.webview.html = buildHtml(this.view.webview, this.deps.mediaPath, getNonce());
    }
  }

  /** Call when a pet setting changes to redraw with the new look. */
  reinit(): void {
    if (this.view) {
      post(this.view.webview, { command: 'reinit', config: this.deps.getConfig() });
    }
  }
}

function post(webview: vscode.Webview, message: ToWebview): void {
  void webview.postMessage(message);
}
