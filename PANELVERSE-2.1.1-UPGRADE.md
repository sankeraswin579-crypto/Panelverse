# PanelVerse 2.1.1 — Comic/Superhero Search Filtering Fix

This is a small patch for the existing PanelVerse 2.1.0 deployment. It does not replace the existing Neon database, users, shelves, reading progress, or `.env` file.

## What changed

- Excludes Wikipedia and Wikidata search results that describe films, movies, television series, animated series, video games, novels, soundtracks, and disambiguation pages.
- Recognizes comic works such as comic-book series, graphic novels, story arcs, trade paperbacks, and comic issues before classifying hero/villain entries.
- Keeps superhero characters such as Batman as `character` results and comic titles such as Absolute Batman as `comic` results.
- Updates API health version to `2.1.1`.
- Bumps the PWA service-worker cache to refresh the revised frontend/API assets.

## Apply the patch on Windows

1. Stop the local PanelVerse server with `Ctrl+C`.
2. Keep a backup of `D:\Documents\panelverse` and do not delete `.env` or `.git`.
3. Extract this patch ZIP into `D:\Documents\panelverse`, allowing the included files to replace existing files.
4. Run:

   ```powershell
   cd D:\Documents\panelverse
   npm install
   npm run check
   npm start
   ```

5. In another PowerShell window, test:

   ```powershell
   Invoke-RestMethod http://127.0.0.1:3000/api/health | ConvertTo-Json
   Invoke-RestMethod "http://127.0.0.1:3000/api/discover/comics?q=Batman" | ConvertTo-Json -Depth 6
   ```

Expected health version: `2.1.1`, database `connected`. The Batman search should retain Batman/related comics and superhero characters while excluding film/television-only search pages.

6. When local verification passes, commit and push the changes to GitHub so Render can deploy them.

## Safety

The patch ZIP intentionally contains no `.env`, database credentials, API keys, `.git`, or `node_modules`. It does not run schema migrations or change data in Neon.
