"""Score the verifier: for each uncertain tick, compare Method-A error vs the
verifier's placement (locate its quoted phrase in Rackham, snap to sentence start),
both against the gold tick. Reports before/after per tick and in aggregate."""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "pipeline"))

from aristotle_pipeline.align.aligner import split_sentences
from aristotle_pipeline.align.reference import default_target, load_chapters

meta = json.loads((REPO / "build/align/verify_meta.json").read_text())
_v, target = default_target("EN")
mile = {(c.book, int(c.chapter)): c.ref_text for c in load_chapters(target) if c.book == 1}
OUT = REPO / "build/align/verify_out/EN"


def snap_sentence(text, off):
    starts = [s for s, _ in split_sentences(text)] or [0]
    return max((s for s in starts if s <= off), default=starts[0])


def nearest(text, phrase, near):
    if not phrase:
        return None
    i = text.find(phrase)
    best = None
    while i != -1:
        if best is None or abs(i - near) < abs(best - near):
            best = i
        i = text.find(phrase, i + 1)
    return best


rows = []
for key, m in meta.items():
    chap, cit = key.split("|")
    b, cp = (int(x) for x in chap.split(":"))
    text = mile[(b, cp)]
    phrases = json.loads((OUT / f"{b}-{cp}.json").read_text()) if (OUT / f"{b}-{cp}.json").exists() else {}
    phrase = (phrases.get(cit) or "").strip()
    before = abs(m["a_offset"] - m["gold"])
    found = nearest(text, phrase, m["a_offset"])
    if found is None:
        after, note = before, "no-phrase/not-found"
    else:
        after = abs(snap_sentence(text, found) - m["gold"])
        note = "ok" if phrase else "empty"
    rows.append((chap, cit, before, after, note))

print(f"{'tick':14} {'before':>7} {'after':>7}  note")
print("-" * 46)
tb = ta = 0
for chap, cit, before, after, note in sorted(rows):
    tb += before
    ta += after
    flag = "  <-- fixed" if after < before - 1 else ("  (worse)" if after > before + 1 else "")
    print(f"{cit:14} {before:7d} {after:7d}  {note}{flag}")
n = len(rows)
print("-" * 46)
print(f"uncertain ticks: {n}")
print(f"mean error  before={tb/n:.0f}  after={ta/n:.0f}")
print(f"exact (0)   before={sum(1 for r in rows if r[2]==0)}  after={sum(1 for r in rows if r[3]==0)}")
print(f"within 1 sentence (<=120) before={sum(1 for r in rows if r[2]<=120)}  after={sum(1 for r in rows if r[3]<=120)}")
