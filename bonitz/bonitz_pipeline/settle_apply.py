"""John's settle-queue rulings, carried into reconciled-auto.

Verdict shape matches siglum_apply / book_apply:

    { sid: { "verdict": "accept"|"preserve", "detail": "<form>" } }

`sid` is the form-set key (`forms:a|b|…`) from settle_review. One ruling
covers every queue entry with that form-set.

    accept   → write `detail` at each member site in work/reconciled-auto
    preserve → leave the printed form; bank a corrigendum when the ruling
               records that the ink (and the edition) really does read a form
               authorities reject

A word broken at the measure is TWO places in the corpus and one word in the
stream, and a ruling on it has to be both: proved against the seamless word the
canonical stream holds, written onto the two lines the page prints. That is what
`_apply_broken` does, and why a card carries its `pieces`.

    python3 -m bonitz_pipeline.settle_apply            # dry run
    python3 -m bonitz_pipeline.settle_apply --apply
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path

from bonitz_pipeline.apply_settled import surface_form
from bonitz_pipeline.normalize import (canonical, clean_opus,
                                       corpus_column)
from bonitz_pipeline.settle_review import (
    DEFAULT_QUEUE,
    RULINGS,
    cards_from_queue,
    form_set_key,
    load_queue,
)

ROOT = Path(__file__).resolve().parent.parent
AUTO = ROOT / 'work' / 'reconciled-auto'
OPUS = ROOT / 'raw' / 'opus'
CORRIGENDA = ROOT / 'work' / 'corrigenda' / 'entries.json'
DATE = '2026-08-10'
RULE = 'settle queue: John ruled the ink on the refused form-set'


ASIDE = ROOT / 'work/sweeps/settle-none.json'


def unruled(queue_path: Path = DEFAULT_QUEUE,
            rulings_path: Path = RULINGS) -> list:
    """Cards nobody answered.

    A skipped card is legitimate — John said he thought he had passed one — but
    it must be counted and named. Dropping it silently is indistinguishable
    from having nothing to drop.
    """
    rulings = (json.loads(rulings_path.read_text(encoding='utf-8'))
               if rulings_path.exists() else {})
    return [c for c in cards_from_queue(queue_path) if c.sid not in rulings]


AMBIGUOUS = 'ambiguous'


def pieces_by_site(queue_path: Path = DEFAULT_QUEUE) -> dict:
    """Each queue site's printed pieces, keyed the way a member is keyed.

    A word broken at the measure is printed on two lines, and `merge_review`
    records both halves — line, start, text. `settle_review.Member` carries
    none of that (it predates the broken-word queue), so the geometry is read
    back off the queue here and matched to the member by the same coordinates
    the member is built from.

    Two entries on one key with DIFFERENT pieces are marked `AMBIGUOUS` rather
    than resolved: the applier would have to guess which halves to write, and a
    guess here writes over the wrong line.
    """
    out: dict = {}
    for e in load_queue(queue_path):
        pcs = e.get('pieces')
        if not pcs:
            continue
        key = (int(e['page']), e['col'], int(e.get('line') or 0),
               int(e['word_off']))
        norm = [{'line': int(p['line']), 'start': int(p['start']),
                 'text': unicodedata.normalize('NFC', p['text'])}
                for p in pcs]
        if key in out and out[key] != norm:
            out[key] = AMBIGUOUS
        elif key not in out:
            out[key] = norm
    return out


def foreign_rulings(queue_path: Path = DEFAULT_QUEUE,
                    rulings_path: Path = RULINGS) -> list[str]:
    """Rulings in the store whose card is not in THIS queue.

    A typo'd sid and a sitting held against another queue look identical from
    here, and one review store now serves both: `review-rulings.json` holds the
    35 answers to `queue-review-53-62` and the 8 to the `-fix` re-serve. So the
    default stays a refusal, and the caller that knows the store is shared says
    so explicitly — with the foreign sids named, never silently dropped.
    """
    if not rulings_path.exists():
        return []
    rulings = json.loads(rulings_path.read_text(encoding='utf-8'))
    cards = {c.sid for c in cards_from_queue(queue_path)}
    return sorted(set(rulings) - cards)


def plan(queue_path: Path = DEFAULT_QUEUE,
         rulings_path: Path = RULINGS,
         *, record_aside: bool = False, allow_foreign: bool = False
         ) -> list[dict]:
    """Every ruling expanded to its member sites, with printed → becomes.

    Writes nothing unless `record_aside` — a plan is a plan.
    """
    if not rulings_path.exists():
        raise SystemExit(f'no rulings yet: {rulings_path}')
    rulings = json.loads(rulings_path.read_text(encoding='utf-8'))
    cards = {c.sid: c for c in cards_from_queue(queue_path)}
    pieces = pieces_by_site(queue_path)
    unknown = sorted(set(rulings) - set(cards))
    if unknown and not allow_foreign:
        raise SystemExit(f'rulings with no card: {unknown[:10]}'
                         + (f' (+{len(unknown) - 10})' if len(unknown) > 10 else '')
                         + ' — pass allow_foreign / --allow-foreign when the '
                           'store is shared with another sitting')
    # ⚠ A SITE RULING OUTRANKS ANY CARD COVERING THAT SITE, and it must be
    # read from the WHOLE store — the site answer and the card answer are
    # routinely given in different sittings, against different queues. John
    # took `ο → ρ` as a group, then looked again at two of its members and
    # said the ink reads `τοῖς` and `φιλοσοφίας`; without this the group wrote
    # `τρῖς` and `φιλρσοφίας`. [[carry-rulings-by-site]]
    #
    # Precedence is by ADDRESS, not by disagreement: a site ruling takes its
    # site even where it agrees, so the rule cannot depend on the answer.
    ruled_sites = {k[len('site:'):] for k in rulings if k.startswith('site:')}

    if unknown:
        rulings = {k: v for k, v in rulings.items() if k in cards}

    steps = []
    outranked: list[tuple[str, str]] = []
    excluded: list[tuple[str, str]] = []
    aside = []
    for sid, v in sorted(rulings.items()):
        card = cards[sid]
        verdict = v['verdict']
        detail = v.get('detail', '')
        # ⚠ NONE MEANS THE INK SHOWS SOMETHING NO READER OFFERED, so there is
        # nothing to write and it must not be silently treated as a keep. The
        # site is set aside, listed, and left exactly as Opus read it — the one
        # honest outcome when every candidate is wrong.
        if verdict == 'none':
            for m in card.members:
                aside.append({'sid': sid, 'member': m.sid, 'page': m.page,
                              'col': m.col, 'line': m.line,
                              'readers': dict(m.readers)})
            continue
        if verdict not in ('accept', 'preserve'):
            raise SystemExit(f'{sid}: unknown verdict {verdict!r}')
        if verdict == 'accept' and not detail:
            raise SystemExit(f'{sid}: accept needs a form in detail')
        # ⚠ A BUNDLE VERDICT IS A CHANGE, NOT A FORM. `settle_review` writes
        # `bundle:α>a` for a card that asks ONE substitution of many different
        # words, and its own button text promises "at every site the corpus
        # takes THAT SITE's own form". Read as a form, `bundle:> ` is the
        # literal text John's whole space sitting would have written into the
        # corpus; only this module's other guards ever stopped it.
        bundled = detail.startswith('bundle:')
        # ⚠ SITES JOHN HELD BACK FROM THIS RULING. `settle_review` records them
        # when he takes a group answer but refuses it somewhere; the click is
        # the whole of his instruction and this module used to ignore it.
        held = set(v.get('excluded') or ())
        for m in card.members:
            if m.sid in held:
                excluded.append((sid, m.sid))
                continue
            if m.sid in ruled_sites and sid != f'site:{m.sid}':
                # Named, not dropped: the site is answered by its own ruling,
                # which its own queue carries.
                outranked.append((sid, m.sid))
                continue
            printed = m.readers.get('opus') or card.printed
            if verdict == 'preserve' and m.kind == 'encoding' and detail:
                # ⚠ A PRESERVE ON AN ENCODING CARD NAMES A SPELLING. The button
                # reads `keep as printed · corum · o (Latin)` — one spelling,
                # for every site of a family the corpus writes two ways. Read
                # as an ordinary preserve, the half spelt the other way keeps
                # the other way and the split the sweep exists to close is
                # still open after the ruling. Three of John's ten families on
                # 107-117 were ruled exactly so.
                becomes = detail
            elif verdict == 'preserve':
                becomes = printed
            elif bundled:
                # The queue carries the member's own spelled result. Without
                # it there is nothing to write — never the verdict string.
                if not m.becomes:
                    raise SystemExit(
                        f'{sid}: bundle accept but {m.sid} carries no '
                        f'`becomes` — rebuild the queue')
                becomes = m.becomes
            else:
                becomes = detail
            # Keep ligatures when a reader form carries them.
            becomes = surface_form(becomes, m.readers)
            steps.append({
                'sid': sid,
                'member': m.sid,
                'page': m.page,
                'col': m.col,
                'line': m.line,
                'word_off': m.word_off,
                'verdict': verdict,
                'detail': detail,
                'printed': printed,
                'becomes': becomes,
                'kind': m.kind,
                # The printed halves of a word broken at the measure, or None
                # when this queue records no geometry (the older queues).
                'pieces': pieces.get((m.page, m.col, m.line, m.word_off)),
                # John ruled on the form the card showed him. Where a member
                # prints something else, the ruling does not reach it.
                #
                # ⚠ EXCEPT ON A BUNDLE, where members printing different words
                # is the entire point — `Λακεδαιμονίȣς`, `καλȣ́μεναι`, `κινȣ͂ν`
                # share one dispute and nothing else. Holding the exemplar
                # there refuses the feature, and it refused five true edits on
                # 107-117. The member's own `becomes` is the stronger check
                # and it has already been made above.
                #
                # ⚠ AND EXCEPT ON AN ENCODING CARD, for the same reason. Such a
                # family IS one word the corpus spells two ways — `Bran` here
                # and `Βran` there — and the ruling picks the spelling for
                # both; the member spelt the other way is the half the question
                # is about. Three of the ten families on 107-117 are one site
                # each way, and the guard refused all three.
                'exemplar': ('' if bundled or m.kind == 'encoding'
                             else card.printed),
                # What an authority wanted, so a preserve that overrules one
                # can say what it overruled.
                'proposal': ((m.proposal or card.proposal or {}).get('form')
                             or ''),
            })
    if excluded:
        print(f'{len(excluded)} site(s) John held back from their ruling:')
        for csid, msid in excluded:
            print(f'  excluded   {msid}  (card {csid})')
    if outranked:
        print(f'{len(outranked)} site(s) answered individually; the covering '
              f'card does not reach them:')
        for csid, msid in outranked:
            print(f'  outranked  {msid}  (card {csid})')
    if aside and record_aside:
        ASIDE.parent.mkdir(parents=True, exist_ok=True)
        ASIDE.write_text(json.dumps(aside, ensure_ascii=False, indent=1),
                         encoding='utf-8')
    return steps


LIGATURES = 'ȣȢϗ'
ANCHOR_PAD = 8


def _anchor(stream: str, ws: int, target: str, opus_len: int) -> int | None:
    """Where `target` sits in `stream`, given a word offset in Opus geometry.

    The recorded offsets are Opus stream offsets. Once a column carries an
    earlier settlement that changed a length, every later offset is stale — and
    the applier then compared the right characters at the wrong place and
    called a finished edit a mismatch.

    So: trust the recorded offset when it still holds; otherwise look inside a
    window the size of the column's drift, and answer only when the match there
    is UNIQUE. A unique match under a bounded window is an anchor; two matches
    is not an anchor, it is a guess.

    ⚠ THE TARGET IS FOLDED, BECAUSE THE STREAM IS. `canonical` writes Latin
    `I` as Greek `Ι`, `o` as `ο`, `z` as `ζ`; a raw spelling hunted in that
    stream simply is not there, and `Ηeitzp` came back `no_anchor` off a line
    plainly holding it. Folding here is also the only way an ENCODING ruling
    can be applied at all — `encoding_check` asks which codepoint a letter is,
    and the site has to be found in a stream that has already conflated them.
    The WRITE still puts down the raw ruled spelling; only the search folds.

    Two sites that differ solely by codepoint stay indistinguishable to this
    search, and that is handled where it always was: the answer must be
    UNIQUE, so an ambiguity refuses rather than guessing.
    """
    n = len(target)
    if n == 0:
        return None
    stream = canonical(stream)[0]
    target = canonical(target)[0]
    # ⚠ THE COLUMN FOLD ALREADY DROPPED THE LINE-FINAL HYPHEN, joining the word
    # broken at the measure: page-114-L holds `Sοphisticos` where the printed
    # line ends `Sο-`. Hunting the raw `Sο-` there finds nothing and the site
    # comes back `no_anchor` — which is why `site_queue.anchor` matches through
    # the PRINTED LINE instead. Drop it here too, and only here: the WRITE puts
    # down the ruled spelling with its hyphen, as it always has. Uniqueness
    # still decides, so a shortened target that now matches twice refuses.
    if target.endswith('-') and target[:-1] and target not in stream:
        target = target[:-1]
    if len(target) != n:
        n = len(target)
        if n == 0:
            return None
    if 0 <= ws <= len(stream) - n and stream[ws:ws + n] == target:
        return ws
    drift = len(stream) - opus_len
    lo = max(0, ws + min(0, drift) - ANCHOR_PAD)
    hi = min(len(stream), ws + max(0, drift) + ANCHOR_PAD + n)
    hits, start = [], lo
    while len(hits) < 2:
        i = stream.find(target, start, hi)
        if i < 0:
            break
        hits.append(i)
        start = i + 1
    return hits[0] if len(hits) == 1 else None


def _ligature_lost(printed: str, becomes: str) -> bool:
    """True when the write would put an expansion where the page shows a sort.

    `surface_form` carries ȣ/ϗ across only when a reader form is an exact twin
    of the winner. Let a second character differ too — `ȣ̓͂σα` ruled to `οὖσαν` —
    and it hands back the expanded form, which writes `ου` onto a page printing
    `ȣ`. That is not a correction; it is a different text.

    The test is whether the expansion is still THERE in the ruled form. If it
    is, the sort survived the ruling and expanding it would be a loss. If it is
    not, the ligature was itself what the readers disagreed about, and John's
    ruling is the answer to that — so it applies.
    """
    if not any(c in printed for c in LIGATURES):
        return False
    if any(c in becomes for c in LIGATURES):
        return False
    flat = unicodedata.normalize('NFD', becomes)
    return ('ου' in flat or 'Ου' in flat or 'ΟΥ' in flat
            or 'και' in flat or 'καί' in flat)


def _groups(s: str) -> list[str]:
    """NFD characters grouped as a base character plus its combining marks."""
    out: list[list[str]] = []
    for ch in unicodedata.normalize('NFD', s):
        if unicodedata.combining(ch) and out:
            out[-1].append(ch)
        else:
            out.append([ch])
    return [''.join(g) for g in out]


def split_on_pieces(texts: list[str], becomes: str) -> list[str] | None:
    """`becomes` cut into the printed pieces at the printer's own hyphens.

    ⚠ THE HYPHEN IS THE PRINTER'S AND IS NEVER ADDED OR REMOVED. The ruled form
    arrives spelt across the break exactly as the card showed it — `ἄ-γνοιαν` —
    and each half must go to the line the page prints it on. The cut is made at
    the head's own length: as many base characters as the head prints before its
    hyphen, then the hyphen itself, then the tail.

    Counting BASE characters, not characters, is what makes the cut survive the
    ruling: `ὑπερ-ἔχοντας` → `ὑπερ-έχοντας` drops a breathing, and a mark is not
    a letter of the head.

    None when the ruled form does not cut there — a damage marker expanded in
    the head (`ἀπόπλ[?]-` → `ἀπόπλȣ-`) moves the hyphen, and a write that
    guessed where would land on the wrong glyph. Refuse and say so.
    """
    gs = _groups(becomes)
    out: list[str] = []
    i = 0
    for t in texts[:-1]:
        if not t.endswith('-'):
            return None
        n = len(_groups(t[:-1]))
        if i + n >= len(gs) or gs[i + n] != '-':
            return None
        out.append(unicodedata.normalize('NFC', ''.join(gs[i:i + n])) + '-')
        i += n + 1
    out.append(unicodedata.normalize('NFC', ''.join(gs[i:])))
    if any(p in ('', '-') for p in out):
        return None
    return out


def _seamless(parts: list[str]) -> str:
    """The pieces as the canonical stream holds them — the hyphen folded away.

    `canonical` drops a hyphen that ends a line, so the stream carries the word
    seamlessly while the card carries it diplomatically. Folding here with the
    same function is the only way the two stay in step.
    """
    return canonical('\n'.join(parts))[0]


def _read(lines: list[str], line: int, start: int, n: int) -> str | None:
    """`n` characters at (line, start) in the live column, or None off the end."""
    i = line - 1
    if not (0 <= i < len(lines)) or start < 0 or start + n > len(lines[i]):
        return None
    return unicodedata.normalize('NFC', lines[i][start:start + n])


def _written_pieces(s: dict) -> dict | None:
    """{(line, start): (printed, ruled)} for the pieces this step rewrites.

    None when the step carries no piece geometry — the older queues — or when
    the ruled form does not cut at the printed hyphen.
    """
    pieces = s.get('pieces')
    if not pieces or pieces == AMBIGUOUS:
        return None
    parts = split_on_pieces([p['text'] for p in pieces],
                            unicodedata.normalize('NFC', s['becomes']))
    if parts is None:
        return None
    return {(p['line'], p['start']): (p['text'], new)
            for p, new in zip(pieces, parts) if new != p['text']}


def _at_offset(text: str, offs: list, ws: int, n: int) -> str:
    """The RAW characters the stream positions `ws..ws+n` came from."""
    if ws < 0 or ws + n > len(offs) or n <= 0:
        return ''
    return text[offs[ws]:offs[ws + n - 1] + 1]


def _hyphen_pair(printed: str, becomes: str) -> tuple[str, str]:
    """Drop the line-division hyphen from BOTH sides, or from neither.

    ⚠ THE COLUMN FOLD ALREADY DROPPED IT, joining the word broken at the
    measure, so the span the applier measures cannot include it. And once the
    span is `Sο`, writing `So-` over it leaves the raw text reading `So--` —
    the hyphen is still there in the file, only absent from the stream. So the
    write drops it too and the mark stays exactly where the printer put it.

    ⚠ ONLY WHEN BOTH SIDES CARRY ONE. A ruling that DELETES a hyphen, or adds
    one, is a real edit about the hyphen itself and must reach the corpus
    untouched.
    """
    if printed.endswith('-') and becomes.endswith('-'):
        return printed[:-1], becomes[:-1]
    return printed, becomes


def _covers_hyphen(printed: str, becomes: str) -> bool:
    """Does the ruling CHANGE the line-final hyphen rather than keep it?

    The two cases pull opposite ways. `Sο-` → `So-` keeps the mark, so
    `_hyphen_pair` drops it from both sides and the span stops short of it.
    `διαιρέσεσιν-` → `διαιρέσεσιν·` replaces it — an ano teleia the reader took
    for a hyphen — so the span must REACH it, or the write lands a character
    short and `_same_base` refuses the ruling outright.
    """
    return printed.endswith('-') and not becomes.endswith('-')


def _same_base(printed_here: str, printed_then: str) -> bool:
    """Is the column still printing the word the ruling was given against?

    ⚠ COMPARED IN THE FOLD, BECAUSE THE OFFSET IS. `canonical()` folds Latin
    `I` to Greek `Ι`, `o` to `ο`, `H` to `Η` — and a cold tranche records its
    spine reading FROM the folded stream, so a Latin site arrives here with
    `printed` spelled in Greek while the column holds the Latin. Byte equality
    then reports a mismatch that is only the fold; it refused eight true edits
    on 107-117 — Ueberweg, Göttling, Rose twice, eosdem, coruin, Sophisticos.

    ⚠ AND IT IS STILL A REAL CHECK. A span holding another word does not fold
    to the same string either — `test_the_base_check_still_refuses_a_genuinely
    _different_word` pins that. What is given up is exactly the ability to tell
    `I` from `Ι` at a position whose address was computed by conflating them,
    which was never information this comparison had.

    ⚠ AND ONLY AN ACCEPT REACHES IT. A preserve writes `becomes == printed`
    and returns `noop` long before here, so the folded Greek spelling of a
    Latin word can never be written back over the Latin.
    """
    a = unicodedata.normalize('NFC', printed_here)
    b = unicodedata.normalize('NFC', printed_then)
    return a == b or canonical(a)[0] == canonical(b)[0]


def _apply_broken(step: dict, text: str, opus_len: int,
                  written: dict | None = None) -> tuple[str, str]:
    """Write one accept onto the halves of a word broken at the measure.

    The card's identity is the seamless word (that is what `word_off` indexes,
    and what the stream holds); the card's geometry is the two printed pieces.
    So the site is proved seamlessly and written diplomatically: anchor the word
    in the stream, then put each half on the line the page prints it on.

    Nothing is written until every piece has been read back and found to be
    exactly what the card recorded — the one exception being a half another
    ruling settled earlier in this same run, which is named as such. A piece
    that has moved otherwise is a refusal with its coordinates given, never a
    write at the recorded offset.
    """
    pieces = step['pieces']
    if pieces == AMBIGUOUS:
        return text, ('piece_ambiguous: two queue entries claim this site with '
                      'different pieces')
    texts = [p['text'] for p in pieces]
    opus = unicodedata.normalize('NFC', step['printed'])
    surf = unicodedata.normalize('NFC', step['becomes'])
    if unicodedata.normalize('NFC', ''.join(texts)) != opus:
        return text, (f'piece_drift: the pieces spell {"".join(texts)!r}, not '
                      f'the printed {opus!r}')
    if opus == surf:
        return text, 'noop'
    if step.get('exemplar') and step['exemplar'] != step['printed']:
        return text, 'exemplar_drift'
    if _ligature_lost(opus, surf):
        return text, 'ligature_loss'
    ws = step['word_off']
    if ws < 0:
        return text, 'offset_oob'
    parts = split_on_pieces(texts, surf)
    if parts is None:
        return text, (f'unsplittable: {surf!r} does not cut at the printed '
                      f'hyphen of {opus!r}')

    lines = text.split('\n')
    # Already applied? Ask that before verifying the OLD text, or a finished
    # edit reports as drift and the rerun looks like corruption.
    if all(_read(lines, p['line'], p['start'], len(new)) == new
           for p, new in zip(pieces, parts)):
        return text, 'already'
    # What is standing at each piece right now. Normally the printed text; on
    # the half this ruling does not touch it may be another ruling's write from
    # this same run — the head-card and tail-card pair on one broken word. That
    # is a settled half, not drift, and only the exact text just written there
    # counts as one.
    have: list[str] = []
    for p, new in zip(pieces, parts):
        got = _read(lines, p['line'], p['start'], len(p['text']))
        if got == p['text']:
            have.append(got)
            continue
        sib = (written or {}).get((p['line'], p['start']))
        if (new == p['text'] and sib is not None
                and _read(lines, p['line'], p['start'], len(sib)) == sib):
            have.append(sib)
            continue
        return text, (f'piece_drift: line {p["line"]} at {p["start"]} reads '
                      f'{got!r}, not the recorded {p["text"]!r}')

    stream, _ = canonical(text)
    if _anchor(stream, ws, _seamless(have), opus_len) is None:
        return text, ('already'
                      if _anchor(stream, ws, _seamless(parts), opus_len)
                      is not None else 'no_anchor')

    for p, new in sorted(zip(pieces, parts),
                         key=lambda x: (-x[0]['line'], -x[0]['start'])):
        if new == p['text']:
            continue
        line = lines[p['line'] - 1]
        lines[p['line'] - 1] = (line[:p['start']] + new
                                + line[p['start'] + len(p['text']):])
    return '\n'.join(lines), 'edited'


def _apply_one(step: dict, text: str, opus_len: int,
               written: dict | None = None) -> tuple[str, str]:
    """Apply one accept edit against the live column text."""
    # ⚠ A PRESERVE WRITES NOTHING — unless it is an encoding card, where the
    # verdict names a SPELLING for the whole family rather than "leave the ink
    # alone". `plan` has already resolved that into `becomes`; a step whose
    # becomes still equals its printed falls out as a noop below, so the test
    # here is simply whether the ruling asks for a different string.
    if step['verdict'] == 'preserve' and (
            step.get('kind') != 'encoding'
            or step['becomes'] == step['printed']):
        return text, 'preserve'
    pieces = step.get('pieces')
    if pieces == AMBIGUOUS or (pieces and len(pieces) > 1):
        return _apply_broken(step, text, opus_len, written)
    opus = unicodedata.normalize('NFC', step['printed'])
    surf = unicodedata.normalize('NFC', step['becomes'])
    if opus == surf:
        return text, 'noop'
    if step.get('exemplar') and step['exemplar'] != step['printed']:
        return text, 'exemplar_drift'
    if _ligature_lost(opus, surf):
        return text, 'ligature_loss'
    ws = step['word_off']
    if ws < 0 or not opus:
        return text, 'offset_oob'
    stream, offs = canonical(text)
    # ⚠ THE STREAM ALREADY JOINED THE WORD BROKEN AT THE MEASURE, so a ruling
    # about a line-final token can be neither hunted nor measured with its
    # hyphen on: page-114-L holds `Sοphisticos` where the line ends `Sο-`.
    # Drop it from BOTH sides — see `_hyphen_pair` — and the mark stays in the
    # raw text exactly where the printer set it.
    if opus.endswith('-') and canonical(opus)[0] not in stream:
        opus, surf = _hyphen_pair(opus, surf)
    # Already applied? Check that before hunting the old form, so a rerun
    # cannot re-edit a neighbouring copy of it.
    #
    # ⚠ AND THE FOLD CANNOT ANSWER IT FOR AN ENCODING RULING. `canonical`
    # conflates Latin `O` with Greek `Ο` — which is the entire subject of
    # `encoding_check` — so where the two spellings differ ONLY by the fold,
    # the folded stream reads as the ruled form whatever the column holds, and
    # every such site reports `already` while the wrong codepoint stays put.
    #
    # Narrow on purpose: only when printed and becomes are the same folded
    # string does the check drop to the raw characters. Everywhere else the
    # fold is doing useful work — a site settled as `εἶτ’` must not be rewritten
    # to `εἶτ'` because the store spells the apostrophe the other way.
    encoding_only = opus != surf and canonical(opus)[0] == canonical(surf)[0]

    def _is_already(pos: int) -> bool:
        # ⚠ MEASURED IN THE FOLD, BECAUSE `stream` IS FOLDED. Slicing by the
        # RAW length of `surf` never matches when it holds a space, so the
        # guard reports "not done" for a finished edit and the write runs
        # again on its own output: `— Po--` → `— Po-` → `— Po`, a hyphen the
        # printer set eaten by a rerun. Third instance of this confusion,
        # after `_overlapping` and the write span.
        fsurf = canonical(surf)[0]
        if not (0 <= pos <= len(stream) - len(fsurf)):
            return False
        if stream[pos:pos + len(fsurf)] != fsurf:
            return False
        # ⚠ AND THE OLD FORM MUST BE GONE. Finding the ruled form is not the
        # same as the edit being done when the ruled form is a PREFIX of what
        # is printed — which every deletion is. Stripping a marginal line
        # number makes `non 5` into `non`, and `non` was there all along, so
        # eleven of the seventeen margin cards reported `already` and left the
        # number in the corpus. Mirror of the elision case below, where an
        # accept ADDED a character and the printed form survived as a prefix.
        fopus = canonical(opus)[0]
        if (len(fopus) > len(surf)
                and stream[pos:pos + len(fopus)] == fopus):
            return False
        return (_at_offset(text, offs, pos, len(surf)) == surf
                if encoding_only else True)

    if _is_already(ws):
        return text, 'already'
    i = _anchor(stream, ws, opus, opus_len)
    if i is None:
        j = _anchor(stream, ws, surf, opus_len)
        return text, ('already' if j is not None and _is_already(j)
                      else 'no_anchor')
    # ⚠ MEASURED IN THE FOLD, WHICH IS WHERE `i` LIVES. `canonical` drops the
    # spaces, so the raw `non 5` is five characters and its stream image four;
    # indexing `offs` by the raw length walks off the end of the line, or past
    # the site. The span is the ruling's own footprint in the stream.
    # ⚠ MEASURED ON WHAT `_anchor` ACTUALLY MATCHED. It drops a line-final
    # hyphen the column fold already dropped, so measuring the span from the
    # target WITH its hyphen runs one character past the word and the base
    # check then compares the wrong slice. `διαιρέσεσιν-` → `διαιρέσεσιν·`
    # failed exactly there.
    matched = opus
    if opus.endswith('-') and canonical(opus)[0] not in stream:
        matched = opus[:-1]
    n_fold = len(canonical(matched)[0])
    if not n_fold or i + n_fold > len(offs):
        return text, 'offset_oob'
    a, b = offs[i], offs[i + n_fold - 1] + 1
    # ⚠ THE FOLD DROPPED THE LINE-FINAL HYPHEN, so a span measured in it stops
    # one character short of a ruling that REPLACES that hyphen. Reach for it
    # in the raw text, which is not folded. See `_covers_hyphen`.
    if _covers_hyphen(opus, surf) and text[b:b + 1] == '-':
        b += 1
    if not _same_base(text[a:b], opus):
        return text, 'base_mismatch'
    # ⚠ AN ACCEPT THAT ONLY ADDS A CHARACTER SURVIVES BOTH CHECKS ABOVE. `κατ`
    # → `κατ᾽` adds the elision mark, and `canonical` folds every apostrophe to
    # one sort — so the stream never reads back `κατ᾽`, while the printed `κατ`
    # is still sitting there as a prefix of the finished edit. Three runs put
    # three apostrophes on 059-R:60. Ask the corpus, which is not folded.
    #
    # ⚠ AND THE SAME QUESTION HAS THE OPPOSITE ANSWER FOR A DELETION, where the
    # ruled form is a prefix of the printed one and so is there BEFORE the edit
    # too. Stripping a marginal line number rules `non 5` to `non`; asking only
    # "is `non` here" answers yes either way, and eleven of the seventeen
    # margin cards wrote nothing. The edit is finished when the ruled form is
    # here AND the printed one is not.
    #
    # ⚠ AND THE TWO SHAPES NEED OPPOSITE TESTS. Where the accept ADDS (`κατ` →
    # `κατ᾽`) the printed form is a prefix of the finished text and must be
    # ignored. Where it DELETES (`non 5` → `non`, a marginal line number
    # stripped) the ruled form is a prefix of the PRINTED one and is therefore
    # already there before the edit — asking only "is `non` here" answers yes
    # either way, and eleven of the seventeen margin cards wrote nothing.
    deleting = len(surf) < len(opus) and opus.startswith(surf)
    if unicodedata.normalize('NFC', text[a:a + len(surf)]) == surf and not (
            deleting
            and unicodedata.normalize('NFC', text[a:a + len(opus)]) == opus):
        return text, 'already'
    return text[:a] + surf + text[b:], 'edited'


def _write_spans(s: dict) -> list[tuple[int, int, int]] | None:
    """Where this step would actually write, as (line, start, end).

    None when the step records no piece geometry — the older queues — and the
    stream offsets are all there is to compare.
    """
    w = _written_pieces(s)
    if w is None:
        return None
    return [(ln, st, st + len(old)) for (ln, st), (old, _) in w.items()]


def _overlapping(col_steps: list[dict]) -> list[dict]:
    """Steps in one column whose written spans would collide.

    ⚠ ONE WORD IS TWO PLACES. A word broken at the measure can carry two cards —
    one about the head, one about the tail — and both are keyed to the word, so
    both record the SAME `word_off`. Compared as stream spans they collide every
    time, and this refused both: the tail ruling was thrown away to protect a
    head nobody was writing to.

    So a step that knows its pieces is compared where it writes. Two rulings
    that touch different halves of one word both apply; two that write the same
    half still refuse, both of them, because there is no way to tell which of
    two answers to the same question John meant to stand.

    A preserve writes nothing and so collides with nothing.
    """
    live = [s for s in col_steps
            if s['verdict'] == 'accept' and s['printed'] != s['becomes']]
    spans = {id(s): _write_spans(s) for s in live}
    bad: list[dict] = []
    for i, a in enumerate(live):
        for b in live[i + 1:]:
            sa, sb = spans[id(a)], spans[id(b)]
            if sa is not None and sb is not None:
                hit = any(la == lb and a0 < b1 and b0 < a1
                          for la, a0, a1 in sa for lb, b0, b1 in sb)
            else:
                # ⚠ MEASURED IN THE FOLD, BECAUSE `word_off` IS. The raw
                # length counts spaces the stream does not hold, so a
                # multi-word target over-reports its span and collides with
                # the card that merely ABUTS it: `I ερὶ πνεύματος` is 15 raw
                # and 13 folded, and at 755 the raw span ran to 770 and ate
                # the site at 768. Both rulings were then thrown away to
                # protect an overlap that does not exist. Same mistake as at
                # the write, where the comment already reads "span measured
                # in the fold".
                la_ = len(canonical(a['printed'])[0])
                lb_ = len(canonical(b['printed'])[0])
                hit = (a['word_off'] < b['word_off'] + lb_
                       and b['word_off'] < a['word_off'] + la_)
            if hit:
                bad += [a, b]
    seen: set = set()
    return [s for s in bad if not (id(s) in seen or seen.add(id(s)))]


def live_column(page: int, col: str) -> Path:
    """The file this column's settlements read and write.

    ⚠ THE STAGE IS NOT A CONSTANT. This module hard-wired `work/reconciled-auto`
    on both sides, so the day John promoted 53-62 into `work/reconciled` the
    file it looked for stopped existing — and the code fell through to
    `raw/opus`, the UNSETTLED read. The rehearsal then reported sixteen edits
    still to make against a corpus that already had all sixteen, and `--apply`
    would have written a promoted page back out of Opus, into a shadow copy the
    readers do not even prefer: `corpus_column` takes `reconciled` first, so the
    new file would have been invisible as well as wrong.

    So the stage is resolved at read time, and the write goes back to the file
    the text came from. `AUTO` remains the destination for a column no stage
    holds yet — the bootstrap case, where the first settlement of an
    untranscribed page is read from Opus and lands in reconciled-auto for John
    to promote.

    ⚠ AND A RECORDED STAGE IS HISTORY, NOT AN ADDRESS. Queues note the stage a
    site was read from; that is a fact about the day they were built. Where the
    column lives NOW is a question only the disk can answer.
    """
    live = corpus_column(page, col, required=False)
    return live if live is not None else AUTO / f'page-{page:03d}-{col}.txt'


def apply(steps: list[dict], *, write: bool) -> dict:
    by_col: dict[tuple[int, str], list[dict]] = {}
    for s in steps:
        by_col.setdefault((s['page'], s['col']), []).append(s)

    counts = {'edited': 0, 'preserve': 0, 'noop': 0, 'already': 0,
              'skipped': 0}
    skips: list[tuple[str, str]] = []
    status_of: list[tuple[str, str]] = []

    for (page, col), col_steps in sorted(by_col.items()):
        auto_path = live_column(page, col)
        opus_path = OPUS / f'page-{page:03d}-{col}.txt'
        src = auto_path if auto_path.exists() else opus_path
        if not src.exists():
            for s in col_steps:
                counts['skipped'] += 1
                skips.append((s['member'], 'missing_column'))
                status_of.append((s['member'], 'missing_column'))
            continue
        # Apply against the live column — auto when it exists, else Opus. The
        # recorded word offsets are Opus geometry; `_anchor` reconciles the two.
        text = unicodedata.normalize(
            'NFC', clean_opus(src.read_text(encoding='utf-8')))
        opus_len = len(canonical(clean_opus(
            opus_path.read_text(encoding='utf-8')))[0]
        ) if opus_path.exists() else len(canonical(text)[0])

        # Two rulings must never write over one another.
        clash = _overlapping(col_steps)
        for s in clash:
            counts['skipped'] += 1
            skips.append((s['member'], 'overlaps_another_edit'))
            status_of.append((s['member'], 'overlaps_another_edit'))
        overlapped = {id(s) for s in clash}

        # Right-to-left so length changes do not shift earlier sites.
        edited_here = 0
        written: dict = {}
        for s in sorted(col_steps, key=lambda s: -s['word_off']):
            if id(s) in overlapped:
                continue
            text, status = _apply_one(s, text, opus_len, written)
            status_of.append((s['member'], status))
            if status == 'edited':
                written.update({k: new for k, (_, new)
                                in (_written_pieces(s) or {}).items()})
            if status in counts:
                counts[status] += 1
            else:
                counts['skipped'] += 1
                skips.append((s['member'], status))
            if status == 'edited':
                edited_here += 1

        if write and edited_here:
            auto_path.parent.mkdir(parents=True, exist_ok=True)
            out = text if text.endswith('\n') else text + '\n'
            auto_path.write_text(out, encoding='utf-8')

    if write:
        _bank_corrigenda(steps)

    return {'counts': counts, 'skips': skips, 'status': status_of}


_VOWELS = set('αεηιουωΑΕΗΙΟΥΩȣȢ')
_ACCENTS = {'́', '̀', '͂'}


def impossible_reason(form: str) -> str:
    """Why no Greek word can be spelt this way — empty when it can.

    Only one rule so far, and it is deliberately narrow: a token carries at
    most one accent, unless a following enclitic throws a second one onto the
    ULTIMA (Smyth §183, ἄνθρωπός τις). A second accent anywhere else is a
    compositor's slip.

    ⚠ This decides nothing about what is on the page. Bonitz PRINTED ἄνθρώπȣ
    and we keep it; the rule only says the printing was wrong, which is exactly
    what a corrigendum records. A grammar may never overrule a reading.
    """
    d = unicodedata.normalize('NFD', form)
    groups, accented, in_vowel = 0, set(), False
    for ch in d:
        if ch in _VOWELS:
            if not in_vowel:
                groups += 1
                in_vowel = True
        elif unicodedata.combining(ch):
            if in_vowel and ch in _ACCENTS:
                accented.add(groups - 1)
        else:
            in_vowel = False
    if len(accented) < 2:
        return ''
    if max(accented) == groups - 1 and len(accented) == 2:
        return ''      # own accent plus an enclitic's, on the ultima
    return ('two accents and neither pair explained by an enclitic — '
            'no Greek word is spelt this way')


def as_word(step: dict, form: str) -> str:
    """`form` with the measure hyphen taken out — the word, not the two lines.

    ⚠ THE GRAMMAR RULE IS ABOUT A WORD. `impossible_reason` counts vowel groups,
    and a printed hyphen splits one: a word broken as `ἀγνο-ιαν` has `οια` in
    the book and `ο` + `ια` on the card, which moves both the group count and
    the ultima the enclitic exception is measured against. Judging the card's
    spelling would be judging the typography.

    None of the seven accepts on the 53-62 re-serve changes verdict either way —
    every break there falls between a vowel group and a consonant. The rule is
    right regardless of whether today's cards can show it wrong.
    """
    pieces = step.get('pieces')
    if not pieces or pieces == AMBIGUOUS or len(pieces) < 2:
        return form
    parts = split_on_pieces([p['text'] for p in pieces],
                            unicodedata.normalize('NFC', form))
    if parts is None:
        return form
    return ''.join(p[:-1] for p in parts[:-1]) + parts[-1]


def _impossible_word_in(form: str) -> str:
    """`impossible_reason` over a form that may be more than one word.

    ⚠ A SPACE ENDS A WORD, AND THE GRAMMAR RULE IS ABOUT A WORD. John ruled
    `τȣ̀ςἈρκάδας → τȣ̀ς Ἀρκάδας`, putting back a word-space the spine had lost.
    Read as one token the result carries two accents, so the register banked
    his CORRECTION as a misprint he had chosen to keep — under an authority
    line saying "the ink reads the printed form", which is the opposite of what
    he clicked. `τȣ̀ς` and `Ἀρκάδας` are each ordinary Greek.

    ⚠ AND IT IS NOT AN AMNESTY. One bad word among several still makes the
    form one no grammar allows; the first is named, as before.
    """
    for word in form.split():
        why = impossible_reason(word)
        if why:
            return why
    return ''


def correction_for(ruling: dict, queue_proposal: str) -> str:
    """The emendation to bank: John's typed one, else what the queue proposed.

    ⚠ HIS OUTRANKS THE QUEUE'S. He typed it having read the crop; the queue
    derived it, or failed to. For the siglum corrigenda the queue derives ONE
    of thirty — Bonitz's key gives WORK Bekker ranges and not per-book ones,
    so nothing in it can say whether 1374a is `Ρα` or `Ρβ` — and a sitting
    that could not overrule a wrong derivation would bank the wrong erratum.
    """
    typed = (ruling.get('correction') or '').strip()
    return typed or queue_proposal


def corrigenda_for(steps: list[dict]) -> list[dict]:
    """The rulings that leave a WRONG form standing, and nothing else.

    A corrigendum says: the page prints X, X is an error, the correct text is
    Y. Confirming that an OCR reading matches the ink is not that. Banking
    every `preserve` put 373 entries in the register whose correction was
    identical to what was printed — the register's own tests reject them, and
    rightly: an erratum that corrects nothing hides the ones that do.

    So a ruling registers only when the standing form is known to be wrong:

      * an authority proposed a different form and John ruled for the page, or
      * the form is one no grammar allows — which for `accept` means John read
        a compositor's slip off the crop and told us to keep it.
    """
    out: list[dict] = []
    seen: set[tuple] = set()
    for s in steps:
        standing = s['becomes'] if s['verdict'] == 'accept' else s['printed']
        why = _impossible_word_in(as_word(s, standing))
        proposal = s.get('proposal') or ''
        if not why and not (s['verdict'] == 'preserve'
                            and proposal and proposal != standing):
            continue
        key = (s['page'], s['col'], s['line'], standing)
        if key in seen:
            continue
        seen.add(key)
        # The plausible correction: for a misprint, the reading it displaced;
        # for an overruled authority, what that authority wanted.
        correct = s['printed'] if why else proposal
        if _impossible_word_in(as_word(s, correct)) or correct == standing:
            correct = ''
        out.append({
            'page': s['page'],
            'col': s['col'],
            'line': s['line'],
            'printed': standing,
            'correct': correct,
            'rule': why or RULE,
            'authority': (
                'John ruled the settle-queue crop: the ink reads the printed '
                'form. Any authority that disagrees yields to the page.'
            ),
            'checked': f'400dpi {DATE}',
            'note': f'settle form-set {s["sid"]} · {DATE} · registered '
                    f'automatically',
        })
    return out


def _bank_corrigenda(steps: list[dict]) -> int:
    if not CORRIGENDA.exists():
        return 0
    doc = json.loads(CORRIGENDA.read_text(encoding='utf-8'))
    have = {(e['page'], e['col'], e['line'], e['printed']) for e in doc['entries']}
    fresh = [e for e in corrigenda_for(steps)
             if (e['page'], e['col'], e['line'], e['printed']) not in have]
    if fresh:
        doc['entries'].extend(fresh)
        CORRIGENDA.write_text(
            json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
            encoding='utf-8')
    return len(fresh)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--queue', type=Path, default=DEFAULT_QUEUE)
    ap.add_argument('--rulings', type=Path, default=RULINGS)
    ap.add_argument('--allow-foreign', action='store_true',
                    help='the store also answers another queue; name those '
                         'rulings and apply only this queue’s')
    a = ap.parse_args(argv)

    foreign = foreign_rulings(a.queue, a.rulings) if a.allow_foreign else []
    steps = plan(a.queue, a.rulings, record_aside=a.apply,
                 allow_foreign=a.allow_foreign)
    accepts = [s for s in steps if s['verdict'] == 'accept'
               and s['printed'] != s['becomes']]
    keeps = [s for s in steps if s['verdict'] == 'preserve']
    print(f'{len(steps)} member-steps from {len({s["sid"] for s in steps})} rulings')
    print(f'  accept (would change): {len(accepts)}')
    print(f'  preserve:              {len(keeps)}')
    if foreign:
        print(f'  {len(foreign)} ruling(s) answer another queue and are not '
              f'applied here:')
        for sid in foreign:
            print(f'    foreign  {sid}')
    for s in accepts:
        where = ' broken' if (s.get('pieces') or []) and len(s['pieces']) > 1 \
            else ''
        print(f"  edit  {s['member']:<28} {s['printed']!r} → "
              f"{s['becomes']!r}{where}")
    skipped = unruled(a.queue, a.rulings)
    if skipped:
        print(f'\n{len(skipped)} card(s) nobody ruled — '
              f'{sum(c.n for c in skipped)} sites left untouched:')
        for c in skipped[:10]:
            print(f'  unruled  {c.sid}  ({c.n} sites)')
    # ⚠ A DRY RUN THAT NEVER TOUCHES THE APPLIER IS NOT A REHEARSAL. Printing
    # the plan told us seven edits were coming while every one of them was
    # about to refuse as `no_anchor`. The rehearsal runs the same code the
    # write runs, with write=False, and reports what it would have done.
    result = apply(steps, write=a.apply)
    print(f"{'applied' if a.apply else 'would apply'}: {result['counts']}")
    for m, status in result['status']:
        print(f'  {status:<10} {m}')
    if result['skips']:
        print(f"skips ({len(result['skips'])}):")
        for m, why in result['skips'][:20]:
            print(f'  {m}  {why}')
    if not a.apply:
        print('\ndry run — nothing written; pass --apply to write '
              'reconciled-auto / corrigenda')
    return 0


if __name__ == '__main__':
    sys.exit(main())
