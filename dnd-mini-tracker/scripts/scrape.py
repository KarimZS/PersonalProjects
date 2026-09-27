#!/usr/bin/env python3
"""Scrape all D&D Icons of the Realms sets from minisgallery.com into public/data/minis.json and public/data/minis.js."""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

BASE = "https://www.minisgallery.com/"
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "minis.json"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "dnd-mini-tracker/1.0"})
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
        minis.append({
            "number": text(num.group(1)).strip("()") if num else "",
            "name": text(name.group(1)),
            "rarity": text(rarity.group(1)) if rarity else "",
            "size": text(size.group(1)) if size else "",
            "image": BASE + img.group(1) if img else "",
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
]
NAV = {"main-menu", "dungeons-and-dragons", "icons-of-the-realms"} | {c for c, _ in CATEGORIES}


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


def main():
    sets, seen = [], set()
    for slug, label in CATEGORIES:
        crawl(slug, label, "", seen, sets)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = {"source": BASE + "index.php?id=icons-of-the-realms", "scraped": time.strftime("%Y-%m-%d"), "sets": sets}
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False))
    # Same data as a script so index.html works when opened straight from disk (file://).
    OUT.with_suffix(".js").write_text("window.MINIS_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n")
    print(f"{len(sets)} sets, {sum(len(s['minis']) for s in sets)} minis -> {OUT}")


if __name__ == "__main__":
    main()
