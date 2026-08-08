"""
Find ligatures the corpus lost.

Genie emits no ȣ at all — zero in 6.0M characters, both the 300 dpi and the
400 dpi runs — so it never voted on that character.  `compare3` catches the
resulting bad majorities with `_spine_missed_ligature`, but only when some
*other* reader recorded the ligature.  Where Opus, Genie and LlamaParse all
missed one, nothing flagged and the corpus took a plain vowel silently.

kraken reads that glyph at 98.58% and its errors are uncorrelated with all
three, so it can find those 3-0 misses.  This runs the model over every paired
column and reports each position where the model reads a ligature and the
corpus does not — the candidate queue, ranked by how confidently the pattern
repeats.

    python3 -m bonitz_pipeline.ligature_sweep --model work/kraken400/m.safetensors \
        --work work/kraken400 --device cpu

Output: work/<tree>/sweep/ligature-candidates.tsv, one row per suspect
position, plus a summary by word.  Nothing is applied — this hands John a
queue, and the ink decides.
"""

from __future__ import annotations
import argparse
import difflib
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
PAGE_NS = 'http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15'

LIGATURES = 'ȣϗ'

# What the corpus writes where the print has a ligature.  Two failure modes,
# and the second is the one a character-by-character diff misses: the readers
# substitute a single letter (ȣ -> υ) but they also EXPAND (ȣ -> ου, ϗ -> και),
# so `τȣ͂` in the ink arrives as `τοῦ` — one character against two.  Comparison
# is therefore word-level, and a word is a suspect when the model reads a
# ligature in it and the corpus word matches after the ligature is expanded
# either way.
EXPANSIONS = {
    'ȣ': ('υ', 'ου'),
    'ϗ': ('κ', 'και'),
}


def _strip_marks(s: str) -> str:
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if not unicodedata.combining(c))


def suspect_pair(corpus_word: str, model_word: str) -> str | None:
    """Classify a corpus/model word pair, or None if it is not a ligature case.

    Returns the expansion the corpus used ('υ', 'ου', 'κ', 'και') when the two
    words agree once the model's ligature is written out that way.
    """
    if not any(c in LIGATURES for c in model_word):
        return None
    # If the corpus already has the same ligature, the words differ over
    # something else — nearly always a diacritic, `τȣ̃` against `τȣ͂` being
    # combining tilde against combining perispomeni, or a dropped breathing.
    # Those are real disagreements but they are not LOST ligatures, which is
    # the only thing this sweep is for.  Without this guard they are 99% of
    # the output and bury the two rows that matter.
    if any(c in corpus_word for c in model_word if c in LIGATURES):
        return None
    cw = _strip_marks(corpus_word)
    for lig, forms in EXPANSIONS.items():
        if lig not in model_word:
            continue
        for form in forms:
            if _strip_marks(model_word.replace(lig, form)) == cw:
                return form
    return 'other'   # a ligature the corpus renders some third way


def read_lines(path: Path) -> list[tuple[str, str]]:
    out = []
    for el in ET.parse(path).getroot().iter(f'{{{PAGE_NS}}}TextLine'):
        t = el.find(f'{{{PAGE_NS}}}TextEquiv/{{{PAGE_NS}}}Unicode')
        out.append((el.get('id') or '', (t.text or '') if t is not None else ''))
    return out


def recognise(model: Path, col: str, work: Path, out_dir: Path, device: str) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / f'{col}.pred.xml'
    if not dst.exists():
        subprocess.run(
            ['kraken', '-d', device, '-x', '-f', 'page',
             '-i', str(work / 'gt' / f'{col}.xml'), str(dst),
             'ocr', '-m', str(model)],
            check=True, cwd=work / 'cols')
    return dst


