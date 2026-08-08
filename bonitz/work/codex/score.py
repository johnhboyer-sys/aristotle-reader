"""
Score any Codex read against the reconciled gold for the same column.

Gold is the Opus spine with adjudicated verdicts applied (reconcile.py), so it
is NOT independent of Opus and cannot be used to score Opus. Codex never saw
it, so a Codex-vs-gold CER is fair, bounded below by gold's own residual error.

    python3 work/codex/score.py page-052-L [...]
"""
import sys, difflib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from bonitz_pipeline.normalize import canonical, clean_opus, fold

R = Path(__file__).resolve().parent.parent.parent
LIG, KAI = 'ȣ', 'ϗ'


def canon(t):
    return canonical(clean_opus(t))[0]


def cer(a, b):
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    e = sum(max(i2 - i1, j2 - j1) for t, i1, i2, j1, j2 in sm.get_opcodes() if t != 'equal')
    return e / len(a) * 100, e


rows = []
for stem in sys.argv[1:]:
    g = canon((R / 'work/reconciled' / f'{stem}.txt').read_text(encoding='utf-8'))
    for tag, suffix in (('book.pdf', '.txt'), ('400 dpi', '.400.txt')):
        f = R / 'work/codex' / f'{stem}{suffix}'
        if not f.exists():
            continue
        c = canon(f.read_text(encoding='utf-8'))
        pct, e = cer(g, c)
        fpct, _ = cer(fold(g), fold(c))
        rows.append((stem, tag, pct, e, fpct,
                     c.count(LIG), g.count(LIG), c.count(KAI), g.count(KAI)))

print(f'{"column":12} {"scan":9} {"CER":>8} {"edits":>6} {"folded":>8}   ligatures')
print('-' * 66)
for s, t, p, e, fp, cl, gl, ck, gk in rows:
    print(f'{s:12} {t:9} {p:7.3f}% {e:6d} {fp:7.3f}%   ȣ {cl:2d}/{gl:<2d}  ϗ {ck:2d}/{gk:<2d}')
