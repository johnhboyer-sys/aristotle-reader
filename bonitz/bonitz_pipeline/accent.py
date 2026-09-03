"""
Accent check.

Accents were excluded from every earlier check on the assumption that Bonitz
diverges from TLG too freely to be worth testing. That assumption was never
measured, and it was wrong — the same over-caution that discarded breathings.
Measured over pages 15-51: Bonitz agrees with the TLG accentuation on 7,756
of 7,859 comparable wordforms. 1.3% divergence, and the residue is mostly
genuine defects — ἀγαλμα for ἄγαλμα, τεχνήν for τέχνην, ἀγορά for ἀγορᾷ.

Two controls make that number honest, and both are needed here:

GRAVE FOLDS TO ACUTE. Greek writes an acute as a grave before a following
word, so the two alternate by position rather than by lexeme. Comparing them
strictly reports the whole corpus.

ONLY THE FIRST ACCENT COUNTS. An enclitic throws a second accent back onto
its host (ἄβρωτά, χαρίζεσθαί), so a word can legitimately carry two. Keeping
just the first preserves accent POSITION — which is what a misreading gets
wrong — while ignoring a difference that is purely contextual.

Words carrying a raw ligature are skipped: ȣ takes its own accent, and
expanding it to ου moves or loses that accent, which manufactures divergence.

  python3 -m bonitz_pipeline.accent --pages 15-51
"""

from __future__ import annotations
import argparse
import collections
import glob
import json
import re
import unicodedata
from pathlib import Path

from .batch3 import ROOT, parse_pages
from .lexcheck import CORPUS, bare, nfc

ACUTE, GRAVE, CIRC = '́', '̀', '͂'
ACCENTS = (ACUTE, GRAVE, CIRC)
from .lexcheck import WORD_RE  # combining marks are word chars
from .normalize import corpus_column, corpus_columns


def accent_key(w: str) -> str:
    """Breathing dropped, accents kept: grave folded, first accent only."""
    out, seen = [], False
    for c in unicodedata.normalize('NFD', w.lower()):
        if not unicodedata.combining(c):
            out.append(c)
        elif c in ACCENTS:
            if seen:
                continue                      # enclitic's second accent
            seen = True
            out.append(CIRC if c == CIRC else ACUTE)
    return ''.join(out)


_CACHE: dict[str, set[str]] | None = None


def load_index() -> dict[str, set[str]]:
    """bare form -> the accent patterns the corpus attests for it."""
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    idx: dict[str, set[str]] = collections.defaultdict(set)
    for f in glob.glob(str(CORPUS / '*/book-*.json')):
        try:
            d = json.loads(Path(f).read_text(encoding='utf-8'))
        except Exception:
            continue
        for seg in d.get('segments', []):
            for g in seg.get('greek', []):
                for tk in g.get('tokens', []):
                    t = tk.get('t')
                    if t:
                        idx[bare(t)].add(accent_key(nfc(t)))
    if not idx:
        raise SystemExit(f'no corpus wordforms found under {CORPUS}')
    _CACHE = idx
    return idx


def attested(word: str, index=None) -> set[str]:
    return (index or load_index()).get(bare(word), set())


def check(word: str, index=None) -> dict | None:
    """None when the corpus has no single opinion about this word."""
    if 'ȣ' in word or 'Ȣ' in word or 'ϗ' in word:
        return None
    b = bare(word)
    if len(b) < 4:
        return None
    pats = attested(word, index)
    if len(pats) != 1:
        return None                            # unattested, or genuinely varies
    want = next(iter(pats))
    got = accent_key(word)
    if got == want:
        return None
    return {'wrote': word, 'printed': got, 'expected': want}


def scan(page: int, col: str, index=None) -> list[dict]:
    # ⚠ EVERY CORPUS STAGE. Reading work/reconciled alone makes this
    # silently skip pages 53-62, which are settled but not yet promoted
    # and live in reconciled-auto — and a sweep that skips a page reports
    # it clean.
    path = corpus_column(page, col, required=False)
    if path is None:
        return []
    lines = nfc(path.read_text(encoding='utf-8')).splitlines()
    out = []
    for i, line in enumerate(lines):
        text = line
        if line.endswith('-') and i + 1 < len(lines):
            text = line[:-1] + lines[i + 1].lstrip()
        for m in WORD_RE.finditer(text):
            if i and lines[i - 1].endswith('-') and m.start() == 0:
                continue
            r = check(m.group(), index)
            if r:
                out.append({'page': page, 'col': col, 'line': i + 1,
                            'context': line.strip()[:150], **r})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', required=True)
    args = ap.parse_args()
    index = load_index()
    n = 0
    for p in parse_pages(args.pages):
        for col in ('L', 'R'):
            for r in scan(p, col, index):
                n += 1
                print(f"  page-{p:03d}-{col}:{r['line']:<3} {r['wrote']:18} "
                      f"-> {unicodedata.normalize('NFC', r['expected'])}")
    print(f'{n} words whose accent contradicts the corpus')


if __name__ == '__main__':
    main()
