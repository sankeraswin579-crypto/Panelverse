'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = process.cwd();
const targets = {
  server: path.join(root, 'server.js'),
  app: path.join(root, 'public', 'app.js'),
  discovery: path.join(root, 'public', 'discovery.js')
};
for (const file of Object.values(targets)) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${path.relative(root, file)}. Run from D:\\Documents\\panelverse.`);
}

let server = fs.readFileSync(targets.server, 'utf8');
let app = fs.readFileSync(targets.app, 'utf8');
let discovery = fs.readFileSync(targets.discovery, 'utf8');
const changes = [];

// Ensure the CSP permits the artwork hosts used by the current server fallback.
const cspPattern = /img-src ([^;]*);/;
const cspMatch = server.match(cspPattern);
if (!cspMatch) throw new Error('Could not locate img-src in the server Content-Security-Policy. No files written.');
let imgSources = cspMatch[1].trim().split(/\s+/);
for (const host of ['https://covers.openlibrary.org', 'https://images.wikipedia.org', 'https://upload.wikimedia.org']) {
  if (!imgSources.includes(host)) {
    imgSources.push(host);
    changes.push(`Allowed ${host} in the image Content-Security-Policy`);
  }
}
server = server.replace(cspPattern, `img-src ${imgSources.join(' ')};`);

// Character image enrichment must not erase a URL already stored on the record.
const badCharacterMapping = 'imageUrl:artwork.data?.[p.name.toLowerCase()]||null';
const goodCharacterMapping = 'imageUrl:artwork.data?.[p.name.toLowerCase()]||p.imageUrl||null';
if (app.includes(badCharacterMapping)) {
  app = app.replace(badCharacterMapping, goodCharacterMapping);
  changes.push('Preserved existing character image URLs when live lookup has no match');
}

// Negative z-index can put artwork behind the card background. Move artwork above
// the background and keep the card's text above the image.
if (app.includes('class="comic-cover-image"') || app.includes('class="screen-poster-image"')) {
  const before = app;
  app = app.replace(/z-index:-1/g, 'z-index:0;pointer-events:none');
  app = app.replace('<span>${esc(c.title)}</span>', '<span style="position:relative;z-index:1">${esc(c.title)}</span>');
  app = app.replace('<span>${esc(m.medium.toUpperCase())}</span>', '<span style="position:relative;z-index:1">${esc(m.medium.toUpperCase())}</span>');
  app = app.replace('<b>${esc(String(m.year))}</b>', '<b style="position:relative;z-index:1">${esc(String(m.year))}</b>');
  app = app.replace('<i>${esc(m.universe.toUpperCase())}</i>', '<i style="position:relative;z-index:1">${esc(m.universe.toUpperCase())}</i>');
  if (app !== before) changes.push('Fixed card artwork stacking so images display above the card background');
}

// Discovery results can use either Wikimedia upload or Wikipedia image hosts.
const oldDiscoveryCheck = "item.imageUrl.startsWith('https://upload.wikimedia.org/')";
const newDiscoveryCheck = "(/^https:\\/\\/(?:upload\\.wikimedia\\.org|images\\.wikipedia\\.org)\\//i).test(item.imageUrl)";
if (discovery.includes(oldDiscoveryCheck)) {
  discovery = discovery.replace(oldDiscoveryCheck, newDiscoveryCheck);
  changes.push('Allowed Wikipedia-hosted thumbnail URLs in discovery cards');
}

if (!changes.length) {
  console.log('No additional image-display changes were needed.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, 'backups', `image-display-fix-${stamp}`);
fs.mkdirSync(backupDir, { recursive: true });
for (const [key, file] of Object.entries(targets)) fs.copyFileSync(file, path.join(backupDir, `${key}${path.extname(file)}`));

try {
  fs.writeFileSync(targets.server, server, 'utf8');
  fs.writeFileSync(targets.app, app, 'utf8');
  fs.writeFileSync(targets.discovery, discovery, 'utf8');
  for (const file of Object.values(targets)) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
} catch (error) {
  for (const [key, file] of Object.entries(targets)) fs.copyFileSync(path.join(backupDir, `${key}${path.extname(file)}`), file);
  throw new Error(`Validation failed; original files restored from ${backupDir}. ${error.message}`);
}

console.log('\nPanelVerse image-display repair applied.');
for (const item of changes) console.log(` - ${item}`);
console.log(`Backup: ${backupDir}`);
console.log('This patch does not change Neon data or grant image reuse rights.');
