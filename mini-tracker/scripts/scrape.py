#!/usr/bin/env python3
"""Scrape all D&D Icons of the Realms and Critical Role sets from minisgallery.com into public/data/minis.json and public/data/minis.js.

Our fixes for MinisGallery mistakes live in data/corrections.json and are applied on every run.
`python3 scripts/scrape.py --apply-corrections` re-applies them to the current catalog without re-scraping."""
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

BASE = "https://www.minisgallery.com/"
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "minis.json"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "mini-tracker/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def parse_set(slug, page):
    title = text(re.search(r'<div class="productTitle">(.*?)</div>', page, re.S).group(1))
    rows = [text(r) for r in re.findall(r'<div class="productInfoRow">(.*?)</div>', page, re.S)]
    minis = []
    for box in re.split(r'<div class="minibox', page)[1:]:
        name = re.search(r'<div class="miniName">(.*?)</div></div>', box, re.S)
        if not name:
            continue
        rarity = re.search(r'<div class="miniRarity[^"]*">(.*?)</div>', box, re.S)
        size = re.search(r'<div class="miniSize">(.*?)</div>', box, re.S)
        img = re.search(r'<img[^>]*src="([^"]+)"', box)
        num = re.search(r'miniInfo2_num[^"]*">(.*?)</div>', box, re.S)
        # Minis MinisGallery has photographed link to their own detail page; others have none.
        page = re.search(r'href="(index\.php\?id=\d+&(?:amp;)?task=image[^"]*)"', box)
        minis.append({
            "number": text(num.group(1)).strip("()") if num else "",
            "name": text(name.group(1)),
            "rarity": text(rarity.group(1)) if rarity else "",
            "size": text(size.group(1)) if size else "",
            "image": BASE + img.group(1) if img else "",
            "page": BASE + html.unescape(page.group(1)) if page else "",
        })
    # Stable per-mini id used as the key for saved collection data.
    seen = {}
    for m in minis:
        base = re.sub(r"[^a-z0-9]+", "-", f"{m['number']} {m['name']}".lower()).strip("-")
        seen[base] = seen.get(base, 0) + 1
        m["id"] = base if seen[base] == 1 else f"{base}-{seen[base]}"
    return {
        "id": slug,
        "name": title,
        "info": rows,
        "release": rows[-1] if rows else "",
        "url": BASE + "index.php?id=" + slug,
        "minis": minis,
    }


CATEGORIES = [
    ("icons-of-the-realms-core-sets", "Core Sets"),
    ("icons-of-the-realms-premium-sets", "Premium Sets"),
    ("icons-of-the-realms-special-release-sets", "Special Release Sets"),
    ("icons-of-the-realms-premium-figures-gallery", "Premium Figures"),
    ("icons-of-the-realms-promos", "Promos"),
    ("critical-role-miniatures", "Critical Role"),
]
NAV = {"main-menu", "dungeons-and-dragons", "icons-of-the-realms", "critical-role"} | {c for c, _ in CATEGORIES}


def content_links(page):
    """Sub-page links in a category page's content area (below the breadcrumb, above the footer)."""
    body = page.split('<div class="navbar"></div>', 1)[-1].split("This web site may use", 1)[0]
    return list(dict.fromkeys(re.findall(r'href="index\.php\?id=([a-z0-9-]+)"', body)))


def crawl(slug, category, group, seen, sets):
    """Walk a category page; pages that list minis are sets, anything else is a sub-category."""
    for child in content_links(fetch(BASE + "index.php?id=" + slug)):
        if child in NAV or child in seen:
            continue
        seen.add(child)
        print("fetching", child)
        page = fetch(BASE + "index.php?id=" + child)
        time.sleep(0.4)
        # Set pages have a product header (even before their minis are listed); category pages don't.
        if 'class="productFrame"' in page:
            s = parse_set(child, page)
            s["category"] = category
            s["group"] = group
            sets.append(s)
        else:
            title = re.search(r"<title>(?:MinisGallery - )?(?:D&D )?(.*?)</title>", page, re.S)
            crawl(child, category, text(title.group(1)) if title else child, seen, sets)


PUBLISHED = Path(__file__).resolve().parent.parent / "data" / "published-keys.txt"
CORRECTIONS = Path(__file__).resolve().parent.parent / "data" / "corrections.json"
EDITABLE = ("number", "name", "rarity", "size", "image")


