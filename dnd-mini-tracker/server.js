const path = require("path");
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
app.use("/api", require("./src/api"));
// no-cache = always revalidate (cheap, via ETag), so a deploy never mixes new HTML with stale JS.
app.use(express.static(path.join(__dirname, "public"), { setHeaders: (res) => res.setHeader("Cache-Control", "no-cache") }));

async function start() {
  if (pool) await migrate();
  else console.warn("DATABASE_URL is not set: running without accounts (guest mode only).");
  app.listen(PORT, () => console.log(`D&D mini tracker on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
