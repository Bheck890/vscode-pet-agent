# Changelog

All notable changes to Pet Agents will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- 🛒 Shop in the bag panel: trade spare toys (never your last of a kind) for 8 unlockable animations at 20 common or 5 rare toys each, and 4 new foods (fish, steak, strawberries, cake) at 100 common toys each. Bought foods are picked under the care buttons. Trades and purchases are kept in extension storage and merged across windows like the bag.
- `Pet Agents: Show Log` and a Pet Agents output channel. The view logs frames that fail to draw, a lost canvas, a lost pet position and missing helper scripts; the extension logs the view opening, closing, refreshing and (at Debug level) being shown or hidden. **🪵 Gather debug logs** in the ⚙️ panel adds a snapshot of the view (size, pet position and state, frame errors, sprites) and the extension (VS Code version, sessions) and opens the log.
- Self-healing pet view: a frame that throws no longer leaves the panel blank for good. The view rebuilds its sprites and canvas and moves a lost pet home straight away and every 5 minutes, and refreshes itself (at most once every 5 minutes) if frames keep failing.
- Bag tabs: 🧸 Toys, ✨ Collection and 🛒 Shop. The collection lists what you've bought; pick the food to feed and switch each bought animation on or off.
- Click toys and objects on the floor to interact. Real toys (yarn, ball, frisbee...) get flicked across the panel and the pet chases and plays with them; objects (couch, bed, guitar, box...) stay put and the pet comes over to use them. A napping pet wakes up to play.
- Care tools stay in hand after closing the care panel, so it no longer covers the pet. The 🐾 button shows the tool; Esc puts it away.

### Changed

- Clicking a toy on the floor now plays with it; right-click puts it back in the bag.
- Animation variants for an agent are picked from its transcript, so the same agent shows the same animation in every VS Code window (main pet in one, mini pet in another). Shop purchases made in one window reach the others within a minute.

## [0.3.0] - 2026-10-16

### Added

- First release as **Pet Agents** on the VS Code Marketplace (`bheck890.pet-agents`). The panel is now called Pet Agents, commands are `Pet Agents: ...` and settings moved from `peon-pet.*` to `pet-agents.*`; set your look again after upgrading from a source build.
- New marketplace icon and README GIFs and screenshots, all rendered from the pet art by `npm run media` (`scripts/record-media.js`). The Orc Peon icon and demo GIF are gone.
- Tests for the marketplace manifest, the sidebar view's message handling, every agent state, dragging, peon-ping events, source encoding and more.
- Animation variants for every state, picked at random each time (`pet-agents.variety`, default `random`; `classic` keeps one look per state). Includes napping sideways, rolling over, belly-up and in a box, a hamster wheel, surfing the web, a chalkboard, a trophy, backflips and more.
- Idle hobbies: chasing butterflies, bird watching, digging, dancing, yoga, reading, coffee and toy play. Birds fly around the panel. A napping pet sometimes gets up by itself.
- Toys and furniture with common, uncommon, rare and legendary rarities (`pet-agents.toys`). Finds go into a saved 🎒 bag; the pet pulls toys out to play with and puts them back. A bag panel shows the collection and lets you take toys out or put them away.
- The bag is stored in VS Code extension storage (globalState), shared by all windows and kept across reinstalls.
- `Pet Agents: Refresh Pet` command and ⟳ button in the panel header. After an update the panel now says to reload the window instead of going blank.
- ⚙️ quick settings panel for the main switches, plus a per-action list to turn off any animation or hobby (`pet-agents.disabledActions`).
- Depth: the pet can move towards the back of the panel and forward again. New "running in circles" variant and hobby.
- A `testing` state, and a machine (washing machine, oven, microwave, computer, engine, server rack) for each running test, build or background shell job (`pet-agents.machines`). Background jobs end on Claude Code's task notification.
- Other recently busy Claude sessions appear as mini pets (`pet-agents.backgroundPets`).

### Changed

- Once the same kind of tool call happens twice in a row (e.g. two web searches or two writes), the pet keeps doing it through any thinking until a different action, an error, a question or the end of the turn. A single action is held for 8 seconds of thinking instead of flicking straight to "thinking".
- Toys are drawn in front of the pet and get clicks first; clicking a toy on the floor puts it in the bag.
- Mini pets line up along the bottom of the panel, beside the main pet when there's no room above or below it, and in front of it when there's no room at all.
- Zoomies are shorter and slower, staying near the pet's spot.
- Other sessions are named after the folder they were started in, not wherever their shell has moved to.

### Fixed

- The pet could stop being drawn after pulling a toy out of a bag holding several kinds of toy: the toy was picked with a fresh random number for each catalogue entry, so often nothing matched.
- One VS Code window's agent could take over the pet in another window. Each pet now only follows sessions started in its own window's workspace and no longer falls back to the most recent session anywhere. Mini pets for other sessions show this repo's sessions; agents from other repos fill the row only while none are running here (`pet-agents.otherRepoPets`) and never drive the main pet. Git Bash style paths (`/d/...`) now match Windows workspace folders, and peon-ping events are filtered by workspace too.
- Time-based states (permission prompt guess, abandoned turn) now reach the pet even when no new transcript line arrived.

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
