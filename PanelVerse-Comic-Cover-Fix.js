'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = process.cwd();
const serverPath = path.join(root, 'server.js');
if (!fs.existsSync(serverPath)) {
  throw new Error('Run this script from D:\\Documents\\panelverse. server.js was not found.');
}

let server = fs.readFileSync(serverPath, 'utf8');
let changed = false;

// Permit Open Library cover images in the existing CSP.
const cspOld = "https://image.tmdb.org https://upload.wikimedia.org https://images.wikipedia.org;";
const cspNew = "https://image.tmdb.org https://upload.wikimedia.org https://images.wikipedia.org https://covers.openlibrary.org;";
if (server.includes(cspNew)) {
  console.log('Open Library cover host is already allowed by CSP.');
} else if (server.includes(cspOld)) {
  server = server.replace(cspOld, cspNew);
  changed = true;
  console.log('Added covers.openlibrary.org to the image CSP.');
} else {
  throw new Error('Could not find the expected CSP image-host list. No files have been written.');
}

if (server.includes('async function openLibraryComicCoverFor(title)')) {
  console.log('Open Library comic-cover helper already exists.');
} else {
  const replacement = String.raw`let openLibraryNextRequestAt = 0;
let openLibraryRequestQueue = Promise.resolve();

async function openLibraryComicCoverFor(title) {
  // Serialize requests to respect Open Library's anonymous-use guidance.
  const task = openLibraryRequestQueue.then(async () => {
    const delay = Math.max(0, openLibraryNextRequestAt - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    openLibraryNextRequestAt = Date.now() + 1100;

    const endpoint = new URL('https://openlibrary.org/search.json');
    endpoint.searchParams.set('title', title);
    endpoint.searchParams.set('fields', 'title,cover_i,first_publish_year');
    endpoint.searchParams.set('limit', '8');

    const response = await fetch(endpoint, {
      headers: {
        'User-Agent': WIKIMEDIA_AGENT,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      throw new Error('Open Library cover search returned ' + response.status);
    }

    const payload = await response.json();
    const target = normalizeDiscoveryTitle(title);
    const targetWords = target.split(' ').filter(word => word.length > 2);

    const candidates = (payload.docs || []).map(doc => {
      const candidateTitle = normalizeDiscoveryTitle(doc.title);
      const candidateWords = candidateTitle.split(' ');
      const matched = targetWords.filter(word => candidateWords.includes(word)).length;
      const coverage = targetWords.length ? matched / targetWords.length : 0;
      return {
        coverId: Number(doc.cover_i),
        score: candidateTitle === target ? 1 : coverage
      };
    }).filter(item => Number.isInteger(item.coverId) && item.coverId > 0);

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || best.score < 0.8) return null;

    return 'https://covers.openlibrary.org/b/id/' + best.coverId + '-L.jpg?default=false';
  });

  openLibraryRequestQueue = task.then(() => undefined, () => undefined);
  return task;
}

async function comicCoverFor(item) {
  const existing = approvedPanelVerseImage(item.coverUrl);
  if (existing) return existing;

  const title = String(item.title || '').trim();
  if (!title) return null;

  const key = 'comic:' + normalizeDiscoveryTitle(title);
  return cachedPanelVerseArtwork(key, async () => {
    // First, try the existing filtered Wikipedia comic discovery.
    const results = await searchWikipediaComics(title, 'comic').catch(() => []);
    const target = normalizeDiscoveryTitle(title);
    const targetWords = target.split(' ').filter(word => word.length > 2);
    const candidates = results.map(result => {
      const imageUrl = approvedPanelVerseImage(result.imageUrl);
      const candidate = normalizeDiscoveryTitle(result.title);
      const words = candidate.split(' ');
      const matched = targetWords.filter(word => words.includes(word)).length;
      const score = candidate === target
        ? 1
        : targetWords.length ? matched / targetWords.length : 0;
      return { imageUrl, score };
    }).filter(result => result.imageUrl);

    candidates.sort((a, b) => b.score - a.score);
    if (candidates[0]?.score >= 0.8) return candidates[0].imageUrl;

    // Next, use the exact Wikipedia article thumbnail where one exists.
    const wikipediaImage = await wikipediaArtworkForTitle(title).catch(() => null);
    if (wikipediaImage) return wikipediaImage;

    // Finally, try an edition/graphic-novel cover indexed by Open Library.
    return openLibraryComicCoverFor(title).catch(error => {
      console.warn('Open Library cover lookup skipped:', title, error.message);
      return null;
    });
  });
}

async function screenArtworkFor(item)`;

  const pattern = /async function comicCoverFor\(item\) \{[\s\S]*?\n\}\r?\n\r?\nasync function screenArtworkFor\(item\)/;
  if (!pattern.test(server)) {
    throw new Error('Could not locate the existing comicCoverFor() helper. No files have been written.');
  }
  server = server.replace(pattern, replacement);
  changed = true;
  console.log('Added Open Library fallback to comic cover enrichment.');
}

// TMDB catalogue titles sometimes include a display suffix such as "· Season 1".
// Search TMDB using the underlying series title while preserving the display title.
if (!server.includes('const tmdbSearchTitle = title.replace')) {
  const screenPattern = /async function screenArtworkFor\(item\) \{[\s\S]*?\n\}\r?\n\r?\nasync function enrichComicArtwork/;
  const match = server.match(screenPattern);
  if (!match) {
    throw new Error('Could not locate screenArtworkFor() for the series-title adjustment. No files have been written.');
  }
  let screenBlock = match[0];
  screenBlock = screenBlock.replace(
    "const title = String(item.title || '').trim();",
    "const title = String(item.title || '').trim();\n  const tmdbSearchTitle = title.replace(/\\s*(?:[·:—-]\\s*)?season\\s+\\d+\\s*$/i, '').trim() || title;"
  );
  screenBlock = screenBlock.replace('searchTMDB(title)', 'searchTMDB(tmdbSearchTitle)');
  screenBlock = screenBlock.replace(
    'normalizeDiscoveryTitle(result.title) === normalizeDiscoveryTitle(title)',
    'normalizeDiscoveryTitle(result.title) === normalizeDiscoveryTitle(tmdbSearchTitle)'
  );
  server = server.replace(match[0], screenBlock);
  changed = true;
  console.log('Adjusted TMDB matching for series titles with season suffixes.');
} else {
  console.log('Series season-suffix matching is already present.');
}

if (!changed) {
  console.log('No changes needed.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, 'backups', 'comic-cover-fix-' + stamp);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(serverPath, path.join(backupDir, 'server.js'));

try {
  fs.writeFileSync(serverPath, server, 'utf8');
  execFileSync(process.execPath, ['--check', serverPath], { stdio: 'inherit' });
} catch (error) {
  fs.copyFileSync(path.join(backupDir, 'server.js'), serverPath);
  throw new Error('Patch validation failed; original server.js restored from ' + backupDir + '. ' + error.message);
}

console.log('\nComic cover fallback patch applied successfully.');
console.log('Backup: ' + backupDir);
console.log('Neon catalogue data was not modified.');
console.log('Open Library coverage depends on whether it has a matching cover edition.');
