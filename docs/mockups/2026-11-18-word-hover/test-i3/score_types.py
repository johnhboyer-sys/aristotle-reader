"""Exact-unit hits on the I.2 repeat errors, by type, for each prompt.

  python3 -I score_types.py out2s out3s out4s

Types are my sorting of repeat-errors.json (2026-11-19). Gold is John's I.2
reading; types 2 and 3 are mostly units he accepted from the reference unchanged.
"""
import sys, io, contextlib
from pathlib import Path
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE)); prefixes = sys.argv[1:]; sys.argv = ["x", "out2s"]
with contextlib.redirect_stdout(io.StringIO()):
    import score2 as S
TYPES = {
    "1 shared frames": ["a25.5", "a26.8", "a27.1", "a22.9", "b1.2", "b5.5", "b5.8", "b6.6", "b8.5", "b8.6", "b9.8", "b10.1", "b10.4", "b10.5", "b10.7"],
    "2 grammar Literal": ["a19.10", "a20.4", "a21.1", "a21.7", "a21.10", "a22.5", "a23.3", "a24.3", "a24.4", "a25.1", "a26.5", "a28.0", "b4.0", "b5.2", "b5.4", "b6.4", "b7.0", "b8.9"],
    "3 implied noun": ["a21.9", "a27.5", "b3.1", "b6.1", "b1.6", "b5.7", "b6.5"],
    "3b added adjective": ["a21.5", "a23.4", "b9.4"],
    "4 too much Loose": ["a18.4", "a20.6", "a22.2", "a24.0", "a26.0", "a27.2", "b2.1"],
    "5 crasis": ["b7.2", "b7.3"],
}
unit_of = {k: u for u in S.units for k in u}
Gl, Go = S.G_lit, S.G_loose
runs = {}
for pre in prefixes:
    for m in ["claude-opus-5-5", "codex", "claude-sonnet-5-5"]:
        S.PREFIX = pre
        if (HERE / f"{pre}-i2-{m}.json").exists(): runs[(pre, m)] = S.load2(m)[0]
print(f"{'type':20} {'units':>5}  " + "  ".join(f"{p[3:4]}:{m.split('-')[1] if m != 'codex' else 'sol':6}" for p, m in runs))
for t, ids in TYPES.items():
    us = list(dict.fromkeys(unit_of[k] for k in ids))
    hits = [sum(a[u][0] == Gl[u] and a[u][1] == Go[u] for u in us) for a in runs.values()]
    print(f"{t:20} {len(us):5}  " + "  ".join(f"{h:>8}" for h in hits))
allu = S.units
print(f"{'all scored units':20} {len(allu):5}  " + "  ".join(f"{sum(a[u][0] == Gl[u] and a[u][1] == Go[u] for u in allu):>8}" for a in runs.values()))
