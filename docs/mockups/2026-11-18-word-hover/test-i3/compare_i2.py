"""Rackham against Ostwald on the same Greek (NE I.2), by each model's own
Literal/Loose labels from prompt v2.

  python3 -I compare_i2.py   # prints the table, writes compare-i2.json

The models' Loose labels agreed with John's only about half the time on
Rackham's I.2 (score2.py), so this measures the models' reading of each
translator. John's own rulings on both are the real measure.
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
TR = {"Rackham": (HERE.parent / "test-i2" / "i2.json", "i2"), "Ostwald": (HERE / "i2o.json", "i2o")}
MODELS = {"claude-opus-5-5": "Opus 5.5", "codex": "GPT-6.1 Sol", "claude-sonnet-5-5": "Sonnet 5.5"}

rows = []
print(f"{'model':12} {'translator':9} {'words':>5} {'lit':>5} {'loose':>6} {'none':>5}   {'units w/ loose':>14} {'units no Eng':>12}")
for m, label in MODELS.items():
    for tr, (path, ch) in TR.items():
        f = HERE / f"out2-{ch}-{m}.json"
        if not f.exists(): print(f"{label:12} {tr:9} (no output)"); continue
        r = json.loads(f.read_text())
        if not r.get("units"): print(f"{label:12} {tr:9} failed: {r.get('error') or r.get('stop_reason')}"); continue
        n = len(json.loads(path.read_text())["words"])
        lit = {w for u in r["units"] for w in u["lit"] if 0 <= w < n}
        loose = {w for u in r["units"] for w in u["loose"] if 0 <= w < n} - lit
        units = r["units"]
        with_loose = sum(1 for u in units if set(u["loose"]) - set(u["lit"]))
        empty = sum(1 for u in units if not u["lit"] and not u["loose"])
        row = {"model": label, "translator": tr, "words": n, "lit": len(lit) / n, "loose": len(loose) / n,
               "none": 1 - (len(lit) + len(loose)) / n, "units": len(units), "units_with_loose": with_loose / len(units),
               "units_empty": empty / len(units)}
        rows.append(row)
        print(f"{label:12} {tr:9} {n:5} {row['lit']:5.0%} {row['loose']:6.0%} {row['none']:5.0%}   "
              f"{with_loose:4}/{len(units):3} {row['units_with_loose']:4.0%} {empty:6}/{len(units):3}")
json.dump(rows, open(HERE / "compare-i2.json", "w"), indent=1)
