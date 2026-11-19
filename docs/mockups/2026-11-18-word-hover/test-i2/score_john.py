"""Score every aligner against John's rulings for NE I.2.

  python3 -I score_john.py   # prints the table, writes scores-john.json

John's gold: his corrections (john-db/corrections/*.json, a snapshot of the
I.2 page's store) laid over my reference, as the page's "Yours" shows it. He
reviewed every word (2026-11-18: "I clicked every word"), so a token he did
not correct is one he accepted; the whole chapter is his reading. It was
reviewed with my reference shown as the starting point, so it may lean
toward it (anchoring); the John-ruled table is the part free of that. Scoring is by unit
(article + noun, εἰ … καί), the way he ruled: a unit's English is the union
of its members'.

The aligners were asked for one kind of link, so their links are scored
against Literal ∪ Loose; Literal recall says how much of the strict reading
each one found.
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from gold import G, GROUPS, UNITS

d = json.loads((HERE / "i2.json").read_text())
order = [g for g, _ in d["greek"]]
nwords = len(d["words"])

fix = {p.stem: json.loads(p.read_text()) for p in (HERE / "john-db" / "corrections").glob("*.json")}
assert fix, "no corrections snapshot: the check would examine nothing"
ref_ext = {g[0]: set(e) - set(G.get(g[0], [])) for g, e in GROUPS if len(g) == 1}

unit_of = {k: tuple(u) for u in UNITS for k in u}
units = []
for k in order:
    u = unit_of.get(k, (k,))
    if u not in units:
        units.append(u)


def gold(u):
    lit, loose = set(), set()
    for k in u:
        if k in fix:
            lit |= set(fix[k]["lit"]); loose |= set(fix[k]["loose"])
        else:
            lit |= set(G.get(k, [])); loose |= ref_ext.get(k, set())
    return lit, loose - lit


def load(name):
    if name == "ref":
        a = {k: set(v) | ref_ext.get(k, set()) for k, v in G.items()}
    else:
        a = {}
        for l in json.loads((HERE / f"out-{name}.json").read_text()).get("links") or []:
            a.setdefault(l["g"], set()).update(w for w in l["e"] if 0 <= w < nwords)
    return {u: set().union(*(a.get(k, set()) for k in u)) for u in units}


# John 2026-11-19, on a noun the translator adds for what the Greek implies
# ("what point" for τίνος): "The noun is loose I'd say." These units he had
# accepted from the reference with the noun Literal; the noun moves to Loose.
# English word numbers in Rackham's I.2. Supplied adjectives ("all", "practical",
# "one ultimate") are not covered by the ruling and stay as they were.
NOUN_LOOSE = {"a21.9": [69],          # τοῦτ'  "this one ultimate End": End
              "a27.5": [184, 185],    # ἡ πολιτικὴ  "the science of Politics": science of
              "b3.1": [243, 244],     # ταύτην  "the political science": political science (names what the pronoun points to)
              "b6.1": [283],          # ταύτης  "of this science": science
              "b1.6": [220],          # τίνος  "what point": point
              "b5.7": [273],          # τίνων  "what things": things
              "b6.5": [287]}          # τὰ  "the ends": ends
AMEND = "--as-given" not in sys.argv
_gold = gold
def gold(u):
    lit, loose = _gold(u)
    for k in u:
        if AMEND and k in NOUN_LOOSE:
            mv = set(NOUN_LOOSE[k]); assert mv <= set(lit), (k, mv, lit)
            lit, loose = set(lit) - mv, set(loose) | mv
    return lit, loose
G_lit = {u: gold(u)[0] for u in units}
G_all = {u: gold(u)[0] | gold(u)[1] for u in units}
pairs = lambda m: {(u, w) for u, ws in m.items() for w in ws}
gl, ga = pairs(G_lit), pairs(G_all)

rows = []
for name, label in [("ref", "My reference"), ("claude-opus-5-5", "Opus 5.5"), ("codex", "GPT-6.1 Sol"),
                    ("claude-haiku-5-5", "Haiku 5.5"), ("claude-sonnet-5-5", "Sonnet 5.5 (stopped early)")]:
    m = load(name); mp = pairs(m)
    prec = len(mp & ga) / len(mp) if mp else 0
    rec = len(mp & ga) / len(ga)
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0
    lit_rec = len(mp & gl) / len(gl)
    exact = sum(m[u] == G_all[u] for u in units) / len(units)
    rows.append({"aligner": label, "precision": prec, "recall": rec, "f1": f1, "literal_recall": lit_rec, "exact_units": exact})

print(f"{len(fix)} corrected tokens; {len(units)} units; gold: {len(gl)} literal + {len(ga) - len(gl)} loose links\n")
print("WHOLE CHAPTER (John reviewed every word; uncorrected = accepted, with my reference as the starting point)")
print(f"{'aligner':28} {'prec':>5} {'rec':>5} {'F1':>5} {'lit-rec':>8} {'exact':>6}")
for r in rows:
    print(f"{r['aligner']:28} {r['precision']:5.2f} {r['recall']:5.2f} {r['f1']:5.2f} {r['literal_recall']:8.2f} {r['exact_units']:6.2f}")

# The independent part: only the units John ruled himself.
ruled_u = [u for u in units if any(k in fix for k in u)]
rgl = {(u, w) for u in ruled_u for w in G_lit[u]}
rga = {(u, w) for u in ruled_u for w in G_all[u]}
print(f"\nJOHN-RULED UNITS ONLY ({len(ruled_u)} units; {len(rgl)} literal + {len(rga) - len(rgl)} loose links)")
print(f"{'aligner':28} {'prec':>5} {'rec':>5} {'F1':>5} {'lit-rec':>8} {'exact':>6}")
ruled_rows = []
for name, label in [("ref", "My reference"), ("claude-opus-5-5", "Opus 5.5"), ("codex", "GPT-6.1 Sol"), ("claude-haiku-5-5", "Haiku 5.5")]:
    m = load(name); mp = {(u, w) for u in ruled_u for w in m[u]}
    p = len(mp & rga) / len(mp); r = len(mp & rga) / len(rga); f = 2 * p * r / (p + r)
    lr = len(mp & rgl) / len(rgl); ex = sum(m[u] == G_all[u] for u in ruled_u) / len(ruled_u)
    ruled_rows.append({"aligner": label, "precision": p, "recall": r, "f1": f, "literal_recall": lr, "exact_units": ex})
    print(f"{label:28} {p:5.2f} {r:5.2f} {f:5.2f} {lr:8.2f} {ex:6.2f}")

# How often was my reference wrong, and did shared agreement hide errors?
items = json.loads((HERE / "review-items.json").read_text())["items"]
todo_units = {unit_of.get(it["g"], (it["g"],)) for it in items}
ruled = {u for u in units if any(k in fix for k in u)}
checks = [it for it in items if it["kind"] == "check"]
check_units = {unit_of.get(it["g"], (it["g"],)) for it in checks}
ref = load("ref")
changed = [u for u in ruled if ref[u] != G_all[u]]
check_changed = [u for u in check_units & ruled if ref[u] != G_all[u]]
print(f"\nunits to check: {len(todo_units)}; ruled by John: {len(todo_units & ruled)}; also ruled outside the list: {len(ruled - todo_units)}")
print(f"units where John's reading differs from my reference: {len(changed)} of {len(ruled)} he ruled")
print(f"spot checks (all three agreed): {len(check_units)}; ruled: {len(check_units & ruled)}; changed: {len(check_changed)}")
json.dump({"rows_whole_chapter": rows, "rows_john_ruled": ruled_rows, "corrected_tokens": len(fix), "units": len(units),
           "todo_units": len(todo_units), "todo_ruled": len(todo_units & ruled), "ruled_outside": len(ruled - todo_units),
           "ref_changed": len(changed), "checks": len(check_units), "checks_ruled": len(check_units & ruled), "checks_changed": len(check_changed)},
          open(HERE / "scores-john.json", "w"), indent=1)
