require('dotenv').config();

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || '';

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Add your Neon PostgreSQL connection string to .env.');
}

if (SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters.');
}

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000
});

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://image.tmdb.org https://www.themoviedb.org https://covers.openlibrary.org https://upload.wikimedia.org https://images.wikipedia.org https://static.tvmaze.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const send = (res, status, body, extra = {}) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...SECURITY,
    'Cache-Control': 'no-store',
    ...extra
  });

  res.end(JSON.stringify(body));
};

const bodyOf = req => new Promise((resolve, reject) => {
  let raw = '';

  req.on('data', chunk => {
    raw += chunk;

    if (raw.length > 1_000_000) {
      reject(new Error('Request body too large'));
      req.destroy();
    }
  });

  req.on('end', () => {
    try {
      resolve(raw ? JSON.parse(raw) : {});
    } catch {
      reject(new Error('Invalid JSON'));
    }
  });

  req.on('error', reject);
});

const clean = (value, max = 200) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const cookieValue = (req, name) =>
  (req.headers.cookie || '')
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(name + '='))
    ?.slice(name.length + 1);


const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sessionCookie(token) {
  return `pv_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

function clearSessionCookie() {
  return `pv_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await pool.query(
    `INSERT INTO sessions(user_id, token_hash, expires_at)
     VALUES($1, $2, $3)`,
    [user.id, tokenHash, expiresAt]
  );

  return sessionCookie(token);
}

async function revokeSession(req) {
  const token = cookieValue(req, 'pv_session');
  if (!token || token.length > 200) return;

  await pool.query(
    'DELETE FROM sessions WHERE token_hash=$1',
    [hashSessionToken(token)]
  );
}

async function getUser(req) {
  const token = cookieValue(req, 'pv_session');
  if (!token || token.length > 200) return null;

  const result = await pool.query(
    `SELECT u.id, u.name, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash=$1 AND s.expires_at > NOW()
     LIMIT 1`,
    [hashSessionToken(token)]
  );

  return result.rows[0] || null;
}

function checkOrigin(req) {
  const origin = req.headers.origin;

  // Cookie-authenticated browser mutations must carry the same-origin header.
  if (!origin) return false;

  try {
    const url = new URL(origin);
    return url.host === req.headers.host;
  } catch {
    return false;
  }
}

const collections = {
  '/api/characters': 'characters',
  '/api/comics': 'comics',
  '/api/reading-paths': 'readingPaths',
  '/api/adaptations': 'adaptations',
  '/api/movies': 'movies',
  '/api/storylines': 'storylines',
  '/api/events': 'events',
  '/api/teams': 'teams',
  '/api/worlds': 'worlds'
};

const itemTables = {
  comic: 'comics',
  screen: 'movies',
  character: 'characters',
  team: 'teams',
  world: 'worlds',
  event: 'events'
};

let initPromise;

async function rateLimited(req, bucket = 'auth', limit = 12, windowMs = 15 * 60 * 1000) {
  const ip = req.socket.remoteAddress || 'unknown';
  // Store a keyed digest rather than a raw IP address.
  const keyHash = crypto.createHmac('sha256', SESSION_SECRET).update(ip).digest('hex');

  const result = await pool.query(
    `INSERT INTO rate_limits(bucket, key_hash, window_started_at, hit_count)
     VALUES($1, $2, NOW(), 1)
     ON CONFLICT(bucket, key_hash) DO UPDATE SET
       window_started_at = CASE
         WHEN rate_limits.window_started_at <= NOW() - ($3::double precision * INTERVAL '1 millisecond')
         THEN NOW() ELSE rate_limits.window_started_at END,
       hit_count = CASE
         WHEN rate_limits.window_started_at <= NOW() - ($3::double precision * INTERVAL '1 millisecond')
         THEN 1 ELSE rate_limits.hit_count + 1 END
     RETURNING hit_count`,
    [bucket, keyHash, windowMs]
  );

  return Number(result.rows[0]?.hit_count || 0) > limit;
}

const tmdbCache = new Map();

async function searchTMDB(query) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN || '';
  const apiKey = process.env.TMDB_API_KEY || '';

  if (!token && !apiKey) {
    return { configured: false, results: [] };
  }

  const key = query.toLowerCase();
  const cached = tmdbCache.get(key);

  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  const endpoint = new URL(
    'https://api.themoviedb.org/3/search/multi'
  );

  endpoint.searchParams.set('query', query);
  endpoint.searchParams.set('include_adult', 'false');
  endpoint.searchParams.set('page', '1');

  if (apiKey) {
    endpoint.searchParams.set('api_key', apiKey);
  }

  const response = await fetch(endpoint, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      : {
          Accept: 'application/json'
        },
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(`TMDB search failed (${response.status}).`);
  }

  const payload = await response.json();

  const results = (payload.results || [])
    .filter(item =>
      ['movie', 'tv', 'person'].includes(item.media_type)
    )
    .slice(0, 15)
    .map(item => ({
      id: item.id,
      mediaType: item.media_type,
      title: item.title || item.name || 'Untitled',
      year: (item.release_date || item.first_air_date || '').slice(0, 4),
      overview: item.overview || item.known_for_department || '',
      posterUrl: item.poster_path || item.profile_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path || item.profile_path}`
        : null,
      backdropUrl: item.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
        : null,
      tmdbUrl: `https://www.themoviedb.org/${item.media_type}/${item.id}`
    }));

  const value = {
    configured: true,
    results
  };

  tmdbCache.set(key, {
    value,
    expires: Date.now() + 10 * 60 * 1000
  });

  return value;
}

async function tmdbArtworkForTitle(title, year, mediaType) {
  if (!process.env.TMDB_READ_ACCESS_TOKEN && !process.env.TMDB_API_KEY) {
    return null;
  }

  const result = await searchTMDB(title);
  const matches = result.results.filter(item =>
    item.mediaType === mediaType &&
    normalizeDiscoveryTitle(item.title) === normalizeDiscoveryTitle(title) &&
    item.posterUrl
  );
  const best = matches.find(item => year && item.year === year) || matches[0];
  if (!best) return null;

  return {
    posterUrl: best.posterUrl,
    backdropUrl: best.backdropUrl,
    posterSource: 'TMDB',
    posterCredit: 'TMDB',
    posterSourceUrl: best.tmdbUrl
  };
}

// Public, source-linked discovery for comics and superhero characters.

const comicDiscoveryCache = new Map();
const comicDiscoveryInFlight = new Map();
const WIKIMEDIA_AGENT =
  'PanelVerse/3.1 (+https://panelverse-dhu0.onrender.com)';

const CHARACTER_CUES =
  /\b(superhero|supervillain|superheroine|fictional character|comic book character|comic-book character|fictional superhero|fictional superhuman)\b/i;

