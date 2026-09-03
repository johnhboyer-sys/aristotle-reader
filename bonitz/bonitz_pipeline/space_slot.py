"""The one space error a rule can see: an abbreviation glued to its neighbour.

    python3 -m bonitz_pipeline.space_slot --dir work/kraken15-102/spine107-117
    python3 -m bonitz_pipeline.space_slot --dir work/reconciled --tsv out.tsv

⚠ THE PANEL CANNOT SEE A SPACE AT ALL. `canonical()` strips whitespace before
anything compares anything, so `Heitzp 112` and LlamaParse's correct
`Heitz p 112` are ONE STRING to the diff. Every space error in this corpus is
invisible to four readers by construction, and both that have been found were
found by John's eye: `Heitzp 112` on 115-R:22 and `cfa16` on 117-L:52.

⚠ AND THE LAST ATTEMPT AT A DETECTOR DOES NOT WORK. It reported 1877
positions, almost all of them line breaks, because it walked NFC text
alongside a folded stream and the indices did not correspond. This module
never touches the folded stream: it reads the printed column text, with its
spaces, and reports a position in that.

WHAT IS DECIDABLE, AND WHAT IS NOT. General spacing is not: over the 517
mostly-Latin lines of 107-117 kraken has more spaces than calamari on 47 lines
and fewer on 17, and both are wrong in opposite directions — kraken splits
Greek words (`T ὰ μετὰ`, `Ο ἰκο-`, `De interpretation e`) where calamari runs
abbreviations together (`p 139sqq`). There is no engine to prefer.

What IS decidable is a closed vocabulary: Bonitz's abbreviations and the
Bekker column letter, glued to the token beside them. Each rule below carries
its own count from the SETTLED corpus (pages 15-106, human-adjudicated), which
is the only honest statement of how often the shape occurs at all — and those
hits are themselves candidates, because nothing could see a space there
either.

⚠ `1573a25` IS NOT A FINDING. A column letter glued to a NUMBER is Bonitz's
own setting — 8300 of them against 5367 spaced in the settled corpus — and a
rule that flagged them would report a fifth of every citation on the page.
Only the letters case is a claim.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Bonitz's own apparatus key, as `latin_check` transcribes it.
GREEK = 'Α-Ωα-ωἀ-ῼ'


@dataclass(frozen=True)
class Hit:
    page: int
    col: str
    line: int
    char: int
    rule: str
    token: str
    becomes: str
    context: str
    witness: dict = field(default_factory=dict)

    @property
    def sid(self) -> str:
        return f'page-{self.page:03d}-{self.col}:{self.line}:{self.char}'

    @property
    def score(self) -> str:
        """`2 of 4 space` — how many readers put a space at the split."""
        seen = [v for v in self.witness.values() if v in ('space', 'glued')]
        return f"{sum(1 for v in seen if v == 'space')} of {len(seen)}"


# ⚠ EVERY RULE CARRIES THE NUMBER THAT JUSTIFIES IT. The settled counts are
# measured by `calibrate()` below, not asserted here, and a rule whose glued
# form is the MAJORITY in the settled corpus is Bonitz's style and not a
# finding — that is why the column letter is admitted only after letters.
RULES: dict[str, tuple[re.Pattern, str]] = {
    # `cfa16` -> `cf a16`. Settled corpus: 82 spaced, 1 glued (1.2%).
    'column_letter_after_word': (
        re.compile(rf'(?<![\w{GREEK}])([A-Za-z{GREEK}]{{2,}})([ab]\d+)'
                   rf'(?![\w{GREEK}])'),
        r'\1 \2'),
    # `164sq` -> `164 sq`. Settled corpus: 85 spaced, 25 glued (22.7%).
    #
    # ⚠ NO LOOKBEHIND ON THE DIGIT RUN. `(?<![\w])(\d+)(sqq?)` requires the
    # number to START at a word boundary, which silently drops every hit
    # inside a Bekker citation: `378a15sqq` has `15` preceded by `a`, and that
    # is the very shape kraken set correctly as `378a15 sqq`. Only the
    # digit-immediately-before-sq matters.
    'sq_after_number': (
        re.compile(r'(\d+)(sqq?)(?![\w])'),
        r'\1 \2'),
}

# ⚠ MEASURED AND REJECTED: `page_abbrev_after_name`, `Heitzp 112` ->
# `Heitz p 112`. It is a real class — John found it on 115-R:22 with his own
# eye — and it is NOT a rule. Every occurrence of the shape across pages
# 15-117 is fifteen tokens, and fourteen of them are Bonitz's own author and
# title abbreviations set exactly as he set them: `Emp` 9 (Empedocles),
# `adesp` 3, `Hipp` 1, `Symp` 1 (Plato's Symposium). One is the glue error.
# Seven percent, against the paren detector's twenty that was already too low
# to serve. The class needs Bonitz's abbreviation list, which is a stop-list
# and not a rule, so nothing here pretends to cover it.
#
# ⚠ AND THE ONE TRUE SITE IS NOW INVISIBLE ANYWAY. kraken read `Ηeitzp 112`;
# calamari fixed the Greek Eta and lost the space after `p`, so the mixed
# spine reads `Heitzp112` and there is no space-before-digits left to test.
REJECTED_RULES = ('page_abbrev_after_name',)


def scan_text(text: str, page: int, col: str) -> list[Hit]:
    out: list[Hit] = []
    for line_no, line in enumerate(unicodedata.normalize('NFC', text)
                                   .splitlines(), 1):
        for rule, (pat, repl) in RULES.items():
            for m in pat.finditer(line):
                lo = max(0, m.start() - 22)
                out.append(Hit(page, col, line_no, m.start(), rule,
                               m.group(),
                               m.expand(repl),
                               line[lo:m.end() + 22]))
    return out


def _stripped(text: str) -> tuple[str, list[int]]:
    """Text with whitespace removed, and stripped-index -> raw-index."""
    out, offs = [], []
    for i, ch in enumerate(text):
        if not ch.isspace():
            out.append(ch)
            offs.append(i)
    return ''.join(out), offs


def witness(hit: Hit, raw: str, anchor: int = 24) -> str:
    """Does this reader put a space where the rule wants to split?

    ⚠ THE INDEX PROBLEM, DONE THE OTHER WAY ROUND. The detector that failed
    walked NFC text alongside a FOLDED stream, whose indices do not
    correspond. Here the only transformation is dropping whitespace, and the
    map back is exact — so an anchor located in the stripped text names a
    real position in the reader's own printed line.

    Returns `space`, `glued`, `absent` (the anchor is not in this reader) or
    `ambiguous` (it occurs more than once, so no position is named).
    """
    left, right = hit.token[:hit.becomes.index(' ')], None
    right = hit.becomes[hit.becomes.index(' ') + 1:]
    probe = (hit.context.replace(' ', '')
             .split(left + right)[0][-anchor:] + left)
    body, offs = _stripped(raw)
    first = body.find(probe + right)
    if first < 0:
        return 'absent'
    if body.find(probe + right, first + 1) >= 0:
        return 'ambiguous'
    cut = first + len(probe)          # stripped index of the split point
    a, b = offs[cut - 1], offs[cut]
    return 'space' if b > a + 1 else 'glued'


def scan_dir(directory: Path, pages: range | None = None) -> list[Hit]:
    out: list[Hit] = []
    files = sorted(directory.glob('page-*.txt'))
    if not files:
        # ⚠ An empty glob is a broken path, never a clean corpus. This project
        # has shipped "nothing found" from a directory nothing looked in four
        # times.
        sys.exit(f'no column text in {directory}')
    for f in files:
        m = re.match(r'page-(\d+)-([LR])\.txt$', f.name)
        if not m:
            continue
        page, col = int(m.group(1)), m.group(2)
        if pages is not None and page not in pages:
            continue
        out.extend(scan_text(f.read_text(encoding='utf-8'), page, col))
    return sorted(out, key=lambda h: (h.page, h.col, h.line, h.char))


def calibrate(directory: Path) -> dict[str, tuple[int, int]]:
    """{rule: (spaced, glued)} over a corpus — the prior for each rule.

    A rule whose glued form is the majority is describing Bonitz's setting,
    not an error, and must not be shipped.
    """
    text = '\n'.join(f.read_text(encoding='utf-8')
                     for f in sorted(directory.glob('page-*.txt')))
    text = unicodedata.normalize('NFC', text)
    spaced = {
        'column_letter_after_word': rf'[A-Za-z{GREEK}]{{2,}}\s+[ab]\d',
        'sq_after_number': r'\d\s+sqq?(?![\w])',
    }
    out = {}
    for rule, (pat, _) in RULES.items():
        out[rule] = (len(re.findall(spaced[rule], text)),
                     len(pat.findall(text)))
    return out


def reader_texts(pages: list[int], kraken_dir: Path, calamari_dir: Path
                 ) -> dict[str, str]:
    """Every reader's RAW text for the range — spaces intact, nothing folded."""
    import re as _re
    import zipfile
    from .batch4 import GENIE400_CHUNKS
    from .normalize import clean_genie, clean_llamaparse

    def cols(d: Path) -> str:
        return '\n'.join((d / f'page-{p:03d}-{c}.txt').read_text(encoding='utf-8')
                          for p in pages for c in 'LR')

    out = {'kraken': cols(kraken_dir), 'calamari': cols(calamari_dir)}
    out['llama'] = clean_llamaparse('\n'.join(
        (ROOT / f'raw/llama400/page-{p:03d}.md').read_text(encoding='utf-8')
        for p in pages))
    for a, b, fname in GENIE400_CHUNKS:
        if a <= pages[0] and pages[-1] <= b:
            xml = zipfile.ZipFile(ROOT / 'raw/genie400' / fname) \
                         .read('word/document.xml').decode('utf-8')
            paras = [''.join(_re.findall(r'<w:t[^>]*>([^<]*)</w:t>', q))
                     for q in _re.findall(r'<w:p[ >].*?</w:p>', xml, _re.S)]
            import html as _html
            out['genie'] = _html.unescape(clean_genie(paras))
            break
    return out


