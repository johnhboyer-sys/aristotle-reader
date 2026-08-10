"""John's work-level rulings, carried into the corpus.

Five verdicts, five destinations:

    fix-siglum             work/reconciled is edited        (b) ours to correct
    fix-page               work/reconciled is edited        (b)
    fix-siglum-and-record  BOTH — edited, AND recorded      (a) and (b) at once
    preserve               work/corrigenda/entries.json     (a) Bonitz's error
    confirm-rule           already applied; pinned only
    not-an-error           nothing at all

⚠ `not-an-error` IS NOT `preserve`, and the difference is the whole point.
`preserve` says Bonitz set it wrong and the reading stands as printed;
`not-an-error` says the citation was always correct and OUR CHECKER was wrong.
Banking the second as a corrigendum would put a false claim about the edition
into the register a revised edition is built from — `Α4. 985a21` is ordinary
inheritance of a named Metaphysics book and there is nothing to record about it.

    python3 -m bonitz_pipeline.siglum_apply            # dry run
    python3 -m bonitz_pipeline.siglum_apply --apply
"""

from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

from bonitz_pipeline.book_spans import OUT as SPANS
from bonitz_pipeline.siglum_check import CITE, inventory, read, resolve

ROOT = Path(__file__).resolve().parent.parent
RULINGS = ROOT / 'work/sweeps/siglum-rulings.json'
CORRIGENDA = ROOT / 'work/corrigenda/entries.json'
LEDGER = ROOT / 'work/rulings/john.json'
DATE = '2026-08-10'
RULE = 'siglum_check: the siglum disagrees with the Bekker page beside it'


def plan() -> list[dict]:
    """Every ruling, matched to the citation it was made on.

    ⚠ MATCHED BY PLACE AND TOKEN, NOT BY SITE ID. An id carries the token, so
    correcting the text changes it — which orphaned three confirmations earlier
    today and made their cards reappear forever.
    """
    ruled = json.loads(RULINGS.read_text(encoding='utf-8'))
    cites = read()
    resolve(cites, inventory())
    at = {(c.col, c.line, c.token, c.page): c for c in cites}
    out = []
    for sid, v in sorted(ruled.items()):
        col, line, tok, page = sid.split(':')
        c = at.get((col, int(line), tok, int(page)))
        step = {'sid': sid, 'verdict': v['verdict'], 'detail': v.get('detail', ''),
                'col': col, 'line': int(line), 'token': tok, 'page': int(page),
                'cite': c, 'superseded': v.get('superseded', '')}
        if c is not None:
            lines = (ROOT / f'work/reconciled/{col}.txt').read_text(
                encoding='utf-8').splitlines()
            text = lines[int(line) - 1]
            # ⚠ THE EXACT SPAN THE REGEX MATCHED, re-derived at the offset.
            # `c.raw` is whitespace-normalised for display, so slicing by its
            # length over-captured — `Πο4. 1290 b5. —` and `Ηε10. 1835 b12-1`
            # picked up an em-dash and half the next number, which would have
            # gone into the corrigenda register as what Bonitz "printed".
            # ⚠ AND A CITATION MAY WRAP, so the match has to be tried against
            # the line PLUS the next one — `Ζι` ends 048-R:39 and `37. 621 a12`
            # opens 040. Matching the single line failed, and the `continue`
            # below DISCARDED the ruling in silence: two of John's thirteen
            # edits simply stopped existing between one dry run and the next.
            # A dropped ruling is worse than a wrong one, because nothing
            # reports it.
            nxt = lines[int(line)] if int(line) < len(lines) else ''
            m = CITE.match(text + '\n' + nxt, c.at)
            if m is None:
                step['problem'] = 'the citation could not be re-matched'
            else:
                # Only the part ON THIS LINE may be edited here; the rest of a
                # wrapped citation lives on the next and is not ours to touch.
                step['printed'] = m.group(0).split('\n')[0].rstrip()
                step['at'] = c.at
        out.append(step)
    return out


