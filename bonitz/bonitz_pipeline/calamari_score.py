"""Score a second engine's holdout predictions on kraken's own terms.

    python3 -m bonitz_pipeline.calamari_score --work work/kraken400 \
        --pred work/calamari/run1-96px-holdout_predictions.tsv \
        --against work/kraken400/eval-r4-best

A model trained elsewhere reports whatever its own harness reports, and two
harnesses agreeing on a CER is not the same as two engines being comparable.
Everything measured here comes from `kraken_eval` — the same `align`, the same
CLASSES, the same PROBES — so a row in this table means exactly what the same
row means in kraken's, and the only difference is the engine.

⚠ WHAT THE PREDICTIONS ARE KEYED BY. `calamari_export` dumps the holdout as
`00000.png … 00721.png` in the order the lines sit in `holdout.arrow`, and the
notebook returns `<index>\\tprediction`. That index is the ONLY link back to the
ground truth, and it is positional — so the mapping is rebuilt here from the
gt XML and checked against the arrow text line by line. A mismatch raises. An
index whose ground truth is not what the export shipped would score a real
model against the wrong line and report the result as fact.

`--against` diffs the two engines line by line and writes every disagreement.
That file is the reason to run a second engine at all: a case where two engines
built on different data, in different frameworks, read the same ink differently
is evidence, and one engine's confidence is not.
"""

from __future__ import annotations

import argparse
import sys
import unicodedata
from collections import Counter
from pathlib import Path

from bonitz_pipeline import kraken_corpus as kc
from bonitz_pipeline.kraken_eval import (BEKKER, CLASSES, PROBES, align,
                                         probe_report, read_lines)

LIGATURE = 'ȣ'
MARKS = [('̓', 'smooth'), ('̔', 'rough'), ('́', 'acute'), ('̀', 'grave'),
         ('͂', 'perispomeni')]


class ScoreError(Exception):
    """The predictions cannot be matched to the ground truth."""


def holdout_lines(work: Path) -> list[tuple[str, str, str]]:
    """[(export index, `column:line id`, ground truth)] in export order.

    Rebuilt from the gt XML in `holdout.txt` order — the order `stage_compile`
    passed to ketos — and then proved against the arrow the export was dumped
    from. Proving it is the point: the index is positional, so an unnoticed
    reordering would silently score every line against its neighbour.
    """
    kc.WORK = work
    cols = (work / 'holdout.txt').read_text().split()
    out = []
    for col in cols:
        for lid, text in read_lines(work / 'gt' / f'{col}.xml'):
            out.append((f'{len(out):05d}', f'{col}:{lid}', text))
    arrow = [r for r in _arrow_texts(work / 'holdout.arrow')]
    if len(arrow) != len(out):
        raise ScoreError(f'holdout.arrow holds {len(arrow)} lines, the gt XML '
                         f'of {len(cols)} columns holds {len(out)}')
    bad = [(i, a, b) for i, ((_, _, b), a) in enumerate(zip(out, arrow))
           if a != b]
    if bad:
        i, a, b = bad[0]
        raise ScoreError(
            f'{len(bad)} line(s) differ between holdout.arrow and the gt XML — '
            f'the export index does not address the ground truth. First at '
            f'{i}: arrow {a[:40]!r} vs xml {b[:40]!r}')
    return out


def _arrow_texts(path: Path) -> list[str]:
    import pyarrow as pa
    import pyarrow.ipc as ipc
    with pa.memory_map(str(path), 'rb') as src:
        try:
            table = ipc.open_file(src).read_all()
        except pa.ArrowInvalid:
            src.seek(0)
            table = ipc.open_stream(src).read_all()
    return [r['text'] for r in table.column('lines').to_pylist()]


