"""Final sigma in a book-numeral slot is not a reading. It is a wrong codepoint.

John, 2026-08-10: *"if the position decides it, and we don't have any books
indicated by sigma, then there's the solution."*

A book number is a Greek alphabetic NUMERAL.  Stigma is 6; final sigma has no
numeric value at all, so it cannot stand in that slot in any citation Bonitz
ever set.  The two are the same shape in this type — the whole reason a reader
typed the wrong one — but the ambiguity is in the GLYPH, not in the text: the
position admits exactly one reading, and no amount of looking at the scan adds
anything to that.

⚠ THIS IS NOT A BREACH OF THE DIPLOMATIC RULE, and the distinction matters.
The rule says preserve what Bonitz PRINTED.  He printed one sigma-shaped sort;
which Unicode codepoint represents it is our decision and was never his.  This
is the same argument that settled the 63 Latin-capital sigla on 2026-08-08 —
identical ink, two codepoints, one of them meaningful — and it moves toward the
ink rather than away from it.  A correction that moved AWAY would be the worst
outcome available here; this is not one.

The corpus already agrees with itself: `πκϛ` x13, `πιϛ`, `πϛ`, `κϛ` x2 all
carry stigma, against three sites that carry final sigma.  Same shape, same
book, three readers who could not tell.

    python3 -m bonitz_pipeline.numeral_fix           # dry run
    python3 -m bonitz_pipeline.numeral_fix --apply
"""

from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / 'work/rulings/john.json'
DATE = '2026-08-10'

# A siglum, then a run of numeral letters ending in the sigma that should be a
# stigma, then the chapter and the Bekker page that prove it is a citation and
# not a Greek word.  The trailing page is what keeps this off `πρός` and every
# other word in the book that ends in final sigma.
# ⚠ THE GUARD MUST COVER ACCENTED LETTERS AND COMBINING MARKS. Written fresh as
# `(?<![Α-Ωα-ωἀ-ῼ])` this matched inside `πολλάκις` — the ά is U+03AC, below the
# Greek Extended block and outside α-ω, so it blocked nothing — and the dry run
# proposed turning the word into `πολλάκιϛ`. This is the SAME defect fixed in
# siglum_check.CITE hours earlier and reintroduced by writing a new pattern
# instead of reusing the one that had already been corrected.
SLOT = re.compile(r'(?<![̀-ͯͰ-Ͽἀ-῿ȣ])'
                  r'([Α-Ωα-ω]{1,3})(ς)'
                  r'(\s?\d{1,3}\s*\.\s*\d{2,4}\s?[ab])')


def find() -> list[tuple[str, int, str, str]]:
    out = []
    for f in sorted((ROOT / 'work/reconciled').glob('*.txt')):
        for n, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
            for m in SLOT.finditer(line):
                out.append((f.stem, n, m.group(0),
                            m.group(1) + 'ϛ' + m.group(3)))
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--apply', action='store_true')
    a = p.parse_args(argv)

    hits = find()
    for col, line, was, now in hits:
        print(f'  {col}:{line:<4} {was!r} -> {now!r}')
    if not a.apply:
        print(f'\ndry run — {len(hits)} would change. Pass --apply.')
        return 0

    for col, line, was, now in hits:
        p_ = ROOT / f'work/reconciled/{col}.txt'
        lines = p_.read_text(encoding='utf-8').splitlines(keepends=True)
        if lines[line - 1].count(was) != 1:
            raise SystemExit(f'{col}:{line}: {was!r} is not unique on its line')
        lines[line - 1] = lines[line - 1].replace(was, now, 1)
        p_.write_text(''.join(lines), encoding='utf-8')

    led = json.loads(LEDGER.read_text(encoding='utf-8'))
    key = 'rulings' if 'rulings' in led else [k for k in led if k != '_'][0]
    seen = {r['id'] for r in led[key]}
    for col, line, was, now in hits:
        rid = f'{col}:{line}:{now}'
        if rid in seen:
            continue
        led[key].append({
            'id': rid, 'kind': 'text', 'col': col, 'line': line,
            'form': now, 'ruled': 'numeral-slot/applied', 'quote': '',
            'note': ('final sigma has no numeric value; a book number is a '
                     'numeral, so only stigma (6) can stand in this slot. The '
                     'two sorts are the same shape in this type — the ambiguity '
                     'is in the glyph, not in the text, and the codepoint was '
                     'always our choice rather than Bonitz\'s.'),
            'source': 'bonitz_pipeline.numeral_fix',
            'date': DATE, 'applied': True,
        })
    LEDGER.write_text(json.dumps(led, ensure_ascii=False, indent=1) + '\n',
                      encoding='utf-8')
    print(f'\n{len(hits)} corrected and pinned.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
