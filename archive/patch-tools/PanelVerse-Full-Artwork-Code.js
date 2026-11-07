'use strict';

/**
 * PanelVerse 3.1.0 - artwork source replacement
 * Run from the original PanelVerse project directory:
 *   node .\PanelVerse-Full-Artwork-Code.js
 *
 * Creates timestamped backups before editing server.js and public/app.js.
 * It does not modify Neon data, install packages, or deploy anything.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const serverPath = path.join(ROOT, 'server.js');
const appPath = path.join(ROOT, 'public', 'app.js');

function fail(message) {
  console.error(`\nPanelVerse artwork patch stopped: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(serverPath) || !fs.existsSync(appPath)) {
  fail('Run this script from the original PanelVerse project root containing server.js and public/app.js.');
}

let server = fs.readFileSync(serverPath, 'utf8');
let app = fs.readFileSync(appPath, 'utf8');

const startMarker = 'let openLibraryNextRequestAt = 0;';
const endMarker = '// HTTP routes';
let start = server.indexOf(startMarker);
let end = server.indexOf(endMarker, start + startMarker.length);

if (start < 0 || end < 0 || end <= start) {
  fail('Could not find the expected Open Library artwork block and HTTP routes marker. No files were changed.');
}
if (server.indexOf(startMarker, start + 1) >= 0) {
  fail('Found more than one artwork block marker. No files were changed.');
}

const artworkModule = String.raw`
// ============================================
// PANELVERSE 3.1 — LICENCE-AWARE ARTWORK
// ============================================

function isCommercialArtworkLicense(value) {
  const license = String(value || '').trim();
  // Conservative allowlist: CC0, CC BY, CC BY-SA, or public domain.
  // NonCommercial and NoDerivatives variants are intentionally excluded.
  return /^(?:CC0\b|CC BY(?:-SA)?\s|Public domain\b|PD\b)/i.test(license);
}

function exactArtworkTitleMatch(requestedTitle, candidateTitle, allowedSuffixes = []) {
  const target = normalizeDiscoveryTitle(requestedTitle);
  const candidate = normalizeDiscoveryTitle(candidateTitle);
  if (!target || !candidate) return false;
  if (candidate === target) return true;
  return allowedSuffixes.some(suffix => candidate === target + ' ' + normalizeDiscoveryTitle(suffix));
}

function plainArtworkMetadata(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

async function commonsArtworkForTitle(title, searchHint, year = '') {
  if (!title) return null;

  const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.search = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: [title, year, searchHint].filter(Boolean).join(' '),
    gsrnamespace: '6',
    gsrlimit: '30',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '700',
    format: 'json',
    formatversion: '2'
  }).toString();

  const payload = await wikimediaJSON(endpoint);
  const pages = Array.isArray(payload.query?.pages)
    ? payload.query.pages
    : Object.values(payload.query?.pages || {});

  const suffixes = searchHint.includes('comic')
    ? ['cover', 'front cover', 'comic cover']
    : ['poster', 'film poster', 'movie poster'];

  const candidates = pages.map(page => {
    const info = page.imageinfo?.[0];
    const metadata = info?.extmetadata || {};
    const fileTitle = String(page.title || '')
      .replace(/^File:/i, '')
      .replace(/\.[^.]+$/, '');
    const license = plainArtworkMetadata(
      metadata.LicenseShortName?.value || metadata.UsageTerms?.value || ''
    );
    const creator = plainArtworkMetadata(
      metadata.Artist?.value || metadata.Credit?.value || ''
    );
    const imageUrl = approvedPanelVerseImage(info?.thumburl || info?.url);
    const descriptionUrl = info?.descriptionurl ||
      'https://commons.wikimedia.org/wiki/' + encodeURIComponent(String(page.title || '').replace(/ /g, '_'));

    return {
      imageUrl,
      fileTitle,
      license,
      licenseUrl: metadata.LicenseUrl?.value || '',
      creator,
      descriptionUrl,
      mime: info?.mime || '',
      exact: exactArtworkTitleMatch(title, fileTitle, suffixes)
    };
  }).filter(item =>
    item.imageUrl &&
    item.exact &&
    /^image\/(jpeg|png|webp|gif)$/i.test(item.mime) &&
    isCommercialArtworkLicense(item.license)
  );

  const best = candidates[0];
  if (!best) return null;

  const credit = [best.creator, best.license]
    .filter(Boolean)
    .join(' · ');

  return {
    url: best.imageUrl,
    source: 'Wikimedia Commons',
    license: best.license,
    licenseUrl: best.licenseUrl,
    credit,
    sourceUrl: best.descriptionUrl
  };
}

async function comicCoverFor(item) {
  const title = String(item.title || '').trim();
  if (!title) return { coverUrl: null };

  // Only retain an existing URL when the catalogue explicitly marks its rights as verified.
  const existing = approvedPanelVerseImage(item.coverUrl);
  if (existing && item.coverRightsVerified === true) {
    return {
      coverUrl: existing,
      coverCredit: item.coverCredit || '',
      coverLicense: item.coverLicense || '',
      coverLicenseUrl: item.coverLicenseUrl || '',
      coverSourceUrl: item.coverSourceUrl || ''
    };
  }

  const key = 'comic-commons:' + normalizeDiscoveryTitle(title);
  const artwork = await cachedPanelVerseArtwork(key, () =>
    commonsArtworkForTitle(title, 'comic book cover')
  );

  if (!artwork) {
    return {
      coverUrl: null,
      coverCredit: '',
      coverLicense: '',
      coverLicenseUrl: '',
      coverSourceUrl: ''
    };
  }

  return {
    coverUrl: artwork.url,
    coverSource: artwork.source,
    coverCredit: artwork.credit,
    coverLicense: artwork.license,
    coverLicenseUrl: artwork.licenseUrl,
    coverSourceUrl: artwork.sourceUrl
  };
}

async function tvmazeArtworkFor(title, year = '') {
  const endpoint = new URL('https://api.tvmaze.com/search/shows');
  endpoint.searchParams.set('q', title);

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'User-Agent': WIKIMEDIA_AGENT
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) throw new Error('TVmaze returned ' + response.status);

  const results = await response.json();
  const matches = (Array.isArray(results) ? results : [])
    .map(result => result.show)
    .filter(show => show &&
      normalizeDiscoveryTitle(show.name) === normalizeDiscoveryTitle(title));

  const show = matches.find(item =>
    year && String(item.premiered || '').slice(0, 4) === year
  ) || matches[0];

  if (!show) return null;

  const posterUrl = approvedPanelVerseImage(
    show.image?.original || show.image?.medium
  );
  if (!posterUrl) return null;

  return {
    posterUrl,
    backdropUrl: null,
    posterSource: 'TVmaze',
    posterCredit: 'TVmaze',
    posterSourceUrl: show.url || 'https://www.tvmaze.com/'
  };
}

async function screenArtworkFor(item) {
  const title = String(item.title || '').trim();
  if (!title) return { ...item, posterUrl: null, backdropUrl: null };

  const medium = String(item.medium || '').toLowerCase();
  const isSeries = /series|television|\btv\b/.test(medium);
  const searchTitle = title
    .replace(/\s*(?:[·:—-]\s*)?season\s+\d+\s*$/i, '')
    .trim();
  const year = String(item.year || '').slice(0, 4);
  const key = (isSeries ? 'tvmaze:' : 'movie-commons:') +
    normalizeDiscoveryTitle(searchTitle) + ':' + year;

  const artwork = await cachedPanelVerseArtwork(key, async () => {
    if (isSeries) {
      try {
        return await tvmazeArtworkFor(searchTitle, year);
      } catch (error) {
        console.warn('TVmaze artwork lookup failed:', error.message);
        return null;
      }
    }

    try {
      const commons = await commonsArtworkForTitle(searchTitle, 'film poster', year);
      if (!commons) return null;
      return {
        posterUrl: commons.url,
        backdropUrl: null,
        posterSource: commons.source,
        posterCredit: commons.credit,
        posterLicense: commons.license,
        posterLicenseUrl: commons.licenseUrl,
        posterSourceUrl: commons.sourceUrl
      };
    } catch (error) {
      console.warn('Movie artwork lookup failed:', error.message);
      return null;
    }
  });

  return {
    ...item,
    posterUrl: approvedPanelVerseImage(artwork?.posterUrl) || null,
    backdropUrl: approvedPanelVerseImage(artwork?.backdropUrl) || null,
    posterSource: artwork?.posterSource || null,
    posterCredit: artwork?.posterCredit || '',
    posterLicense: artwork?.posterLicense || '',
    posterLicenseUrl: artwork?.posterLicenseUrl || '',
    posterSourceUrl: artwork?.posterSourceUrl || ''
  };
}

async function enrichComicArtwork(rows) {
  return mapPanelVerseArtwork(rows, 5, async item => ({
    ...item,
    ...(await comicCoverFor(item))
  }));
}

async function enrichMovieArtwork(rows) {
  return mapPanelVerseArtwork(rows, 5, screenArtworkFor);
}

`;

// Update image host allowlist. Keep existing hosts needed by the application.
const hostBlock = /const allowedHosts = new Set\(\[([\s\S]*?)\]\);/;
if (!hostBlock.test(server)) fail('Could not locate approvedPanelVerseImage() host allowlist. No files were changed.');
server = server.replace(hostBlock, (whole, inner) => {
  const hosts = inner.split('\n').map(line => line.trim()).filter(Boolean)
    .filter(line => !line.includes('covers.openlibrary.org'));
  if (!hosts.some(line => line.includes('static.tvmaze.com'))) {
    hosts.push("'static.tvmaze.com'");
  }
  return `const allowedHosts = new Set([\n      ${hosts.join(',\n      ')}\n    ]);`;
});

// Recompute offsets after the allowlist edit changes source length.
start = server.indexOf(startMarker);
end = server.indexOf(endMarker, start + startMarker.length);
if (start < 0 || end < 0 || end <= start || server.indexOf(startMarker, start + 1) >= 0) {
  fail('Artwork block markers changed unexpectedly. No files were written.');
}

// Replace the Open Library + old comic/movie functions and enrichment block.
server = server.slice(0, start) + artworkModule + server.slice(end);

// Update CSP: remove Open Library and allow TVmaze image CDN.
server = server.replace(/https:\/\/covers\.openlibrary\.org\s*/g, '');
server = server.replace(/(img-src[^;]*)(;\s*connect-src)/, (match, img, connect) =>
  img.includes('https://static.tvmaze.com')
    ? match
    : `${img} https://static.tvmaze.com${connect}`
);

