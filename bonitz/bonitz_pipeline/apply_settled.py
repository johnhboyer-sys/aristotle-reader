"""Apply settled word disputes onto Opus columns as reconciled text.

`settle` chooses winners among reader forms. This module writes those winners
into column text, starting from the Opus column and leaving every REFUSED site
exactly as Opus read it. Output goes to `work/reconciled-auto/` — not the
canonical `work/reconciled/` — so John can review before anything is promoted.

⚠ THE DIPLOMATIC RULE. A settlement chooses between READERS, never between
Bonitz and "correct" Greek. If every reader agrees on a bad form, that form
stands, because that is what is on the page.

⚠ LIGATURES ARE INK. Bonitz sets ου as `ȣ` and καί as `ϗ`. Lexicon lookups
expand them as a KEY; that expansion is never a reading to write. When the
settled winner is only an expanded twin of a ligature-bearing reader form,
the ligature form is what gets written. A real defect is on record from
writing the expansion instead.

    python3 -m bonitz_pipeline.apply_settled work/flags5-053-062.jsonl
    python3 -m bonitz_pipeline.apply_settled work/flags5-053-062.jsonl --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from bonitz_pipeline.normalize import canonical, clean_opus
from bonitz_pipeline.settle import (
    AUTH_REFUSE,
    STRONG_READERS,
    Settlement,
    SettleReport,
    settle_path,
)

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FLAGS = ROOT / 'work' / 'flags5-053-062.jsonl'
DEFAULT_OPUS = ROOT / 'raw' / 'opus'
DEFAULT_OUT = ROOT / 'work' / 'reconciled-auto'
DEFAULT_QUEUE = ROOT / 'work' / 'queue-053-062.json'


# --- pure helpers -----------------------------------------------------------

def expand_ligatures(s: str) -> str:
    """Lexicon-key expansion. Never a surface form to write."""
    return s.replace('ȣ', 'ου').replace('Ȣ', 'ου').replace('ϗ', 'και')


def surface_form(winner: str, readings: dict[str, str]) -> str:
    """The form to write: the winner, with ligatures kept when a reader has them.

    Among reader forms that match the winner once ȣ/ϗ are expanded (NFC),
    prefer one that still carries the ligature. Prefer Opus among those.
    """
    if not winner:
        return winner
    w_exp = unicodedata.normalize('NFC', expand_ligatures(winner))
    candidates: list[str] = []
    for form in readings.values():
        if unicodedata.normalize('NFC', expand_ligatures(form)) == w_exp:
            candidates.append(form)
    if not candidates:
        return unicodedata.normalize('NFC', winner)
    with_lig = [c for c in candidates if any(x in c for x in 'ȣȢϗ')]
    if with_lig:
        opus = readings.get('opus')
        if opus is not None and opus in with_lig:
            return unicodedata.normalize('NFC', opus)
        return unicodedata.normalize('NFC', with_lig[0])
    return unicodedata.normalize('NFC', winner)


def form_set_key(readings: dict[str, str],
                 reader_names: tuple[str, ...] = STRONG_READERS
                 ) -> tuple[str, ...]:
    """Sorted unique forms under the reader set — the decision identity."""
    forms = {readings[n] for n in reader_names if n in readings}
    return tuple(sorted(forms))


def line_at(base: str, char_off: int) -> int:
    """1-based printed line of a character offset in the cleaned column text."""
    if char_off < 0:
        return 1
    return base[: min(char_off, len(base))].count('\n') + 1


# --- apply one column -------------------------------------------------------

@dataclass
class Skip:
    """A settled winner that could not be written — counted, never silent."""
    page: int
    col: str
    word_off: int
    reason: str
    opus: str = ''
    winner: str = ''


@dataclass
class ColumnResult:
    page: int
    col: str
    text: str
    n_applied: int = 0          # settled winners whose surface was written
    n_changed: int = 0          # surface differed from Opus at that site
    n_noop: int = 0             # surface equalled Opus (including ligature keep)
    n_refused_left: int = 0     # refused disputes left as Opus
    skips: list[Skip] = field(default_factory=list)
    # (line, before_word, after_word) for a few changed sites
    samples: list[tuple[int, str, str]] = field(default_factory=list)


def _load_column(path: Path) -> tuple[str, str, list[int]]:
    """Return (base_nfc, stream, offs) for one Opus column file."""
    raw = path.read_text(encoding='utf-8')
    cleaned = clean_opus(raw)
    stream, offs = canonical(cleaned)
    base = unicodedata.normalize('NFC', cleaned)
    return base, stream, offs


def apply_column(
        base: str,
        stream: str,
        offs: list[int],
        settlements: list[Settlement],
        *,
        page: int,
        col: str,
) -> ColumnResult:
    """Apply every settlement for one column. Refusals leave Opus untouched.

    Settled winners are applied right-to-left so earlier offsets stay valid
    when a replacement changes length. On offset mismatch the site is skipped
    and counted — never guessed.
    """
    text = base
    result = ColumnResult(page=page, col=col, text=text)
    # Collect settled edits first; refusals only increment a counter.
    edits: list[tuple[int, int, int, str, str, Settlement]] = []
    # (word_off, base_a, base_b, opus_form, surface, settlement)

    for s in settlements:
        w = s.word
        if not s.settled or s.winner is None:
            result.n_refused_left += 1
            continue
        opus_form = w.readers.get('opus')
        if opus_form is None:
            result.skips.append(Skip(
                page, col, w.word_off, 'no_opus_reading',
                winner=s.winner or ''))
            continue
        opus_form = unicodedata.normalize('NFC', opus_form)
        surf = surface_form(s.winner, w.readers)
        ws, n = w.word_off, len(opus_form)
        if n == 0:
            result.skips.append(Skip(
                page, col, ws, 'empty_opus_form', winner=surf))
            continue
        if ws < 0 or ws + n > len(stream):
            result.skips.append(Skip(
                page, col, ws, 'offset_oob',
                opus=opus_form, winner=surf))
            continue
        if stream[ws:ws + n] != opus_form:
            result.skips.append(Skip(
                page, col, ws, 'opus_mismatch',
                opus=opus_form, winner=surf))
            continue
        if ws + n - 1 >= len(offs):
            result.skips.append(Skip(
                page, col, ws, 'offs_oob',
                opus=opus_form, winner=surf))
            continue
        a, b = offs[ws], offs[ws + n - 1] + 1
        if a < 0 or b > len(base) or a > b:
            result.skips.append(Skip(
                page, col, ws, 'base_oob',
                opus=opus_form, winner=surf))
            continue
        # The base slice must be the opus form with no internal whitespace
        # (Greek words are contiguous). Anything else is geometry we refuse.
        slice_ = base[a:b]
        if slice_ != opus_form:
            # Allow only if stripping whitespace recovers the form AND the
            # non-ws length matches — still refuse; do not invent a splice
            # for whole-word replacement when geometry is wrong.
            result.skips.append(Skip(
                page, col, ws, 'base_mismatch',
                opus=opus_form, winner=surf))
            continue
        if surf == opus_form:
            result.n_noop += 1
            result.n_applied += 1
            continue
        edits.append((ws, a, b, opus_form, surf, s))

    # Right-to-left by base offset so length changes do not shift later sites.
    edits.sort(key=lambda t: -t[1])
    for ws, a, b, opus_form, surf, s in edits:
        # Re-check the live text — a prior edit must not have landed here.
        if text[a:b] != opus_form:
            result.skips.append(Skip(
                page, col, ws, 'stale_after_prior_edit',
                opus=opus_form, winner=surf))
            continue
        text = text[:a] + surf + text[b:]
        result.n_applied += 1
        result.n_changed += 1
        if len(result.samples) < 3:
            result.samples.append((line_at(base, a), opus_form, surf))

    result.text = text if text.endswith('\n') else text + '\n'
    return result


# --- whole report -----------------------------------------------------------

@dataclass
class ApplyReport:
    columns: list[ColumnResult] = field(default_factory=list)
    queue: list[dict] = field(default_factory=list)
    n_distinct_decisions: int = 0

    @property
    def n_changed(self) -> int:
        return sum(c.n_changed for c in self.columns)

    @property
    def n_skips(self) -> int:
        return sum(len(c.skips) for c in self.columns)

    @property
    def skips(self) -> list[Skip]:
        out: list[Skip] = []
        for c in self.columns:
            out.extend(c.skips)
        return out

    @property
    def changed_by_page(self) -> dict[int, int]:
        ctr: Counter = Counter()
        for c in self.columns:
            ctr[c.page] += c.n_changed
        return dict(sorted(ctr.items()))

    def assert_complete(self, n_settlements: int) -> None:
        """Every settlement is applied, no-op'd, refused-left, or skipped."""
        n = sum(
            c.n_applied + c.n_refused_left + len(c.skips)
            for c in self.columns
        )
        # n_applied counts both changed and noop; skips are separate.
        # A settlement is either settled (applied or skip) or refused.
        assert n == n_settlements, (
            f'accounted {n} != settlements {n_settlements}'
        )
        assert all(sk.reason for sk in self.skips)


