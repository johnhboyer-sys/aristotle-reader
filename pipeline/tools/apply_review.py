"""Import the review pages' JSON exports as John's rulings.

  [ALIGN_SLOT=primary] uv run python tools/apply_review.py <WORK> <export.json> [...]

An export is a review page's "Export JSON" file, review-<WORK>-<vid>-bookNN.json:
{citation: {verdict?, phrase?}}. Each tick becomes a ruling in
alignment-results/<vid>/rulings/<WORK>.json (commit it; newest export wins per
tick), which every pass 2 applies word-exact (align/rulings.py):
  - a clicked word pins the tick there;
  - "Spot on" with no word pins it where it sits now, so no re-run moves it;
  - "Early"/"Late" with no word is recorded and listed: it needs a place.
Refused, with nothing written: a chapter-start tick (the Greek fixes those), a
tick not in the shipped map, a phrase not in the text, rulings out of order.
Writes pass 2's overrides from the shipped map if build/ has none.
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "pipeline"))

from aristotle_pipeline.align import rulings
from aristotle_pipeline.align.reference import default_target

if len(sys.argv) < 3:
    sys.exit("usage: apply_review.py <WORK> <export.json> [...]")
WORK, EXPORTS = sys.argv[1], [Path(a) for a in sys.argv[2:]]
vid, prose = default_target(WORK)
shipped = json.loads((REPO / "alignment-results" / vid / f"{WORK}_{vid}_gloss_map.json").read_text())

ticks, starts = {}, set()       # citation -> (chapter, offset, tier); chapter-start citations
order = {}                      # chapter -> real ticks in reading order
for chap, rec in shipped.items():
    for a in rec["anchors"]:
        if a["tier"] == "chapter":
            starts.add(a["citation"])
        elif a["tier"] in ("column", "five_line"):
            ticks[a["citation"]] = (chap, a["offset"], a["tier"])
            order.setdefault(chap, []).append(a["citation"])

rul = rulings.load(WORK, vid, REPO)
errors, unplaced, columns = [], [], []
for exp in EXPORTS:
    if not re.fullmatch(rf"review-{re.escape(WORK)}-{re.escape(vid)}-book\d+\.json", exp.name):
        sys.exit(f"{exp.name}: not a review export for {WORK}/{vid} (review-{WORK}-{vid}-bookNN.json)")
    for cit, r in json.loads(exp.read_text(encoding="utf-8")).items():
        verdict, phrase = r.get("verdict"), r.get("phrase")
        if cit in starts:
            errors.append(f"{cit}: a chapter-start tick (the Greek fixes it)")
            continue
        if cit not in ticks:
            errors.append(f"{cit}: not a tick in the shipped map")
            continue
        chap, off, tier = ticks[cit]
        b, c = (int(x) for x in chap.split(":"))
        text = prose[(b, c)]
        if phrase:
            near = rulings.locate(text, phrase, off)
            if near is None:
                errors.append(f"{cit}: clicked phrase not in the text")
                continue
            ruling = {"phrase": phrase, "near": near}
        elif verdict == "ok":
            ruling = {"phrase": text[off:off + 80], "near": off}
        elif verdict in ("early", "late"):
            ruling = {}
            unplaced.append(f"{cit} ({verdict})")
        else:
            continue
        if verdict:
            ruling = {"verdict": verdict, **ruling}
        rul.setdefault(chap, {})[cit] = {**ruling, "export": exp.name}
        if tier == "column" and "phrase" in ruling:
            columns.append(cit)

# Rulings must read in Bekker order with each other; machine ticks give way.
pinned = rulings.offsets(rul, prose) if not errors else {}
for chap, placed in pinned.items():
    seq = [(cit, placed[cit]) for cit in order[chap] if cit in placed]
    errors += [f"{a} at {x} comes after {b} at {y}" for (a, x), (b, y) in zip(seq, seq[1:]) if y < x]
if errors:
    sys.exit("nothing written:\n  " + "\n  ".join(errors))

out = rulings.path(WORK, vid, REPO)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({k: dict(sorted(v.items())) for k, v in sorted(rul.items())},
                          ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
n = sum(len(v) for v in rul.values())
print(f"{out.relative_to(REPO)}: {n} rulings ({sum(len(v) for v in pinned.values())} pin a place)")
if unplaced:
    print(f"  no word clicked, so these still need a place: {', '.join(unplaced)}")
if columns:
    print(f"  column starts {columns}: a primary translation's reader cuts columns by estimate, "
          "so these reach it only once its columns are cut from the anchors (anchor_cuts)")

ovr = REPO / "build" / "align" / f"{WORK}_{vid}_gloss_overrides.json"
if not ovr.exists():
    seed = {chap: {a["citation"]: a["offset"] for a in rec["anchors"]
                   if a["tier"] in ("column", "five_line") and a["confidence"] == "confirmed"}
            for chap, rec in shipped.items()}
    ovr.parent.mkdir(parents=True, exist_ok=True)
    ovr.write_text(json.dumps(seed, indent=1), encoding="utf-8")
    print(f"  pass 2 starts from the shipped placements ({ovr.relative_to(REPO)})")
books = sorted({int(c.split(":")[0]) for c in rul})
print(f"next: for each book in {books}: pass 2 (align --provider gloss), WORK={WORK} persist_book;"
      f" then make_index {WORK} {vid}, gloss_map_to_anchors {WORK} {vid} (primaries), all --work {WORK}")
