import * as vscode from 'vscode';
import { PetConfig, readPetConfig } from './pet-config';

export function getConfig(): PetConfig {
  const cfg = vscode.workspace.getConfiguration('pet-agents');
  return readPetConfig((key) => cfg.get(key));
}

/** Saves a pet setting for every workspace. `undefined` resets it to the default. */
export function saveSetting(key: string, value: unknown): Thenable<void> {
  return vscode.workspace
    .getConfiguration('pet-agents')
    .update(key, value, vscode.ConfigurationTarget.Global);
}
