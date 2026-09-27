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
- Your collection is saved in the browser (`localStorage`). Use the ⋮ menu to **export or import** a JSON backup, for example to move it to another device.

## Run locally

```sh
npm start            # http://localhost:3000 (set PORT to change)
```

No dependencies are needed (Node 18+). You can also open `public/index.html` directly from disk.

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

Railpack detects Node from `package.json` and runs `npm start`. The server listens on Railway's `PORT`.

## Refreshing the mini list

```sh
npm run scrape       # python3 scripts/scrape.py
```

This crawls every Icons of the Realms category on MinisGallery and rewrites `public/data/minis.json` and `public/data/minis.js`.
Saved collections are keyed by set and mini number and name, so they keep working after a refresh.

Images are loaded directly from MinisGallery. D&D and Icons of the Realms are trademarks of Wizards of the Coast.
