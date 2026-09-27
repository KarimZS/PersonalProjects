const path = require("path");
const express = require("express");
const { pool } = require("./db");
const auth = require("./auth");

// Every valid mini key ("<set id>/<mini id>"), so clients can't store arbitrary data.
const MINI_KEYS = new Set(
  require(path.join(__dirname, "..", "public", "data", "minis.json")).sets.flatMap((s) => s.minis.map((m) => s.id + "/" + m.id))
);
const MAX_ITEMS = MINI_KEYS.size;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = express.Router();
router.use(express.json({ limit: "1mb" }));

// Mutating requests must be JSON: browsers can't send that cross-site without a CORS preflight, which we never allow.
router.use((req, res, next) => {
  if (req.method !== "GET" && !req.is("application/json")) return res.status(415).json({ error: "Expected JSON." });
  next();
});
router.use((req, res, next) => (pool ? next() : res.status(503).json({ error: "Accounts are not available right now." })));
router.use(auth.loadUser);

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const publicUser = (u) => ({ email: u.email, plan: u.plan });

function credentials(body) {
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password.length > 200) return { error: "Password is too long." };
  return { email, password };
}

const authLimit = auth.rateLimit({ windowMs: 15 * 60e3, max: 20 });

router.post("/signup", authLimit, wrap(async (req, res) => {
  const c = credentials(req.body);
  if (c.error) return res.status(400).json({ error: c.error });
  const hash = await auth.hashPassword(c.password);
  const { rows } = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id, email, plan",
    [c.email, hash]
  );
  if (!rows[0]) return res.status(409).json({ error: "An account with that email already exists. Try logging in." });
  await auth.createSession(req, res, rows[0].id);
  res.status(201).json({ user: publicUser(rows[0]) });
}));

// Hash of a random password, compared against when the email doesn't exist so response time doesn't reveal it.
const dummyHash = auth.hashPassword(require("crypto").randomBytes(16).toString("hex"));

router.post("/login", authLimit, wrap(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "").slice(0, 200);
  const { rows } = await pool.query("SELECT id, email, plan, password_hash FROM users WHERE lower(email) = $1", [email]);
  const ok = await auth.verifyPassword(password, rows[0] ? rows[0].password_hash : await dummyHash);
  if (!rows[0] || !ok) return res.status(401).json({ error: "Wrong email or password." });
  await auth.createSession(req, res, rows[0].id);
  res.json({ user: publicUser(rows[0]) });
}));

router.post("/logout", wrap(async (req, res) => {
  await auth.destroySession(req, res);
  res.json({ ok: true });
}));

router.get("/me", (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

router.delete("/account", auth.requireUser, authLimit, wrap(async (req, res) => {
  const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  if (!(await auth.verifyPassword(String(req.body?.password || "").slice(0, 200), rows[0].password_hash))) {
    return res.status(401).json({ error: "Wrong password." });
  }
  await pool.query("DELETE FROM users WHERE id = $1", [req.user.id]);
  await auth.destroySession(req, res);
  res.json({ ok: true });
}));

router.get("/collection", auth.requireUser, wrap(async (req, res) => {
  const { rows } = await pool.query("SELECT mini_key, owned, wish FROM collection_items WHERE user_id = $1", [req.user.id]);
  const owned = {}, wish = {};
  for (const r of rows) {
    if (r.owned) owned[r.mini_key] = r.owned;
    if (r.wish) wish[r.mini_key] = 1;
  }
  res.json({ owned, wish });
}));

// Body: { items: [{ key, owned, wish }] } — the full new state of each listed mini.
router.patch("/collection", auth.requireUser, wrap(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items || items.length > MAX_ITEMS) return res.status(400).json({ error: "Invalid items." });
  const keys = [], owned = [], wish = [];
  for (const it of items) {
    if (!MINI_KEYS.has(it?.key)) continue; // unknown/retired mini: ignore rather than fail the batch
    keys.push(it.key);
    owned.push(Math.max(0, Math.min(99, Number.parseInt(it.owned, 10) || 0)));
    wish.push(!!it.wish);
  }
  if (keys.length) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO collection_items (user_id, mini_key, owned, wish)
         SELECT $1, * FROM unnest($2::text[], $3::int[], $4::bool[])
         ON CONFLICT (user_id, mini_key) DO UPDATE SET owned = EXCLUDED.owned, wish = EXCLUDED.wish, updated_at = now()`,
        [req.user.id, keys, owned, wish]
      );
      await client.query("DELETE FROM collection_items WHERE user_id = $1 AND owned = 0 AND NOT wish", [req.user.id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  res.json({ ok: true, saved: keys.length });
}));

router.use((req, res) => res.status(404).json({ error: "Not found." }));
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request too large." });
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

module.exports = router;
