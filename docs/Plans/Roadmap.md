# Pet Agents Roadmap: a pet you keep for months

Goal: give people who leave the pet open for weeks something to come back to,
without making it a chore. Every system here is optional (its own setting),
never punishes time away, reads only local data, and sends nothing over the
network. Background and the original pitch: [Adventure.md](Adventure.md).

Ground rules for every phase:

- **Derive, don't accumulate.** Several VS Code windows read the same
  transcripts at once. Anything that counts (XP, challenge progress, records)
  is computed from stored facts keyed by a stable id (`promptId`,
  `tool_use` id), so two windows recording the same fact changes nothing.
  Stores merge, like `BagStore` does today.
- **Pure logic in `src/`, tested without VS Code.** Stores take the
  `Storage` interface (`src/storage.ts`). Calendar and record maths are pure
  functions with a `now` parameter.
- **Webview art in its own `media/*.js` file**, added with one
  `<!--MEDIA:x.js-->` line in `media/webview.html`, exposing
  `window.PetX.create(api)` or pure data.
- **Every new message goes in `src/protocol.ts` first**, with a test in
  `protocol.test.ts`.
- **Every new setting** is read in `readPetConfig`, declared in
  `package.json`, listed in the README settings table, and gets a switch in
  the settings panel when it's on/off. `manifest.test.ts` enforces the first three.
- CI (`.github/workflows/ci.yml`) runs everything on every push. Each phase
  lands with its tests in the same commit.

---

## Phase 0: architecture prep (done)

What changed so the phases below plug in without touching unrelated code:

| Before | After | Why it matters for the roadmap |
|---|---|---|
| Message handling was an if/else chain with inline validation in the provider | `protocol.ts`: typed `FromWebview` / `ToWebview`, one `parseFromWebview` | Records, levels and the house each add messages; one place to add and test them |
| `PeonViewProvider` took 8 positional args | One `PetViewDeps` object | New stores (records, progress, house) join as fields |
| `sendCare()` also sent shop unlocks | `syncShared()` pushes all cross-window state | Levels and records sync through the same 60s tick |
| `CareStorage` lived in `pet-care.ts`, imported by `bag-store.ts` | `storage.ts` `Storage` interface | New stores depend on storage, not on care |
| `webview-helpers.ts` mixed HTML, watcher wiring and init messages | `webview-html.ts` (HTML) + provider owns wiring | |
| The script list was copied in 4 places (template, builder, recorder, tests) | `<!--MEDIA:file-->` in `webview.html`; `media-files.ts` reads it | New scripts (`events.js`, `house.js`...) are a one-line change |
| `extension.ts` was 300 lines, mostly the Customize menu | `settings.ts`, `customize-menu.ts`; `extension.ts` only wires things together | |
| Transcript tailing was inside `claude-watcher.ts` | `transcript-tail.ts` `readLines(file, size, onLine)` | Prompt records reuse it for live stats **and** history backfill |
| Pet states were a TS type plus a "mirrored in webview.js" comment | `PET_STATES` list; `media/states.js`; a test checks they match | Enemies and events key off states safely |
| `webview.js` was 3,131 lines including all DOM panels | `media/panels.js` owns the corner panels | Records, challenges and house panels go next to the existing ones |
| One flaky webview test | Fixed (found the toy by its own tooltip) | CI stays trustworthy |

---

## Phase 1: Holiday events, Halloween first (target: before Oct 31, 2026)

Halloween is the deadline, and it doesn't depend on any other phase.

**Extension**
- `src/calendar.ts` (pure): `activeEvents(date: Date): EventId[]`.
  - Fixed: New Year (Dec 31-Jan 2), Valentine's (Feb 10-14), Halloween
    (Oct 24-31), Christmas (Dec 18-26).
  - Computed: Easter (Gregorian computus, Good Friday to Easter Monday),
    Thanksgiving (4th Thursday of November, plus the day before and after).
  - Seasons: winter/spring/summer/autumn from the month, with an optional
    `pet-agents.hemisphere` setting (`north` | `south`).
  - Uses the **local** date, so the event flips at local midnight.
- Send `events: EventId[]` in `init`, and re-send on `syncShared()` when the
  date rolls over.

