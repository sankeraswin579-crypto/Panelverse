PANELVERSE 3.1.0 - COMIC COVER FALLBACK

1. Copy PanelVerse-Comic-Cover-Fix.js into D:\Documents\panelverse.
2. In PowerShell:
   cd D:\Documents\panelverse
   node .\PanelVerse-Comic-Cover-Fix.js
   npm run check
3. Restart the currently running PanelVerse server. Stop the existing server with Ctrl+C in its terminal, then run:
   npm start
4. In a second PowerShell window test:
   (Invoke-RestMethod "http://127.0.0.1:3000/api/comics").data | Select-Object -First 8 title,coverUrl | Format-Table -AutoSize

This adds Open Library cover search as a fallback after the existing Wikipedia lookups. It does not write to Neon. Open Library does not guarantee a cover for every comic, especially individual issues.

MOVIE AND TV POSTERS:
The current API response shows TMDB configured=False. To enable TMDB posters, create/request an API credential from your TMDB account settings, then put this in the local .env file:
TMDB_READ_ACCESS_TOKEN=your_read_access_token
Do not commit .env or share the token. Restart the server after saving it.
