"""Cards written by hand, for a reading no engine ever proposed.

    python3 -m bonitz_pipeline.hand_cards            # check the file
    python3 -m bonitz_pipeline.hand_cards --none     # what still owes a card

⚠ `none` IS A DEAD END, AND THIRTY-NINE RULINGS SIT IN IT. John's rule 3 says
an "unsure" click is a defect in the tool; `none` is the same thing one step
on — he has looked at the ink, none of the offered readings is what it says,
and the queue has no way to hold what it DOES say. page-029-R:23 is the case
that named this file: he read `φύλαξαι`, with the acute over the υ, and no
engine put that on the page, so the only button left to him claimed nothing.

So a hand card is one line of a TSV. It is the ONLY source in this queue with
no machine behind it, which is exactly why it is the strictest:

    site      <column>:<printed line> — John's own notation, the corpus's own
              addressing, and the number he is reading off the card
    token     the spelling AS THE CORPUS HAS IT, and it must be unique on
              that line
    becomes   what the ink prints instead; empty is a deletion
    source    who read it — this becomes the button's name, so the card can
              never imply an engine said something no engine said
    why       the evidence, shown on the card

Everything else is derived: the ground truth is read live from
`work/reconciled` rather than typed, the proposal is that line with the one
substitution made, and the class comes from `classify`. Nothing here can put
a line in front of John that the corpus does not currently hold.

⚠ THE SID CARRIES THE TOKEN, so editing `site` or `token` after a ruling
RENAMES THE CARD ([[carry-rulings-by-site]]). That does not lose the answer
quietly — `_resolve_orphan` refuses a ruling whose card has gone — but it
does cost a sitting. Fix the `why`, never the key.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from bonitz_pipeline import audit_review as review
from bonitz_pipeline.gt_audit import SEVERITY, classify
from bonitz_pipeline.kraken_eval import align

ROOT = Path(__file__).resolve().parent.parent
HAND_TSV = ROOT / 'work' / 'audit' / 'hand-cards.tsv'
HEAD = ['site', 'token', 'becomes', 'source', 'why']

# Rows whose question the corpus has already answered — kept and REPORTED
# rather than deleted, so the file stays the record of what was asked.
RETIRED: list[str] = []

# Every (column, line) a hand card speaks for, spelt BOTH as the corpus holds
# it and as it read before the card's own answer was applied. ⚠ THE SECOND
# SPELLING IS THE POINT: the machine cards on that line keep the OCR ground
# truth, so once the hand card is applied they name a line that no longer
# exists — and matching on the current text alone let all three of them back
# into the queue the moment John's answers were written.
COVERS: set[tuple[str, str]] = set()


def _rows(path: Path) -> list[tuple[int, dict]]:
    """(line number, row) for every entry, blank and `#` lines dropped.

    ⚠ THE LINE NUMBER IS CARRIED SO EVERY REFUSAL CAN NAME ITS ROW. This is
    the one file in the pipeline a person edits by hand, and a complaint that
    cannot say WHERE sends him reading the whole thing.
    """
    if not path.exists():
        return []
    lines = [l for l in path.read_text(encoding='utf-8').splitlines()]
    body = [(n, l) for n, l in enumerate(lines, 1)
            if l.strip() and not l.lstrip().startswith('#')]
    if not body:
        return []
    n, head = body[0]
    if head.split('\t') != HEAD:
        raise SystemExit(f'{path}:{n}: the header must read '
                         f'{chr(9).join(HEAD)!r}, not {head!r}')
    out = []
    for n, l in body[1:]:
        f = l.split('\t')
        if len(f) != len(HEAD):
            raise SystemExit(f'{path}:{n}: {len(f)} tab-separated fields, '
                             f'and a row takes {len(HEAD)} '
                             f'({", ".join(HEAD)}) — an empty field is an '
                             f'empty string between two tabs')
        out.append((n, dict(zip(HEAD, f))))
    return out


def _siblings(path: Path, row: dict) -> list[str]:
    """Every `becomes` offered for this row's site and token.

    ⚠ A CARD RETIRES WHOLE OR NOT AT ALL. Its readings are buttons on ONE
    card, so when John picks the smooth one the rough row's token is gone
    too — and checking each row against its own `becomes` alone left the
    loser to refuse, which took the entire queue down with it.
    """
    return [r['becomes'] for _n, r in _rows(path)
            if r['site'] == row['site'] and r['token'] == row['token']]


def _site(path: Path, n: int, site: str) -> tuple[str, int]:
    col, _, lineno = site.rpartition(':')
    if not col or not lineno.isdigit():
        raise SystemExit(f'{path}:{n}: site {site!r} is not '
                         f'<column>:<printed line> — `page-029-R:23`, the '
                         f'way you write it')
    return col, int(lineno)


def cards(path: Path | None = None) -> list[review.Card]:
    """The hand-authored cards. Every one is checked against the corpus as it
    stands right now, and a row that does not fit it is REFUSED rather than
    dropped: a hand card exists because somebody looked, so losing one
    silently loses the looking.

    ⚠ THE DEFAULT IS RESOLVED HERE, NOT IN THE SIGNATURE. A default argument
    is bound when the module is imported, so `path: Path = HAND_TSV` would
    read the live file however the caller patched it — twenty tests reviewed
    the real queue before this line was written the other way round.
    """
    path = path or HAND_TSV
    RETIRED.clear()
    COVERS.clear()
    out: dict[str, review.Card] = {}
    whys: dict[str, list[str]] = {}
    for n, r in _rows(path):
        col, lineno = _site(path, n, r['site'])
        for k in ('token', 'source', 'why'):
            if not r[k].strip():
                raise SystemExit(f'{path}:{n}: {k} is empty — a card with no '
                                 f'{k} cannot be judged')
        if r['becomes'] == r['token']:
            raise SystemExit(f'{path}:{n}: token and becomes are both '
                             f'{r["token"]!r}, so this card asks nothing')
        line = review._reconciled_line(col, lineno)
        COVERS.add((col, review._key(line)))
        if r['becomes'] and r['becomes'] in line:
            COVERS.add((col, review._key(line.replace(r['becomes'],
                                                      r['token']))))
        k = line.count(r['token'])
        # ⚠ AN ANSWERED CARD RETIRES, IT DOES NOT CRASH THE QUEUE. John ruled
        # the `Ἀστυδά` card the minute it appeared, so its token was no longer
        # on the line and the refusal below took the WHOLE queue down with it
        # — every other card included. A row whose `becomes` is what the line
        # now reads has been answered; it is counted and dropped.
        if k == 0 and any(b and b in line for b in _siblings(path, r)):
            RETIRED.append(f'{col}:{lineno} {r["token"]!r} — the corpus '
                           f'already reads one of the answers offered')
            continue
        if k != 1:
            raise SystemExit(
                f'{path}:{n}: {col} line {lineno} holds {k} occurrences of '
                f'{r["token"]!r}, and a hand card names ONE place — widen '
                f'the token until it is unique on the line:\n    {line}')
        # ⚠ A SUBSTRING, NOT A LETTER RUN, and it is the uniqueness check
        # above that makes that safe. `_replace_runs` exists because `οβ` is
        # both a siglum and two letters inside φόβος — but that card binds
        # every site of a spelling at once, and this one binds exactly the
        # place the author already proved is the only one.
        new = line.replace(r['token'], r['becomes'])
        sid = f'{col}:L{lineno}:hand-{r["token"]}'
        # ⚠ ROWS SHARING A SITE AND A TOKEN ARE ONE CARD WITH TWO BUTTONS, not
        # two cards. They are the same question — what does this ink print? —
        # and John's rule 3 says a card that omits the reading the ink
        # actually has forces a `none`, which is the dead end this whole file
        # exists to close. Where a mark is doubtful, offer both readings.
        cls = classify(align(line, new))[0]
        card = out.get(sid)
        if card is None:
            card = out[sid] = review.Card(
                sid, col, '', cls, line, {}, lineno=lineno,
                token=r['token'].split()[0])
            whys[sid] = []
        if r['source'] in card.readings:
            raise SystemExit(f'{path}:{n}: {r["source"]!r} already reads this '
                             f'site on the card — a button name is how a '
                             f'ruling is recorded, so the second would '
                             f'silently replace the first')
        card.readings[r['source']] = new
        card.cls = min([card.cls, cls], key=SEVERITY.index)
        whys[sid].append(r['why'])
        card.note = ('hand-authored, no engine proposed this — '
                     + ' · '.join(whys[sid]))
    return list(out.values())


# --- what still owes a card ---------------------------------------------------

def _where(card: review.Card) -> int | None:
    """The printed line a card sits on, or None when the corpus has moved
    under it."""
    from bonitz_pipeline import audit_apply as aa
    try:
        if card.lineno is not None:
            return card.lineno
        if card.line_ops:
            return aa.locate_ops(card.column, card.gt, card.line_ops)[0]
        return aa.locate(card.column, card.gt)[0]
    except aa.ApplyError:
        return None


def unanswered(store: Path | None = None) -> list[dict]:
    """Every `none` ruling, with the site it refused and the readings it
    refused there — the worklist a hand card is written from.

    ⚠ A `none` WHOSE CARD HAS GONE IS STILL REPORTED. It is the one most
    likely to be forgotten and the one that cost the most to answer, so it
    comes back with `site: ''` and says so, rather than being skipped for
    being awkward ([[absence-rendered-as-clean]]).
    """
    path = store or review.RULINGS
    have = json.loads(path.read_text(encoding='utf-8'))
    have = have.get('rulings', have)
    index = {c.sid: c for c in cards()}
    index.update(review.line_cards())
    for c in review.load_cards():
        index.setdefault(c.sid, c)

    out = []
    for sid, r in sorted(have.items()):
        if not isinstance(r, dict) or r.get('verdict') != 'none':
            continue
        c = index.get(sid)
        lineno = _where(c) if c is not None else None
        out.append({
            'sid': sid,
            'site': f'{c.column}:{lineno}' if c and lineno else '',
            'gt': c.gt if c else '',
            'refused': dict(c.readings) if c else {},
        })
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--none', action='store_true',
                   help='list the `none` rulings that still owe a card')
    a = p.parse_args(argv)

    if a.none:
        rows = unanswered()
        lost = [r for r in rows if not r['site']]
        print(f'{len(rows)} `none` rulings — each one a site where you said '
              f'the ink reads something nobody offered\n')
        for r in rows:
            print(f'{r["site"] or "site unknown — the corpus has moved":<20} '
                  f'{r["sid"]}')
            if r['gt']:
                print(f'    now      {r["gt"]}')
            for who, reading in r['refused'].items():
                print(f'    ✕ {who:<8} {reading}')
            print()
        if lost:
            print(f'⚠ {len(lost)} of these cannot be placed in the corpus as '
                  f'it now stands — their line has been edited since, and '
                  f'they need looking up by hand.')
        return 0

    got = cards()
    for s in RETIRED:
        print(f'  retired, the corpus already reads it: {s}')
    print(f'{len(got)} hand-authored cards in '
          f'{HAND_TSV.relative_to(ROOT) if HAND_TSV.exists() else HAND_TSV}')
    for c in got:
        print(f'  {c.sid}')
        print(f'    corpus   {c.gt}')
        for who, reading in c.readings.items():
            print(f'    {who:<8} {reading}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
