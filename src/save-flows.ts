import * as fs from 'fs';
import {
  MIN_PASSWORD,
  MOVE_MAX_BYTES,
  MoveSave,
  decodeMove,
  encodeMove,
  isEncrypted,
} from './move-file';
import type { ProgressService } from './progress-service';
import type { Completion } from './bag-store';
import { FinishSummary, GUEST_MAX_BYTES, LOOK_KEYS, PetLook, Profiles } from './profiles';
import type { RecordsStore } from './records-store';
import { Companion, isHelper, lookSettingKey } from './pet-config';
import type { Slots } from './slot';

/** The prompts and dialogs the flows need, so tests can answer them. */
export interface PetUi {
  /** A modal yes/no; true for `yes`. */
  confirm(message: string, detail: string, yes: string): Thenable<boolean>;
  /** An input box; undefined if cancelled. */
  ask(prompt: string, opts?: { password?: boolean; value?: string }): Thenable<string | undefined>;
  choose(title: string, options: string[]): Thenable<string | undefined>;
  saveFile(name: string, filters: Record<string, string[]>): Thenable<string | undefined>;
  openFile(filters: Record<string, string[]>): Thenable<string | undefined>;
  copy(text: string): Thenable<void>;
  openUrl(url: string): Thenable<boolean>;
  info(message: string): void;
  error(message: string): void;
}

export interface FlowDeps {
  profiles: Profiles;
  progress: ProgressService;
  records: RecordsStore;
  slots: Slots;
  ui: PetUi;
  look: () => PetLook;
  saveSetting: (key: string, value: unknown) => Thenable<void>;
  /** Whether a pet or a helper is playing; each has its own save. */
  companion: () => Companion;
  now: () => Date;
  log: { info(m: string): void; warn(m: string): void };
  /** The save changed under the view (a new save, a pet moved in): rebuild it. */
  saveChanged: () => void;
  /** The profile list changed: send it to the view. */
  profilesChanged: () => void;
}

export const SHARE_SITES = {
  x: (text: string) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
  bluesky: (text: string) => `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`,
};
export type ShareSite = keyof typeof SHARE_SITES;

const n = (v: number) => Math.round(v).toLocaleString('en-US');

/**
 * The share text: numbers, the pet's name and species, and badges. Built
 * from the summary alone, so no prompt text, file or repo name can get in.
 * 💯 is every toy and every shop item; ✅ every toy (holiday toys never count).
 */
export function shareText(
  look: Pick<PetLook, 'name' | 'species'>,
  s: FinishSummary,
  finished: boolean,
  toyTotal: number,
  complete: Completion = '',
): string {
  const toys = toyTotal > 0 ? `${n(s.toys)}/${n(toyTotal)}` : n(s.toys);
  const badges = [
    finished ? '🏁' : '',
    complete === 'all' ? '💯' : complete === 'items' ? '🧸✅' : '',
    `🎒x${s.bags}`,
    `⭐x${s.level}`,
  ].filter(Boolean);
  return [
    finished ? '🏆 I finished Pet Agents!' : '🐾 My Pet Agents save',
    `${look.name} the ${look.species} - ${n(s.days)} days - level ${s.level} - ${n(s.xp)} XP`,
    `${n(s.prompts)} prompts - ${n(s.actions)} actions - ${n(s.agentHours)}h with my agent`,
    `🧸 ${toys} toys - 🏠 ${s.houses} houses, ${s.rooms} rooms - 🏆 ${n(s.records)} weekly records`,
    badges.join(' '),
  ].join('\n');
}

/** A file name from the pet's name, safe on every OS. */
function fileName(name: string, ext: string): string {
  return `${name.replace(/[^\w -]+/g, '').trim() || 'pet'}${ext}`;
}

/**
 * The longer journeys that leave the panel: starting a new save, sharing,
 * swapping profiles with friends and moving the pet to another computer.
 * Cancelling at any step changes nothing. Passwords stay in local variables
 * here: never logged, stored, or sent to the view.
 */
export class SaveFlows {
  constructor(private readonly deps: FlowDeps) {}

  private finished(): boolean {
    return this.deps.progress.snapshot().finished;
  }

  private fail(what: string, err: unknown): void {
    this.deps.log.warn(`${what} failed: ${err instanceof Error ? err.message : String(err)}`);
    this.deps.ui.error(`Pet Agents: ${what} failed. Nothing was changed.`);
  }

  async newSave(): Promise<void> {
    const { ui, profiles, look } = this.deps;
    const name = look().name;
    const ok = await ui.confirm(
      `Start a new save?`,
      `${name}'s save will be stored as a profile you can visit from the house menu. ` +
        'The new save starts at level 1; your prompt records and settings stay.',
      'Start a new save',
    );
    if (!ok) {
      return;
    }
    try {
      profiles.startNewSave(this.finished());
    } catch (err) {
      this.fail('Starting a new save', err);
      return;
    }
    this.deps.log.info('Started a new save');
    this.deps.saveChanged();
  }

