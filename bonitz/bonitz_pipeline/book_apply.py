"""John's 27 book-level rulings, carried into the corpus.

Three destinations, one per verdict, exactly as the diplomatic rule divides them:

    fix-letter / fix-page  ->  work/reconciled is edited        (b) ours to correct
    preserve               ->  work/corrigenda/entries.json     (a) Bonitz's error
    all 27                 ->  work/rulings/john.json           pinned either way

The ledger entry matters as much as the edit.  A ruling that is applied but not
pinned can be silently undone by a later pass, which is how two of John's
rulings were overwritten on 2026-08-08 and had to be reverted.

    python3 -m bonitz_pipeline.book_apply             # dry run, writes nothing
    python3 -m bonitz_pipeline.book_apply --apply

⚠ `form` IN THE LEDGER IS WHAT MUST BE IN THE TEXT, not what was there before.
I had it the other way round once and `john_rulings --check` reported every one
of them as violated.  After a fix it is the corrected reading; after a preserve
it is what Bonitz printed, because that is what stays on the page.

⚠ A CITATION CAN WRAP.  `Ζιθ7.` ends 029-L:20 and `532 a3.` opens 021, so the
whole citation is not a substring of any one line and an edit keyed to it would
silently match nothing.  Everything here is keyed to the part that IS on the
ruled line, and the edit is verified to have changed exactly one occurrence.
"""

from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

from bonitz_pipeline.book_review import RULINGS, findings

ROOT = Path(__file__).resolve().parent.parent
CORRIGENDA = ROOT / 'work/corrigenda/entries.json'
LEDGER = ROOT / 'work/rulings/john.json'
DATE = '2026-08-09'
RULE = 'book_spans: the book letter excludes the Bekker page'


def anchor(line: str, f) -> str | None:
    """The largest part of the citation that is actually on the ruled line.

    Preferring the longest match keeps the anchor distinctive; falling back to
    the token alone is what makes a wrapped citation editable at all.
    """
    for pat in (re.escape(f.token) + r'\s?\d{1,3}\s*\.\s*' + str(f.page),
                re.escape(f.token) + r'\s?\d{1,3}\s*\.',
                re.escape(f.token)):
        m = re.search(pat, line)
        if m:
            return m.group(0)
    return None


def repair(printed: str, f, verdict: str, detail: str) -> str:
    """What the anchor becomes: the letter swapped, or the page digits."""
    if verdict == 'fix-letter':
        # Only the BOOK letter moves. The work stem is not in question — the
        # page put the citation inside that work, which is why it is here.
        return printed.replace(f.token, f.stem + detail, 1)
    if verdict == 'fix-page':
        return printed.replace(str(f.page), str(detail), 1)
    return printed


def plan() -> list[dict]:
    rulings = json.loads(RULINGS.read_text(encoding='utf-8'))
    sites = {f.sid: f for f in findings()}
    unknown = sorted(set(rulings) - set(sites))
    if unknown:
        raise SystemExit(f'rulings with no site: {unknown}')
    out = []
    for sid, v in sorted(rulings.items()):
        f = sites[sid]
        lines = (ROOT / f'work/reconciled/{f.col}.txt').read_text(
            encoding='utf-8').splitlines()
        line = lines[f.line - 1]
        printed = anchor(line, f)
        if printed is None:
            raise SystemExit(f'{sid}: the citation is not on line {f.line}')
        out.append({'sid': sid, 'f': f, 'verdict': v['verdict'],
                    'detail': v.get('detail', ''), 'line': line,
                    'printed': printed,
                    'becomes': repair(printed, f, v['verdict'],
                                      v.get('detail', ''))})
    return out


