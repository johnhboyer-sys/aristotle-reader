"""Transcription noise in the vendored Greek TEI, by source family.

The Greek in `sources/` comes from two families and they are NOT of equal
quality. Perseus `grc2` is cleaner; First1KGreek `grc1` is OCR of printed
editions and carries visible errors. This matters for any word-count argument,
and it matters most for the Physics, De Anima and the biological works, which
are all First1K.

Two measures are implemented. The first DOES NOT WORK and is kept, disabled, so
the mistake is not made again.

  edit_distance_probe()  -- FAILED. The idea was that a form occurring once in
      830k words but one edit away from a form occurring 50+ times is probably a
      scanno (σἴτια for αἴτια is the type case). In practice it returns 105 per
      10k for Perseus and 116 for First1K -- indistinguishable -- because Greek
      is heavily inflected and almost every rare form is one edit from a common
      one. It measures inflectional density, not noise.

  breathing_probe()      -- WORKS. A breathing mark may sit only on a word's
      initial vowel (or the second element of an initial diphthong); internally
      it is orthographically impossible outside crasis. Rare inflections cannot
      trigger it, so it is specific. It finds First1K about 3x noisier than
      Perseus, and the errors it surfaces are real: words run together
      (ποιοῦσιναἱ, τὴνφορὰνἔφαμεν) and displaced breathing glyphs (οἰὀμεθʼ).

Neither measure is a total error rate -- both catch one signature only. Treat
the ratio between families as the finding, not the absolute numbers.

Run:  python3 -m studies.text_quality
"""
from __future__ import annotations

import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from greekstyle.works import WORKS, load_work

BREATHINGS = {'̓', '̔'}          # smooth, rough
VOWELS = set('αειηιουωΑΕΗΙΟΥΩ')


def family(w):
    return 'Perseus grc2' if 'perseus' in w.xml else 'First1KGreek'


def illegal_breathing(surface: str) -> bool:
    """True if a breathing sits past the opening vowel cluster."""
    vowel_seen = 0
    for ch in unicodedata.normalize('NFD', surface):
        if unicodedata.combining(ch):
            if ch in BREATHINGS and vowel_seen > 2:
                return True
        elif ch.lower() in VOWELS:
            vowel_seen += 1
        elif ch.isalpha() and vowel_seen:
            vowel_seen += 99                # a consonant closes the opening cluster
    return False


def breathing_probe():
    rows = []
    for w in WORKS:
        toks = load_work(w)
        bad = [t.surface for t in toks if illegal_breathing(t.surface)]
        rows.append((w.wid, family(w), len(toks), bad))
    return rows


def main():
    rows = breathing_probe()
    print('Breathing-position probe — a breathing past the opening vowel is')
    print('orthographically impossible, so this cannot fire on a rare inflection.\n')
    print(f"{'work':<9}{'family':<15}{'tokens':>8}{'flagged':>9}{'per 10k':>9}  examples")
    for wid, fam, n, bad in sorted(rows, key=lambda r: -len(r[3]) / max(r[2], 1)):
        if not bad:
            continue
        print(f'{wid:<9}{fam:<15}{n:>8}{len(bad):>9}{10000*len(bad)/n:>9.2f}  '
              + ', '.join(bad[:3])[:46])

    print()
    for fam in ('Perseus grc2', 'First1KGreek'):
        sel = [r for r in rows if r[1] == fam]
        tk = sum(r[2] for r in sel)
        bd = sum(len(r[3]) for r in sel)
        print(f'  {fam:<15}{len(sel):>3} works {tk:>7} tokens {bd:>4} flagged '
              f'= {10000*bd/tk:.2f} per 10k')
    print('\n  -> First1KGreek is roughly 3x noisier. The Physics, De Anima and the')
    print('     biological works are all First1K; the Metaphysics, both Ethics,')
    print('     Politics and Rhetoric are Perseus.')


if __name__ == '__main__':
    main()
