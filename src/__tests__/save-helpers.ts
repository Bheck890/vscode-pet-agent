import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BagStore } from '../bag-store';
import { HouseStore } from '../house-store';
import { CareStore } from '../pet-care';
import { ProgressService } from '../progress-service';
import { ProgressStore } from '../progress-store';
import { PetLook, Profiles } from '../profiles';
import { Slots } from '../slot';
import { Storage, scoped } from '../storage';

export function memory(): Storage & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: <T>(key: string) => data[key] as T | undefined,
    update: (key: string, value: unknown) => {
      if (value === undefined) {
        delete data[key];
      } else {
        data[key] = JSON.parse(JSON.stringify(value));
      }
      return Promise.resolve();
    },
  };
}

export const LOOK: PetLook = {
  species: 'fox',
  color: '#e8772e',
  accentColor: '',
  eyeColor: '',
  pattern: 'socks',
  accessory: 'scarf',
  accessoryColor: '',
  name: 'Rusty',
  style: 'flowerCrown',
};

/** A save wired like extension.ts: slot-scoped stores, profiles in a temp folder. */
export function makeSave(opts: { storage?: Storage & { data: Record<string, unknown> } } = {}) {
  const storage = opts.storage ?? memory();
  let now = new Date(2026, 9, 19, 12);
  const clock = () => now;
  let look = { ...LOOK };
  const slots = new Slots(storage, clock, () => look.name);
  const save = scoped(storage, () => slots.current().id);
  const stores = {
    bag: new BagStore(save),
    house: new HouseStore(save),
    care: new CareStore(save),
    progress: new ProgressStore(save),
  };
  const progress = new ProgressService(stores.progress, clock, () => slots.current());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-profiles-'));
  const profiles = new Profiles({
    storage,
    dir,
    slots,
    stores,
    look: () => look,
    levelsOn: () => true,
    now: clock,
  });
  return {
    storage,
    slots,
    stores,
    progress,
    profiles,
    dir,
    setNow: (d: Date) => (now = d),
    setLook: (l: Partial<PetLook>) => (look = { ...look, ...l }),
  };
}
