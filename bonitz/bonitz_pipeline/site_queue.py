"""A queue for rulings that already know their own site.

    python3 -m bonitz_pipeline.site_queue --spine-dir work/reconciled-auto \
        --rulings work/rulings/cold-107-117-ink.json --out work/x.json
    python3 -m bonitz_pipeline.site_queue --spine-dir work/reconciled-auto \
        --requeue work/kraken15-102/queue-107-117-homoglyph.json --out work/y.json

Most rulings answer a CARD, and `settle_apply` finds the card in the queue the
sitting was served from. Some do not. John reads a token off the ink mid-
sitting; a sweep proposes one site and no reader disagreed. Those land in the
store keyed `site:page-NNN-C:line:word_off`, carrying their own token and
result — a complete instruction with no card anywhere.

⚠ AND `settle_apply` DROPS A RULING IT CANNOT FIND A CARD FOR. Four of John's
own ink readings on 107-117 were in that class, including three Latin `p`
readings he gave while looking at the page.

⚠ `word_off` IS NOT AN ADDRESS ACROSS A RE-SPINE. `latin_spine` swapped
calamari's line in on 517 lines, which moves every offset after it in that
column; the recorded offsets miss by one to three characters, and the
homoglyph sweep's ten sites miss by more. The PRINTED LINE does not move —
both engines read the same 61 filtered lines — so the token is re-found on its
own line and nowhere else.

⚠ AND ONLY WHERE THE ANSWER IS UNIQUE. A token appearing twice on its line
names no position, and a guess about which one John meant is not a reading.
Both the empty and the doubled case refuse, by name.
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path

from bonitz_pipeline.normalize import canonical, clean_opus

ROOT = Path(__file__).resolve().parent.parent


def _nfc(s: str) -> str:
    return unicodedata.normalize('NFC', s or '')


def split_sid(sid: str) -> tuple[int, str, int, int]:
    """`page-109-R:60:2753` -> (109, 'R', 60, 2753)."""
    colk, line, off = sid.rsplit(':', 2)
    page, col = colk.rsplit('-', 2)[-2:]
    return int(page), col, int(line), int(off)


def anchor(spine_dir: Path, page: int, col: str, line: int, token: str
           ) -> tuple[int, int]:
    """Where `token` sits on that printed line: (word_off, char_at).

    Raises ValueError when the line does not hold the token exactly once.
    """
    path = spine_dir / f'page-{page:03d}-{col}.txt'
    if not path.exists():
        raise ValueError(f'no column {path.name}')
    text = _nfc(clean_opus(path.read_text(encoding='utf-8')))
    lines = text.split('\n')
    if not 1 <= line <= len(lines):
        raise ValueError(f'{path.name} has {len(lines)} lines, not {line}')
    tok = _nfc(token)
    if not tok:
        raise ValueError('no token to anchor')

    # ⚠ MATCHED THROUGH THE PRINTED LINE, NOT THE COLUMN STREAM. Folding the
    # token on its own puts it in a different context from the column: the
    # column's `canonical` DROPS a line-final hyphen, because the word carries
    # on over the measure, while `canonical('Ρ0o-')` alone keeps it. Searching
    # the column for the lone fold therefore misses every token that ends a
    # printed line — one of the ten sweep sites, silently.
    #
    # So fold the LINE and the TOKEN each on their own, where they agree, find
    # the token there, and carry its position back out to the column by
    # character offset. `canonical` conflates Latin `H` with Greek `Η`, which
    # is what lets the homoglyph sweep find its own sites at all.
    line_text = lines[line - 1]
    fline, flow = canonical(line_text)
    ftok = canonical(tok)[0]
    if not ftok:
        raise ValueError(f'{token!r} folds away to nothing')

    hits = []
    i = fline.find(ftok)
    while i != -1:
        hits.append(i)
        i = fline.find(ftok, i + 1)
    if not hits:
        raise ValueError(f'{token!r} is not on line {line} of {path.name}')
    if len(hits) > 1:
        raise ValueError(f'{token!r} appears {len(hits)} times on line {line} '
                         f'of {path.name} — no position, no ruling')

    char_at = flow[hits[0]]                       # into the printed line
    start_char = sum(len(l) + 1 for l in lines[:line - 1])
    want = start_char + char_at

    # ⚠ THE COLUMN'S OWN OFFSET FOR THAT CHARACTER, or the site is unaddressable
    # in the geometry `settle_apply` works in. A character the column-level fold
    # dropped has no offset, and there is nothing here to guess with.
    stream, offs = canonical(text)
    span = [k for k, c in enumerate(offs) if want <= c < want + len(tok)]
    if not span or offs[span[0]] != want:
        raise ValueError(f'{token!r} starts at a character the column fold drops')
    return span[0], char_at


def as_the_column_holds_it(spine_dir: Path, page: int, col: str, line: int,
                           token: str) -> str:
    """The token spelled the way the COLUMN's canonical stream spells it.

    ⚠ `settle_apply` ANCHORS ON THIS STRING, IN THAT STREAM, so recording the
    token as the sweep happened to write it does not work twice over:

    `canonical` folds Latin `z` to Greek `ζ`, so `Ηeitzp` is `Ηeitζp` in the
    column and a raw comparison finds nothing. Every other queue in this
    project already records `readers.opus` from the folded stream — `cold_queue`
    says so — and this one must agree with them.

    And the column fold DROPS a line-final hyphen, because the word carries on
    over the measure: `Ρ0o-` is `Ρ0ο` there, with `litica` running straight on.
    So the token is cut to the characters the column actually holds, and a
    caller correcting it must cut its replacement to match.
    """
    path = spine_dir / f'page-{page:03d}-{col}.txt'
    text = _nfc(clean_opus(path.read_text(encoding='utf-8')))
    lines = text.split('\n')
    fline, flow = canonical(lines[line - 1])
    ftok = canonical(_nfc(token))[0]
    at = fline.find(ftok)
    want = sum(len(l) + 1 for l in lines[:line - 1]) + flow[at]
    stream, offs = canonical(text)
    return ''.join(stream[k] for k, c in enumerate(offs)
                   if want <= c < want + len(_nfc(token)))



def already_reads(spine_dir: Path, page: int, col: str, line: int,
                  becomes: str) -> bool:
    """Does that printed line already read what the ruling asked for?

    ⚠ A REFUSAL AND A SATISFACTION LOOK THE SAME FROM THE OUTSIDE, and this
    project has shipped "nothing found" from a path nothing read four times.
    Three of John's ink readings on 107-117 could not be anchored because the
    token was GONE — kraken's `pgulmuS)` and `Μe6aphysica` and `ζΑα46.` are
    `posuimus`, `Metaphysica` and `(Αα46.` in the mixed spine, which is to say
    the second engine had already made his correction. That is the ruling
    honoured, not the ruling lost, and the report must be able to say which.
    [[absence-rendered-as-clean]]
    """
    path = spine_dir / f'page-{page:03d}-{col}.txt'
    if not path.exists() or not becomes:
        return False
    lines = _nfc(clean_opus(path.read_text(encoding='utf-8'))).split('\n')
    if not 1 <= line <= len(lines):
        return False
    want = canonical(_nfc(becomes).strip(' ,;.'))[0]
    return bool(want) and want in canonical(lines[line - 1])[0]


def entry_for(sid: str, ruling: dict, spine_dir: Path) -> dict:
    """One queue entry for a self-describing site ruling."""
    page, col, line, _ = split_sid(sid)
    token = ruling.get('token') or ''
    word_off, char_at = anchor(spine_dir, page, col, line, token)
    held = as_the_column_holds_it(spine_dir, page, col, line, token)
    becomes = ruling.get('becomes') or ruling.get('detail') or ''
    # ⚠ CUT THE REPLACEMENT WHERE THE TOKEN WAS CUT. `Ρ0o- → Po-` is a word
    # broken at the measure; the column holds `Ρ0ο` and the hyphen belongs to
    # the line, not the word. Writing `Po-` over `Ρ0ο` would print `Po--`.
    lost = len(canonical(_nfc(token))[0]) - len(held)
    if lost > 0 and becomes[-lost:] == token[-lost:]:
        becomes = becomes[:-lost]
    return {
        'page': page, 'col': col, 'line': line,
        'word_off': word_off, 'char_at': char_at,
        'readers': {'opus': held},
        'kind': ruling.get('kind', 'site'),
        'reason': ruling.get('why') or ruling.get('source') or 'site ruling',
        'forms': sorted({held, becomes}),
        'form_set': sorted({held, becomes}),
        'n_same_form_set': 1,
        'card_sid': f'site:page-{page:03d}-{col}:{line}:{word_off}',
        'becomes': becomes,
    }


def build(rulings: dict, spine_dir: Path) -> tuple[dict, list, dict]:
    """(queue, refusals, rekey) for every self-describing `site:` ruling.

    `rekey` maps the OLD ruling key to the new one, because re-anchoring moves
    the offset the key is made of. A caller that does not rewrite the store
    with it will apply nothing. `trimmed` carries the rulings whose written
    form was cut at a measure break, for the same reason.
    """
    entries, refused, rekey = [], [], {}
    trimmed: dict[str, str] = {}
    for sid, r in rulings.items():
        if not sid.startswith('site:') or not (r.get('token') or ''):
            continue
        try:
            e = entry_for(sid[5:], r, spine_dir)
        except ValueError as exc:
            page, col, line, _ = split_sid(sid[5:])
            done = already_reads(spine_dir, page, col, line,
                                 r.get('becomes') or r.get('detail') or '')
            refused.append((sid, ('SATISFIED — the spine already reads it'
                                  if done else str(exc))))
            continue
        entries.append(e)
        rekey[sid] = e['card_sid']
        # ⚠ AND THE RULING'S OWN `detail` MUST FOLLOW THE TRIM. A plain accept
        # is written from `detail`, not from the entry — so a `becomes` cut at
        # the measure while `detail` still said `Po-` would print `Po--` over
        # the column's `Ρ0ο`. The store is being rewritten anyway; it has to
        # be rewritten consistently.
        if e['becomes'] != (r.get('becomes') or r.get('detail') or ''):
            trimmed[sid] = e['becomes']
    return ({'spine_dir': str(spine_dir), 'n_sites': len(entries),
             'entries': entries}, refused, rekey, trimmed)


def requeue(queue: dict, spine_dir: Path) -> tuple[dict, list, dict]:
    """Re-anchor an existing queue's entries against the current spine.

    Returns (queue, refusals, rekey). ⚠ THE REKEY IS NOT OPTIONAL for a queue
    of `site:` cards: their sid holds the offset, so re-anchoring renames every
    card that moved, and a store still keyed on the old offsets matches nothing
    and applies nothing — silently, which is the whole failure mode this
    project keeps meeting. [[absence-rendered-as-clean]]
    """
    out, refused, rekey = [], [], {}
    for e in queue['entries']:
        token = (e.get('readers') or {}).get('opus') or ''
        try:
            word_off, char_at = anchor(spine_dir, int(e['page']), e['col'],
                                       int(e['line']), token)
        except ValueError as exc:
            # ⚠ A QUEUE ENTRY CARRIES NO `becomes` UNLESS IT IS A BUNDLE, so
            # the candidate is any form on the card the spine did NOT read.
            # Without this the requeue path reports a satisfied site as a
            # bare failure, which is the distinction this module exists to
            # keep. [[absence-rendered-as-clean]]
            spine_read = (e.get('readers') or {}).get('opus') or ''
            cands = [e.get('becomes') or ''] + [
                f for f in (e.get('form_set') or e.get('forms') or [])
                if f != spine_read]
            done = any(already_reads(spine_dir, int(e['page']), e['col'],
                                     int(e['line']), c) for c in cands if c)
            refused.append((e.get('card_sid') or
                            f"page-{int(e['page']):03d}-{e['col']}:{e['line']}",
                            ('SATISFIED — the spine already reads it'
                             if done else str(exc))))
            continue
        n = dict(e, word_off=word_off, char_at=char_at,
                 readers=dict(e.get('readers') or {},
                              opus=as_the_column_holds_it(
                                  spine_dir, int(e['page']), e['col'],
                                  int(e['line']), token)))
        if (e.get('card_sid') or '').startswith('site:'):
            n['card_sid'] = (f"site:page-{int(e['page']):03d}-{e['col']}"
                             f":{e['line']}:{word_off}")
            rekey[e['card_sid']] = n['card_sid']
        out.append(n)
    return (dict(queue, spine_dir=str(spine_dir), n_sites=len(out),
                 entries=out), refused, rekey)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--spine-dir', type=Path, required=True)
    p.add_argument('--rulings', type=Path,
                   help='build a queue from self-describing site rulings')
    p.add_argument('--requeue', type=Path,
                   help='re-anchor an existing queue instead')
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--rekey-out', type=Path,
                   help='where the re-keyed rulings are written')
    p.add_argument('--rulings-in', type=Path,
                   help='the store to re-key, when using --requeue')
    a = p.parse_args(argv)
    if bool(a.rulings) == bool(a.requeue):
        sys.exit('give exactly one of --rulings or --requeue')

    if a.rulings:
        store = json.loads(a.rulings.read_text(encoding='utf-8'))
        queue, refused, rekey, trimmed = build(store, a.spine_dir)
        if a.rekey_out:
            # ⚠ REKEY, NEVER FILTER. A `site:` ruling with no token is not
            # this module's business — it is answered by a card in its own
            # queue — and an earlier version dropped every one of them from
            # the store it wrote, which would have silently lost John's four
            # follow-up rulings on 107-117.
            out = {rekey.get(k, k): (dict(v, detail=trimmed[k],
                                          becomes=trimmed[k])
                                     if k in trimmed else v)
                   for k, v in store.items()}
            assert len(out) == len(store), 'a rekey collided with another key'
            a.rekey_out.write_text(
                json.dumps(out, ensure_ascii=False, indent=1) + '\n',
                encoding='utf-8')
        moved = sum(1 for k, v in rekey.items() if k != v)
        print(f'{queue["n_sites"]} site(s) anchored ({moved} moved, '
              f'{len(trimmed)} cut at a measure break)')
        for k, v in trimmed.items():
            print(f'  trimmed  {k}  -> {v!r}')
    else:
        queue, refused, rekey = requeue(
            json.loads(a.requeue.read_text(encoding='utf-8')), a.spine_dir)
        if a.rekey_out:
            store = json.loads(a.rulings_in.read_text(encoding='utf-8')) \
                if a.rulings_in else {}
            out = {rekey.get(k, k): v for k, v in store.items()}
            assert len(out) == len(store), 'a rekey collided with another key'
            a.rekey_out.write_text(
                json.dumps(out, ensure_ascii=False, indent=1) + '\n',
                encoding='utf-8')
        moved = sum(1 for k, v in rekey.items() if k != v)
        print(f'{queue["n_sites"]} site(s) re-anchored ({moved} moved)')

    for sid, why in refused:
        print(f'  refused  {sid}  {why}')
    a.out.write_text(json.dumps(queue, ensure_ascii=False, indent=1) + '\n',
                     encoding='utf-8')
    print(f'wrote {a.out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
