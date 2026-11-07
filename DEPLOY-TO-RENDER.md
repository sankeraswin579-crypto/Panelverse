# PanelVerse 3.1.0 — Production deployment guide

This project is a same-origin Node.js application backed by Neon PostgreSQL. The browser must call the API on the same Render service; do not deploy the static frontend separately unless you deliberately configure API origins, CORS, and cookie settings.

## Existing features found in this codebase

- Public catalogue endpoints for characters, comics, reading paths, adaptations, movies, storylines, events, teams, and worlds.
- Account registration and login with bcrypt password hashing.
- Revocable PostgreSQL-backed HttpOnly sessions.
- Account-scoped saved shelf and reading progress.
- JSON backup export/import.
- Wikimedia/Wikipedia discovery and character artwork lookup.
- PWA manifest and service worker.
- PostgreSQL schema initialization and starter catalogue seeding.

## 1. Prepare Neon

1. Open the existing Neon project and select the production database.
2. Copy its pooled PostgreSQL connection string if using Neon pooling.
3. Keep the connection string private. Do not paste it into frontend JavaScript, GitHub, screenshots, or public issue reports.
4. Neon requires TLS; the server uses PostgreSQL SSL with certificate verification enabled.

## 2. Deploy on Render

1. Push the project to the existing GitHub repository.
2. In Render, open the existing PanelVerse Web Service. Prefer updating that service rather than creating a duplicate.
3. Confirm settings:
   - Runtime: Node
   - Build command: `npm ci`
   - Start command: `npm start`
   - Health check path: `/api/health`
4. Add environment variables in Render:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = the Neon connection string
   - `SESSION_SECRET` = a unique random value of at least 32 characters
   - Optional: `TMDB_API_KEY` or `TMDB_READ_ACCESS_TOKEN` for TMDB movie/TV search and artwork. If Render logs `TMDB search failed (401)` or reports rejected credentials, replace the expired/invalid value in Render's Environment page and redeploy. If both are set, PanelVerse tries the read token first, then falls back to the API key.
5. Deploy the latest commit.

If using Render Blueprint instead, review `render.yaml` before applying it. Set `DATABASE_URL` manually in the Render dashboard. The Blueprint generates a `SESSION_SECRET` value.

## 3.1.0 session migration

Version 3.1.0 stores revocable session-token hashes in PostgreSQL and uses PostgreSQL-backed rate-limit counters. The new `sessions` and `rate_limits` tables are created additively at startup. Existing 3.0 browser sessions are not compatible, so users must sign in again after deployment. Account records, saved shelves, and reading progress are retained.

Back up the production Neon database before deploying. Keep the production Render service connected to the production Neon branch; do not point it at the staging branch.

## 3. Verify deployment

Open these URLs using the actual Render hostname:

- `/api/health` — should return HTTP 200 and `"database":"connected"`.
- `/` — should load the PanelVerse interface.
- `/api/characters` — should return the public character catalogue.
- `/api/comics` — should return the public comic catalogue.

Then test in a private/incognito browser:

1. Register a test account with a unique email and a password of at least 10 characters.
2. Refresh the page and verify the session remains active.
3. Save a character to the shelf.
4. Sign out and sign in again; verify the saved item remains.
5. Update a comic's reading status and verify it persists.
6. Test a second account and confirm it cannot see the first account's private shelf or progress.
7. Test on mobile and install the PWA from the browser.

## 4. Important production limitations to address before a broad public launch

This codebase already has the account, catalogue, shelf, and reading-progress foundation, but the following are not implemented as complete production services in the current source:

- Email verification and password reset/recovery.
- Admin roles, moderation tools, and a secure catalogue editor.
- Durable distributed rate limiting (the current login/discovery rate limits are process-memory based).
- Automated database backups and tested restore procedures.
- Centralized error monitoring, uptime alerts, and structured audit logs.
- Privacy policy, terms, account-data deletion/export workflow review, and support contact.
- Subscription/payment processing and community moderation, if those are part of the product scope.

Do not advertise these as available until implemented and tested. Before public launch, review the data retention policy, cookie/session policy, content licensing, and external image attribution. PanelVerse should link to legitimate sources and must not distribute unauthorized copies of copyrighted comics.

## 5. Local development

```powershell
Copy-Item .env.example .env
# Edit .env with the private Neon connection string and a random SESSION_SECRET
npm ci
npm run check
npm start
```

Do not overwrite your real `.env` file when extracting an update ZIP. Never commit `.env`.
