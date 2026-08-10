"""Measure settle.py accuracy against adjudicated (reconciled) columns.

Builds five-reader flags for columns that already have codex + kraken +
reconciled ground truth, runs word_flags + settle, and scores every
settlement at WORD POSITION in the reconciled text.

    python3 -m bonitz_pipeline.measure_settle_gt

Uses the same compare4.compare / stream cleaning as batch4 --with-codex.
kraken_from=0 so kraken votes (on 15-52 it was muted in production because
it trained there; here we need its reading so the strong panel exists).
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from bonitz_pipeline import compare3, compare4, morpheus
from bonitz_pipeline.batch3 import locate_genie_slice
from bonitz_pipeline.batch4 import genie400_stream
from bonitz_pipeline.breathing_oracle import breathing
from bonitz_pipeline.normalize import canonical, clean_llamaparse, clean_opus
from bonitz_pipeline.settle import (
    AUTH_ACCENT_POS,
    AUTH_AGREE,
    AUTH_LEX_ARB,
    AUTH_LEX_DECIDE,
    AUTH_MORPHEUS_DECIDE,
    AUTH_MORPHEUS_MEMBER,
    AUTH_REFUSE,
    AUTH_SIGLUM,
    STRONG_READERS,
    by_accent_positional,
    by_lexicon_arbitrate,
    by_lexicon_decide,
    by_morpheus_decide,
    by_morpheus_membership,
    by_siglum_holds,
    bekker_after,
    column_text,
    following_char,
    following_token,
    looks_like_citation,
    select_readings,
    settle_words,
)
from bonitz_pipeline.siglum_check import inventory
from bonitz_pipeline.word_flags import (
    WordFlag,
    is_word_char,
    skeleton,
    words as load_words,
)

ROOT = Path(__file__).resolve().parent.parent

# Adjudicated columns with codex + kraken col image + seg + reconciled.
GT_COLUMNS = (
    (15, 'L'),
    (20, 'L'),
    (30, 'R'),
    (52, 'L'),
)

FLAGS_OUT = ROOT / 'work' / 'flags5-gt-015-052.jsonl'
REPORT_OUT = ROOT / 'work' / 'settle-gt-report.txt'


# --- flag build (same machinery as batch4, one column at a time) ------------

def _opus_col(page: int, col: str) -> str:
    f = ROOT / f'raw/opus/page-{page:03d}-{col}.txt'
    stream, _ = canonical(clean_opus(f.read_text(encoding='utf-8')))
    return stream


def _kraken_col(page: int, col: str) -> str:
    f = ROOT / f'work/kraken400/read/txt/page-{page:03d}-{col}.txt'
    if not f.exists():
        sys.exit(f'{f} missing — run kraken OCR first')
    stream, _ = canonical(f.read_text(encoding='utf-8'))
    return stream


def _codex_col(page: int, col: str) -> str:
    f = ROOT / f'work/codex/best/page-{page:03d}-{col}.txt'
    if not f.exists():
        sys.exit(f'{f} missing — run work/codex/codex_best.py first')
    stream, _ = canonical(clean_opus(f.read_text(encoding='utf-8')))
    return stream


def _llama_page(page: int) -> str:
    f = ROOT / f'raw/llama400/page-{page:03d}.md'
    stream, _ = canonical(clean_llamaparse(f.read_text(encoding='utf-8')))
    return stream


def build_flags_one_column(page: int, col: str) -> list[dict]:
    """Five-reader flags for one column via compare4 (same as batch4).

    Single-column spine so missing sibling codex does not block the run.
    kraken_from=0 so kraken votes (needed for the strong panel on trained pages).

    spine_off is then shifted so it matches word_flags._load_columns, which
    always builds L then R for each page (R starts at len(L)).
    """
    spine, segs = compare3.build_spine([(page, col, _opus_col(page, col))])
    genie = locate_genie_slice(spine, genie400_stream([page]))
    llama = _llama_page(page)
    readers = {
        'genie': genie,
        'llama': llama,
        'kraken': _kraken_col(page, col),
        'codex': _codex_col(page, col),
    }
    print(f'  {page:03d}-{col}: opus={len(spine)} '
          + ' '.join(f'{k}={len(v)}' for k, v in readers.items()))
    got = compare4.compare(spine, segs, readers, kraken_from=0)
    # word_flags rebuilds page spine as L then R. Our single-column compare
    # starts at 0; shift R so local = spine_off - col.start is correct.
    if col == 'R':
        shift = len(_opus_col(page, 'L'))
        for r in got:
            r['spine_off'] = int(r['spine_off']) + shift
    return got


def write_flags(results: list[dict], path: Path) -> tuple[int, int]:
    path.parent.mkdir(parents=True, exist_ok=True)
    flagged = 0
    with path.open('w', encoding='utf-8') as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
            if r.get('flag'):
                flagged += 1
    return len(results), flagged


def load_words_per_column(
        columns: tuple[tuple[int, str], ...] = GT_COLUMNS,
) -> tuple[list[WordFlag], list[dict], Path]:
    """Build flags per column and join words without cross-column spine shift.

    word_flags._load_columns rebuilds a multi-page L+R spine. Offsets from a
    single-column compare are only valid when that column is the whole batch,
    so each column is written and joined alone, then WordFlags are pooled.
    """
    all_results: list[dict] = []
    all_words: list[WordFlag] = []
    bycol = ROOT / 'work' / 'flags5-gt-by-col'
    bycol.mkdir(parents=True, exist_ok=True)
    for page, col in columns:
        results = build_flags_one_column(page, col)
        all_results.extend(results)
        path = bycol / f'page-{page:03d}-{col}.jsonl'
        write_flags(results, path)
        ws = load_words(path)
        print(f'    -> {len(results)} regions, {sum(1 for r in results if r.get("flag"))} '
              f'flagged, {len(ws)} word disputes')
        all_words.extend(ws)
    all_words.sort(key=lambda w: (w.page, w.col, w.word_off))
    n_reg, n_flag = write_flags(all_results, FLAGS_OUT)
    print(f'wrote {FLAGS_OUT.relative_to(ROOT)}: {n_reg} regions, {n_flag} flagged, '
          f'{len(all_words)} word disputes')
    return all_words, all_results, FLAGS_OUT


# --- ground-truth word at position ------------------------------------------

def _reconciled_column(page: int, col: str) -> tuple[str, list[int], str]:
    """Canonical stream + offs + base for the adjudicated column."""
    f = ROOT / f'work/reconciled/page-{page:03d}-{col}.txt'
    cleaned = clean_opus(f.read_text(encoding='utf-8'))
    stream, offs = canonical(cleaned)
    base = unicodedata.normalize('NFC', cleaned)
    return stream, offs, base


def _word_at_stream(stream: str, offs: list[int], base: str,
                    word_off: int, opus_word: str) -> str | None:
    """Recover the spaced word at stream[word_off:word_off+len(opus_word)].

    Uses the same offs→base geometry word_flags uses. Returns None when the
    position cannot be located honestly.
    """
    if word_off < 0 or word_off >= len(stream):
        return None
    end = word_off + max(len(opus_word), 1)
    if end > len(stream):
        end = min(word_off + 1, len(stream))
    if word_off >= len(offs):
        return None
    # Prefer the span covering the opus word's stream range.
    i0 = offs[word_off]
    i1 = offs[end - 1] + 1 if end - 1 < len(offs) else len(base)
    # Expand to full word-char run containing [i0, i1).
    a = i0
    while a > 0 and is_word_char(base[a - 1]):
        a -= 1
    b = i1
    while b < len(base) and is_word_char(base[b]):
        b += 1
    if a >= b:
        return None
    raw = base[a:b]
    while raw and raw[-1] in '.,;:·!?—–‐-()[]{}«»"\'':
        raw = raw[:-1]
    if not raw or not all(is_word_char(c) for c in raw):
        return None
    return unicodedata.normalize('NFC', raw)


def _map_opus_to_reconciled(
        opus_stream: str, recon_stream: str, word_off: int, opus_word: str
) -> int | None:
    """Map an Opus stream offset onto the reconciled stream via alignment.

    Returns the reconciled stream start index, or None if unplaceable.
    """
    if word_off < 0 or word_off > len(opus_stream):
        return None
    if opus_stream == recon_stream:
        return word_off
    sm = SequenceMatcher(None, opus_stream, recon_stream, autojunk=False)
    # Place the start of the word; prefer equal blocks.
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if i1 <= word_off < i2:
            if tag == 'equal':
                return j1 + (word_off - i1)
            # replace/delete/insert: pin to the left of the reconciled block
            return j1
        if word_off == i2 and tag == 'equal':
            return j2
    return None


def ground_truth_word(w: WordFlag) -> tuple[str | None, str]:
    """Adjudicated word at this dispute's position.

    Returns (truth_or_None, status) where status is 'ok' | 'unverifiable'.
    Matching is at word position via Opus→reconciled alignment — never
    "appears somewhere in the column".
    """
    try:
        recon_stream, recon_offs, recon_base = _reconciled_column(w.page, w.col)
    except FileNotFoundError:
        return None, 'unverifiable'

    opus_path = ROOT / f'raw/opus/page-{w.page:03d}-{w.col}.txt'
    if not opus_path.exists():
        return None, 'unverifiable'
    opus_stream, _ = canonical(clean_opus(opus_path.read_text(encoding='utf-8')))

    opus_form = w.readers.get('opus') or ''
    recon_off = _map_opus_to_reconciled(
        opus_stream, recon_stream, w.word_off, opus_form)
    if recon_off is None:
        return None, 'unverifiable'

    truth = _word_at_stream(
        recon_stream, recon_offs, recon_base, recon_off, opus_form)
    if truth is None:
        return None, 'unverifiable'
    return truth, 'ok'


def forms_match(a: str, b: str) -> bool:
    """Strict NFC equality first; skeleton+breathing+accent fallback.

    Settlement winners and reconciled text should match as written forms.
    Allow NFC normalisation only — no fold that erases diacritics.
    """
    if a is None or b is None:
        return False
    na = unicodedata.normalize('NFC', a)
    nb = unicodedata.normalize('NFC', b)
    return na == nb


# --- per-authority independent scoring --------------------------------------

def independent_winners(w: WordFlag, reader_names=STRONG_READERS
                        ) -> dict[str, str | None]:
    """What each authority would choose, independently (no short-circuit)."""
    readings = select_readings(w, reader_names)
    if len(readings) < 2:
        return {}
    form_set = set(readings.values())
    out: dict[str, str | None] = {}
    if len(form_set) == 1:
        out[AUTH_AGREE] = next(iter(form_set))
        return out

    idx = morpheus.index()
    wrks = inventory()
    stream = None
    col = column_text(w.page, w.col)
    if col is not None:
        stream = col.stream
    opus_form = w.readers.get('opus') or next(iter(form_set))

    if w.kind == 'letters' and not looks_like_citation(form_set, wrks):
        got = by_morpheus_membership(form_set, idx)
        if got:
            out[AUTH_MORPHEUS_MEMBER] = got[0]

    if w.kind == 'letters' and looks_like_citation(form_set, wrks):
        page = bekker_after(stream, w.word_off, opus_form) if stream else None
        got = by_siglum_holds(form_set, page, wrks)
        if got:
            out[AUTH_SIGLUM] = got[0]

    if w.kind in ('breathing-only', 'marks-only', 'letters'):
        got = by_morpheus_decide(form_set)
        if got:
            out[AUTH_MORPHEUS_DECIDE] = got[0]
        got = by_lexicon_arbitrate(readings)
        if got:
            out[AUTH_LEX_ARB] = got[0]
        got = by_lexicon_decide(form_set)
        if got:
            out[AUTH_LEX_DECIDE] = got[0]

    if w.kind == 'accent-only' and stream is not None:
        if col is not None:
            nxt = following_token(
                col.stream, col.offs, col.base, w.word_off, opus_form)
        else:
            nxt = following_char(stream, w.word_off, opus_form)
        got = by_accent_positional(form_set, nxt)
        if got:
            out[AUTH_ACCENT_POS] = got[0]

    return out


# --- main measurement -------------------------------------------------------

def measure() -> str:
    lines: list[str] = []

    def out(s: str = '') -> None:
        lines.append(s)
        print(s)

    out('=== Build five-reader flags for GT columns ===')
    word_list, results, flags_path = load_words_per_column()
    out(f'flags: {flags_path.relative_to(ROOT)}')
    out(f'word disputes: {len(word_list)}')
    out(f'  by kind: {dict(Counter(w.kind for w in word_list))}')
    out(f'  by column: {dict(Counter(f"{w.page:03d}-{w.col}" for w in word_list))}')
    out()

    rep = settle_words(word_list, STRONG_READERS)
    rep.assert_complete()
    out(f'=== settle (STRONG {STRONG_READERS}) ===')
    out(f'  settlements: {len(rep.settled)}')
    out(f'  refusals:    {len(rep.refused)}')
    out(f'  by authority: {dict(rep.by_authority)}')
    out(f'  refuse reasons: {dict(rep.refuse_reasons)}')
    out()

    # Score settlements against ground truth at word position.
    checked = match = mismatch = unverifiable = 0
    wrong: list[tuple] = []
    by_auth_ok: Counter = Counter()
    by_auth_bad: Counter = Counter()
    by_auth_unv: Counter = Counter()

    for s in rep.settled:
        truth, status = ground_truth_word(s.word)
        if status != 'ok' or truth is None:
            unverifiable += 1
            by_auth_unv[s.authority] += 1
            continue
        checked += 1
        if forms_match(s.winner, truth):
            match += 1
            by_auth_ok[s.authority] += 1
        else:
            mismatch += 1
            by_auth_bad[s.authority] += 1
            wrong.append((s, truth))

    out('=== Settlement accuracy (position-matched vs reconciled) ===')
    out(f'  settlements total:     {len(rep.settled)}')
    out(f'  checked (verifiable):  {checked}')
    out(f'  match:                 {match}')
    out(f'  DO NOT match:          {mismatch}')
    out(f'  unverifiable:          {unverifiable}')
    if checked:
        out(f'  accuracy (checked):    {match}/{checked} = '
            f'{100.0 * match / checked:.1f}%')
    out()

    out('=== Accuracy per authority (settle chain winner; position-matched) ===')
    auths = sorted(set(by_auth_ok) | set(by_auth_bad) | set(by_auth_unv))
    for a in auths:
        ok, bad, unv = by_auth_ok[a], by_auth_bad[a], by_auth_unv[a]
        n = ok + bad
        pct = f'{100.0 * ok / n:.1f}%' if n else 'n/a'
        out(f'  {a:<32} ok={ok}  wrong={bad}  unv={unv}  '
            f'checked={n}  acc={pct}')
    out()

    # Independent per-authority (no short-circuit) — the number that decides
    # whether each may run unattended.
    out('=== Per-authority independent accuracy (no short-circuit) ===')
    ind_ok: Counter = Counter()
    ind_bad: Counter = Counter()
    ind_unv: Counter = Counter()
    ind_fire: Counter = Counter()
    for w in word_list:
        truth, status = ground_truth_word(w)
        winners = independent_winners(w)
        for auth, win in winners.items():
            if win is None:
                continue
            ind_fire[auth] += 1
            if status != 'ok' or truth is None:
                ind_unv[auth] += 1
                continue
            if forms_match(win, truth):
                ind_ok[auth] += 1
            else:
                ind_bad[auth] += 1
    for a in sorted(set(ind_fire)):
        ok, bad, unv = ind_ok[a], ind_bad[a], ind_unv[a]
        n = ok + bad
        pct = f'{100.0 * ok / n:.1f}%' if n else 'n/a'
        out(f'  {a:<32} fire={ind_fire[a]}  ok={ok}  wrong={bad}  '
            f'unv={unv}  checked={n}  acc={pct}')
    out()

    out('=== EVERY WRONG settlement (position-matched) ===')
    if not wrong:
        out('  (none)')
    for s, truth in wrong:
        w = s.word
        forms = ', '.join(f'{n}={w.readers[n]!r}'
                          for n in s.readers if n in w.readers)
        out(f'  {w.page:03d}-{w.col}:{w.word_off}  kind={w.kind}')
        out(f'    readings: {forms}')
        out(f'    winner:   {s.winner!r}  [{s.authority}] {s.reason}')
        out(f'    truth:    {truth!r}')
    out()

    # Cost of caution: refusals where exactly one offered form matches truth.
    caution_correct = 0
    caution_checked = 0
    caution_unv = 0
    caution_no_unique = 0
    for s in rep.refused:
        if s.reason in ('readers:fewer_than_two_present',
                        'no_readings_in_reader_set'):
            continue
        truth, status = ground_truth_word(s.word)
        if status != 'ok' or truth is None:
            caution_unv += 1
            continue
        caution_checked += 1
        readings = select_readings(s.word, STRONG_READERS)
        matching = {f for f in readings.values() if forms_match(f, truth)}
        if len(matching) == 1:
            caution_correct += 1
        else:
            caution_no_unique += 1

    out('=== Cost of caution (refusals where truth was uniquely available) ===')
    out(f'  refusals (excl. <2-readers): checked={caution_checked}  '
        f'unv={caution_unv}')
    out(f'  truth uniquely among readings: {caution_correct}')
    out(f'  truth not uniquely available:  {caution_no_unique}')
    out('  (These are sites settle left for John; if an oracle had picked the')
    out('   unique matching form, that many would have been correct.)')
    out()

    # Caveat
    out('=== Caveats ===')
    out('  Columns: ' + ', '.join(f'{p:03d}-{c}' for p, c in GT_COLUMNS))
    out('  kraken trained on reconciled 15-52 — its vote here is not')
    out('  independent evidence; it is present so the strong panel exists')
    out('  for measuring the *authorities* (lexicon/Morpheus/siglum/agree).')
    out('  Codex best-of-N: 015-L→r1, 020-L→r1, 030-R→r3, 052-L→r1')
    out('    (by ȣ count, same codex_best.py rule as production).')
    out(f'  Model: work/kraken400/model96/best_0.9920.safetensors')
    out(f'  Seg reused: work/kraken400/seg/page-*.xml')

    text = '\n'.join(lines) + '\n'
    REPORT_OUT.write_text(text, encoding='utf-8')
    print(f'\nwrote {REPORT_OUT}')
    return text


def main(argv: list[str] | None = None) -> int:
    measure()
    return 0


if __name__ == '__main__':
    sys.exit(main())
