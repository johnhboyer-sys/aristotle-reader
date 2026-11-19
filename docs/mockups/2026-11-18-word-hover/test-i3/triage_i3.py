"""Which I.3 units a shorter review list would flag, made before John's review.

  python3 -I triage_i3.py   # prints the sizes, writes triage-i3.json

A  units where Opus v4 and Codex v4 disagree (the page's dots).
B  units the four-translation comparison flags for Ostwald: a word it calls
   supplied that Opus files as Literal or leaves unlinked, or a construction
   note where Ostwald's English is involved.
Once John's corrections exist, score_triage (to come) checks how many of his
changes fall inside A, B, and A ∪ B.
"""
import json, re
from pathlib import Path
HERE = Path(__file__).parent
d = json.loads((HERE / "i3.json").read_text())
eng = d["english"]
wpos = [(m.start(), m.end()) for m in re.finditer(r"[A-Za-z’'-]+", eng)]
def words_in(a, b): return [i for i, (s, e) in enumerate(wpos) if s >= a and e <= b]
def find(text, start=0):
    pat = r"\s+".join(map(re.escape, text.split()))
    m = re.compile(pat).search(eng, start)
    return (m.start(), m.end()) if m else None

def load(f):
    r = json.loads((HERE / f).read_text())
    lit, loose, units = {}, {}, []
    for x in r["units"]:
        units.append(tuple(x["g"]))
        for k in x["g"]:
            lit[k] = set(x["lit"]); loose[k] = set(x["loose"]) - set(x["lit"])
    return lit, loose, units
ol, oo, units = load("out4s-i3-claude-opus-5-5.json")
cl, co, _ = load("out4-i3-codex.json")
unit_of = {k: u for u in units for k in u}

A = {u for u in units if any(ol.get(k) != cl.get(k) or oo.get(k) != co.get(k) for k in u)}
c = json.loads((HERE.parent / "compare" / "compare-i3.json").read_text())
B, why = set(), {}
for s in c["sentences"]:
    span = find(s["renderings"]["Ostwald"])
    if not span: print("sentence not found", s["n"]); continue
    for n in s["notes"]:
        by = n["by"].get("Ostwald") or ""
        us = {unit_of[k] for k in n["ids"] if k in unit_of}
        if not by or not us: continue
        ws, at = [], span[0]
        for part in by.split(" … "):
            hit = find(part, at)
            if hit and hit[1] <= span[1] + 1: ws += words_in(*hit); at = hit[1]
        if n["kind"] == "construction":
            for u in us: B.add(u); why.setdefault(u, []).append("construction")
        if n["kind"] == "supplied":
            for u in us:
                lit = set().union(*(ol.get(k, set()) for k in u)); allw = lit | set().union(*(oo.get(k, set()) for k in u))
                if set(ws) & lit or not set(ws) <= allw:
                    B.add(u); why.setdefault(u, []).append("supplied: " + by)
print(f"{len(units)} units; A (Opus≠Codex) {len(A)}; B (comparison flags) {len(B)}; A∪B {len(A | B)}; A∩B {len(A & B)}")
json.dump({"A": [list(u) for u in A], "B": [list(u) for u in B], "why": {"+".join(u): w for u, w in why.items()}},
          open(HERE / "triage-i3.json", "w"), ensure_ascii=False, indent=1)
