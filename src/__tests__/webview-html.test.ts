const showErrorMessage = jest.fn();
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: jest.fn(),
  };
});

jest.mock(
  'vscode',
  () => ({
    Uri: {
      file: (filePath: string) => ({ fsPath: filePath }),
    },
    window: {
      showErrorMessage,
    },
    workspace: {
      getConfiguration: () => ({
        get: () => 'medium',
      }),
    },
    Disposable: class Disposable {
      private readonly fn: () => void;
      constructor(fn: () => void) {
        this.fn = fn;
      }
      dispose(): void {
        this.fn();
      }
    },
  }),
  { virtual: true },
);

import * as fs from 'fs';
import * as path from 'path';
import { buildHtml, getNonce } from '../webview-html';
import { mediaFiles } from '../media-files';

describe('webview-html', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    (fs.readFileSync as jest.Mock).mockReset();
    showErrorMessage.mockReset();
  });

  it('generates a 32-char hex nonce', () => {
    const nonce = getNonce();
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it('replaces template placeholders in buildHtml', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(
      `<!doctype html>
<head><!--CSP_PLACEHOLDER--></head>
<link rel="stylesheet" href="<!--MEDIA:webview.css-->">
<script nonce="<!--NONCE-->" src="<!--MEDIA:pets.js-->"></script>
<script nonce="<!--NONCE-->" src="<!--MEDIA:play.js-->"></script>
<script nonce="<!--NONCE-->" src="<!--MEDIA:variants.js-->"></script>
<script nonce="<!--NONCE-->" src="<!--MEDIA:scene.js-->"></script>
<script nonce="<!--NONCE-->" src="<!--MEDIA:webview.js-->"></script>` as unknown as ReturnType<
        typeof fs.readFileSync
      >,
    );

    const html = buildHtml(
      {
        cspSource: 'vscode-webview://test',
        asWebviewUri: (uri: { fsPath: string }) => ({ toString: () => `webview:${uri.fsPath}` }),
      } as unknown as import('vscode').Webview,
      '/ext/media',
      'abc123',
    );

    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain(`webview:${path.join('/ext/media', 'webview.css')}`);
    expect(html).toContain(`webview:${path.join('/ext/media', 'pets.js')}`);
    expect(html).toContain(`webview:${path.join('/ext/media', 'webview.js')}`);
    expect(html).toContain(`webview:${path.join('/ext/media', 'play.js')}`);
    expect(html).toContain(`webview:${path.join('/ext/media', 'variants.js')}`);
    expect(html).toContain(`webview:${path.join('/ext/media', 'scene.js')}`);
    expect(html.match(/nonce="abc123"/g)).toHaveLength(5);
    expect(html).not.toContain('<!--');
  });

  it('returns fallback html and surfaces a readable error if template read fails', () => {
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('missing template');
    });

    const html = buildHtml(
      {
        cspSource: 'vscode-webview://test',
        asWebviewUri: () => ({ toString: () => 'unused' }),
      } as unknown as import('vscode').Webview,
      '/bad/media',
      'abc123',
    );

    expect(showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('failed to load webview template'),
    );
    expect(html).toContain('Pet Agents failed to load its webview template');
    expect(html).toContain('missing template');
  });

  it('lists the media files a template loads, in order', () => {
    expect(
      mediaFiles('<link href="<!--MEDIA:a.css-->"><script src="<!--MEDIA:b-c.js-->"></script>'),
    ).toEqual(['a.css', 'b-c.js']);
  });

  it('loads every script the real template names, each with the nonce', () => {
    const actual = jest.requireActual<typeof fs>('fs');
    const template = actual.readFileSync(path.join(process.cwd(), 'media', 'webview.html'), 'utf8');
    const scripts = mediaFiles(template).filter((f) => f.endsWith('.js'));
    expect(scripts[0]).toBe('pets.js');
    expect(scripts[scripts.length - 1]).toBe('webview.js');
    for (const file of scripts) {
      expect(template).toContain(
        `<script nonce="<!--NONCE-->" src="<!--MEDIA:${file}-->"></script>`,
      );
    }
  });
});
