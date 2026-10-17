# Contributing to Pet Agents

Thanks for your interest! Bug reports, new animations, accessories, toys and fixes are all welcome.

## Setup

You need Node.js 18+ and VS Code.

```bash
git clone https://github.com/Bheck890/vscode-pet-agent.git
cd vscode-pet-agent
npm ci
npm run compile
```

Press **F5** to launch an Extension Development Host with the extension loaded from your checkout, or run `npm run install:vscode` to package it and install it into your own VS Code (then **Developer: Reload Window**).

To see the pet react you need an agent producing activity: Claude Code works with nothing else installed, other agents need [peon-ping](https://github.com/PeonPing/peon-ping).

## Scripts

| Command                | Description                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run compile`      | Development build with source maps                                  |
| `npm run watch`        | Rebuild on change                                                   |
| `npm run lint`         | ESLint over `src` and `media`                                       |
| `npm run format`       | Prettier                                                            |
| `npm test`             | Lint, compile, then the Jest suite                                  |
| `npm run media`        | Re-record the README GIFs, screenshots and icon (needs Chrome/Edge) |
| `npm run package`      | Production build and `pet-agents.vsix`                              |

## Code style

- TypeScript for the extension host (`src/`), plain JavaScript with `// @ts-check` for the webview (`media/`).
- ESLint + Prettier; a Husky pre-commit hook runs them on staged files.
- Source files are UTF-8 without a BOM. Use ASCII in code and comments (`--`, `->`, `...`); emoji and other characters are fine inside strings the user sees. `src/__tests__/encoding.test.ts` checks this.
- The webview scripts in `media/` are loaded into the tests with `vm`, so keep pure logic (variants, scene, art) free of DOM access where you can.

## Where to start

- **A new animation variant or idle hobby:** add it to `media/variants.js`. Props come from `media/pets.js`, scenery from `media/scene.js`.
- **A new accessory:** see "Editing the art" in the README. Tests check that `media/pets.js`, `src/pet-config.ts` and `package.json` agree.
- **A new toy:** add it to `TOYS` in `media/scene.js` with a rarity and a `use`.
- **Agent states:** `src/transcript-parser.ts` turns Claude Code transcript lines into pet states and is fully unit-tested.

If your change is visible, run `npm run media` and include the updated pictures in your PR.

## Pull requests

1. Fork the repo and create a branch: `git checkout -b feature/your-feature`.
2. Make sure `npm test` passes.
3. Add a line to the `[Unreleased]` section of `CHANGELOG.md`.
4. Open a PR against `main` describing what changed and why.

## Reporting issues

Use the [issue tracker](https://github.com/Bheck890/vscode-pet-agent/issues) and include your VS Code version, the extension version, which agent you use, steps to reproduce, and anything relevant from **Help -> Toggle Developer Tools**.