const COMIC_CUES =
  /\b(comic|comics|comic book|comic books|graphic novel|manga|comic strip|comic series|comic-book series|story arc|trade paperback|issue of a comic)\b/i;

const COMIC_WORK_CUES =
  /\b(?:comic book series|comic-book series|comic series|comic book miniseries|comic-book miniseries|graphic novel|trade paperback|comic strip|story arc|comic book issue|manga series)\b/i;

const NON_COMIC_TITLE_CUES =
  /\b(?:film|movie|television|tv series|animated series|in film|in television|video game|soundtrack|episode|season|(?<!graphic )novel|radio series|web series|disambiguation)\b/i;

const NON_COMIC_LEAD_CUES =
  /\b(?:(?:(?:is|was|are|were)\s+(?:a|an)\s+)?(?:(?:[\w-]+)\s+){0,5})(?:film|movie|television series|tv series|animated series|video game|(?<!graphic )novel|soundtrack|radio series|web series)\b/i;

const DISAMBIGUATION_CUES =
  /\b(?:may refer to|disambiguation|can refer to)\b/i;

function discoveryKind(title, summary) {
  const pageTitle = String(title || '');
  const description = String(summary || '');

  const lead =
    description.split(/(?<=[.!?])\s+/)[0] ||
    description.slice(0, 260);

  if (
    NON_COMIC_TITLE_CUES.test(pageTitle) ||
    DISAMBIGUATION_CUES.test(lead) ||
    DISAMBIGUATION_CUES.test(pageTitle)
  ) {
    return null;
  }

  if (NON_COMIC_LEAD_CUES.test(lead)) {
    return null;
  }

  const value = `${pageTitle} ${description}`;

  if (COMIC_WORK_CUES.test(value)) return 'comic';
  if (CHARACTER_CUES.test(value)) return 'character';
  if (COMIC_CUES.test(value)) return 'comic';

  return null;
}

function discoveryText(value, max = 720) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function discoveryRateLimited(req) {
  return rateLimited(req, 'discovery', 18, 10 * 60 * 1000);
}

async function wikimediaJSON(endpoint) {
  const response = await fetch(endpoint, {
    headers: {
      'User-Agent': WIKIMEDIA_AGENT,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(7000)
  });

  if (!response.ok) {
    const error = new Error(
      response.status === 429
        ? 'Wikimedia is temporarily rate limiting searches.'
        : `Wikimedia search returned ${response.status}.`
    );

    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function searchWikipediaComics(query, kind) {
  const url = new URL('https://en.wikipedia.org/w/api.php');

  const parameters = {
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '0',
    gsrlimit: '12',
    prop: 'extracts|pageimages|info',
    exintro: '1',
    explaintext: '1',
    exchars: '680',
    piprop: 'thumbnail',
    pithumbsize: '420',
    inprop: 'url',
    format: 'json',
    formatversion: '2'
  };

  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }

  const payload = await wikimediaJSON(url);

  const pages = Array.isArray(payload.query?.pages)
    ? payload.query.pages
    : Object.values(payload.query?.pages || {});

  return pages.map(page => {
    const summary = discoveryText(page.extract);
    const classified = discoveryKind(page.title, summary);

    if (!classified || (kind !== 'all' && classified !== kind)) {
      return null;
    }

    const sourceUrl =
      typeof page.fullurl === 'string' &&
      page.fullurl.startsWith('https://en.wikipedia.org/')
        ? page.fullurl
        : `https://en.wikipedia.org/?curid=${encodeURIComponent(page.pageid)}`;

    const thumbnail =
      typeof page.thumbnail?.source === 'string' &&
      page.thumbnail.source.startsWith('https://upload.wikimedia.org/')
        ? page.thumbnail.source
        : null;

    return {
      id: `wikipedia-${page.pageid}`,
      type: classified,
      title: discoveryText(page.title, 180),
      summary:
        summary || 'Open the Wikipedia article for a source overview.',
      imageUrl: thumbnail,
      source: 'Wikipedia',
      sourceLinks: [
        {
          label: 'Wikipedia',
          url: sourceUrl
        }
      ]
    };
  }).filter(Boolean);
}

async function searchWikidataComics(query, kind) {
  const url = new URL('https://www.wikidata.org/w/api.php');

  const parameters = {
    action: 'wbsearchentities',
    search: query,
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: '12',
    format: 'json'
  };

  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }

  const payload = await wikimediaJSON(url);

  return (payload.search || []).map(item => {
    const description = discoveryText(item.description, 420);
    const classified = discoveryKind(item.label, description);

    if (!classified || (kind !== 'all' && classified !== kind)) {
      return null;
    }

    return {
      id: `wikidata-${item.id}`,
      type: classified,
      title: discoveryText(item.label, 180),
      summary:
        description || 'Open the Wikidata entity for structured information.',
      imageUrl: null,
      source: 'Wikidata',
      sourceLinks: [
        {
          label: 'Wikidata',
          url: `https://www.wikidata.org/wiki/${encodeURIComponent(item.id)}`
        }
      ]
    };
  }).filter(Boolean);
}

async function openLibraryDiscovery(query) {
  const endpoint = new URL('https://openlibrary.org/search.json');
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set(
    'fields',
    'title,cover_i,key,first_publish_year,subject,author_name'
  );
  endpoint.searchParams.set('limit', '10');

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'PanelVerse/3.1 (live comic discovery)'
    },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error('Open Library search returned ' + response.status);

  const payload = await response.json();
  return (payload.docs || [])
    .filter(item => {
      const subjects = Array.isArray(item.subject) ? item.subject.join(' ') : '';
      const isComicBook = /\b(comic|graphic novel|manga|superhero)\b/i.test(subjects);
      const exactTitle = normalizeDiscoveryTitle(item.title) === normalizeDiscoveryTitle(query);
      return item.cover_i && (isComicBook || exactTitle);
    })
    .slice(0, 8)
    .map(item => ({
      id: 'openlibrary-' + String(item.key || item.cover_i).replace(/[^a-z0-9]/gi, ''),
      type: 'comic',
      title: discoveryText(item.title, 180),
      summary: [
        Array.isArray(item.author_name) && item.author_name.length
          ? 'By ' + item.author_name.slice(0, 3).join(', ')
          : '',
        item.first_publish_year ? 'First published ' + item.first_publish_year : '',
        'Book record and cover from Open Library.'
      ].filter(Boolean).join(' · '),
      imageUrl: 'https://covers.openlibrary.org/b/id/' +
        encodeURIComponent(String(item.cover_i)) + '-M.jpg?default=false',
      source: 'Open Library',
      sourceLinks: [{
        label: 'Open Library record',
        url: 'https://openlibrary.org' + (item.key || '')
      }]
    }));
}

