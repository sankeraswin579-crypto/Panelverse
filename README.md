# PanelVerse 2.1

PanelVerse is a full-stack superhero comics and universe explorer. It brings character profiles, a curated comic catalogue, reading paths, teams, worlds, storylines, events, a personal saved shelf, reading progress and public-source comic discovery into one responsive app.

## Run locally

Requirements: Node.js 20 or newer and a reachable Neon/PostgreSQL database. The server reads its private configuration from `.env`; never commit or share that file.

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to your own PostgreSQL connection string and set `SESSION_SECRET` to a random value of at least 32 characters.
3. Install dependencies and check the JavaScript syntax.

```powershell
npm install
npm run check
npm start
```

Open http://localhost:3000. For automatic server restarts while editing, run `npm run dev`. The server creates its PostgreSQL tables and seeds missing catalogue collections on first initialization.

## Stack

- Frontend: semantic HTML, responsive CSS, vanilla browser JavaScript and an installable PWA shell.
- Backend: Node.js HTTP server and JSON REST API.
- Persistence: Neon/PostgreSQL for accounts, catalogue collections, saved shelves and reading progress.
- Authentication: bcrypt password hashes and signed HttpOnly session cookies.

## API

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/health` | Service status |
| GET | `/api/discover/comics?q=&type=` | Search the local catalogue plus public Wikipedia and Wikidata references for comic books and superhero characters |
| GET | `/api/characters?q=&universe=` | Character directory and search |
| GET | `/api/comics?q=&universe=` | Curated comic catalog |
| GET | `/api/reading-paths` | Beginner-friendly reading sequences |
| GET | `/api/adaptations?q=` | Comic-to-screen connections |
| GET | `/api/movies?q=&universe=` | Movies and series catalog |
| GET | `/api/storylines` | Character and event story arcs |
| GET | `/api/events` | Crossover events and timelines |
| GET | `/api/teams` | Teams and factions |
| GET | `/api/worlds` | Universes and alternate continuities |
| GET | `/api/shelf` | Signed-in user's saved entries |
| POST | `/api/shelf` | Save characters, comics, screen titles, teams, worlds, or events |
| DELETE | `/api/shelf` | Remove a saved entry |
| POST | `/api/guide` | Curated guide response for a question |

Saved shelves and reading progress persist in PostgreSQL and are scoped to the signed-in account. The guide is a scripted demo, not a hosted AI service.

## Next development milestones

1. Add an admin catalogue editor with validation and audit history.
2. Add richer publisher-specific issue and creator metadata where permitted API access is available.
3. Add optional model-backed comic Q&A with server-side credentials and source citations.
4. Add operational monitoring, backup automation, email verification and password recovery before wider public launch.
5. Package the existing PWA for native mobile and desktop distribution if store installers are needed.

## Live comic and superhero discovery (2.1)

The Live comic search page combines matching entries from the existing Neon-backed PanelVerse catalogue with public search results from Wikipedia and Wikidata. Choose all entries, heroes and villains, or comics and graphic novels. Every external result includes a link to its source page; PanelVerse does not host full comic books or claim to provide an exhaustive index.

- Public endpoint: `GET /api/discover/comics?q=Batman&type=all` (`type` can be `all`, `characters`, or `comics`).
- No third-party API key is required for the Wikimedia sources.
- The server caches successful searches for eight minutes, limits request rates, makes at most two upstream requests per cache miss, and uses a descriptive User-Agent.
- Wikipedia and Wikidata can rate-limit or change results; the local catalogue remains available when external sources are temporarily unavailable.
- The frontend only displays Wikimedia-hosted thumbnails from `upload.wikimedia.org`; source links are shown so readers can check context and applicable licensing.

The existing scripted PanelVerse Guide remains a curated demo, not a hosted generative-AI assistant. A true AI Q&A feature needs a configured model provider and server-side API credentials.

## Content and rights

Panelverse is an independent fan discovery project. It links to official publisher information and does not host or distribute comic books or publisher artwork. Character names and story titles remain the property of their respective owners.

## Install on desktop and phones

Panelverse is an installable Progressive Web App. Run it locally with `npm start` and open http://localhost:3000. For installation on other devices, deploy it to a secure HTTPS address.

- Desktop Chrome/Edge: select **Install app** in the address bar or browser menu.
- Android Chrome: select **Install app** or **Add to Home screen**.
- iPhone/iPad Safari: tap **Share**, then **Add to Home Screen**.

The app shell can launch offline after its first visit. Catalog and shelf updates require the API connection. PWA installation is browser-based; it does not produce signed `.exe` or `.apk` installers. Native store packages can be added separately if needed.

## Reading progress

The comics library now supports a personal reading tracker. Add a comic to your tracker, then move it through **Want to read**, **Reading**, and **Completed**. Reading items can store a completion percentage. Progress is available from the overview and My Shelf and persists through the `/api/progress` endpoint in the local data store.

## Reading progress API

- GET /api/progress retrieves the signed-in reader's tracker.
- POST /api/progress creates or updates a comic status and completion percentage.
- DELETE /api/progress removes a comic from the tracker.

The overview now includes active reads. In Comics Library, choose **Track reading** to add a title; its button cycles through reading states. In My Shelf, use the status menu and slider to set its state and completion percentage. Reading records are stored in PostgreSQL and belong to the signed-in account.



## Personalized discovery

The overview surfaces three comic recommendations using the reader's saved characters, preferred universes, and active reading progress. Each suggestion explains why it was selected. The ranking runs in the browser from the local catalog and needs no external AI account or tracking service.

## Expanded universe library

- Character profiles distinguish heroes and villains, include affiliations and connected characters, and can be sorted or filtered.
- Movies & Series now has its own catalog with medium, year, continuity, genre, cast, character links, and related comics. Save screen titles to My Shelf as a watchlist.
- Storyline Explorer orders arcs on a timeline and links stories to their characters and screen adaptations.
- Catalog APIs: `GET /api/movies` and `GET /api/storylines`; screen titles can be saved using `POST /api/shelf` with `itemType: "screen"`.

Film and series descriptions link to official publisher or streaming pages. Catalog availability varies by region.

The screen catalog starts with a cross-publisher selection: Marvel films and DC films, plus the Invincible animated series. Character links, story arcs, comics, and screen entries connect through stable catalog IDs so additional material can be added without duplicating records.


## Universe coverage

The starter catalog connects 16 characters, 13 comics, 11 screen titles, 4 story arcs, 6 crossover events, 8 teams or factions, and 5 alternate settings. It is structured for growth, not an exhaustive index of every publisher issue. The app keeps official publisher links and does not host full comics.



## Reader account and portability

The current hosted version uses the signed-in account as the reader profile. Export produces a versioned JSON backup of saved entries and reading progress; importing merges supported items into the account. The `/api/profiles` endpoint keeps the single-profile interface compatible with the existing frontend.

- `GET /api/profiles` lists local profiles.
- `POST /api/profiles` creates a local profile.
- `GET /api/backup?owner=...` exports a profile backup.
- `POST /api/backup` validates and merges a backup into a profile.

The character directory also includes a two-character comparison view for powers, affiliations, origins, and connections.
