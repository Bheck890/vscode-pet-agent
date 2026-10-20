import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MEDIA_PLACEHOLDER } from './media-files';

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
 * injecting the CSP header, the nonce and the URI of every media file it names.
 */
export function buildHtml(webview: vscode.Webview, mediaPath: string, nonce: string): string {
  let template: string;
  try {
    template = fs.readFileSync(path.join(mediaPath, 'webview.html'), 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    void vscode.window.showErrorMessage(`Pet Agents: failed to load webview template (${reason}).`);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource};" />
    <title>Pet Agents</title>
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
    <p>Pet Agents failed to load its webview template.</p>
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
    .replace(/<!--NONCE-->/g, nonce)
    .replace(MEDIA_PLACEHOLDER, (_m, file: string) => uri(file));
}
