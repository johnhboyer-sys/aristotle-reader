"""The word-space policy: a NORMALISATION, and only over closed classes."""

import json

import pytest

from bonitz_pipeline import space_policy


def test_the_bekker_page_and_its_column_stay_one_token():
    """⚠ John's policy for the revised edition: `1573a25`, closed up. This
    module spaced 8300 of them once, on my reading of "uniform approach"
    rather than his, and broke 122 tests that pin the adjudicated corpus."""
    text = 'φαύλως ἔχειν Αγ 12. 77b24. σχεδὸν 1573a25'
    got, n = space_policy.normalise(text)
    assert got == text
    assert sum(n.values()) == 0


def test_bonitz_short_form_citations_are_left_alone_too():
    # 536 of the 8300 elide the page number because it repeats: `14a23`,
    # `6b11`, `8a7`. Same token, same policy.
    text = 'ε2. 1129b3. α1. 14a23. 6b11. 8a7.'
    assert space_policy.normalise(text)[0] == text


def test_sq_and_the_abbreviation_slot_are_covered():
    got, n = space_policy.normalise('Heitz p 139sqq, cfa16.')
    assert got == 'Heitz p 139 sqq, cf a16.'
    assert n['sq_after_number'] == 1
    assert n['bekker_after_word'] == 1


def test_an_already_spaced_citation_is_left_alone():
    text = '1140 a19 (fr 6). ηεγ1. 1230 a1 (fr 7).'
    got, n = space_policy.normalise(text)
    assert got == text
    assert sum(n.values()) == 0


def test_a_greek_chapter_letter_is_not_a_bekker_column():
    # ⚠ `Ηα1.` and `ε7.` are chapter numbers in GREEK letters. The class is
    # Latin `a`/`b` only, and widening it would split every chapter reference
    # in the index.
    text = 'τὸ τέλος sim Ηα1. 1094 a3. ε7. 1131 b23.'
    got, _ = space_policy.normalise(text)
    assert got == text


def test_a_citation_broken_across_a_printed_line_is_not_joined():
    # ⚠ `Πγ12. 1282\nb17.` is the same citation over a line break, and a line
    # break is not a space to insert. Repairing it is a different question and
    # this module must not answer it silently.
    text = 'ἀγαθὸν πολιτικόν Πγ12. 1282\nb17. ημα1. 1182 b5.'
    got, _ = space_policy.normalise(text)
    assert got == text


def test_applying_twice_changes_nothing_the_second_time(tmp_path):
    d = tmp_path / 'rec'
    d.mkdir()
    (d / 'page-015-L.txt').write_text('Αγ 12. 77b24. ε2. 1129b3sqq. cfa16.\n',
                                      encoding='utf-8')
    first = space_policy.run(d, apply=True)
    assert first['n'] == 2          # the sq and the abbreviation, not 77b24
    assert space_policy.run(d, apply=True)['n'] == 0


def test_a_dry_run_writes_nothing(tmp_path):
    d = tmp_path / 'rec'
    d.mkdir()
    f = d / 'page-015-L.txt'
    f.write_text('Αγ 12. 1129b3sqq.\n', encoding='utf-8')
    got = space_policy.run(d, apply=False)
    assert got['n'] == 1 and got['applied'] is False
    assert f.read_text(encoding='utf-8') == 'Αγ 12. 1129b3sqq.\n'


def test_an_empty_directory_raises_rather_than_reporting_a_clean_corpus(tmp_path):
    with pytest.raises(SystemExit):
        space_policy.run(tmp_path)


def test_the_policy_is_banked_because_the_corpus_stops_matching_the_page():
    """⚠ A reader who finds `1573 a25` must be able to learn that the space is
    editorial policy and not an observation of the ink. Everything else in this
    project preserves the printer's setting; this deliberately does not."""
    rec = space_policy.POLICY_RECORD
    assert rec.exists(), 'the applied policy was never banked'
    entries = json.loads(rec.read_text(encoding='utf-8'))
    assert entries and entries[-1]['n'] > 0
    assert 'john 2026-08-26' in entries[-1]['ruling']


