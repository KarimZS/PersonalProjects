# Portfolio

The personal site at **www.karimzsoliman.com**: a single static page (experience, about, contact) served by a tiny Node
server with no dependencies.

## Editing

All content is in `public/index.html`; look for the `TODO` comments. Styles are in `public/style.css`.
To add a project, copy one `<li>` in the "Selected work" list.

## Security

- No dependencies, no JavaScript, no cookies, no third-party fonts or analytics.
- Every response has a strict Content-Security-Policy (first-party only, no scripts), HSTS, `nosniff`,
  `X-Frame-Options: DENY`, a locked-down Permissions-Policy and cross-origin isolation headers.
- Files are loaded into memory at startup and served from that map, so request paths never touch the filesystem.
- Only `GET` and `HEAD` are accepted.
- `/.well-known/security.txt` says how to report a problem.

## Run locally

```sh
npm start        # http://localhost:3000
npm test         # starts the server and checks routes, headers and redirects
```

| Env var | Purpose |
| --- | --- |
| `PORT` | Port to listen on (default 3000). Railway sets it. |
| `CANONICAL_HOST` | Optional. A bare domain; requests to `www.` + this host are redirected to it. Unset in production. |

## Deploying

The site lives at `www.karimzsoliman.com` (a CNAME to Railway, in Squarespace DNS). The bare `karimzsoliman.com`
is redirected to `www` by Squarespace domain forwarding, so it never reaches this server. `minis.` is a separate service.


A Railway service with **Root Directory** `/portfolio` and **Watch Paths** `/portfolio/**`, healthcheck `/health`.
