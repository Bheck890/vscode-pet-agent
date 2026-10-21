# Plan: themed packs unlocked by level (bags, animations, houses, rooms, styles)

Status: built. The open question below was settled on option 3 (bags 6 to 20 every 2 levels,
the last at level 35). Builds on the levels and house from [Roadmap.md](Roadmap.md)
(Phases 3 and 5) and the toy bag and shop that exist today. What happens after the last bag (finishing, sharing, new saves) is in
[Profiles.md](Profiles.md).

## The idea

- Levels unlock **bags**, up to **20**.
  - Levels 1 to 5 unlock one bag each.
  - After that, a new bag every 5 levels: 10, 15, 20, and so on.
- Each bag is a themed collection with **its own toys and its own shop**.
- You pick which bag is active.
  - New finds come from the active bag's catalogue.
  - Each bag's shop sells that bag's goodies, paid for with that bag's spare toys.
- Switching never loses anything. Every bag keeps its finds, trades and
  purchases.
- Every bag unlock is a whole themed **pack**, not just toys (next section).

## What each bag unlock brings

Each pack comes free with its bag, and its shop sells more of the same theme:

| Part           | Comes with the unlock                                        | Sold in that bag's shop             |
| -------------- | ------------------------------------------------------------ | ----------------------------------- |
| 🧸 Toys        | its catalogue starts dropping                                |                                     |
| 🎭 Animations  | 2 themed idle hobbies and 1 themed variant of an agent state | 2 to 4 more animations              |
| 🏠 House       | a new house with 2 rooms                                     | more rooms for that house (up to 4) |
| 🛋️ Furniture   | 3 pieces                                                     | the rest of the set                 |
| 🎨 Room themes | 1 wallpaper and floor set                                    | 2 to 3 more                         |
| 🐾 Pet style   | 1 themed look for the pet (a costume)                        | color variants                      |

Examples:

| Bag     | Animations                                                    | House and its rooms                                     | Themes                                    | Pet style        |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------- | ---------------- |
| Starter | today's hobbies                                               | Cozy home: living room, bedroom                         | Cozy, Mint, Night, Candy, Space (today's) | (none)           |
| Garden  | watering plants, chasing a snail; "thinking" sniffing flowers | Greenhouse cottage: greenhouse, potting shed, veg patch | Leafy, Terracotta                         | flower crown     |
| Ocean   | sandcastle, snorkelling; "browsing" through a periscope       | Beach hut: hut, deck, rock pool                         | Driftwood, Coral                          | snorkel mask     |
| Kitchen | baking, taste-testing; "writing" a recipe card                | Bakery: shop floor, kitchen                             | Checkerboard, Copper                      | chef hat         |
| Music   | drum solo, air guitar; "done" a stage dive                    | Studio: recording booth, stage                          | Neon, Velvet                              | rock-star shades |
| Space   | moonwalk, zero-g float; "running" on a treadmill in orbit     | Moon base: airlock, observatory, greenhouse dome        | Starfield, Hull metal                     | space helmet     |

Every bag up to 20 follows the same shape. The themes in the table above
suggest each bag's pack.

### Houses and rooms

- **Several houses**: one per bag (20 at most). The 🏠 strip gains a house
  picker and, inside a house, room tabs (`◀ Bedroom ▶`).
- **Each room has its own** furniture layout and theme. Furniture from any
  unlocked bag can go in any room, so houses can be mixed and matched.
- **Rooms have a job** that changes what the pet does there when idle:

  | Room kind                  | Pet does                                             |
  | -------------------------- | ---------------------------------------------------- |
  | `bed` (bedroom, bunk, hut) | naps in the bed                                      |
  | `food` (kitchen, bakery)   | eats from its bowl; the care panel's feed works here |
  | `play` (yard, deck, stage) | plays with toys that are out                         |
  | `living` (everything else) | wanders and uses furniture                           |

- The pet follows you into the room you're looking at. Agent work still
  calls it back to its desk.

### Pet styles

- A **pet style** is a costume from a new `STYLES` set in `pets.js`, drawn
  the same way as the holiday `COSTUMES` (accessory slots, user accessory
  wins).
