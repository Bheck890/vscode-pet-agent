import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const PEON_DIR = path.join(os.homedir(), '.claude', 'hooks', 'peon-ping');
export const PEON_STATE_FILE = path.join(PEON_DIR, '.state.json');

const RAW = 'https://raw.githubusercontent.com/PeonPing/peon-ping/main';

/** One step of the settings panel's peon-ping guide; `command` gets a copy button. */
export interface GuideStep {
  text: string;
  command?: string;
}

export interface PeonGuide {
  installed: boolean;
  steps: GuideStep[];
  /** What peon-ping itself sends off the machine, from reading its source. */
  notes: string[];
}

/**
 * How to install peon-ping by hand, for this OS. Pet Agents never downloads
 * or runs it: the commands are only copied for the user to run, and the
 * installer is saved to a file first so it can be read before it runs.
 */
export function peonSteps(platform: string): GuideStep[] {
  if (platform === 'win32') {
    return [
      { text: 'Open a PowerShell terminal (Terminal > New Terminal works).' },
      {
        text: 'Download the installer to a file. Nothing runs yet.',
        command: `Invoke-WebRequest -Uri "${RAW}/install.ps1" -OutFile ".\\peon-install.ps1" -UseBasicParsing`,
      },
      { text: 'Read it first if you like.', command: 'notepad .\\peon-install.ps1' },
      {
        text: 'Run it. It installs into ~/.claude/hooks/peon-ping and adds hooks to ~/.claude/settings.json.',
        command: 'powershell -ExecutionPolicy Bypass -File .\\peon-install.ps1',
      },
      { text: 'Restart your agent. This panel shows ✅ within a minute.' },
      {
        text: 'To remove it later:',
        command: 'powershell -File "$env:USERPROFILE\\.claude\\hooks\\peon-ping\\uninstall.ps1"',
      },
    ];
  }
  return [
    { text: 'Open a terminal (Terminal > New Terminal works).' },
    {
      text: 'Download the installer to a file. Nothing runs yet.',
      command: `curl -fsSL ${RAW}/install.sh -o peon-install.sh`,
    },
    { text: 'Read it first if you like.', command: 'less peon-install.sh' },
    {
      text: 'Run it. It installs into ~/.claude/hooks/peon-ping and adds hooks to ~/.claude/settings.json.',
      command: 'bash peon-install.sh',
    },
    { text: 'Restart your agent. This panel shows ✅ within a minute.' },
    {
      text: 'To remove it later:',
      command: 'bash ~/.claude/hooks/peon-ping/uninstall.sh',
    },
  ];
}

export const PEON_NOTES = [
  'peon-ping is a separate open-source project (github.com/PeonPing/peon-ping). Pet Agents only reads the small status file it writes.',
  'Installing downloads its scripts and sound packs from GitHub.',
  'Once a day, when a session starts, it asks GitHub for its latest version number. Nothing about you is sent.',
  'Phone notifications (ntfy, Pushover, Telegram) are off unless you set them up. They carry the project name and status; ntfy.sh topics can be read by anyone who knows the name.',
  'Over SSH or in a dev container it talks to its own audio relay on your machine (localhost).',
];

export function peonGuide(platform: string, installed: boolean): PeonGuide {
  return { installed, steps: peonSteps(platform), notes: PEON_NOTES };
}

export function peonInstalled(dir = PEON_DIR): boolean {
  return fs.existsSync(dir);
}
