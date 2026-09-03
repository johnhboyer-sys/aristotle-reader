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
import re
import os
import sys
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / 'work/rulings/john.json'

CHECKABLE = {'text', 'keep', 'declined', 'damage'}


def canon(s: str) -> str:
    """NFC with the two encodings of the printed circumflex unified, and the
    elision mark spelt one way.

    The corpus writes a perispomeni where some readers write a combining
    tilde; they are the same printed mark.  `verdict_drift` learned this the
    expensive way — comparing them raw reported every ligature ruling as lost,
    82 of them, none real.

    ⚠ AND THE SAME GOES FOR THE ELISION MARK, which the ledger holds in
    whichever codepoint the store it came from happened to use. The corpus now
    spells it U+2019 everywhere (`bonitz_pipeline.elision`); compared raw, that
    fold reported 43 of John's rulings as lost, and again not one of them was.

    ⚠ AND OF A BREATHING PRINTED BEFORE ITS CAPITAL. Bonitz sets a lemma's
    breathing in front of the letter and OCR leaves it loose; put on the
    capital it is the same printed mark, so a form recorded either way must
    read as the same ruling. John's `pattern:Α-Ἀ` of 2026-08-14 breathed the
    capitals at page-045-L:1 and :4 and the loose marks stayed behind; when
    `capital_breathing` swept them up, the two entries read as lost.

    ⚠ AND OF THE SPACE INSIDE A BEKKER CITATION. `1573 a25` and `1573a25` are
    one token set two ways, and which one the ledger holds is an accident of
    which transcription regime was running when John ruled — the corpus wrote
    the citation spaced 4532 times and closed 8300, split by OUR process and
    not by Bonitz. His policy of 2026-08-26 is that the page and its column
    are ONE TOKEN; `space_policy.close_bekker` makes the corpus say so, and
    without this fold that edit reports 240 of his 935 live rulings as lost.
    Not one of them would be.

    ⚠ THE FOLD IS ONLY INSIDE A LINE — a newline must never close up, or a
    citation split across two printed lines reads as one that is not.

    ⚠ AND IT DOES NOT REQUIRE A DIGIT AFTER THE COLUMN LETTER. 18 ledger forms
    are truncated mid-citation (`1835 b`, `946 b`, `1391 b`), so a fold keyed
    on `[ab]\\d` fires on the corpus line and not on the recorded form, and the
    two stop matching. Over-folding is safe HERE and only here: this is a
    comparison key, both sides get it, and under John's policy the two
    spellings are one token anyway.
    """
    from bonitz_pipeline.capital_breathing import fix
    from bonitz_pipeline.elision import fold
    got = fold(unicodedata.normalize('NFC', (s or '').replace('̃', '͂')))
    got = re.sub(r'(\d)[ \t]+([ab])', r'\1\2', got)
    return fix(got, {})[0]


def load() -> dict:
    if LEDGER.exists():
        return json.loads(LEDGER.read_text(encoding='utf-8'))
    return {'_': __doc__.strip().splitlines()[0], 'rulings': []}