- It is picked in the 🎒 **Collection** tab and saved as a new setting,
  `pet-agents.style`, read in `readPetConfig` and listed in the README.
- A holiday costume shows over a style while the event is on. A setting to
  turn that off can come later.

## Open question: decide before building

With the curve as it is, bag 20 lands at **level 80**. That needs
`xpForLevel(80)` = 50 x 79 x 80 = **316,000 XP**, which is years at a few
hundred XP a week. Pick one:

1. **Keep the curve, and cap the bag ladder at level 50** (bag 11). Add bags
   12 to 20 later as holiday or challenge rewards. Least change.
2. **Flatten the curve after level 20**: each level costs a flat 2,000 XP, so
   level 80 is about 160k XP. Still a long goal.
3. **Unlock every 2 levels after level 5** (bags 6 to 20 at levels 7, 9, ...,
   35). Level 35 is about 60k XP, a year or two of steady use.

Recommendation: **option 3**. It reaches all 20 bags in a realistic time and
keeps the early game the same as the user described. The unlock table below is
data, so changing the spacing is a one-line edit.

## Unlock table (default: option 3, `BAG_LEVELS`)

| Bag | Level | Theme (suggested)     | Example finds                              |
| --- | ----- | --------------------- | ------------------------------------------ |
| 1   | 1     | Starter (today's bag) | the existing 24 toys                       |
| 2   | 2     | Garden                | watering can, gnome, snail, sunflower      |
| 3   | 3     | Ocean                 | shell, crab, surfboard, treasure chest     |
| 4   | 4     | Kitchen               | whisk, teapot, cupcake, frying pan         |
| 5   | 5     | Music                 | maracas, trumpet, vinyl, microphone        |
| 6   | 7     | Sports                | soccer ball, tennis racket, trophy cup     |
| 7   | 9     | Space                 | astronaut helmet, planet, comet, satellite |
| 8   | 11    | Spooky (all year)     | candle, potion, crystal ball, bat plush    |
| 9   | 13    | Retro tech            | floppy disk, cassette, joystick, CRT       |
| 10  | 15    | Farm                  | tractor, hay bale, chick, milk can         |
| 11  | 17    | Camping               | lantern, marshmallow, compass, canoe       |
| 12  | 19    | Art studio            | easel, palette, clay pot, crayons          |
| 13  | 21    | Science lab           | microscope, beaker, magnet, DNA model      |
| 14  | 23    | Winter                | sled, snow globe, mittens, igloo           |
| 15  | 25    | Jungle                | vine swing, parrot, banana, totem          |
| 16  | 27    | Castle                | shield, sword, banner, dragon egg          |
| 17  | 29    | Robots                | robot dog, gear, battery, circuit board    |
| 18  | 31    | Desert                | cactus, camel plush, sandcastle, scarab    |
| 19  | 33    | Sky                   | hot air balloon, cloud pillow, paper plane |
| 20  | 35    | Legendary vault       | only legendary finds, at boosted odds      |

Each bag has about 12 to 24 toys across the four rarities, and the toys use
emoji like today's. The holiday toys (rarity `event`) are not part of any
bag's catalogue. They keep turning up during their event, whichever bag is
active, and are filed under bag 1 so nothing about them changes.

## Data and storage

**Keep toy ids globally unique** (`/^[a-z]+$/`, as `parseBag` requires). Then
nothing stored today changes shape:

- `petBag` (id -> found), `petBagSpent` (id -> traded) and `petUnlocks` stay
  as they are, and `BagStore`'s merge-across-windows logic carries over.
- Which bag a toy belongs to comes from the catalogue, not from storage.
- Existing users: all their toys are in bag 1 (Starter). No migration.

**New stored value**: the active bag id, in extension globalState under
`petActiveBag`. It goes in `BagStore` with a `get/setActiveBag` pair, so every
window uses the same bag. A bag id is a string such as `starter` or `garden`,
validated against the catalogue. Anything unknown, or a bag not yet unlocked,
falls back to `starter`.

**Shop purchases** keep the `petUnlocks` format, namespaced by bag:
`garden.idle.watering`, `ocean.food.sushi`, `music.furniture.jukebox`. Widen
`parseUnlocks`' regex to allow a third segment, and keep accepting the
existing two-part ids, which belong to bag 1. Rooms, themes and styles bought
in a shop use the same ids, e.g. `garden.room.shed`, `garden.theme.leafy` and
`garden.style.crown`. What a pack gives free on unlock is worked out from the
level, as furniture is today, so it is never stored.

**Houses**: `petHouse` grows from one room to many. Today it holds
`{ items, theme, themeAt }`; it becomes:

```ts
interface HouseLayout {
  /** Where you were last: shared by every window, newest wins. */
  at: { house: string; room: string; changedAt: number };
  /** house id -> room id -> that room's layout. */
  houses: Record<string, Record<string, { items: HouseItem[]; theme: string; themeAt: number }>>;
}
```

- **Migration**: `parseLayout` reads the old shape as `houses.starter.living`,
  so existing rooms come across untouched.
- `mergeLayouts` merges room by room, using today's per-item and theme rules.
  Each room is independent, so two windows decorating different rooms never
  clash.
- Unknown house or room ids are dropped, as unknown furniture is today.

## Code changes

### `media/scene.js`

- `TOYS` becomes `BAGS`: `[{ id, name, emoji, toys: [...] }]`. Keep `TOYS`
  as a derived flat list, because the tooltip, `setBag`, the collection
  counts and the tests use it.
- `rollToy(rand)` -> `rollToy(rand, bagId)`: roll the rarity, then pick from
  the active bag's toys of that rarity. If the bag has none of that rarity,
  re-roll from its lowest rarity.
- `find()` reads the active bag from a new api hook, `activeBag()`.
- The Legendary vault boosts legendary odds with a per-bag `RARITY` weight
  override (`bag.weights`).
- `spareOf(rarity)` and `spend()` gain a `bagId`, so each shop only takes
  that bag's spares.

### `media/variants.js`

- Hobbies and variants gain a `bag` field (e.g. `bag: 'garden'`). Extend
  `owned()` the way `shop` gating works today: a `bag` animation needs its bag
  unlocked; a `bag` plus `shop` one also needs buying from that bag's shop.
- `shopActions()` takes a bag id.
- Themed props and scenery (watering can, periscope, chef hat...) go in
  `pets.js` PROPS and the `scene.js` scenery list. The variants test already
  checks every prop and scenery name exists.

### `media/house.js`

- `FURNITURE` and `THEMES` gain a `bag` field. New `HOUSES` lists each house
  with its rooms (`{ id, name, emoji, bag, rooms: [{ id, name, kind, free }] }`).
  `free` rooms come with the bag; the others are sold in its shop.
- The room drawing reads the active room's theme. Each house can also set
  its own window style (porthole, greenhouse glass, moon-base viewport).
- `target()` uses the room's `kind`: bed -> the bed, food -> the bowl,
  play -> toys that are out.
- `catalogue()` reports houses, rooms, furniture and themes, each with
  unlocked/bought flags, for the strip.

### `media/pets.js`

- A new `STYLES` set, drawn like `COSTUMES` (one per bag, plus color
  variants). `compose()` takes `expr.style`. The order is the user's own
  accessory, then a holiday costume, then the style.

### `media/panels.js`

- **House strip**: a house picker (emoji buttons) and room tabs above the
  furniture row. Locked houses and rooms show 🔒 and how to get them (a level,
  or a bag's shop).
- **Collection tab**: a "Pet style" row to pick the style (or none).
- **Bag picker** at the top of the 🎒 panel: a row of bag emoji buttons
  (locked ones show 🔒 and "level N"). Picking one sends `bag-switch`.
- The **Toys**, **Collection** and **Shop** tabs show only the active bag.
- The bag title reads `🌻 Garden - 7/18 found`, with an `x/20 bags` hint.
- `shopItems()` takes the active bag. Each bag lists its own animations,
  foods and furniture, priced in its own spares.

### `src/bag-store.ts`

- `getActiveBag(level)` / `setActiveBag(id)`. The bag catalogue's ids and
  levels need to be known extension-side for validation. Put them in
  `src/bags.ts`, `BAG_LEVELS: Array<{ id: string; level: number }>`, the
  single source the webview receives in `init` (as the house catalogue
  could). Toys and emoji stay in `scene.js`.

### `src/protocol.ts`

- In: `{ command: 'bag-switch'; bag: string }`, validated against
  `BAG_LEVELS`.
- Out: `active bag` in `init` state and in the `unlocks` sync message, so
  other windows follow a switch within the sync tick.

- `house-save` carries the whole multi-house layout. `parseLayout` is what
  checks it, as today.

### `src/PeonViewProvider.ts`

- Handle `bag-switch`: check the bag is unlocked at the current level
  (`progress.snapshot().level`), save it, then post it back.

### `src/house-store.ts`

- The multi-house `parseLayout` (with the old-shape migration) and the
  room-by-room `mergeLayouts`. `BAG_LEVELS` in `src/bags.ts` also lists each
  bag's house and room ids, so the store can drop unknown ones.

### `src/pet-config.ts` and `package.json`

- The `pet-agents.style` setting. Its enum stays in step with `STYLES` keys,
  enforced by a test like the accessory one.

### Levels and the rest

- `progress.ts`: `bagsUnlocked(level)` from `BAG_LEVELS`. The level panel's
  "next" line also names the next bag ("next: 🌊 Ocean bag at level 3").
- Level-up banner: "⭐ Level 5! New bag: 🎵 Music".
- With `pet-agents.levels` off, every bag is open, as furniture is.
- New challenge: `{ id: 'collector', text: 'Find 3 toys in a new bag' }`.

## Settings

- **`pet-agents.style`** (string, default `none`): the pet style picked in
  the Collection tab.
- Everything else hangs off existing switches: bags and animations off
  toys (`pet-agents.toys`) and levels (`pet-agents.levels`), houses and
  rooms off `pet-agents.house`.
- With levels off, every pack is open.

## Tests to add

- `scene`:
  - Finds only come from the active bag.
  - A bag missing a rarity still returns a toy.
  - Event toys still turn up during their event in any bag.
  - Toy ids are unique across all bags.
- `bag-store`: the active bag survives reloads, falls back to `starter` when
  locked or unknown, and merges across windows.
- `protocol`: `bag-switch` is validated, and unknown or locked bags are
  rejected.
- `progress`: the unlock table covers 20 bags, levels rise, and level 1 has
  exactly one bag.
- Webview behavior:
  - The picker shows locked bags with their level.
  - Switching changes the toys, collection and shop tabs.
  - A shop only spends spares from its own bag.
- `variants`: a `bag` animation never plays before its bag is unlocked;
  a bag-and-shop one needs both; every themed prop and scenery exists.
- `house-store`:
  - The old single-room layout migrates to `starter.living` unchanged.
  - Rooms merge independently.
  - Unknown houses and rooms are dropped.
- `house`: each room `kind` steers the pet to the right furniture, and with
  nothing suitable placed it wanders as now.
- `pets-art`: every style shows on every species, and gives way to the
  user's accessory and to a holiday costume.
- `pet-config` and manifest: `pet-agents.style` is read, documented and its
  enum matches `STYLES`.
- Webview behavior:
  - Switching house and room changes what is drawn and saved.
  - A locked room can't be entered.
  - Picking a style posts the setting.
- Manifest: README documents bags, houses and styles.

## Build order

1. `src/bags.ts`, the `BagStore` active bag, and the protocol and provider
   wiring, with tests.
2. `scene.js` catalogue split and per-bag rolls. Bag 1 is exactly today's
   toys, so nothing changes for current users. Tests.
3. Panel bag picker and per-bag tabs. Tests.
4. Per-bag shops (namespaced unlock ids, per-bag spares). Tests.
5. Bag-gated animations in `variants.js` (+ props and scenery). Tests.
6. Multi-house layout with migration, room tabs, room kinds. Tests.
7. Pet styles: `STYLES`, the setting, the Collection row. Tests.
8. Content: packs for bags 2 to 5 first (reachable in the first week), then
   the rest in batches of three or four. Each pack: toys, animations, a house
   and its rooms, furniture, themes and a style.
9. README section, CHANGELOG, `npm run media` for screenshots of bags, a
   house tour and the styles.
