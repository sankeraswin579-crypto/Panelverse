# PanelVerse 2.1 — Live Comics & Superheroes Discovery

## What's included

- A new **Live comic search** page in the existing app.
- Search across the current Neon-backed PanelVerse character/comic catalogue, Wikipedia, and Wikidata.
- Filters for all results, heroes/villains, or comics/graphic novels.
- Source links and Wikimedia thumbnails where supplied by Wikipedia.
- Server-side requests (no browser-held API secrets), an eight-minute result cache, timeouts, and request limits.
- No new npm dependencies and no new environment variables or database tables.
- A small startup data cleanup that repairs known mojibake in the existing catalog text while preserving record IDs and other fields.
- Updated PWA cache version so the new search script is picked up after deployment.

## Apply on Windows

1. Keep your existing project folder and `.env` file backed up. **Do not delete or replace `.env`.**
2. Extract this archive over `D:\Documents\panelverse`, allowing the included source files to replace their counterparts. The archive does not contain `.env`, `.git`, or `node_modules`.
3. Open PowerShell and run:

   ```powershell
   cd D:\Documents\panelverse
   npm install
   npm run check
   ```

4. For local testing, run `npm start` and open `http://localhost:3000`.
5. Commit and push the changes to GitHub:

   ```powershell
   git status
   git add .
   git commit -m "Add live comics and superhero discovery"
   git push origin main
   ```

6. Render can deploy the new commit from GitHub. Existing `DATABASE_URL` and `SESSION_SECRET` environment variables remain in place; no new secret or API key is required.

## Verify after Render deploys

- Open `https://panelverse-dhu0.onrender.com/api/health` and confirm `"database":"connected"` and `"version":"2.1.0"`.
- Open the app, choose **Live comic search**, and search for `Batman`, `Spider-Man`, or `Watchmen`.
- Open source links on results to inspect the underlying entries.

## Scope and limitations

The external search uses public Wikipedia and Wikidata knowledge APIs. It is not a complete index of every publisher, issue or comic database; results and availability can vary. It does not retrieve or distribute full comic books. Wikimedia can throttle requests, so searches are cached and rate limited.

The existing PanelVerse Guide remains a scripted demo. This upgrade does **not** add a generative-AI assistant; that requires a model provider and a server-side API credential. The existing movies/series catalogue remains unchanged; the new live search is limited to comics and superhero-related entries.

## Security

- Keep `.env` out of Git and out of uploaded archives.
- Do not add database credentials or model API keys to frontend files.
- The live search uses public data endpoints and needs no API key.
