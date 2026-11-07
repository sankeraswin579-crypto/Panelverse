PanelVerse 3.1.0 - Full Artwork Code Patch

FILES
- PanelVerse-Full-Artwork-Code.js: automated source patcher containing the complete replacement artwork module.

INSTALL
1. Copy PanelVerse-Full-Artwork-Code.js into D:\Documents\panelverse (the folder with server.js and package.json).
2. Open PowerShell in that folder.
3. Run:
   node .\PanelVerse-Full-Artwork-Code.js
   npm run check
4. Stop the local server with Ctrl+C, then restart:
   npm start
5. In a second PowerShell window, test:
   $comics = Invoke-RestMethod "http://127.0.0.1:3000/api/comics"
   $comics.data | Select-Object title,coverUrl,coverLicense | Format-Table -AutoSize
   $movies = Invoke-RestMethod "http://127.0.0.1:3000/api/movies"
   $movies.data | Select-Object title,posterUrl,posterSource | Format-Table -AutoSize

SAFETY
- The patch creates backups of server.js and public/app.js.
- It changes only local source files. It does not change Neon data or deploy to Render.
- It removes the Open Library fallback from the artwork pipeline.
- Commons images are only used when the API reports CC0, CC BY, CC BY-SA, or public-domain terms and the file title matches the catalogue title. Verify the source page and follow its exact terms before commercial release.
- TVmaze images are hotlinked to TVmaze. Retain attribution and comply with CC BY-SA requirements for API data.
- This is an artwork-source patch, not a complete commercial-release/legal review.
