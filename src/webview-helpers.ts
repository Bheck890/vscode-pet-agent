import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PetConfig } from './pet-config';
import { StateWatcher, PeonEvent, SessionUpdate } from './state-watcher';
import { ClaudeWatcher, ClaudeUpdate } from './claude-watcher';

/** Persisted across reloads: where the pet was dragged, and its bag of toys (id -> count). */
export interface WebviewState {
  petX?: number;
  petY?: number;
  bag?: Record<string, number>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Generates a cryptographically-random nonce for the Content-Security-Policy. */
export function getNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The webview only needs the extension's own `media/` directory. */
export function getWebviewOptions(mediaPath: string): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.file(mediaPath)],
  };
}

/**
 * Builds the final HTML for a webview by reading `media/webview.html` and
 * injecting the CSP header, stylesheet URI, nonce, and script URIs.
 */
export function buildHtml(webview: vscode.Webview, mediaPath: string, nonce: string): string {
  let template: string;
  try {
    template = fs.readFileSync(path.join(mediaPath, 'webview.html'), 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    void vscode.window.showErrorMessage(`Peon Pet: failed to load webview template (${reason}).`);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource};" />
    <title>Peon Pet</title>
    <style>
      body {
        padding: 12px;
        color: var(--vscode-editor-foreground);
        background: var(--vscode-editor-background);
        font-family: var(--vscode-font-family, sans-serif);
      }
    </style>
  </head>
  <body>
    <p>Peon Pet failed to load its webview template.</p>
    <pre>${escapeHtml(reason)}</pre>
  </body>
</html>`;
  }

  const uri = (file: string) =>
    webview.asWebviewUri(vscode.Uri.file(path.join(mediaPath, file))).toString();
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return template
    .replace(
      '<!--CSP_PLACEHOLDER-->',
      `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    )
    .replace('<!--CSS_URI-->', uri('webview.css'))
    .replace(/<!--NONCE-->/g, nonce)
    .replace('<!--PETS_URI-->', uri('pets.js'))
    .replace('<!--PLAY_URI-->', uri('play.js'))
    .replace('<!--VARIANTS_URI-->', uri('variants.js'))
    .replace('<!--SCENE_URI-->', uri('scene.js'))
    .replace('<!--SCRIPT_URI-->', uri('webview.js'));
}

/**
 * Forwards peon-ping and Claude transcript events into a live webview.
 * Returns a {@link vscode.Disposable} that removes only this webview's
 * listeners, so disposing one view never silences another.
 */
export function attachWatchers(
  webview: vscode.Webview,
  peon: StateWatcher,
  claude: ClaudeWatcher,
): vscode.Disposable {
  // peon-ping reports every agent on the machine; only this workspace's move this pet.
  const onEvent = (e: PeonEvent) => {
    if (claude.ownsDir(e.cwd)) {
      void webview.postMessage({ command: 'peon-event', ...e });
    }
  };
  const onSession = (e: SessionUpdate) => webview.postMessage({ command: 'session-update', ...e });
  const onClaude = (e: ClaudeUpdate) => webview.postMessage({ command: 'claude-update', ...e });

  const disposables = [
    peon.onPeonEvent(onEvent),
    peon.onSessionUpdate(onSession),
    claude.onUpdate(onClaude),
  ];

  return new vscode.Disposable(() => disposables.forEach((d) => d.dispose()));
}

/** Sends the `init` message once the webview signals it is ready. */
export function sendInit(
  webview: vscode.Webview,
  config: PetConfig,
  savedState: WebviewState | undefined,
  claude: ClaudeUpdate | null,
): void {
  webview.postMessage({ command: 'init', config, state: savedState ?? null });
  if (claude) {
    webview.postMessage({ command: 'claude-update', ...claude });
  }
}

/** Sends the `reinit` message when a pet setting changes at runtime. */
export function sendReinit(webview: vscode.Webview, config: PetConfig): void {
  webview.postMessage({ command: 'reinit', config });
}
