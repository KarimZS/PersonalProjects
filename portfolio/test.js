// Starts the server on a spare port and checks routing, security headers and the www redirect.
const { spawn } = require("child_process");
const assert = require("assert");

const PORT = 3999;
const base = `http://localhost:${PORT}`;
const proc = spawn(process.execPath, ["server.js"], { cwd: __dirname, env: { ...process.env, PORT, CANONICAL_HOST: "example.com" } });

const raw = (path, opts = {}) => new Promise((resolve, reject) => {
  const req = require("http").request(base + path, { method: opts.method || "GET", headers: opts.headers }, (res) => {
    let body = ""; res.on("data", (c) => (body += c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on("error", reject); req.end();
});

(async () => {
  for (let i = 0; i < 50; i++) { try { await raw("/health"); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const home = await raw("/");
  assert.equal(home.status, 200);
  assert.match(home.headers["content-type"], /text\/html/);
  for (const h of ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"]) {
    assert.ok(home.headers[h], `missing ${h}`);
  }
  assert.equal((await raw("/style.css")).status, 200);
  assert.equal((await raw("/.well-known/security.txt")).status, 200);
  assert.equal((await raw("/nope")).status, 404);
  assert.equal((await raw("/../server.js")).status, 404);
  assert.equal((await raw("/%2e%2e/server.js")).status, 404);
  assert.equal((await raw("/%E0%A4%A")).status, 400);
  assert.equal((await raw("/", { method: "POST" })).status, 405);
  const www = await raw("/style.css?x=1", { headers: { Host: "www.example.com" } });
  assert.equal(www.status, 301);
  assert.equal(www.headers.location, "https://example.com/style.css?x=1");
  const evil = await raw("//evil.com", { headers: { Host: "www.example.com" } });
  assert.equal(evil.headers.location, "https://example.com/");
  console.log("all checks passed");
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => proc.kill());
