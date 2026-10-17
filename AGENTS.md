# Pet Agents -- Agent Context

## What this is

A VS Code extension (`bheck890.pet-agents`, display name **Pet Agents**) that draws a recolourable pixel pet (fox, cat, dog, bird) in the Explorer sidebar and acts out what an AI coding agent is doing. Sub-agents appear as mini pets. It also has idle hobbies, collectable toys, machines for test/build jobs, and hands-on care (feed, treat, fetch, bath).

- Repo: https://github.com/Bheck890/vscode-pet-agent (public). Grew out of smcqueen2/vscode-peon-pet; the Orc Peon sprites and character packs are gone.
- Settings namespace: `pet-agents.*`. Commands: `pet-agents.customize`, `pet-agents.refresh`. View id: `petAgentsView`.
- Activity sources (read-only, no network): Claude Code transcripts in `~/.claude/projects/`, and peon-ping's `~/.claude/hooks/peon-ping/.state.json`.

## Layout

- `src/` extension host (TypeScript, bundled by webpack into `dist/extension.js`)
  - `extension.ts` activation, commands, Customize Pet menu
  - `PeonViewProvider.ts` sidebar webview and its message protocol (`ready`, `care`, `setting`, `save-state` in; `init`, `reinit`, `claude-update`, `peon-event`, `session-update`, `care-update` out)
  - `claude-watcher.ts` + `transcript-parser.ts` Claude Code transcripts -> pet states
  - `state-watcher.ts` + `session-tracker.ts` peon-ping polling
  - `pet-config.ts`, `pet-care.ts`, `bag-store.ts`, `pet-names.ts`, `workspace.ts`
- `media/` webview (plain JS with `// @ts-check`): `pets.js` art, `variants.js` animation variants, `scene.js` toys/machines, `play.js` care, `webview.js` renderer
- `scripts/record-media.js` renders README GIFs/screenshots (`docs/images/`) and `media/assets/icon.png` in headless Chrome with a fake clock
- `src/__tests__/` Jest. Webview scripts are loaded with `vm`; `manifest.test.ts` checks package.json against the code and README.

## Workflow

```bash
npm run compile | watch | lint | format
npm test                # lint + compile + jest
npm run media           # re-record README media after visual changes
npm run package         # pet-agents.vsix
npm run install:vscode  # package and install into local VS Code, then Developer: Reload Window
```

## Rules

- Keep `media/pets.js` ACCESSORIES/PATTERNS, `src/pet-config.ts` and the `package.json` enums in sync (tests enforce it). New settings must be read in `readPetConfig` and documented in the README settings table (tests enforce it).
- ASCII only in code and comments; emoji only inside user-facing strings (`encoding.test.ts`).
- README images must be PNG/GIF under `docs/images/` (the marketplace rejects SVG); `docs/**` is excluded from the VSIX and served from GitHub.
- Before publishing: bump `version`, add the CHANGELOG entry (a test checks it), `npx @vscode/vsce publish`.
