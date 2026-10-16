# Peon Pet

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A pixel-art pet (fox, cat, dog or bird) that lives in your VS Code sidebar and acts out what your AI coding agent is doing, live. When the agent starts sub-agents, mini pets pop out with funny names and their task written underneath.

> This is a fork of [vscode-peon-pet](https://github.com/smcqueen2/vscode-peon-pet). The original Orc Peon sprite and custom sprite packs have been replaced by recolourable pets drawn in code.

---

## Features

### Your pet acts out the agent

Each state has its own pose, expression, prop and a ring of emojis orbiting the pet. The table shows the classic look; with variety on (the default) each state has several more, see below.

| Agent is...                  | Pet does                                              | Orbiting emojis |
| ---------------------------- | ----------------------------------------------------- | --------------- |
| Thinking                     | Tilts its head, thought bubble with animated dots     | 💭 🤔 💡 ✨     |
| Reading / searching files    | Holds a magnifying glass, eyes look down              | 🔍 📖 📄 👀     |
| Editing files                | Types on a laptop, tongue out in concentration        | ✏️ 📝 ⌨️ 💾     |
| Running commands             | Runs in place, sweat drops and dust puffs             | ⚙️ 🔧 ⚡ 💻     |
| Running tests                | Sits by a machine and watches it work                 | 🧪 ⏳ 🔬 🫧     |
| Browsing the web / MCP tools | Looks through binoculars                              | 🌐 🔗 📡 🛰️     |
| Starting sub-agents          | Holds a clipboard while mini pets spawn               | 📋 📣 👥 🧩     |
| Waiting for you              | Hops, with a flashing `!` / `?` speech bubble         | ❓ ❗ 🙋 ⏳     |
| A tool call failed           | Storm cloud overhead, shakes, angry eyes              | 💢 💥 ⚠️ 🐛     |
| Finished the task            | Party hat, jumps, confetti                            | 🎉 ⭐ 🏆 ✅     |
| Idle for a while             | Nightcap, snot bubble, floating Zzz                   |                 |

The pet also blinks, wags its tail (or flaps its wings), twitches its ears, and wakes up with a stretch and a yawn when work starts.

Once the agent does the same kind of thing twice in a row (two web searches, two file writes...), the pet keeps doing it, however long the agent thinks in between, until something different happens: another kind of tool call, an error, a question for you, or the end of the turn. A single action is held for 8 seconds of thinking, so it doesn't flicker back and forth.

### Never the same twice

With `peon-pet.variety` set to `random` (the default), every state picks one of several animations each time it starts, and never the same one twice in a row. Set it to `classic` to always get the looks in the table above.

Don't like one? Open the ⚙️ button in the pet panel, expand **Actions** and untick it (or list it in `peon-pet.disabledActions`, e.g. `running.zoomies`). It never plays again; if you untick every variant of a state, that state uses its classic look.

The panel has depth: the pet can stroll towards the back (drawn smaller and higher up) and come forward again. Zoomies are short dashes near its spot, and running in circles laps round through the back of the panel.

| State      | Variants                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------ |
| Napping    | nightcap, sideways, rolling over from side to side, belly-up, as a loaf, in a cardboard box, in a bed, on a perch (birds) |
| Thinking   | thought bubble, light bulb idea, pacing, over coffee, levitating meditation, maths on a chalkboard |
| Reading    | magnifying glass, a book, sniffing out clues, buried in a stack of books, ancient scrolls  |
| Writing    | laptop, mechanical keyboard with flying code, scribbling on a notepad, hacker mode         |
| Running    | running in place, hamster wheel, tinkering with a wrench, zoomies, running in circles, flying laps (birds) |
| Testing    | watching the machine, eating popcorn, nervously, pacing, fingers crossed                   |
| Browsing   | binoculars, telescope, surfing the web on a surfboard, satellite dish, scouting from the sky (birds) |
| Delegating | clipboard, megaphone, conducting the team with a baton                                     |
| Waiting    | `!` / `?` bubble, holding up a sign, tapping its foot, waving at you                       |
| Error      | storm cloud, fuming, throwing a tantrum, flopping over                                     |
| Done       | party hat, raising a trophy, victory dance, backflip                                       |

### It has a life of its own

- **Idle fidgets.** When nothing is happening it looks around, twitches its ears, yawns, hops, grooms, wags, or chases its tail.
- **Hobbies.** With variety on it also gets up to things on its own: chasing a butterfly, bird watching, digging, dancing, daydreaming, reading, having a coffee, yoga, rolling around, running in circles, and playing with its toys. Birds fly around the panel. It stays up for 90 seconds instead of 30 before napping, and now and then gets up from a nap by itself.
- **Wandering.** It strolls around the panel when idle, and runs back to its spot the moment the agent starts working. Turn this off with `peon-pet.wander` (this also keeps it from flying or running off after toys).
- **Follows your mouse.** Its pupils track your cursor across the panel.
- **Pet it.** Click for hearts 💖, double-click for a spin-jump trick ⭐. Clicking a napping pet wakes it up. Mini pets like attention too.

### Toys, furniture and the bag

Every few minutes your pet finds something new (`peon-pet.toys`). Each find has a rarity:

| Rarity    | Chance | Examples                                                      |
| --------- | ------ | ------------------------------------------------------------- |
| Common    | 62%    | 🧶 yarn, 📦 box, 🦴 bone, 🧸 teddy, 🥏 frisbee, 🪴 plant, 🎈 balloon |
| Uncommon  | 25%    | 🪑 chair, 🛋️ couch, 🛏️ bed, 🎸 guitar, 🥁 drum, 🛹 skateboard, 🪁 kite, 🏀 basketball |
| Rare      | 10%    | 🚀 rocket, 🕹️ arcade stick, ⛺ tent, 🛸 tiny UFO, 🏰 castle     |
| Legendary | 3%     | 👑 golden crown, 💎 giant diamond, 🦄 unicorn plush, 🌈 pocket rainbow |

Every find goes into the pet's 🎒 **bag**, and duplicates stack. A new find shows off on the floor for a minute (rarer ones glow and sparkle, and a banner announces them), then flies into the bag. When your pet fancies a play it pulls something out of the bag out of thin air: it chases the yarn, hides in the box, lounges on the couch, naps in the bed, rides the skateboard, jams on the guitar, jumps for the balloon or admires the treasure, then puts it back. The floor never fills up.

Click the 🎒 button in the corner to see the bag: all 24 slots, with ❔ for ones you haven't found yet. Click a toy to take it out, click again to put it away, or **Put all away**. Click a toy on the floor to poke it. The bag is remembered across reloads.

### Machines for tests and jobs

Every test run, build and background shell command gets a machine next to your pet: a washing machine, oven, microwave, computer, engine or server rack, each with its own animation (spinning socks, glowing oven window, scrolling test output, turning gears, blinking lights). More jobs, more machines; sub-agents' tests count too. When a job finishes its machine dings 🔔 and goes away. While tests run the pet waits beside them, watching. In `classic` variety tests always get a washing machine, builds an engine and dev servers a server rack. Hover a machine to see its command and how long it has been running. Turn them off with `peon-pet.machines`.

### Sub-agents and other sessions become mini pets

Every sub-agent the agent starts appears as a mini version of your pet in its own colour, lined up along the bottom of the panel. Each one gets a name that fits its job (explorers become "Detective Noodle" or "Scout Waffles", planners become "Professor Pickles"), with its task shown underneath. Minis act out their own state, celebrate when they finish, then vanish in a puff.

Other Claude Code sessions that were busy in the last couple of minutes join them as minis named after the folder the session was started in (`peon-pet.backgroundPets`). They don't lock pet care, since they aren't working for this window. If there's no room above or below your pet, minis stand beside it; in a very cramped panel they stand in front of it. Drag the panel taller or pick a smaller `peon-pet.size` to give them space.

### Quick settings

The ⚙️ button in the corner switches things on and off without leaving the panel: random animations and hobbies, wandering, new toys, machines, pets for other sessions, state colours, and each individual action. Changes are saved to your VS Code settings.

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

**No treats on the clock.** While the agent is working, or any of its helper pets are out, care is locked: the buttons grey out, any tool in hand is put away, and clicking the pet just gets a 🛠️ "busy working" bubble. Care unlocks as soon as the task is done.

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

1. **Claude Code session logs** (`~/.claude/projects/`). These give the detailed states above plus sub-agent names and tasks. Nothing to install. **Each window stays in its own lane:** the pet only acts out Claude sessions that were started in a folder open in that VS Code window (the most recent one, if there are several). A session from another window never takes over, even when this window has no session of its own; it only shows up as a labelled mini pet (turn those off with ⚙️ -> Pets for other sessions). peon-ping events are filtered the same way.
2. **[peon-ping](https://github.com/PeonPing/peon-ping)** (`~/.claude/hooks/peon-ping/.state.json`), if you have it installed. This covers other agents (Cursor, Codex, OpenCode, Kiro) with coarser states: waking, thinking, waiting, error and done.

Tests, builds and background jobs are recognised from the shell command (`npm test`, `pytest`, `flutter test`, `npm run build`, `npm run dev`...). A background job's machine stays until Claude Code logs its completion notification.

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
| `peon-pet.variety`     | `random` | `random` picks a different animation each time and adds idle hobbies; `classic` always uses the same one |
| `peon-pet.disabledActions` | `[]` | Animations and hobbies never to play, e.g. `running.zoomies`, `idle.butterfly` |
| `peon-pet.toys`        | `true`   | New toys and furniture turn up, go into the bag and get played with         |
| `peon-pet.machines`    | `true`   | A machine for each running test, build or background job                    |
| `peon-pet.backgroundPets` | `true` | Other busy Claude sessions as small pets along the bottom                  |
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
| `src/workspace.ts`          | Matches session folders to the window's workspace (Windows/Git Bash paths) |
| `src/pet-config.ts`         | Settings, defaults and colour presets                                   |
| `src/pet-care.ts`           | Care stats, decay, reward/refusal rules and persistence                 |
| `media/play.js`             | Hands-on care: kibble, treats, fetch physics, bath scrubbing, stroking  |
| `media/pets.js`             | All pixel art: species, expressions, props, palettes                    |
| `media/variants.js`         | Animation variants per state and idle hobbies (pure data + pickers)     |
| `media/scene.js`            | Toys with rarity, machines for jobs, critters, variant scenery          |
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
