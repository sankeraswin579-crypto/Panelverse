# PanelVerse 3.1.0 — Upgrade Notes

## What changed

This upgrade preserves the PanelVerse 3.0 application structure, catalogue, frontend, PWA shell, and Android TWA project.

### Backend security

- Replaced stateless signed session cookies with cryptographically random opaque session tokens.
- Only SHA-256 hashes of session tokens are stored in PostgreSQL.
- Sessions are revocable on logout and are deleted automatically when the owning user is deleted.
- Sessions expire after seven days.
- Added PostgreSQL-backed authentication and discovery rate-limit counters. The key stored in the database is an HMAC digest of the client IP, not the raw IP.
- Added indexes for session lookups and expiry cleanup.
- Expired sessions and old rate-limit rows are cleaned during database initialization.
- Existing API health endpoint now reports version `3.1.0`.

### PWA and Android

- Bumped the service-worker cache version so clients fetch the updated app shell.
- Updated Android version name to `3.1.0` and version code to `4`.
- Android debug builds no longer require private release-signing files to be present.
- Release signing is enabled only when a complete local `panelverse-android/keystore.properties` is supplied.

## Database migration

The application creates the new `sessions` and `rate_limits` tables and their indexes using `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` during startup. This is an additive migration; it does not drop or rewrite user, shelf, progress, or catalogue tables.

**Session compatibility:** the new server does not accept the old 3.0 signed session-cookie format. Users will need to sign in again once the 3.1.0 backend is deployed. Their PostgreSQL accounts, saved shelf, and reading progress are not deleted by this change.

## Deploy safely

1. Back up the production Neon database before deployment.
2. Deploy to the existing Render service, not a new duplicate service.
3. Keep `DATABASE_URL` pointing to the production Neon branch only for the production Render service.
4. Keep `SESSION_SECRET` private and at least 32 characters long. Do not put secrets in frontend files or Git.
5. Deploy the 3.1.0 source and check `/api/health`; it should report `version: 3.1.0` and `database: connected`.
6. Test login, logout, shelf persistence, reading progress, and a second account.
7. Existing users must sign in again after the session-format change.

## Android signing

The archive intentionally excludes signing credentials. Restore your own `panelverse-android/keystore.properties` and keystore locally before creating a signed Play Store release. Do not commit either file. The Android version code is now `4`; do not reuse a version code already uploaded to Google Play.

## Not included in this upgrade

The following require additional product decisions or external services and are not represented as completed features:

- Email verification and password-reset email delivery.
- Admin roles, moderation workflows, and an admin dashboard.
- Billing/subscriptions.
- Centralized error monitoring and external uptime alerting.
- A managed distributed rate-limit service; the current counters are PostgreSQL-backed and shared across app instances.
- A tested automated backup/restore schedule.

Do not advertise these as available until implemented and verified.