def build_queue(
        refused: list[Settlement],
        *,
        opus_dir: Path | None = None,
        reader_names: tuple[str, ...] = STRONG_READERS,
) -> tuple[list[dict], int]:
    """One queue entry per refused dispute; identical form-sets grouped first.

    Returns (entries, n_distinct_form_sets). Cheapest decisions first: form
    sets that recur most often lead, so one ruling on `ἂ` vs `ᾶ` can settle
    every instance before rarer fights.
    """
    opus_dir = opus_dir or DEFAULT_OPUS
    # Cache cleaned base per column for line numbers.
    bases: dict[tuple[int, str], str] = {}
    streams: dict[tuple[int, str], tuple[str, list[int]]] = {}

    def _col(page: int, col: str) -> tuple[str, str, list[int]]:
        key = (page, col)
        if key not in bases:
            path = opus_dir / f'page-{page:03d}-{col}.txt'
            if not path.exists():
                bases[key] = ''
                streams[key] = ('', [])
            else:
                base, stream, offs = _load_column(path)
                bases[key] = base
                streams[key] = (stream, offs)
        base = bases[key]
        stream, offs = streams[key]
        return base, stream, offs

    # Group by form-set.
    groups: dict[tuple[str, ...], list[Settlement]] = defaultdict(list)
    for s in refused:
        key = form_set_key(s.word.readers, reader_names)
        groups[key].append(s)

    # Most frequent form-sets first (one ruling settles the most).
    ordered_keys = sorted(groups.keys(),
                          key=lambda k: (-len(groups[k]), k))

    entries: list[dict] = []
    for fkey in ordered_keys:
        members = sorted(groups[fkey],
                         key=lambda s: (s.word.page, s.word.col, s.word.word_off))
        for s in members:
            w = s.word
            base, stream, offs = _col(w.page, w.col)
            line = 0
            if 0 <= w.word_off < len(offs):
                line = line_at(base, offs[w.word_off])
            entries.append({
                'page': w.page,
                'col': w.col,
                'line': line,
                'word_off': w.word_off,
                'readers': dict(w.readers),
                'kind': w.kind,
                'reason': s.reason,
                'forms': list(fkey),
                'form_set': list(fkey),
                'n_same_form_set': len(groups[fkey]),
            })
    return entries, len(groups)