async function searchWikipediaTopics(query) {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '0',
    gsrlimit: '8',
    prop: 'extracts|pageimages|info',
    exintro: '1',
    explaintext: '1',
    exchars: '560',
    piprop: 'thumbnail',
    pithumbsize: '500',
    inprop: 'url',
    format: 'json',
    formatversion: '2'
  }).toString();
  const payload = await wikimediaJSON(url);
  const pages = Array.isArray(payload.query?.pages)
    ? payload.query.pages
    : Object.values(payload.query?.pages || {});

  return pages.map(page => ({
    id: 'wikipedia-topic-' + String(page.pageid),
    type: 'reference',
    title: discoveryText(page.title, 180),
    summary: discoveryText(page.extract, 650) || 'Open the source article for details.',
    imageUrl: typeof page.thumbnail?.source === 'string' &&
      page.thumbnail.source.startsWith('https://upload.wikimedia.org/')
        ? page.thumbnail.source
        : null,
    source: 'Wikipedia',
    sourceLinks: [{
      label: 'Wikipedia article',
      url: typeof page.fullurl === 'string' &&
        page.fullurl.startsWith('https://en.wikipedia.org/')
          ? page.fullurl
          : 'https://en.wikipedia.org/?curid=' + encodeURIComponent(page.pageid)
    }]
  }));
}

async function searchWikidataTopics(query) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'wbsearchentities',
    search: query,
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: '8',
    format: 'json'
  }).toString();
  const payload = await wikimediaJSON(url);

  return (payload.search || []).map(item => ({
    id: 'wikidata-topic-' + item.id,
    type: 'reference',
    title: discoveryText(item.label, 180),
    summary: discoveryText(item.description, 420) || 'Open the Wikidata entry for structured details.',
    imageUrl: null,
    source: 'Wikidata',
    sourceLinks: [{
      label: 'Wikidata entry',
      url: 'https://www.wikidata.org/wiki/' + encodeURIComponent(item.id)
    }]
  }));
}

function normalizeDiscoveryTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mergeDiscoveryResults(groups, limit = 24) {
  const merged = new Map();

  for (const item of groups.flat()) {
    const key =
      `${item.type}:${normalizeDiscoveryTitle(item.title)}`;

    if (!key || key.endsWith(':')) continue;

    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...item,
        sourceLinks: [...(item.sourceLinks || [])]
      });

      continue;
    }

    for (const link of item.sourceLinks || []) {
      if (!existing.sourceLinks.some(x => x.url === link.url)) {
        existing.sourceLinks.push(link);
      }
    }

    if (!existing.imageUrl && item.imageUrl) {
      existing.imageUrl = item.imageUrl;
    }

    if (
      (!existing.summary || existing.summary.length < 90) &&
      item.summary
    ) {
      existing.summary = item.summary;
    }

    const labels = new Set(
      existing.source.split(' + ').concat(item.source.split(' + '))
    );

    existing.source = [...labels].join(' + ');
  }

  return [...merged.values()].slice(0, limit);
}

async function discoverComicKnowledge(query, kind) {
  const cacheKey = `${kind}:${query.toLowerCase()}`;

  const cached = comicDiscoveryCache.get(cacheKey);

  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  if (comicDiscoveryInFlight.has(cacheKey)) {
    return comicDiscoveryInFlight.get(cacheKey);
  }

  const task = (async () => {
    const [characters, comics, wiki, wikidata] = await Promise.all([
      catalogRows('characters'),
      catalogRows('comics'),

      searchWikipediaComics(query, kind)
        .then(data => ({ data }))
        .catch(error => ({ error })),

      searchWikidataComics(query, kind)
        .then(data => ({ data }))
        .catch(error => ({ error }))
    ]);

    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

    const localMatches = (items, type) => items
      .filter(item => {
        if (kind !== 'all' && kind !== type) return false;

        const haystack = JSON.stringify(item).toLowerCase();

        return tokens.every(token => haystack.includes(token));
      })
      .sort((a, b) => {
        const at = normalizeDiscoveryTitle(a.name || a.title);
        const bt = normalizeDiscoveryTitle(b.name || b.title);
        const q = normalizeDiscoveryTitle(query);

        return (
          Number(bt === q) - Number(at === q) ||
          Number(bt.startsWith(q)) - Number(at.startsWith(q))
        );
      })
      .slice(0, 5)
      .map(item => ({
        id: `panelverse-${type}-${item.id}`,
        type,
        title: item.name || item.title,
        summary:
          item.summary ||
          item.description ||
          'An entry in the PanelVerse starter catalogue.',
        imageUrl: null,
        source: 'PanelVerse catalogue',
        sourceLinks: item.publisherUrl
          ? [{
              label: 'Publisher information',
              url: item.publisherUrl
            }]
          : []
      }));

    const resultGroups = [
      localMatches(characters, 'character'),
      localMatches(comics, 'comic'),
      wiki.data || [],
      wikidata.data || []
    ];

    const results = mergeDiscoveryResults(resultGroups);
    const externalUnavailable = !wiki.data && !wikidata.data;

    const value = {
      query,
      type: kind,
      total: results.length,
      results,
      sources: [
        'PanelVerse catalogue',
        ...(wiki.data ? ['Wikipedia'] : []),
        ...(wikidata.data ? ['Wikidata'] : [])
      ],
      externalUnavailable,
      notice: externalUnavailable
        ? 'Live sources are temporarily unavailable. Showing matching entries from the PanelVerse catalogue when available.'
        : 'Results are filtered to comic books and superhero characters; film, television and other adaptation-only entries are excluded. External search coverage is not exhaustive.'
    };

    comicDiscoveryCache.set(cacheKey, {
      value,
      expires: Date.now() + 8 * 60 * 1000
    });

    if (comicDiscoveryCache.size > 250) {
      const oldest = comicDiscoveryCache.keys().next().value;

      if (oldest) {
        comicDiscoveryCache.delete(oldest);
      }
    }

    return value;
  })();

  comicDiscoveryInFlight.set(cacheKey, task);

  try {
    return await task;
  } finally {
    comicDiscoveryInFlight.delete(cacheKey);
  }
}