def repair(step: dict) -> str | None:
    """What the citation becomes, or None where nothing is edited."""
    v, d = step['verdict'], step['detail']
    if v in ('preserve', 'confirm-rule', 'not-an-error'):
        return None
    p = step.get('printed')
    if p is None:
        return None
    if v == 'fix-page':
        # ⚠ ANCHOR ON THE PAGE GROUP, NOT ON A DIGIT RUN. `(?!.*\d)` assumed the
        # page was the last number in the string; in `σ9. 73 a12` the LINE
        # number follows it, so nothing matched and the edit was a silent no-op
        # — it printed as a change and would have written the file unchanged.
        m = CITE.match(p)
        if not m:
            return None
        a, b = m.span(3)
        return p[:a] + str(d) + p[b:]
    return p.replace(step['token'], d, 1)      # fix-siglum, and the compound


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--apply', action='store_true')
    a = ap.parse_args(argv)

    steps = plan()
    edits = [s for s in steps if repair(s) is not None]
    keeps = [s for s in steps if s['verdict'] == 'preserve']
    other = [s for s in steps if s not in edits and s not in keeps]

    for s in edits:
        print(f"  edit    {s['col']}:{s['line']:<4} {s.get('printed','?')!r} -> "
              f"{repair(s)!r}")
    for s in keeps:
        print(f"  keep    {s['col']}:{s['line']:<4} {s.get('printed','?')!r} "
              f"stands · corrigenda")
    for s in other:
        print(f"  {s['verdict']:<13} {s['col']}:{s['line']:<4} nothing to write")
    missing = [s['sid'] for s in steps if s['cite'] is None]
    broken = [s['sid'] for s in steps if s.get('problem')]
    if missing:
        print(f"\n⚠ {len(missing)} rulings match no citation (already applied "
              f"by rule): {missing}")
    if broken:
        raise SystemExit(f"\n⚠ {len(broken)} rulings could not be placed in the "
                         f"text: {broken}\nNothing is written until every "
                         f"ruling can be accounted for.")

    if not a.apply:
        print(f'\ndry run — {len(edits)} edits, {len(keeps)} corrigenda. '
              f'Pass --apply.')
        return 0

    for s in edits:
        p = ROOT / f"work/reconciled/{s['col']}.txt"
        lines = p.read_text(encoding='utf-8').splitlines(keepends=True)
        i, was, now = s['line'] - 1, s['printed'], repair(s)
        # Anchored at the recorded offset, so a repeated token cannot be hit.
        seg = lines[i][s['at']:s['at'] + len(was)]
        if seg != was:
            raise SystemExit(f"{s['sid']}: expected {was!r} at {s['at']}, "
                             f"found {seg!r}")
        lines[i] = lines[i][:s['at']] + now + lines[i][s['at'] + len(was):]
        p.write_text(''.join(lines), encoding='utf-8')

    spans = json.loads(SPANS.read_text(encoding='utf-8'))['spans']
    doc = json.loads(CORRIGENDA.read_text(encoding='utf-8'))
    have = {(e['page'], e['col'], e['line'], e['printed']) for e in doc['entries']}
    added = 0
    for s in keeps:
        page, col = int(s['col'].split('-')[1]), s['col'].split('-')[2]
        key = (page, col, s['line'], s.get('printed', ''))
        if key in have or 'printed' not in s:
            continue
        doc['entries'].append({
            'page': page, 'col': col, 'line': s['line'],
            'printed': s['printed'],
            'correct': '(unsettled — see authority)',
            'rule': RULE,
            'authority': (
                f"John ruled against the 400 dpi ink on {DATE}: the page really "
                f"does read {s['printed']!r}. {s['token']!r} disagrees with the "
                f"Bekker page {s['page']} beside it, so the citation cannot be "
                f"followed as printed. WHICH of the two Bonitz got wrong — the "
                f"siglum or the page — was not put to him and is not settled "
                f"here; the revised edition must decide it."),
            'checked': f'400dpi {DATE}',
            'note': 'work-level finding; the corpus is unchanged.',
        })
        added += 1
    CORRIGENDA.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
                          encoding='utf-8')

    led = json.loads(LEDGER.read_text(encoding='utf-8'))
    k = 'rulings' if 'rulings' in led else [x for x in led if x != '_'][0]
    seen = {r['id'] for r in led[k]}
    pinned = 0
    for s in steps:
        if s['verdict'] == 'not-an-error' or 'printed' not in s:
            continue
        form = repair(s) or s['printed']
        rid = f"{s['col']}:{s['line']}:{form}"
        if rid in seen:
            continue
        led[k].append({
            'id': rid, 'kind': 'text', 'col': s['col'], 'line': s['line'],
            'form': form, 'ruled': f"siglum/{s['verdict']}", 'quote': '',
            'note': RULE, 'source': 'work/sweeps/siglum-rulings.json',
            'date': DATE, 'applied': True,
        })
        pinned += 1
    LEDGER.write_text(json.dumps(led, ensure_ascii=False, indent=1) + '\n',
                      encoding='utf-8')
    print(f'\n{len(edits)} edits, {added} corrigenda, {pinned} pinned.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
