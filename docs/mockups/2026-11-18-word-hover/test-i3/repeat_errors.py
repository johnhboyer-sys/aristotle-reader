"""Units of NE I.2 that most aligners get wrong under both prompt v2 and v3
(subagent runs), against John's rulings, with each answer spelled out.

  python3 -I repeat_errors.py   # prints the list, writes repeat-errors.json
"""
import json, sys, io, contextlib
from pathlib import Path
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE)); sys.argv = ["x", "out2s"]
with contextlib.redirect_stdout(io.StringIO()):
    import score2 as S
W = S.SJ.d["words"]; F = dict(S.SJ.d["greek"])
fixed = {p.stem for p in (HERE.parent / "test-i2" / "john-db" / "corrections").glob("*.json")}
MODELS = ["claude-opus-5-5", "codex", "claude-sonnet-5-5"]
runs = {}
for m in MODELS:
    for pre in ("out2s", "out3s"):
        S.PREFIX = pre; runs[(m, pre)] = S.load2(m)[0]
eng = lambda ws: " ".join(f"{W[w]}" for w in sorted(ws)) or "–"
out = []
for u in S.units:
    gold = (S.G_lit[u], S.G_loose[u])
    wrong = [k for k, a in runs.items() if (a[u][0], a[u][1]) != gold]
    if len(wrong) < 4: continue          # at least 4 of the 6 runs miss it
    row = {"unit": list(u), "greek": " ".join(F[k] for k in u), "john_ruled": bool(set(u) & fixed), "misses": len(wrong),
           "gold": {"lit": eng(gold[0]), "loose": eng(gold[1])},
           "runs": {f"{m.split('-')[1] if m != 'codex' else 'codex'}-{p[3]}": {"lit": eng(runs[(m, p)][u][0]), "loose": eng(runs[(m, p)][u][1])} for m, p in runs}}
    out.append(row)
json.dump(out, open(HERE / "repeat-errors.json", "w"), ensure_ascii=False, indent=1)
print(len(out), "units missed by at least 4 of 6 runs;", sum(r["john_ruled"] for r in out), "of them ruled by John")
for r in out:
    print(f"\n{'*' if r['john_ruled'] else ' '} {r['greek']} ({'+'.join(r['unit'])}) {r['misses']}/6  JOHN lit[{r['gold']['lit']}] loose[{r['gold']['loose']}]")
    seen = {}
    for k, v in r["runs"].items():
        seen.setdefault((v["lit"], v["loose"]), []).append(k)
    for (l, s), ks in seen.items():
        print(f"     {','.join(ks):40} lit[{l}] loose[{s}]")
