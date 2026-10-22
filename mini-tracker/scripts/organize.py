"""Release / product / promo layout for the app, built from the scraped sets and data/organization.json.

Display only: every listing keeps its key ("<set id>/<mini id>"), so saved collections are untouched. The result
goes into minis.json as "org"; the app uses it for the release layout and falls back to MinisGallery's own
categories without it. See "_about" in data/organization.json for the rules."""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ORGANIZATION = Path(__file__).resolve().parent.parent / "data" / "organization.json"
RELEASES = "Core Sets"
PROMOS = "Promos"
NO_PICTURE = "/unknown.jpg"


def load():
    return json.loads(ORGANIZATION.read_text()) if ORGANIZATION.exists() else None


def fail(msg):
    sys.exit(f"organization.json: {msg}")


def organize(sets, cfg):
    by_key, set_of = {}, {}
    for s in sets:
        for m in s["minis"]:
            k = s["id"] + "/" + m["id"]
            by_key[k], set_of[k] = m, s
    set_ids = {s["id"] for s in sets}
    release_ids = {s["id"] for s in sets if s.get("category") == RELEASES}

    def check(key, what):
        if key not in by_key:
            fail(f"{what}: unknown mini key {key}")

    promo, booster = set(cfg.get("promo", [])), set(cfg.get("booster", []))
    for k in promo | booster:
        check(k, "promo/booster")
        if set_of[k]["id"] not in release_ids:
            fail(f"promo/booster: {k} is not on a release page")
    moved = {}  # release-page key -> virtual product id
    for p in cfg.get("products", []):
        if p["id"] in set_ids or p["parent"] not in release_ids:
            fail(f"product {p['id']}: id clashes with a set, or parent is not a release")
        for k in p["minis"]:
            check(k, f"product {p['id']}")
            if set_of[k]["id"] != p["parent"] or k in moved:
                fail(f"product {p['id']}: {k} must be on its parent's page, in one product only")
            moved[k] = p["id"]
    separate = {frozenset(pair) for pair in cfg.get("separate", [])}

    # Groups of listings that are one physical mini (union-find over keys).
    parent = {}

    def find(k):
        while parent.get(k, k) != k:
            k = parent[k]
        return k

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for grp in cfg.get("same", []):
        for k in grp:
            check(k, "same")
        for k in grp[1:]:
            union(grp[0], k)
    # Automatic: a non-booster release-page listing with the same picture as a listing outside Core Sets.
    by_image = defaultdict(list)
    for k, m in by_key.items():
        if m.get("image") and not m["image"].endswith(NO_PICTURE):
            by_image[m["image"]].append(k)
    for keys in by_image.values():
        rel = [k for k in keys if set_of[k]["id"] in release_ids
               and (by_key[k]["rarity"] in ("Unique", "Promo") or not by_key[k]["number"] or k in promo)]
        other = [k for k in keys if set_of[k]["id"] not in release_ids]
        for r in rel:
            for o in other:
                if frozenset((r, o)) not in separate:
                    union(r, o)
    groups = defaultdict(list)
    for k in by_key:
        groups[find(k)].append(k)
    group_of = {k: g for g in groups.values() for k in g}

    # Where each group is shown: (display set id, "promo" | "main"); every other listing in the group is hidden.
    shown = {}
    product_parent = defaultdict(Counter)  # product set id -> release ids it took minis from
    for g in groups.values():
        rel = [k for k in g if set_of[k]["id"] in release_ids]
        outside = [k for k in g if set_of[k]["id"] not in release_ids]
        if not rel:
            for k in g:
                shown[k] = (set_of[k]["id"], "main")  # not linked to a release: unchanged
            continue
        if len({set_of[k]["id"] for k in rel}) > 1 and len(g) > len(rel):
            fail(f"same: group {g} spans several release pages")
        r = rel[0]
        if r in moved:
            kind, home = "main", moved[r]
        elif r in booster:
            kind, home = "main", set_of[r]["id"]
        elif r in promo or any(set_of[k].get("category") == PROMOS for k in outside):
            kind, home = "promo", set_of[r]["id"]
        elif outside:
            kind, home = "main", None  # the product set's own listing
        elif by_key[r]["rarity"] == "Promo":
            kind, home = "promo", set_of[r]["id"]
        else:
            kind, home = "main", set_of[r]["id"]
        if home is None:
            o = outside[0]
            shown[o] = (set_of[o]["id"], "main")
            product_parent[set_of[o]["id"]][set_of[r]["id"]] += 1
        else:
            shown[r] = (home, kind)
        for k in rel[1:]:
            shown[k] = (home or set_of[r]["id"], kind)  # several listings on one release page: keep each

    parents = dict(cfg.get("parents", {}))
    for sid, rel_id in parents.items():
        if sid not in set_ids or rel_id not in release_ids:
            fail(f"parents: {sid} -> {rel_id} must be a set and a release")
    for sid, c in product_parent.items():
        if sid not in parents and c:
            parents[sid] = c.most_common(1)[0][0]

    contents = defaultdict(lambda: {"minis": [], "promos": []})
    for k in by_key:  # catalog order
        if k in shown:
            home, kind = shown[k]
            contents[home]["promos" if kind == "promo" else "minis"].append(k)

    out, by_id = [], {s["id"]: s for s in sets}
    virtual = defaultdict(list)
    for p in cfg.get("products", []):
        virtual[p["parent"]].append(p)

    def entry(s, **extra):
        c = contents.get(s["id"], {"minis": [], "promos": []})
        e = {"id": s["id"], "name": s["name"], "category": s.get("category", ""), "group": s.get("group", ""),
             "release": s.get("release", ""), "url": s.get("url", ""), "info": s.get("info", []),
             "minis": c["minis"], "promos": c["promos"]}
        e.update(extra)
        return e

    for s in sets:
        sid = s["id"]
        c = contents.get(sid)
        if not c and s["minis"]:
            continue  # every listing is shown elsewhere
        if sid in release_ids:
            out.append(entry(s, kind="release"))
            for p in virtual[sid]:
                out.append(entry({"id": p["id"], "name": p["name"], "category": RELEASES, "url": s["url"],
                                  "release": s.get("release", ""), "info": []}, kind="product", parent=sid))
        elif sid in parents:
            out.append(entry(s, kind="product", parent=parents[sid], category=RELEASES, group=""))
        elif s.get("category") == PROMOS:
            c = contents.get(sid, {"minis": [], "promos": []})
            out.append(entry(s, kind="promos", minis=[], promos=c["minis"] + c["promos"]))  # promos not tied to a release
        else:
            out.append(entry(s, kind="product"))

    # Every listing must be reachable: shown itself, or in a group whose shown listing is.
    shown_keys = {k for e in out for k in e["minis"] + e["promos"]}
    lost = [k for k in by_key if not any(x in shown_keys for x in group_of[k])]
    if lost:
        fail(f"{len(lost)} listings would disappear, e.g. {lost[:5]}")
    same = [sorted(g, key=lambda k: k not in shown_keys) for g in groups.values() if len(g) > 1]
    return {"sets": out, "same": same}