def apply(steps: list[dict]) -> tuple[int, int]:
    edits = 0
    for s in steps:
        if s['verdict'] == 'preserve':
            continue
        p = ROOT / f"work/reconciled/{s['f'].col}.txt"
        lines = p.read_text(encoding='utf-8').splitlines(keepends=True)
        i = s['f'].line - 1
        if lines[i].count(s['printed']) != 1:
            raise SystemExit(f"{s['sid']}: {s['printed']!r} occurs "
                             f"{lines[i].count(s['printed'])} times on its line")
        lines[i] = lines[i].replace(s['printed'], s['becomes'], 1)
        p.write_text(''.join(lines), encoding='utf-8')
        edits += 1

    # ---- Bonitz's own errors, banked for the revised edition
    doc = json.loads(CORRIGENDA.read_text(encoding='utf-8'))
    have = {(e['page'], e['col'], e['line'], e['printed']) for e in doc['entries']}
    added = 0
    for s in steps:
        if s['verdict'] != 'preserve':
            continue
        f = s['f']
        page, col = int(f.col.split('-')[1]), f.col.split('-')[2]
        key = (page, col, f.line, s['printed'])
        if key in have:
            continue
        doc['entries'].append({
            'page': page, 'col': col, 'line': f.line,
            'printed': s['printed'],
            'correct': repair(s['printed'], f, 'fix-letter', f.owner),
            'rule': RULE,
            'authority': (
                f'{f.stem}{f.book} is book {f.book!r} of that work, which Bekker '
                f'sets at {f.lo}-{f.hi}; the page printed beside it is {f.page}, '
                f'which falls in book {f.owner!r}. The page is taken as the sound '
                f'member because it is what a reader navigates by and what every '
                f'later edition keys to, so the correction moves the letter. That '
                f'is the revised edition\'s call and not a transcription decision '
                f'— nothing here changes work/reconciled.'),
            'checked': f'400dpi {DATE}',
            'note': (f'John ruled against the 400 dpi crop on {DATE}: the ink '
                     f'reads {s["printed"]!r} as printed. Book spans are derived '
                     f'from build/dist, not transcribed from Bonitz.'),
        })
        added += 1
    CORRIGENDA.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
                          encoding='utf-8')

    # ---- and every one of them pinned, fixed or preserved alike
    led = json.loads(LEDGER.read_text(encoding='utf-8'))
    key = 'rulings' if 'rulings' in led else [k for k in led if k != '_'][0]
    seen = {r['id'] for r in led[key]}
    for s in steps:
        f, rid = s['f'], f"{s['f'].col}:{s['f'].line}:{s['becomes']}"
        if rid in seen:
            continue
        led[key].append({
            'id': rid, 'kind': 'text', 'col': f.col, 'line': f.line,
            # what must be IN work/reconciled — the corrected reading after a
            # fix, and what Bonitz printed after a preserve
            'form': s['becomes'],
            'ruled': ('book-letter/applied' if s['verdict'] == 'fix-letter' else
                      'bekker-page/applied' if s['verdict'] == 'fix-page' else
                      'preserve/corrigenda'),
            'quote': '', 'note': f'{RULE}; {f.stem}{f.book} is {f.lo}-{f.hi}, '
                                 f'page {f.page} is in book {f.owner!r}',
            'source': 'work/sweeps/book-rulings.json',
            'date': DATE, 'applied': True,
        })
    LEDGER.write_text(json.dumps(led, ensure_ascii=False, indent=1) + '\n',
                      encoding='utf-8')
    return edits, added


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--apply', action='store_true')
    a = p.parse_args(argv)
    steps = plan()
    for s in sorted(steps, key=lambda s: s['verdict']):
        if s['verdict'] == 'preserve':
            print(f"  keep    {s['sid']:<28} {s['printed']!r} stands")
        else:
            print(f"  {s['verdict'][4:]:<7} {s['sid']:<28} "
                  f"{s['printed']!r} -> {s['becomes']!r}")
    n = sum(s['verdict'] != 'preserve' for s in steps)
    if not a.apply:
        print(f'\ndry run — {n} edits and {len(steps) - n} corrigenda would be '
              f'written. Pass --apply.')
        return 0
    edits, added = apply(steps)
    print(f'\n{edits} lines edited, {added} corrigenda recorded, '
          f'{len(steps)} rulings pinned.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
