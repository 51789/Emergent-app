const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [require.resolve('expo/bin/cli'), 'export', '--platform', 'web', ...args], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (args.includes('--help') || args.includes('-h')) process.exit(0);

const { values } = parseArgs({ args, options: { 'output-dir': { type: 'string' } }, strict: false, allowPositionals: true });
const dist = values['output-dir'] || 'dist';
const index = path.join(dist, 'index.html');
const html = fs.readFileSync(index, 'utf8');
const marker = '__CONSULENS_BUILD__';
if (!html.includes(marker)) throw new Error('Missing PWA build marker in exported HTML');

// The HTML references Expo's fingerprinted bundles. Include lazy routes and
// the unbundled public files so either kind of change reaches installed apps.
const hash = createHash('sha256').update(html);
const bundles = fs.readdirSync(path.join(dist, '_expo/static/js/web')).sort();
for (const name of bundles) hash.update(name);
for (const file of fs.readdirSync('public', { recursive: true }).sort()) {
  if (file === 'index.html') continue;
  const source = path.join('public', file);
  if (fs.statSync(source).isFile()) hash.update(file.split(path.sep).join('/')).update(fs.readFileSync(source));
}
const build = hash.digest('hex').slice(0, 16);
fs.writeFileSync(index, html.replace(marker, build));
fs.writeFileSync(path.join(dist, 'pwa-version'), build + '\n');
