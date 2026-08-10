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


def plan(queue_path: Path = DEFAULT_QUEUE,
         rulings_path: Path = RULINGS) -> list[dict]:
    """Every ruling expanded to its member sites, with printed → becomes."""
    if not rulings_path.exists():
        raise SystemExit(f'no rulings yet: {rulings_path}')
    rulings = json.loads(rulings_path.read_text(encoding='utf-8'))
    cards = {c.sid: c for c in cards_from_queue(queue_path)}
    unknown = sorted(set(rulings) - set(cards))
    if unknown:
        raise SystemExit(f'rulings with no card: {unknown[:10]}'
                         + (f' (+{len(unknown) - 10})' if len(unknown) > 10 else ''))

    steps = []
    for sid, v in sorted(rulings.items()):
        card = cards[sid]
        verdict = v['verdict']
        detail = v.get('detail', '')
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
            })
    return steps


def _apply_one(step: dict, text: str, stream: str, offs: list[int]
               ) -> tuple[str, str]:
    """Apply one accept edit. Returns (new_text, status)."""
    if step['verdict'] == 'preserve':
        return text, 'preserve'
    opus = unicodedata.normalize('NFC', step['printed'])
    surf = unicodedata.normalize('NFC', step['becomes'])
    if opus == surf:
        return text, 'noop'
    ws, n = step['word_off'], len(opus)
    if n == 0 or ws < 0 or ws + n > len(stream):
        return text, 'offset_oob'
    if stream[ws:ws + n] != opus:
        # Text may already be reconciled-auto (partially applied). Try surface
        # already equal to becomes.
        if ws + n <= len(stream) and stream[ws:ws + n] == surf:
            return text, 'already'
        return text, 'opus_mismatch'
    if ws + n - 1 >= len(offs):
        return text, 'offs_oob'
    a, b = offs[ws], offs[ws + n - 1] + 1
    if text[a:b] != opus:
        if text[a:b] == surf:
            return text, 'already'
        return text, 'base_mismatch'
    return text[:a] + surf + text[b:], 'edited'


def apply(steps: list[dict], *, write: bool) -> dict:
    by_col: dict[tuple[int, str], list[dict]] = {}
    for s in steps:
        by_col.setdefault((s['page'], s['col']), []).append(s)

    counts = {'edited': 0, 'preserve': 0, 'noop': 0, 'already': 0,
              'skipped': 0}
    skips: list[tuple[str, str]] = []

    for (page, col), col_steps in sorted(by_col.items()):
        path = AUTO / f'page-{page:03d}-{col}.txt'
        if not path.exists():
            path = OPUS / f'page-{page:03d}-{col}.txt'
        if not path.exists():
            for s in col_steps:
                counts['skipped'] += 1
                skips.append((s['member'], 'missing_column'))
            continue
        raw = path.read_text(encoding='utf-8')
        # Prefer applying against the current auto text; map offsets from Opus
        # geometry only when auto is still Opus-shaped. Offsets in the queue
        # are Opus stream offsets — apply against Opus stream, write into auto.
        opus_path = OPUS / f'page-{page:03d}-{col}.txt'
        opus_raw = opus_path.read_text(encoding='utf-8') if opus_path.exists() else raw
        cleaned = clean_opus(opus_raw)
        stream, offs = canonical(cleaned)
        # Start from auto if present (may already hold prior settlements),
        # else Opus. Word offsets assume Opus stream geometry; when auto has
        # length-changing prior edits, only exact base matches apply.
        base = unicodedata.normalize(
            'NFC', clean_opus(raw if path == AUTO or AUTO.joinpath(
                f'page-{page:03d}-{col}.txt').exists() else opus_raw))
        auto_path = AUTO / f'page-{page:03d}-{col}.txt'
        if auto_path.exists():
            base = unicodedata.normalize(
                'NFC', clean_opus(auto_path.read_text(encoding='utf-8')))
            # If auto differs from Opus, re-canonicalise auto for matching the
            # printed form at word_off only when streams still align.
            a_stream, a_offs = canonical(clean_opus(
                auto_path.read_text(encoding='utf-8')))
            if a_stream == stream:
                stream, offs = a_stream, a_offs

        # Right-to-left so length changes do not shift earlier sites.
        col_steps = sorted(col_steps, key=lambda s: -s['word_off'])
        text = base
        for s in col_steps:
            text, status = _apply_one(s, text, stream, offs)
            if status in counts:
                counts[status] += 1
            else:
                counts['skipped'] += 1
                skips.append((s['member'], status))
            # After a length-changing edit, stream offsets for later (lower)
            # word_offs still hold because we go right-to-left on the stream.
            if status == 'edited':
                # Keep stream in sync for subsequent checks on this column.
                stream, offs = canonical(text)
                # canonical drops whitespace — text still has it. Rebuild offs
                # from the live text.
                stream, offs = canonical(text)

        if write and counts['edited']:
            AUTO.mkdir(parents=True, exist_ok=True)
            out = text if text.endswith('\n') else text + '\n'
            auto_path.write_text(out, encoding='utf-8')

    if write:
        _bank_corrigenda(steps)

    return {'counts': counts, 'skips': skips}


def _bank_corrigenda(steps: list[dict]) -> int:
    """Preserve rulings where the printed form stands go to corrigenda."""
    if not CORRIGENDA.exists():
        return 0
    doc = json.loads(CORRIGENDA.read_text(encoding='utf-8'))
    have = {(e['page'], e['col'], e['line'], e['printed']) for e in doc['entries']}
    added = 0
    seen: set[tuple] = set()
    for s in steps:
        if s['verdict'] != 'preserve':
            continue
        key = (s['page'], s['col'], s['line'], s['printed'])
        if key in have or key in seen:
            continue
        seen.add(key)
        doc['entries'].append({
            'page': s['page'],
            'col': s['col'],
            'line': s['line'],
            'printed': s['printed'],
            'correct': s['detail'] or s['printed'],
            'rule': RULE,
            'authority': (
                'John ruled the settle-queue crop: the ink reads the printed '
                'form. Any authority that disagrees yields to the page.'
            ),
            'checked': f'400dpi {DATE}',
            'note': f'settle form-set {s["sid"]} · {DATE}',
        })
        added += 1
    if added:
        CORRIGENDA.write_text(
            json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
            encoding='utf-8')
    return added


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--queue', type=Path, default=DEFAULT_QUEUE)
    ap.add_argument('--rulings', type=Path, default=RULINGS)
    a = ap.parse_args(argv)

    steps = plan(a.queue, a.rulings)
    accepts = [s for s in steps if s['verdict'] == 'accept'
               and s['printed'] != s['becomes']]
    keeps = [s for s in steps if s['verdict'] == 'preserve']
    print(f'{len(steps)} member-steps from {len({s["sid"] for s in steps})} rulings')
    print(f'  accept (would change): {len(accepts)}')
    print(f'  preserve:              {len(keeps)}')
    for s in accepts[:8]:
        print(f"  edit  {s['member']:<28} {s['printed']!r} → {s['becomes']!r}")
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
