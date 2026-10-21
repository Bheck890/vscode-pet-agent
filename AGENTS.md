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
  - `storage.ts` the globalState interface and `scoped()`, which keys each store's data by save slot; `slot.ts` the current save (`petSlot`); stores: `pet-care.ts`, `bag-store.ts` (+ active bag), `records-store.ts` (not slot-scoped), `progress-store.ts`, `house-store.ts` (many houses, room by room; all merge across windows)
  - Bags and saves (`docs/Plans/Bags.md`, `docs/Plans/Profiles.md`, both built): `bags.ts` the bag ladder (`BAG_LEVELS`, house room ids, `FINISH_LEVEL`); `profiles.ts` profile files, the index, new saves, friends; `move-file.ts` the `.petsave` format and its crypto; `save-flows.ts` the user journeys behind a `PetUi` (VS Code's is `ui.ts`)
  - Games (`docs/Plans/Roadmap.md`): `calendar.ts` holidays/weeks; `turn-tracker.ts` + `records*.ts` weekly prompt records and backfill; `progress*.ts` XP facts, levels, challenges; `games.ts` wires watcher events into them
  - `pet-config.ts`, `pet-names.ts`, `workspace.ts`
- `media/` webview (plain JS with `// @ts-check`), loaded in the order `webview.html` lists them (`<!--MEDIA:file-->`):
  `pets.js` art (+ holiday COSTUMES and bag STYLES), `states.js` state looks, `play.js` care (+ FOODS), `variants.js` animation variants (bag-gated ones carry `bag`), `scene.js` BAGS of toys/machines, `events.js` holidays, `enemies.js` bugs to squash, `house.js` HOUSES, rooms, furniture and themes, `panels.js` corner panels (care, bag picker/shop, settings, trophy, house strip with profiles), `finish.js` the finish screen and share card, `webview.js` renderer + input (+ visiting old saves and invited guests). Each helper is `Pet*.create(api)` or pure data on `window.Pet*`.
- `scripts/record-media.js` renders README GIFs/screenshots (`docs/images/`) and `media/assets/icon.png` in headless Chrome with a fake clock
- `src/__tests__/` Jest. Webview scripts are loaded with `vm` in template order; `manifest.test.ts` checks package.json against the code and README.
- `docs/Plans/Roadmap.md` holidays, records, levels, enemies and the house; `docs/Plans/Bags.md` 20 level-unlocked themed packs (bags, animations, houses with rooms, room themes, pet styles); `docs/Plans/Profiles.md` finishing, sharing, save slots and profiles, friends, moving a pet. All built.

## Workflow

```bash
npm run compile | watch | lint | format
npm test                # lint + compile + jest (CI runs this on Windows/macOS/Linux for every push)
npm run media           # re-record README media after visual changes
npm run package         # pet-agents.vsix
npm run install:vscode  # package and install into local VS Code, then Developer: Reload Window
```

## Rules

- Keep `media/pets.js` ACCESSORIES/PATTERNS/STYLES, `src/pet-config.ts` and the `package.json` enums in sync (tests enforce it). Likewise `src/bags.ts` with `scene.js` BAGS and `house.js` HOUSES (bag ids, room ids, holiday toys).
- Toy, furniture and theme ids are global (`/^[a-z]+$/`). Shop unlock ids are `kind.id` for the starter bag and `bag.kind.id` for the others (`PetVariants.unlockId`).
- Save messages from the view (`save-state`, `house-save`, `bag-switch`) carry the slot; anything else that writes per-save data must go through the slot-scoped stores. New settings must be read in `readPetConfig` and documented in the README settings table (tests enforce it).
- ASCII only in code and comments; emoji only inside user-facing strings (`encoding.test.ts`).
- New webview message: add it to `protocol.ts` (and its test) first. New webview script: one `<!--MEDIA:x.js-->` line in `webview.html`, nothing else.
- Every commit is tested in full by `.github/workflows/ci.yml`; keep it green and add tests with each feature.
- README images must be PNG/GIF under `docs/images/` (the marketplace rejects SVG); `docs/**` is excluded from the VSIX and served from GitHub.
- Before publishing: bump `version`, add the CHANGELOG entry (a test checks it), `npx @vscode/vsce publish`.