def apply_settlements(
        report: SettleReport,
        *,
        opus_dir: Path | None = None,
        out_dir: Path | None = None,
        write: bool = True,
        pages: list[int] | None = None,
) -> ApplyReport:
    """Apply a settle report to Opus columns; optionally write reconciled-auto."""
    opus_dir = opus_dir or DEFAULT_OPUS
    out_dir = out_dir or DEFAULT_OUT

    by_col: dict[tuple[int, str], list[Settlement]] = defaultdict(list)
    for s in report.settlements:
        p, c = s.word.page, s.word.col
        if pages is not None and p not in pages:
            continue
        by_col[(p, c)].append(s)

    # Also write columns that have no disputes (pure Opus copy) for pages
    # we touch — so reconciled-auto has a complete pair per page.
    if pages is None:
        pages = sorted({s.word.page for s in report.settlements})
    for p in pages:
        for c in ('L', 'R'):
            by_col.setdefault((p, c), [])

    out = ApplyReport()
    if write:
        out_dir.mkdir(parents=True, exist_ok=True)

    for (page, col) in sorted(by_col):
        path = opus_dir / f'page-{page:03d}-{col}.txt'
        if not path.exists():
            # Every settlement on a missing column is a skip.
            for s in by_col[(page, col)]:
                if s.settled and s.winner is not None:
                    # invent a ColumnResult-less skip via a dummy column
                    pass
            dummy = ColumnResult(page=page, col=col, text='')
            for s in by_col[(page, col)]:
                if s.settled and s.winner is not None:
                    dummy.skips.append(Skip(
                        page, col, s.word.word_off, 'missing_column',
                        opus=s.word.readers.get('opus', ''),
                        winner=s.winner or ''))
                else:
                    dummy.n_refused_left += 1
            out.columns.append(dummy)
            continue

        base, stream, offs = _load_column(path)
        cr = apply_column(base, stream, offs, by_col[(page, col)],
                          page=page, col=col)
        out.columns.append(cr)
        if write:
            (out_dir / f'page-{page:03d}-{col}.txt').write_text(
                cr.text, encoding='utf-8')

    refused = [s for s in report.settlements
               if not s.settled
               and (pages is None or s.word.page in pages)]
    out.queue, out.n_distinct_decisions = build_queue(
        refused, opus_dir=opus_dir, reader_names=report.reader_set)
    # Completeness: only for settlements on pages we processed.
    n = sum(1 for s in report.settlements
            if pages is None or s.word.page in pages)
    out.assert_complete(n)
    return out