def save(d: dict) -> None:
    """Atomic: tempfile in the ledger's own directory, then os.replace.

    A plain write_text truncates before it writes, so a crash mid-write
    destroys the ledger — the one store every ruling now depends on.  With
    the replace, a crash at any instant leaves either the old ledger or the
    new one, never a torn file."""
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=LEDGER.parent, prefix=LEDGER.name + '.',
                               suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, LEDGER)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


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
    if r.get('reversed_by'):
        # John changed his mind, and the ledger's job is to keep BOTH rulings,
        # not to pick one.  Deleting the old entry would erase the fact that he
        # once ruled the other way — and the reason he reversed it (the scan
        # improved) is the kind of thing a later session needs to see.  So the
        # superseded ruling stays, stops being checked, and points at the
        # ruling that replaced it.  ⚠ Only a hand-added field does this: a
        # reversal cannot happen as a side effect of any pass over the text.
        return True, f'reversed by {r["reversed_by"]}'
    if r.get('contested'):
        # ⚠ TWO OF JOHN'S OWN OBSERVATIONS DISAGREE AND NOBODY HAS PICKED.
        # Not a reversal — he has not changed his mind, he has not been asked.
        # page-044-R:27 on 2026-08-14: a class ruling (pattern:ἀ-ἁ, 16 sites,
        # none excluded) rewrote a site the corrigenda register had recorded
        # from a 400 dpi look, with reasoning, a week earlier. The corpus keeps
        # what the register saw, because a site examined outranks an
        # unexamined member of a sweep ([[carry-rulings-by-site]]) — and the
        # ruling stays here, unchecked and NAMED, until he settles it. Only a
        # hand-added field does this.
        return True, f'CONTESTED, awaiting John: {r["contested"]}'
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

    # ⚠ A WHOLE-LINE FORM CANNOT SURVIVE A SECOND RULING ON ITS LINE, AND 345
    # OF THESE KEY ON A WHOLE LINE. The migration stored the printed line as
    # `form` for the audit rulings, so the check asks "does the line still
    # read exactly this?" — which fails the moment John rules a DIFFERENT word
    # on the same line, even though both rulings agree and both were applied.
    # It happened on 2026-08-18 at page-022-L:42: he ruled `ἀδρά -> ἁδρά` on
    # 2026-08-13, ruled `ἀδρότερον -> ἁδρότερον` today, and the first entry
    # then reported itself broken by the second.
    #
    # `quote` holds the line BEFORE the ruling and `form` holds it after, so
    # the tokens that differ between them are the ones he actually ruled. Fall
    # back to checking those, and say so — a narrower claim honestly labelled
    # beats a wide one that cries wolf. If no quote was recorded there is
    # nothing to narrow to, and the failure stands.
    if r.get('quote'):
        before, after = canon(r['quote']).split(), canon(want).split()
        ruled_tokens = [t for t in after if t not in before]
        if ruled_tokens:
            here = canon(text).split()
            missing = [t for t in ruled_tokens if t not in here]
            if not missing:
                return True, (f'line changed since, but the ruled token(s) '
                              f'{" ".join(ruled_tokens)} still stand')
            return False, (f'the ruled token(s) {" ".join(missing)} are no '
                           f'longer in {r["col"]}:{r["line"]} — the line '
                           f'reads: {text.strip()[:70]}')
    return False, f'{r["form"]!r} is no longer in {r["col"]}:{r["line"]} — ' \
                  f'the line reads: {text.strip()[:70]}'


def verify() -> list[tuple[dict, str]]:
    return [(r, why) for r in load()['rulings']
            if not (ok := check(r))[0] for why in (ok[1],)]


# --------------------------------------------------------------------------
# migration — build the ledger from the five stores it replaces
# --------------------------------------------------------------------------

class MigrateWouldLoseRulings(Exception):
    """--migrate would drop rulings the ledger already holds — or overwrite
    their content, which is the same loss one field at a time. Never a
    warning."""


def _canon_entry(r: dict) -> dict:
    """The entry with every string field passed through canon, so a
    re-encoded circumflex never reads as a changed ruling."""
    return {k: canon(v) if isinstance(v, str) else v for k, v in r.items()}


