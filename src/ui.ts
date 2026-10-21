import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { PetUi } from './save-flows';

/** The flows' prompts and dialogs, as VS Code shows them. */
export const vscodeUi: PetUi = {
  confirm: async (message, detail, yes) =>
    (await vscode.window.showWarningMessage(message, { modal: true, detail }, yes)) === yes,
  ask: (prompt, opts = {}) =>
    vscode.window.showInputBox({
      prompt,
      password: opts.password,
      value: opts.value,
      ignoreFocusOut: true,
    }),
  choose: (title, options) => vscode.window.showQuickPick(options, { title, ignoreFocusOut: true }),
  saveFile: async (name, filters) =>
    (
      await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(os.homedir(), name)),
        filters,
      })
    )?.fsPath,
  openFile: async (filters) =>
    (await vscode.window.showOpenDialog({ canSelectMany: false, filters }))?.[0]?.fsPath,
  copy: (text) => vscode.env.clipboard.writeText(text),
  openUrl: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
  info: (message) => void vscode.window.showInformationMessage(message),
  error: (message) => void vscode.window.showErrorMessage(message),
};
