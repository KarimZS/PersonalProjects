// The grid draws in batches: scrolling loads more, search reaches every mini, the set list stays current.
const { chromium } = require("playwright");
const U = process.env.NODB;
(async () => {
  const b = await chromium.launch(); let bad = 0; const errors = [];
  const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) bad = 1; };
  for (const [vp, mobile] of [[{ width: 390, height: 844 }, true], [{ width: 1300, height: 900 }, false]]) {
    const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); await p.route("https://www.minisgallery.com/**", (r) => r.abort());
    await p.goto(U + "/#all"); await p.waitForFunction(() => window.__appReady);
    const n0 = await p.locator(".card").count();
    ok(n0 >= 120 && n0 < 400, `${vp.width}px first batch ${n0}`);
    ok(/Showing 3384 of 3384/.test(await p.locator("#resultCount").innerText()), "count shows full total");
    for (let i = 0; i < 6; i++) { await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(250); }
    const n1 = await p.locator(".card").count();
    ok(n1 > n0, `scrolling loads more: ${n0} -> ${n1}`);
    await p.click("#gridMore").catch(() => {});
    // search finds minis beyond the first batch
    await p.fill("#search", "tiamat"); await p.waitForTimeout(500);
    ok((await p.locator(".card").count()) >= 2, "search finds later minis: " + (await p.locator(".card").count()));
    await p.fill("#search", ""); await p.waitForTimeout(400);
    // tap updates the sidebar (desktop now, mobile when drawer opens)
    await p.goto(U + "/#icons-of-the-realms-ghost-light"); await p.waitForFunction(() => window.__appReady);
    await p.locator(".card").first().locator("[data-action=inc]").click();
    if (mobile) { await p.tap("#openSets"); await p.waitForTimeout(300); }
    const row = await p.locator('#setList .set-item.active .meta').innerText();
    ok(/1 \/ /.test(row), `${vp.width}px sidebar shows the change: ${row}`);
    await ctx.close();
  }
  ok(!errors.length, "no page errors " + errors.join("; "));
  await b.close(); process.exit(bad);
})();
