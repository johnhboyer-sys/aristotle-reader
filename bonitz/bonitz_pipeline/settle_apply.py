"""John's settle-queue rulings, carried into reconciled-auto.

Verdict shape matches siglum_apply / book_apply:

    { sid: { "verdict": "accept"|"preserve", "detail": "<form>" } }

`sid` is the form-set key (`forms:a|b|…`) from settle_review. One ruling
covers every queue entry with that form-set.

    accept   → write `detail` at each member site in work/reconciled-auto
    preserve → leave the printed form; bank a corrigendum when the ruling
               records that the ink (and the edition) really does read a form
               authorities reject

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
from bonitz_pipeline.normalize import canonical, clean_opus
from bonitz_pipeline.settle_review import (
    DEFAULT_QUEUE,
    RULINGS,
    cards_from_queue,
    form_set_key,
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


def plan(queue_path: Path = DEFAULT_QUEUE,
         rulings_path: Path = RULINGS,
         *, record_aside: bool = False) -> list[dict]:
    """Every ruling expanded to its member sites, with printed → becomes.

    Writes nothing unless `record_aside` — a plan is a plan.
    """
    if not rulings_path.exists():
        raise SystemExit(f'no rulings yet: {rulings_path}')
    rulings = json.loads(rulings_path.read_text(encoding='utf-8'))
    cards = {c.sid: c for c in cards_from_queue(queue_path)}
    unknown = sorted(set(rulings) - set(cards))
    if unknown:
        raise SystemExit(f'rulings with no card: {unknown[:10]}'
                         + (f' (+{len(unknown) - 10})' if len(unknown) > 10 else ''))

    steps = []
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
        for m in card.members:
            printed = m.readers.get('opus') or card.printed
            becomes = printed if verdict == 'preserve' else detail
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
                # John ruled on the form the card showed him. Where a member
                # prints something else, the ruling does not reach it.
                'exemplar': card.printed,
                # What an authority wanted, so a preserve that overrules one
                # can say what it overruled.
                'proposal': ((m.proposal or card.proposal or {}).get('form')
                             or ''),
            })
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
    """
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


def _apply_one(step: dict, text: str, opus_len: int) -> tuple[str, str]:
    """Apply one accept edit against the live column text."""
    if step['verdict'] == 'preserve':
        return text, 'preserve'
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
    # Already applied? Check that before hunting the old form, so a rerun
    # cannot re-edit a neighbouring copy of it.
    if 0 <= ws <= len(stream) - len(surf) and stream[ws:ws + len(surf)] == surf:
        return text, 'already'
    i = _anchor(stream, ws, opus, opus_len)
    if i is None:
        return text, ('already' if _anchor(stream, ws, surf, opus_len)
                      is not None else 'no_anchor')
    a, b = offs[i], offs[i + len(opus) - 1] + 1
    if unicodedata.normalize('NFC', text[a:b]) != opus:
        return text, 'base_mismatch'
    return text[:a] + surf + text[b:], 'edited'


def _overlapping(col_steps: list[dict]) -> list[dict]:
    """Steps in one column whose written spans would collide.

    Nothing collides today. The check is here because the first collision would
    show up as a corrupted line, not as an error.
    """
    spans = []
    for s in col_steps:
        if s['verdict'] != 'accept' or s['printed'] == s['becomes']:
            continue
        spans.append((s['word_off'], s['word_off'] + len(s['printed']), s))
    spans.sort()
    bad = []
    for (a0, a1, sa), (b0, b1, sb) in zip(spans, spans[1:]):
        if b0 < a1:
            bad += [sa, sb]
    return bad


def apply(steps: list[dict], *, write: bool) -> dict:
    by_col: dict[tuple[int, str], list[dict]] = {}
    for s in steps:
        by_col.setdefault((s['page'], s['col']), []).append(s)

    counts = {'edited': 0, 'preserve': 0, 'noop': 0, 'already': 0,
              'skipped': 0}
    skips: list[tuple[str, str]] = []

    for (page, col), col_steps in sorted(by_col.items()):
        auto_path = AUTO / f'page-{page:03d}-{col}.txt'
        opus_path = OPUS / f'page-{page:03d}-{col}.txt'
        src = auto_path if auto_path.exists() else opus_path
        if not src.exists():
            for s in col_steps:
                counts['skipped'] += 1
                skips.append((s['member'], 'missing_column'))
            continue
        # Apply against the live column — auto when it exists, else Opus. The
        # recorded word offsets are Opus geometry; `_anchor` reconciles the two.
        text = unicodedata.normalize(
            'NFC', clean_opus(src.read_text(encoding='utf-8')))
        opus_len = len(canonical(clean_opus(
            opus_path.read_text(encoding='utf-8')))[0]
        ) if opus_path.exists() else len(canonical(text)[0])

        # Two rulings must never write over one another.
        for s in _overlapping(col_steps):
            counts['skipped'] += 1
            skips.append((s['member'], 'overlaps_another_edit'))
        overlapped = {id(s) for s in _overlapping(col_steps)}

        # Right-to-left so length changes do not shift earlier sites.
        edited_here = 0
        for s in sorted(col_steps, key=lambda s: -s['word_off']):
            if id(s) in overlapped:
                continue
            text, status = _apply_one(s, text, opus_len)
            if status in counts:
                counts[status] += 1
            else:
                counts['skipped'] += 1
                skips.append((s['member'], status))
            if status == 'edited':
                edited_here += 1

        if write and edited_here:
            AUTO.mkdir(parents=True, exist_ok=True)
            out = text if text.endswith('\n') else text + '\n'
            auto_path.write_text(out, encoding='utf-8')

    if write:
        _bank_corrigenda(steps)

    return {'counts': counts, 'skips': skips}


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
        why = impossible_reason(standing)
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
        if impossible_reason(correct) or correct == standing:
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
    a = ap.parse_args(argv)

    steps = plan(a.queue, a.rulings, record_aside=a.apply)
    accepts = [s for s in steps if s['verdict'] == 'accept'
               and s['printed'] != s['becomes']]
    keeps = [s for s in steps if s['verdict'] == 'preserve']
    print(f'{len(steps)} member-steps from {len({s["sid"] for s in steps})} rulings')
    print(f'  accept (would change): {len(accepts)}')
    print(f'  preserve:              {len(keeps)}')
    for s in accepts[:8]:
        print(f"  edit  {s['member']:<28} {s['printed']!r} → {s['becomes']!r}")
    skipped = unruled(a.queue, a.rulings)
    if skipped:
        print(f'\n{len(skipped)} card(s) nobody ruled — '
              f'{sum(c.n for c in skipped)} sites left untouched:')
        for c in skipped[:10]:
            print(f'  unruled  {c.sid}  ({c.n} sites)')
    if not a.apply:
        print('\ndry run — pass --apply to write reconciled-auto / corrigenda')
        return 0
    result = apply(steps, write=True)
    print(f"applied: {result['counts']}")
    if result['skips']:
        print(f"skips ({len(result['skips'])}):")
        for m, why in result['skips'][:20]:
            print(f'  {m}  {why}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
