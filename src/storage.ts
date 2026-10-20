/**
 * The slice of vscode.Memento the stores use, so they are testable without
 * VS Code. Every store keeps its data in extension globalState, which every
 * window shares, so stores merge rather than overwrite where windows can race.
 */
export interface Storage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}
