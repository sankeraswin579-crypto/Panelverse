# 🦸 PanelVerse 3.1.0

### Explore Heroes. Discover Universes. Track Your Reading.

**PanelVerse** is a full-stack superhero comics and universe exploration platform that brings character profiles, comic collections, reading paths, teams, alternate worlds, storylines, crossover events, and screen adaptations together in one responsive application.

Discover comic universes, explore connected characters, organize your personal reading shelf, and track your reading journey.

**Live Application:** https://panelverse-dhu0.onrender.com  
**GitHub Repository:** https://github.com/sankeraswin579-crypto/Panelverse

---

## 🔐 Version 3.1.0 security upgrades

- Opaque, cryptographically random session tokens; only token hashes are stored in PostgreSQL.
- Server-side session revocation on logout and account deletion.
- Seven-day session expiry.
- PostgreSQL-backed rate limiting shared across app instances.
- Automatic cleanup of expired sessions and old rate-limit records.
- Android app version 3.1.0 (version code 4).

Existing users must sign in again after the 3.1.0 backend deployment because the previous 3.0 session-cookie format is not reused. Account data, saved shelves, and reading progress remain in PostgreSQL.

See [UPGRADE-3.1.0.md](UPGRADE-3.1.0.md) for deployment and migration notes.

## ✨ Features

### 📚 Comic Discovery
- Curated superhero comics catalogue.
- Search and filter comics by universe.
- Live comic discovery using Wikipedia and Wikidata.
- External source links for discovered content.
- Character and comic discovery filters.

### 🦸 Character Universe
- Detailed superhero and villain profiles.
- Character affiliations and connections.
- Hero and villain classification.
- Character comparison for powers, origins, and affiliations.

### 🌌 Universe Explorer
- Marvel and DC universe collections.
- Alternate continuities and worlds.
- Teams and factions.
- Crossover events and timelines.
- Connected character and storyline relationships.

### 📖 Reading Experience
- Beginner-friendly reading paths.
- Personalized comic recommendations.
- Want to Read, Reading, and Completed statuses.
- Reading completion percentage.
- Active reading overview.
- Personal saved shelf.

### 🎬 Movies & Series
- Comic-to-screen adaptations.
- Movies and animated series catalogue.
- Release years, genres, and continuity.
- Character and comic connections.
- Personal watchlist support.

### 👤 Reader Accounts
- Account registration and authentication.
- bcrypt password hashing.
- Revocable HttpOnly session cookies backed by PostgreSQL.
- Account-specific saved collections.
- Persistent reading progress.
- JSON backup and restore functionality.

### 🔎 Live Comic Discovery
Search public comic and superhero references using:
- Wikipedia
- Wikidata

Features:
- Combines local catalogue and public results.
- No third-party API key required for Wikimedia sources.
- Successful searches cached for eight minutes.
- Rate limiting.
- Maximum two upstream requests per cache miss.
- Descriptive User-Agent.
- External source links.

### 📱 Progressive Web App
- Responsive desktop and mobile interface.
- Installable PWA.
- Offline application shell after first visit.
- Browser-based installation.
- API-dependent features require connectivity.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js |
| Database | Neon PostgreSQL |
| API | REST API |
| Authentication | bcrypt, PostgreSQL-backed sessions, HttpOnly Cookies |
| External Discovery | Wikipedia, Wikidata |
| Application Type | Progressive Web App |
| Deployment | Render |
| Database Hosting | Neon PostgreSQL |
| Version Control | Git & GitHub |

---

## 🏗️ Application Architecture

```text
                 PANELVERSE 3.0.0
                        |
               Responsive Frontend
                        |
               Node.js HTTP Server
                        |
                    REST API
                        |
          +-------------+-------------+
          |             |             |
     Authentication  Catalogue   Discovery
          |             |             |
          +-------------+-------------+
                        |
                  PostgreSQL
                        |
          +-------------+-------------+
          |             |             |
        Users        My Shelf      Progress
                        |
                     Backups
```

---

## 🚀 Run Locally

### Requirements

- Node.js 20 or newer
- npm
- Neon PostgreSQL or another reachable PostgreSQL database
- Git

### 1. Clone the repository

```bash
git clone https://github.com/sankeraswin579-crypto/Panelverse.git

cd Panelverse
```

### 2. Configure environment variables

Copy `.env.example` to `.env`.

PowerShell:

```powershell
Copy-Item .env.example .env
```

Configure your environment:

```env
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=your_random_secret_of_at_least_32_characters
PORT=3000
```

Never commit `.env` or expose database credentials and session secrets.

### 3. Install dependencies

```bash
npm install
```

### 4. Check JavaScript syntax

```bash
npm run check
```

### 5. Start the application

```bash
npm start
```

Open:

http://localhost:3000

For development with automatic server restarts:

```bash
npm run dev
```

The server initializes its PostgreSQL tables and seeds missing catalogue collections during first initialization.

---

## 🔌 REST API Documentation

### System

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Service health status |

