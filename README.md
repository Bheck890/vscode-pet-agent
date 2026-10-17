# Pet Agents

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-Pet%20Agents-6c4fd8)](https://marketplace.visualstudio.com/items?itemName=bheck890.pet-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**A pixel pet in your VS Code sidebar that acts out what your AI coding agent is doing, live.**
It reads files with a magnifying glass, types on a laptop, watches the washing machine while your tests run, throws a tantrum when a tool call fails and puts on a party hat when the task is done. When the agent starts sub-agents, mini pets pop out with funny names and their task written underneath.

![Pet Agents in the VS Code sidebar, following Claude Code through a bug fix](docs/images/hero.gif)

Works with **Claude Code** out of the box, and with Cursor, Codex, OpenCode and Kiro through [peon-ping](https://github.com/PeonPing/peon-ping). Read-only, offline, no account.

---

## Install

In VS Code, open the Extensions view (`Ctrl+Shift+X`), search for **Pet Agents** and click **Install**. Or press `Ctrl+P` and run:

```
ext install bheck890.pet-agents
```

Then open the **Explorer** sidebar: your pet lives in the **Pet Agents** panel. Drag the panel taller if it feels cramped, especially when sub-agents are running.

---

## Pick your pet

A fox, cat, dog or bird, each drawn in code as recolourable pixel art.

![The four species: Rusty the fox, Mochi the cat, Biscuit the dog and Pip the bird](docs/images/species.gif)

Run **Pet Agents: Customize Pet** for a menu of everything below. Every change shows up live and the menu stays open so you can keep tweaking. There is also **Randomize look** and **Reset look to defaults**.

![Eight customised pets with different colours, patterns and accessories](docs/images/looks.gif)

- **Colours:** fur, belly/muzzle, eyes and accessory. Pick a preset or any CSS colour (`#ff8800`, `hotpink`, `rebeccapurple`...).
- **Patterns:** spots, stripes, white socks, bandit mask, eye patch.
- **Accessories:** bow, flower, crown, beanie, headphones, glasses, sunglasses, bandana, scarf, collar with a bell tag. Hats step aside when a state needs the party hat or nightcap.
- **Art style:** `smooth` (rounded, soft edges) or `pixel` (crisp retro blocks).
- **Ask your AI.** Tell your agent something like _"give my VS Code pet a gold crown and blue eyes"_. It edits your settings and the pet changes immediately.

---

## Your pet acts out the agent

Each state has its own pose, expression, prop and a ring of emojis orbiting the pet. By default the pet is also tinted and glows with a colour for the state: purple for thinking, blue for writing, red for errors, gold when done (`pet-agents.stateColors`).

| Agent is...                  | Pet does                                          | Orbiting emojis |
| ---------------------------- | ------------------------------------------------- | --------------- |
| Thinking                     | Tilts its head, thought bubble with animated dots | 💭 🤔 💡 ✨     |
| Reading / searching files    | Holds a magnifying glass, eyes look down          | 🔍 📖 📄 👀     |
| Editing files                | Types on a laptop, tongue out in concentration    | ✏️ 📝 ⌨️ 💾     |
| Running commands             | Runs in place, sweat drops and dust puffs         | ⚙️ 🔧 ⚡ 💻     |
| Running tests                | Sits by a machine and watches it work             | 🧪 ⏳ 🔬 🫧     |
| Browsing the web / MCP tools | Looks through binoculars                          | 🌐 🔗 📡 🛰️     |
| Starting sub-agents          | Holds a clipboard while mini pets spawn           | 📋 📣 👥 🧩     |
| Waiting for you              | Hops, with a flashing `!` / `?` speech bubble     | ❓ ❗ 🙋 ⏳     |
| A tool call failed           | Storm cloud overhead, shakes, angry eyes          | 💢 💥 ⚠️ 🐛     |
| Finished the task            | Party hat, jumps, confetti                        | 🎉 ⭐ 🏆 ✅     |
| Idle for a while             | Nightcap, snot bubble, floating Zzz               |                 |

The pet also blinks, wags its tail (or flaps its wings), twitches its ears, and wakes up with a stretch and a yawn when work starts.

Once the agent does the same kind of thing twice in a row (two web searches, two file writes...), the pet keeps doing it, however long the agent thinks in between, until something different happens: another kind of tool call, an error, a question for you, or the end of the turn. A single action is held for 8 seconds of thinking, so it doesn't flicker back and forth.

### Never the same twice

With `pet-agents.variety` set to `random` (the default), every state picks one of several animations each time it starts. The pick comes from the agent's transcript, so the same agent does the same animation in every VS Code window, whether it's the main pet in one and a mini pet in another. Set it to `classic` to always get the looks in the table above.

![Six animation variants: napping in a box, a hamster wheel, surfing the web, maths on a chalkboard, hacking away and raising a trophy](docs/images/variants.gif)

| State      | Variants                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Napping    | nightcap, sideways, rolling over from side to side, belly-up, as a loaf, in a cardboard box, in a bed, on a perch (birds) |
| Thinking   | thought bubble, light bulb idea, pacing, over coffee, levitating meditation, maths on a chalkboard                        |
| Reading    | magnifying glass, a book, sniffing out clues, buried in a stack of books, ancient scrolls                                 |
| Writing    | laptop, mechanical keyboard with flying code, scribbling on a notepad, hacker mode                                        |
| Running    | running in place, hamster wheel, tinkering with a wrench, zoomies, running in circles, flying laps (birds)                |
| Testing    | watching the machine, eating popcorn, nervously, pacing, fingers crossed                                                  |
| Browsing   | binoculars, telescope, surfing the web on a surfboard, satellite dish, scouting from the sky (birds)                      |
| Delegating | clipboard, megaphone, conducting the team with a baton                                                                    |
| Waiting    | `!` / `?` bubble, holding up a sign, tapping its foot, waving at you                                                      |
| Error      | storm cloud, fuming, throwing a tantrum, flopping over                                                                    |
| Done       | party hat, raising a trophy, victory dance, backflip                                                                      |

Don't like one? Open the ⚙️ button in the pet panel, expand **Actions** and untick it (or list it in `pet-agents.disabledActions`, e.g. `running.zoomies`). It never plays again; if you untick every variant of a state, that state uses its classic look.

---

## Sub-agents become mini pets

Every sub-agent the agent starts appears as a mini version of your pet in its own colour, lined up along the bottom of the panel. Each one gets a name that fits its job (explorers become "Detective Noodle" or "Scout Waffles", planners become "Professor Pickles", reviewers become "Inspector..."), with its task shown underneath. Minis act out their own state, celebrate when they finish, then vanish in a puff.

![Three sub-agents spawn as mini pets, work, celebrate and vanish](docs/images/subagents.gif)

A second Claude Code session in the same workspace (say, another chat in this window) that was busy in the last couple of minutes joins them as a mini named after the folder it was started in (`pet-agents.backgroundPets`).

The row belongs to this repo's agents. When none are running here, busy sessions from your other repos (other VS Code windows) fill it instead, labelled with their repo name, so you can keep an eye on them. They step aside the moment a helper starts in this repo and never take over this window's pet (`pet-agents.otherRepoPets`).

## Machines for tests and jobs

Every test run, build and background shell command gets a machine next to your pet: a washing machine, oven, microwave, computer, engine or server rack, each with its own animation (spinning socks, a glowing oven window, scrolling test output, turning gears, blinking lights). When a job finishes its machine dings 🔔 and goes away. Hover a machine to see its command and how long it has been running (`pet-agents.machines`).

![A dev server, a test run and a build each get a machine; the pet watches and does a backflip when they finish](docs/images/machines.gif)

---

## It has a life of its own

When the agent is quiet, your pet gets up to things: chasing a butterfly, bird watching, digging, dancing, daydreaming, reading, having a coffee, yoga, rolling around, running in circles, and playing with its toys. It strolls around the panel (`pet-agents.wander`) and runs back to its spot the moment the agent starts working. Its pupils follow your mouse.

![Biscuit the dog finds a bone, chews it and does yoga](docs/images/idle.gif)

**Pet it.** Click for hearts 💖, double-click for a spin-jump trick ⭐. Clicking a napping pet wakes it up. Mini pets like attention too.

### Toys, furniture and the bag

Every few minutes your pet finds something new (`pet-agents.toys`), and every find goes into its 🎒 bag:

| Rarity    | Chance | Examples                                                                              |
| --------- | ------ | ------------------------------------------------------------------------------------- |
| Common    | 62%    | 🧶 yarn, 📦 box, 🦴 bone, 🧸 teddy, 🥏 frisbee, 🪴 plant, 🎈 balloon                  |
| Uncommon  | 25%    | 🪑 chair, 🛋️ couch, 🛏️ bed, 🎸 guitar, 🥁 drum, 🛹 skateboard, 🪁 kite, 🏀 basketball |
| Rare      | 10%    | 🚀 rocket, 🕹️ arcade stick, ⛺ tent, 🛸 tiny UFO, 🏰 castle                           |
| Legendary | 3%     | 👑 golden crown, 💎 giant diamond, 🦄 unicorn plush, 🌈 pocket rainbow                |

A new find shows off on the floor for a minute (rarer ones glow and sparkle, and a banner announces them), then flies into the bag. When your pet fancies a play it pulls something out: it chases the yarn, hides in the box, lounges on the couch, rides the skateboard, jams on the guitar or admires the treasure, then puts it back.

Click 🎒 to see the bag: all 24 slots, with ❔ for ones you haven't found yet. Click a toy to take it out, click again to put it away. The bag is shared by every VS Code window and survives reloads and reinstalls.

### The shop

Click 🛒 Shop in the bag to trade spare toys for new things. Only spares are traded in, so you always keep one of each toy you've found.

| For sale   | Price                   | What you get                                                                                                                                                   |
| ---------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animations | 20 common **or** 5 rare | 🪩 disco dancing, 🎩 magic tricks, 🫧 blowing bubbles, 🔭 stargazing, 🌀 spinning, 🎉 party (idle hobbies), 💤 sweet dreams (napping), 🎊 victory party (done) |
| Foods      | 100 common              | 🐟 fresh fish, 🥩 steak, 🍓 strawberries, 🍰 cake                                                                                                              |

Bought animations join the random mix (and the ⚙️ action list, where locked ones show 🔒). Bought foods appear under the care buttons; pick one and 🍖 Feed drops it instead of kibble.

### Take care of it

Click 🐾 to open care mode. Three stats wear down slowly in real time, even while VS Code is closed: 🍖 fullness, 💖 happiness and 🫧 cleanliness. Care is hands-on: pick a tool and actually do it.

![Feeding kibble, playing fetch and giving Mochi a bath](docs/images/care.gif)

| Tool      | What you do                                                        | What your pet does                                              |
| --------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| 🍖 Feed   | Your cursor becomes a bowl. Click to drop kibble (up to 6 pieces). | Trots over to each piece and eats it, crumbs flying             |
| 🍪 Treat  | Hold the cookie on your cursor, then click to drop it.             | Begs and hops when it's held above its head, catches it mid-air |
| 🎾 Play   | Grab the ball and fling it. It bounces off the floor and walls.    | Chases it and brings it back to where you threw from            |
| 🛁 Bath   | Your cursor becomes a sponge. Hold the button and scrub.           | Foam builds up and dirt fades. At 100% it does a big wet shake  |
| 💖 Stroke | Hold the button and rub your pet back and forth.                   | Wiggles happily with hearts                                     |

**Close the panel, keep the tool.** Pick a tool, then click 🐾 again to tuck the panel away and get the space back. The tool stays in your hand (the 🐾 button shows it, e.g. 🍖) until you press Esc, open the bag or settings, or the agent starts working.

Your pet has opinions: it won't eat when it's full, and is too hungry to play when starving. When a stat is low you'll see it: dirt smudges on its fur, and "hungry", "bored" or "needs a bath" under its name.

**No treats on the clock.** While the agent is working, or any of its helper pets are out, care is locked and clicking the pet just gets a 🛠️ "busy working" bubble. Care unlocks as soon as the task is done.

![The care, bag and quick settings panels](docs/images/panels.png)

### Quick settings and tooltips

The ⚙️ button switches things on and off without leaving the panel: random animations and hobbies, wandering, new toys, machines, pets for other sessions, state colours, and each individual action. Changes are saved to your VS Code settings.

Hover any pet for details: what it is doing, which file, which project, its care stats and how many helpers and jobs are running. The **session dots** in the top-left corner show your other active agent sessions (bright green = active, dark green = idle, grey = cold). **Drag** your pet anywhere in the panel; the position is remembered.

<img src="docs/images/tooltip.png" alt="Hovering the pet shows what it is doing, the file, the project, care stats and helpers" width="340">

---

## Where the activity comes from

The pet reads two sources. Both are **read-only**: the extension never writes to them and makes no network requests.

1. **Claude Code session logs** (`~/.claude/projects/`). These give the detailed states above, plus sub-agent names and tasks. Nothing to install. **Each window stays in its own lane:** the pet only acts out Claude sessions started in a folder open in that VS Code window. A session from another repo never drives this pet; it can only appear as a labelled mini while no agents are running in this repo.
2. **[peon-ping](https://github.com/PeonPing/peon-ping)** (`~/.claude/hooks/peon-ping/.state.json`), if you have it installed. This covers other agents (Cursor, Codex, OpenCode, Kiro) with coarser states: waking, thinking, waiting, error and done. Events are filtered by workspace in the same way.

Tests, builds and background jobs are recognised from the shell command (`npm test`, `pytest`, `flutter test`, `npm run build`, `npm run dev`...). A background job's machine stays until Claude Code logs its completion notification.

**Limitation:** Claude Code doesn't log when it is showing you a permission prompt. If a file edit (or another non-shell tool call) has no result after 5 seconds, the pet assumes it is waiting for your OK. Long-running shell commands, web fetches and sub-agents are excluded from that guess.

---

## Commands

| Command                     | Description                                                   |
| --------------------------- | ------------------------------------------------------------- |
| `Pet Agents: Customize Pet` | Menu for species, colours, pattern, accessory, name and more  |
| `Pet Agents: Refresh Pet`   | Rebuilds the pet view (also the ⟳ button in the panel header) |
| `Pet Agents: Show Log`      | Opens the Pet Agents output channel                           |

If the panel ever says **"Pet Agents was updated"**, the extension was updated but the window is still running the old version: run **Developer: Reload Window**.

If the pet ever vanishes, run **Pet Agents: Show Log**. The view logs any frame that fails to draw, a lost canvas, and a pet that lost its position. It heals itself (rebuilds its sprites, resizes and moves the pet home) straight away and every 5 minutes. If frames keep failing for 10 seconds it refreshes itself, at most once every 5 minutes. Set the channel's log level to Debug (gear icon in the Output panel) to also see each 5-minute check and the view being shown and hidden.

## Settings

All settings apply instantly, no reload needed. Every colour setting takes any CSS colour.

| Setting                      | Default   | Description                                                                                              |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| `pet-agents.species`         | `fox`     | `fox`, `cat`, `dog` or `bird`                                                                            |
| `pet-agents.name`            | _(empty)_ | Your pet's name. Empty uses the species default: Rusty, Mochi, Biscuit, Pip                              |
| `pet-agents.color`           | _(empty)_ | Fur/feather colour. Empty uses the species default (an orange fox, slate cat, brown dog, blue bird)      |
| `pet-agents.accentColor`     | _(empty)_ | Belly, muzzle and chest colour                                                                           |
| `pet-agents.eyeColor`        | _(empty)_ | Eye colour. Empty is dark slate with black pupils                                                        |
| `pet-agents.pattern`         | `none`    | `spots`, `stripes`, `socks`, `mask`, `patch`                                                             |
| `pet-agents.accessory`       | `none`    | `bow`, `flower`, `crown`, `beanie`, `headphones`, `glasses`, `sunglasses`, `bandana`, `scarf`, `collar`  |
| `pet-agents.accessoryColor`  | _(empty)_ | Accessory colour. Empty uses each accessory's own default                                                |
| `pet-agents.artStyle`        | `smooth`  | `smooth` rounds the pixel art off with Scale2x upscaling; `pixel` keeps it crisp                         |
| `pet-agents.size`            | `medium`  | `small` (150px), `medium` (200px) or `large` (250px)                                                     |
| `pet-agents.stateColors`     | `true`    | Tint the pet and its aura with a colour per agent state                                                  |
| `pet-agents.variety`         | `random`  | `random` picks a different animation each time and adds idle hobbies; `classic` always uses the same one |
| `pet-agents.disabledActions` | `[]`      | Animations and hobbies never to play, e.g. `running.zoomies`, `idle.butterfly`                           |
| `pet-agents.wander`          | `true`    | Wander around the panel and fidget when idle                                                             |
| `pet-agents.toys`            | `true`    | New toys and furniture turn up, go into the bag and get played with                                      |
| `pet-agents.machines`        | `true`    | A machine for each running test, build or background job                                                 |
| `pet-agents.backgroundPets`  | `true`    | Other busy Claude sessions in this repo as small pets                                                    |
| `pet-agents.otherRepoPets`   | `true`    | When no agents are running in this repo, show busy sessions from other repos as small pets               |

Your settings live in your VS Code user settings. The toy bag, shop purchases and care stats are kept in VS Code's extension storage.

---

## Development

```bash
git clone https://github.com/Bheck890/vscode-pet-agent
cd vscode-pet-agent
npm ci
npm run install:vscode   # build, package pet-agents.vsix and install it into VS Code
```

Then run **Developer: Reload Window**. Or press **F5** to launch an Extension Development Host.

```bash
npm run compile   # dev build
npm run watch     # rebuild on change
npm run lint
npm test          # lint, compile, then the Jest suite
npm run media     # re-record the README GIFs, screenshots and the icon (needs Chrome or Edge)
npm run package   # production build + pet-agents.vsix
```

`npm run media` drives the real webview in headless Chrome with a fake clock, so every frame is exact and every run produces the same pictures. Pass a clip name to record just one, e.g. `npm run media -- care`. Set `CHROME_PATH` if Chrome isn't found.

| File                       | Purpose                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| `src/claude-watcher.ts`    | Tails Claude Code transcripts and sub-agent logs, picks the session to show |
| `src/transcript-parser.ts` | Turns transcript lines into pet states (pure, unit-tested)                  |
| `src/state-watcher.ts`     | Polls the peon-ping state file                                              |
| `src/PeonViewProvider.ts`  | The sidebar webview and its messages                                        |
| `src/pet-names.ts`         | Funny sub-agent names                                                       |
| `src/bag-store.ts`         | The toy bag and shop purchases in extension storage, merged across windows  |
| `src/workspace.ts`         | Matches session folders to the window's workspace (Windows/Git Bash paths)  |
| `src/pet-config.ts`        | Settings, defaults and colour presets                                       |
| `src/pet-care.ts`          | Care stats, decay, reward/refusal rules and persistence                     |
| `media/pets.js`            | All pixel art: species, expressions, props, palettes                        |
| `media/variants.js`        | Animation variants per state and idle hobbies (pure data + pickers)         |
| `media/scene.js`           | Toys with rarity, machines for jobs, critters, variant scenery              |
| `media/play.js`            | Hands-on care: kibble, treats, fetch physics, bath scrubbing, stroking      |
| `media/webview.js`         | Canvas renderer, animations, emoji orbits, particles, mini-pet layout       |
| `scripts/record-media.js`  | Records `docs/images/*` and `media/assets/icon.png`                         |

### Editing the art

Pets are 32x32 grids in `media/pets.js`. Only the left 16 columns are drawn; the right half is mirrored automatically. Each letter is a palette key (`o` outline, `b` body, `l` light, `d` dark, `p` pink, `k` black, `w` white, `y` beak/feet), and body colours are derived from the pet's colour setting. Eyes, mouths, tails, wings, ear twitches, patterns, accessories and props are separate layers, so expressions and animations combine freely.

To add an accessory, add an entry to `ACCESSORIES` in `media/pets.js` (a grid using `a` for its colour and `A` for its darker edge, plus an anchor such as `sp.headTop` or `sp.neckY`), then add its name to `ACCESSORIES` in `src/pet-config.ts` and the `pet-agents.accessory` enum in `package.json`. Tests check that the lists match.

---

## Artwork

All pet artwork is original pixel art defined as text grids in `media/pets.js`. The icon and the pictures in this README are rendered from that same art by `scripts/record-media.js`.

## Acknowledgements

- **[vscode-peon-pet](https://github.com/smcqueen2/vscode-peon-pet)** by smcqueen2: the original extension this one grew out of, including the webview, session tracking and peon-ping integration.
- **[peon-ping](https://github.com/PeonPing/peon-ping)** and **[peon-pet](https://github.com/PeonPing/peon-pet)** by [Gary Sheng](https://github.com/garysheng): the agent event system and the original desktop pet that inspired the session dots.
- **[vscode-pokemon](https://github.com/jakobhoeg/vscode-pokemon)** by [jakobhoeg](https://github.com/jakobhoeg): inspiration for the sidebar webview pet.

## License

[MIT](LICENSE)