def read_predictions(path: Path, want: set[str]) -> dict[str, str]:
    """`<index>\\t<prediction>` — every wanted index present, or it raises.

    A missing line is not scored as an empty string. That would read as a
    catastrophic error rather than as a gap in the run, and the CER would be
    wrong in the direction that flatters nobody.
    """
    preds: dict[str, str] = {}
    for n, raw in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        if not raw.strip():
            continue
        idx, _, text = raw.partition('\t')
        idx = idx.strip()
        if not idx:
            raise ScoreError(f'{path}:{n}: no index before the tab')
        if idx in preds:
            raise ScoreError(f'{path}:{n}: index {idx} appears twice')
        preds[idx] = unicodedata.normalize('NFC', text)
    missing = sorted(want - set(preds))
    extra = sorted(set(preds) - want)
    if missing or extra:
        raise ScoreError(
            f'{len(preds)} predictions against {len(want)} holdout lines'
            + (f'; no prediction for {missing[:5]}{"…" if len(missing) > 5 else ""}'
               if missing else '')
            + (f'; unknown index {extra[:5]}{"…" if len(extra) > 5 else ""}'
               if extra else ''))
    return preds


def kraken_predictions(evaldir: Path, work: Path) -> dict[str, str]:
    """The same lines as kraken read them, keyed by export index.

    NFC, like the other engine's predictions: the XML is whatever kraken
    emitted, and a decomposed respelling of the same ink must not read as a
    disagreement — or hide an agreement — against an NFC ground truth."""
    out: dict[str, str] = {}
    for col in (work / 'holdout.txt').read_text().split():
        for lid, text in read_lines(evaldir / f'{col}.pred.xml'):
            out[f'{col}:{lid}'] = unicodedata.normalize('NFC', text)
    return out


def score(lines, preds) -> dict:
    edits = chars = 0
    sub, cls_total, cls_hit = Counter(), Counter(), Counter()
    probe_total, probe_hit, probe_miss = Counter(), Counter(), Counter()
    lig_total, lig_hit = Counter(), Counter()
    per_line = []

    for idx, site, gt in lines:
        hyp = preds[idx]
        pairs = align(gt, hyp)
        n = 0
        base = ''
        for x, y in pairs:
            if x is not None:
                cls_total[x] += 1
                if x == y:
                    cls_hit[x] += 1
                if not unicodedata.combining(x):
                    base = x
                elif base == LIGATURE:
                    lig_total[x] += 1
                    lig_hit[x] += (x == y)
            if x != y:
                sub[(x, y)] += 1
                n += 1
        for label, target, got in probe_report(gt, pairs):
            probe_total[label] += 1
            if got == target:
                probe_hit[label] += 1
            else:
                probe_miss[(label, target, got)] += 1
        edits += n
        chars += len(gt)
        per_line.append((idx, site, n, gt, hyp))

    return {'edits': edits, 'chars': chars, 'sub': sub, 'cls_total': cls_total,
            'cls_hit': cls_hit, 'probe_total': probe_total,
            'probe_hit': probe_hit, 'probe_miss': probe_miss,
            'lig_total': lig_total, 'lig_hit': lig_hit, 'per_line': per_line}


def report(r: dict, label: str) -> None:
    edits, chars, sub = r['edits'], r['chars'], r['sub']
    space = sum(n for (x, y), n in sub.items()
                if (x or ' ').isspace() and (y or ' ').isspace())
    print(f'\n{label}')
    print(f'  lines: {len(r["per_line"])}   chars: {chars}')
    print(f'  OVERALL CER: {edits / chars:.4%}  ({edits} edits)')
    print(f'    ignoring spacing: {(edits - space) / chars:.4%}  '
          f'({space} whitespace-only)')

    print('\n  per class recall:')
    for name, ch in CLASSES:
        t = r['cls_total'][ch]
        if t:
            print(f'    {name:<24} {r["cls_hit"][ch]:>5}/{t:<5} '
                  f'{r["cls_hit"][ch] / t:7.2%}')
    d = sum(r['cls_total'][c] for c in '0123456789')
    dh = sum(r['cls_hit'][c] for c in '0123456789')
    if d:
        print(f'    {"digits (Bekker refs)":<24} {dh:>5}/{d:<5} {dh / d:7.2%}')

    print('\n  sequences this project has lost before:')
    for name, _ in PROBES + [('Bekker column letter', '')]:
        t = r['probe_total'][name]
        if t:
            print(f'    {name:<28} {r["probe_hit"][name]:>4}/{t:<4} '
                  f'{r["probe_hit"][name] / t:7.2%}')

    # ⚠ In NFC every mark over an ordinary vowel composes to one codepoint, so
    # the only COMBINING marks in this corpus are the ones over `ȣ`, which has
    # no precomposed form. The per-class rows above are therefore a measure of
    # one character, and this is that measure stated plainly.
    print('\n  marks over the ou-ligature (which is every combining mark here):')
    T = H = 0
    for ch, name in MARKS:
        t, h = r['lig_total'][ch], r['lig_hit'][ch]
        T += t; H += h
        if t:
            print(f'    {name:<24} {h:>5}/{t:<5} {h / t:7.2%}')
    if T:
        print(f'    {"ALL":<24} {H:>5}/{T:<5} {H / T:7.2%}')


