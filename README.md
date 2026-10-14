# Peon Pet

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A pixel-art pet (fox, cat, dog or bird) that lives in your VS Code sidebar and acts out what your AI coding agent is doing, live. When the agent starts sub-agents, mini pets pop out with funny names and their task written underneath.

> This is a fork of [vscode-peon-pet](https://github.com/smcqueen2/vscode-peon-pet). The original Orc Peon sprite and custom sprite packs have been replaced by recolourable pets drawn in code.

---

## Features

### Your pet acts out the agent

Each state has its own pose, expression, prop and a ring of emojis orbiting the pet.

| Agent is...                  | Pet does                                              | Orbiting emojis |
| ---------------------------- | ----------------------------------------------------- | --------------- |
| Thinking                     | Tilts its head, thought bubble with animated dots     | 💭 🤔 💡 ✨     |
| Reading / searching files    | Holds a magnifying glass, eyes look down              | 🔍 📖 📄 👀     |
| Editing files                | Types on a laptop, tongue out in concentration        | ✏️ 📝 ⌨️ 💾     |
| Running commands             | Runs in place, sweat drops and dust puffs             | ⚙️ 🔧 ⚡ 💻     |
| Browsing the web / MCP tools | Looks through binoculars                              | 🌐 🔗 📡 🛰️     |
| Starting sub-agents          | Holds a clipboard while mini pets spawn               | 📋 📣 👥 🧩     |
| Waiting for you              | Hops, with a flashing `!` / `?` speech bubble         | ❓ ❗ 🙋 ⏳     |
| A tool call failed           | Storm cloud overhead, shakes, angry eyes              | 💢 💥 ⚠️ 🐛     |
| Finished the task            | Party hat, jumps, confetti                            | 🎉 ⭐ 🏆 ✅     |
| Idle for 30 seconds          | Nightcap, snot bubble, floating Zzz                   |                 |

The pet also blinks, wags its tail (or flaps its wings), twitches its ears, and wakes up with a stretch and a yawn when work starts.

### It has a life of its own

- **Idle fidgets.** When nothing is happening it looks around, twitches its ears, yawns, hops, grooms, wags, or chases its tail.
- **Wandering.** It strolls around the panel when idle, and runs back to its spot the moment the agent starts working. Turn this off with `peon-pet.wander`.
- **Follows your mouse.** Its pupils track your cursor across the panel.
- **Pet it.** Click for hearts 💖, double-click for a spin-jump trick ⭐. Clicking a napping pet wakes it up. Mini pets like attention too.

### Sub-agents become mini pets

Every sub-agent the agent starts appears as a mini version of your pet in its own colour. Each one gets a name that fits its job (explorers become "Detective Noodle" or "Scout Waffles", planners become "Professor Pickles"), with its task shown underneath. Minis act out their own state, celebrate when they finish, then vanish in a puff.

### Take care of it

Click the 🐾 button in the corner of the panel to open care mode. Three stats wear down slowly in real time, even while VS Code is closed: 🍖 fullness, 💖 happiness and 🫧 cleanliness. Care is hands-on: pick a tool and actually do it.

| Tool       | What you do                                                                 | What your pet does                                              |
| ---------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 🍖 Feed    | Your cursor becomes a bowl. Click anywhere to drop kibble (up to 6 pieces).  | Trots over to each piece and eats it, crumbs flying. +10 fullness each |
| 🍪 Treat   | Hold the cookie on your cursor, then click to drop it.                      | Follows the treat, begs and hops when it's held above its head. Catches it mid-air ("Nice catch!") or eats it off the floor. |
| 🎾 Play    | Grab the ball and fling it. It bounces off the floor and walls.             | Chases it, picks it up, and brings it back to where you threw from. +12 happiness per fetch |
| 🛁 Bath    | Your cursor becomes a sponge. Hold the button and scrub your pet.           | Foam builds up and dirt fades as you scrub. At 100% it does a big wet shake. |
| 💖 Stroke  | No tool needed: hold the button and rub your pet back and forth.            | Wiggles happily with hearts. Small happiness boost              |

Click a tool again to put it away. While care mode is open you can't drag your pet; close the panel to move it again.

Your pet has opinions: it won't eat when it's full, won't take treats when stuffed, and is too hungry to play when starving. Playing makes it a little hungry and messy. When a stat is low you'll see it: dirt smudges on its fur, and "hungry", "bored" or "needs a bath" under its name with little 🍖 / 🥺 / 🪰 hints.

**No treats on the clock.** While the agent is working, or any helper pets are out, care is locked: the buttons grey out, any tool in hand is put away, and clicking the pet just gets a 🛠️ "busy working" bubble. Care unlocks as soon as the task is done.

### Make it yours

Run **Peon Pet: Customize Pet** for a menu of everything below. Every change shows up live, and the menu stays open so you can keep tweaking. There is also **Randomize look** and **Reset look to defaults**.

- **Species:** fox, cat, dog or bird
- **Art style:** `smooth` (rounded, soft edges) or `pixel` (crisp retro blocks)
- **Colours:** fur, belly/muzzle, eyes and accessory
- **Patterns:** spots, stripes, white socks, bandit mask, eye patch
- **Accessories:** bow, flower, crown, beanie, headphones, glasses, sunglasses, bandana, scarf, collar with a bell tag. Hats step aside when a state needs the party hat or nightcap.

### Colours

- **Pick your own.** Choose a preset or any CSS colour (`#ff8800`, `hotpink`, `rebeccapurple`...).
- **Shift with state.** By default the pet is tinted and glows with a colour for what the agent is doing: purple for thinking, blue for writing, red for errors, gold when done. Turn this off with `peon-pet.stateColors`.
- **Ask your AI.** Tell your agent something like *"set my VS Code pet colour to lavender"*. It edits the `peon-pet.color` setting and the pet recolours immediately.

### Also

- **Hover** any pet for details: what it is doing, which file, which project, and how many helpers are working.
- **Session dots** in the top-left corner show your other active agent sessions (bright green = active, dark green = idle, grey = cold). Hover a dot for its folder.
- **Drag** your pet anywhere in the panel. The position is remembered.

---

## Where the activity comes from

The pet reads two sources. Both are **read-only**: the extension never writes to them and makes no network requests.

1. **Claude Code session logs** (`~/.claude/projects/`). These give the detailed states above plus sub-agent names and tasks. Nothing to install. If you have several sessions running, the pet follows the most recent one inside the folder you have open in VS Code.
2. **[peon-ping](https://github.com/PeonPing/peon-ping)** (`~/.claude/hooks/peon-ping/.state.json`), if you have it installed. This covers other agents (Cursor, Codex, OpenCode, Kiro) with coarser states: waking, thinking, waiting, error and done.

**Limitation:** Claude Code doesn't log when it is showing you a permission prompt. If a file edit (or another non-shell tool call) has no result after 5 seconds, the pet assumes it is waiting for your OK. Long-running shell commands, web fetches and sub-agents are excluded from that guess.

---

## Installation

This fork is not on the Marketplace. Install it from source:

```bash
git clone <this repo>
cd vscode-pet-agent
npm ci
npm run install:vscode
```

Or open the folder in VS Code and run **Terminal -> Run Task -> Install Pet into VS Code**. Both build the extension, package `vscode-peon-pet.vsix` and install it with `code --install-extension`.

Then run **Developer: Reload Window** (`Ctrl+Shift+P`) and open the **Agent Pet** panel in the Explorer sidebar. Drag the panel taller if the pet feels cramped, especially when sub-agents are running.

To update after pulling changes, run the task again and reload the window.

---

## Usage

### Commands

| Command                   | Description                                                  |
| ------------------------- | ------------------------------------------------------------ |
| `Peon Pet: Customize Pet` | Menu for species, colours, pattern, accessory, name and more |

### Settings

| Setting                | Default  | Description                                                                 |
| ---------------------- | -------- | --------------------------------------------------------------------------- |
| `peon-pet.species`     | `fox`    | `fox`, `cat`, `dog` or `bird`                                               |
| `peon-pet.color`       | *(empty)*| Any CSS colour. Empty uses the species default (an orange fox, slate cat, brown dog, blue bird) |
| `peon-pet.accentColor` | *(empty)*| Belly, muzzle and chest colour                                              |
| `peon-pet.eyeColor`    | *(empty)*| Eye colour. Empty is dark slate with black pupils                           |
| `peon-pet.pattern`     | `none`   | `spots`, `stripes`, `socks`, `mask`, `patch`                                |
| `peon-pet.accessory`   | `none`   | `bow`, `flower`, `crown`, `beanie`, `headphones`, `glasses`, `sunglasses`, `bandana`, `scarf`, `collar` |
| `peon-pet.accessoryColor` | *(empty)* | Accessory colour. Empty uses each accessory's own default            |
| `peon-pet.name`        | *(empty)*| Your pet's name. Empty uses the species default: Rusty, Mochi, Biscuit, Pip |
| `peon-pet.stateColors` | `true`   | Tint the pet and its aura with a colour per agent state                     |
| `peon-pet.wander`      | `true`   | Wander around the panel and fidget when idle                                |
| `peon-pet.artStyle`    | `smooth` | `smooth` rounds the pixel art off with Scale2x upscaling; `pixel` keeps it crisp |
| `peon-pet.size`        | `medium` | `small`, `medium` or `large`                                                |

Settings changes apply instantly; no reload needed. All colour settings take any CSS colour, so you can also just ask your AI agent, e.g. *"give my pet a gold crown and blue eyes"*.

---

## Development

```bash
npm run compile   # dev build
npm run watch     # rebuild on change (also available as the "Build Pet (watch)" task)
npm run lint
npm test
```

Where things live:

| File                        | Purpose                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `src/claude-watcher.ts`     | Tails Claude Code transcripts and sub-agent logs, picks the session to show |
| `src/transcript-parser.ts`  | Turns transcript lines into pet states (pure, unit-tested)              |
| `src/state-watcher.ts`      | Polls the peon-ping state file                                          |
| `src/pet-names.ts`          | Funny sub-agent names                                                   |
| `src/pet-config.ts`         | Settings, defaults and colour presets                                   |
| `src/pet-care.ts`           | Care stats, decay, reward/refusal rules and persistence                 |
| `media/play.js`             | Hands-on care: kibble, treats, fetch physics, bath scrubbing, stroking  |
| `media/pets.js`             | All pixel art: species, expressions, props, palettes                    |
| `media/webview.js`          | Canvas renderer, animations, emoji orbits, particles, mini-pet layout   |

### Editing the art

Pets are 32x32 grids in `media/pets.js`. Only the left 16 columns are drawn; the right half is mirrored automatically. Each letter is a palette key (`o` outline, `b` body, `l` light, `d` dark, `p` pink, `k` black, `w` white, `y` beak/feet), and body colours are derived from the pet's colour setting. Eyes, mouths, tails, wings, ear twitches, patterns, accessories and props are separate layers, so expressions and animations combine freely.

To add an accessory, add an entry to `ACCESSORIES` in `media/pets.js` (a grid using `a` for its colour and `A` for its darker edge, plus an anchor such as `sp.headTop` or `sp.neckY`), then add its name to `ACCESSORIES` in `src/pet-config.ts` and the `peon-pet.accessory` enum in `package.json`. A test checks that the three lists match.

---

## Artwork

All pet artwork is original pixel art defined as text grids in `media/pets.js`. No image files are used for the pets. The marketplace icon (`media/assets/icon.png`) and `media/demo.gif` are still from the original Orc Peon version.

---

## Acknowledgements

- **[vscode-peon-pet](https://github.com/smcqueen2/vscode-peon-pet)** by smcqueen2: the original extension this fork is built on, including the webview, session tracking and peon-ping integration.
- **[peon-ping](https://github.com/PeonPing/peon-ping)** and **[peon-pet](https://github.com/PeonPing/peon-pet)** by [Gary Sheng](https://github.com/garysheng): the agent event system and the original desktop pet that inspired the session-dot concept.
- **[vscode-pokemon](https://github.com/jakobhoeg/vscode-pokemon)** by [jakobhoeg](https://github.com/jakobhoeg): inspiration for the sidebar webview pet approach.

---

## License

[MIT](LICENSE)
