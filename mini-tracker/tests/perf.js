// Timings with ~850 minis owned and the CPU slowed 6x (a mid-range phone). Prints numbers; no pass/fail.
const { chromium } = require("playwright");
const U = process.env.NODB;
// In-page timing: click handler + style/layout until the next frame is painted.
const tapTime = (p, sel, i) => p.evaluate(([sel, i]) => new Promise((res) => {
  const el = document.querySelectorAll(sel)[i]; const t = performance.now(); el.click();
  requestAnimationFrame(() => setTimeout(() => res(Math.round(performance.now() - t))));
}), [sel, i]);
(async () => {
  const b = await chromium.launch();
  for (const layout of ["classic", "releases"]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage(); await p.route("https://www.minisgallery.com/**", (r) => r.abort());
    await p.goto(U + "/"); await p.waitForFunction(() => window.__appReady);
    await p.evaluate((layout) => {
      const keys = window.MINIS_DATA.sets.flatMap((s) => s.minis.map((m) => s.id + "/" + m.id));
      const owned = {}; for (let i = 0; i < keys.length; i += 4) owned[keys[i]] = 1;
      localStorage.setItem("dnd-mini-tracker:v1", JSON.stringify({ owned, wish: {} }));
      localStorage.setItem("dnd-mini-tracker:ui", JSON.stringify({ set: "all", layout }));
    }, layout);
    const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    const t0 = Date.now(); await p.reload(); await p.waitForFunction(() => window.__appReady);
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r))));
    console.log(`${layout}: load ${Date.now() - t0}ms | overall ${(await p.locator("#overall").innerText()).replace(/\s+/g, " ")} | cards ${await p.evaluate(() => document.querySelectorAll(".card").length)}`);
    const all = []; for (let i = 0; i < 3; i++) all.push(await tapTime(p, ".card [data-action=inc]", i));
    console.log(`  tap in All sets: ${all.join(", ")}ms`);
    console.log(`  Owned filter: ${await tapTime(p, '[data-status="owned"]', 0)}ms, cards ${await p.evaluate(() => document.querySelectorAll(".card").length)}`);
    const own = []; for (let i = 0; i < 3; i++) own.push(await tapTime(p, ".card [data-action=inc]", i));
    console.log(`  tap in Owned: ${own.join(", ")}ms`);
    console.log(`  back to All: ${await tapTime(p, '[data-status="all"]', 0)}ms`);
    await p.evaluate(() => { location.hash = "#icons-of-the-realms-ghost-light"; }); await p.waitForTimeout(1500);
    const set = []; for (let i = 0; i < 3; i++) set.push(await tapTime(p, ".card [data-action=inc]", i));
    console.log(`  tap in a set: ${set.join(", ")}ms`);
    await ctx.close();
  }
  await b.close();
})();
