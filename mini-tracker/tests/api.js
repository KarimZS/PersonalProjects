// Server checks without a browser: backups are admin-only, writes ignore unknown minis, CSV is formula-safe.
const U = process.env.U;
let bad = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) bad = 1; };
async function account(email) {
  const body = JSON.stringify({ email, password: "correct horse battery" });
  let r = await fetch(U + "/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (r.status === 409) r = await fetch(U + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (!r.ok) throw new Error(`can't sign in ${email}: ${r.status}`);
  return r.headers.get("set-cookie").split(";")[0];
}
const call = (cookie, method, url, body) => fetch(U + url, { method, headers: { cookie, ...(body && { "Content-Type": "application/json" }) }, body: body && JSON.stringify(body) });

(async () => {
  const admin = await account(process.env.ADMIN_EMAIL);
  const user = await account(`=formula${Date.now()}@example.com`);
  ok((await (await call(admin, "GET", "/api/me")).json()).user.admin === true, "admin flagged in /api/me");
  ok(!(await (await call(user, "GET", "/api/me")).json()).user.admin, "others not flagged");
  const data = await (await fetch(U + "/data/minis.json")).json();
  const set = data.sets.find((s) => s.minis.length);
  const real = set.id + "/" + set.minis[0].id; // first set may not be listed yet
  const r = await call(user, "PATCH", "/api/collection", { items: [{ key: real, owned: 3 }, { key: "made-up/key", owned: 5 }] });
  ok((await r.json()).saved === 1, "unknown mini keys ignored");
  ok((await fetch(U + "/api/collection", { method: "PATCH", headers: { cookie: user, "Content-Type": "text/plain" }, body: "{}" })).status === 415, "non-JSON writes refused");
  for (const f of ["users", "collection"]) {
    ok((await call(user, "GET", `/api/admin/export/${f}.csv`)).status === 404, `${f}.csv hidden from non-admins`);
    ok((await fetch(U + `/api/admin/export/${f}.csv`)).status === 404, `${f}.csv hidden when logged out`);
    const res = await call(admin, "GET", `/api/admin/export/${f}.csv`);
    const text = await res.text();
    ok(res.status === 200 && /attachment/.test(res.headers.get("content-disposition")), `${f}.csv downloads for admin`);
    ok(!/password|scrypt/.test(text) && /'=formula/.test(text), `${f}.csv has no passwords and is formula-safe`);
  }
  process.exit(bad);
})();