  /**
   * Back to level 1 and the welcome screen, to pick the pet again. A save
   * with progress can be kept as a profile or left out of the house menu.
   */
  async startOver(): Promise<void> {
    const { ui, profiles, look } = this.deps;
    const name = look().name;
    let keep = false;
    if (profiles.hasProgress()) {
      const KEEP = `Keep ${name}'s save as a profile to visit`;
      const DROP = `Start over without keeping ${name}'s save`;
      const pick = await ui.choose(
        `Start over at level 1? Your prompt records and settings stay.`,
        [KEEP, DROP],
      );
      if (!pick) {
        return;
      }
      keep = pick === KEEP;
    }
    try {
      if (keep) {
        profiles.startNewSave(this.finished());
      } else {
        profiles.startOver();
      }
    } catch (err) {
      this.fail('Starting over', err);
      return;
    }
    this.deps.log.info(keep ? 'Started over, keeping the old save' : 'Started over');
    this.deps.saveChanged();
  }

  /** The text for sharing. `toyTotal` is the webview's catalogue size. */
  summaryText(toyTotal: number): string {
    const { profiles } = this.deps;
    return shareText(
      this.deps.look(),
      profiles.summary(),
      this.finished(),
      toyTotal,
      profiles.completion(),
    );
  }

  async copySummary(toyTotal: number): Promise<void> {
    await this.deps.ui.copy(this.summaryText(toyTotal));
    this.deps.ui.info('Pet Agents: summary copied to the clipboard.');
  }

  /** Opens the user's browser at a pre-filled post; only ever on a click. */
  async post(site: ShareSite, toyTotal: number): Promise<void> {
    await this.deps.ui.openUrl(SHARE_SITES[site](this.summaryText(toyTotal)));
  }

  async saveCard(png: Buffer): Promise<void> {
    const file = await this.deps.ui.saveFile(
      fileName(`${this.deps.look().name} pet agents`, '.png'),
      {
        'PNG image': ['png'],
      },
    );
    if (!file) {
      return;
    }
    try {
      await fs.promises.writeFile(file, png);
    } catch (err) {
      this.fail('Saving the share card', err);
    }
  }

  async exportProfile(id: string | null): Promise<void> {
    const { profiles, ui } = this.deps;
    const json = profiles.exportJson(id);
    const entry = id === null ? null : profiles.list({ hidden: true }).find((p) => p.id === id);
    if (!json) {
      return;
    }
    const name = entry ? entry.pet.name : this.deps.look().name;
    const file = await ui.saveFile(fileName(name, '.petprofile.json'), { 'Pet profile': ['json'] });
    if (!file) {
      return;
    }
    try {
      await fs.promises.writeFile(file, json, 'utf8');
      ui.info(`Pet Agents: saved ${name}'s profile. Send it to a friend to visit.`);
    } catch (err) {
      this.fail('Exporting the profile', err);
    }
  }

  async importProfile(): Promise<void> {
    const { profiles, ui } = this.deps;
    const file = await ui.openFile({ 'Pet profile': ['json'] });
    if (!file) {
      return;
    }
    let json: string;
    try {
      if ((await fs.promises.stat(file)).size > GUEST_MAX_BYTES) {
        ui.error('Pet Agents: that profile is too big (over 1 MB).');
        return;
      }
      json = await fs.promises.readFile(file, 'utf8');
    } catch (err) {
      this.fail('Reading the profile', err);
      return;
    }
    const result = profiles.importGuest(json);
    if (!result.ok) {
      ui.error(`Pet Agents: ${result.reason}`);
      return;
    }
    ui.info(`Pet Agents: ${result.profile.pet.name}'s house is in 👋 Friends in the house menu.`);
    this.deps.profilesChanged();
  }

  async rename(id: string, guest: boolean): Promise<void> {
    const entry = this.deps.profiles
      .list({ hidden: true })
      .find((p) => p.id === id && !!p.guest === guest);
    if (!entry) {
      return;
    }
    const name = await this.deps.ui.ask('Rename this profile', { value: entry.name });
    if (name && this.deps.profiles.rename(id, guest, name)) {
      this.deps.profilesChanged();
    }
  }

  /** Asks for an optional password, twice. Undefined if cancelled or they didn't match. */
  private async newPassword(): Promise<string | undefined> {
    const { ui } = this.deps;
    const first = await ui.ask(
      `Password for the move file (at least ${MIN_PASSWORD} characters), or leave it empty for none. ` +
        "It can't be recovered: there is no reset and no copy anywhere.",
      { password: true },
    );
    if (first === undefined || first === '') {
      return first;
    }
    if (first.length < MIN_PASSWORD) {
      ui.error(`Pet Agents: the password needs at least ${MIN_PASSWORD} characters.`);
      return undefined;
    }
    const again = await ui.ask('Type the password again', { password: true });
    if (again !== first) {
      if (again !== undefined) {
        ui.error("Pet Agents: the passwords didn't match.");
      }
      return undefined;
    }
    return first;
  }

