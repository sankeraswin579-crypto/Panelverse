'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = process.cwd();
const serverPath = path.join(root, 'server.js');
const appPath = path.join(root, 'public', 'app.js');

for (const file of [serverPath, appPath]) {
  if (!fs.existsSync(file)) {
    throw new Error(`Run this script from the PanelVerse project folder. Missing: ${path.relative(root, file)}`);
  }
}

let server = fs.readFileSync(serverPath, 'utf8');
let app = fs.readFileSync(appPath, 'utf8');

const changes = [];

// ---------- server.js: artwork enrichment helpers ----------
if (!server.includes('async function enrichComicArtwork(rows)')) {
  const helpers = String.raw`
// PanelVerse catalogue artwork enrichment. This only enriches API responses;
// it does not write to or replace the Neon catalogue.
const PANELVERSE_ARTWORK_CACHE_TTL = 12 * 60 * 60 * 1000;
const panelVerseArtworkCache = new Map();
const panelVerseArtworkInFlight = new Map();

function approvedPanelVerseImage(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = new URL(value);
    const allowedHosts = new Set([
      'image.tmdb.org',
      'upload.wikimedia.org',
      'images.wikipedia.org'
    ]);
    return parsed.protocol === 'https:' && allowedHosts.has(parsed.hostname)
      ? value
      : null;
  } catch {
    return null;
  }
}

async function cachedPanelVerseArtwork(key, loader) {
  const cached = panelVerseArtworkCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (panelVerseArtworkInFlight.has(key)) return panelVerseArtworkInFlight.get(key);

  const task = (async () => {
    let value = null;
    try {
      value = await loader();
    } catch (error) {
      console.warn('PanelVerse artwork lookup failed:', key, error.message);
    }
    panelVerseArtworkCache.set(key, {
      value,
      expiresAt: Date.now() + PANELVERSE_ARTWORK_CACHE_TTL
    });
    return value;
  })();

  panelVerseArtworkInFlight.set(key, task);
  try {
    return await task;
  } finally {
    panelVerseArtworkInFlight.delete(key);
  }
}

async function mapPanelVerseArtwork(rows, concurrency, worker) {
  const output = new Array(rows.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, rows.length) },
    async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= rows.length) return;
        try {
          output[index] = await worker(rows[index]);
        } catch (error) {
          console.warn('PanelVerse artwork item skipped:', error.message);
          output[index] = rows[index];
        }
      }
    }
  );
  await Promise.all(workers);
  return output;
}

async function wikipediaArtworkForTitle(title) {
  const endpoint = new URL('https://en.wikipedia.org/w/api.php');
  const params = {
    action: 'query',
    generator: 'search',
    gsrsearch: title,
    gsrnamespace: '0',
    gsrlimit: '10',
    prop: 'pageimages|info',
    piprop: 'thumbnail',
    pithumbsize: '700',
    inprop: 'url',
    format: 'json',
    formatversion: '2'
  };
  for (const [key, value] of Object.entries(params)) {
    endpoint.searchParams.set(key, value);
  }

  const payload = await wikimediaJSON(endpoint);
  const pages = Array.isArray(payload.query?.pages)
    ? payload.query.pages
    : Object.values(payload.query?.pages || {});
  const target = normalizeDiscoveryTitle(title);
  const targetWords = target.split(' ').filter(word => word.length > 2);

  const candidates = pages.map(page => {
    const imageUrl = approvedPanelVerseImage(page.thumbnail?.source);
    const pageTitle = normalizeDiscoveryTitle(page.title);
    const pageWords = pageTitle.split(' ');
    const matched = targetWords.filter(word => pageWords.includes(word)).length;
    const score = pageTitle === target
      ? 100
      : targetWords.length ? matched / targetWords.length : 0;
    return { imageUrl, score, pageTitle };
  }).filter(item => item.imageUrl);

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.score >= 0.8 ? candidates[0].imageUrl : null;
}

async function comicCoverFor(item) {
  const existing = approvedPanelVerseImage(item.coverUrl);
  if (existing) return existing;

  const title = String(item.title || '').trim();
  if (!title) return null;

  const key = 'comic:' + normalizeDiscoveryTitle(title);
  return cachedPanelVerseArtwork(key, async () => {
    // Prefer a Wikipedia result classified as a comic, which is less likely
    // to return unrelated film or character artwork.
    const results = await searchWikipediaComics(title, 'comic').catch(() => []);
    const target = normalizeDiscoveryTitle(title);
    const targetWords = target.split(' ').filter(word => word.length > 2);
    const candidates = results.map(result => {
      const imageUrl = approvedPanelVerseImage(result.imageUrl);
      const candidate = normalizeDiscoveryTitle(result.title);
      const words = candidate.split(' ');
      const matched = targetWords.filter(word => words.includes(word)).length;
      const score = candidate === target
        ? 100
        : targetWords.length ? matched / targetWords.length : 0;
      return { imageUrl, score };
    }).filter(result => result.imageUrl);

    candidates.sort((a, b) => b.score - a.score);
    if (candidates[0]?.score >= 0.8) return candidates[0].imageUrl;

    // Exact-title Wikipedia thumbnail fallback for catalog entries whose
    // article is not classified by the live comic discovery filter.
    return wikipediaArtworkForTitle(title);
  });
}

async function screenArtworkFor(item) {
  const existingPoster = approvedPanelVerseImage(item.posterUrl);
  const existingBackdrop = approvedPanelVerseImage(item.backdropUrl);
  if (existingPoster && existingBackdrop) {
    return { ...item, posterUrl: existingPoster, backdropUrl: existingBackdrop };
  }

  const title = String(item.title || '').trim();
  if (!title) {
    return { ...item, posterUrl: existingPoster, backdropUrl: existingBackdrop };
  }

  const medium = String(item.medium || '').toLowerCase();
  const expectedType = /series|television|\btv\b/.test(medium) ? 'tv' : 'movie';
  const year = String(item.year || '').slice(0, 4);
  const key = 'screen:' + expectedType + ':' + normalizeDiscoveryTitle(title) + ':' + year;

  const discovered = await cachedPanelVerseArtwork(key, async () => {
    const response = await searchTMDB(title).catch(() => ({ configured: false, results: [] }));
    const candidates = (response.results || []).filter(result =>
      result.mediaType === expectedType &&
      normalizeDiscoveryTitle(result.title) === normalizeDiscoveryTitle(title)
    );
    const match =
      (year && candidates.find(result => String(result.year || '') === year)) ||
      candidates[0];

    if (match && (match.posterUrl || match.backdropUrl)) {
      return {
        posterUrl: approvedPanelVerseImage(match.posterUrl),
        backdropUrl: approvedPanelVerseImage(match.backdropUrl),
        tmdbUrl: match.tmdbUrl || null
      };
    }

    // Keep movie/TV catalogue images available when TMDB is not configured
    // or does not have an exact title match.
    const wikipediaImage = await wikipediaArtworkForTitle(title).catch(() => null);
    return {
      posterUrl: wikipediaImage,
      backdropUrl: null,
      tmdbUrl: null
    };
  });

  return {
    ...item,
    posterUrl: existingPoster || discovered?.posterUrl || null,
    backdropUrl: existingBackdrop || discovered?.backdropUrl || null,
    tmdbUrl: discovered?.tmdbUrl || item.tmdbUrl || null
  };
}

async function enrichComicArtwork(rows) {
  return mapPanelVerseArtwork(rows, 5, async item => ({
    ...item,
    coverUrl: await comicCoverFor(item)
  }));
}

async function enrichMovieArtwork(rows) {
  return mapPanelVerseArtwork(rows, 5, screenArtworkFor);
}
`;

  const marker = /async function catalogRows\(key\) \{[\s\S]*?\n\}\r?\n\r?\n\/\/ HTTP routes/;
  if (!marker.test(server)) {
    throw new Error('Could not locate the catalogRows() helper and HTTP routes marker in server.js. No files were changed.');
  }
  server = server.replace(marker, match => match.replace(/\r?\n\r?\n\/\/ HTTP routes$/, `\n\n${helpers}\n\n// HTTP routes`));
  changes.push('Added cached Wikipedia/TMDB artwork enrichment helpers to server.js');
} else {
  console.log('server.js artwork helpers already exist; skipping insertion.');
}

