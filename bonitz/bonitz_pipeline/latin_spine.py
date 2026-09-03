"""A spine that changes engine at the line, because the ink changes language.

    python3 -m bonitz_pipeline.latin_spine 107-117 \
        --kraken-dir work/kraken15-102/txt107-117 \
        --calamari-dir work/calamari/read107-117/txt \
        --out-dir work/kraken15-102/spine107-117

kraken round 6 is the better Greek reader on this corpus and the worse Latin
one, and Bonitz sets both.  Over 1342 lines of 107-117 the two engines' Latin
lines differ 142 times, and the difference is not a tie: kraken produced
`Aristofeles`, `scniptos`, `pgulmuS)` where calamari had `Aristoteles`,
`scriptos`, `posuimus`.

Why this matters more than a vote.  A card can only offer John an ALTERNATIVE
to the spine's word.  Where the spine's word is `pgulmuS)` there is nothing to
choose between — the card is a fragment against a fragment, and John's answer
was to write the line out by hand.  Fixing the spine is the only thing that
turns those sites into questions a click can answer.

⚠ THE SWITCH IS PER LINE, AND ONLY ON A MOSTLY-LATIN LINE.  A mixed line still
spines on kraken: its Greek is the majority of its characters and kraken reads
Greek better, so switching would trade a Latin gain for a Greek loss.  Latin on
a mixed line still reaches John, because calamari votes on every line whatever
spines it.

⚠ CLASSIFY ON THE UNION OF THE TWO READS, NEVER ON THE SPINE'S OWN.  kraken
turns Latin `p` into Greek `ρ` — that is the documented blind spot of this
whole tranche — so a line it has Hellenised looks Greek to any count taken
from kraken alone, and the one line most in need of the switch would never get
it.  Whichever engine SEES the Latin is the evidence that Latin is there.

The output is a column text with the same line count as both inputs, and a
sidecar naming the engine behind every line.  Nothing downstream may guess:
`batch_cold` reads the sidecar to mute the engine that IS the spine, so no
reading is ever counted twice.
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path

# A line is spined on calamari when it holds more Latin letters than Greek.
# Strict majority, not a ratio: the classes this rule has to separate are
# continuous Latin prose and continuous Greek, and both clear it by a wide
# margin. The band in between is `mixed`, and mixed stays on kraken.
LATIN, GREEK, MIXED, NEITHER = 'latin', 'greek', 'mixed', 'neither'


def letter_counts(text: str) -> tuple[int, int]:
    """(greek, latin) base letters — combining marks are not letters."""
    greek = latin = 0
    for ch in unicodedata.normalize('NFD', text):
        if unicodedata.combining(ch):
            continue
        try:
            name = unicodedata.name(ch)
        except ValueError:
            continue
        if name.startswith('GREEK'):
            greek += 1
        elif name.startswith('LATIN'):
            latin += 1
    return greek, latin


def line_script(kraken_line: str, calamari_line: str) -> str:
    """Which language this printed line is in, judged from BOTH reads.

    ⚠ `max` per alphabet, not a count of one read. kraken reading Latin as
    Greek must not be able to vote the line Greek.
    """
    gk, lk = letter_counts(kraken_line)
    gc, lc = letter_counts(calamari_line)
    greek, latin = max(gk, gc), max(lk, lc)
    if greek + latin == 0:
        return NEITHER
    if latin > greek:
        return LATIN
    if greek > 3 * latin:
        return GREEK
    return MIXED


def build_column(kraken_text: str, calamari_text: str
                 ) -> tuple[str, list[str], list[str]]:
    """Mixed column text, the engine behind each line, and each line's script.

    Refuses a line-count mismatch: the two reads are of the SAME filtered ALTO
    at the same 61 lines, and a mismatch means one of them is not what it
    claims to be. Splicing them by index at that point would attach calamari's
    line 40 to kraken's line 41.
    """
    kl = kraken_text.splitlines()
    cl = calamari_text.splitlines()
    if len(kl) != len(cl):
        raise ValueError(f'line count differs: kraken {len(kl)}, '
                         f'calamari {len(cl)} — these are not the same column')
    out, engines, scripts = [], [], []
    for k, c in zip(kl, cl):
        script = line_script(k, c)
        scripts.append(script)
        if script == LATIN:
            out.append(c)
            engines.append('calamari-r2')
        else:
            out.append(k)
            engines.append('kraken-r6')
    return '\n'.join(out) + '\n', engines, scripts


def build(pages: list[int], kraken_dir: Path, calamari_dir: Path,
          out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    sidecar: dict[str, dict] = {}
    tally = {LATIN: 0, GREEK: 0, MIXED: 0, NEITHER: 0}
    for pg in pages:
        for col in ('L', 'R'):
            name = f'page-{pg:03d}-{col}.txt'
            kf, cf = kraken_dir / name, calamari_dir / name
            for f in (kf, cf):
                if not f.exists():
                    sys.exit(f'{f} missing — this reader has not read '
                             'this column')
            text, engines, scripts = build_column(
                kf.read_text(encoding='utf-8'),
                cf.read_text(encoding='utf-8'))
            (out_dir / name).write_text(text, encoding='utf-8')
            sidecar[f'{pg:03d}-{col}'] = {'engines': engines,
                                          'scripts': scripts}
            for s in scripts:
                tally[s] += 1
    doc = {
        'kraken_dir': str(kraken_dir),
        'calamari_dir': str(calamari_dir),
        'default_engine': 'kraken-r6',
        'latin_engine': 'calamari-r2',
        'n_lines': tally,
        'columns': sidecar,
    }
    (out_dir / 'spine-engines.json').write_text(
        json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return doc


def twin_intervals(base: str, offs: list[int], engines: list[str],
                   start: int = 0) -> list[tuple[int, int, str]]:
    """Spine intervals naming the engine that wrote them.

    `base` is the mixed column text, `offs` the map canonical-stream-index ->
    index in base that `canonical()` returned for it, `engines` the per-line
    sidecar, and `start` this column's offset in the batch spine.

    The panel needs this to mute the engine that IS the spine on a given line
    ([[compare4.compare]] `spine_twins`) — otherwise kraken agrees with itself
    on every Greek line and the spine's reading is tallied twice.
    """
    if not offs:
        return []
    # base index -> line number, walked once.
    line_of: list[int] = []
    ln = 0
    for ch in base:
        line_of.append(ln)
        if ch == '\n':
            ln += 1
    out: list[tuple[int, int, str]] = []
    for i, o in enumerate(offs):
        line = line_of[o] if o < len(line_of) else len(engines) - 1
        name = engines[line] if 0 <= line < len(engines) else engines[-1]
        # The panel's reader keys are bare engine names, not versions.
        name = name.split('-')[0]
        if out and out[-1][2] == name and out[-1][1] == start + i:
            out[-1] = (out[-1][0], start + i + 1, name)
        else:
            out.append((start + i, start + i + 1, name))
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('pages', help='page range, e.g. 107-117')
    p.add_argument('--kraken-dir', type=Path, required=True)
    p.add_argument('--calamari-dir', type=Path, required=True)
    p.add_argument('--out-dir', type=Path, required=True)
    a = p.parse_args(argv)

    lo, _, hi = a.pages.partition('-')
    pages = list(range(int(lo), int(hi or lo) + 1))
    doc = build(pages, a.kraken_dir, a.calamari_dir, a.out_dir)
    n = doc['n_lines']
    print(f"{sum(n.values())} lines -> {a.out_dir}")
    print(f"  {n[LATIN]:5d}  latin    spined on calamari-r2")
    print(f"  {n[GREEK]:5d}  greek    spined on kraken-r6")
    print(f"  {n[MIXED]:5d}  mixed    spined on kraken-r6 "
          "(its Greek is the majority of the line)")
    if n[NEITHER]:
        print(f"  {n[NEITHER]:5d}  neither  spined on kraken-r6")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
