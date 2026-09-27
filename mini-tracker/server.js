const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { pool, migrate } = require("./src/db");

const PORT = process.env.PORT || 3000;
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1); // Railway terminates TLS in front of us; needed for req.secure / req.ip.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

app.get("/health", (req, res) => res.type("text").send("ok"));

// index.html with each local script/stylesheet URL stamped with a hash of its contents (app.js?v=1a2b3c4d),
// so browsers always load the files that match the page after a deploy, whatever they cached before.
const PUBLIC = path.join(__dirname, "public");
const indexHtml = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8").replace(
  /(src|href)="((?!https?:)[^"?#]+\.(?:js|css))"/g,
  (m, attr, file) => {
    const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(PUBLIC, file))).digest("hex").slice(0, 10);
    return `${attr}="${file}?v=${hash}"`;
  }
);
app.get(["/", "/index.html"], (req, res) => res.set("Cache-Control", "no-cache").type("html").send(indexHtml));
app.use("/api", require("./src/api"));
// no-cache = always revalidate (cheap, via ETag), so a deploy never mixes new HTML with stale JS.
app.use(express.static(path.join(__dirname, "public"), { setHeaders: (res) => res.setHeader("Cache-Control", "no-cache") }));

async function start() {
  if (pool) await migrate();
  else console.warn("DATABASE_URL is not set: running without accounts (guest mode only).");
  app.listen(PORT, () => console.log(`Mini Tracker on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
