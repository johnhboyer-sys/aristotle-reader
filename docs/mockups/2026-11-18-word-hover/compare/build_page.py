"""Build a comparison page from compare-iN.json (the Opus comparison) and iN-four.json.

  python3 -I build_page.py        # I.2 → page/index.html
  python3 -I build_page.py 3      # I.3 → page-i3/index.html
"""
import json, sys
from pathlib import Path
HERE = Path(__file__).parent
CH = sys.argv[1] if len(sys.argv) > 1 else "2"
c = json.loads((HERE / f"compare-i{CH}.json").read_text())
f = json.loads((HERE / f"i{CH}-four.json").read_text())
greek = {s["n"]: s for s in f["sentences"]}
data = {"sentences": [{**s, "ids": greek[s["n"]]["ids"], "forms": greek[s["n"]]["greek"].split(" ")} for s in c["sentences"]],
        "patterns": c["patterns"], "words": {k: len(v.split()) for k, v in f["translations"].items()}}
for s in data["sentences"]:
    assert len(s["ids"]) == len(s["forms"]), s["n"]
out = HERE / ("page" if CH == "2" else f"page-i{CH}")
out.mkdir(exist_ok=True)
html = (HERE / "template.html").read_text().replace("__DATA__", json.dumps(data, ensure_ascii=False))
if CH == "3":
    html = (html.replace("<title>Four Translations, NE I.2</title>", "<title>Four Translations, NE I.3</title>")
                .replace("Chapter 2 · 1094a18–1094b10", "Chapter 3 · 1094b11–1095a13")
                .replace("<h1>Four Translations, NE I.2</h1>", "<h1>Four Translations, NE I.3</h1>"))
(out / "index.html").write_text(html)
print("ok", sum(len(s["notes"]) for s in data["sentences"]), "notes")
