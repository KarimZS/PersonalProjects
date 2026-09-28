// Log in / sign up / delete account as plain pages (/login, /signup, /delete-account) rather than pop-ups:
// iPhone Safari opened the old login pop-up invisibly while it still captured taps.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const MODES = { "/login": "login", "/signup": "signup", "/delete-account": "delete" };
  const mode = MODES[location.pathname] || "login";
  const next = new URLSearchParams(location.search).get("next") || "";
  const back = "/" + (next.startsWith("#") ? next : ""); // only ever return within this site
  const q = next ? "?next=" + encodeURIComponent(next) : "";

  const TEXT = {
    login: { title: "Welcome back", sub: "Log in to see your collection.", submit: "Log in", pw: "current-password" },
    signup: { title: "Create your free account", sub: "Save your collection and use it on any device.", submit: "Create account", pw: "new-password" },
    delete: { title: "Delete your account", sub: "This permanently deletes your account and your collection. Enter your password to confirm.", submit: "Delete account forever", pw: "current-password" },
  }[mode];

  document.title = TEXT.title + " · Mini Tracker";
  $("authTitle").textContent = TEXT.title;
  $("authSub").textContent = TEXT.sub;
  $("authSubmit").textContent = TEXT.submit;
  $("authSubmit").classList.toggle("danger", mode === "delete");
  $("authPassword").autocomplete = TEXT.pw;
  $("backLink").href = back;
  $("tabLogin").href = "/login" + q;
  $("tabSignup").href = "/signup" + q;
  $("tabLogin").setAttribute("aria-current", mode === "login" ? "page" : "false");
  $("tabSignup").setAttribute("aria-current", mode === "signup" ? "page" : "false");
  $("authTabs").hidden = mode === "delete";
  $("emailField").hidden = mode === "delete";

  async function api(method, url, body) {
    const res = await fetch("/api" + url, {
      method, credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong. Please try again."), { status: res.status });
    return data;
  }
  function flash(msg) { try { sessionStorage.setItem("mini-tracker:flash", msg); } catch { /* ignore */ } }

  // Already logged in -> nothing to do here (except deleting); logged out -> can't delete.
  api("GET", "/me").then(({ user }) => {
    if (user && mode !== "delete") location.replace(back);
    else if (!user && mode === "delete") location.replace("/login" + q);
  }).catch(() => {
    const err = $("authError");
    err.textContent = "Accounts aren't available right now. Please try again later.";
    err.hidden = false;
    $("authSubmit").disabled = true;
  });

  (mode === "delete" ? $("authPassword") : $("authEmail")).focus();

  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    const showError = (msg) => { $("authError").textContent = msg; $("authError").hidden = false; };
    if (mode !== "delete" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Enter a valid email address.");
    if (mode === "signup" && password.length < 8) return showError("Password must be at least 8 characters.");
    if (!password) return showError("Enter your password.");
    $("authSubmit").disabled = true;
    try {
      if (mode === "delete") {
        await api("DELETE", "/account", { password });
        flash("Your account has been deleted.");
        location.replace("/");
      } else {
        await api("POST", "/" + mode, { email, password });
        if (mode === "signup") flash("Account created — your collection now saves automatically");
        location.replace(back);
      }
    } catch (err) {
      showError(err.message);
      $("authSubmit").disabled = false;
    }
  });
})();