async function discoverEverything(query, kind) {
  const cacheKey = 'everything:' + kind + ':' + query.toLowerCase();
  const cached = comicDiscoveryCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  if (comicDiscoveryInFlight.has(cacheKey)) return comicDiscoveryInFlight.get(cacheKey);

  const task = (async () => {
    const collectionNames = [
      'characters', 'comics', 'movies', 'adaptations',
      'teams', 'worlds', 'events', 'storylines'
    ];
    const wikiKind = kind === 'characters'
      ? 'character'
      : kind === 'comics'
        ? 'comic'
        : 'all';
    const searchWiki = ['all', 'characters', 'comics'].includes(kind);
    const searchScreen = ['all', 'screen'].includes(kind);
    const searchBooks = ['all', 'comics'].includes(kind);
    const searchReferences = ['all', 'universe'].includes(kind);

    const [collectionsResult, wiki, wikidata, wikiTopics, wikidataTopics, tmdb, books] = await Promise.all([
      Promise.all(collectionNames.map(name => catalogRows(name))),
      searchWiki
        ? searchWikipediaComics(query, wikiKind).then(data => ({ data })).catch(error => ({ error }))
        : Promise.resolve({ data: [] }),
      searchWiki
        ? searchWikidataComics(query, wikiKind).then(data => ({ data })).catch(error => ({ error }))
        : Promise.resolve({ data: [] }),
      searchReferences
        ? searchWikipediaTopics(query).then(data => ({ data })).catch(error => ({ error }))
        : Promise.resolve({ data: [] }),
      searchReferences
        ? searchWikidataTopics(query).then(data => ({ data })).catch(error => ({ error }))
        : Promise.resolve({ data: [] }),
      searchScreen
        ? searchTMDB(query).then(data => ({
            configured: data.configured,
            data: data.results
              .filter(item => searchScreen ? ['movie', 'tv', 'person'].includes(item.mediaType) : false)
              .map(item => ({
                id: 'tmdb-' + item.mediaType + '-' + item.id,
                type: item.mediaType === 'movie'
                  ? 'film'
                  : item.mediaType === 'tv' ? 'series' : 'person',
                title: item.title,
                summary: item.overview || 'Open TMDB for cast, release and related-title details.',
                imageUrl: item.posterUrl || item.backdropUrl,
                source: 'TMDB',
                sourceLinks: [{ label: 'TMDB details', url: item.tmdbUrl }]
              }))
          })).catch(error => ({ error }))
        : Promise.resolve({ configured: false, data: [] }),
      searchBooks
        ? openLibraryDiscovery(query).then(data => ({ data })).catch(error => ({ error }))
        : Promise.resolve({ data: [] })
    ]);

    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const q = normalizeDiscoveryTitle(query);
    const definitions = [
      { index: 0, type: 'character', title: 'name', group: 'characters' },
      { index: 1, type: 'comic', title: 'title', group: 'comics' },
      { index: 2, type: 'film', title: 'title', group: 'screen', medium: 'Film' },
      { index: 2, type: 'series', title: 'title', group: 'screen', medium: 'Series' },
      { index: 3, type: 'adaptation', title: 'title', group: 'screen' },
      { index: 4, type: 'team', title: 'name', group: 'universe' },
      { index: 5, type: 'world', title: 'name', group: 'universe' },
      { index: 6, type: 'event', title: 'title', group: 'universe' },
      { index: 7, type: 'storyline', title: 'title', group: 'universe' }
    ];
    const localGroups = definitions.map(definition => {
      if (kind !== 'all' && kind !== definition.group) return [];
      const rows = collectionsResult[definition.index] || [];
      return rows
        .filter(item => !definition.medium || item.medium === definition.medium)
        .filter(item => {
          const haystack = JSON.stringify(item).toLowerCase();
          return tokens.every(token => haystack.includes(token));
        })
        .sort((a, b) => {
          const at = normalizeDiscoveryTitle(a[definition.title]);
          const bt = normalizeDiscoveryTitle(b[definition.title]);
          return Number(bt === q) - Number(at === q) ||
            Number(bt.startsWith(q)) - Number(at.startsWith(q));
        })
        .slice(0, 4)
        .map(item => ({
          id: 'panelverse-' + definition.type + '-' + item.id,
          type: definition.type,
          title: item[definition.title] || 'Untitled',
          summary: item.summary || item.description || 'A PanelVerse catalogue entry.',
          imageUrl: item.imageUrl || item.coverUrl || item.posterUrl || null,
          source: 'PanelVerse catalogue',
          sourceLinks: item.publisherUrl
            ? [{ label: 'Publisher information', url: item.publisherUrl }]
            : []
        }));
    });

    const externalGroups = [
      wiki.data || [],
      wikidata.data || [],
      wikiTopics.data || [],
      wikidataTopics.data || [],
      tmdb.data || [],
      books.data || []
    ];
    const results = mergeDiscoveryResults([...localGroups, ...externalGroups], 40);
    const sources = ['PanelVerse catalogue'];
    if (searchWiki && wiki.data) sources.push('Wikipedia');
    if (searchWiki && wikidata.data) sources.push('Wikidata');
    if (searchReferences && wikiTopics.data && !sources.includes('Wikipedia')) sources.push('Wikipedia');
    if (searchReferences && wikidataTopics.data && !sources.includes('Wikidata')) sources.push('Wikidata');
    if (searchScreen && tmdb.configured && tmdb.data) sources.push('TMDB');
    if (searchBooks && books.data) sources.push('Open Library');
    const externalAvailable =
      (searchWiki && (Boolean(wiki.data) || Boolean(wikidata.data))) ||
      (searchReferences && (Boolean(wikiTopics.data) || Boolean(wikidataTopics.data))) ||
      (searchScreen && Boolean(tmdb.configured) && Boolean(tmdb.data)) ||
      (searchBooks && Boolean(books.data));
    const externalUnavailable = !externalAvailable;

    const value = {
      query,
      type: kind,
      total: results.length,
      results,
      sources,
      externalUnavailable,
      notice: externalUnavailable
        ? 'Public sources are temporarily unavailable. Showing matching PanelVerse catalog entries when possible.'
        : 'Searches available public sources and the PanelVerse catalog. Results and image coverage vary by source; open source links for full context.'
    };

    comicDiscoveryCache.set(cacheKey, {
      value,
      expires: Date.now() + 8 * 60 * 1000
    });
    if (comicDiscoveryCache.size > 250) {
      const oldest = comicDiscoveryCache.keys().next().value;
      if (oldest) comicDiscoveryCache.delete(oldest);
    }
    return value;
  })();

  comicDiscoveryInFlight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    comicDiscoveryInFlight.delete(cacheKey);
  }
}

