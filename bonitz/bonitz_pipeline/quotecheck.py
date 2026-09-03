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

The function-word gate tests the whole span, so it misses one case: a span
whose earlier words are Greek but whose tail — the words actually scored — is
Bonitz's own Latin prose (`sed Anaxagorea verba paullum ab …`). Latin can
never occur at a Bekker line of Greek, so scoring it manufactures a
zero-overlap finding about text nobody quoted. The first cut at this — skip
any tail at least half Latin — was over-broad: `veluti`, `dist`, `codd` and
whole Latin parentheticals clear the four-letter floor, and two of them in a
four-word tail tipped the gate on genuine quotations. `τὸ ἀνάλογον ἐναλλάξ
(de proportionibus convertendis)` matches its cited line perfectly and was
coming back unjudged; 20 of the 27 spans the first cut skipped on 15-52
match at 0.5 or better on their Greek words alone.

So a Latin-dominated tail is judged on its GREEK words only, and the record
says so (`greek_only: True`) because the denominator is thinner — sometimes
two words. Only when even that leaves too little Greek (fewer than
MIN_GREEK words) is the span NOT JUDGED: it comes back marked
`skipped: latin`, and the CLI prints and counts both states, because in this
project a span silently dropped is indistinguishable from a span found
clean. Three states: judged, judged-on-Greek-alone, did-not-judge. Script is
decided by Greek-block characters, not ASCII, so a Latin word wearing æ or ß
still counts as Latin.

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
from .normalize import corpus_column, corpus_columns
from .lexcheck import CORPUS, WORD_RE, bare, nfc

# A citation: optional siglum, then Bekker page, column letter, line.
#
# ⚠ THE PERIOD AFTER THE BOOK NUMBER IS LOAD-BEARING. `\d{0,3}\.?` made that
# separator optional, so in `οβ1347a9` — Oeconomica β, no space before the
# Bekker page — the siglum group ate `13` and the citation resolved to column
# 47a. Bonitz's quotation was then scored against a line of the Organon, came
# back at zero overlap, and read as HIS error rather than ours. Requiring the
# period forces the Bekker number to take every digit that belongs to it.
CITE_RE = re.compile(
    r'([Α-Ωα-ω]{0,3}[α-ω]?\s?(?:\d{1,3}[.,]\s*)?)(\d{2,4})\s?([ab])(\d{1,3})')

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


# Greek letters and their polytonic forms. Script is decided by what a word
# CONTAINS, not by ASCII: `præterea` is Latin even though æ is not ASCII.
GREEK_CHAR = re.compile(r'[Ͱ-Ͽἀ-῿]')
# A Latin-dominated tail is judged on its Greek words alone; below this many
# Greek words there is nothing left to judge and the span is skipped, marked.
MIN_GREEK = 2


def is_greek(w: str) -> bool:
    return bool(GREEK_CHAR.search(w))


def latin_dominated(quote: list[str]) -> bool:
    """Is this quote tail at least half Bonitz's own Latin voice?

    Half or more Latin means the tail is commentary syntax with Greek
    embedded, so the Latin words must leave the denominator: they can never
    occur at a Bekker line of Greek, and scoring them manufactures misses.
    """
    return 2 * sum(1 for w in quote if not is_greek(w)) >= len(quote)


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
    # ⚠ CONTIGUITY IS NOT COMPLETENESS. A column truncated at its tail is
    # contiguous and slips the test above — our 247b stops at line 19 and
    # passed, which is how Φη3. 247b21 fired as a zero-overlap finding. The
    # Physics VII seam is therefore excluded BY NAME. Bonitz (1870) cites
    # Bekker's 1831 edition, which prints BOTH recensions of Physics VII;
    # our reference text carries one. Ross, 56 years after the Index,
    # documents the mapping in his apparatus — "247b1-248a9 = 247a28-248b28"
    # — and prints no 247b21 in his edited text at all (John checked his
    # Ross, 2026-08-11). So a citation into the seam names a line of an
    # edition we do not hold: "did not judge, recension seam" — never a
    # manufactured zero against a text Bonitz was not citing.
    excluded |= {c for c in cols if c[:-1].isdigit() and (
        242 <= int(c[:-1]) <= 248 or (int(c[:-1]) == 241 and c[-1] == 'b'))}
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
        greek_only = False
        if latin_dominated(quote):
            greek = [w for w in quote if is_greek(w)]
            if len(greek) < MIN_GREEK:
                # Did-not-judge is a reported state, never a silent one. No
                # 'overlap' key on purpose: a consumer that forgets to check
                # 'skipped' gets a KeyError, not a number.
                out.append({
                    'page': page, 'col': col,
                    'line': text.count('\n', 0, m.start()) + 1,
                    'cite': m.group(0).strip(), 'column': cid,
                    'bekker_line': line, 'skipped': 'latin', 'quote': quote,
                    'context': text.splitlines()[text.count('\n', 0, m.start())].strip()[:120],
                })
                continue
            # Judge Aristotle's words, not Bonitz's — and say the
            # denominator shrank.
            quote, greek_only = greek, True
        window: set[str] = set()
        for d in WINDOW:
            window.update(cols[cid].get(line + d, []))
        if not window:
            continue
        stems = {w[:STEM] for w in window if len(w) >= STEM}
        found = [w for w in quote
                 if w in window or (len(w) >= STEM and w[:STEM] in stems)]
        rec = {
            'page': page, 'col': col,
            'line': text.count('\n', 0, m.start()) + 1,
            'cite': m.group(0).strip(), 'column': cid, 'bekker_line': line,
            'overlap': len(found) / len(quote),
            'greek_only': greek_only,
            'quote': quote, 'matched': found,
            'context': text.splitlines()[text.count('\n', 0, m.start())].strip()[:120],
        }
        why = ADJUDICATED.get((cid, line))
        if why:
            rec['adjudicated'] = why
        out.append(rec)
    return out