def apply_path(
        flags: Path | str,
        *,
        opus_dir: Path | None = None,
        out_dir: Path | None = None,
        queue_path: Path | None = None,
        write: bool = True,
) -> ApplyReport:
    """Settle a flags JSONL, apply winners, emit queue."""
    report = settle_path(flags, opus_dir=opus_dir)
    out = apply_settlements(report, opus_dir=opus_dir, out_dir=out_dir,
                            write=write)
    if write and queue_path is not None:
        queue_path = Path(queue_path)
        queue_path.parent.mkdir(parents=True, exist_ok=True)
        doc = {
            'source_flags': str(flags),
            'n_refused': len(out.queue),
            'n_distinct_decisions': out.n_distinct_decisions,
            'entries': out.queue,
        }
        queue_path.write_text(
            json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
            encoding='utf-8')
    return out


# --- CLI --------------------------------------------------------------------

def _print_summary(out: ApplyReport, report: SettleReport | None = None) -> None:
    print(f'columns written: {sum(1 for c in out.columns if c.text)}')
    print(f'words changed from Opus: {out.n_changed}')
    print(f'  by page: {out.changed_by_page}')
    n_noop = sum(c.n_noop for c in out.columns)
    n_ref = sum(c.n_refused_left for c in out.columns)
    print(f'settled no-ops (winner surface == Opus): {n_noop}')
    print(f'refused left as Opus: {n_ref}')
    print(f'skipped (could not write): {out.n_skips}')
    if out.skips:
        by_r = Counter(sk.reason for sk in out.skips)
        print(f'  by reason: {dict(by_r)}')
        for sk in out.skips[:10]:
            print(f'  {sk.page}-{sk.col}:{sk.word_off}  {sk.reason}  '
                  f'opus={sk.opus!r} winner={sk.winner!r}')
    print(f'queue entries: {len(out.queue)}')
    print(f'distinct decisions (form-sets): {out.n_distinct_decisions}')
    # Sample changed lines for eye-check
    samples: list[tuple[int, str, int, str, str]] = []
    for c in out.columns:
        for line, before, after in c.samples:
            samples.append((c.page, c.col, line, before, after))
    if samples:
        print('sample changes (page-col:line  before → after):')
        for page, col, line, before, after in samples[:5]:
            print(f'  {page:03d}-{col}:{line}  {before!r} → {after!r}')


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('flags', nargs='?', default=str(DEFAULT_FLAGS),
                   help='flags JSONL (default: work/flags5-053-062.jsonl)')
    p.add_argument('--out', type=Path, default=DEFAULT_OUT,
                   help='output directory (default: work/reconciled-auto)')
    p.add_argument('--queue', type=Path, default=DEFAULT_QUEUE,
                   help='queue JSON path (default: work/queue-053-062.json)')
    p.add_argument('--opus-dir', type=Path, default=DEFAULT_OPUS)
    p.add_argument('--dry-run', action='store_true',
                   help='settle and report without writing files')
    a = p.parse_args(argv)

    flags = Path(a.flags)
    if not flags.exists():
        print(f'not found: {flags}', file=sys.stderr)
        return 2

    report = settle_path(flags, opus_dir=a.opus_dir)
    write = not a.dry_run
    out = apply_settlements(report, opus_dir=a.opus_dir, out_dir=a.out,
                            write=write)
    if write:
        a.queue.parent.mkdir(parents=True, exist_ok=True)
        doc = {
            'source_flags': str(flags),
            'n_refused': len(out.queue),
            'n_distinct_decisions': out.n_distinct_decisions,
            'entries': out.queue,
        }
        a.queue.write_text(
            json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
            encoding='utf-8')
        print(f'wrote {a.out}/ ({sum(1 for _ in a.out.glob("page-*.txt"))} files)')
        print(f'wrote {a.queue}')
    _print_summary(out, report)
    return 0


if __name__ == '__main__':
    sys.exit(main())
