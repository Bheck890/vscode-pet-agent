import * as vscode from 'vscode';
import { PetConfig } from './pet-config';
import { StateWatcher } from './state-watcher';
import { ClaudeWatcher } from './claude-watcher';
import { CareStore, isCareAction } from './pet-care';
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
  public static readonly viewId = 'peonPetView';

  private view?: vscode.WebviewView;
  private watcherDisposable?: vscode.Disposable;
  private savedState?: WebviewState;

  private static isWebviewState(value: unknown): value is WebviewState {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const state = value as Record<string, unknown>;
    return (
      typeof state['petX'] === 'number' &&
      Number.isFinite(state['petX']) &&
      typeof state['petY'] === 'number' &&
      Number.isFinite(state['petY'])
    );
  }

  constructor(
    private readonly mediaPath: string,
    private readonly peon: StateWatcher,
    private readonly claude: ClaudeWatcher,
    private readonly getConfig: () => PetConfig,
    private readonly care: CareStore,
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

    webviewView.webview.onDidReceiveMessage((msg: unknown) => {
      if (!msg || typeof msg !== 'object') {
        return;
      }
      const message = msg as Record<string, unknown>;
      if (message['command'] === 'ready') {
        sendInit(webviewView.webview, this.getConfig(), this.savedState, this.claude.latest());
        this.sendCare();
      } else if (message['command'] === 'care' && isCareAction(message['action'])) {
        // The webview only sends this when the agent is not working.
        const result = this.care.act(message['action']);
        webviewView.webview.postMessage({ command: 'care-update', ...result });
      } else if (
        message['command'] === 'save-state' &&
        PeonViewProvider.isWebviewState(message['state'])
      ) {
        this.savedState = message['state'];
      }
    });

    // Replace any stale watcher binding with a fresh one
    this.watcherDisposable?.dispose();
    this.watcherDisposable = attachWatchers(webviewView.webview, this.peon, this.claude);

    webviewView.onDidDispose(() => {
      this.watcherDisposable?.dispose();
      this.watcherDisposable = undefined;
      this.view = undefined;
    });
  }

  /** Pushes current (decayed) care stats to the view, if it is open. */
  sendCare(): void {
    this.view?.webview.postMessage({ command: 'care-update', stats: this.care.get() });
  }

  /** Call when a pet setting changes to redraw with the new look. */
  reinit(): void {
    if (this.view) {
      sendReinit(this.view.webview, this.getConfig());
    }
  }
}
