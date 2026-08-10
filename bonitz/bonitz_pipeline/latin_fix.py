"""Latin capitals standing where a Greek siglum belongs.

The same argument as the numeral slot, and the same one that settled 63 of these
on 2026-08-08: `Ρ` and `P`, `Η` and `H`, `Μ` and `M` are one printed sort and two
Unicode codepoints.  Which codepoint represents the ink was never Bonitz's
decision; it is ours, and only one of the two is a Greek letter that can name a
Greek work.  So the citation is right on the page and wrong in the file, and
correcting it moves TOWARD the ink.

`siglum_check.resolve` already identifies them — it labels them `latin` and
names the Greek form — but nothing has ever applied that label.  Twenty
citations sit there, correct, flagged, and uncorrected.

⚠ THE PAGE MUST STILL AGREE.  A Latin lookalike is only offered where the Greek
reading actually contains the Bekker page beside it; that is what distinguishes
an encoding slip from a misreading that happens to involve a capital.  `resolve`
does that check before ever labelling a citation `latin`.

    python3 -m bonitz_pipeline.latin_fix           # dry run
    python3 -m bonitz_pipeline.latin_fix --apply
"""

from __future__ import annotations
import argparse
import bisect
import json
import sys
from pathlib import Path

from bonitz_pipeline.numeral_fix import already_ruled
from bonitz_pipeline.siglum_check import (CITE, HOMOGLYPH, Cite, inventory,
                                          resolve)

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / 'work/rulings/john.json'
DEFAULT_DIR = ROOT / 'work/reconciled'
DATE = '2026-08-10'


def read_dir(dir: Path | str | None = None) -> list[Cite]:
    """Citations under `dir` (default work/reconciled), stream-wise like
    `siglum_check.read` — kept here so `--dir` can point at reconciled-auto
    without rewiring the checker."""
    base = Path(dir) if dir is not None else DEFAULT_DIR
    if not base.is_absolute():
        base = ROOT / base
    out = []
    for f in sorted(base.glob('*.txt')):
        text = f.read_text(encoding='utf-8')
        starts, pos = [], 0
        for line in text.splitlines(keepends=True):
            starts.append(pos)
            pos += len(line)
        for m in CITE.finditer(text):
            tok, chap, page, col = m.groups()
            ln = bisect.bisect_right(starts, m.start())
            out.append(Cite(f.stem, ln, ' '.join(m.group(0).split()), tok,
                            chap, int(page), col,
                            at=m.start() - starts[ln - 1]))
    return out


def find(dir: Path | str | None = None) -> list[tuple]:
    """Every citation `resolve` labelled `latin`, with its Greek reading."""
    cites = read_dir(dir)
    resolve(cites, inventory())
    out = []
    for c in cites:
        if c.how != 'latin':
            continue
        greek = ''.join(HOMOGLYPH.get(ch, ch) for ch in c.token)
        out.append((c, greek))
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--dir', type=Path, default=DEFAULT_DIR,
                    help='column text directory (default: work/reconciled)')
    a = ap.parse_args(argv)

    target = a.dir if a.dir.is_absolute() else ROOT / a.dir
    hits = find(target)
    # ⚠ SITE-BASED GUARD — same as numeral_fix. A ruling on page-060-R:1
    # blocks the rewrite whether the text lives under reconciled or
    # reconciled-auto.
    ruled = already_ruled()
    clash = [(c, g) for c, g in hits if (c.col, c.line) in ruled]
    hits = [(c, g) for c, g in hits if (c.col, c.line) not in ruled]

    for c, greek in hits:
        bad = [ch for ch in c.token if ch in HOMOGLYPH]
        print(f'  {c.col}:{c.line:<4} {c.token!r} -> {greek!r}   '
              f'Latin {"".join(bad)} · page {c.page} is in {c.work}')
    if clash:
        print(f'\n⚠ {len(clash)} skipped — John has ruled them:')
        for c, _ in clash:
            print(f'    {c.col}:{c.line} {c.raw!r}')
    if not a.apply:
        print(f'\ndry run — {len(hits)} would change. Pass --apply.')
        return 0

    changed = 0
    for c, greek in hits:
        p = target / f'{c.col}.txt'
        lines = p.read_text(encoding='utf-8').splitlines(keepends=True)
        i = c.line - 1
        # Anchored at the offset the regex matched, so a token that repeats on
        # its line cannot be hit in the wrong place.
        seg = lines[i][c.at:c.at + len(c.token)]
        if seg != c.token:
            raise SystemExit(f'{c.col}:{c.line}: expected {c.token!r} at '
                             f'{c.at}, found {seg!r}')
        lines[i] = lines[i][:c.at] + greek + lines[i][c.at + len(c.token):]
        p.write_text(''.join(lines), encoding='utf-8')
        changed += 1

    led = json.loads(LEDGER.read_text(encoding='utf-8'))
    k = 'rulings' if 'rulings' in led else [x for x in led if x != '_'][0]
    seen = {r['id'] for r in led[k]}
    for c, greek in hits:
        rid = f'{c.col}:{c.line}:{greek}{c.chapter or ""}. {c.page}{c.column}'
        if rid in seen:
            continue
        led[k].append({
            'id': rid, 'kind': 'text', 'col': c.col, 'line': c.line,
            'form': greek, 'ruled': 'latin-homoglyph/applied', 'quote': '',
            'note': (f'{c.token!r} was written with LATIN letters where the '
                     f'siglum is Greek. One printed sort, two codepoints; the '
                     f'choice was always ours. {c.page} is inside {c.work}, '
                     f'which is what makes this an encoding slip rather than a '
                     f'misreading.'),
            'source': 'bonitz_pipeline.latin_fix',
            'date': DATE, 'applied': True,
        })
    LEDGER.write_text(json.dumps(led, ensure_ascii=False, indent=1) + '\n',
                      encoding='utf-8')
    print(f'\n{changed} corrected and pinned.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
