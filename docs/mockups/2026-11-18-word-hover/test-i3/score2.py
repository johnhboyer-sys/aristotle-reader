"""Score prompt-v2 outputs (units with lit/loose) on NE I.2 against John's rulings.

  python3 -I score2.py        # prompt v2: prints the table, writes scores2-i2.json
  python3 -I score2.py out3   # prompt v3 (with crib): writes scores3-i2.json

Gold is John's reviewed I.2 (see test-i2/score_john.py). Units used as worked
examples in prompt_v2 are left out: the prompt shows their answers. For
comparison, each aligner's v1 links (one kind of link) are scored on the same
units against Literal ∪ Loose.
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).parent
PREFIX = sys.argv[1] if len(sys.argv) > 1 else "out2"
I2 = HERE.parent / "test-i2"
sys.path.insert(0, str(I2))
import contextlib, io
with contextlib.redirect_stdout(io.StringIO()):
    import score_john as SJ   # gold for I.2: SJ.units, SJ.G_lit, SJ.G_all, SJ.load (v1); silence its own table

# Units whose answers prompt_v2 shows (worked examples and rule examples)
EXAMPLES = {"a18.7", "a18.9", "a19.0", "a19.4", "a22.3", "a22.4", "a28.3", "a28.4", "b1.3", "b1.7", "b2.0",
            "b7.4", "b7.5", "b7.6", "b7.8", "b10.8", "b10.9", "b11.0", "b11.1", "b11.2", "b11.3", "b11.4", "b11.5", "b11.6"}
units = [u for u in SJ.units if not set(u) & EXAMPLES]
order = [g for g, _ in SJ.d["greek"]]
ids = set(order)
nwords = len(SJ.d["words"])
G_lit = {u: SJ.G_lit[u] for u in units}
G_loose = {u: SJ.G_all[u] - SJ.G_lit[u] for u in units}
G_all = {u: SJ.G_all[u] for u in units}


def load2(name):
    """A v2 output as per-gold-unit (lit, loose), plus coverage facts."""
    r = json.loads((HERE / f"{PREFIX}-i2-{name}.json").read_text())
    if not r.get("units"):
        return None, r
    lit, loose, seen, dup, unknown, munits = {}, {}, set(), set(), set(), []
    for x in r["units"]:
        g = tuple(x["g"]); munits.append(g)
        for k in g:
            if k not in ids: unknown.add(k); continue
            if k in seen: dup.add(k)
            seen.add(k)
            lit[k] = {w for w in x["lit"] if 0 <= w < nwords}
            loose[k] = {w for w in x["loose"] if 0 <= w < nwords} - lit[k]
    per = {u: (set().union(*(lit.get(k, set()) for k in u)), set().union(*(loose.get(k, set()) for k in u))) for u in units}
    multi_gold = [u for u in SJ.units if len(u) > 1 and not set(u) & EXAMPLES]
    found = sum(1 for u in multi_gold if any(set(u) <= set(m) for m in munits))
    r["_cover"] = {"tokens": len(order), "covered": len(seen & set(order)), "dup": len(dup), "unknown": len(unknown),
                   "units_found": f"{found}/{len(multi_gold)}"}
    return per, r


def prf(model, gold):
    mp = {(u, w) for u in units for w in model[u]}; gp = {(u, w) for u in units for w in gold[u]}
    p = len(mp & gp) / len(mp) if mp else 0; r = len(mp & gp) / len(gp) if gp else 0
    return p, r, (2 * p * r / (p + r) if p + r else 0)


PRICE = {"claude-haiku-5-5": (0.05, 0.25), "claude-sonnet-5-5": (1.0, 5.0), "claude-opus-5-5": (2.0, 10.0)}
print(f"I.2, {len(units)} units scored ({len(SJ.units) - len(units)} example units left out); gold {sum(map(len, G_lit.values()))} literal + {sum(map(len, G_loose.values()))} loose links\n")
print(f"{'aligner':20} {'lit P':>6} {'lit R':>6} {'loose P':>8} {'loose R':>8} {'all F1':>7} {'v1 F1':>6} {'exact':>6}  coverage / units / cost")
rows = []
for name, label, v1 in [("claude-opus-5-5", "Opus 5.5", "claude-opus-5-5"), ("codex", "GPT-6.1 Sol", "codex"),
                        ("claude-sonnet-5-5", "Sonnet 5.5", "claude-sonnet-5-5"), ("claude-haiku-5-5", "Haiku 5.5", "claude-haiku-5-5")]:
    if not (HERE / f"{PREFIX}-i2-{name}.json").exists():
        print(f"{label:20} (no output)"); continue
    per, r = load2(name)
    if per is None:
        print(f"{label:20} failed: {r.get('error') or r.get('stop_reason')}"); continue
    lp, lr, _ = prf({u: per[u][0] for u in units}, G_lit)
    sp, sr, _ = prf({u: per[u][1] for u in units}, G_loose)
    _, _, af = prf({u: per[u][0] | per[u][1] for u in units}, G_all)
    m1 = SJ.load(v1); _, _, f1v1 = prf({u: m1[u] for u in units}, G_all)
    exact = sum(per[u][0] == G_lit[u] and per[u][1] == G_loose[u] for u in units) / len(units)
    u = r.get("usage") or {}
    cost = (u.get("input_tokens", 0) * PRICE[name][0] + u.get("output_tokens", 0) * PRICE[name][1]) / 1e6 if name in PRICE else None
    c = r["_cover"]
    print(f"{label:20} {lp:6.2f} {lr:6.2f} {sp:8.2f} {sr:8.2f} {af:7.2f} {f1v1:6.2f} {exact:6.2f}  "
          f"{c['covered']}/{c['tokens']} dup {c['dup']} unk {c['unknown']} / {c['units_found']} / " + (f"${cost:.4f}" if cost is not None else "subscription"))
    rows.append({"aligner": label, "lit_p": lp, "lit_r": lr, "loose_p": sp, "loose_r": sr, "all_f1": af, "v1_all_f1": f1v1, "exact": exact, "cover": c, "cost": cost})
json.dump(rows, open(HERE / f"scores{PREFIX[3:]}-i2.json", "w"), indent=1)
