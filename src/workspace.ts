/**
 * Folder comparison that copes with how Claude Code records paths on Windows:
 * `D:\Code\App`, `d:\code\app` and Git Bash's `/d/Code/App` are the same folder.
 */
export function normalizePath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(/^\/([a-z])\//i, '$1:/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/** True if `dir` is one of `folders` or inside one of them. */
export function inFolders(dir: string | null | undefined, folders: string[]): boolean {
  if (!dir) {
    return false;
  }
  const d = normalizePath(dir);
  return folders.map(normalizePath).some((f) => d === f || d.startsWith(f + '/'));
}
