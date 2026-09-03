"""
Entry-family consistency.

ἁλιεύς and ἁλιεῖς cannot disagree about their breathing. Once a headword is
settled, its own inflections are not separate judgments — but the breathing
check treats each word alone, and single-witness forms stay WEAK and silent,
so an entry can end up internally incoherent: ἁλιεύς rough on one line with
ἀλιεῖς smooth three words later. That is exactly what happened on 44-R, where
sixteen forms of the same ἅλς root sat smooth around corrected headwords.

This check needs no lexicon. It asks only whether an entry agrees with
itself, which converts weak single-witness findings into strong ones by
inheritance — the same reasoning John used when ruling the family by hand.

  python3 -m bonitz_pipeline.family --pages 15-51
"""

from __future__ import annotations
import argparse
import re
import unicodedata

from .alphacheck import reconciled_headwords
from .batch3 import ROOT, parse_pages
from .normalize import corpus_column, corpus_columns
from .lexcheck import bare, nfc

SMOOTH, ROUGH = '̓', '̔'
from .lexcheck import WORD_RE  # combining marks are word chars
STEM_LEN = 4


def expand(w: str) -> str:
    return w.replace('ȣ', 'ου').replace('Ȣ', 'Ου')


def breathing_of(word: str) -> str | None:
    """The breathing on the first vowel, or None if the word carries none."""
    d = unicodedata.normalize('NFD', word)
    for c in d[1:3]:
        if c in (SMOOTH, ROUGH):
            return c
    return None


def scan(page: int, col: str) -> list[dict]:
    path = corpus_column(page, col, required=False)
    if path is None:
        return []
    lines = nfc(path.read_text(encoding='utf-8')).splitlines()
    heads = [(w, ln) for (w, c, ln) in reconciled_headwords(page) if c == col]
    if not heads:
        return []

    out = []
    for k, (head, start) in enumerate(heads):
        end = heads[k + 1][1] - 1 if k + 1 < len(heads) else len(lines)
        stem = bare(expand(head))[:STEM_LEN]
        if len(stem) < STEM_LEN:
            continue
        # Collect the whole family first. The headword is NOT the authority:
        # on 49-L the headword ἀμαρτάνειν is smooth and thirteen of its own
        # inflections are rough, and the thirteen are right. Let the family
        # vote, and keep the headword only as a tie-break.
        family = []
        for i in range(start - 1, min(end, len(lines))):
            for m in WORD_RE.finditer(lines[i]):
                w = m.group()
                if not bare(expand(w)).startswith(stem):
                    continue
                b = breathing_of(w)
                if b is not None:
                    family.append((w, i + 1, b))
        if len(family) < 3:
            continue
        rough = sum(1 for _, _, b in family if b == ROUGH)
        smooth = len(family) - rough
        if rough == smooth:
            majority = breathing_of(head)
        else:
            majority = ROUGH if rough > smooth else SMOOTH
        if majority is None:
            continue
        for w, ln, b in family:
            if b != majority:
                out.append({
                    'page': page, 'col': col, 'line': ln,
                    'headword': head, 'head_line': start, 'word': w,
                    'expected': 'rough' if majority == ROUGH else 'smooth',
                    'agree': max(rough, smooth), 'differ': min(rough, smooth),
                    'context': lines[ln - 1].strip()[:110],
                })
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', required=True)
    args = ap.parse_args()
    pages = parse_pages(args.pages)
    # ⚠ A PAGE IN NO CORPUS STAGE IS NOT A CLEAN PAGE. `scan` looks up
    # its column with required=False and answers [] when there is none,
    # so asking for a page that was never transcribed printed a zero and
    # looked exactly like a page with no defects. This is the residue of
    # the 2026-08-10 five-gate fix: they can SEE reconciled-auto now, but
    # total absence still read as cleanliness. Validate the REQUEST here,
    # once, where the user says which pages they mean.
    corpus_columns(pages)
    n = 0
    for p in pages:
        for col in ('L', 'R'):
            for r in scan(p, col):
                n += 1
                print(f"  page-{p:03d}-{col}:{r['line']:<3} {r['word']:16} "
                      f"is the odd one out in the {r['headword']} entry "
                      f"({r['agree']} vs {r['differ']}) — expected {r['expected']}")
    print(f'{n} words disagreeing with their own headword')


if __name__ == '__main__':
    main()
