"""
Lexical test for the ou-ligature (ȣ) vs plain-upsilon dispute.

The ligature expands to ου. So for any disputed spot the two candidate
readings differ only in that expansion, and Aristotle's own vocabulary
settles it: Bonitz is an index TO Aristotle, so its Greek quotations are
Aristotle wordforms.

  reader wrote ἀκολυθεῖ, LlamaParse read ἀκολȣθεῖ
    -> ου-form ἀκολουθεῖ is a corpus form, υ-form is not  => LIGATURE
  reader wrote δίδυμα, LlamaParse read δίδȣμα
    -> υ-form δίδυμα is a corpus form, ου-form is not      => UPSILON

Matching ignores accents: Bonitz's accentuation differs from the TLG text
often enough that accented-exact matching loses real words (πάρυδρον).

  python3 -m bonitz_pipeline.lexcheck --pages 47-49
"""

from __future__ import annotations
import argparse
import glob
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT.parent / 'app/dist/data'
LSJ = CORPUS / 'lsj'
FORMS_CACHE = ROOT / 'work/aristotle-forms.json'

LIG = 'ȣ'
LIG_CAP = 'Ȣ'


def nfc(s: str) -> str:
    return unicodedata.normalize('NFC', s)


def bare(w: str) -> str:
    """Accent- and breathing-stripped, lowercased."""
    d = unicodedata.normalize('NFD', w.lower())
    return ''.join(c for c in d if not unicodedata.combining(c))


def load_forms() -> set[str]:
    """Bare wordforms of the Aristotle corpus plus LSJ headwords.

    The corpus supplies inflected forms, which is what the index quotes;
    LSJ adds lemma-shaped words the corpus slice happens not to contain
    (κακοῦργος, for one). Both are folded into a single bare-form set.
    """
    if FORMS_CACHE.exists():
        return set(json.loads(FORMS_CACHE.read_text(encoding='utf-8')))
    forms: set[str] = set()
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
                        forms.add(bare(nfc(t)))
    if not forms:
        raise SystemExit(f'no corpus wordforms found under {CORPUS}')
    for f in glob.glob(str(LSJ / '*.json')):
        try:
            d = json.loads(Path(f).read_text(encoding='utf-8'))
        except Exception:
            continue
        for entry in (d.values() if isinstance(d, dict) else []):
            head = entry.get('head') if isinstance(entry, dict) else None
            if head:
                forms.add(bare(nfc(head)))
    FORMS_CACHE.parent.mkdir(parents=True, exist_ok=True)
    FORMS_CACHE.write_text(json.dumps(sorted(forms), ensure_ascii=False),
                           encoding='utf-8')
    return forms


def to_upsilon(w: str) -> str:
    return w.replace(LIG, 'υ').replace(LIG_CAP, 'Υ')


def to_ou(w: str) -> str:
    return w.replace(LIG, 'ου').replace(LIG_CAP, 'ΟΥ')


def judge(lig_word: str, forms: set[str]) -> tuple[str, str]:
    """Return (verdict, why) for a LlamaParse word containing the ligature.

    verdict is 'ligature', 'upsilon', or 'unknown' (neither or both attested).
    """
    u, o = bare(to_upsilon(lig_word)), bare(to_ou(lig_word))
    in_u, in_o = u in forms, o in forms
    if in_o and not in_u:
        return 'ligature', f'{o} is a corpus form; {u} is not'
    if in_u and not in_o:
        return 'upsilon', f'{u} is a corpus form; {o} is not'
    if in_u and in_o:
        return 'unknown', f'both {u} and {o} are corpus forms'
    return 'unknown', f'neither {u} nor {o} is a corpus form'


# Python's \w excludes combining marks, so a word splits wherever its accent
# is a separate codepoint — which is exactly the ligature, ȣ having no
# precomposed accented form. μιμȣ́μενον became μιμȣ + μενον, and the tail was
# then judged as a word in its own right. Combining marks must be word chars.
WORD_RE = re.compile(r'(?:[^\W\d_]|[\u0300-\u036F\u1DC0-\u1DFF])+', re.UNICODE)


