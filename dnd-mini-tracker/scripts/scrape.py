#!/usr/bin/env python3
"""Scrape D&D Icons of the Realms core sets from minisgallery.com into public/data/minis.json and public/data/minis.js."""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

BASE = "https://www.minisgallery.com/"
INDEX = BASE + "index.php?id=icons-of-the-realms-core-sets"
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


def main():
    index = fetch(INDEX)
    body = index.split("Icons of the Realms (Core Sets)", 1)[-1]
    slugs = list(dict.fromkeys(re.findall(r'href="index\.php\?id=([a-z0-9-]+)"', body)))
    slugs = [s for s in slugs if s not in ("main-menu", "dungeons-and-dragons", "icons-of-the-realms", "icons-of-the-realms-core-sets")]
    sets = []
    for slug in slugs:
        print("fetching", slug)
        sets.append(parse_set(slug, fetch(BASE + "index.php?id=" + slug)))
        time.sleep(0.5)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = {"source": INDEX, "scraped": time.strftime("%Y-%m-%d"), "sets": sets}
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False))
    # Same data as a script so index.html works when opened straight from disk (file://).
    OUT.with_suffix(".js").write_text("window.MINIS_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n")
    print(f"{len(sets)} sets, {sum(len(s['minis']) for s in sets)} minis -> {OUT}")


if __name__ == "__main__":
    main()
