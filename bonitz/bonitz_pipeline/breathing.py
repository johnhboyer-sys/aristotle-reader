"""
Breathing check — rough printed as smooth, and breathings dropped entirely.

lexcheck strips every diacritic before asking the lexicon anything, because
Bonitz's ACCENTUATION diverges from TLG often enough that exact matching
loses real words. Breathing is different in kind: it is lexical, not
editorial. ἁλουργής is rough because it comes from ἅλς, and no editor is
free to print it otherwise. Keeping breathing while still dropping accents
recovers a signal the ligature test throws away.

  python3 -m bonitz_pipeline.breathing --pages 15-51
  python3 -m bonitz_pipeline.breathing --pages 15-51 --strong

Evidence strength matters here more than in lexcheck, because the two
witnesses can genuinely disagree:

  STRONG  the corpus AND LSJ both attest the word, and both give the same
          breathing, which is not the one printed.
  WEAK    only one of the two vouches for it.

ἀλκυών is the cautionary case: LSJ prints it smooth, the TLG text prints it
rough. Both traditions are real, so a check that simply preferred TLG would
"correct" Bonitz into a convention he never used — the same failure as
rewriting the lectional variants he deliberately records (ἀβελτηρίας against
Bekker's ἀβελτερίας). Hence: speak only when a source is internally
unanimous, and never merge strong with weak.
"""

from __future__ import annotations
import argparse
import collections
import glob
import json
import re
import unicodedata
from pathlib import Path

from .lexcheck import CORPUS, LSJ, ROOT, bare, nfc, parse_pages

SMOOTH, ROUGH = '̓', '̔'
from .lexcheck import WORD_RE  # combining marks are word chars
# a breathing sits on an initial vowel or rho; the ou-ligature is excluded
# deliberately — in this font it routinely takes an accent with no breathing
# at all, so its bare form proves nothing about what the printer intended
BREATHABLE = set('αεηιουωρ')


def breath_key(w: str) -> str:
    """Accents stripped, breathing kept."""
    d = unicodedata.normalize('NFD', w.lower())
    return ''.join(c for c in d
                   if not unicodedata.combining(c) or c in (SMOOTH, ROUGH))


def _index() -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    corpus: dict[str, set[str]] = collections.defaultdict(set)
    lsj: dict[str, set[str]] = collections.defaultdict(set)
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
                        corpus[bare(t)].add(breath_key(nfc(t)))
    for f in glob.glob(str(LSJ / '*.json')):
        try:
            d = json.loads(Path(f).read_text(encoding='utf-8'))
        except Exception:
            continue
        for e in (d.values() if isinstance(d, dict) else []):
            h = e.get('head') if isinstance(e, dict) else None
            if h:
                lsj[bare(h)].add(breath_key(nfc(h)))
    if not corpus:
        raise SystemExit(f'no corpus wordforms found under {CORPUS}')
    return corpus, lsj


_CACHE: tuple[dict[str, set[str]], dict[str, set[str]]] | None = None


def load_index():
    global _CACHE
    if _CACHE is None:
        _CACHE = _index()
    return _CACHE


def expand(w: str) -> str:
    """Ligatures are kept raw in the text; the lexicon spells them out."""
    return (w.replace('ȣ', 'ου').replace('Ȣ', 'Ου')
             .replace('ϗ', 'και').replace('Ϗ', 'Και'))


def check(word: str, index=None) -> dict | None:
    """None when the lexicon has no clear opinion."""
    corpus, lsj = index or load_index()
    # test the ligature BEFORE expanding: a word that starts with it carries
    # no usable breathing, but its expansion would start with a plain omicron
    first = unicodedata.normalize('NFD', word.lower())[:1]
    if not first or first[0] not in BREATHABLE:
        return None
    spelled = expand(word)
    b = bare(spelled)
    if len(b) < 3:
        return None
    c, l = corpus.get(b, set()), lsj.get(b, set())
    both = c | l
    # silence unless every witness agrees with itself and with the other
    if len(both) != 1:
        return None
    expected = next(iter(both))
    printed = breath_key(nfc(spelled))
    if printed == expected:
        return None
    return {'wrote': word, 'printed': printed, 'expected': expected,
            'strength': 'strong' if (c and l) else 'weak'}


def scan(page: int, col: str, index=None) -> list[dict]:
    path = ROOT / f'work/reconciled/page-{page:03d}-{col}.txt'
    if not path.exists():
        return []
    lines = nfc(path.read_text(encoding='utf-8')).splitlines()
    out = []
    for i, line in enumerate(lines):
        # a word broken by the printed line end is only half a word: heal it
        # from the next line, but attribute it to the line it starts on
        text = line
        if line.endswith('-') and i + 1 < len(lines):
            text = line[:-1] + lines[i + 1].lstrip()
        for m in WORD_RE.finditer(text):
            # the healed tail belongs to this line; the next line's own scan
            # must not judge that fragment again
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
    ap.add_argument('--strong', action='store_true',
                    help='only where corpus and LSJ agree')
    args = ap.parse_args()
    index = load_index()
    counts = collections.Counter()
    for p in parse_pages(args.pages):
        for col in ('L', 'R'):
            for r in scan(p, col, index):
                if args.strong and r['strength'] != 'strong':
                    continue
                counts[r['strength']] += 1
                print(f"  page-{p:03d}-{col}:{r['line']:<3} {r['wrote']:16} "
                      f"{r['printed']} -> {r['expected']}  [{r['strength']}]")
    print(f"{counts['strong']} strong, {counts['weak']} weak")


if __name__ == '__main__':
    main()
