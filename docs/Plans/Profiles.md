# Plan: finishing, sharing, and save slots (profiles)

Status: built. Holiday toys carry over into a new save (the open question below). Comes
after [Bags.md](Bags.md), whose last
bag unlock is the finish line.

## The idea

1. **You finished!** When the last bag unlocks, the pet throws a party and a
   finish screen sums up the save: days played, prompts, XP, toys found,
   records set, houses and rooms furnished.
2. **Share with friends.** From that screen, copy a text summary or save a
   share card image. Nothing is sent anywhere unless you click a post button
   yourself.
3. **Start another save?** The whole save is written to a profile file and
   frozen. A fresh save starts at level 1.
4. **Old saves live in the house menu.** The 🏠 house picker gets a
   **Profiles** row. Picking an old profile visits it: its pet, still alive
   in its houses and rooms, read-only. The only way back to an old save is
   through that row.
5. **Swap profiles with friends.** Export a profile to a file and send it.
   A friend imports it as a 👋 guest house they can visit, and your pets can
   invite each other over.
6. **Move to another computer.** Carry your live save to a new machine in a
   `.petsave` file, locked with a password if you want one.

## When "finished" happens

- **Finished** = the level that unlocks bag 20 (whatever spacing
  [Bags.md](Bags.md)'s open question settles on).
- `progress.ts` gets `FINISH_LEVEL`, worked out from `BAG_LEVELS`, so the two
  can't disagree.
- Reaching it once records a fact, `finish:<slot>`. The finish screen shows
  once, then stays one click away as a 🏁 **Finished** button in the level
  panel.
- Levelling past the finish keeps going (XP never stops), but nothing new
  unlocks.
- **100% badge**: finding every toy in every bag adds a 💯 to the save's card.
  Optional, and not part of finishing.

## The finish screen (webview)

- A full-panel overlay (`#finish-panel`), in the same style as the other
  panels, drawn over a confetti burst.
- **Contents:**

  ```
  🏆 You finished Pet Agents!
  Rusty the fox - 412 days - level 35 - 61,240 XP
  2,318 prompts - 9,870 actions - 214h with your agent
  🧸 403/412 toys - 🏠 20 houses, 57 rooms - 🏆 31 weekly records
  [📋 Copy summary]  [🖼️ Save share card]  [➕ Start a new save]  [Later]
  ```

- The card never shows prompt text, file names or repo names. It only shows
  numbers, the pet's name and look, and the bags. This holds even with
  `pet-agents.recordsShowPrompts` on.

### Sharing (no network unless you ask)

- **📋 Copy summary**: a few lines of text plus an emoji badge row, put on the
  clipboard by the extension (`vscode.env.clipboard.writeText`).
- **🖼️ Save share card**: the webview draws a 1200x630 card on an offscreen
  canvas (the pet sprite at 8x scale, the stats, the badges) and sends the PNG
  bytes over. The extension asks where to save it (`showSaveDialog`) and
  writes it.
- **Post buttons (optional)**: open the user's browser at a pre-filled post on
  X or Bluesky (`vscode.env.openExternal` with an intent URL holding the
  summary text). Only on click; the README says so, and they can be hidden
  with `pet-agents.shareButtons: false`.

## Save slots

### What a profile file holds

When a save ends, everything that belongs to it is written to
`<globalStorageUri>/profiles/<slotId>.json`, the extension's own storage
folder on disk:

```ts
interface ProfileFile {
  version: 1;
  id: string; // slot id, e.g. "2026-10-19-rusty"
  name: string; // "Rusty's first save"; renamable
  createdAt: number;
  endedAt: number;
  finished: boolean; // false if started over before finishing
  pet: {
    // the look, copied from settings
    species: string;
    color: string;
    accentColor: string;
    eyeColor: string;
    pattern: string;
    accessory: string;
    accessoryColor: string;
    name: string;
    style: string;
  };
  progress: {
    xp: number;
    level: number;
    facts: Record<string, Fact>;
    banked: Record<string, number>;
  };
  bag: {
    found: Record<string, number>;
    spent: Record<string, number>;
    unlocks: string[];
    activeBag: string;
  };
  house: HouseLayout; // every house and room
  care: CareStats;
  summary: FinishSummary; // the numbers on the card
}
```

- The file is written once and never changed after that, except for its
  `name`.
- An index of the profiles (id, name, finished, endedAt, summary) sits in
  globalState under `petProfiles`, so the house menu doesn't read every file.
  If the index and the folder disagree, rebuild the index from the folder.

### What carries over to the new save

| Starts fresh                       | Carries over                                                                |
| ---------------------------------- | --------------------------------------------------------------------------- |
| XP, level, challenges              | prompt records and hall of fame (they are about you, not the pet)           |
| the bag, trades and shop purchases | settings, including the pet's look (change it for the new save if you like) |
| houses, rooms and furniture        | a 🏅 badge per finished save, shown in the level panel                      |
| care stats (start at 80)           |                                                                             |

Open question: should holiday toys carry over? They can only be found during
their event, so losing them stings. Recommendation: **yes**. Copy `rarity:
'event'` toys into the new bag.

### Starting a new save safely across windows

Several windows share globalState, and some stores merge by taking the
larger value (the bag), so a stale window could push old counts into the new
save. To stop that:

- **`petSlot`**: `{ id, startedAt }` in globalState. Every store keys its
  data under the slot:
  - **Data keys:** `petBag` becomes `petBag:<slot>`, and so on.
  - **The old slot:** it moves to its profile file, and its keys are left
    alone. The global storage rules call for soft deletes, so they are
    removed only after the profile file has been written and read back.
- **Messages carry the slot**: `save-state`, `house-save` and `bag-switch`
  include the slot id. The provider drops anything from a different slot and
  sends that window a fresh `init`.
- **Facts check the time**: `ProgressService` ignores facts dated before
  `petSlot.startedAt`. A transcript replay or backfill can't pay XP into the
  new save for prompts from the old one.
- **Other windows follow**: the sync tick sees the new `petSlot` and reloads
  the view (`refresh()`).

### Starting a new save before finishing

- ⚙️ settings gets **Start a new save...**, behind a modal confirm ("Rusty's
  save will be stored as a profile you can visit from the house menu").
- The profile is marked `finished: false`.
- A command, `Pet Agents: Start a New Save`, does the same.

## Visiting old profiles: your earlier pets (house menu)

Every earlier save keeps its pet, and you can always go back and see it.

- The 🏠 strip's house picker gets a **Profiles** row: the current save
  first, then the old ones, newest first, each with its pet's sprite and
  🏁/💯 badges.
- **Visiting** an old profile:
  - **What's shown:** its pet (drawn from the archived look, so the sprite
    code stays as it is), its houses and rooms, and a banner: "Visiting
    Rusty's save (finished Aug 2027). 🏠 to come home".
  - **The old pet is alive, not a picture.** It idles, does its hobbies
    (including the ones that save unlocked), naps in its own bed, plays with
    the toys from its own bag, and wears its own style.
  - **You can still pet it:** hearts and its happy reaction play, and it
    remembers you. Its tooltip shows its name, level, how long you had it,
    and "last seen <date>".
  - **Read-only:** furniture can't move, no XP is earned, and no toys turn
    up. Care stats are frozen as they were (and never decay), so the care
    buttons are off with a note: "Rusty is happy just to see you".
  - **Invite it over** (optional): a button brings that old pet to visit
    your current pet's house as a mini pet. It wanders, naps and plays
    alongside, like a background pet, until you send it home. It is purely
    for looks: no XP and no toys.
  - **Coming home:** an agent starting work brings you home, as the house
    does today.
- Profiles can be renamed and hidden (soft delete: `hidden: true` in the
  index; the file stays on disk). **Show hidden** brings them back.

## Share a profile with a friend (planned)

- **Export**: **Share this profile...** on any profile (current or old) writes
  `<pet name>.petprofile.json` wherever you pick. A command does the same:
  `Pet Agents: Export Profile`.
  - Prompt-free by construction: turns and records are never in a profile.
  - It also leaves out your machine paths, repo names and settings other
    than the pet's look. A test checks the exported file for paths and
    repo-like strings.
- **Import**: **Add a friend's profile...** in the Profiles row, or
  `Pet Agents: Import Profile`, reads a `.petprofile.json`.
  - It is validated with the same parsers the stores use: unknown toys,
    furniture, houses and styles are dropped, and a bad file is rejected
    whole with a message.
  - It is size-capped (1 MB) and stored under `profiles/guests/<id>.json`.
- **Guest houses**: imported profiles sit in their own **👋 Friends** part of
  the Profiles row and are visited the same way as your own old saves. The
  friend's pet is alive in its house, can be petted, and you can invite it
  over to play with your pet. All read-only, and nothing earns XP.
- **Updating a friend**: importing the same profile id again replaces the
  guest copy (newer `endedAt` wins), so friends can send you their progress
  as it grows.
- **Removing a friend** hides the guest (soft delete, like your own
  profiles).
- **No network**: friends swap files however they like (chat, email, a
  shared drive).

## Move your pet to another computer (optional password)

Different from sharing with a friend: a move carries your **live, playable
save** to a new machine, and the pet carries on there. A password is
optional, and with one the file is encrypted.

### Moving out (old computer)

- **Move my pet to another computer...** in ⚙️, or the
  `Pet Agents: Move Pet to Another Computer` command.
- **Asks for a password** (optional): `showInputBox({ password: true })`,
  typed twice, at least 8 characters. Leave it empty for no password.
  - It warns that the password can't be recovered: there is no reset and no
    copy anywhere.
- **Saves the move file**, `<pet name>.petsave`, wherever you pick (a USB
  stick, a cloud drive, an email to yourself).
- **What's in it**: the whole live save, everything a profile has, plus the
  prompt records and hall of fame. The archived profiles and friends' guest
  houses come too, as an option, ticked by default.
- **Prompt text only travels encrypted**: without a password the records
  keep their numbers but lose their prompt previews.
- **The old computer lets go**: once the file is written and read back
  successfully, the save there becomes a profile marked **moved** ("Rusty
  moved to another computer on <date>"), visitable like any old save. A
  fresh save starts in its place.
  - This stops two copies of the same pet drifting apart.
  - Cancelling at any step changes nothing.

### Moving in (new computer)

- **Bring my pet here...** in ⚙️, or `Pet Agents: Bring Pet from Another
Computer`, picks the `.petsave` file and asks for the password if the
  file has one.
- **Wrong password or a damaged file**: "Wrong password, or the file is
  damaged". Nothing is changed. AES-GCM tells the two apart from a good file
  but not from each other, so the message covers both.
- **Validated** with the same parsers as everything else. Unknown items are
  dropped, and a file from a newer version of the extension is refused with
  "update Pet Agents first".
- **If this computer already has a save with progress**, ask first: "Keep
  Biscuit as a profile and bring Rusty here?" Never overwrite silently.
- **The pet's look comes along**: its look is written back into
  `pet-agents.*` settings, so it looks the same on the new machine.
- **Bringing the same pet back** (its slot id is already here as a moved
  profile) revives it: the newer save wins.

### The file

```ts
// Without a password
{ format: 'pet-agents-save', version: 1, encrypted: false, save: MoveSave }

// With a password
{
  format: 'pet-agents-save', version: 1, encrypted: true,
  kdf: { name: 'scrypt', N: 32768, r: 8, p: 1, salt: '<base64, 16 bytes>' },
  cipher: { name: 'aes-256-gcm', iv: '<base64, 12 bytes>', tag: '<base64>' },
  data: '<base64 ciphertext of the MoveSave JSON>',
}
```

- **Built-in crypto only**: Node's `crypto` (`scryptSync` with `maxmem`
  raised to 64 MB, then `createCipheriv('aes-256-gcm')`). No new dependency.
- **Fresh salt and IV every move**.
- **The header is authenticated too**: the `format`, `version` and `kdf`
  fields are passed as GCM additional data, so changing them breaks the
  decryption.
- **The password stays in the extension**: it never goes to the webview or
  the log, and isn't kept after the export or import finishes.
- **Size cap**: 5 MB on import.
- **Not a backup service**: nothing is uploaded. VS Code Settings Sync could
  carry globalState, but that would sync prompt previews in the clear, so
  this plan doesn't use it.

## Code changes

| Where                                     | What                                                                                                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/profiles.ts` (new)                   | `ProfileFile` type, `parseProfile`, `archive(slot)`, `startNewSave()`, index rebuild                                                                                                                                             |
| `src/storage.ts`                          | a slot-scoped `Storage` wrapper (`scoped(storage, slotId)`) the stores use, so they stay unchanged                                                                                                                               |
| `src/progress.ts` / `progress-service.ts` | `FINISH_LEVEL`, the `finish:` fact, ignoring facts from before the slot started                                                                                                                                                  |
| `src/protocol.ts`                         | in: `slot` on save-type messages, `share-copy`, `share-card` (PNG bytes, size-capped), `new-save`, `visit-profile`; out: `profiles` (index), `profile` (one archived save for a visit), `finished`                               |
| `src/PeonViewProvider.ts`                 | routing for the above; `showSaveDialog` and the clipboard                                                                                                                                                                        |
| `src/extension.ts`                        | the `pet-agents.newSave`, `pet-agents.shareProgress`, `pet-agents.exportProfile`, `pet-agents.importProfile`, `pet-agents.movePet` and `pet-agents.receivePet` commands (in `package.json`; the manifest test checks they match) |
| `media/finish.js` (new)                   | the finish overlay, the confetti party, the share card drawing                                                                                                                                                                   |
| `media/house.js`                          | the Profiles row with 👋 Friends; visit mode (read-only layout, the old pet alive in its house)                                                                                                                                  |
| `media/panels.js`                         | the 🏁 button in the level panel; **Start a new save...** in ⚙️                                                                                                                                                                  |
| `package.json` / README                   | the `pet-agents.shareButtons` setting and the two commands                                                                                                                                                                       |

## Tests to add

- `profiles`:
  - Archiving writes a file that parses back the same.
  - The index is rebuilt from the folder.
  - A hidden profile stays on disk.
  - A corrupt or foreign file is rejected with no partial import.
- **Slot safety**:
  - After a new save, a stale `save-state` from an old slot is dropped.
  - Bag merges can't resurrect old counts.
  - Facts dated before the slot don't count.
  - A turn replayed from the old save pays nothing.
- `progress`: `FINISH_LEVEL` equals the last bag's level, and the finish
  fact is written once.
- `protocol`:
  - Every new message is checked.
  - `share-card` rejects oversized or non-PNG data.
  - `visit-profile` rejects unknown ids.
- **Share text**: no prompt text, file names or repo names, even with
  previews on.
- **Webview behavior**:
  - The finish screen shows once at the finish level.
  - Visit mode can't move furniture, care or find toys.
  - Agent work brings you home from a visit.
  - The Profiles row lists saves newest first, friends after.
  - A visited old pet idles, naps in its own bed and can be petted, while
    its care stats stay frozen.
  - An invited pet appears as a mini pet and leaves when sent home.
- **Export and import**:
  - An exported file has no prompt text, paths or repo names.
  - It imports back the same.
  - A friend's file with unknown items keeps the rest.
  - A corrupt, oversized or wrong-version file is rejected whole.
  - Re-importing a newer copy replaces the older one.
- `manifest`: the new commands are contributed and registered; the new
  setting is read and documented.

### Move tests

- Round trip with and without a password gives the same save.
- A wrong password, a flipped byte in `data`, `tag`, `iv` or the header,
  and a truncated file are all rejected, and the existing save is untouched.
- Without a password, no prompt previews are in the file; with one, they
  survive the trip.
- The old computer's save only turns into a **moved** profile after the file
  has been written and read back.
- Importing over a save with progress asks first; bringing back the same
  slot id keeps the newer copy.
- The password never reaches the webview, the log or storage (spy on
  `postMessage`, the log and `Storage.update`).
- A future `version` is refused with the update message.

## Build order

1. Slot-scoped storage and `petSlot`, with no visible change yet. Every store
   moves under the slot, and existing data becomes slot one, migrated in
   place. Tests.
2. `profiles.ts`: archiving, the index and the new-save flow from ⚙️ and the
   command. Tests.
3. Visiting profiles from the house menu (read-only), with the old pet
   alive in its house. Then inviting it over. Tests.
4. Finishing: `FINISH_LEVEL`, the party and the finish screen. Tests.
5. Sharing: copy summary, then the share card PNG, then the optional post
   buttons. Tests.
6. Export and import: share a profile, friends' guest houses, updating
   and removing a friend. Tests.
7. Moving to another computer: the `.petsave` format, then the optional
   password (scrypt + AES-256-GCM), then the moved-profile hand-off. Tests.
8. README section, CHANGELOG, `npm run media` for the finish screen and a
   profile visit.
