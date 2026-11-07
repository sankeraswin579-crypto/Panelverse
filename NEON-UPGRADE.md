# PanelVerse 2.0 — Neon PostgreSQL upgrade

This upgrade keeps the existing vanilla-JS frontend and Node HTTP server. It replaces the JSON-file API storage with Neon PostgreSQL and adds individual email/password accounts.

## What changes

- PostgreSQL tables: `users`, `catalog`, `shelves`, and `reading_progress`.
- Catalog data is copied from `backend/data/db.json` the first time the server initializes the database. Existing catalog rows are not overwritten on later starts.
- The first account created imports the legacy `local` shelf and reading progress when those records exist in `backend/data/db.json`.
- Passwords are hashed with bcrypt; sessions are signed, HttpOnly cookies.
- Shelf and reading-progress endpoints derive the owner from the authenticated session. Browser-supplied `owner` values are ignored.
- The old local reader-profile selector now represents the signed-in account. Multiple local profiles are replaced by individual accounts.
- `/api/health` reports whether PostgreSQL is reachable.

## Local setup (Windows PowerShell)

1. Back up your existing project folder.
2. Extract this upgrade archive into `D:\Documents\panelverse`, allowing the included files to replace their counterparts. Do not delete `backend\data\db.json`.
3. Keep your existing `.env` file. It must contain:

   ```env
   DATABASE_URL="your-Neon-connection-string"
   SESSION_SECRET="a-random-secret-at-least-32-characters-long"
   NODE_ENV=development
   ```

4. Install/update packages and run the syntax check:

   ```powershell
   cd D:\Documents\panelverse
   npm install
   npm run check
   ```

5. Start the server:

   ```powershell
   npm start
   ```

6. Open `http://localhost:3000`. Create your first account. The server creates the PostgreSQL schema and imports the catalog automatically.
7. Check `http://localhost:3000/api/health`. Expected response includes `"database":"connected"`.

## Important security notes

- Never commit `.env` or share the Neon connection string.
- Set `DATABASE_URL`, `SESSION_SECRET`, and `NODE_ENV=production` as private environment variables in the hosting provider before deployment.
- Use HTTPS in production; production cookies are marked `Secure`.
- Do not expose the database connection string in frontend code.
- The catalog is initialized with `ON CONFLICT DO NOTHING`; edit catalog data in the database or build an explicit admin migration if you later need to refresh it.
- This is a first production-oriented account foundation, not a completed security audit. Add email verification, password reset, stronger abuse controls, backups, and monitoring before a broad public launch.

## Platform direction

The web app remains the shared application. Android and iOS can later use a Capacitor wrapper pointed at the deployed HTTPS app; Windows can use the Electron wrapper. All clients use the same authenticated API and Neon database.
