"""
Quotation check — does Bonitz's Greek appear where he says it does?

Bonitz quotes Aristotle and gives the Bekker address. We hold the corpus with
line-exact Bekker addressing. So for a citation preceded by running Greek, we
can ask whether those words actually occur at the line cited. One test bears on
the quotation, the siglum, the page AND the line at once, with no model.

  python3 -m bonitz_pipeline.quotecheck --pages 15-51
  python3 -m bonitz_pipeline.quotecheck --pages 15-51 --max-overlap 0.0

WHAT IT CANNOT DO, and why the threshold is a suggestion rather than a verdict:

Bonitz did not quote from our text. He used Bekker; our corpus is TLG following
a critical edition, and where an editor has adjusted the text a mismatch means
the editions differ, not that anything is misread. That is a real limit, not a
tuning problem.

He also does not always quote. Much of the index is analytical — lemma lists
and Latin glosses (`ἀγαθόν dist χρήσιμον sive συμφέρον`) — where there is no
quotation to check and the words legitimately match nothing. The running-text
gate below screens most of that out by requiring a Greek function word, which
running prose has and a word-list does not: it cut the zero-overlap cases from
169 to 95 over pages 15-51 while raising median overlap from 0.67 to 0.75.

Calibrated over pages 15-51: 1,232 citations checkable, mean overlap 0.74,
median 0.80, 86% at or above 0.5, and 3.7% (45) score zero. Only some of those
45 are errors. Treat a low score as a place to look, never as a finding.

EXCLUDED: columns whose line numbering is not contiguous. Those are the
double-recension seams — Physics VII above all — where Bonitz's Bekker and our
TLG text are not the same text at the same address, so any comparison there
measures the edition rather than the transcription.
"""

from __future__ import annotations
import argparse
import collections
import glob
import json
import re
from pathlib import Path

from .batch3 import ROOT, parse_pages
from .normalize import corpus_column
from .lexcheck import CORPUS, WORD_RE, bare, nfc

# A citation: optional siglum, then Bekker page, column letter, line.
CITE_RE = re.compile(r'([Α-Ωα-ω]{0,3}[α-ω]?\s?\d{0,3}\.?\s*)(\d{2,4})\s?([ab])(\d{1,3})')

# Running Greek prose carries these; a list of lemmata does not.
FUNCTION_WORDS = {
    'και', 'το', 'τα', 'των', 'τω', 'τον', 'την', 'της', 'του', 'εν', 'δε',
    'μεν', 'γαρ', 'ει', 'ουκ', 'ου', 'αλλα', 'ως', 'η', 'ο', 'οι', 'τι',
    'τις', 'επι', 'κατα', 'δια', 'προς', 'εστι', 'εστιν', 'ειναι', 'αυτο',
    'τουτο', 'ταυτα', 'περι',
}
WINDOW = range(-2, 4)      # the cited line, two before, three after
MIN_WORDS = 4
# Bonitz cites lemma forms (ἀμαυρός, ἀχλυώδης) where the text has them
# inflected (ἀμαυρότερον, ἀχλυώδη), so exact matching misses real hits: the
# correct citation μβ8. 367a21 scored 0.00 against a line that plainly
# contains ἀμαυρότερον. Match on a stem as well, which lifts median overlap
# from 0.75 to 0.80 and halves the zero-overlap cases.
STEM = 5
_CACHE: tuple[dict, set] | None = None


def expand(w: str) -> str:
    """Ligatures are raw in the transcription; the corpus spells them out."""
    return w.replace('ȣ', 'ου').replace('Ȣ', 'Ου').replace('ϗ', 'και')


def load_corpus() -> tuple[dict[str, dict[int, list[str]]], set[str]]:
    """(column -> line -> bare words, excluded columns)."""
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    cols: dict[str, dict[int, list[str]]] = collections.defaultdict(dict)
    for f in glob.glob(str(CORPUS / '*/book-*.json')):
        try:
            d = json.loads(Path(f).read_text(encoding='utf-8'))
        except Exception:
            continue
        for seg in d.get('segments', []):
            cid = seg.get('id', '').split(':')[-1]
            for g in seg.get('greek', []):
                if isinstance(g.get('n'), int):
                    cols[cid][g['n']] = [bare(t) for t in
                                         WORD_RE.findall(nfc(g.get('text', '')))]
    if not cols:
        raise SystemExit(f'no corpus columns found under {CORPUS}')
    # Non-contiguous numbering marks a double-recension seam, where Bonitz's
    # Bekker and our TLG text are not the same text at the same address.
    excluded = {c for c, lines in cols.items()
                if sorted(lines) != list(range(min(lines), max(lines) + 1))}
    _CACHE = (dict(cols), excluded)
    return _CACHE


def scan(page: int, col: str, index=None) -> list[dict]:
    cols, excluded = index or load_corpus()
    path = corpus_column(page, col, required=False)
    if path is None:
        return []
    if not path.exists():
        return []
    text = nfc(path.read_text(encoding='utf-8'))
    out, prev_end = [], 0
    for m in CITE_RE.finditer(text):
        cid, line = f'{m.group(2)}{m.group(3)}', int(m.group(4))
        span = text[prev_end:m.start()]      # text since the previous citation
        prev_end = m.end()
        if cid in excluded or cid not in cols:
            continue
        words = [bare(expand(w)) for w in WORD_RE.findall(span)]
        if not any(w in FUNCTION_WORDS for w in words):
            continue                          # a lemma list, not a quotation
        quote = [w for w in words if len(w) >= 4][-8:]
        if len(quote) < MIN_WORDS:
            continue
        window: set[str] = set()
        for d in WINDOW:
            window.update(cols[cid].get(line + d, []))
        if not window:
            continue
        stems = {w[:STEM] for w in window if len(w) >= STEM}
        found = [w for w in quote
                 if w in window or (len(w) >= STEM and w[:STEM] in stems)]
        out.append({
            'page': page, 'col': col,
            'line': text.count('\n', 0, m.start()) + 1,
            'cite': m.group(0).strip(), 'column': cid, 'bekker_line': line,
            'overlap': len(found) / len(quote),
            'quote': quote, 'matched': found,
            'context': text.splitlines()[text.count('\n', 0, m.start())].strip()[:120],
        })
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', required=True)
    ap.add_argument('--max-overlap', type=float, default=0.0,
                    help='report citations at or below this overlap (default 0.0)')
    args = ap.parse_args()
    index = load_corpus()
    n = shown = 0
    for p in parse_pages(args.pages):
        for col in ('L', 'R'):
            for r in scan(p, col, index):
                n += 1
                if r['overlap'] <= args.max_overlap:
                    shown += 1
                    print(f"  page-{p:03d}-{col}:{r['line']:<3} {r['cite']:16} "
                          f"overlap {r['overlap']:.2f}  {' '.join(r['quote'][-5:])}")
    print(f'{shown} of {n} checkable citations at or below overlap '
          f'{args.max_overlap} ({len(index[1])} columns excluded as '
          f'double-recension seams)')


if __name__ == '__main__':
    main()
