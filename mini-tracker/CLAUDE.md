# Mini Tracker: rules for changes

Real users' collections live in production (Railway Postgres, plus guests' browser storage).
**No change may lose, orphan or silently rewrite user data.** Check every change against the rules below before
pushing; `main` auto-deploys to production.

## User data

- **Mini keys are permanent.** Collections are stored by `<set id>/<mini id>` (built in `scripts/scrape.py`).
  - Never change how set ids or mini ids are derived.
  - `data/published-keys.txt` lists every key ever shipped. It is append-only: never edit or delete lines.
  - The scraper refuses to write data that drops a published key, and `server.js` refuses to start
    (so Railway keeps the previous deploy). Don't bypass either check.
  - **MinisGallery mistakes** are fixed in `data/corrections.json` → `overrides` (display fields only: number, name,
    rarity, size, plus a `note` with the source). Keys never change for a correction. Apply without re-scraping:
    `python3 scripts/scrape.py --apply-corrections`.
  - **When MinisGallery renumbers/renames a mini**, its scraped key changes and the scraper refuses to run. Add an
    `aliases` entry (new scraped key → existing published key) so the mini keeps its key. Never drop the old key.
- **Migrations are additive only.** Add new files in `migrations/` (`002_…sql`, …). Never edit an applied migration,
  and never `DROP`/`RENAME` a table or column or `TRUNCATE`. Shape changes go through add-new-column → backfill →
  switch reads → (leave the old one). Each migration runs in a transaction.
- **The server never deletes collection rows except on explicit user action:** setting a mini to 0 owned and not
  wishlisted, or deleting the account. Unknown or retired keys are ignored on write, never deleted.
- **Browser storage keys are permanent:** `dnd-mini-tracker:v1` (guest collection) and `dnd-mini-tracker:ui`.
  They keep the app's old name on purpose. Renaming them would wipe guests' collections.
- **Export format** (`{ owned, wish }` keyed by mini key) must stay importable. Old exports must keep working.
- **Don't reset or recreate** the Railway Postgres service or its volume, and don't change `DATABASE_URL`
  to a different database, without an explicit request and a verified backup.

## Before pushing

1. `node -e "require('vm').createScript(require('fs').readFileSync('public/app.js','utf8'))"` (syntax check),
   then start the server (`npm start`); it validates published keys on boot.
2. For data or scraper changes: compare the keys against `data/published-keys.txt`. None may be missing.
3. Test account flows against a local Postgres (`DATABASE_URL=… npm start`): signup, login, edit, reload, logout.
4. After deploying, confirm `/health` and `/api/me` respond on production.

## Deploy

Railway service `PersonalProjects` in project `robust-spontaneity`: Root Directory `/mini-tracker`, Watch Paths
`/mini-tracker/**`, health check `/health`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`. Pushing to `main` deploys.
