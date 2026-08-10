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


def test_nothing_is_left_to_correct_once_applied():
    """After the fix the corpus holds no final sigma in a numeral slot, so a
    later pass that reintroduces one will show up here rather than in a queue
    John has to read."""
    assert find() == [], f'still uncorrected: {find()}'


def test_a_rule_never_overrides_a_ruling():
    """⚠ THIS TEST EXISTS BECAUSE THE MODULE DID IT. On 2026-08-10 it rewrote
    three citations John had explicitly PRESERVED, because it never looked at
    his rulings — the same failure the corrigenda README records from
    2026-08-08, when two of his rulings were silently overwritten and had to be
    reverted.

    It is worse than any misreading. A corpus that quietly disagrees with its
    own adjudication record cannot be trusted at all, and the disagreement is
    invisible: the text looks fine, the tests pass, and only the person who
    made the ruling would ever notice.

    His click is the authority. A rule that thinks otherwise reports the
    conflict and stops."""
    from bonitz_pipeline.numeral_fix import already_ruled, find
    ruled = already_ruled()
    assert ruled, 'no rulings loaded — the guard would pass vacuously'
    clashes = [(c, l) for c, l, _, _ in find() if (c, l) in ruled]
    assert not clashes or all(ruled[k] for k in clashes), (
        'find() may still REPORT a ruled site, but main() must skip it')
    # the three John preserved must still read as he left them
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    for col, line, want in (('page-025-L', 43, 'πκς'),
                            ('page-025-L', 46, 'κς'),
                            ('page-025-R', 27, 'πκς')):
        text = (root / f'work/reconciled/{col}.txt').read_text(
            encoding='utf-8').splitlines()[line - 1]
        assert want in text, (
            f'{col}:{line} no longer reads {want!r} — John ruled preserve here')