def sweep_column(page: int, col: str, forms: set[str]) -> list[dict]:
    """Disputed ligature spots for one column, each with a lexical verdict.

    A spot is disputed when LlamaParse has the ligature and the reconciled
    text (falling back to the raw reader) wrote plain upsilon instead.
    """
    lp = ROOT / f'raw/llamaparse/page-{page:03d}.md'
    target = ROOT / f'work/reconciled/page-{page:03d}-{col}.txt'
    if not target.exists():
        target = ROOT / f'raw/opus/page-{page:03d}-{col}.txt'
    if not (lp.exists() and target.exists()):
        return []

    lig_words = {w for w in WORD_RE.findall(nfc(lp.read_text(encoding='utf-8')))
                 if LIG in w or LIG_CAP in w}
    lines = nfc(target.read_text(encoding='utf-8')).splitlines()

    out = []
    for w in sorted(lig_words):
        u_bare = bare(to_upsilon(w))
        if u_bare == bare(w):
            continue
        # Tokens of one or two letters carry no lexical signal and match at
        # the wrong line as often as the right one; the test cannot settle them.
        if len(u_bare) < 3:
            continue
        for i, line in enumerate(lines, 1):
            hits = [t for t in WORD_RE.findall(line) if bare(t) == u_bare]
            if not hits:
                continue
            verdict, why = judge(w, forms)
            out.append({
                'page': page, 'col': col, 'line': i,
                'wrote': hits[0], 'llamaparse': w,
                'proposed': to_ou(w) if verdict == 'ligature' else None,
                'lexical_verdict': verdict, 'why': why,
                'context': line.strip()[:160],
            })
    return out


GREEK_RE = re.compile(r'[Ͱ-Ͽἀ-῿]')


def scan_reconciled(page: int, col: str, forms: set[str]) -> list[dict]:
    """Non-words in the reconciled text that an ȣ would have made real.

    sweep_column() only sees spots where LlamaParse printed the ligature, so
    it is blind wherever all three readers made the SAME plain-upsilon
    substitution — which is how ἄμουσος/μουσικοῦ survived on page 51 and a
    whole ἁλουργ- entry survived on 47-R. This test needs no reader at all:
    a Greek word that is not attested, but becomes attested when one υ is
    read as ου, is a ligature that every reader missed.
    """
    path = ROOT / f'work/reconciled/page-{page:03d}-{col}.txt'
    if not path.exists():
        return []
    text = nfc(path.read_text(encoding='utf-8'))
    out = []
    for m in WORD_RE.finditer(text):
        w = m.group()
        b = bare(w)
        if not GREEK_RE.search(w) or 'υ' not in b or len(b) < 4 or b in forms:
            continue
        # a word broken across a printed line is only half a word
        if text[m.end():m.end() + 2] in ('-\n', '-\r'):
            continue
        for i, ch in enumerate(b):
            if ch != 'υ':
                continue
            cand = b[:i] + 'ου' + b[i + 1:]
            if cand in forms:
                line = text.count('\n', 0, m.start()) + 1
                out.append({
                    'page': page, 'col': col, 'line': line,
                    'wrote': w, 'attested_as': cand,
                    'context': text.splitlines()[line - 1].strip()[:150],
                })
                break
    return out


def parse_pages(spec: str) -> list[int]:
    a, _, b = spec.partition('-')
    return list(range(int(a), int(b or a) + 1))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', required=True)
    ap.add_argument('--out', default='work/lexcheck')
    ap.add_argument('--scan-reconciled', action='store_true',
                    help='find ligatures ALL readers missed, ignoring LlamaParse')
    args = ap.parse_args()

    forms = load_forms()
    outdir = ROOT / args.out
    outdir.mkdir(parents=True, exist_ok=True)

    if args.scan_reconciled:
        total = 0
        for p in parse_pages(args.pages):
            for col in ('L', 'R'):
                rows = scan_reconciled(p, col, forms)
                for r in rows:
                    print(f"  page-{p:03d}-{col}:{r['line']:<3} {r['wrote']:14} "
                          f"-> {r['attested_as']}")
                total += len(rows)
        print(f'{total} words no reader read as a ligature '
              f'({len(forms)} corpus wordforms)')
        return

    totals: dict[str, int] = {}
    for p in parse_pages(args.pages):
        for col in ('L', 'R'):
            rows = sweep_column(p, col, forms)
            if not rows:
                continue
            path = outdir / f'page-{p:03d}-{col}.json'
            path.write_text(json.dumps(rows, ensure_ascii=False, indent=2),
                            encoding='utf-8')
            for r in rows:
                totals[r['lexical_verdict']] = totals.get(r['lexical_verdict'], 0) + 1
            counts = ', '.join(f'{k}={sum(1 for r in rows if r["lexical_verdict"] == k)}'
                               for k in ('ligature', 'upsilon', 'unknown')
                               if any(r['lexical_verdict'] == k for r in rows))
            print(f'page-{p:03d}-{col}: {len(rows)} disputed ({counts}) -> {path.relative_to(ROOT)}')
    print(f'totals: {totals or "none"} ({len(forms)} corpus wordforms)')


if __name__ == '__main__':
    main()
