// Static portfolio server. No dependencies on purpose: nothing to patch, nothing in the supply chain.
// Serves files from public/ with strict security headers; only GET and HEAD are allowed.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
// The canonical host. Requests for www.<host> are redirected here. Unset locally.
const CANONICAL_HOST = (process.env.CANONICAL_HOST || "").toLowerCase();

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

const SECURITY_HEADERS = {
  // Everything is first-party and there is no JavaScript, so the policy can be this tight.
  "Content-Security-Policy":
    "default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

// Read every file once at startup: the site is small, and nothing on disk is touched per request.
const files = new Map();
(function load(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) load(full);
    else files.set("/" + path.relative(PUBLIC, full).split(path.sep).join("/"), fs.readFileSync(full));
  }
})(PUBLIC);
const notFoundPage = files.get("/404.html");

function send(req, res, status, body, type, extra = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": type, "Content-Length": body.length, ...extra });
  res.end(req.method === "HEAD" ? undefined : body);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(req, res, 405, Buffer.from("Method not allowed"), TYPES[".txt"], { Allow: "GET, HEAD" });
  }

  const host = (req.headers.host || "").toLowerCase().replace(/:\d+$/, "");
  if (CANONICAL_HOST && host === "www." + CANONICAL_HOST) {
    // Path only, never the Host header, goes into the redirect, so it cannot point anywhere else.
    const target = "https://" + CANONICAL_HOST + (req.url.startsWith("/") && !req.url.startsWith("//") ? req.url : "/");
    return send(req, res, 301, Buffer.alloc(0), TYPES[".txt"], { Location: target });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    return send(req, res, 400, Buffer.from("Bad request"), TYPES[".txt"]);
  }

  if (pathname === "/health") return send(req, res, 200, Buffer.from("ok"), TYPES[".txt"], { "Cache-Control": "no-store" });

  // Lookups are against the preloaded map, so "../" and the like can never reach the filesystem.
  let key = pathname.endsWith("/") ? pathname + "index.html" : pathname;
  if (!files.has(key) && files.has(key + ".html")) key += ".html";
  if (!files.has(key) && files.has(key + "/index.html")) {
    return send(req, res, 301, Buffer.alloc(0), TYPES[".txt"], { Location: pathname + "/" });
  }
  const body = files.get(key);
  if (!body) return send(req, res, 404, notFoundPage || Buffer.from("Not found"), TYPES[".html"], { "Cache-Control": "no-cache" });

  const type = TYPES[path.extname(key).toLowerCase()] || "application/octet-stream";
  // HTML and CSS revalidate so a deploy shows up at once; everything else (images, PDFs) can be cached for a day.
  const cache = /\.(html|css|txt)$/.test(key) ? "no-cache" : "public, max-age=86400";
  send(req, res, 200, body, type, { "Cache-Control": cache });
});

server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.listen(PORT, () => console.log(`Portfolio on http://localhost:${PORT}`));