# John's rulings on zero-overlap findings, 2026-08-11, from the promotion-gate
# dossier (docs/promotion-gate-53-62.md). Each is a HUMAN verdict that the
# finding is benign — the span was never a quotation — so the record stays,
# labelled, and the CLI does not present it as work. A ruling names the cited
# line, not the Bonitz page, so it holds wherever the entry is re-read.
ADJUDICATED = {
    ('685a', 18):  ('printed citation error, kept as printed: the quoted '
                    'clause is verbatim at PA 685b14-15; John read the ink '
                    '(raised a) and the corrigendum is banked'),
    ('1332b', 32): ('printed citation error, kept as printed: both halves '
                    'verbatim at Pol. 1333a32-33/36 with line numbers '
                    'preserved; ink read (1332 b32, a36); corrigendum banked'),
    ('33a', 12):   ('printed citation error, kept as printed: verbatim at '
                    'An.Pr. 33b12; ink read (raised a); corrigendum banked'),
    ('1062b', 11): ('list of objects under ἀναιρεῖν, "sim" = similiter; each '
                    'of the eighteen citations vouches for its own item, and '
                    '1062b11 carries its head item τὸ διαλέγεσθαι verbatim'),
    ('1007b', 25): ('both citations right: the quoted words sit verbatim at '
                    'the very next citation 1009a27, and 1007b25 carries the '
                    'inference the Latin sentence attributes to it'),
    ('402b', 21):  ('not a quotation: αἰτιατ- occurs nowhere in the de Anima; '
                    'the span is Bonitz\'s Latin point about ordo'),
    # John's benign rulings of 2026-08-21, from the citation sitting
    # (work/sweeps/citation-rulings-63-102.json). Same contract as above:
    # each is a HUMAN verdict that the span was never a quotation to test,
    # keyed by the cited line so it holds wherever the entry is re-read.
    ('1229a', 11): ('analytic summary of EE III.1\'s five kinds of courage; '
                    'the passage head (~a12) is inside the window and the '
                    'summary\'s words scatter over a14-31 as summaries do'),
    ('531b', 23):  ('span-assignment artifact: the words before the citation '
                    'gloss the NEXT line\'s citations (ι38. 622b21. 40. '
                    '623b10), where the bee-genera list sits; 531b23 itself '
                    'carries μελίττῃ/ἀνθρήνῃ/σφηκί — sound'),
    ('689b', 25):  ('question-form summary (διὰ τί τὰ ἄλλα ζῷα ȣ̓κ ἐνδέχεται '
                    'εἶναι ὀρθά); b25 opens the νανώδεσι explanation, exactly '
                    'where the topic begins; no verbatim source exists'),
    ('494a', 33):  ('Latin section heading (τὰ ἐκτὸς μόρια enumerantur), '
                    'no quotation; HA I.15 is the external-parts run'),
    ('511b', 1):   ('chapter-topic reference (511b1-4 names αἷμα and φλέψ); '
                    'the chapter\'s own formula at 511b31 is cited on the '
                    'entry\'s next line'),
    ('267a', 16):  ('quotation of SIMPLICIUS (Schol 452), outside this corpus '
                    'by design; the Aristotle address carries ἀντιπερίστασις '
                    'as expected'),
    ('166b', 13):  ('quotation of the scholiast (Schol 166b13) at BOTH sites '
                    'citing this line, not of Aristotle'),
    ('69a', 20):   ('Bonitz\'s own paraphrase-definition of ἀπαγωγή with a '
                    'Waitz reference; 69a20 is the lemma itself'),
    ('30b', 33):   ('analytic list under ἁπλῶς; both cited lines carry the '
                    'lemma; the scored words are the opposed phrases whose '
                    'own citations follow'),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', required=True)
    ap.add_argument('--max-overlap', type=float, default=0.0,
                    help='report citations at or below this overlap (default 0.0)')
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
    index = load_corpus()
    n = shown = skipped = greek_only_n = 0
    for p in pages:
        for col in ('L', 'R'):
            for r in scan(p, col, index):
                if r.get('skipped'):
                    skipped += 1
                    print(f"  page-{p:03d}-{col}:{r['line']:<3} {r['cite']:16} "
                          f"skipped: latin  {' '.join(r['quote'][-5:])}")
                    continue
                n += 1
                greek_only_n += r['greek_only']
                if r['overlap'] <= args.max_overlap:
                    if r.get('adjudicated'):
                        # A ruled-benign finding is a record, not work. It
                        # prints — vanishing would be the old defect — but
                        # under its ruling, never as an open zero.
                        print(f"  page-{p:03d}-{col}:{r['line']:<3} "
                              f"{r['cite']:16} adjudicated benign — "
                              f"{r['adjudicated'][:70]}…")
                        continue
                    shown += 1
                    tag = ' (greek-only)' if r['greek_only'] else ''
                    print(f"  page-{p:03d}-{col}:{r['line']:<3} {r['cite']:16} "
                          f"overlap {r['overlap']:.2f}{tag}  "
                          f"{' '.join(r['quote'][-5:])}")
    print(f'{shown} of {n} checkable citations at or below overlap '
          f'{args.max_overlap} ({greek_only_n} judged on Greek words alone); '
          f'{skipped} Latin-commentary spans skipped, not judged '
          f'({len(index[1])} columns excluded as double-recension seams)')


if __name__ == '__main__':
    main()
