(function () {
  "use strict";

  const DATA = window.MINIS_DATA;
  const STORE_KEY = "dnd-mini-tracker:v1";
  const UI_KEY = "dnd-mini-tracker:ui";
  const ALL = "all";
  const SIZE_ORDER = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan", "Colossal"];
  const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Very Rare", "Ultra Rare", "Super Rare", "Unique", "Chase", "Promo"];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- data prep ----------
  const sets = DATA.sets;
  const minis = [];
  for (const set of sets) {
    set.minis.forEach((m, i) => {
      m.key = set.id + "/" + m.id;
      m.set = set;
      m.order = i;
      m.baseRarity = m.rarity.replace(/\s*\(?variant\)?/i, "").trim() || "Unknown";
      m.variant = /variant/i.test(m.rarity);
      m.sizeGroup = SIZE_ORDER.includes(m.size) ? m.size : "Other";
      m.search = (m.name + " " + m.number + " " + m.rarity + " " + m.size).toLowerCase();
      minis.push(m);
    });
  }
  const byKey = new Map(minis.map((m) => [m.key, m]));

  function rarityClass(r) {
    if (/very rare|ultra rare|super rare/i.test(r)) return "r-veryrare";
    if (/uncommon/i.test(r)) return "r-uncommon";
    if (/rare/i.test(r)) return "r-rare";
    if (/common/i.test(r)) return "r-common";
    if (/unique|chase/i.test(r)) return "r-unique";
    if (/promo/i.test(r)) return "r-promo";
    return "r-other";
  }
  const rarityRank = (r) => { const i = RARITY_ORDER.indexOf(r); return i < 0 ? 99 : i; };
  const sizeRank = (s) => { const i = SIZE_ORDER.indexOf(s); return i < 0 ? 99 : i; };
  const numRank = (n) => { const v = parseInt(n, 10); return isNaN(v) ? 9999 : v; };

  // ---------- persistence ----------
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }

  let col = load(STORE_KEY, {});
  col.owned = col.owned || {};
  col.wish = col.wish || {};
  const persist = () => save(STORE_KEY, { owned: col.owned, wish: col.wish, updated: new Date().toISOString() });

  const ui = Object.assign({ set: ALL, status: "all", rarity: "", size: "", sort: "number", q: "" }, load(UI_KEY, {}));
  const persistUi = () => save(UI_KEY, { set: ui.set, status: ui.status, sort: ui.sort });
  ui.q = ""; ui.rarity = ""; ui.size = "";

  const count = (m) => col.owned[m.key] || 0;

  function setCount(m, n) {
    n = Math.max(0, Math.min(99, n));
    if (n) col.owned[m.key] = n; else delete col.owned[m.key];
    persist();
  }

  // ---------- stats ----------
  function stats(list) {
    let owned = 0, total = 0;
    for (const m of list) { if (count(m)) owned++; total += count(m); }
    const n = list.length;
    return { owned, n, total, dupes: total - owned, pct: n ? Math.floor((owned / n) * 100) : 0 };
  }
  const pctLabel = (s) => (s.n && s.owned === s.n ? "100%" : s.pct + "%");

  // ---------- rendering ----------
  function currentSet() { return sets.find((s) => s.id === ui.set) || null; }
  function scope() { const s = currentSet(); return s ? s.minis : minis; }

  function renderOverall() {
    const s = stats(minis);
    $("overall").innerHTML =
      `<div class="bar${s.owned === s.n ? " done" : ""}"><span style="width:${(s.owned / s.n) * 100}%"></span></div>` +
      `<span><strong>${s.owned}</strong> / ${s.n}</span>`;
  }

  function renderSetList() {
    const q = $("setSearch").value.trim().toLowerCase();
    const all = stats(minis);
    let html = `<button class="set-item all${ui.set === ALL ? " active" : ""}" data-set="${ALL}">
      <div class="row"><span class="name">All sets</span><span class="pct">${pctLabel(all)}</span></div>
      <div class="meta">${all.owned} of ${all.n} minis · ${sets.length} sets</div>
      <div class="bar"><span style="width:${all.pct}%"></span></div></button>`;
    for (const set of sets) {
      if (q && !set.name.toLowerCase().includes(q)) continue;
      const s = stats(set.minis);
      const done = s.n && s.owned === s.n;
      html += `<button class="set-item${ui.set === set.id ? " active" : ""}${done ? " complete" : ""}" data-set="${esc(set.id)}">
        <div class="row"><span class="name">${esc(set.name)}</span><span class="pct">${s.n ? pctLabel(s) : "—"}</span></div>
        <div class="meta">${esc(set.release)} · ${s.n ? `${s.owned} / ${s.n}` : "not yet listed"}</div>
        <div class="bar"><span style="width:${s.pct}%"></span></div></button>`;
    }
    $("setList").innerHTML = html;
  }

  function renderSetHeader() {
    const set = currentSet();
    const s = stats(scope());
    const done = s.n && s.owned === s.n;
    const title = set ? esc(set.name) : "All sets";
    const meta = set
      ? [set.release, ...set.info.slice(0, -1)].filter(Boolean).map(esc).join(" · ") +
        ` · <a href="${esc(set.url)}" target="_blank" rel="noopener">MinisGallery ↗</a>`
      : `${sets.length} core sets`;
    $("setHeader").innerHTML = `
      <div><h2>${title}</h2><div class="meta">${meta}</div></div>
      <div class="set-stats">
        <div class="ring${done ? " done" : ""}" style="--p:${s.n ? (s.owned / s.n) * 100 : 0}" data-label="${pctLabel(s)}"></div>
        <div class="stat"><b>${s.owned}</b><span>Owned</span></div>
        <div class="stat"><b>${s.n - s.owned}</b><span>Missing</span></div>
        <div class="stat"><b>${s.dupes}</b><span>Dupes</span></div>
      </div>
      ${set && s.n ? `<div class="set-actions">
        <button class="btn" data-action="own-all">Mark all owned</button>
        <button class="btn" data-action="clear-set">Clear set</button></div>` : ""}`;
    document.title = (set ? set.name + " · " : "") + "D&D Mini Tracker";
  }

  function filtered() {
    const q = ui.q.trim().toLowerCase();
    let list = scope().filter((m) => {
      const c = count(m);
      if (ui.status === "owned" && !c) return false;
      if (ui.status === "missing" && c) return false;
      if (ui.status === "dupes" && c < 2) return false;
      if (ui.status === "wish" && !col.wish[m.key]) return false;
      if (ui.rarity && m.baseRarity !== ui.rarity) return false;
      if (ui.size && m.sizeGroup !== ui.size) return false;
      if (q && !m.search.includes(q)) return false;
      return true;
    });
    const cmp = {
      number: (a, b) => numRank(a.number) - numRank(b.number) || a.order - b.order,
      name: (a, b) => a.name.localeCompare(b.name),
      rarity: (a, b) => rarityRank(a.baseRarity) - rarityRank(b.baseRarity) || numRank(a.number) - numRank(b.number),
      size: (a, b) => sizeRank(a.size) - sizeRank(b.size) || numRank(a.number) - numRank(b.number),
    }[ui.sort];
    // Keep sets grouped in the all-sets view; sort within each set.
    const setIdx = new Map(sets.map((s, i) => [s.id, i]));
    list.sort((a, b) => (ui.set === ALL ? setIdx.get(a.set.id) - setIdx.get(b.set.id) : 0) || cmp(a, b));
    return list;
  }

  function cardHtml(m) {
    const c = count(m);
    const wish = !!col.wish[m.key];
    return `<article class="card${c ? " owned" : ""}" data-key="${esc(m.key)}">
      <button class="img" data-action="detail" aria-label="View ${esc(m.name)}">
        <img loading="lazy" decoding="async" src="${esc(m.image)}" alt="" onerror="this.parentNode.classList.add('broken')">
      </button>
      <button class="num" data-action="toggle" title="${c ? "Mark as not owned" : "Mark as owned"}"
        aria-pressed="${!!c}">${esc(m.number || "—")}</button>
      <button class="wish${wish ? " on" : ""}" data-action="wish" aria-pressed="${wish}" aria-label="Wishlist">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>
      </button>
      <div class="body">
        <div class="name">${esc(m.name)}</div>
        <div class="tags">
          <span class="tag rarity ${rarityClass(m.rarity)}">${esc(m.rarity || "Unknown")}</span>
          ${m.size ? `<span class="tag">${esc(m.size)}</span>` : ""}
        </div>
        <div class="counter">
          <button data-action="dec" aria-label="Remove one" ${c ? "" : "disabled"}>−</button>
          <output aria-label="Owned">${c}</output>
          <button data-action="inc" aria-label="Add one">+</button>
        </div>
      </div>
    </article>`;
  }

  function renderGrid() {
    const list = filtered();
    let html = "";
    let lastSet = null;
    for (const m of list) {
      if (ui.set === ALL && m.set !== lastSet) {
        lastSet = m.set;
        const s = stats(m.set.minis);
        html += `<h3 class="group-title"><span>${esc(m.set.name)}</span><span>${s.owned} / ${s.n} · ${pctLabel(s)}</span></h3>`;
      }
      html += cardHtml(m);
    }
    $("grid").innerHTML = html;
    $("empty").hidden = list.length > 0 || scope().length === 0;
    $("resultCount").textContent = scope().length === 0
      ? "This set's minis haven't been listed yet."
      : `Showing ${list.length} of ${scope().length} minis`;
  }

  function renderFilterOptions() {
    const list = scope();
    const rarities = [...new Set(list.map((m) => m.baseRarity))].sort((a, b) => rarityRank(a) - rarityRank(b));
    const sizes = [...new Set(list.map((m) => m.sizeGroup))].sort((a, b) => sizeRank(a) - sizeRank(b));
    if (!rarities.includes(ui.rarity)) ui.rarity = "";
    if (!sizes.includes(ui.size)) ui.size = "";
    $("rarity").innerHTML = `<option value="">Any rarity</option>` + rarities.map((r) => `<option${r === ui.rarity ? " selected" : ""}>${esc(r)}</option>`).join("");
    $("size").innerHTML = `<option value="">Any size</option>` + sizes.map((s) => `<option${s === ui.size ? " selected" : ""}>${esc(s)}</option>`).join("");
  }

  function renderAll() {
    renderOverall();
    renderSetList();
    renderSetHeader();
    renderFilterOptions();
    renderGrid();
    document.querySelectorAll("#statusChips .chip").forEach((b) => b.classList.toggle("active", b.dataset.status === ui.status));
    $("sort").value = ui.sort;
  }

  // Refresh stats + one card after a quick add/remove without re-rendering the grid (keeps scroll & focus).
  function refreshAfterChange(m) {
    const card = $("grid").querySelector(`.card[data-key="${CSS.escape(m.key)}"]`);
    if (card) {
      const c = count(m);
      card.classList.toggle("owned", !!c);
      card.querySelector("output").textContent = c;
      card.querySelector("[data-action=dec]").disabled = !c;
      const num = card.querySelector(".num");
      num.setAttribute("aria-pressed", !!c);
      num.title = c ? "Mark as not owned" : "Mark as owned";
      const wish = card.querySelector(".wish");
      wish.classList.toggle("on", !!col.wish[m.key]);
      wish.setAttribute("aria-pressed", !!col.wish[m.key]);
    }
    renderOverall();
    renderSetList();
    renderSetHeader();
    if (ui.set === ALL) {
      const s = stats(m.set.minis);
      const title = [...$("grid").querySelectorAll(".group-title")].find((h) => h.firstChild.textContent === m.set.name);
      if (title) title.lastChild.textContent = `${s.owned} / ${s.n} · ${pctLabel(s)}`;
    }
  }

  // ---------- detail dialog ----------
  function openDetail(m) {
    const c = count(m);
    $("detailBody").innerHTML = `
      <img src="${esc(m.image)}" alt="${esc(m.name)}">
      <div class="info">
        <h3>${esc(m.name)}</h3>
        <div class="tags">
          <span class="tag rarity ${rarityClass(m.rarity)}">${esc(m.rarity || "Unknown")}</span>
          ${m.size ? `<span class="tag">${esc(m.size)}</span>` : ""}
          <span class="tag">#${esc(m.number || "—")}</span>
          <span class="tag set">${esc(m.set.name)}</span>
        </div>
        <div class="counter" data-key="${esc(m.key)}">
          <button data-action="dec" aria-label="Remove one" ${c ? "" : "disabled"}>−</button>
          <output>${c} owned</output>
          <button data-action="inc" aria-label="Add one">+</button>
        </div>
      </div>`;
    $("detail").showModal();
  }
  $("detailBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const m = byKey.get(btn.closest("[data-key]").dataset.key);
    setCount(m, count(m) + (btn.dataset.action === "inc" ? 1 : -1));
    const c = count(m);
    $("detailBody").querySelector("output").textContent = c + " owned";
    $("detailBody").querySelector("[data-action=dec]").disabled = !c;
    refreshAfterChange(m);
  });
  $("detail").addEventListener("click", (e) => { if (e.target === $("detail")) $("detail").close(); });

  // ---------- toast with undo ----------
  let toastTimer;
  function toast(msg, undo) {
    const t = $("toast");
    t.innerHTML = `<span>${esc(msg)}</span>` + (undo ? `<button>Undo</button>` : "");
    t.hidden = false;
    if (undo) t.querySelector("button").onclick = () => { undo(); t.hidden = true; };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 5000);
  }

  // ---------- events ----------
  $("grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const m = byKey.get(btn.closest(".card").dataset.key);
    switch (btn.dataset.action) {
      case "inc": setCount(m, count(m) + 1); break;
      case "dec": setCount(m, count(m) - 1); break;
      case "toggle": setCount(m, count(m) ? 0 : 1); break;
      case "wish":
        if (col.wish[m.key]) delete col.wish[m.key]; else col.wish[m.key] = 1;
        persist();
        break;
      case "detail": openDetail(m); return;
    }
    refreshAfterChange(m);
  });

  $("setHeader").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    const set = currentSet();
    if (!btn || !set) return;
    const before = Object.fromEntries(set.minis.map((m) => [m.key, count(m)]));
    const restore = () => { for (const m of set.minis) setCount(m, before[m.key]); renderAll(); };
    if (btn.dataset.action === "own-all") {
      for (const m of set.minis) if (!count(m)) setCount(m, 1);
      toast(`Marked all of ${set.name} as owned`, restore);
    } else {
      for (const m of set.minis) setCount(m, 0);
      toast(`Cleared ${set.name}`, restore);
    }
    renderAll();
  });

  function selectSet(id) {
    ui.set = id;
    persistUi();
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    closeSidebar();
    renderAll();
    window.scrollTo({ top: 0 });
  }
  $("setList").addEventListener("click", (e) => {
    const item = e.target.closest("[data-set]");
    if (item) selectSet(item.dataset.set);
  });
  $("setSearch").addEventListener("input", renderSetList);

  $("statusChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-status]");
    if (!chip) return;
    ui.status = chip.dataset.status;
    persistUi();
    renderAll();
  });
  let searchTimer;
  $("search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { ui.q = e.target.value; renderGrid(); }, 120);
  });
  $("rarity").addEventListener("change", (e) => { ui.rarity = e.target.value; renderGrid(); });
  $("size").addEventListener("change", (e) => { ui.size = e.target.value; renderGrid(); });
  $("sort").addEventListener("change", (e) => { ui.sort = e.target.value; persistUi(); renderGrid(); });

  // Mobile sidebar drawer
  function openSidebar() {
    $("sidebar").classList.add("open");
    $("scrim").hidden = false;
    $("openSets").setAttribute("aria-expanded", "true");
  }
  function closeSidebar() {
    $("sidebar").classList.remove("open");
    $("scrim").hidden = true;
    $("openSets").setAttribute("aria-expanded", "false");
  }
  $("openSets").addEventListener("click", openSidebar);
  $("closeSets").addEventListener("click", closeSidebar);
  $("scrim").addEventListener("click", closeSidebar);

  // Menu: export / import / reset
  $("openMenu").addEventListener("click", (e) => { e.stopPropagation(); $("menu").hidden = !$("menu").hidden; });
  document.addEventListener("click", (e) => { if (!$("menu").contains(e.target)) $("menu").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { $("menu").hidden = true; closeSidebar(); } });

  $("exportBtn").addEventListener("click", () => {
    const payload = { app: "dnd-mini-tracker", version: 1, exported: new Date().toISOString(), owned: col.owned, wish: col.wish };
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dnd-minis-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $("menu").hidden = true;
  });
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    $("menu").hidden = true;
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data.owned !== "object") throw new Error("missing owned data");
      const prev = { owned: col.owned, wish: col.wish };
      col.owned = {};
      for (const [k, v] of Object.entries(data.owned)) if (byKey.has(k) && v > 0) col.owned[k] = Math.min(99, v | 0);
      col.wish = {};
      for (const k of Object.keys(data.wish || {})) if (byKey.has(k)) col.wish[k] = 1;
      persist();
      renderAll();
      toast(`Imported ${Object.keys(col.owned).length} owned minis`, () => { col.owned = prev.owned; col.wish = prev.wish; persist(); renderAll(); });
    } catch (err) {
      toast("Couldn't import that file: " + err.message);
    }
  });
  $("resetBtn").addEventListener("click", () => {
    $("menu").hidden = true;
    if (!confirm("Remove every mini from your collection and wishlist?")) return;
    const prev = { owned: col.owned, wish: col.wish };
    col.owned = {}; col.wish = {};
    persist();
    renderAll();
    toast("Collection reset", () => { col.owned = prev.owned; col.wish = prev.wish; persist(); renderAll(); });
  });

  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && id !== ui.set && (id === ALL || sets.some((s) => s.id === id))) selectSet(id);
  });
  // Keep tabs in sync when the collection changes in another tab.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORE_KEY) return;
    const next = load(STORE_KEY, {});
    col.owned = next.owned || {}; col.wish = next.wish || {};
    renderAll();
  });

  // ---------- init ----------
  const hashSet = decodeURIComponent(location.hash.slice(1));
  if (hashSet && (hashSet === ALL || sets.some((s) => s.id === hashSet))) ui.set = hashSet;
  if (ui.set !== ALL && !sets.some((s) => s.id === ui.set)) ui.set = ALL;
  $("scraped").textContent = DATA.scraped ? `(updated ${DATA.scraped})` : "";
  renderAll();
})();