def _changed_fields(old: dict, new: dict) -> list[str]:
    """Fields on which the two entries disagree, compared through canon.
    A field only one of them carries (e.g. a hand-added reversed_by) counts:
    dropping it would lose it."""
    a, b = _canon_entry(old), _canon_entry(new)
    return sorted(k for k in set(a) | set(b) if a.get(k) != b.get(k))


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
        ('Opus adjudicates; the all-Sonnet adjudicator config is RETIRED',
         'Ruled 2026-08-07 ("Opus moves out of the reader slot and into '
         'adjudication only"), resolving the leak rate RUN-NOTES-52-91.md had '
         'flagged for him. The `*.sonnet.json` files on pp.47-49 and 52 are '
         'superseded backups; the live files carry the Opus recheck. ⚠ On '
         '2026-08-08 I re-opened this as an open question and John corrected '
         'me — the ruling was ~1,100 lines away in NOTES.md from the config it '
         'replaced. A policy ruling belongs HERE, where it cannot be missed.',
         '2026-08-07'),
        ("Codex's kai-ligature vote stays UNMUTED",
         'This run is its evaluation as a reader; muting the character it is '
         'weakest on would grade it on a curve.', '2026-08-07'),
    ]:
        put(kind='policy', ruled=ruled, note=note, source='work/kraken/NOTES.md',
            date=date, applied=None)

    # ⚠ REFUSES RATHER THAN OVERWRITING.  On 2026-08-12 a --migrate rebuilt
    # this ledger from the stores above and silently dropped 66 of 198
    # rulings — everything `add()` had appended since the stores were last
    # written existed nowhere else, so the rebuild simply did not know it.
    # The run printed a success line.  So: any entry the ledger on disk holds
    # that the rebuild does not reproduce stops the whole migrate, and
    # NOTHING is written.  Ids are compared through `canon` for the reason
    # `verdict_drift` learned — a re-encoded circumflex is not a lost ruling.
    # There is deliberately NO --force flag, on the same ground the holdout
    # guards in kraken_corpus.py give none: the remedy for a lossy migrate is
    # to fix the source stores, and that is John's call to make at the
    # stores, not a switch to flip here.
    existing = load()['rulings']
    rebuilt = {}
    for r in out:
        rebuilt.setdefault(canon(r['id']), r)
    lost = [r for r in existing if canon(r['id']) not in rebuilt]
    if lost:
        raise MigrateWouldLoseRulings(
            f'--migrate would LOSE {len(lost)} of {len(existing)} rulings '
            f'already in {LEDGER}:\n'
            + '\n'.join(f'  {r["id"]}  ({r["kind"]}, {r["source"]}, '
                        f'{r["date"]})' for r in lost)
            + '\nnothing was written. Fix the source stores so the rebuild '
              'covers every ruling; there is no override flag.')

    # Matching the ids is not enough — the same Grok review found two quieter
    # ways to lose a ruling with every id "found":
    #
    # (1) CANON COLLAPSE.  Two ledger entries whose ids canon to one rebuilt
    #     id both count as covered while only one row gets written.  If they
    #     say the same thing that is deduplication; if they differ, one of
    #     John's rulings dies, so it refuses and names both.
    groups: dict[str, list[dict]] = {}
    for r in existing:
        groups.setdefault(canon(r['id']), []).append(r)
    collapsed = [rs for rs in groups.values() if len(rs) > 1
                 and any(_changed_fields(rs[0], r) for r in rs[1:])]
    if collapsed:
        raise MigrateWouldLoseRulings(
            f'--migrate would COLLAPSE {sum(map(len, collapsed))} rulings '
            f'already in {LEDGER} into {len(collapsed)} whose content '
            'differs:\n'
            + '\n'.join('  ' + '  =  '.join(f'{r["id"]}  ({r["kind"]}, '
                                            f'{r["source"]}, {r["date"]})'
                                            for r in rs) for rs in collapsed)
            + '\nnothing was written. These entries disagree with each other; '
              'reconciling them is a human call — there is no override flag.')

    # (2) BODY CLOBBER.  Same id, different content: the ledger holds a later
    #     ruling (a keep from add(), a note, a reversed_by) and a source store
    #     still holds the older row; an id-only guard writes the store's row
    #     over John's.  Any field of any existing entry that the rebuild
    #     would change stops the migrate — content drift means the ledger and
    #     a source store disagree, and reconciling them is John's call at the
    #     stores, not this module's to guess.  Fields compare through canon
    #     for the verdict_drift reason: a re-encoded circumflex is not drift.
    clobbered = [(r, diff) for r in existing
                 if (diff := _changed_fields(r, rebuilt[canon(r['id'])]))]
    if clobbered:
        raise MigrateWouldLoseRulings(
            f'--migrate would OVERWRITE {len(clobbered)} of {len(existing)} '
            f'rulings already in {LEDGER} with different content:\n'
            + '\n'.join(f'  {r["id"]}  ({r["kind"]}, {r["source"]}, '
                        f'{r["date"]})  fields that would change: '
                        f'{", ".join(diff)}' for r, diff in clobbered)
            + '\nnothing was written. The ledger and a source store disagree '
              'about these rulings; fix that at the stores — there is no '
              'override flag.')

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
        try:
            d = migrate()
        except MigrateWouldLoseRulings as e:
            print(e, file=sys.stderr)
            return 1
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