def vote(folds: list[dict[str, str]]) -> tuple[dict[str, str], Counter]:
    """One reading per line from an N-fold ensemble, by plurality.

    ⚠ THIS IS A LINE VOTE, NOT CALAMARI'S CHARACTER VOTE, AND THE DIFFERENCE
    BOUNDS WHAT THE NUMBER MEANS. Calamari's own confidence voting works
    character by character from each fold's posteriors, which no
    `<index>\\ttext` dump carries; all this can see is N finished strings. A
    line vote can therefore only choose among readings some fold actually
    produced — it can never assemble a better line out of parts, which
    character voting can. So this scores the ensemble at its FLOOR, and an
    ensemble that beats the single fold here beats it outright.

    The tie rule, for the 2-2-1 splits a five-fold ensemble will certainly
    produce: prefer the candidate that disagrees least with the whole set —
    the reading nearest the middle of the folds by total edit distance — and
    break what remains lexicographically, so the run is deterministic. Every
    tie is COUNTED, because a vote that quietly coin-flips its hardest lines
    reports a confidence it has not got.
    """
    if not folds:
        raise ScoreError('no folds to vote on — an ensemble of nothing is not '
                         'a clean ensemble, it is an empty one')
    keys = set(folds[0])
    for i, f in enumerate(folds[1:], 2):
        if set(f) != keys:
            raise ScoreError(
                f'fold {i} covers {len(f)} lines against fold 1\'s '
                f'{len(keys)} — the folds must read the same holdout, or the '
                f'vote is taken over two different books')
    out: dict[str, str] = {}
    stats = Counter({'folds': len(folds)})
    for idx in sorted(keys):
        readings = [f[idx] for f in folds]
        tally = Counter(readings)
        top = max(tally.values())
        best = sorted(t for t, n in tally.items() if n == top)
        if len(tally) == 1:
            stats['unanimous'] += 1
        elif len(best) == 1:
            stats['majority'] += 1
        else:
            stats['tie'] += 1
            best = [min(best, key=lambda c: (
                sum(_distance(c, r) for r in readings), c))]
        out[idx] = best[0]
    return out, stats


def _distance(a: str, b: str) -> int:
    return sum(1 for x, y in align(a, b) if x != y)


def compare(lines, a_preds, b_preds) -> dict:
    """Line-by-line comparison of two engines against the ground truth.

    Two kinds of line come out, and they serve different purposes:

      * `rows` — the engines disagree. The reason to run a second engine.
      * `agree_wrong` — the engines read the line IDENTICALLY and the ground
        truth differs. No panel of readers can surface these (agreement is
        what a panel trusts), so they are the audit's candidates for an
        overlooked ground-truth error — or for ink both engines fail on the
        same way. Only the ink can tell those apart, so every one goes to
        John, and none is applied from here.
    """
    both = agree_right = 0
    rows, agree_wrong = [], []
    for idx, site, gt in lines:
        A, B = a_preds[idx], b_preds[idx]
        if A == B:
            both += 1
            if A == gt:
                agree_right += 1
            else:
                agree_wrong.append((site, gt, A))
            continue
        rows.append((site, 'A' if A == gt else ('B' if B == gt else '—'),
                     gt, A, B))
    return {'both': both, 'agree_right': agree_right,
            'agree_wrong': agree_wrong, 'rows': rows}