// Database initialization

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(60) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS catalog (
      collection TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket TEXT NOT NULL,
      key_hash CHAR(64) NOT NULL,
      window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      hit_count INTEGER NOT NULL DEFAULT 0 CHECK(hit_count >= 0),
      PRIMARY KEY(bucket, key_hash)
    );

    CREATE TABLE IF NOT EXISTS shelves (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id, item_type, item_id)
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      comic_id TEXT NOT NULL,
      status TEXT NOT NULL
        CHECK(status IN ('want-to-read','reading','completed')),
      progress INTEGER NOT NULL DEFAULT 0
        CHECK(progress BETWEEN 0 AND 100),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id, comic_id)
    );

    CREATE INDEX IF NOT EXISTS shelves_user_idx
      ON shelves(user_id);

    CREATE INDEX IF NOT EXISTS progress_user_idx
      ON reading_progress(user_id);
  `);

  await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');
  await pool.query(
    `DELETE FROM rate_limits
     WHERE window_started_at < NOW() - INTERVAL '2 days'`
  );

  const file = path.join(ROOT, 'data', 'db.json');
  const legacy = JSON.parse(fs.readFileSync(file, 'utf8'));

  const catalogCollections = [
    'characters',
    'comics',
    'readingPaths',
    'adaptations',
    'movies',
    'storylines',
    'events',
    'teams',
    'worlds'
  ];

  for (const key of catalogCollections) {
    await pool.query(
      `INSERT INTO catalog(collection, data)
       VALUES($1, $2::jsonb)
       ON CONFLICT(collection) DO NOTHING`,
      [
        key,
        JSON.stringify(
          Array.isArray(legacy[key]) ? legacy[key] : []
        )
      ]
    );
  }

  // Repair known UTF-8 encoding issues without changing catalogue IDs.
  const encodingRepairs = [
    ['â€™', '’'],
    ['Â·', '·'],
    ['â€“', '–'],
    ['PÃ©rez', 'Pérez'],
    ['RibiÄ‡', 'Ribić']
  ];

  let repairedJSON = 'data::text';
  const repairParams = [];

  for (const [broken, corrected] of encodingRepairs) {
    repairParams.push(broken, corrected);

    repairedJSON =
      `replace(${repairedJSON}, $${repairParams.length - 1}, $${repairParams.length})`;
  }

  const collectionParam = repairParams.length + 1;

  repairParams.push(
    catalogCollections,
    '%â%',
    '%Â%',
    '%Ã%'
  );

  await pool.query(
    `UPDATE catalog
     SET data = (${repairedJSON})::jsonb
     WHERE collection = ANY($${collectionParam}::text[])
       AND (
         data::text LIKE $${collectionParam + 1}
         OR data::text LIKE $${collectionParam + 2}
         OR data::text LIKE $${collectionParam + 3}
       )`,
    repairParams
  );
}

// Retry-safe initialization.
// If initialization fails, clear the rejected promise so a later
// request can attempt initialization again.

function ensureDB() {
  if (!initPromise) {
    initPromise = initializeDatabase().catch(error => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}

async function catalogRows(key) {
  const result = await pool.query(
    'SELECT data FROM catalog WHERE collection=$1',
    [key]
  );

  return result.rows[0]?.data || [];
}


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
      'image.tmdb.org',,
      'covers.openlibrary.org',
      'upload.wikimedia.org',,
      'images.wikipedia.org',
      'static.tvmaze.com'
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

async function openLibraryCoverForTitle(title) {
  if (!title) return null;

  const endpoint = new URL('https://openlibrary.org/search.json');
  endpoint.searchParams.set('title', title);
  endpoint.searchParams.set('fields', 'title,cover_i,key');
  endpoint.searchParams.set('limit', '10');

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'PanelVerse/3.1 (catalogue artwork lookup)'
    },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error('Open Library returned ' + response.status);

  const payload = await response.json();
  const target = normalizeDiscoveryTitle(title);
  const match = (payload.docs || []).find(item =>
    item.cover_i &&
    normalizeDiscoveryTitle(item.title) === target
  );
  if (!match) return null;

  return {
    url: 'https://covers.openlibrary.org/b/id/' +
      encodeURIComponent(String(match.cover_i)) + '-M.jpg?default=false',
    source: 'Open Library',
    license: '',
    licenseUrl: '',
    credit: 'Open Library',
    sourceUrl: 'https://openlibrary.org' + (match.key || '')
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
  const artwork = await cachedPanelVerseArtwork(key, async () => {
    const openLibrary = await openLibraryCoverForTitle(title);
    if (openLibrary) return openLibrary;
    return commonsArtworkForTitle(title, 'comic book cover');
  });

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
    try {
      const tmdb = await tmdbArtworkForTitle(
        searchTitle,
        year,
        isSeries ? 'tv' : 'movie'
      );
      if (tmdb) return tmdb;
    } catch (error) {
      console.warn('TMDB artwork lookup failed:', error.message);
    }

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

// PANELVERSE CURATED ARTWORK MANIFEST — BEGIN
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


// HTTP routes

async function route(req, res) {
  const url = new URL(
    req.url,
    `http://${req.headers.host || 'localhost'}`
  );

  const pathname = decodeURIComponent(url.pathname);

  if (
    pathname.startsWith('/api/') &&
    req.method !== 'GET' &&
    !checkOrigin(req)
  ) {
    return send(res, 403, {
      error: 'Request origin rejected.'
    });
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    await ensureDB();
    await pool.query('SELECT 1');

    return send(res, 200, {
      ok: true,
      name: 'PanelVerse API',
      database: 'connected',
      version: '3.1.0'
    });
  }

  // Registration
  if (pathname === '/api/register' && req.method === 'POST') {
    await ensureDB();

    if (await rateLimited(req)) {
      return send(res, 429, {
        error: 'Too many attempts. Please wait 15 minutes and try again.'
      });
    }


    const input = await bodyOf(req);
    const name = clean(input.name, 60);
    const email = clean(input.email, 254).toLowerCase();
    const password =
      typeof input.password === 'string' ? input.password : '';

    if (name.length < 2) {
      return send(res, 400, {
        error: 'Name must contain at least 2 characters.'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return send(res, 400, {
        error: 'Enter a valid email address.'
      });
    }

    if (password.length < 10 || password.length > 200) {
      return send(res, 400, {
        error: 'Password must be between 10 and 200 characters.'
      });
    }

    const hash = await bcrypt.hash(password, 12);

    try {
      const result = await pool.query(
        `INSERT INTO users(name, email, password_hash)
         VALUES($1, $2, $3)
         RETURNING id, name, email`,
        [name, email, hash]
      );

      const user = result.rows[0];

      // Import the original local reader's saved items
      // into the first account only.
      const count = await pool.query(
        'SELECT COUNT(*)::int AS n FROM users'
      );

      if (count.rows[0].n === 1) {
        const legacy = JSON.parse(
          fs.readFileSync(path.join(ROOT, 'data', 'db.json'), 'utf8')
        );

        const validTypes = {
          character: legacy.characters || [],
          comic: legacy.comics || [],
          screen: legacy.movies || [],
          team: legacy.teams || [],
          world: legacy.worlds || [],
          event: legacy.events || []
        };

        for (const item of (legacy.shelves?.local || [])) {
          if (validTypes[item.itemType]?.some(x => x.id === item.itemId)) {
            await pool.query(
              `INSERT INTO shelves(
                user_id, item_type, item_id, added_at
              )
              VALUES($1, $2, $3, COALESCE($4, NOW()))
              ON CONFLICT DO NOTHING`,
              [
                user.id,
                item.itemType,
                item.itemId,
                item.addedAt || null
              ]
            );
          }
        }

        for (const progress of (legacy.readingProgress?.local || [])) {
          if (
            (legacy.comics || []).some(
              item => item.id === progress.comicId
            ) &&
            ['want-to-read', 'reading', 'completed'].includes(progress.status)
          ) {
            await pool.query(
              `INSERT INTO reading_progress(
                user_id, comic_id, status, progress, updated_at
              )
              VALUES($1, $2, $3, $4, COALESCE($5, NOW()))
              ON CONFLICT DO NOTHING`,
              [
                user.id,
                progress.comicId,
                progress.status,
                Math.max(0, Math.min(100, Number(progress.progress) || 0)),
                progress.updatedAt || null
              ]
            );
          }
        }
      }

      res.setHeader('Set-Cookie', await createSession(user));

      return send(res, 201, {
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        }
      });
    } catch (error) {
      if (error.code === '23505') {
        return send(res, 409, {
          error: 'An account with this email already exists.'
        });
      }

      throw error;
    }
  }

  // Login
  if (pathname === '/api/login' && req.method === 'POST') {
    await ensureDB();

    if (await rateLimited(req)) {
      return send(res, 429, {
        error: 'Too many attempts. Please wait 15 minutes and try again.'
      });
    }


    const input = await bodyOf(req);
    const email = clean(input.email, 254).toLowerCase();
    const password =
      typeof input.password === 'string' ? input.password : '';

    if (password.length > 200) {
      return send(res, 401, {
        error: 'Email or password is incorrect.'
      });
    }

    const result = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email=$1',
      [email]
    );

    const user = result.rows[0];

    const valid = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!user || !valid) {
      return send(res, 401, {
        error: 'Email or password is incorrect.'
      });
    }

    res.setHeader('Set-Cookie', await createSession(user));

    return send(res, 200, {
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  }

  // Logout
  if (pathname === '/api/logout' && req.method === 'POST') {
    await ensureDB();
    await revokeSession(req);
    res.setHeader('Set-Cookie', clearSessionCookie());
    return send(res, 200, { ok: true });
  }

  if (pathname === '/login' && req.method === 'GET') {
    return serveFile(res, 'login.html');
  }

  if (pathname.startsWith('/api/')) {
    await ensureDB();
  }

  if (pathname.startsWith('/api/')) {
    // Public catalogue discovery.
    const publicCollection = collections[pathname];

    if (req.method === 'GET' && publicCollection) {
      let rows = await catalogRows(publicCollection);

        if (publicCollection === 'comics') rows = await enrichComicArtwork(rows);
        if (publicCollection === 'movies') rows = await enrichMovieArtwork(rows);

      const query = clean(url.searchParams.get('q')).toLowerCase();
      const universe = clean(url.searchParams.get('universe'));

      if (universe && universe !== 'All') {
        rows = rows.filter(item => item.universe === universe);
      }

      if (query) {
        rows = rows.filter(item =>
          JSON.stringify(item).toLowerCase().includes(query)
        );
      }

      return send(res, 200, {
        data: rows,
        total: rows.length
      });
    }

    if (pathname === '/api/me' && req.method === 'GET') {
      const visitor = await getUser(req);

      return send(res, 200, {
        user: visitor
      });
    }

    if (pathname === '/api/shelf' && req.method === 'GET') {
      const visitor = await getUser(req);

      if (!visitor) {
        return send(res, 200, { data: [] });
      }
    }

    if (pathname === '/api/progress' && req.method === 'GET') {
      const visitor = await getUser(req);

      if (!visitor) {
        return send(res, 200, { data: [] });
      }
    }

    if (pathname === '/api/profiles' && req.method === 'GET') {
      const visitor = await getUser(req);

      return send(res, 200, {
        data: visitor
          ? [{ id: 'local', name: visitor.name, createdAt: null }]
          : []
      });
    }

    if (pathname === '/api/guide' && req.method === 'POST') {
      const { question } = await bodyOf(req);
      const query = clean(question).toLowerCase();

      let answer =
        'Try the character directory, then follow linked comics and screen adaptations to explore a universe.';

      if (query.includes('batman')) {
        answer =
          'A good comic starting point is Batman: Year One. You can then explore screen adaptations in Movies & series.';
      } else if (query.includes('spider')) {
        answer =
          'Amazing Fantasy #15 is a classic Spider-Man starting point. Explore the Movies & series section for screen versions.';
      } else if (
        query.includes('beginner') ||
        query.includes('start')
      ) {
        answer =
          'Start with a character you like, open their profile, then follow their comics, teams and screen appearances.';
      }

      return send(res, 200, {
        answer,
        mode: 'PanelVerse discovery guide'
      });
    }

    // Character artwork lookup. Prefer freely licensed Wikimedia Commons files,
    // then fall back to the Wikipedia REST summary thumbnail.
    if (pathname === '/api/character-art' && req.method === 'GET') {
      const names = (url.searchParams.get('names') || '').split('|').map(x => clean(x, 80)).filter(Boolean).slice(0, 40);
      if (!names.length) return send(res, 400, { error: 'No character names supplied.' });

      const images = {};
      const results = await Promise.allSettled(names.map(async name => {
        let src = '';
        const queryVariants = [
          name,
          `${name} Marvel Comics character`,
          `${name} superhero`,
          `${name} comic book character`
        ];
        const normalizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        for (const searchTerm of [...new Set(queryVariants)]) {
          try {
            const commons = new URL('https://commons.wikimedia.org/w/api.php');
            commons.search = new URLSearchParams({
              action: 'query',
              generator: 'search',
              gsrsearch: searchTerm,
              gsrnamespace: '6',
              gsrlimit: '20',
              prop: 'imageinfo',
              iiprop: 'url|mime',
              iiurlwidth: '700',
              format: 'json'
            }).toString();
            const payload = await wikimediaJSON(commons);
            const pages = Object.values(payload.query?.pages || {});
            const ranked = pages.map(page => {
              const title = (page.title || '').replace(/^File:/i, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
              const info = page.imageinfo?.[0];
              const candidate = info?.thumburl || info?.url || '';
              const phraseMatch = title.includes(normalizedName) ? 4 : 0;
              const wordMatches = normalizedName.split(' ').filter(word => word.length > 2 && title.includes(word)).length;
              const contextMatch = /marvel|comic|superhero|character/i.test(title) ? 2 : 0;
              return { candidate, score: phraseMatch + wordMatches + contextMatch, mime: info?.mime || '' };
            }).filter(item => /^https:\/\/upload\.wikimedia\.org\//i.test(item.candidate) && /^image\/(jpeg|png|webp|gif)$/i.test(item.mime));
            ranked.sort((a, b) => b.score - a.score);
            if (ranked[0]?.score > 0) {
              src = ranked[0].candidate;
              break;
            }
          } catch (_) {
            // Try the next Commons search phrase, then the REST fallback.
          }
        }

        if (!src) {
          try {
            const endpoint = new URL('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(name.replace(/ /g, '_')));
            const payload = await wikimediaJSON(endpoint);
            src = payload.thumbnail?.source || payload.originalimage?.source || '';
          } catch (_) {}
        }

        if (src && /^https:\/\/(upload\.wikimedia\.org|images\.wikipedia\.org)\//i.test(src)) {
          images[name.toLowerCase()] = src;
        }
      }));

      const failed = results.filter(x => x.status === 'rejected').length;
      return send(res, 200, {
        data: images,
        source: 'Wikimedia Commons with Wikipedia REST fallback',
        requested: names.length,
        found: Object.keys(images).length,
        failed
      });
    }

    // TMDB discovery
    if (pathname === '/api/discover/tmdb' && req.method === 'GET') {
      const query = clean(url.searchParams.get('q'), 100);

      if (query.length < 2) {
        return send(res, 400, {
          error: 'Enter at least two characters to search.'
        });
      }

      if (await discoveryRateLimited(req)) {
        return send(res, 429, {
          error: 'Search limit reached. Please wait a few minutes before trying again.'
        });
      }

      try {
        return send(res, 200, await searchTMDB(query));
      } catch (error) {
        console.error('TMDB discovery failed:', error);

        return send(res, 502, {
          error: 'External movie search is temporarily unavailable.'
        });
      }
    }

    // Comic discovery
    if (pathname === '/api/discover/comics' && req.method === 'GET') {
      const query = clean(url.searchParams.get('q'), 80);
      const kind = clean(url.searchParams.get('type'), 20) || 'all';

      if (query.length < 2) {
        return send(res, 400, {
          error: 'Enter at least two characters to search.'
        });
      }

      if (!['all', 'characters', 'comics', 'screen', 'universe'].includes(kind)) {
        return send(res, 400, {
          error: 'Choose all, characters, comics, movies and series, or universe entries.'
        });
      }

      if (await discoveryRateLimited(req)) {
        return send(res, 429, {
          error: 'Search limit reached. Please wait a few minutes before trying again.'
        });
      }

      try {
        return send(
          res,
          200,
          await discoverEverything(query, kind)
        );
      } catch (error) {
        console.error('Comic discovery failed:', error);

        return send(res, 502, {
          error: 'Comic discovery is temporarily unavailable. Please try again.'
        });
      }
    }

    const user = await getUser(req);

    if (
      !user &&
      !['/api/login', '/api/register'].includes(pathname)
    ) {
      return send(res, 401, {
        error: 'Please sign in to your PanelVerse account.'
      });
    }

    // Account deletion
    if (pathname === '/api/account' && req.method === 'DELETE') {
      const input = await bodyOf(req);
      const password =
        typeof input.password === 'string' ? input.password : '';

      if (password.length > 200) {
        return send(res, 400, {
          error: 'Enter your current password to delete this account.'
        });
      }

      const account = await pool.query(
        'SELECT password_hash FROM users WHERE id=$1',
        [user.id]
      );

      if (
        !account.rows[0] ||
        !await bcrypt.compare(password, account.rows[0].password_hash)
      ) {
        return send(res, 401, {
          error: 'The current password is incorrect.'
        });
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        await client.query(
          'DELETE FROM users WHERE id=$1',
          [user.id]
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      res.setHeader('Set-Cookie', clearSessionCookie());

      return send(res, 200, { ok: true });
    }

    // Profiles
    if (pathname === '/api/profiles' && req.method === 'GET') {
      return send(res, 200, {
        data: [{
          id: 'local',
          name: user.name,
          createdAt: null
        }]
      });
    }

    if (pathname === '/api/profiles' && req.method === 'POST') {
      return send(res, 200, {
        data: {
          id: 'local',
          name: user.name
        }
      });
    }

    // Backup export
    if (pathname === '/api/backup' && req.method === 'GET') {
      const [shelf, progress] = await Promise.all([
        pool.query(
          `SELECT
            item_type AS "itemType",
            item_id AS "itemId",
            added_at AS "addedAt"
           FROM shelves
           WHERE user_id=$1
           ORDER BY added_at DESC`,
          [user.id]
        ),

        pool.query(
          `SELECT
            comic_id AS "comicId",
            status,
            progress,
            updated_at AS "updatedAt"
           FROM reading_progress
           WHERE user_id=$1
           ORDER BY updated_at DESC`,
          [user.id]
        )
      ]);

      return send(res, 200, {
        format: 'panelverse-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        profile: {
          id: 'local',
          name: user.name
        },
        shelf: shelf.rows,
        progress: progress.rows
      });
    }

    // Backup import
    if (pathname === '/api/backup' && req.method === 'POST') {
      const input = await bodyOf(req);

      if (
        input.format !== 'panelverse-backup' ||
        input.version !== 1
      ) {
        return send(res, 400, {
          error: 'This backup format is not supported.'
        });
      }

      const [
        comics,
        movies,
        characters,
        teams,
        worlds,
        events
      ] = await Promise.all([
        'comics',
        'movies',
        'characters',
        'teams',
        'worlds',
        'events'
      ].map(catalogRows));

      const sources = {
        character: characters,
        comic: comics,
        screen: movies,
        team: teams,
        world: worlds,
        event: events
      };

      for (
        const item of
        (Array.isArray(input.shelf) ? input.shelf : []).slice(0, 500)
      ) {
        if (sources[item.itemType]?.some(x => x.id === item.itemId)) {
          await pool.query(
            `INSERT INTO shelves(
              user_id, item_type, item_id, added_at
            )
            VALUES($1, $2, $3, COALESCE($4, NOW()))
            ON CONFLICT DO NOTHING`,
            [
              user.id,
              item.itemType,
              item.itemId,
              item.addedAt || null
            ]
          );
        }
      }

      for (
        const progress of
        (Array.isArray(input.progress) ? input.progress : []).slice(0, 500)
      ) {
        if (
          comics.some(item => item.id === progress.comicId) &&
          ['want-to-read', 'reading', 'completed'].includes(progress.status)
        ) {
          await pool.query(
            `INSERT INTO reading_progress(
              user_id, comic_id, status, progress, updated_at
            )
            VALUES($1, $2, $3, $4, NOW())
            ON CONFLICT(user_id, comic_id)
            DO UPDATE SET
              status=EXCLUDED.status,
              progress=EXCLUDED.progress,
              updated_at=NOW()`,
            [
              user.id,
              progress.comicId,
              progress.status,
              progress.status === 'completed'
                ? 100
                : progress.status === 'reading'
                  ? Math.max(0, Math.min(99, Number(progress.progress) || 0))
                  : 0
            ]
          );
        }
      }

      const counts = await Promise.all([
        pool.query(
          'SELECT COUNT(*)::int n FROM shelves WHERE user_id=$1',
          [user.id]
        ),
        pool.query(
          'SELECT COUNT(*)::int n FROM reading_progress WHERE user_id=$1',
          [user.id]
        )
      ]);

      return send(res, 200, {
        ok: true,
        shelfCount: counts[0].rows[0].n,
        progressCount: counts[1].rows[0].n
      });
    }

    // Shelf retrieval and updates
    if (pathname === '/api/shelf' && req.method === 'GET') {
      const result = await pool.query(
        `SELECT
          item_type AS "itemType",
          item_id AS "itemId",
          added_at AS "addedAt"
         FROM shelves
         WHERE user_id=$1
         ORDER BY added_at DESC`,
        [user.id]
      );

      return send(res, 200, {
        data: result.rows
      });
    }

    if (
      pathname === '/api/shelf' &&
      (req.method === 'POST' || req.method === 'DELETE')
    ) {
      const input = await bodyOf(req);

      const type = clean(input.itemType, 20);
      const id = clean(input.itemId, 120);
      const table = itemTables[type];

      if (!table) {
        return send(res, 400, {
          error: 'Unsupported shelf item type.'
        });
      }

      const items = await catalogRows(table);

      if (!items.some(item => item.id === id)) {
        return send(res, 404, {
          error: 'That item is not in the catalog.'
        });
      }

      if (req.method === 'POST') {
        await pool.query(
          `INSERT INTO shelves(user_id, item_type, item_id)
           VALUES($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [user.id, type, id]
        );
      } else {
        await pool.query(
          `DELETE FROM shelves
           WHERE user_id=$1 AND item_type=$2 AND item_id=$3`,
          [user.id, type, id]
        );
      }

      const result = await pool.query(
        `SELECT
          item_type AS "itemType",
          item_id AS "itemId",
          added_at AS "addedAt"
         FROM shelves
         WHERE user_id=$1
         ORDER BY added_at DESC`,
        [user.id]
      );

      return send(res, 200, {
        data: result.rows
      });
    }

    // Reading progress retrieval
    if (pathname === '/api/progress' && req.method === 'GET') {
      const result = await pool.query(
        `SELECT
          comic_id AS "comicId",
          status,
          progress,
          updated_at AS "updatedAt"
         FROM reading_progress
         WHERE user_id=$1
         ORDER BY updated_at DESC`,
        [user.id]
      );

      return send(res, 200, {
        data: result.rows
      });
    }

    // Reading progress updates
    if (
      pathname === '/api/progress' &&
      (req.method === 'POST' || req.method === 'DELETE')
    ) {
      const input = await bodyOf(req);
      const comicId = clean(input.comicId, 120);

      const comics = await catalogRows('comics');

      if (!comics.some(item => item.id === comicId)) {
        return send(res, 404, {
          error: 'That comic is not in the catalog.'
        });
      }

      if (req.method === 'DELETE') {
        await pool.query(
          `DELETE FROM reading_progress
           WHERE user_id=$1 AND comic_id=$2`,
          [user.id, comicId]
        );
      } else {
        const status = [
          'want-to-read',
          'reading',
          'completed'
        ].includes(input.status)
          ? input.status
          : 'want-to-read';

        const number = Number.isFinite(Number(input.progress))
          ? Math.round(Number(input.progress))
          : 0;

        const progress = status === 'completed'
          ? 100
          : status === 'want-to-read'
            ? 0
            : Math.max(0, Math.min(99, number));

        await pool.query(
          `INSERT INTO reading_progress(
            user_id, comic_id, status, progress
          )
          VALUES($1, $2, $3, $4)
          ON CONFLICT(user_id, comic_id)
          DO UPDATE SET
            status=EXCLUDED.status,
            progress=EXCLUDED.progress,
            updated_at=NOW()`,
          [user.id, comicId, status, progress]
        );
      }

      const result = await pool.query(
        `SELECT
          comic_id AS "comicId",
          status,
          progress,
          updated_at AS "updatedAt"
         FROM reading_progress
         WHERE user_id=$1
         ORDER BY updated_at DESC`,
        [user.id]
      );

      return send(res, 200, {
        data: result.rows
      });
    }

    return send(res, 404, {
      error: 'API route not found.'
    });
  }

  // Frontend
  if (pathname === '/' || pathname === '/index.html') {
    await ensureDB();
    return serveFile(res, 'index.html');
  }

  const relative = pathname.replace(/^\/+/, '');

  return serveFile(res, relative);
}

// Static file serving
function serveFile(res, relative) {
  const target = path.resolve(PUBLIC, relative);

  if (!target.startsWith(PUBLIC + path.sep)) {
    return send(res, 403, {
      error: 'Forbidden'
    });
  }

  fs.readFile(target, (error, content) => {
    if (error) {
      return send(res, 404, {
        error: 'File not found.'
      });
    }

    res.writeHead(200, {
      ...SECURITY,
      'Content-Type':
        MIME[path.extname(target)] || 'application/octet-stream',
      'Cache-Control':
        path.extname(target) === '.html'
          ? 'no-store'
          : 'public, max-age=3600'
    });

    res.end(content);
  });
}

// Server startup
const server = http.createServer((req, res) => {
  Promise.resolve(route(req, res)).catch(error => {
    console.error(error);

    if (!res.headersSent) {
      send(
        res,
        error.message === 'Invalid JSON' ? 400 : 500,
        {
          error:
            process.env.NODE_ENV === 'production'
              ? 'The server encountered an error.'
              : error.message || 'Unexpected server error.'
        }
      );
    }
  });
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error('PanelVerse could not start: ' + HOST + ':' + PORT + ' is already in use.');
    console.error('Stop the other process using this port, or start PanelVerse on port 3001:');
    console.error("  $env:PORT = '3001'; npm start");
    process.exitCode = 1;
    return;
  }

  if (error.code === 'EACCES') {
    console.error('PanelVerse cannot listen on ' + HOST + ':' + PORT + ': permission was denied.');
    console.error('Choose an unprivileged port such as 3001, then try again.');
    process.exitCode = 1;
    return;
  }

  console.error('PanelVerse failed to start:', error);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`PanelVerse API listening on ${HOST}:${PORT}`);
});
