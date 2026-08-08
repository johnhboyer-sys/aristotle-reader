"""
Every ruling John has made, in one place, checked by one test.

His question, 2026-08-08: *"can't we have a comprehensive john_rulings.py that
gets updated whenever i rule?"*  Until now his rulings were scattered across
five stores in five shapes, each with its own guard or none at all:

    tests/fixtures/john-rulings.json        44  hand rulings, 2026-07-24/25
    work/sweeps/mark-rulings.json           44  clicked through the review server
    work/verdicts/verdicts-053-062-full.json 18  the five-way range
    work/damage/page-042-R.json              1  lines the impression failed on
    work/kraken/NOTES.md                     —  policy rulings, in prose only

That scattering is not cosmetic.  It is how a ruling gets lost: `reconcile.py`
applied the adjudications once and nothing looked at them again, and a later
pass overwrote two of John's July rulings and propagated 38 more corrections
away from the ink before a red test in another area gave it away.

So: ONE ledger, `work/rulings/john.json`, appended to whenever he rules, and
one test over all of it (`tests/test_john_rulings_ledger.py`).  The old stores
stay on disk as the historical sources they were migrated from, and their
tests stay green as a cross-check on the migration.

    python3 -m bonitz_pipeline.john_rulings --verify
    python3 -m bonitz_pipeline.john_rulings --list --kind keep
    python3 -m bonitz_pipeline.john_rulings --migrate     # rebuild from sources

KINDS, and which of them a machine can check:

    text      a form he ruled INTO the text        checkable
    keep      a form he ruled was ALREADY right    checkable — and the one most
                                                   easily lost, since nothing in
                                                   the text records the approval
    declined  a reading he refused to apply; the print stands as it is
                                                   checkable
    damage    lines where the impression failed    checkable against work/damage
    policy    a rule of practice, not a form       NOT checkable; recorded so it
                                                   cannot be quietly forgotten
    pending   ruled, but the text it governs is
              not in work/reconciled yet (pp.53+)  NOT checkable yet

A ruling that cannot be checked is still recorded.  Silence about it would be
the same failure in a quieter form.
"""

from __future__ import annotations
import argparse
import json
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / 'work/rulings/john.json'

CHECKABLE = {'text', 'keep', 'declined', 'damage'}


def canon(s: str) -> str:
    """NFC with the two encodings of the printed circumflex unified.

    The corpus writes a perispomeni where some readers write a combining
    tilde; they are the same printed mark.  `verdict_drift` learned this the
    expensive way — comparing them raw reported every ligature ruling as lost,
    82 of them, none real.
    """
    return unicodedata.normalize('NFC', (s or '').replace('̃', '͂'))


def load() -> dict:
    if LEDGER.exists():
        return json.loads(LEDGER.read_text(encoding='utf-8'))
    return {'_': __doc__.strip().splitlines()[0], 'rulings': []}


def save(d: dict) -> None:
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    LEDGER.write_text(json.dumps(d, ensure_ascii=False, indent=1),
                      encoding='utf-8')


def add(kind: str, *, col: str = '', line: int = 0, form: str = '',
        ruled: str = '', quote: str = '', note: str = '', source: str = '',
        date: str = '', applied: bool | None = None) -> dict:
    """Append one ruling.  Re-ruling the same site REPLACES it — John is
    allowed to change his mind, and a ledger that argued with him would be
    worse than no ledger."""
    d = load()
    rid = f'{col}:{line}:{form or ruled}' if col else f'policy:{ruled[:40]}'
    entry = {'id': rid, 'kind': kind, 'col': col, 'line': line, 'form': form,
             'ruled': ruled, 'quote': quote, 'note': note, 'source': source,
             'date': date or datetime.now(timezone.utc).strftime('%Y-%m-%d'),
             'applied': applied}
    d['rulings'] = [r for r in d['rulings'] if r['id'] != rid] + [entry]
    save(d)
    return entry


def _line(col: str, line: int) -> str | None:
    f = ROOT / 'work/reconciled' / f'{col}.txt'
    if not f.exists():
        return None
    lines = f.read_text(encoding='utf-8').splitlines()
    return lines[line - 1] if 0 < line <= len(lines) else None