def align(a: str, b: str) -> list[tuple[str | None, str | None]]:
    """Levenshtein backtrace, corpus vs prediction, character by character."""
    n, m = len(a), len(b)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        d[i][0] = i
    for j in range(m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1,
                          d[i - 1][j - 1] + (a[i - 1] != b[j - 1]))
    pairs, i, j = [], n, m
    while i or j:
        if i and j and d[i][j] == d[i - 1][j - 1] + (a[i - 1] != b[j - 1]):
            pairs.append((a[i - 1], b[j - 1])); i, j = i - 1, j - 1
        elif i and d[i][j] == d[i - 1][j] + 1:
            pairs.append((a[i - 1], None)); i -= 1
        else:
            pairs.append((None, b[j - 1])); j -= 1
    return pairs[::-1]


def word_at(text: str, idx: int) -> str:
    lo = idx
    while lo > 0 and not text[lo - 1].isspace():
        lo -= 1
    hi = idx
    while hi < len(text) and not text[hi].isspace():
        hi += 1
    return text[lo:hi]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--model', type=Path, required=True)
    p.add_argument('--work', type=Path, default=ROOT / 'work' / 'kraken')
    p.add_argument('--device', default='cpu')
    p.add_argument('--cols', help='comma-separated stems; default every paired column')
    args = p.parse_args(argv)
    # recognise() runs kraken with cwd=cols/, so both of these must be
    # absolute or kraken resolves them against the wrong directory.
    work = args.work.resolve()
    args.model = args.model.resolve()
    out_dir = work / 'sweep'

    cols = (args.cols.split(',') if args.cols
            else sorted(f.stem for f in (work / 'gt').glob('page-*.xml')))
    if not cols:
        sys.exit(f'no ground-truth XML in {work / "gt"}')

    rows: list[dict] = []
    by_word: Counter = Counter()
    seen_lines = 0

    for n, col in enumerate(cols, 1):
        try:
            pred_path = recognise(args.model, col, work, out_dir, args.device)
        except subprocess.CalledProcessError:
            print(f'  {col}: recognition failed, skipped', file=sys.stderr)
            continue
        gt, pred = read_lines(work / 'gt' / f'{col}.xml'), read_lines(pred_path)
        if len(gt) != len(pred):
            print(f'  {col}: {len(gt)} gt vs {len(pred)} pred, skipped', file=sys.stderr)
            continue
        for (gid, g), (_, hyp) in zip(gt, pred):
            seen_lines += 1
            gw, hw = g.split(), hyp.split()
            sm = difflib.SequenceMatcher(None, gw, hw, autojunk=False)
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag == 'equal':
                    continue
                # pair the replaced words positionally; a ligature word that
                # shifts alignment still lands in the same opcode block
                for k in range(max(i2 - i1, j2 - j1)):
                    cw = gw[i1 + k] if i1 + k < i2 else ''
                    mw = hw[j1 + k] if j1 + k < j2 else ''
                    form = suspect_pair(cw, mw)
                    if not form:
                        continue
                    rows.append({'column': col, 'line': gid,
                                 'corpus_word': cw, 'model_word': mw,
                                 'form': form,
                                 'context': ' '.join(gw[max(0, i1 + k - 4):i1 + k + 5])})
                    by_word[(cw, mw, form)] += 1
        print(f'  [{n}/{len(cols)}] {col}: running total {len(rows)}')

    out_dir.mkdir(parents=True, exist_ok=True)
    tsv = out_dir / 'ligature-candidates.tsv'
    with tsv.open('w', encoding='utf-8') as f:
        f.write('column\tline\tcorpus_word\tmodel_word\tcorpus_form\tcontext\n')
        for r in rows:
            f.write(f"{r['column']}\t{r['line']}\t{r['corpus_word']}\t"
                    f"{r['model_word']}\t{r['form']}\t{r['context']}\n")

    print(f'\n{len(rows)} candidate words in {seen_lines} lines, {len(cols)} columns')
    print(f'written to {tsv}')
    forms = Counter(r['form'] for r in rows)
    print('\nby how the corpus wrote it:')
    for k, v in forms.most_common():
        print(f'  {v:5d}  {k}')
    print('\nmost repeated — a pair recurring across columns is either a real corpus')
    print('error made the same way many times, or the model wrong the same way:')
    for (cw, mw, form), c in by_word.most_common(25):
        print(f'  {c:4d}  corpus {cw!r}  model {mw!r}  ({form})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
