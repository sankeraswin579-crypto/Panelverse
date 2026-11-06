PANELVERSE 3.1.0 - IMAGE FIX

1. Download PanelVerse-Image-Fix.js.
2. Copy it into D:\Documents\panelverse.
3. Open PowerShell in that folder.
4. Run:
   node .\PanelVerse-Image-Fix.js
   npm run check
5. Restart the app:
   npm start

The script backs up server.js and public/app.js before editing. It does not modify Neon database records or .env. It adds API-response image enrichment for comics and movies/series, and renders cover/poster images in existing cards.

TMDB poster matches require TMDB_API_KEY or TMDB_READ_ACCESS_TOKEN in the server environment. Wikimedia thumbnail coverage depends on available article images.
