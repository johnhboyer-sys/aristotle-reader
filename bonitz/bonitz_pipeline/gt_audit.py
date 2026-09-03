"""Audit the ground truth with the model that memorised it.

    python3 -m bonitz_pipeline.gt_audit --work work/kraken400

A recognition model spends every epoch pulling its output toward its training
targets, so on its OWN training columns it agrees with the corpus almost
everywhere. The lines where it still disagrees after 37 epochs are the lines
that resisted memorisation — damaged type, an inconsistent transcription, or
a ground-truth error the readers and every sweep missed. That residue is a
review queue no reader panel can produce: the panel's readers were the source
of the ground truth, so their errors are already IN it.

⚠ A DISAGREEMENT HERE IS A QUESTION, NEVER A CORRECTION. The model is the
weakest authority in the building — it was trained on the very text it is
questioning. Each candidate goes to John against the 400 dpi ink, and the
diplomatic rule holds: if the ink really does read the "impossible" thing,
the corpus keeps it.

Classes, most to least likely to matter, and the sort order of the output:

  letter   a base character differs, marks stripped — homoglyphs (a→α,
           v→ν), wrong sorts (χ→κ). The class that has held real errors.
  digit    a Bekker reference digit differs — an address error corrupts
           every check built on citations
  punct    punctuation or apostrophe encoding differs
  mark     only the marks differ — combining (over `ȣ`) or precomposed
           (ἀ→ἄ is one codepoint in NFC, but it is an accent dispute)
  spacing  whitespace only — mostly the printed Bekker gap the corpus
           deliberately strips (John's 2026-08-06 ruling), kept visible
           here rather than dropped so the exclusion is auditable

`stale-gt` is a separate tier: the training XML no longer matches
work/reconciled (the corpus moved after the corpus tree was staged — the
four orphan-mark rulings of 2026-08-12 are the known case). Those lines are
flagged, not scored: the model's target and the corpus disagree, so a diff
against either one alone misleads.
"""

from __future__ import annotations

import argparse
import sys
import unicodedata
from collections import Counter
from pathlib import Path

from bonitz_pipeline.kraken_corpus import BEKKER_SPACE
from bonitz_pipeline.kraken_eval import align, read_lines

ROOT = Path(__file__).resolve().parent.parent
RECONCILED = ROOT / 'work' / 'reconciled'

# Sort order of the queue: the classes most likely to be a real corpus error
# come first. One label per line — the most severe kind present on it.
SEVERITY = ['letter', 'digit', 'punct', 'mark', 'spacing']


class AuditError(Exception):
    """The audit could not run. Raised, never warned: a column silently
    skipped reads as a column with nothing wrong in it."""


def _base(c: str) -> str:
    """The character with its marks stripped — ἄ, ἀ and α all come back α.
    In NFC an accent dispute over an ordinary vowel is a SINGLE-codepoint
    substitution (ἀ→ἄ), indistinguishable from a letter dispute unless the
    mark is peeled off first; only marks over `ȣ` stay combining."""
    return ''.join(ch for ch in unicodedata.normalize('NFD', c)
                   if not unicodedata.combining(ch))


def _kind(x: str | None, y: str | None) -> str:
    """Classify one substitution/insertion/deletion from the alignment."""
    cx, cy = x or ' ', y or ' '
    if cx.isspace() and cy.isspace():
        return 'spacing'
    if _base(cx) == _base(cy) or not _base(cx) or not _base(cy):
        return 'mark'
    if cx.isdigit() or cy.isdigit():
        return 'digit'
    # Sk covers the spacing clones of marks — the koronis `᾽` (U+1FBD) that
    # stands in for an apostrophe, spacing accents — which are encoding
    # disputes, not letter disputes.
    if all(unicodedata.category(c)[0] == 'P' or unicodedata.category(c) == 'Sk'
           for c in (cx, cy) if not c.isspace()):
        return 'punct'
    return 'letter'


def classify(pairs: list[tuple[str | None, str | None]]) -> tuple[str, int, str]:
    """(line class, edit count, compact sub list) for one aligned line."""
    subs = [(x, y) for x, y in pairs if x != y]
    kinds = {_kind(x, y) for x, y in subs}
    label = next(k for k in SEVERITY if k in kinds)
    compact = ' '.join(f'{x or "∅"}→{y or "∅"}' for x, y in subs)
    return label, len(subs), compact


