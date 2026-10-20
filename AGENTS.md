# Pet Agents -- Agent Context

## What this is

A VS Code extension (`bheck890.pet-agents`, display name **Pet Agents**) that draws a recolourable pixel pet (fox, cat, dog, bird) in the Explorer sidebar and acts out what an AI coding agent is doing. Sub-agents appear as mini pets. It also has idle hobbies, collectable toys, machines for test/build jobs, and hands-on care (feed, treat, fetch, bath).

- Repo: https://github.com/Bheck890/vscode-pet-agent (public). Grew out of smcqueen2/vscode-peon-pet; the Orc Peon sprites and character packs are gone.
- Settings namespace: `pet-agents.*`. Commands: `pet-agents.customize`, `pet-agents.refresh`. View id: `petAgentsView`.
- Activity sources (read-only, no network): Claude Code transcripts in `~/.claude/projects/`, and peon-ping's `~/.claude/hooks/peon-ping/.state.json`.

## Layout

- `src/` extension host (TypeScript, bundled by webpack into `dist/extension.js`)
  - `extension.ts` activation only: builds the watchers and stores, registers commands and the view
  - `settings.ts` reads/saves `pet-agents.*`; `customize-menu.ts` the Customize Pet quick picks
  - `PeonViewProvider.ts` the sidebar view: routes webview messages to stores, forwards watcher events
  - `protocol.ts` every message both ways (`FromWebview` / `ToWebview`) and their validation
  - `webview-html.ts` page HTML + CSP; `media-files.ts` reads the script list from `media/webview.html`
  - `transcript-tail.ts` reads appended JSONL lines; `transcript-parser.ts` lines -> pet state (`PET_STATES`); `claude-watcher.ts` picks which sessions and sub-agents to show
  - `state-watcher.ts` + `session-tracker.ts` peon-ping polling
  - `storage.ts` the globalState interface; stores: `pet-care.ts`, `bag-store.ts`, `records-store.ts`, `progress-store.ts`, `house-store.ts` (all merge across windows)
  - Games (`docs/Plans/Roadmap.md`): `calendar.ts` holidays/weeks; `turn-tracker.ts` + `records*.ts` weekly prompt records and backfill; `progress*.ts` XP facts, levels, challenges; `games.ts` wires watcher events into them
  - `pet-config.ts`, `pet-names.ts`, `workspace.ts`
- `media/` webview (plain JS with `// @ts-check`), loaded in the order `webview.html` lists them (`<!--MEDIA:file-->`):
  `pets.js` art (+ holiday COSTUMES), `states.js` state looks, `play.js` care, `variants.js` animation variants, `scene.js` toys/machines, `events.js` holidays, `enemies.js` bugs to squash, `house.js` the house, `panels.js` corner panels (care, bag/shop, settings, trophy, house), `webview.js` renderer + input. Each helper is `Pet*.create(api)` or pure data on `window.Pet*`.
- `scripts/record-media.js` renders README GIFs/screenshots (`docs/images/`) and `media/assets/icon.png` in headless Chrome with a fake clock
- `src/__tests__/` Jest. Webview scripts are loaded with `vm` in template order; `manifest.test.ts` checks package.json against the code and README.
- `docs/Plans/Roadmap.md` the plan for holidays, records, levels, enemies and the house.

## Workflow

```bash
npm run compile | watch | lint | format
npm test                # lint + compile + jest (CI runs this on Windows/macOS/Linux for every push)
npm run media           # re-record README media after visual changes
npm run package         # pet-agents.vsix
npm run install:vscode  # package and install into local VS Code, then Developer: Reload Window
```

## Rules

- Keep `media/pets.js` ACCESSORIES/PATTERNS, `src/pet-config.ts` and the `package.json` enums in sync (tests enforce it). New settings must be read in `readPetConfig` and documented in the README settings table (tests enforce it).
- ASCII only in code and comments; emoji only inside user-facing strings (`encoding.test.ts`).
- New webview message: add it to `protocol.ts` (and its test) first. New webview script: one `<!--MEDIA:x.js-->` line in `webview.html`, nothing else.
- Every commit is tested in full by `.github/workflows/ci.yml`; keep it green and add tests with each feature.
- README images must be PNG/GIF under `docs/images/` (the marketplace rejects SVG); `docs/**` is excluded from the VSIX and served from GitHub.
- Before publishing: bump `version`, add the CHANGELOG entry (a test checks it), `npx @vscode/vsce publish`.
