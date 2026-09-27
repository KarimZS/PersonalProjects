// Loaded before the app: reports browser errors to the server log so problems on devices we can't test
// (e.g. iPhone Safari) show up in Railway's logs. With ?debug in the URL it also reports layout and tap targets.
(function () {
  "use strict";
  var DEBUG = /[?&]debug\b/.test(location.search);
  var sent = 0;
  function report(kind, data) {
    if (++sent > 200) return;
    try {
      fetch("/api/client-log", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ kind: kind, data: data, ua: navigator.userAgent }),
      }).catch(function () {});
    } catch (e) { /* ignore */ }
  }
  window.__report = report;
  window.addEventListener("error", function (e) {
    report("error", { msg: e.message, src: e.filename, line: e.lineno, col: e.colno });
  });
  window.addEventListener("unhandledrejection", function (e) {
    report("rejection", { msg: String((e.reason && e.reason.message) || e.reason) });
  });
  if (!DEBUG) return;

  function describe(el) {
    if (!el || !el.tagName) return String(el);
    var d = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : "");
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return d + (r ? " [" + Math.round(r.left) + "," + Math.round(r.top) + " " + Math.round(r.width) + "x" + Math.round(r.height) + "]" : "");
  }
  function rect(id) { var el = document.getElementById(id); return el ? describe(el) + (el.hidden ? " hidden" : "") : "missing"; }
  function env(when) {
    var vv = window.visualViewport;
    var header = document.querySelector(".topbar");
    report("env-" + when, {
      inner: innerWidth + "x" + innerHeight, dpr: devicePixelRatio, scrollY: scrollY,
      vv: vv ? { w: Math.round(vv.width), h: Math.round(vv.height), top: Math.round(vv.offsetTop), scale: vv.scale } : null,
      standalone: navigator.standalone === true,
      safeTop: header ? getComputedStyle(header).paddingTop : null,
      header: header ? describe(header) : null,
      buttons: [rect("openSets"), rect("loginBtn"), rect("openMenu"), rect("openMenuUser")],
      appReady: !!window.__appReady,
      openDialogs: Array.prototype.map.call(document.querySelectorAll("dialog[open]"), function (d) { return d.id; }),
    });
  }
  function onTap(e) {
    var p = e.changedTouches ? e.changedTouches[0] : e;
    var hit = document.elementFromPoint(p.clientX, p.clientY);
    var chain = [], el = hit;
    while (el && el !== document.body && chain.length < 6) { chain.push(describe(el)); el = el.parentElement; }
    report("tap-" + e.type, { x: Math.round(p.clientX), y: Math.round(p.clientY), target: describe(e.target), hit: chain });
  }
  ["touchstart", "click"].forEach(function (t) { document.addEventListener(t, onTap, { capture: true, passive: true }); });
  window.addEventListener("load", function () {
    env("load");
    setTimeout(function () { env("2s"); }, 2000);
    var note = document.createElement("div");
    note.textContent = "Debug mode: taps are being logged";
    note.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99;padding:4px 8px;border-radius:6px;background:#d9a441;color:#1b1508;font:12px system-ui;pointer-events:none";
    document.body.appendChild(note);
  });
})();