// Enrich existing public catalogue responses without changing Neon data.
if (!server.includes("publicCollection === 'comics'")) {
  const routePattern = /(if \(req\.method === 'GET' && publicCollection\) \{\r?\n\s*let rows = await catalogRows\(publicCollection\);)/;
  if (!routePattern.test(server)) {
    throw new Error('Could not locate the public catalogue GET route in server.js. No files were changed.');
  }
  server = server.replace(routePattern, `$1\n\n        if (publicCollection === 'comics') rows = await enrichComicArtwork(rows);\n        if (publicCollection === 'movies') rows = await enrichMovieArtwork(rows);`);
  changes.push('Connected artwork enrichment to /api/comics and /api/movies');
} else {
  console.log('server.js catalogue artwork routes already exist; skipping route insertion.');
}

// ---------- public/app.js: render comic covers ----------
const oldComicCover = '<div class="cover" data-u="${esc(c.universe)}">${esc(c.title)}</div>';
const newComicCover =
  '<div class="cover" data-u="${esc(c.universe)}" style="position:relative;overflow:hidden;isolation:isolate">' +
  '\n      ${c.coverUrl ? `<img class="comic-cover-image" src="${esc(c.coverUrl)}" alt="${esc(c.title)} cover" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1">` : ""}' +
  '\n      <span>${esc(c.title)}</span>' +
  '\n    </div>';

if (!app.includes('class="comic-cover-image"')) {
  if (!app.includes(oldComicCover)) {
    throw new Error('Could not locate the comic cover markup in public/app.js. No files were changed.');
  }
  app = app.replace(oldComicCover, newComicCover);
  changes.push('Added coverUrl rendering to comic cards');
} else {
  console.log('public/app.js comic cover rendering already exists; skipping.');
}

// ---------- public/app.js: render movie and TV posters ----------
const oldScreenArtOpen = '<div class="screen-card-art" data-u="${esc(m.universe)}">';
const newScreenArtOpen =
  '<div class="screen-card-art" data-u="${esc(m.universe)}" style="position:relative;overflow:hidden;isolation:isolate">' +
  '\n      ${m.posterUrl || m.backdropUrl ? `<img class="screen-poster-image" src="${esc(m.posterUrl || m.backdropUrl)}" alt="${esc(m.title)} poster" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1">` : ""}';

if (!app.includes('class="screen-poster-image"')) {
  if (!app.includes(oldScreenArtOpen)) {
    throw new Error('Could not locate the screen-card artwork markup in public/app.js. No files were changed.');
  }
  app = app.replace(oldScreenArtOpen, newScreenArtOpen);
  changes.push('Added posterUrl/backdropUrl rendering to movie and series cards');
} else {
  console.log('public/app.js movie/series poster rendering already exists; skipping.');
}

if (!changes.length) {
  console.log('No changes were necessary. The image patch appears to be already applied.');
  process.exit(0);
}

// Write only after every required source anchor has been found.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, 'backups', `image-fix-${stamp}`);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(serverPath, path.join(backupDir, 'server.js'));
fs.copyFileSync(appPath, path.join(backupDir, 'app.js'));

try {
  fs.writeFileSync(serverPath, server, 'utf8');
  fs.writeFileSync(appPath, app, 'utf8');
  execFileSync(process.execPath, ['--check', serverPath], { stdio: 'inherit' });
  execFileSync(process.execPath, ['--check', appPath], { stdio: 'inherit' });
} catch (error) {
  fs.copyFileSync(path.join(backupDir, 'server.js'), serverPath);
  fs.copyFileSync(path.join(backupDir, 'app.js'), appPath);
  throw new Error(`Patch validation failed. Original files were restored from ${backupDir}. ${error.message}`);
}

console.log('\nPanelVerse image fix applied successfully.');
for (const change of changes) console.log(` - ${change}`);
console.log(`Backups: ${backupDir}`);
console.log('Neon catalogue data was not modified.');
console.log('TMDB posters are used when TMDB is configured and has an exact title match.');
console.log('Wikipedia thumbnails are used as a fallback where an exact title image is available.');
