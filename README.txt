PanelVerse 3.1.0 — Curated Artwork Catalogue

INSTALL
1. Copy PanelVerse-Curated-Artwork-Patch.js into D:\Documents\panelverse.
2. Open PowerShell in that folder.
3. Run:
   node .\PanelVerse-Curated-Artwork-Patch.js
   npm run check
4. Stop any running PanelVerse server with Ctrl+C, then run:
   npm start

WHAT IT ADDS
- data/artwork.json stores verified artwork metadata keyed by the existing catalogue item ID.
- public/artwork/ is the recommended location for artwork you own or are licensed to self-host.
- Curated items are used before automatic source lookups.
- Existing Neon database records are not modified.
- Existing artwork manifest is preserved; it is not overwritten.

ADD A RIGHTS-CLEARED COMIC IMAGE
1. Copy the image file into public/artwork, e.g. public/artwork/amazing-fantasy-15.jpg.
2. Get the comic's exact ID:
   $r = Invoke-RestMethod "http://127.0.0.1:3000/api/comics"
   $r.data | Select-Object id,title
3. Edit data/artwork.json and add the ID under items:
   "YOUR-COMIC-ID": {
     "type": "comic",
     "url": "/artwork/amazing-fantasy-15.jpg",
     "source": "Original artwork",
     "creator": "Creator name",
     "credit": "Creator name — licence credit",
     "license": "Original artwork — owned by PanelVerse",
     "licenseUrl": "",
     "sourceUrl": "",
     "rightsVerified": true
   }

For third-party artwork, replace the example creator, credit, licence, licence URL and source URL with the actual verified details. Do not set rightsVerified=true until you have confirmed commercial-use permission.

ADD A MOVIE OR SERIES IMAGE
Use the same record shape with type set to "screen". The image appears as posterUrl.

IMPORTANT
- Allowed licences: CC0, CC BY, CC BY-SA, CC BY-ND, CC BY-SA-ND, Public domain, or the PanelVerse original-artwork declaration.
- NonCommercial licences are rejected.
- Remote URLs are restricted to image hosts already approved by PanelVerse. Self-hosting under /artwork/ is recommended.
- This patch does not download images, grant rights, alter Neon, or deploy to Render.
- The manifest should be committed with the project so Render receives the same catalogue on deployment.
