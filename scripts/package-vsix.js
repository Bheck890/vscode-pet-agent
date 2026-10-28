'use strict';

/**
 * Packages the extension (already built by webpack) into
 * marketplace/<version>-<date>/pet-agents-<version>.vsix, ready to upload to
 * the VS Code Marketplace. With --install it also installs it into the
 * local VS Code.
 *
 *   npm run package           # build and package
 *   npm run install:vscode    # build, package and install
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const now = new Date();
const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  .map((n) => String(n).padStart(2, '0'))
  .join('-');
const dir = path.join(ROOT, 'marketplace', `${pkg.version}-${date}`);
const file = path.join(dir, `${pkg.name}-${pkg.version}.vsix`);
fs.mkdirSync(dir, { recursive: true });

const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
run(`npx @vscode/vsce package --no-dependencies -o "${file}"`);
if (process.argv.includes('--install')) {
  run(`code --install-extension "${file}" --force`);
}
console.log(`\nVSIX: ${path.relative(ROOT, file)}`);
