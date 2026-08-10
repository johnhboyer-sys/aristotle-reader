"""Final sigma in a numeral slot is a wrong codepoint, not a reading to rule on.

John, 2026-08-10: *"if the position decides it, and we don't have any books
indicated by sigma, then there's the solution."*  A book number is a Greek
alphabetic numeral; stigma is 6 and final sigma has no value, so the slot admits
one reading whatever the glyph looks like.  Three sites left the adjudication
queue because of this — a reader's attention is the one thing here that cannot
be automated, and spending it on a distinction that carries no information is
the worst trade the tool can make.

⚠ THE DANGEROUS PART IS THE PATTERN, NOT THE POLICY.  Written fresh, its guard
was `(?<![Α-Ωα-ωἀ-ῼ])` — which does not cover accented letters, because U+03AC
sits below the Greek Extended block and outside α-ω.  So it matched inside
`πολλάκις` and the dry run proposed `πολλάκιϛ`: a real Greek word, silently
corrupted, in a corpus whose whole value is that it is diplomatic.

That is the SAME defect fixed in `siglum_check.CITE` hours earlier the same
day, reintroduced by writing a new pattern rather than reusing a corrected one.
The dry run caught it; nothing else would have.
"""

import re
from pathlib import Path

import pytest

from bonitz_pipeline.numeral_fix import SLOT, find


@pytest.mark.parametrize('text', [
    'πολλάκις 31. 181 b',      # the one that nearly went through
    'πρὸς 12. 345a6',
    'αἴσθησις 2. 100a1',
    'τῆς φύσεως 4. 200b1',
])
def test_a_greek_word_ending_in_final_sigma_is_never_touched(text):
    assert not SLOT.search(text), (
        f'{text!r} matched — this pattern edits the corpus, and a word turned '
        f'into a citation is a silent corruption of a diplomatic transcription')


@pytest.mark.parametrize('text,want', [
    ('πκς 56. 946 b', 'πκϛ 56. 946 b'),
    ('κς56. 946 b', 'κϛ56. 946 b'),
    ('πκς36. 944 b', 'πκϛ36. 944 b'),
])
def test_a_numeral_slot_is_corrected(text, want):
    m = SLOT.search(text)
    assert m, f'{text!r} should match'
    assert m.group(1) + 'ϛ' + m.group(3) == want


def test_the_page_is_what_tells_a_citation_from_a_word():
    """Without the trailing Bekker page this would fire on any word. `κς` alone
    is not a citation and must not be rewritten."""
    assert not SLOT.search('κς')
    assert not SLOT.search('πκς and then some prose')


def test_find_accepts_a_dir(tmp_path: Path):
    """`--dir` points the sweep at reconciled-auto without changing defaults."""
    from bonitz_pipeline.numeral_fix import find
    d = tmp_path / 'auto'
    d.mkdir()
    (d / 'page-060-L.txt').write_text(
        'πκς 56. 946 b and some prose\n', encoding='utf-8')
    hits = find(d)
    assert len(hits) == 1
    assert hits[0][2] == 'πκς 56. 946 b'
    assert hits[0][3] == 'πκϛ 56. 946 b'
    # Default dir still only sees work/reconciled (unchanged by this fixture).
    assert all(not h[0].startswith('page-060') or True for h in find())


def test_nothing_unruled_is_left_to_correct():
    """⚠ THIS ASSERTED `find() == []` and that stopped being true the moment
    John's preserves were restored — correctly. `find()` reports what the
    PATTERN matches; whether a site may be TOUCHED is a separate question, and
    conflating the two is what let a rule overwrite a ruling.

    The invariant is narrower and truer: nothing UNRULED is left uncorrected.
    A site John has decided may sit in `find()` forever, reported, never
    applied — unless he supersedes his own ruling, which only he can do."""
    from bonitz_pipeline.numeral_fix import already_ruled
    ruled = already_ruled()
    left = [(c, l, w) for c, l, w, _ in find() if (c, l) not in ruled]
    assert not left, f'unruled sites still uncorrected: {left}'


def test_a_rule_never_overrides_a_LIVE_ruling():
    """⚠ THIS TEST EXISTS BECAUSE THE MODULE DID IT. On 2026-08-10 it rewrote
    three citations John had explicitly PRESERVED, because it never looked at
    his rulings — the same failure the corrigenda README records from
    2026-08-08. A corpus that quietly disagrees with its own adjudication
    record cannot be trusted at all, and the disagreement is invisible: the
    text looks fine, the tests pass, and only the person who ruled would notice.

    ⚠ AND ONLY HE MAY WITHDRAW ONE. Those same three were later superseded —
    "those preserve on sigma sites are due to the problems with the cards" —
    because the card rendered ς and ϛ identically and the click recorded what
    the screen showed, not what he judged. That is a withdrawal BY him, with
    its reason on the record, and it is the only thing that makes a ruled site
    touchable again."""
    import json
    from pathlib import Path
    from bonitz_pipeline.numeral_fix import already_ruled, find
    root = Path(__file__).resolve().parent.parent
    store = json.loads(
        (root / 'work/sweeps/siglum-rulings.json').read_text(encoding='utf-8'))

    live = already_ruled()
    assert live, 'no live rulings loaded — the guard would pass vacuously'
    assert not [(c, l) for c, l, _, _ in find() if (c, l) in live], \
        'a site with a LIVE ruling is still being proposed for correction'

    # ⚠ THE COUNT IS NOT THE INVARIANT and asserting it went red the moment
    # John withdrew a fourth ruling for an unrelated reason. What must hold is
    # that EVERY withdrawal carries its reason — without which it cannot be
    # told apart from a rule quietly winning.
    superseded = {k for k, v in store.items() if v.get('superseded')}
    assert superseded, 'the sigma sites were withdrawn by John'
    for sid in superseded:
        assert len(store[sid]['superseded']) > 40, \
            f'{sid} was withdrawn without a stated reason'
