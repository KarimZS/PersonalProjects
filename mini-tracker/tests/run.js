// Browser tests for Mini Tracker. Needs Playwright (npm i -g playwright, or set NODE_PATH to where it is) and a
// throwaway Postgres: TEST_DATABASE_URL=postgres://… node tests/run.js [--perf]
// Never point TEST_DATABASE_URL at production: the tests create accounts.
const { spawn, execFileSync } = require("child_process");
const path = require("path");

const DB = process.env.TEST_DATABASE_URL;
if (!DB) { console.error("Set TEST_DATABASE_URL to a throwaway Postgres database."); process.exit(2); }
const root = path.join(__dirname, "..");
const servers = [];
function serve(port, env) {
  const child = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env, PORT: String(port), ...env }, stdio: ["ignore", "pipe", "pipe"] });
  servers.push(child);
  return new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => { if (/Mini Tracker on/.test(d)) resolve(); });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("exit", (code) => reject(new Error(`server on ${port} exited (${code})`)));
  });
}

(async () => {
  // A fresh admin account each run, so reruns against the same database work.
  const env = { U: "http://localhost:4196", NODB: "http://localhost:4197", ADMIN_EMAIL: `admin-${Date.now()}@example.com` };
  try {
    await serve(4196, { DATABASE_URL: DB, ADMIN_EMAILS: env.ADMIN_EMAIL });
    await serve(4197, { DATABASE_URL: "" });
    let failed = 0;
    const suites = ["api.js", "flows.js", "grid.js", ...(process.argv.includes("--perf") ? ["perf.js"] : [])];
    for (const f of suites) {
      console.log(`\n# ${f}`);
      try { execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: "inherit", env: { ...process.env, ...env } }); }
      catch { failed++; }
    }
    console.log(failed ? `\n${failed} suite(s) failed` : "\nAll suites passed");
    process.exitCode = failed ? 1 : 0;
  } finally {
    for (const s of servers) s.kill();
  }
})();