def reconciled_lines(col: str) -> set[str]:
    """The column's corpus lines, spelled the way the training XML spells
    them (Bekker references unspaced)."""
    f = RECONCILED / f'{col}.txt'
    if not f.exists():
        raise AuditError(f'{f} is missing — {col} is not a reconciled column')
    return {BEKKER_SPACE.sub('', t)
            for t in f.read_text(encoding='utf-8').splitlines()}


def audit_column(col: str, work: Path, evaldir: Path) -> dict:
    """Compare one column's predictions against its training targets."""
    gt_path = work / 'gt' / f'{col}.xml'
    pred_path = evaldir / f'{col}.pred.xml'
    for p in (gt_path, pred_path):
        if not p.exists():
            raise AuditError(
                f'{p} is missing. Predictions come from the model, not from '
                f'this audit — run kraken over the training columns first '
                f'(see work/kraken400/eval-r4-train).')
    gt, pred = read_lines(gt_path), read_lines(pred_path)
    if len(gt) != len(pred):
        raise AuditError(f'{col}: {len(gt)} gt lines vs {len(pred)} predicted')
    by_id = {i: t for i, t in pred}

    corpus = reconciled_lines(col)
    rows, stale = [], []
    identical = 0
    for i, ((gid, g), (_, fallback)) in enumerate(zip(gt, pred), start=1):
        hyp = by_id.get(gid, fallback)
        if g not in corpus:
            # The corpus moved after this tree was staged. The model's target
            # is no longer the corpus text, so a diff against either alone
            # would mislead — surface it as its own tier instead of scoring.
            stale.append((col, gid, str(i), g))
            continue
        if g == hyp:
            identical += 1
            continue
        label, n, compact = classify(align(g, hyp))
        rows.append((label, col, gid, str(i), str(n), compact, g, hyp))
    return {'column': col, 'lines': len(gt), 'identical': identical,
            'rows': rows, 'stale': stale}


def write_tsv(path: Path, header: list[str], rows) -> None:
    """Written even when empty: a header-only file says 'ran, found none',
    where a missing file cannot be told from a run that never looked."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as f:
        f.write('\t'.join(header) + '\n')
        for row in rows:
            f.write('\t'.join(x.replace('\t', ' ') for x in row) + '\n')


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--work', type=Path, default=ROOT / 'work' / 'kraken400')
    p.add_argument('--eval', type=Path,
                   help='directory of <col>.pred.xml (default '
                        '<work>/eval-r4-train)')
    p.add_argument('--cols', help='comma-separated column stems; default: '
                                  'every column in <work>/train.txt')
    p.add_argument('--out', type=Path,
                   help='candidates TSV (default work/audit/gt-audit-train.tsv)')
    a = p.parse_args(argv)

    work = a.work.resolve()
    evaldir = (a.eval or work / 'eval-r4-train').resolve()
    out = a.out or ROOT / 'work' / 'audit' / 'gt-audit-train.tsv'
    cols = (a.cols.split(',') if a.cols else
            (work / 'train.txt').read_text().split())
    if not cols:
        # Header-only output means "ran, found none". Zero columns is "never
        # looked", and the two must not print the same clean report.
        raise AuditError(f'no columns to audit — {work}/train.txt is empty')

    rows, stale = [], []
    lines = identical = 0
    for col in cols:
        r = audit_column(col, work, evaldir)
        lines += r['lines']
        identical += r['identical']
        rows.extend(r['rows'])
        stale.extend(r['stale'])

    rows.sort(key=lambda r: (SEVERITY.index(r[0]), r[1], int(r[3])))
    write_tsv(out, ['class', 'column', 'line_id', 'line_idx', 'edits',
                    'subs', 'gt', 'model'], rows)
    write_tsv(out.with_name(out.stem + '-stale-gt.tsv'),
              ['column', 'line_id', 'line_idx', 'gt'], stale)

    by_class = Counter(r[0] for r in rows)
    print(f'columns audited: {len(cols)}   lines: {lines}')
    print(f'  model agrees with its training target: {identical}')
    print(f'  disagreements → candidates:            {len(rows)}')
    for k in SEVERITY:
        if by_class[k]:
            print(f'    {k:<8} {by_class[k]:>4}')
    print(f'  stale-gt (training XML ≠ reconciled):  {len(stale)}')
    print(f'\n→ {out}')
    print('⚠ every candidate is a question for the ink, not a correction: '
          'the model\n  was trained on the text it is questioning, and the '
          'diplomatic rule holds.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