  /**
   * Writes the live save to a `.petsave` file. Once the file has been
   * written and read back, the save here becomes a "moved" profile and a
   * fresh one starts, so two copies of the pet can't drift apart.
   */
  async moveOut(): Promise<void> {
    const { profiles, records, ui, slots, look, now } = this.deps;
    const password = await this.newPassword();
    if (password === undefined) {
      return;
    }
    const ALL = "Bring old profiles and friends' houses too";
    const extras = await ui.choose('What comes along?', [ALL, 'Just the pet']);
    if (!extras) {
      return;
    }
    const name = look().name;
    const file = await ui.saveFile(fileName(name, '.petsave'), { 'Pet save': ['petsave'] });
    if (!file) {
      return;
    }
    const finished = this.finished();
    const others = extras === ALL ? profiles.all() : { profiles: [], guests: [] };
    const move: MoveSave = {
      exportedAt: now().getTime(),
      slot: slots.current(),
      save: profiles.current(finished),
      records: records.exportAll() as unknown as MoveSave['records'],
      profiles: others.profiles,
      guests: others.guests,
    };
    try {
      await fs.promises.writeFile(file, encodeMove(move, password), 'utf8');
      const back = decodeMove(await fs.promises.readFile(file, 'utf8'), password);
      if (!back.ok || back.move.slot.id !== move.slot.id) {
        throw new Error('the move file did not read back');
      }
      profiles.startNewSave(finished, true);
    } catch (err) {
      this.fail('Moving the pet', err);
      return;
    }
    this.deps.log.info('Pet moved out to a file');
    ui.info(
      `Pet Agents: ${name} is packed and ready. On the other computer, use "Bring my pet here...". ` +
        `${name}'s save here is now a profile you can visit from the house menu.`,
    );
    this.deps.saveChanged();
  }

  /** Brings a pet from a `.petsave` file. Never overwrites a save with progress without asking. */
  async moveIn(): Promise<void> {
    const { profiles, records, ui, now } = this.deps;
    const file = await ui.openFile({ 'Pet save': ['petsave'] });
    if (!file) {
      return;
    }
    let text: string;
    try {
      if ((await fs.promises.stat(file)).size > MOVE_MAX_BYTES) {
        ui.error('Pet Agents: that file is too big to be a pet save.');
        return;
      }
      text = await fs.promises.readFile(file, 'utf8');
    } catch (err) {
      this.fail('Reading the pet save', err);
      return;
    }
    let password = '';
    if (isEncrypted(text)) {
      const typed = await ui.ask('This pet save has a password', { password: true });
      if (typed === undefined) {
        return;
      }
      password = typed;
    }
    const read = decodeMove(text, password);
    if (!read.ok) {
      ui.error(
        read.reason === 'version'
          ? 'Pet Agents: that pet save is from a newer Pet Agents. Update Pet Agents first.'
          : read.reason === 'damaged'
            ? "Pet Agents: that file isn't a pet save, or it is damaged."
            : 'Pet Agents: wrong password, or the file is damaged.',
      );
      return;
    }
    const { move } = read;
    // A helper moves into the helper's save, a pet into the pet's.
    const was = this.deps.companion();
    const mode: Companion = isHelper(move.save.pet.species) ? 'helper' : 'pet';
    if (mode !== was) {
      await this.deps.saveSetting('companion', mode);
    }
    const back = async () => {
      if (mode !== was) {
        await this.deps.saveSetting('companion', was);
      }
    };
    // The same pet coming back: whichever copy is newer wins.
    const local = profiles.load(move.slot.id);
    const save = local && local.endedAt > move.save.endedAt ? local : move.save;
    if (profiles.hasProgress() && this.deps.slots.current().id !== move.slot.id) {
      const ok = await ui.confirm(
        `Keep ${this.deps.look().name} as a profile and bring ${save.pet.name} here?`,
        `${this.deps.look().name}'s save will be stored as a profile you can visit from the house menu.`,
        `Bring ${save.pet.name} here`,
      );
      if (!ok) {
        await back();
        return;
      }
    }
    try {
      if (profiles.hasProgress() && this.deps.slots.current().id !== move.slot.id) {
        profiles.archive(this.finished());
      }
      profiles.install(move.slot, save);
      records.importAll(move.records.turns, move.records.fame, now());
      profiles.adopt(move.profiles, move.guests);
    } catch (err) {
      this.fail('Bringing the pet here', err);
      await back();
      return;
    }
    for (const key of LOOK_KEYS) {
      // Helpers have no bag styles.
      if (mode === 'helper' && key === 'style') {
        continue;
      }
      const v = save.pet[key];
      await this.deps.saveSetting(lookSettingKey(key, mode), v === '' ? undefined : v);
    }
    this.deps.log.info('Pet moved in from a file');
    ui.info(`Pet Agents: welcome home, ${save.pet.name}!`);
    this.deps.saveChanged();
  }
}