### Discovery and Catalogue

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/discover/comics` | Public comic discovery |
| GET | `/api/characters` | Character directory |
| GET | `/api/comics` | Comic catalogue |
| GET | `/api/reading-paths` | Reading sequences |
| GET | `/api/adaptations` | Comic adaptations |
| GET | `/api/movies` | Movies and series |
| GET | `/api/storylines` | Storyline explorer |
| GET | `/api/events` | Crossover events |
| GET | `/api/teams` | Teams and factions |
| GET | `/api/worlds` | Universes and continuities |

### Reader Features

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/shelf` | Retrieve saved entries |
| POST | `/api/shelf` | Save an entry |
| DELETE | `/api/shelf` | Remove a saved entry |
| GET | `/api/progress` | Retrieve reading progress |
| POST | `/api/progress` | Create or update progress |
| DELETE | `/api/progress` | Remove reading progress |
| POST | `/api/guide` | Curated guide response |

### Profiles and Backups

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/profiles` | List local profiles |
| POST | `/api/profiles` | Create a local profile |
| GET | `/api/backup` | Export profile backup |
| POST | `/api/backup` | Import and merge backup |

---

## 🔍 Live Discovery API

Example request:

```http
GET /api/discover/comics?q=Batman&type=all
```

Supported discovery types:

- `all`
- `characters`
- `comics`

External source availability and results depend on Wikipedia and Wikidata services.

---

## 📖 Reading Progress System

Readers can organize their comics through three statuses:

1. Want to Read
2. Reading
3. Completed

Reading records can include a completion percentage.

Progress is stored in PostgreSQL and associated with the signed-in account.

---

## 🧠 Personalized Recommendations

PanelVerse recommends three comics using:

- Saved characters.
- Preferred universes.
- Active reading progress.
- Existing local catalogue information.

Recommendations are calculated locally in the browser. This is a rule-based recommendation feature, not an external AI service.

The existing PanelVerse Guide is also a curated scripted demo, not a hosted generative AI assistant.

---

## 📦 Account Backup and Portability

PanelVerse supports versioned JSON backups containing saved entries and reading progress.

Features:
- Export personal data.
- Validate imported backups.
- Merge supported entries.
- Restore saved shelf information.
- Restore reading progress.

---

## 🌐 Deployment

PanelVerse uses:

- GitHub for source-code management.
- Render for application hosting.
- Neon for PostgreSQL database hosting.

### Production Application

**Live URL:** https://panelverse-dhu0.onrender.com

**API Health Check:**

https://panelverse-dhu0.onrender.com/api/health

For production deployment:

1. Push the latest code to GitHub.
2. Connect the repository to Render.
3. Configure the production environment variables.
4. Connect the Neon PostgreSQL database.
5. Deploy the application.
6. Verify `/api/health`.
7. Test registration, login, saved shelf, and reading progress.
8. Configure HTTPS and production monitoring.

Never place private environment variables in frontend code.

---

## 📱 Install PanelVerse

PanelVerse supports Progressive Web App installation.

### Desktop (Chrome / Edge)

- Open the deployed HTTPS application.
- Select Install App from the browser menu.

### Android

- Open PanelVerse in Chrome.
- Select Install App or Add to Home Screen.

### iPhone / iPad

- Open PanelVerse in Safari.
- Select Share.
- Choose Add to Home Screen.

The PWA installation does not automatically generate native APK or EXE installers.

---

## 📊 Starter Catalogue

The original documented starter catalogue contains:

| Category | Entries |
|---|---:|
| Characters | 16 |
| Comics | 13 |
| Movies and Series | 11 |
| Story Arcs | 4 |
| Crossover Events | 6 |
| Teams and Factions | 8 |
| Alternate Settings | 5 |

These are starter catalogue figures, not an exhaustive publisher index.

---

## 🔐 Security and Content Rights

PanelVerse is an independent fan discovery project.

### Security considerations

- Passwords are hashed using bcrypt.
- Authentication uses revocable PostgreSQL-backed sessions and HttpOnly cookies.
- Database credentials remain server-side.
- Saved entries and reading progress are account-scoped.
- External discovery links to original sources.

### Content considerations

- PanelVerse does not host or distribute complete copyrighted comic books.
- Character names and story titles remain the property of their respective owners.
- External images and references are subject to their respective licensing terms.
- Official publisher information should be linked where available.

---

## 🚧 Development Roadmap

### Version 3.x — Platform Development

- Continued application improvements.
- Enhanced reader experience.
- Security and performance improvements.
- Expanded comic universe catalogue.
- Improved Android distribution readiness.

### Future Development

- Admin dashboard.
- Catalogue editor.
- Content validation.
- Audit history.
- Email verification.
- Password recovery.
- Advanced reading statistics.
- AI-powered comic Q&A.
- Character explanations.
- Source-cited recommendations.
- Free and premium membership.
- Subscription management.
- Payment integration.
- Community features.
- Publisher partnerships.
- Native Android and iOS distribution.

*Roadmap items are planned development goals, not claims of currently implemented functionality.*

---

## 👨‍💻 Project Developer

**ASWIN SANKAR P S**

AI Engineer | Python Full-Stack Developer | Generative AI & RAG Enthusiast

GitHub: https://github.com/sankeraswin579-crypto

---

## 📄 Project Status

**PanelVerse 3.0.0 — Full-Stack Application**

An evolving superhero comics discovery and reading platform, designed with a scalable backend, persistent reader accounts, and an extensible catalogue architecture.

*Explore heroes. Discover universes. Build your reading journey.*

---

© 2026 PanelVerse. Independent fan discovery project.