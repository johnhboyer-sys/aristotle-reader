"""Build alignment-results/<vid>/index.html (dark-mode per-book summary) AND the
combined gloss map the pipeline reads (alignment-results/<vid>/<work>_<vid>_gloss_map.json).
Usage: uv run python tools/make_index.py [work=EN] [vid=ross]"""
import json
import sys
from collections import Counter
from pathlib import Path

WORK = sys.argv[1] if len(sys.argv) > 1 else "EN"
VID = sys.argv[2] if len(sys.argv) > 2 else "ross"
RES = Path(__file__).resolve().parents[2] / "alignment-results" / VID
rows = []
tot = Counter()
tot_chapters = 0
combined: dict = {}
for f in sorted((RES / "maps").glob("book-*.json")):
    b = int(f.stem.split("-")[1])
    m = json.loads(f.read_text())
    combined.update(m)
    c = Counter()
    for rec in m.values():
        for a in rec["anchors"]:
            if a["tier"] in ("column", "five_line"):
                c[a["confidence"]] += 1
    real = sum(c.values())
    solid = c["reliable"] + c["confirmed"] + c["certain"]
    rows.append((b, len(m), real, c["confirmed"], c["uncertain"], solid))
    tot.update(c)
    tot_chapters += len(m)

T_real = sum(tot.values())
T_solid = tot["reliable"] + tot["confirmed"] + tot["certain"]
css = """body{font:15px/1.6 Georgia,serif;max-width:820px;margin:2rem auto;padding:0 1rem;
background:#16181c;color:#c9cdd4}h1{font-size:1.4rem;color:#e6e9ef}a{color:#7fb0ff}
table{border-collapse:collapse;width:100%;margin-top:1rem}td,th{border-bottom:1px solid #2c3038;padding:.5rem .7rem;text-align:right}
th{color:#e6e9ef;border-bottom:2px solid #444b57}td:first-child,th:first-child{text-align:left}
.tot{font-weight:700;color:#e6e9ef;border-top:2px solid #444b57}.sub{color:#8c93a0}"""
tr = []
for b, ch, real, conf, unc, solid in rows:
    pct = 100 * solid / real if real else 0
    tr.append(f"<tr><td><a href='review/book-{b:02d}.html'>Book {b}</a></td><td>{ch}</td>"
              f"<td>{real}</td><td>{conf}</td><td>{unc}</td><td>{pct:.1f}%</td></tr>")
totpct = 100 * T_solid / T_real if T_real else 0
tr.append(f"<tr class='tot'><td>All 10 books</td><td>{tot_chapters}</td><td>{T_real}</td>"
          f"<td>{tot['confirmed']}</td><td>{tot['uncertain']}</td><td>{totpct:.1f}%</td></tr>")
html = f"""<!doctype html><meta charset=utf-8><title>Ross NE — Bekker alignment</title><style>{css}</style>
<h1>Ross, Nicomachean Ethics — Bekker alignment results</h1>
<p class=sub>Real Bekker ticks placed on the unmarked Ross translation by the gloss aligner
(standard-terminology glosses → word-overlap match → direct-reading verifier on the uncertain
ones). Each book's page shows every tick: the 3-line Greek-window gloss beside the Ross text it
landed on. <b>Confirmed</b> = re-placed by the verifier; <b>uncertain</b> = shown as estimate.</p>
<table><tr><th>Book</th><th>Chapters</th><th>Real ticks</th><th>Verifier-confirmed</th>
<th>Uncertain</th><th>High-confidence</th></tr>{''.join(tr)}</table>
<p class=sub>Open any book to spot-check placement. Solid ticks are cited with confidence;
the few uncertain ones are flagged as estimates.</p>"""
(RES / "index.html").write_text(html, encoding="utf-8")
# Combined map the pipeline (stage1_ross._load_align_map) reads at build time.
cmap = RES / f"{WORK}_{VID}_gloss_map.json"
cmap.write_text(json.dumps(combined, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"index -> {RES/'index.html'}  ({tot_chapters} chapters, {T_real} ticks, {totpct:.1f}% high-confidence)")
print(f"combined map -> {cmap}")