def test_the_sq_slot_is_settled_across_the_whole_corpus():
    """The 29 sites the rule found on 15-106 follow from John's ruling on the
    19 in 107-117, and are applied. `1573a25` is NOT — 4532 sites still carry
    a space against his policy, and closing them up is unordered."""
    import re
    from pathlib import Path
    root = Path(space_policy.ROOT) / 'work' / 'reconciled'
    if not root.is_dir():
        pytest.skip('no reconciled corpus in this checkout')
    sq = 0
    bekker = {'15-106': 0, '107+': 0}
    for f in sorted(root.glob('page-*.txt')):
        t = f.read_text(encoding='utf-8')
        page = int(re.match(r'page-(\d+)', f.name).group(1))
        sq += len(re.findall(r'\d(?:sqq?)(?![\w])', t))
        bekker['15-106' if page <= 106 else '107+'] += len(
            re.findall(r'\d[ab]\d', t))
    assert sq == 0, f'{sq} sq/sqq are still closed up'
    # ⚠ COUNTED BY RANGE, BECAUSE THE CORPUS GROWS AND THE CLAIM DOES NOT.
    # A single total pinned to 8300 was a fact about 184 columns, and it broke
    # the day 107-117 was promoted — on work it was written to protect, which
    # is how `test_there_is_a_site_for_every_finding` lost its 27. What is
    # actually claimed is that the SETTLED range was not touched.
    assert bekker['15-106'] == 8300, 'the settled range moved'
    # And what the new tranche brought, so a later drift there is visible too.
    assert bekker['107+'] == 1549


def test_closing_bekker_up_never_crosses_a_printed_line():
    """⚠ `\\s` MATCHES A NEWLINE. 821 citations in the settled corpus are split
    across a printed line — `717` ending one and `a16` beginning the next —
    and joining them would merge two lines of a diplomatic transcription.
    Counting them as `spaced` also inflated the class from 4532 to 5353."""
    assert space_policy.BEKKER_SPACED.sub(
        r'\1\2', 'Ζγα4. 717\na16. β1. 731 b23.') == 'Ζγα4. 717\na16. β1. 731b23.'


def test_close_bekker_is_not_part_of_the_default_policy():
    # ⚠ It is the reverse of the edit that broke 122 tests, at the same scale.
    got, counts = space_policy.normalise('Πη14. 1333 a22. ημβ10. 1208 a13.')
    assert got == 'Πη14. 1333 a22. ημβ10. 1208 a13.'
    assert 'bekker_after_number' not in counts


def test_close_bekker_would_corrupt_a_continuation_citation():
    """⚠ THE REASON `--close-bekker` IS NOT RUN. `468a25 b2.` is TWO citations —
    `468a25` and `468b2` — and `25` is a line number, not a page. Closing it
    spells `468a25b2`, which cites nothing.

    Both of the two spaced citations in the whole 107-117 tranche are this
    shape, which is how it was found. A Bekker page can be two digits
    (`Κ12. 14 b6.` is Categories 14b6), so length cannot separate the classes.
    This test does not defend the behaviour; it pins the hazard so nobody
    reruns the module believing the pattern is safe.
    """
    from bonitz_pipeline.space_policy import BEKKER_SPACED
    assert BEKKER_SPACED.sub(r'\1\2', '467a19. ζ2. 468a25 b2. αν17.') == \
        '467a19. ζ2. 468a25b2. αν17.'
    assert BEKKER_SPACED.sub(r'\1\2', '69a3 sqq. δ10. 686a18, 24 b21.') == \
        '69a3 sqq. δ10. 686a18, 24b21.'
    # and it does the right thing to a real page, which is why it exists
    assert BEKKER_SPACED.sub(r'\1\2', 'ἔχειν Οβ12. 292 a22,') == \
        'ἔχειν Οβ12. 292a22,'