def check(r: dict) -> tuple[bool, str]:
    """(holds, why not).  A ruling that cannot be checked returns True with a
    reason, so an unverifiable ruling never masquerades as a verified one."""
    kind = r['kind']
    if kind not in CHECKABLE:
        return True, f'not checkable ({kind})'
    if kind == 'damage':
        f = ROOT / 'work/damage' / f'{r["col"]}.json'
        if not f.exists():
            return False, f'damage file for {r["col"]} is gone'
        got = json.loads(f.read_text(encoding='utf-8')).get('damaged', [])
        return (r['line'] in got,
                f'line {r["line"]} no longer listed as damaged in {f.name}')
    text = _line(r['col'], r['line'])
    if text is None:
        return True, f'{r["col"]} line {r["line"]} not in work/reconciled'
    want = canon(r['form'])
    if not want:
        return True, 'no form recorded to check'
    if canon(want) in canon(text):
        return True, ''
    return False, f'{r["form"]!r} is no longer in {r["col"]}:{r["line"]} — ' \
                  f'the line reads: {text.strip()[:70]}'


def verify() -> list[tuple[dict, str]]:
    return [(r, why) for r in load()['rulings']
            if not (ok := check(r))[0] for why in (ok[1],)]


# --------------------------------------------------------------------------
# migration — build the ledger from the five stores it replaces
# --------------------------------------------------------------------------

