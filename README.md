# Panelverse

Panelverse is a full-stack superhero comics and universe explorer. It brings character profiles, curated comic recommendations, beginner reading paths, screen adaptation notes, a personal saved shelf, and a lightweight story guide into one responsive app.

## Run locally

Requirements: Node.js 20 or newer. The app uses Node's built-in modules and has no runtime package dependencies.

```bash
npm start
```

Open http://localhost:3000. For automatic server restarts while editing, run `npm run dev`.

## Stack

- Frontend: semantic HTML, responsive CSS, browser JavaScript.
- Backend: Node.js HTTP server and JSON REST API.
- Persistence: `data/db.json` stores the catalog and local reader shelf.

## API

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/health` | Service status |
| GET | `/api/characters?q=&universe=` | Character directory and search |
| GET | `/api/comics?q=&universe=` | Curated comic catalog |
| GET | `/api/reading-paths` | Beginner-friendly reading sequences |
| GET | `/api/adaptations?q=` | Comic-to-screen connections |
| GET | `/api/movies?q=&universe=` | Movies and series catalog |
| GET | `/api/storylines` | Character and event story arcs |
| GET | `/api/events` | Crossover events and timelines |
| GET | `/api/teams` | Teams and factions |
| GET | `/api/worlds` | Universes and alternate continuities |
| GET | `/api/shelf` | Local reader's saved entries |
| POST | `/api/shelf` | Save characters, comics, screen titles, teams, worlds, or events |
| DELETE | `/api/shelf` | Remove a saved entry |
| POST | `/api/guide` | Curated guide response for a question |

Shelf writes persist in `data/db.json`. The default shelf owner is `local`. The guide is a scripted demo, not a hosted AI service. The API currently runs as a single-user local app; authentication and multi-user hosting are planned extension points.

## Next full-stack milestones

1. Replace the local JSON store with PostgreSQL and migrations.
2. Add accounts, sessions, and per-user reading progress.
3. Add an admin catalog editor with validation and audit history.
4. Expand transparent recommendations and licensed-service availability data.
5. Deploy the web client and API with environment-based configuration.

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

- GET /api/progress retrieves the local reading tracker.
- POST /api/progress creates or updates a comic status and completion percentage.
- DELETE /api/progress removes a comic from the tracker.

The overview now includes active reads. In Comics Library, choose **Track reading** to add a title; its button cycles through reading states. In My Shelf, use the status menu and slider to set its state and completion percentage. Reading records are written atomically to the JSON store.



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



## Reader profiles and portability

Create separate local reader profiles from My Shelf to keep saved characters, screen watchlists, comics, and reading progress apart on one device. Export produces a versioned JSON backup; importing merges supported items into the selected profile. Move the backup file to another Panelverse installation to carry a library across devices. Profiles are local organization, not password-protected online accounts or cloud sync.

- `GET /api/profiles` lists local profiles.
- `POST /api/profiles` creates a local profile.
- `GET /api/backup?owner=...` exports a profile backup.
- `POST /api/backup` validates and merges a backup into a profile.

The character directory also includes a two-character comparison view for powers, affiliations, origins, and connections.