def load_corrections():
    if not CORRECTIONS.exists():
        return {}, {}
    data = json.loads(CORRECTIONS.read_text())
    overrides, aliases = data.get("overrides", {}), data.get("aliases", {})
    for key, fix in overrides.items():
        bad = [f for f in fix if f not in EDITABLE + ("note",)]
        if bad or not all(isinstance(v, str) for v in fix.values()):
            sys.exit(f"corrections.json: override for {key} has unsupported fields/values: {bad or fix}")
    return overrides, aliases


def apply_aliases(sets, aliases):
    """MinisGallery fixing a mini's number/name changes the id we derive from it. An alias maps that new
    scraped key back to the key already in use, so saved collections stay attached to the mini."""
    for s in sets:
        for m in s["minis"]:
            target = aliases.get(s["id"] + "/" + m["id"])
            if target:
                set_id, mini_id = target.split("/", 1)
                if set_id != s["id"]:
                    sys.exit(f"corrections.json: alias {s['id']}/{m['id']} -> {target} must stay in the same set")
                m["id"] = mini_id


def apply_overrides(sets, overrides):
    """Our own fixes for MinisGallery mistakes, applied on every scrape. Only display fields change; the
    mini's key never does. MinisGallery's original values are kept under "corrected" so the app can show them."""
    by_key = {s["id"] + "/" + m["id"]: m for s in sets for m in s["minis"]}
    for key, fix in overrides.items():
        m = by_key.get(key)
        if not m:
            print(f"WARNING: correction for {key} matches no mini (check the key in data/corrections.json)")
            continue
        original = m.get("corrected", {})
        for field in EDITABLE:
            if field not in fix:
                continue
            source_value = original.get(field, m[field])  # what MinisGallery says
            if source_value == fix[field]:
                print(f"NOTE: MinisGallery now agrees on {key} {field}={fix[field]!r}; the override can be removed")
                original.pop(field, None)
            else:
                original[field] = source_value
            m[field] = fix[field]
        if original:
            m["corrected"] = original
            m["correctionNote"] = fix.get("note", "")
        else:
            m.pop("corrected", None)
            m.pop("correctionNote", None)


def read_published():
    if not PUBLISHED.exists():
        return []
    return [l.strip() for l in PUBLISHED.read_text().splitlines() if l.strip() and not l.startswith("#")]


def main():
    overrides, aliases = load_corrections()
    if "--apply-corrections" in sys.argv:
        # Re-apply data/corrections.json to the current catalog without re-scraping MinisGallery.
        current = json.loads(OUT.read_text())
        sets, scraped = current["sets"], current.get("scraped")
        for st in sets:  # back to MinisGallery's values first, so removed/changed corrections take effect
            for m in st["minis"]:
                m.update(m.pop("corrected", {}))
                m.pop("correctionNote", None)
    else:
        sets, seen, scraped = [], set(), time.strftime("%Y-%m-%d")
        for slug, label in CATEGORIES:
            crawl(slug, label, "", seen, sets)
    apply_aliases(sets, aliases)

    # Users' collections are keyed by "<set id>/<mini id>". A key that disappears orphans every
    # collection entry that uses it, so refuse to write data that drops any previously shipped key.
    published = read_published()
    keys = {s["id"] + "/" + m["id"] for s in sets for m in s["minis"]}
    missing = [k for k in published if k not in keys]
    if missing:
        print(f"\nREFUSING TO WRITE: {len(missing)} previously published mini keys are missing from the new scrape:")
        for k in missing[:50]:
            print("  ", k)
        print("Users' saved collections reference these keys. If MinisGallery renumbered/renamed a mini, add an")
        print("alias in data/corrections.json from its new key to the old one; otherwise fix the scrape.")
        print("Nothing was written.")
        sys.exit(1)

    apply_overrides(sets, overrides)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = {"source": BASE, "scraped": scraped, "sets": sets}
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False))
    # Same data as a script so index.html works when opened straight from disk (file://).
    OUT.with_suffix(".js").write_text("window.MINIS_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n")
    new = sorted(keys - set(published))
    if new:
        with PUBLISHED.open("a") as f:
            f.write("".join(k + "\n" for k in new))
    print(f"{len(sets)} sets, {sum(len(s['minis']) for s in sets)} minis -> {OUT} ({len(new)} new keys published)")


if __name__ == "__main__":
    main()
