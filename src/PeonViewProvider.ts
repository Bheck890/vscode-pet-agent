import * as vscode from 'vscode';

/** The slice of vscode.LogOutputChannel the view writes to. */
export type PetLog = Pick<vscode.LogOutputChannel, 'debug' | 'info' | 'warn' | 'error'>;

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
/** The view can ask for a refresh when its frames keep failing; at most this often. */
const AUTO_REFRESH_MS = 5 * 60 * 1000;
import { PetConfig, panelSetting } from './pet-config';
import { StateWatcher } from './state-watcher';
import { ClaudeWatcher } from './claude-watcher';
import { CareStore, isCareAction } from './pet-care';
import { BagStore } from './bag-store';
import {
  WebviewState,
  getNonce,
  getWebviewOptions,
  buildHtml,
  attachWatchers,
  sendInit,
  sendReinit,
} from './webview-helpers';

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

  private static isWebviewState(value: unknown): value is WebviewState {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const state = value as Record<string, unknown>;
    const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    const counts = (v: unknown) =>
      v === undefined || (typeof v === 'object' && v !== null && Object.values(v).every(num));
    const unlocks = state['unlocks'];
    return (
      (state['petX'] === undefined || num(state['petX'])) &&
      (state['petY'] === undefined || num(state['petY'])) &&
      counts(state['bag']) &&
      counts(state['spent']) &&
      (unlocks === undefined ||
        (Array.isArray(unlocks) && unlocks.every((id) => typeof id === 'string'))) &&
      (state['food'] === undefined || typeof state['food'] === 'string')
    );
  }

  constructor(
    private readonly mediaPath: string,
    private readonly peon: StateWatcher,
    private readonly claude: ClaudeWatcher,
    private readonly getConfig: () => PetConfig,
    private readonly care: CareStore,
    private readonly bag: BagStore,
    private readonly saveSetting: (key: string, value: unknown) => Thenable<void>,
    private readonly log: PetLog,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext<WebviewState>,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = getWebviewOptions(this.mediaPath);
    webviewView.webview.html = buildHtml(webviewView.webview, this.mediaPath, getNonce());

    if (context.state) {
      this.savedState = context.state;
    }
    this.log.info(`Pet view opened${context.state ? ' (restored)' : ''}`);
    webviewView.onDidChangeVisibility(() =>
      this.log.debug(`Pet view ${webviewView.visible ? 'shown' : 'hidden'}`),
    );

    webviewView.webview.onDidReceiveMessage((msg: unknown) => {
      if (!msg || typeof msg !== 'object') {
        return;
      }
      const message = msg as Record<string, unknown>;
      if (message['command'] === 'ready') {
        const state = {
          ...this.savedState,
          bag: this.bag.get(),
          spent: this.bag.getSpent(),
          unlocks: this.bag.getUnlocks(),
        };
        sendInit(webviewView.webview, this.getConfig(), state, this.claude.latest());
        this.sendCare();
      } else if (message['command'] === 'care' && isCareAction(message['action'])) {
        // The webview only sends this when the agent is not working.
        const result = this.care.act(message['action']);
        webviewView.webview.postMessage({ command: 'care-update', ...result });
      } else if (
        message['command'] === 'log' &&
        LOG_LEVELS.includes(message['level'] as (typeof LOG_LEVELS)[number]) &&
        typeof message['message'] === 'string'
      ) {
        this.log[message['level'] as (typeof LOG_LEVELS)[number]](
          `view: ${message['message'].slice(0, 2000)}`,
        );
      } else if (message['command'] === 'refresh') {
        this.autoRefresh();
      } else if (message['command'] === 'setting') {
        const change = panelSetting(message['key'], message['value']);
        if (change) {
          void this.saveSetting(...change);
        }
      } else if (
        message['command'] === 'save-state' &&
        PeonViewProvider.isWebviewState(message['state'])
      ) {
        // Position and food stay with this view; the bag and shop go to extension storage.
        const { bag, spent, unlocks, ...view } = message['state'];
        this.savedState = view;
        if (bag) {
          this.bag.save(bag);
        }
        if (spent) {
          this.bag.saveSpent(spent);
        }
        if (unlocks) {
          this.bag.saveUnlocks(unlocks);
        }
      }
    });

    // Replace any stale watcher binding with a fresh one
    this.watcherDisposable?.dispose();
    this.watcherDisposable = attachWatchers(webviewView.webview, this.peon, this.claude);

    webviewView.onDidDispose(() => {
      this.log.info('Pet view closed');
      this.watcherDisposable?.dispose();
      this.watcherDisposable = undefined;
      this.view = undefined;
    });
  }

  /**
   * Pushes current (decayed) care stats to the view, if it is open, and shop
   * purchases, which another window may have made.
   */
  sendCare(): void {
    this.view?.webview.postMessage({ command: 'care-update', stats: this.care.get() });
    this.view?.webview.postMessage({ command: 'unlocks', unlocks: this.bag.getUnlocks() });
  }

  private autoRefresh(): void {
    const now = Date.now();
    if (now - this.lastAutoRefresh < AUTO_REFRESH_MS) {
      this.log.warn('Pet view asked for a refresh again within 5 minutes; skipped');
      return;
    }
    this.lastAutoRefresh = now;
    this.log.warn('Pet view kept failing to draw; refreshing it');
    this.refresh();
  }

  /** Rebuilds the pet view from scratch; it keeps its position, bag, purchases and care stats. */
  refresh(): void {
    this.log.info('Refreshing pet view');
    if (this.view) {
      this.view.webview.html = buildHtml(this.view.webview, this.mediaPath, getNonce());
    }
  }

  /** Call when a pet setting changes to redraw with the new look. */
  reinit(): void {
    if (this.view) {
      sendReinit(this.view.webview, this.getConfig());
    }
  }
}