**Webview**
- `media/events.js`: data per event:
  - `decor`: things drawn in `scene.drawBack` / `drawFront`, e.g. pumpkins,
    cobwebs, snow, lights.
  - `costume`: an accessory override, e.g. a witch hat or Santa hat. It sits
    under the user's own accessory and gives way to state props, just as hats
    do now.
  - `fx`: ambient particles (bats, snowflakes).
  - `collectable`: an event-only toy for the bag, e.g. a candy bucket or an
    ornament. It goes in `scene.js` `TOYS` with `event: 'halloween'` and only
    rolls while that event is active. Once found, it stays forever.
- A small banner the first time the pet appears during an event
  ("🎃 Happy Halloween!").

**Settings**: `pet-agents.holidays` (boolean, default on).
**Tests**: date table tests (Easter 2026 = Apr 5, 2027 = Mar 28;
Thanksgiving 2026 = Nov 26); Oct 23 vs Oct 24; the southern-hemisphere
season flip; event toys never roll outside their event; the webview draws with
every event active at once (behavior test).

---

## Phase 2: Turn tracking and weekly prompt records

**Data: one record per prompt (a "turn")**, built from the transcript:

```ts
interface TurnRecord {
  promptId: string;        // from the user line; the dedupe key
  sessionId: string;
  project: string | null;  // basename of the session root
  startedAt: number;       // user prompt timestamp
  endedAt: number;         // end_turn / interrupt timestamp
  words: number;           // prompt length
  chars: number;
  actions: number;         // tool_use blocks in the main transcript
  subagents: number;       // Agent/Task tool calls
  outputTokens: number;    // sum of assistant message.usage.output_tokens
  outcome: 'done' | 'interrupted';
  preview: string;         // first 80 chars of the prompt, kept locally only
}
```

**Extension**
- `src/turn-tracker.ts` (pure): `createTurns()` + `applyTurnLine(turns, line)`.
  It is a second consumer of the lines `readLines` already passes to
  `applyLine`, and returns a `TurnRecord` when a turn ends. It uses the same
  prompt-vs-plumbing rules as `transcript-parser.ts` (tagged strings and
  `isMeta` are not prompts); share that check rather than copy it.
- `src/records-store.ts`: stored under `petTurns`:
  - The current and previous ISO week's turns, keyed by `promptId` and merged
    on write. Older turns are pruned.
  - `petHallOfFame`: the all-time best record per category, kept so the
    pruning doesn't lose it.
- `src/records.ts` (pure): `weeklyRecords(turns)` gives, per category, the
  winning turn. Only finished turns of at least 3 seconds count.
  - 🪄 Tiny prompt, epic run: highest `duration / words`.
  - 📜 Essay for a one-liner: highest `words / duration`.
  - ⚙️ Busiest: most `actions`.
  - 🎯 Sniper: fewest `actions`, on a finished turn with at least one action.
  - 🐣 Biggest litter: most `subagents`.
  - ⏱️ Marathon: longest duration.
- **Backfill**: on activation, read transcripts modified since the start of
  the week from offset 0 in the background, a few files per tick so startup
  stays fast. Merging by `promptId` makes this safe to repeat.
- Message: `records-update` `{ week, records, hallOfFame, totals }` out, sent
  on `ready`, when a turn ends, and on the sync tick.

**Webview**
- A 🏆 tab in the bag panel (or its own corner button) showing this week's
  board, the totals (prompts, actions, agent hours) and the hall of fame.
- The pet celebrates when a turn breaks a weekly record.

**Settings**
- `pet-agents.records` (boolean, default on).
- `pet-agents.recordsShowPrompts` (boolean, **default off**): show prompt
  previews on the board. When off, the board shows only numbers and the
  project name.

**Privacy**: prompt previews stay in local globalState and are never logged.
The debug snapshot includes counts only.

**Tests**: turn tracking against real-shaped transcript lines:
- a normal turn, an interrupt, and compaction in the middle of a turn
- sub-agent calls, and tool results arriving after the turn ends
- the same prompt seen by two trackers is stored once
- week rollover on a Sunday-to-Monday boundary in local time, and pruning
- backfill and live tracking of the same turn don't double count

---

## Phase 3: Levels, XP and weekly challenges

**XP comes from facts, never from counters**:

