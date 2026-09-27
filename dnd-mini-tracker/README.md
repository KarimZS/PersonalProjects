# D&D Mini Tracker

A mobile-friendly collection tracker for **D&D Icons of the Realms** core set miniatures.
It covers 43 sets and 2,221 minis, scraped from
[MinisGallery](https://www.minisgallery.com/index.php?id=icons-of-the-realms-core-sets).

## Features

- Browse by set, or all sets at once, with **% complete per set** and overall.
- **Quick add/remove**: use the `−` / `+` buttons to track duplicates, or tap the number badge to toggle owned.
- Filters for **Owned / Missing / Duplicates / Wishlist**, plus rarity, size, search and sort.
- Mark a whole set owned or clear it, with undo.
- Tap a mini's picture to see it larger.
- Your collection is saved in the browser (`localStorage`). Use the ⋮ menu to **export or import** a JSON backup, for example to move it to another device.

## Run locally

```sh
npm start            # http://localhost:3000 (set PORT to change)
```

No dependencies are needed (Node 18+). You can also open `public/index.html` directly from disk.

## Deploy to Railway

1. Create a new Railway service from this GitHub repo. No Root Directory setting is needed:
   the repo root's `package.json` runs `node dnd-mini-tracker/server.js`.
2. Railway detects Node, runs `npm start` and provides `PORT`. The health check is `/health` (see `railway.json`).
3. Under **Settings → Networking**, generate a domain.

(Setting Root Directory to `dnd-mini-tracker` also works.)

## Refreshing the mini list

```sh
npm run scrape       # python3 scripts/scrape.py
```

This re-fetches every set from MinisGallery and rewrites `public/data/minis.json` and `public/data/minis.js`.
Saved collections are keyed by set and mini number and name, so they keep working after a refresh.

Images are loaded directly from MinisGallery. D&D and Icons of the Realms are trademarks of Wizards of the Coast.
