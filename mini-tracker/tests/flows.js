// Accounts, sync, guest mode, search, menus, both layouts and linked minis. Run via tests/run.js.
const { chromium } = require("playwright");
const U = process.env.U, NODB = process.env.NODB;
const DL = "icons-of-the-realms-dragonlance-shadow-of-the-dragon-queen";
(async () => {
  const b = await chromium.launch(); let bad = 0; const errors = [];
  const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) bad = 1; };
  const mk = async (mobile = true) => {
    const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1300, height: 900 } });
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); await p.route("https://www.minisgallery.com/**", (r) => r.abort());
    return p;
  };
  const ready = (p) => p.waitForFunction(() => window.__appReady);
  const out = (p, key) => p.locator(`.card[data-key="${key}"] output`).textContent();
  const email = `u${Date.now()}@example.com`, pw = "correct horse battery";

  // Guest: add, wishlist, search, detail, menu
  const g = await mk(); await g.goto(U + "/#icons-of-the-realms-ghost-light"); await ready(g);
  const first = await g.locator(".card").first().getAttribute("data-key");
  await g.locator(".card").first().locator("[data-action=inc]").tap();
  await g.locator(".card").first().locator("[data-action=inc]").tap();
  await g.locator(".card").nth(1).locator("[data-action=wish]").tap();
  ok((await out(g, first)) === "2", "guest + twice");
  const st = await g.evaluate(() => JSON.parse(localStorage.getItem("dnd-mini-tracker:v1")));
  ok(st.owned[first] === 2 && Object.keys(st.wish).length === 1, "guest saved in browser");
  await g.goto(U + "/#all"); await ready(g);
  await g.fill("#search", "zombie 1"); await g.waitForTimeout(400);
  const names = await g.locator(".card .name").allTextContents();
  const nums = await g.locator(".card .num").allTextContents();
  ok(names.length > 0 && names.every((n) => /zombie/i.test(n)) && nums.every((n) => /^1[a-z]?$/i.test(n)), "search 'zombie 1': " + names.length);
  await g.tap("[data-clear=search]"); await g.waitForTimeout(300);
  await g.goto(U + "/#icons-of-the-realms-ghost-light"); await ready(g);
  await g.locator(".card .img").first().tap(); ok(await g.locator("#detail").isVisible(), "detail opens");
  await g.tap("#detailClose"); ok(!(await g.locator("#detail").isVisible()), "detail closes");
  await g.tap("#openMenu"); ok(await g.locator("#menu").isVisible(), "menu opens on tap");
  ok(!(await g.locator("#resetBtn, #deleteAccountBtn").count()), "no reset/delete buttons");
  await g.tap("#openMenu");
  for (const path of ["/#all", "/#" + DL, "/login", "/signup"]) {
    await g.goto(U + path); await g.waitForTimeout(600);
    const w = await g.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(w[0] <= w[1], `no sideways scroll ${path} (${w})`);
  }

  // Sign up from the guest browser: guest collection merges
  await g.goto(U + "/signup?next=%23icons-of-the-realms-ghost-light");
  await g.fill("#authEmail", email); await g.fill("#authPassword", "short"); await g.tap("#authSubmit");
  ok(/8 characters/.test(await g.locator("#authError").innerText()), "short password rejected");
  await g.fill("#authPassword", pw); await g.tap("#authSubmit");
  await g.waitForURL(/ghost-light/); await ready(g); await g.waitForSelector("#openMenuUser:not([hidden])"); await g.waitForTimeout(1500);
  ok((await out(g, first)) === "2", "signup kept guest count");
  const server = await g.evaluate(() => fetch("/api/collection").then((r) => r.json()));
  ok(server.owned[first] === 2 && Object.keys(server.wish).length === 1, "guest collection saved to account");
  await g.locator(`.card[data-key="${first}"] [data-action=dec]`).tap(); await g.waitForTimeout(1500);
  await g.reload(); await ready(g); await g.waitForSelector("#openMenuUser:not([hidden])");
  ok((await out(g, first)) === "1", "edit survives reload");

  // Second device: login sees collection; wrong password rejected; logout clears
  const d = await mk(false); await d.goto(U + "/login");
  await d.fill("#authEmail", email); await d.fill("#authPassword", "wrong wrong"); await d.click("#authSubmit");
  await d.waitForSelector("#authError:not([hidden])"); ok(/Wrong/.test(await d.locator("#authError").innerText()), "wrong password rejected");
  await d.fill("#authPassword", pw); await d.click("#authSubmit"); await d.waitForURL(U + "/"); await ready(d);
  await d.waitForSelector("#openMenuUser:not([hidden])");
  await d.goto(U + "/#icons-of-the-realms-ghost-light"); await ready(d); await d.waitForTimeout(800);
  ok((await out(d, first)) === "1", "other device sees collection");
  await d.click("#openMenuUser"); await d.click("#logoutBtn"); await d.waitForSelector("#loginBtn:not([hidden])");
  ok((await out(d, first)) === "0", "logout clears view");

  // Release layout: switch, linked ownership saved to both keys, promos
  await g.goto(U + "/#" + DL); await ready(g); await g.waitForSelector("#openMenuUser:not([hidden])");
  ok((await g.locator(".card").count()) === 62, "classic is default");
  await g.tap("#openMenuUser"); await Promise.all([g.waitForEvent("load"), g.tap("#layoutBtn")]); await ready(g);
  await g.waitForSelector("#openMenuUser:not([hidden])");
  ok((await g.locator(".card").count()) === 53, "release layout: 49 boosters + 4 promos");
  const soth = await g.evaluate(() => window.MINIS_DATA.org.same.find((x) => x.some((k) => k.endsWith("/lord-soth-2"))));
  await g.goto(U + "/#" + soth[0].split("/")[0]); await ready(g); await g.waitForTimeout(800);
  await g.locator(`.card[data-key="${soth[0]}"] [data-action=inc]`).tap(); await g.waitForTimeout(1500);
  const s2 = await g.evaluate(() => fetch("/api/collection").then((r) => r.json()));
  ok(soth.every((k) => s2.owned[k] === 1), "linked mini saved under both keys");
  await g.goto(U + "/?layout=classic#" + DL); await ready(g); await g.waitForTimeout(800);
  ok((await out(g, soth[1])) === "1", "classic shows the same count");

  // No database: guest only
  const n = await mk(); await n.goto(NODB + "/"); await ready(n); await n.waitForTimeout(800);
  ok(!(await n.locator("#loginBtn").isVisible()), "no-DB hides login");
  ok(!errors.length, "no page errors " + errors.join("; "));
  await b.close(); process.exit(bad);
})();