| Source | XP | Dedupe key |
|---|---|---|
| Finished turn | 10 + 1 per action (cap 40) | `promptId` |
| Test run passed | 15 | `tool_use` id |
| Build passed | 10 | `tool_use` id |
| Sub-agent finished | 5 | agent id |
| Weekly record won | 50 | `week:category` |
| Care action | 2 (cap 20/day) | `care:<day>:<n>` |
| Challenge completed | 100 | `week:challengeId` |

- `src/progress.ts` (pure): `level(xp)` uses a gentle curve (level n needs
  `50 * n * (n + 1)` XP) and returns the unlocks per level.
- `src/progress-store.ts`: stores `petXp` as a map from dedupe key to XP,
  pruned after 30 days into a `petXpBanked` total. Total XP = banked + the
  map, so windows can't double count.
- **Weekly challenges**: three a week, picked by a hash of the ISO week, so
  every window agrees. Progress is computed from that week's turns and XP
  facts, never stored. Examples: "Pass 5 test runs", "Delegate to 3
  sub-agents", "Win a prompt record", "Give 3 baths", "Ship on 4 different
  days".
- **No punishment for time away**:
  - Nothing decays except care, which already exists.
  - Challenges simply expire.
  - A "catch-up" bonus doubles XP for the first 3 turns after 7 or more days
    away.
- **Unlocks by level**: accessories, house furniture, foods, idle hobbies.
  They're added to `petUnlocks` with a `level.` prefix, so the shop,
  collection and `Variants.pick` keep working unchanged.
- Messages: `progress-update` out.

**Webview**: a level badge and XP bar in the care panel; a challenges list;
a level-up animation (`done`-style one-shot plus confetti).
**Settings**: `pet-agents.levels` (boolean, default on).
**Tests**: the curve is monotonic and unlocks are reachable; the same facts
from two windows give the same XP; the challenge pick is stable within a week
and differs across weeks; catch-up only triggers after a real gap.

---

## Phase 4: Enemies (bugs you squash)

- `transcript-parser.ts` already knows test/build jobs and `is_error` results.
  Add `onJobEnd(job, ok)` (or an `outcomes` list on the update) so failures
  and passes of the main and sub-agents reach the webview with their ids.
- Mapping:
  - A failing test spawns a 🐛 bug.
  - A failing build spawns a gremlin.
  - A permission wait of 60s or more spawns a slime.
  - At most 5 enemies on screen.
- The next **passing** run of the same kind squashes them, for XP (Phase 3,
  keyed by the passing `tool_use` id). Enemies left overnight just wander off;
  nothing is lost.
- `media/enemies.js` (`PetEnemies.create(api)`), drawn in scene layers. The
  pet chases a bug with the same roaming code `scene.js` uses for critters.
- **Settings**: `pet-agents.enemies` (boolean, default on).
- **Tests**: a fail then a pass squashes; a pass with no enemies is a no-op;
  sub-agent failures count; the cap holds; reloading doesn't respawn
  squashed enemies.

---

## Phase 5: The house

- A 🏠 corner button flips the panel to the pet's room: the same canvas, a
  different background layer (wall, floor and window, with the season from
  Phase 1 outside it).
- Furniture comes from level unlocks, holiday collectables and the existing
  furniture-type toys. You drag pieces to place them, and the layout is saved
  globally (`petHouse`: a list of `{ id, x, y }`).
- The pet sleeps in its bed, eats at its bowl and plays with toys placed in
  the room when the agent is idle. While the agent works, the pet goes back
  to its desk in the main view, so agent activity always wins.
- `media/house.js` (`PetHouse.create(api)`). New messages: `house-save` in,
  layout in `init` out.
- **Settings**: `pet-agents.house` (boolean, default on).
- **Tests**: a layout survives a reload; unknown furniture ids are dropped;
  saves merge across windows; agent work pulls the pet out of the house.

---

## Order and timing

| When | What |
|---|---|
| Oct 20-30, 2026 | Phase 1 with Halloween only, then ship 0.4.0 |
| Nov 2026 | Phase 2 (records + backfill); Thanksgiving decor (Nov 26) |
| Dec 2026 | Phase 3 (levels + challenges); Christmas and New Year decor |
| Jan-Feb 2027 | Phase 4 (enemies); Valentine's |
| Spring 2027 | Phase 5 (house); Easter (Mar 28) |

Each release: bump `version`, add a CHANGELOG entry, run `npm run media` if
the visuals changed, get CI green, then `npx @vscode/vsce publish`.