def write_tsv(path: Path, header: list[str], rows) -> None:
    """Written even when empty: a header-only file says 'ran, found none',
    where a missing file cannot be told from a run that never looked."""
    with path.open('w', encoding='utf-8') as f:
        f.write('\t'.join(header) + '\n')
        for row in rows:
            f.write('\t'.join(x.replace('\t', ' ') for x in row) + '\n')


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--work', type=Path, required=True)
    p.add_argument('--pred', type=Path,
                   help='<index>\\t<prediction>, one line per holdout line')
    p.add_argument('--fold', type=Path, action='append', default=[],
                   help='one fold of an ensemble, same format as --pred; '
                        'repeat it. The folds are scored individually and '
                        'then voted, so the ensemble is measured against its '
                        'own members and not only against kraken')
    p.add_argument('--label', default='')
    p.add_argument('--against', type=Path,
                   help="a kraken eval dir (*.pred.xml) to diff against")
    p.add_argument('--out', type=Path,
                   help='where to write the line-by-line disagreements')
    a = p.parse_args(argv)

    if bool(a.pred) == bool(a.fold):
        raise ScoreError('give either --pred (one run) or --fold (repeated, '
                         'an ensemble) — not both and not neither')

    lines = holdout_lines(a.work.resolve())
    want = {i for i, _, _ in lines}
    if a.fold:
        # ⚠ EVERY FOLD IS SCORED BEFORE THE VOTE. An ensemble that beats
        # kraken while its own best member beats the ensemble is a fact about
        # the vote, not about the models, and it can only be seen by
        # reporting both.
        folds = [read_predictions(f, want) for f in a.fold]
        for f, fp in zip(a.fold, folds):
            report(score(lines, fp), f'fold — {f.name}')
        preds, stats = vote(folds)
        n = stats['unanimous'] + stats['majority'] + stats['tie']
        print(f'\n{stats["folds"]} folds voted over {n} lines: '
              f'{stats["unanimous"]} unanimous, {stats["majority"]} by '
              f'majority, {stats["tie"]} tied')
        print('  ⚠ a LINE vote, not Calamari\'s character vote: it can only '
              'choose among\n    readings a fold produced, so this is the '
              'ensemble\'s floor.')
        a.pred = a.fold[0]                 # where the output files go
    else:
        preds = read_predictions(a.pred, want)
    r = score(lines, preds)
    report(r, a.label or ('ensemble vote' if a.fold else a.pred.name))

    if not a.against:
        return 0

    kr = kraken_predictions(a.against.resolve(), a.work.resolve())
    missing = [s for _, s, _ in lines if s not in kr]
    if missing:
        raise ScoreError(f'{len(missing)} holdout line(s) have no kraken '
                         f'prediction in {a.against}: {missing[:3]}')
    kr_by_idx = {i: kr[s] for i, s, _ in lines}
    rk = score(lines, kr_by_idx)
    report(rk, f'kraken — {a.against.name}')

    cmp = compare(lines, preds, kr_by_idx)
    rows = cmp['rows']

    print(f'\nthe two engines, line by line ({len(lines)} lines):')
    print(f'  identical readings:      {cmp["both"]:>4}  '
          f'({cmp["agree_right"]} match the ground truth, '
          f'{len(cmp["agree_wrong"])} do not)')
    print(f'  they disagree:           {len(rows):>4}')
    won = Counter(w for _, w, _, _, _ in rows)
    print(f'    of those — this engine right: {won["A"]}, '
          f'kraken right: {won["B"]}, neither: {won["—"]}')
    print('\n  ⚠ AGREEMENT IS NOT ACCURACY. The lines both engines read the '
          'same way\n    include the ones they get wrong together, and those '
          'are invisible\n    to any panel: only the ink settles them.')

    out = a.out or a.pred.with_name(a.pred.stem + '-vs-kraken.tsv')
    write_tsv(out, ['site', 'right', 'ground_truth', 'this_engine', 'kraken'],
              rows)
    print(f'\n  {len(rows)} disagreement(s) → {out}')

    aw = out.with_name(out.stem + '-agree-wrong.tsv')
    write_tsv(aw, ['site', 'ground_truth', 'both_engines'],
              cmp['agree_wrong'])
    print(f'  {len(cmp["agree_wrong"])} identical-but-wrong line(s) → {aw}\n'
          f'    the ground-truth audit candidates: two engines reading the '
          f'same ink\n    the same way against the corpus. For John, '
          f'against the ink — never applied.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
