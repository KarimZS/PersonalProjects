# D&D Mini Tracker

A mobile-friendly collection tracker for **D&D Icons of the Realms** miniatures.
It covers every Icons of the Realms category on
[MinisGallery](https://www.minisgallery.com/index.php?id=icons-of-the-realms): Core Sets,
Premium Sets, Special Release Sets (Warbands, Adult Dragons, Classic Monsters and more), Premium Figures and Promos.
That's 275 sets and 3,194 minis.

## Features

- Browse by set, by sub-series (for example Warbands), by whole category, or everything at once,
  with **% complete** at every level.
- **Quick add/remove**: use the `−` / `+` buttons to track duplicates, or tap the number badge to toggle owned.
- Filters for **Owned / Missing / Duplicates / Wishlist**, plus rarity, size, search and sort.
- Mark a whole set owned or clear it, with undo.
- Tap a mini's picture to see it larger.
- **Accounts** (email and password): each user's collection is stored in Postgres and syncs across devices.
  Guests can use the tracker without an account, with their collection saved in the browser. When a guest signs up or
  logs in, their browser collection is merged into the account.
- **Export or import** a JSON backup from the menu. Users can delete their account, which also deletes their collection.

## How it works

- `server.js`: an Express app that serves `public/` and the JSON API under `/api`, and runs DB migrations on startup.
- `src/api.js`: routes for signup, login, logout, the current user, account deletion, and reading or updating the collection.
- `src/auth.js`: scrypt password hashing, and random session tokens stored hashed in Postgres and sent as an
  `HttpOnly; SameSite=Lax` cookie (with `Secure` over HTTPS). Sessions last 30 days and renew as they're used.
  Auth endpoints are rate-limited per IP.
- `src/db.js` and `migrations/*.sql`: the schema (`users`, `sessions`, `collection_items`), applied in order, each once.
- `public/app.js`: the front end. When logged in, it syncs changes in batches: it sends the minis that differ from
  what the server has, retries if offline, and makes a final save when the tab closes.

Mutating API calls must be `application/json`, so plain cross-site form posts are rejected. Mini keys are checked against
`public/data/minis.json`. Without `DATABASE_URL` the app still runs, but in guest-only mode.

## Run locally

```sh
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/minis npm start   # http://localhost:3000
```

| Env var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Optional; without it the app runs in guest-only mode. |
| `PORT` | Port to listen on (default 3000). Railway sets it. |

## Deploy to Railway

This repo holds several projects, so each one is its own Railway service. There is no `railway.json`,
because Railway has deprecated config-as-code. These settings live on the service instead:

| Setting | Value |
| --- | --- |
| Source | this repo, branch `main` |
| Root Directory | `/dnd-mini-tracker` |
| Watch Paths | `/dnd-mini-tracker/**` (changes to other projects don't redeploy this one) |
| Healthcheck Path | `/health` |
| Restart Policy | On failure |
| Variable `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway Postgres in the same project, over the private network) |

Railpack detects Node from `package.json` and runs `npm start`. The server listens on Railway's `PORT`.

## Refreshing the mini list

```sh
npm run scrape       # python3 scripts/scrape.py
```

This crawls every Icons of the Realms category on MinisGallery and rewrites `public/data/minis.json` and `public/data/minis.js`.
Saved collections are keyed by set and mini number and name, so they keep working after a refresh.

Images are loaded directly from MinisGallery. D&D and Icons of the Realms are trademarks of Wizards of the Coast.
