import { inFolders, normalizePath } from '../workspace';

describe('workspace paths', () => {
  it('treats Windows, lower-case and Git Bash forms as the same folder', () => {
    expect(normalizePath('D:\\Code\\App\\')).toBe('d:/code/app');
    expect(normalizePath('/d/Code/App')).toBe('d:/code/app');
    expect(normalizePath('/work/app')).toBe('/work/app');
  });

  it('matches a folder and anything inside it, but not a sibling with the same prefix', () => {
    const folders = ['D:\\Code\\App'];
    expect(inFolders('d:\\code\\app', folders)).toBe(true);
    expect(inFolders('/d/Code/App/src', folders)).toBe(true);
    expect(inFolders('D:\\Code\\App2', folders)).toBe(false);
    expect(inFolders(null, folders)).toBe(false);
    expect(inFolders('D:\\Code\\App', [])).toBe(false);
  });
});