def add_witnesses(hits: list[Hit], readers: dict[str, str]) -> list[Hit]:
    return [Hit(**{**h.__dict__,
                   'witness': {n: witness(h, t) for n, t in readers.items()}})
            for h in hits]


def to_queue(hits: list[Hit], spine_dir: Path, spine_reader: str,
             alto_dirs: list[Path] | None = None) -> dict:
    """Cards for `settle_review`, one per RULE — the question is the same one.

    ⚠ BUNDLED BY RULE, NOT BY TOKEN. `139sqq` and `13sq` are eighteen
    different numbers asking one question — is there a space before `sq` — and
    eighteen cards would be eighteen looks at the same shape. One card, every
    site's ink on the strip, one click to pull a site out.

    ⚠ AND THE SUBSTITUTION IS AN INSERTION. The bundle's `subs` is `('', ' ')`,
    which `settle_review._named` renders as `add a space`; without that the
    button is blank, because the character being judged has no shape.
    """
    from .normalize import canonical
    cache: dict[tuple[int, str], tuple[str, list[int]]] = {}
    by_rule: dict[str, list[Hit]] = {}
    for h in hits:
        by_rule.setdefault(h.rule, []).append(h)

    entries = []
    for rule, group in by_rule.items():
        sid = f'space:{rule}'
        label = f'∅ → {chr(0x2423)}  (a space)'
        for h in group:
            key = (h.page, h.col)
            if key not in cache:
                raw = (spine_dir / f'page-{h.page:03d}-{h.col}.txt') \
                    .read_text(encoding='utf-8')
                base = unicodedata.normalize('NFC', raw)
                stream, offs = canonical(raw)
                cache[key] = (base, offs)
            base, offs = cache[key]
            # Raw index of the token, from the printed line and column.
            line_start = 0
            for _ in range(h.line - 1):
                line_start = base.index('\n', line_start) + 1
            raw_at = line_start + h.char
            word_off = next((i for i, o in enumerate(offs) if o >= raw_at),
                            len(offs))
            readers = {'opus': h.token}
            for name, v in h.witness.items():
                if v == 'space':
                    readers[name] = h.becomes
                elif v == 'glued':
                    readers[name] = h.token
            forms = sorted({h.token, h.becomes})
            entries.append({
                'page': h.page, 'col': h.col, 'line': h.line,
                'word_off': word_off, 'char_at': h.char,
                'readers': readers, 'kind': 'space',
                'reason': f'space:{rule}',
                'forms': forms, 'form_set': forms,
                'n_same_form_set': len(group),
                'card_sid': sid, 'becomes': h.becomes,
                'bundle': {'kind': 'space', 'label': label,
                           'subs': [['', ' ']]},
            })
    return {
        'alto_dirs': [str(d) for d in (alto_dirs or [])],
        'spine_reader': spine_reader,
        'spine_dir': str(spine_dir),
        'n_sites': len(entries),
        'n_distinct_decisions': len(by_rule),
        'entries': entries,
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--dir', type=Path, required=True,
                   help='column text WITH its spaces — the printed lines, '
                        'never the canonical stream')
    p.add_argument('--pages', help='restrict to a range, e.g. 107-117')
    p.add_argument('--calibrate', type=Path,
                   help='a settled corpus to report each rule\'s prior from')
    p.add_argument('--tsv', type=Path)
    p.add_argument('--queue', type=Path,
                   help='write a settle_review queue, one card per rule')
    p.add_argument('--spine-reader', default='mixed:kraken-r6+calamari-r2')
    p.add_argument('--alto-dir', type=Path, action='append', default=[])
    p.add_argument('--witness', nargs=2, metavar=('KRAKEN_DIR', 'CALAMARI_DIR'),
                   help='ask every reader whether IT puts a space at the '
                        'split — the prior is about the corpus, this is '
                        'evidence about the site')
    a = p.parse_args(argv)

    pages = None
    if a.pages:
        lo, _, hi = a.pages.partition('-')
        pages = range(int(lo), int(hi or lo) + 1)

    if a.calibrate:
        print(f'prior, from {a.calibrate}:')
        for rule, (sp, gl) in calibrate(a.calibrate).items():
            tot = sp + gl
            pct = 100 * gl / tot if tot else 0
            print(f'  {rule:26s} spaced {sp:5d}  glued {gl:5d}  '
                  f'({pct:.1f}% glued)')
        print()

    hits = scan_dir(a.dir, pages)
    if a.witness:
        pgs = sorted({h.page for h in hits} | set(pages or ()))
        hits = add_witnesses(hits, reader_texts(
            pgs, Path(a.witness[0]), Path(a.witness[1])))
    by_rule: dict[str, int] = {}
    for h in hits:
        by_rule[h.rule] = by_rule.get(h.rule, 0) + 1
    print(f'{len(hits)} candidate(s) in {a.dir}'
          + (f' pages {a.pages}' if a.pages else ''))
    for rule in RULES:
        print(f'  {by_rule.get(rule, 0):5d}  {rule}')
    for h in hits[:40]:
        mark = f'  [{h.score} space]' if h.witness else ''
        print(f'  {h.page}{h.col}:{h.line:<3} {h.rule:22s} '
              f'{h.token!r} -> {h.becomes!r}{mark}')
        if h.witness:
            print(f'        {" ".join(f"{n}={v}" for n, v in h.witness.items())}')
        print(f'        …{h.context}…')
    if len(hits) > 40:
        print(f'  … {len(hits) - 40} more')
    if a.queue:
        doc = to_queue(hits, a.dir, a.spine_reader, a.alto_dir)
        a.queue.parent.mkdir(parents=True, exist_ok=True)
        a.queue.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n',
                           encoding='utf-8')
        print(f"-> {a.queue}  ({doc['n_distinct_decisions']} card(s), "
              f"{doc['n_sites']} sites)")
    if a.tsv:
        a.tsv.parent.mkdir(parents=True, exist_ok=True)
        a.tsv.write_text(
            'sid\tpage\tcol\tline\tchar\trule\ttoken\tbecomes\tscore\t'
            'witness\tcontext\n'
            + ''.join(f'{h.sid}\t{h.page}\t{h.col}\t{h.line}\t{h.char}\t'
                      f'{h.rule}\t{h.token}\t{h.becomes}\t{h.score}\t'
                      + ','.join(f'{n}={v}' for n, v in h.witness.items())
                      + f'\t{h.context}\n' for h in hits),
            encoding='utf-8')
        print(f'-> {a.tsv}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
