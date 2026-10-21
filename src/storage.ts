/**
 * The slice of vscode.Memento the stores use, so they are testable without
 * VS Code. Every store keeps its data in extension globalState, which every
 * window shares, so stores merge rather than overwrite where windows can race.
 */
export interface Storage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

/**
 * The stores' view of storage for one save: `petBag` is kept as
 * `petBag:<slot>`. The slot is read on every call, so when a new save starts
 * (in this window or another) every store moves to it without being rebuilt.
 */
export function scoped(storage: Storage, slot: () => string): Storage {
  return {
    get: <T>(key: string) => storage.get<T>(`${key}:${slot()}`),
    update: (key: string, value: unknown) => storage.update(`${key}:${slot()}`, value),
  };
}
