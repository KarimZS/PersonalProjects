const crypto = require("crypto");
const { promisify } = require("util");
const { pool } = require("./db");

const scrypt = promisify(crypto.scrypt);
const COOKIE = "sid";
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, key] = String(stored).split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(req, res, token) {
  const attrs = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${SESSION_DAYS * 86400}`];
  if (req.secure) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearSessionCookie(req, res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${req.secure ? "; Secure" : ""}`);
}

async function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [sha256(token), userId]
  );
  setSessionCookie(req, res, token);
}

async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  clearSessionCookie(req, res);
}

// Attaches req.user ({ id, email, plan }) when the request carries a valid session.
async function loadUser(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token || !pool) return next();
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.plan, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)]
    );
    if (rows[0]) {
      req.user = { id: rows[0].id, email: rows[0].email, plan: rows[0].plan };
      // Sliding expiry: renew sessions that are past the halfway point.
      if (rows[0].expires_at - Date.now() < (SESSION_DAYS / 2) * 86400e3) {
        await pool.query(`UPDATE sessions SET expires_at = now() + interval '${SESSION_DAYS} days' WHERE token_hash = $1`, [sha256(token)]);
        setSessionCookie(req, res, token);
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please log in." });
  next();
}

// Small in-memory limiter for auth endpoints (per IP). Resets on restart, which is fine for a single instance.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) hits.set(key, { start: now, count: 1 });
    else if (++entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.start + windowMs - now) / 1000));
      return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    }
    if (hits.size > 10000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    next();
  };
}

module.exports = { hashPassword, verifyPassword, createSession, destroySession, loadUser, requireUser, rateLimit };