// Ensure the artwork endpoint enriches collections (don't duplicate it).
if (!server.includes("if (publicCollection === 'comics') rows = await enrichComicArtwork(rows);")) {
  fail('The comics API route does not contain the expected enrichment hook. No files were changed.');
}
if (!server.includes("if (publicCollection === 'movies') rows = await enrichMovieArtwork(rows);")) {
  fail('The movies API route does not contain the expected enrichment hook. No files were changed.');
}

// Add attribution links to existing card templates, if not already present.
if (!app.includes('coverSourceUrl') && app.includes('<span>${esc(c.title)}</span>')) {
  app = app.replace(
    '<span>${esc(c.title)}</span>',
    `<span>\${esc(c.title)}</span>\n      \${c.coverSourceUrl && c.coverCredit ? \`<small class="art-credit"><a href="\${esc(c.coverSourceUrl)}" target="_blank" rel="noopener noreferrer">\${esc(c.coverCredit)} · Source</a></small>\` : ''}`
  );
}
if (!app.includes('posterSourceUrl') && app.includes('<h3>${esc(m.title)}</h3>')) {
  app = app.replace(
    '<h3>${esc(m.title)}</h3>',
    `<h3>\${esc(m.title)}</h3>\n      \${m.posterSourceUrl && m.posterCredit ? \`<small class="art-credit"><a href="\${esc(m.posterSourceUrl)}" target="_blank" rel="noopener noreferrer">\${esc(m.posterCredit)} · Source</a></small>\` : ''}`
  );
}

// Backup only after all required source markers have been validated.
const backupDir = path.join(ROOT, 'backups', `artwork-code-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(serverPath, path.join(backupDir, 'server.js'));
fs.copyFileSync(appPath, path.join(backupDir, 'app.js'));
fs.writeFileSync(serverPath, server, 'utf8');
fs.writeFileSync(appPath, app, 'utf8');

console.log('PanelVerse artwork code updated.');
console.log(`Backup: ${backupDir}`);
console.log('Next run: npm run check');
console.log('This changes local source only; it does not modify Neon or deploy to Render.');
