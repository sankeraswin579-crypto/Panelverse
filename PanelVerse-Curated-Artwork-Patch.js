'use strict';

/**
 * PanelVerse 3.1.0 — curated artwork catalogue patch
 * Run from D:\\Documents\\panelverse:
 *   node .\\PanelVerse-Curated-Artwork-Patch.js
 *
 * Adds a local, version-controlled data/artwork.json manifest and merges
 * rights-verified artwork records into /api/comics and /api/movies.
 * Existing auto-discovery remains as a fallback. No Neon rows are modified.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const serverPath = path.join(ROOT, 'server.js');
const dataDir = path.join(ROOT, 'data');
const publicArtworkDir = path.join(ROOT, 'public', 'artwork');
const manifestPath = path.join(dataDir, 'artwork.json');
const backupRoot = path.join(ROOT, 'backups');

const BEGIN = '// PANELVERSE CURATED ARTWORK MANIFEST — BEGIN';
const END = '// PANELVERSE CURATED ARTWORK MANIFEST — END';
const routeMarker = '// HTTP routes';
const enrichMarker = 'async function enrichComicArtwork(rows) {';

function fail(message) {
  console.error(`\nPanelVerse curated artwork patch stopped: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(serverPath) || !fs.existsSync(path.join(ROOT, 'package.json'))) {
  fail('Run this script from the PanelVerse project root containing server.js and package.json.');
}

let server = fs.readFileSync(serverPath, 'utf8');
if (!server.includes("if (publicCollection === 'comics') rows = await enrichComicArtwork(rows);") ||
    !server.includes("if (publicCollection === 'movies') rows = await enrichMovieArtwork(rows);")) {
  fail('Could not find both existing artwork API hooks. No files were changed.');
}

const moduleCode = String.raw`// PANELVERSE CURATED ARTWORK MANIFEST — BEGIN
const PANELVERSE_ARTWORK_MANIFEST_PATH = path.join(ROOT, 'data', 'artwork.json');
let panelVerseArtworkManifestCache = {
  mtimeMs: -1,
  items: {}
};

function readPanelVerseArtworkManifest() {
  try {
    const stat = fs.statSync(PANELVERSE_ARTWORK_MANIFEST_PATH);
    if (panelVerseArtworkManifestCache.mtimeMs === stat.mtimeMs) {
      return panelVerseArtworkManifestCache.items;
    }

    const parsed = JSON.parse(
      fs.readFileSync(PANELVERSE_ARTWORK_MANIFEST_PATH, 'utf8')
    );
    const items = parsed && parsed.version === 1 &&
      parsed.items && typeof parsed.items === 'object' &&
      !Array.isArray(parsed.items)
        ? parsed.items
        : {};

    panelVerseArtworkManifestCache = {
      mtimeMs: stat.mtimeMs,
      items
    };
    return items;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('PanelVerse artwork manifest could not be read:', error.message);
    }
    panelVerseArtworkManifestCache = { mtimeMs: -1, items: {} };
    return {};
  }
}

function isApprovedCuratedLicense(value) {
  const license = String(value || '').trim().replace(/\s+/g, ' ');
  return /^(?:CC0(?:\s+1\.0)?|CC BY(?:-SA|-ND|-SA-ND)?(?:\s+\d+(?:\.\d+)?)?|Public domain|Original artwork\s*[-—:]\s*owned by PanelVerse)$/i.test(license);
}

function curatedArtworkImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const candidate = value.trim();

  // Prefer self-hosted files committed with PanelVerse.
  if (/^\/artwork\/[a-z0-9][a-z0-9._/-]*$/i.test(candidate) &&
      !candidate.split('/').includes('..') &&
      !candidate.includes('\\')) {
    return candidate;
  }

  // Remote URLs must use a host already allowed by approvedPanelVerseImage().
  return approvedPanelVerseImage(candidate);
}

function getCuratedArtwork(item, type) {
  const id = String(item?.id || '').trim();
  if (!id) return null;

  const record = readPanelVerseArtworkManifest()[id];
  if (!record || record.type !== type || record.rightsVerified !== true) {
    return null;
  }

  const imageUrl = curatedArtworkImageUrl(record.url);
  const license = String(record.license || '').trim();
  const credit = String(record.credit || record.creator || '').trim();
  const sourceUrl = String(record.sourceUrl || '').trim();
  const licenseUrl = String(record.licenseUrl || '').trim();
  const isOriginal = /^Original artwork\s*[-—:]\s*owned by PanelVerse$/i.test(license);

  if (!imageUrl || !isApprovedCuratedLicense(license)) return null;
  if (!credit && !/^CC0(?:\s+1\.0)?$/i.test(license)) return null;
  if (!isOriginal && !/^https:\/\//i.test(sourceUrl)) return null;
  if (licenseUrl && !/^https:\/\//i.test(licenseUrl)) return null;

  return {
    url: imageUrl,
    source: String(record.source || 'Curated artwork'),
    creator: String(record.creator || ''),
    credit,
    license,
    licenseUrl,
    sourceUrl
  };
}

async function enrichComicArtwork(rows) {
  return mapPanelVerseArtwork(rows, 5, async item => {
    const curated = getCuratedArtwork(item, 'comic');
    if (curated) {
      return {
        ...item,
        coverUrl: curated.url,
        coverSource: curated.source,
        coverCreator: curated.creator,
        coverCredit: curated.credit,
        coverLicense: curated.license,
        coverLicenseUrl: curated.licenseUrl,
        coverSourceUrl: curated.sourceUrl,
        coverRightsVerified: true
      };
    }

    const discovered = await comicCoverFor(item);
    return {
      ...item,
      ...(discovered && typeof discovered === 'object'
        ? discovered
        : { coverUrl: discovered || null })
    };
  });
}

async function enrichMovieArtwork(rows) {
  return mapPanelVerseArtwork(rows, 5, async item => {
    const curated = getCuratedArtwork(item, 'screen');
    if (curated) {
      return {
        ...item,
        posterUrl: curated.url,
        posterSource: curated.source,
        posterCreator: curated.creator,
        posterCredit: curated.credit,
        posterLicense: curated.license,
        posterLicenseUrl: curated.licenseUrl,
        posterSourceUrl: curated.sourceUrl,
        posterRightsVerified: true
      };
    }

    return screenArtworkFor(item);
  });
}
// PANELVERSE CURATED ARTWORK MANIFEST — END
`;

let start = server.indexOf(BEGIN);
let end = server.indexOf(END);
if (start >= 0 || end >= 0) {
  if (start < 0 || end < start || server.indexOf(BEGIN, start + BEGIN.length) >= 0) {
    fail('Found an incomplete or duplicate curated-artwork block. No files were changed.');
  }
  end += END.length;
  server = server.slice(0, start) + moduleCode.trimEnd() + server.slice(end);
} else {
  start = server.indexOf(enrichMarker);
  end = server.indexOf(routeMarker, start + enrichMarker.length);
  if (start < 0 || end < 0 || end <= start ||
      server.indexOf(enrichMarker, start + enrichMarker.length) >= 0) {
    fail('Could not locate the existing enrichment functions and HTTP routes boundary. No files were changed.');
  }
  server = server.slice(0, start) + moduleCode + '\n\n' + server.slice(end);
}

const manifestTemplate = {
  version: 1,
  instructions: 'Only add artwork you own or are authorised to use commercially. Keep the original source, creator, licence, and attribution details.',
  items: {}
};

// Validate the proposed server before writing any project files.
const tempServer = path.join(ROOT, '.panelverse-server-artwork-check.js');
fs.writeFileSync(tempServer, server, 'utf8');
const syntax = spawnSync(process.execPath, ['--check', tempServer], { encoding: 'utf8' });
fs.rmSync(tempServer, { force: true });
if (syntax.status !== 0) {
  fail(`The patched server.js failed syntax validation.\n${syntax.stderr || syntax.stdout || ''}`);
}

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(publicArtworkDir, { recursive: true });
if (!fs.existsSync(manifestPath)) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifestTemplate, null, 2) + '\n', 'utf8');
} else {
  try {
    const current = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!current || current.version !== 1 || !current.items || typeof current.items !== 'object') {
      fail('Existing data/artwork.json is not a version 1 manifest. It was not overwritten.');
    }
  } catch (error) {
    fail(`Existing data/artwork.json is invalid JSON and was not overwritten: ${error.message}`);
  }
}

const backupDir = path.join(
  backupRoot,
  `curated-artwork-${new Date().toISOString().replace(/[:.]/g, '-')}`
);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(serverPath, path.join(backupDir, 'server.js'));
if (fs.existsSync(manifestPath)) {
  fs.copyFileSync(manifestPath, path.join(backupDir, 'artwork.json'));
}
fs.writeFileSync(serverPath, server, 'utf8');

console.log('PanelVerse curated artwork catalogue installed.');
console.log(' - Added data/artwork.json (existing manifest preserved if present)');
console.log(' - Added public/artwork/ for self-hosted, rights-cleared images');
console.log(' - Curated entries are merged by the existing catalogue item ID');
console.log(`Backup: ${backupDir}`);
console.log('Next: npm run check');
console.log('No Neon catalogue data was changed and nothing was deployed.');