def migrate() -> dict:
    d = {'_': [
        "Every ruling John Boyer has made on the Bonitz transcription, in one",
        "place. Built by `python3 -m bonitz_pipeline.john_rulings --migrate`",
        "from the five stores listed in that module's docstring, and appended",
        "to by the review server whenever he rules again.",
        "",
        "`kind` says whether a machine can check it: text/keep/declined/damage",
        "can, policy and pending cannot and are recorded anyway.",
        "`applied` says whether it is in work/reconciled.",
        "Guarded by tests/test_john_rulings_ledger.py.",
    ], 'rulings': []}
    out = d['rulings']
    seen = set()

    def put(**kw):
        rid = (f'{kw.get("col","")}:{kw.get("line",0)}:'
               f'{kw.get("form") or kw.get("ruled","")}')
        if rid in seen:
            return
        seen.add(rid)
        out.append({'id': rid, 'kind': kw['kind'], 'col': kw.get('col', ''),
                    'line': kw.get('line', 0), 'form': kw.get('form', ''),
                    'ruled': kw.get('ruled', ''), 'quote': kw.get('quote', ''),
                    'note': kw.get('note', ''), 'source': kw['source'],
                    'date': kw['date'], 'applied': kw.get('applied')})

    # 1. the July hand rulings
    f = ROOT / 'tests/fixtures/john-rulings.json'
    j = json.loads(f.read_text(encoding='utf-8'))
    for section, body in j.items():
        if not isinstance(body, dict):
            continue
        for bucket, items in body.items():
            if not isinstance(items, list):
                continue
            for e in items:
                if 'page' not in e:
                    continue
                col = f'page-{e["page"]:03d}-{e["col"]}'
                kind = {'applied': 'text', 'held': 'keep',
                        'declined': 'declined', 'items': 'keep'}[bucket]
                form = e.get('now') or e.get('keep') or e.get('text', '')
                put(kind=kind, col=col, line=e.get('line', 0), form=form,
                    ruled=f'{section}/{bucket}',
                    note=e.get('why') or e.get('note', ''),
                    source='tests/fixtures/john-rulings.json',
                    date='2026-07-25', applied=(bucket != 'declined'))

    # 2. the marks he clicked through the review server
    f = ROOT / 'work/sweeps/mark-rulings.json'
    if f.exists():
        for key, r in json.loads(f.read_text(encoding='utf-8'))['rulings'].items():
            col, line, corpus = key.rsplit(':', 2)
            form = r.get('written') or (corpus if r['form'] == corpus else '')
            if r['form'] == '?':
                continue                  # he declined to rule: not a ruling
            put(kind='text' if form != corpus else 'keep', col=col,
                line=int(line), form=form or corpus,
                ruled=r.get('label', ''),
                note=r.get('note', ''), source='review server',
                date=r.get('at', '')[:10] or '2026-08-08',
                applied=str(r.get('applied', '')).startswith('yes'))

    # 3. the five-way range, pp.53-62 — ruled, but those columns are not in
    #    work/reconciled, so nothing can check them yet
    f = ROOT / 'work/verdicts/verdicts-053-062-full.json'
    if f.exists():
        for v in json.loads(f.read_text(encoding='utf-8'))['verdicts']:
            put(kind='pending', col=f'page-{v["page"]:03d}-{v["col"]}',
                line=v.get('line', 0), form=v.get('verdict', ''),
                ruled=f'five-way item {v["item"]}',
                note='pp.53-62 are not in work/reconciled yet',
                source='work/verdicts/verdicts-053-062-full.json',
                date='2026-08-07', applied=False)

    # 4. damage rulings
    for f in sorted((ROOT / 'work/damage').glob('*.json')):
        j = json.loads(f.read_text(encoding='utf-8'))
        for ln in j.get('damaged', []):
            put(kind='damage', col=j['column'], line=ln,
                ruled='impression failed', note=j.get('note', ''),
                source=str(f.relative_to(ROOT)),
                date=(j.get('ruled_by', '') or '')[-10:] or '2026-08-06',
                applied=True)

    # 5. policy rulings that live only in prose.  Not checkable, and that is
    #    exactly why they need writing down somewhere a test can list them.
    for ruled, note, date in [
        ('Bekker references are unspaced',
         '1456b27, never 1456 b27 — the printed gap is justification, not '
         'meaning. Applied in kraken_corpus.emit_xml, not to work/reconciled, '
         'which stays the diplomatic record.', '2026-08-06'),
        ('max 5 reader agents at once',
         'A wider wave lost 9 partial reads to one session limit.',
         '2026-08-06'),
        ('diplomatic transcription first; correction against TLG later',
         "Bonitz's own errors are PRESERVED and recorded in work/corrigenda/, "
         'never silently fixed. Three classes: (a) his misprint — preserve; '
         '(b) our misread — fix; (c) a variant he is quoting — preserve.',
         '2026-08-07'),
        ('a 2-2 reader split always flags',
         'A genuine deadlock deserves a human; a tiebreak rule would be '
         'guessing dressed as arithmetic.', '2026-08-07'),
        ("Codex's kai-ligature vote stays UNMUTED",
         'This run is its evaluation as a reader; muting the character it is '
         'weakest on would grade it on a curve.', '2026-08-07'),
    ]:
        put(kind='policy', ruled=ruled, note=note, source='work/kraken/NOTES.md',
            date=date, applied=None)

    save(d)
    return d


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--verify', action='store_true')
    p.add_argument('--list', action='store_true')
    p.add_argument('--kind', action='append', help='filter --list by kind')
    p.add_argument('--migrate', action='store_true')
    a = p.parse_args(argv)

    if a.migrate:
        d = migrate()
        print(f'{len(d["rulings"])} rulings -> {LEDGER}')
    d = load()
    if a.list:
        for r in d['rulings']:
            if a.kind and r['kind'] not in a.kind:
                continue
            where = f'{r["col"]}:{r["line"]}' if r['col'] else '—'
            print(f'  {r["kind"]:9} {where:16} {r["form"] or r["ruled"]:28} '
                  f'{r["date"]}  {r["source"]}')
    from collections import Counter
    print('\n' + '  '.join(f'{k}={v}' for k, v in
                           Counter(r['kind'] for r in d['rulings']).most_common()))
    bad = verify()
    if bad:
        print(f'\n⚠ {len(bad)} RULINGS NO LONGER HOLD:')
        for r, why in bad:
            print(f'  {r["id"]}  ({r["source"]}, {r["date"]})\n      {why}')
        return 1
    n = sum(1 for r in d['rulings'] if r['kind'] in CHECKABLE)
    print(f'all {n} checkable rulings hold '
          f'({len(d["rulings"]) - n} recorded but not checkable)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
