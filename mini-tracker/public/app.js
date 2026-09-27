(function () {
  "use strict";

  const DATA = window.MINIS_DATA;
  // Storage keys keep the app's original name so existing guest collections survive the rename.
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
      m.search = [m.name, set.name, set.group || ""].join(" ").toLowerCase(); // rarity/size have their own filters
      m.num = parseInt(m.number, 10); // NaN for unnumbered minis
      m.numNorm = m.number.toLowerCase().replace(/[^a-z0-9]/g, ""); // "10 - Alt" -> "10alt", "12a" -> "12a"
      minis.push(m);
    });
  }
  const byKey = new Map(minis.map((m) => [m.key, m]));

  // Sidebar tree: category -> group ("" for sets directly in the category) -> sets.
  const categories = [];
  for (const set of sets) {
    set.category = set.category || "Core Sets";
    set.group = (set.group || "").replace(/^Icons of the Realms\s*/i, "");
    let cat = categories.find((c) => c.name === set.category);
    if (!cat) categories.push((cat = { name: set.category, id: "cat:" + set.category, groups: [] }));
    let grp = cat.groups.find((g) => g.name === set.group);
    if (!grp) cat.groups.push((grp = { name: set.group, id: "grp:" + set.category + "|" + set.group, sets: [] }));
    grp.sets.push(set);
  }
  // Scopes other than a single set: everything, a category, or a group within a category.
  const scopes = new Map([[ALL, { name: "All sets", sets }]]);
  for (const cat of categories) {
    cat.sets = cat.groups.flatMap((g) => g.sets);
    scopes.set(cat.id, cat);
    for (const g of cat.groups) if (g.name) scopes.set(g.id, { name: g.name, sets: g.sets, category: cat.name });
  }
  const validScope = (id) => scopes.has(id) || sets.some((s) => s.id === id);

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
  // Logged in: changes sync to the server. Guest: they live in this browser only.
  let user = null;
  let accountsAvailable = false;
  const persist = () => (user ? scheduleSync() : save(STORE_KEY, { owned: col.owned, wish: col.wish, updated: new Date().toISOString() }));

  const ui = Object.assign({ set: ALL, status: "all", rarity: "", size: "", sort: "number", q: "", open: null, setSort: "release", startedOnly: false }, load(UI_KEY, {}));
  ui.open = ui.open || { [categories[0].id]: true };
  const persistUi = () => save(UI_KEY, { set: ui.set, status: ui.status, sort: ui.sort, open: ui.open, setSort: ui.setSort, startedOnly: ui.startedOnly });
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
  function scopeSets() { const s = currentSet(); return s ? [s] : scopes.get(ui.set).sets; }
  function scope() { const s = currentSet(); return s ? s.minis : ui.set === ALL ? minis : scopeSets().flatMap((x) => x.minis); }

  function renderOverall() {
    const s = stats(minis);
    $("overall").innerHTML =
      `<div class="bar${s.owned === s.n ? " done" : ""}"><span style="width:${(s.owned / s.n) * 100}%"></span></div>` +
      `<span><strong>${s.owned}</strong> / ${s.n}</span>`;
    updateBanner();
  }

  function scopeItem(id, name, list, extraClass, meta) {
    const s = stats(list);
    const done = s.n && s.owned === s.n;
    return `<button class="set-item ${extraClass}${ui.set === id ? " active" : ""}${done ? " complete" : ""}" data-set="${esc(id)}">
      <div class="row"><span class="name">${esc(name)}</span><span class="pct">${s.n ? pctLabel(s) : "—"}</span></div>
      <div class="meta">${meta(s)}</div>
      <div class="bar"><span style="width:${s.pct}%"></span></div></button>`;
  }
  const setItem = (set, showCategory) => scopeItem(set.id, set.name, set.minis, "", (s) =>
    [showCategory ? esc(set.group || set.category) : esc(set.release), s.n ? `${s.owned} / ${s.n}` + (s.owned && s.owned < s.n ? ` · ${s.n - s.owned} to go` : "") : "not yet listed"]
      .filter(Boolean).join(" · "));

  // Sorted views are one flat list across categories, for finding what's closest to done.
  const SET_SORTS = {
    // Highest % first (ties: fewest missing); finished sets go last since there's nothing left to chase.
    closest: (a, b) => (a.s.owned === a.s.n) - (b.s.owned === b.s.n) || b.s.owned / b.s.n - a.s.owned / a.s.n || (a.s.n - a.s.owned) - (b.s.n - b.s.owned),
    owned: (a, b) => b.s.owned - a.s.owned || b.s.owned / b.s.n - a.s.owned / a.s.n,
  };

  // While filtering (text or "Started only") categories open by default so matches are visible, but the
  // user can still collapse/expand them; those choices are temporary and reset when the filter changes.
  let filterOpen = {}, filterKey = "";
  function isCatOpen(id, filtering) {
    if (!filtering) return !!ui.open[id];
    return id in filterOpen ? filterOpen[id] : true;
  }

  function renderSetList() {
    const q = $("setSearch").value.trim().toLowerCase();
    const filtering = !!q || ui.startedOnly;
    const key = q + "|" + ui.startedOnly;
    if (key !== filterKey) { filterKey = key; filterOpen = {}; }
    const started = (set) => set.minis.some((m) => count(m));
    const match = (set) => (!q || set.name.toLowerCase().includes(q) || set.group.toLowerCase().includes(q)) && (!ui.startedOnly || started(set));
    let html = scopeItem(ALL, "All sets", minis, "all", (s) => `${s.owned} of ${s.n} minis · ${sets.length} sets`);
    if (ui.setSort !== "release") {
      const rows = sets.filter((set) => set.minis.length && match(set)).map((set) => ({ set, s: stats(set.minis) }));
      rows.sort((a, b) => SET_SORTS[ui.setSort](a, b) || a.set.name.localeCompare(b.set.name));
      html += rows.map((r) => setItem(r.set, true)).join("") || `<p class="set-empty">${ui.startedOnly ? "You haven't added any minis yet." : "No sets match."}</p>`;
      $("setList").innerHTML = html;
      return;
    }
    let shownAny = false;
    for (const cat of categories) {
      const shown = cat.sets.filter(match);
      if (!shown.length) continue;
      shownAny = true;
      const open = isCatOpen(cat.id, filtering);
      html += `<div class="cat${open ? " open" : ""}">
        <div class="cat-head">
          ${scopeItem(cat.id, cat.name, cat.sets.flatMap((x) => x.minis), "cat-item", (s) => `${s.owned} of ${s.n} minis · ${cat.sets.length} sets`)}
          <button class="cat-toggle" data-toggle="${esc(cat.id)}" aria-expanded="${!!open}" aria-label="${open ? "Collapse" : "Expand"} ${esc(cat.name)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>`;
      if (open) {
        for (const g of cat.groups) {
          const gs = g.sets.filter(match);
          if (!gs.length) continue;
          if (g.name) html += scopeItem(g.id, g.name, g.sets.flatMap((x) => x.minis), "grp-item", (s) => `${s.owned} of ${s.n} minis · ${g.sets.length} sets`);
          html += `<div class="${g.name ? "grp-sets" : "cat-sets"}">${gs.map((set) => setItem(set)).join("")}</div>`;
        }
      }
      html += `</div>`;
    }
    if (!shownAny) html += `<p class="set-empty">${ui.startedOnly && !q ? "You haven't added any minis yet." : "No sets match."}</p>`;
    $("setList").innerHTML = html;
    const active = $("setList").querySelector(".set-item.active");
    if (active && !q) active.scrollIntoView({ block: "nearest" });
  }

  function renderSetHeader() {
    const set = currentSet();
    const s = stats(scope());
    const done = s.n && s.owned === s.n;
    const sc = scopes.get(ui.set);
    const title = esc(set ? set.name : sc.name);
    const meta = set
      ? [set.category + (set.group ? " › " + set.group : ""), set.release, ...set.info.slice(0, -1)].filter(Boolean).map(esc).join(" · ") +
        ` · <a href="${esc(set.url)}" target="_blank" rel="noopener">MinisGallery ↗</a>`
      : (sc.category ? esc(sc.category) + " · " : "") + `${sc.sets.length} sets`;
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
    document.title = (ui.set !== ALL ? (set ? set.name : sc.name) + " · " : "") + "Mini Tracker";
  }

  // "zombie 1" -> every word must match. A number ("1", "#1") matches the mini's number in its set,
  // including variants like 1A / "1 - Alt" but not 10; "12a" matches 12A. After a word it can also complete a set
  // name ("monster manual collection 1 zombie"), but "zombie 1" means zombies numbered 1. Other words match
  // the name or the set name (partial words work: "zomb").
  function parseQuery(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return words.map((word, i) => {
      const num = word.match(/^#?(\d+)([a-z]*)$/);
      if (num) {
        const n = +num[1], exact = num[1] + num[2];
        return num[2] ? (m) => m.numNorm === exact || m.numNorm.startsWith(exact) && !/\d/.test(m.numNorm[exact.length] || "")
                      : (m) => m.num === n || new RegExp(`\\b${n}\\b`).test(m.name) || // a "2" in a mini's own name
                          (i > 0 && m.search.includes(words[i - 1] + " " + word)); // part of a set name: "collection 1"
      }
      return (m) => m.search.includes(word);
    });
  }

  function filtered() {
    const terms = parseQuery(ui.q);
    let list = scope().filter((m) => {
      const c = count(m);
      if (ui.status === "owned" && !c) return false;
      if (ui.status === "missing" && c) return false;
      if (ui.status === "dupes" && c < 2) return false;
      if (ui.status === "wish" && !col.wish[m.key]) return false;
      if (ui.rarity && m.baseRarity !== ui.rarity) return false;
      if (ui.size && m.sizeGroup !== ui.size) return false;
      if (terms.length && !terms.every((t) => t(m))) return false;
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
    list.sort((a, b) => (!currentSet() ? setIdx.get(a.set.id) - setIdx.get(b.set.id) : 0) || cmp(a, b));
    return list;
  }

  // The mini's own MinisGallery page, or its set's page for minis the site hasn't photographed yet.
  const miniUrl = (m) => m.page || m.set.url;
  const EXT = `<svg class="ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`;

  function cardHtml(m, showSet) {
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
        <a class="name" href="${esc(miniUrl(m))}" target="_blank" rel="noopener" title="View on MinisGallery">${esc(m.name)}${EXT}</a>
        <div class="tags">
          <span class="tag rarity ${rarityClass(m.rarity)}">${esc(m.rarity || "Unknown")}</span>
          ${m.size ? `<span class="tag">${esc(m.size)}</span>` : ""}
          ${showSet ? `<span class="tag set" title="${esc(m.set.name)}">${esc(m.set.name)}</span>` : ""}
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
    // Headings per set, unless the sets here are mostly tiny (promos, boxed singles): then tag each card instead.
    const multi = !currentSet();
    const headings = multi && list.length / (new Set(list.map((m) => m.set)).size || 1) >= 6;
    for (const m of list) {
      if (headings && m.set !== lastSet) {
        lastSet = m.set;
        const s = stats(m.set.minis);
        html += `<h3 class="group-title"><span>${esc(m.set.name)}</span><span>${s.owned} / ${s.n} · ${pctLabel(s)}</span></h3>`;
      }
      html += cardHtml(m, multi && !headings);
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
    if (!currentSet()) {
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
        <a class="source-link" href="${esc(miniUrl(m))}" target="_blank" rel="noopener">View on MinisGallery${EXT}</a>
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

  let searchTimer;
  function clearSearch() {
    clearTimeout(searchTimer);
    $("search").value = "";
    ui.q = "";
    syncClearButtons();
  }
  function syncClearButtons() {
    document.querySelectorAll("[data-clear]").forEach((b) => { b.hidden = !$(b.dataset.clear).value; });
  }

  function selectSet(id) {
    if (id !== ui.set) clearSearch(); // a new set starts with a fresh search
    ui.set = id;
    persistUi();
    const hash = "#" + encodeURIComponent(id);
    if (location.hash !== hash) history.replaceState(null, "", hash);
    const set = sets.find((x) => x.id === id);
    if (set) ui.open["cat:" + set.category] = true;
    closeSidebar();
    renderAll();
    window.scrollTo({ top: 0 });
  }
  $("setList").addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      const id = toggle.dataset.toggle;
      const filtering = !!$("setSearch").value.trim() || ui.startedOnly;
      if (filtering) filterOpen[id] = !isCatOpen(id, true);
      else {
        if (ui.open[id]) delete ui.open[id]; else ui.open[id] = true;
        persistUi();
      }
      renderSetList();
      return;
    }
    const item = e.target.closest("[data-set]");
    if (item) selectSet(item.dataset.set);
  });
  $("setSearch").addEventListener("input", renderSetList);
  $("setSort").addEventListener("change", (e) => { ui.setSort = e.target.value; persistUi(); renderSetList(); $("setList").scrollTop = 0; });
  $("startedOnly").addEventListener("click", () => {
    ui.startedOnly = !ui.startedOnly;
    $("startedOnly").setAttribute("aria-pressed", ui.startedOnly);
    persistUi();
    renderSetList();
  });

  $("statusChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-status]");
    if (!chip) return;
    ui.status = chip.dataset.status;
    persistUi();
    renderAll();
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-clear]");
    if (!b) return;
    const input = $(b.dataset.clear);
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  });
  document.addEventListener("input", (e) => { if (e.target.type === "search") syncClearButtons(); });
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
    const payload = { app: "mini-tracker", version: 1, exported: new Date().toISOString(), owned: col.owned, wish: col.wish };
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
    if (id && id !== ui.set && validScope(id)) selectSet(id);
  });
  // Keep tabs in sync when the collection changes in another tab.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORE_KEY || user) return;
    const next = load(STORE_KEY, {});
    col.owned = next.owned || {}; col.wish = next.wish || {};
    renderAll();
  });

  // ---------- accounts & sync ----------
  async function api(method, url, body, opts = {}) {
    const res = await fetch("/api" + url, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      keepalive: !!opts.keepalive,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: res.status });
    return data;
  }

  // What the server has; each sync sends only the minis that differ from it.
  let synced = { owned: {}, wish: {} };
  let syncTimer = null, syncing = false, retryDelay = 2000, syncState = "saved";

  function pendingItems() {
    const keys = new Set([...Object.keys(col.owned), ...Object.keys(col.wish), ...Object.keys(synced.owned), ...Object.keys(synced.wish)]);
    const items = [];
    for (const key of keys) {
      const owned = col.owned[key] || 0, wish = !!col.wish[key];
      if (owned !== (synced.owned[key] || 0) || wish !== !!synced.wish[key]) items.push({ key, owned, wish });
    }
    return items;
  }

  function setSyncState(state) {
    syncState = state;
    $("syncDot").className = "sync-dot " + state;
    $("openMenuUser").title = { saved: "All changes saved", saving: "Saving…", error: "Not saved yet — retrying" }[state];
    const el = $("menuAccount").querySelector(".sync-text");
    if (el) el.textContent = $("openMenuUser").title;
  }

  function scheduleSync(delay = 600) {
    setSyncState("saving");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(flushSync, delay);
  }

  async function flushSync() {
    if (!user) return;
    if (syncing) return scheduleSync();
    const items = pendingItems();
    if (!items.length) return setSyncState("saved");
    syncing = true;
    try {
      await api("PATCH", "/collection", { items });
      for (const it of items) {
        if (it.owned) synced.owned[it.key] = it.owned; else delete synced.owned[it.key];
        if (it.wish) synced.wish[it.key] = 1; else delete synced.wish[it.key];
      }
      retryDelay = 2000;
      setSyncState(pendingItems().length ? "saving" : "saved");
      if (syncState === "saving") scheduleSync(0);
    } catch (err) {
      if (err.status === 401) {
        signedOut("You were logged out. Log in again to keep saving your collection.");
      } else {
        setSyncState("error");
        syncTimer = setTimeout(flushSync, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 60000);
      }
    } finally {
      syncing = false;
    }
  }

  // Last-chance save when the tab closes with unsaved changes.
  window.addEventListener("pagehide", () => {
    if (!user) return;
    const items = pendingItems();
    if (items.length) api("PATCH", "/collection", { items }, { keepalive: true }).catch(() => {});
  });
  window.addEventListener("online", () => { if (user && syncState === "error") flushSync(); });

  // Loads the account's collection; anything saved in this browser as a guest is added to it.
  async function signedIn(u, { merge = true } = {}) {
    user = u;
    const server = await api("GET", "/collection");
    synced = { owned: { ...server.owned }, wish: { ...server.wish } };
    const local = load(STORE_KEY, {});
    col = { owned: { ...server.owned }, wish: { ...server.wish } };
    let added = 0;
    if (merge) {
      for (const [k, n] of Object.entries(local.owned || {})) {
        if (byKey.has(k) && n > (col.owned[k] || 0)) { col.owned[k] = n; added++; }
      }
      for (const k of Object.keys(local.wish || {})) if (byKey.has(k) && !col.wish[k]) { col.wish[k] = 1; added++; }
    }
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    renderAccount();
    renderAll();
    if (added) {
      scheduleSync(0);
      toast(`Added ${added} mini${added === 1 ? "" : "s"} saved in this browser to your account`);
    } else {
      setSyncState("saved");
    }
  }

  function signedOut(message) {
    clearTimeout(syncTimer);
    user = null;
    col = { owned: {}, wish: {} };
    synced = { owned: {}, wish: {} };
    renderAccount();
    renderAll();
    if (message) toast(message);
  }

  function renderAccount() {
    $("loginBtn").hidden = !!user;
    $("openMenuUser").hidden = !user;
    $("openMenu").hidden = !!user;
    $("logoutBtn").hidden = !user;
    $("deleteAccountBtn").hidden = !user;
    $("avatarInitial").textContent = user ? user.email[0].toUpperCase() : "";
    $("menuAccount").innerHTML = user
      ? `<div class="who">${esc(user.email)}</div><div class="sync-text"></div>`
      : `<div class="who">Not logged in</div><div class="menu-auth"><button data-auth="login">Log in</button><button data-auth="signup">Create account</button></div>`;
    $("footSave").textContent = user
      ? "Your collection is saved to your account."
      : "Your collection is saved in this browser; create an account to keep it safe.";
    updateBanner();
    if (user) setSyncState(syncState);
  }

  function updateBanner() {
    const dismissed = load(UI_KEY + ":banner", false);
    $("guestBanner").hidden = !accountsAvailable || !!user || dismissed || !Object.keys(col.owned).length;
  }
  $("dismissBanner").addEventListener("click", () => { save(UI_KEY + ":banner", true); updateBanner(); });

  // ---------- auth dialog ----------
  let authMode = "login";
  const AUTH_TEXT = {
    login: { title: "Welcome back", sub: "Log in to see your collection.", submit: "Log in", pw: "current-password" },
    signup: { title: "Create your free account", sub: "Save your collection and use it on any device.", submit: "Create account", pw: "new-password" },
    delete: { title: "Delete your account", sub: "This permanently deletes your account and collection. Enter your password to confirm.", submit: "Delete account forever", pw: "current-password" },
  };

  function openAuth(mode) {
    authMode = mode;
    const t = AUTH_TEXT[mode];
    $("authTitle").textContent = t.title;
    $("authSub").textContent = t.sub;
    $("authSubmit").textContent = t.submit;
    $("authSubmit").classList.toggle("danger", mode === "delete");
    $("authPassword").autocomplete = t.pw;
    $("authPassword").value = "";
    $("authTabs").hidden = mode === "delete";
    $("emailField").hidden = mode === "delete";
    document.querySelectorAll("#authTabs [data-mode]").forEach((b) => b.setAttribute("aria-selected", b.dataset.mode === mode));
    $("authError").hidden = true;
    $("menu").hidden = true;
    if (!$("authDialog").open) $("authDialog").showModal();
    (mode === "delete" || $("authEmail").value ? $("authPassword") : $("authEmail")).focus();
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-auth]");
    if (b) openAuth(b.dataset.auth);
  });
  $("authTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-mode]"); if (b) openAuth(b.dataset.mode); });
  $("authClose").addEventListener("click", () => $("authDialog").close());
  $("loginBtn").addEventListener("click", () => openAuth("login"));
  $("deleteAccountBtn").addEventListener("click", () => openAuth("delete"));

  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    const showError = (msg) => { $("authError").textContent = msg; $("authError").hidden = false; };
    if (authMode !== "delete" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Enter a valid email address.");
    if (authMode === "signup" && password.length < 8) return showError("Password must be at least 8 characters.");
    if (!password) return showError("Enter your password.");
    $("authSubmit").disabled = true;
    try {
      if (authMode === "delete") {
        await api("DELETE", "/account", { password });
        $("authDialog").close();
        signedOut("Your account has been deleted.");
      } else {
        const { user: u } = await api("POST", "/" + authMode, { email, password });
        $("authDialog").close();
        await signedIn(u);
        if (authMode === "signup") toast("Account created — your collection now saves automatically");
      }
    } catch (err) {
      showError(err.message);
    } finally {
      $("authSubmit").disabled = false;
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    $("menu").hidden = true;
    await flushSync();
    try { await api("POST", "/logout", {}); } catch { /* cookie is cleared server-side when possible */ }
    signedOut("Logged out");
  });
  $("openMenuUser").addEventListener("click", (e) => { e.stopPropagation(); $("menu").hidden = !$("menu").hidden; });

  async function initAccount() {
    try {
      const { user: u } = await api("GET", "/me");
      accountsAvailable = true;
      if (u) await signedIn(u);
      else renderAccount();
    } catch {
      // Accounts unavailable (no server/database, or opened from disk): guest mode only.
      $("loginBtn").hidden = true;
      $("menuAccount").hidden = true;
    }
  }

  // ---------- init ----------
  const hashSet = decodeURIComponent(location.hash.slice(1));
  if (hashSet && validScope(hashSet)) ui.set = hashSet;
  if (!validScope(ui.set)) ui.set = ALL;
  // Make sure the selected set's category is expanded in the sidebar.
  const startSet = sets.find((s) => s.id === ui.set);
  if (startSet) ui.open["cat:" + startSet.category] = true;
  $("setSort").value = SET_SORTS[ui.setSort] ? ui.setSort : (ui.setSort = "release");
  $("startedOnly").setAttribute("aria-pressed", !!ui.startedOnly);
  $("scraped").textContent = DATA.scraped ? `(updated ${DATA.scraped})` : "";
  renderAll();
  initAccount();
  window.__appReady = true;
})();
