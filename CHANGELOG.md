# Changelog

All notable changes to Peon Pet will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.2.0] — 2026-03-11 · [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=smcqueen.vscode-peon-pet)

### Added

- Screen shake effect now triggers on `alarmed` events (was declared but never activated).
- Unit tests for `session-tracker`, `characters`, `StateWatcher`, `webview-helpers`, and webview tooltip behaviour (38 tests via Jest).
- ESLint coverage extended to `media/*.js` with browser globals config and `eqeqeq` / `no-undef` rules.
- `buildHtml()` now returns a user-visible error page if the webview template file cannot be read, instead of throwing an unhandled exception.
- Test step added to CI pipeline (`npm test -- --runInBand`).

### Changed

- `StateWatcher.poll()` decomposed into `readStateFile()`, `handleSessionEvent()`, and `fireListeners()` for clarity and testability.
- Incoming `save-state` webview messages validated with a `private static isWebviewState()` type guard instead of a direct cast.
- `onDidReceiveMessage` callback now types its argument as `unknown` and validates before use.
- `getNonce()` now uses `crypto.getRandomValues()` instead of `Math.random()`.
- `sendInit()` / `sendReinit()` share a single `getSizePx()` helper (previously duplicated the config read).
- Webpack `devtool` is now `false` in production builds and `'source-map'` in development only (reduces VSIX bundle size).
- Tooltip labels and session names are now HTML-escaped before being set as `innerHTML`.
- Asset loading in `init`/`reinit` is now race-condition-safe via a version counter — a superseded load can no longer overwrite the result of a more recent one.

### Fixed

- Character changes via the `changeCharacter` command were calling `viewProvider.reinit()` twice (once directly, once via `onDidChangeConfiguration`). The direct call has been removed.
- `activeCharId` shadow variable in `extension.ts` was tracked but never read; removed.
- `isVisible()` method on `PeonViewProvider` was defined but had no callers; removed.
- `_context` parameter in `resolveWebviewView` was named as unused but `context.state` was actively accessed; renamed to `context`.
- `sessionCwds` cleanup loop was calling `tracker.entries()` on every iteration (O(n²)); now snapshots the tracked ID set once before the loop.

### Removed

- `peon-pet.position` setting and editor-tab panel placement (`WebviewPanel` / `PeonPanelSerializer`) — sidebar-only for now.

---

## [0.1.0] — 2025-03-02

### Added

- Initial release of the VS Code extension, ported from the [peon-pet](https://github.com/PeonPing/peon-pet) Electron app.
- Canvas 2D sprite renderer with a 6×6 animation atlas (sleeping, waking, typing, alarmed, celebrate, annoyed).
- Live reaction to [peon-ping](https://github.com/PeonPing/peon-ping) events via `~/.claude/hooks/peon-ping/.state.json` polling.
- Session dots: coloured indicators showing active AI sessions with hover tooltips.
- Visual effects: flash overlay, screen shake, and gold particle burst on celebrate.
- Sidebar placement via `WebviewViewProvider` in the Explorer panel.
- Editor-tab placement via `WebviewPanel` with state persistence across restarts (`WebviewPanelSerializer`).
- Drag-to-reposition — pet position saved automatically via `vscodeApi.setState()`.
- Built-in **Orc Peon** character pack.
- Custom character pack support via `~/.openpeon/characters/<name>/`.
- `Peon Pet: Change Character` command with re-scan QuickPick.
- `peon-pet.position`, `peon-pet.character`, and `peon-pet.size` settings.
