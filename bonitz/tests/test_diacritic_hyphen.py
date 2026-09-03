"""A word Bonitz broke at the column edge is one word, not two fragments.

The sweep compared each line's tokens against whole-word LlamaParse forms. A
head like `ἀνά-` or a tail like `γνωσις` has no accent where the joined word
does, so the reference disagreed every time. On the 176-column corpus that was
136 of 247 flagged positions — more than half of what the sweep put in front of
a human was its own line breaking.
"""
import unicodedata

from bonitz_pipeline.diacritic_sweep import WORD, column_words


def _words(lines):
    return [(n, w) for n, w, _ in column_words(lines)]


def test_a_word_broken_at_the_column_edge_is_reported_once_and_whole():
    # page-059-R lines 22-23, verbatim.
    lines = ['ἀνάληψις. ἡ τȣ͂ κηρȣ͂ ἀνάληψις ὦπται Ζιι40. 624 b9. — ἀνά-',
             'ληψις μνήμης, dist λῆψις μν2. 451 a30.']
    got = _words(lines)
    assert (1, 'ἀνάληψις') in got, got
    assert not any(w == 'ἀνά' for _, w in got)
    assert not any(w == 'ληψις' for _, w in got)


def test_the_joined_word_is_attributed_to_the_head_line():
    """Where the accent under question is printed, not where the tail fell."""
    lines = ['ἀναγνώρισις). τὸ ἔργον τῆς ἐπιδεικτικῆς λέξεώς ἐστιν ἀνά-',
             'γνωσις Ργ12. 1414a18.']
    joined = [(n, w) for n, w in _words(lines) if w == 'ἀνάγνωσις']
    assert joined == [(1, 'ἀνάγνωσις')], _words(lines)


def test_the_context_shows_both_printed_lines():
    lines = ['ἐστιν ἀνά-', 'γνωσις Ργ12.']
    ctx = next(c for _, w, c in column_words(lines) if w == 'ἀνάγνωσις')
    assert 'ἀνά-' in ctx and 'γνωσις' in ctx


def test_a_hyphen_inside_a_line_is_bonitz_s_own_and_joins_nothing():
    """He sets `ἀ-γνοιαν` to show the morphology. That is not a line break."""
    lines = ['τὴν ἀ-γνοιαν λέγει Ηγ2.', 'ἄλλος λόγος.']
    got = _words(lines)
    assert not any('ἄλλος' in w and w != 'ἄλλος' for _, w in got), got
    assert (2, 'ἄλλος') in got


def test_a_line_ending_in_a_hyphen_after_a_number_joins_nothing():
    """Rule 1 of the sweep is that it never invents a word."""
    lines = ['624 b9-', 'ληψις μνήμης']
    got = _words(lines)
    assert (2, 'ληψις') in got, got


def test_every_word_of_a_plain_column_still_arrives_exactly_once():
    lines = ['ἀναλέγειν, ὁ δρυοκολάπτης ἀναλέγεται σκώληκας Ζιι9. 614 b1.',
             'ἀναλίσκειν, syn δαπανᾶν Ηδ6. 1123 a26.']
    plain = [(n, w) for n, line in enumerate(lines, 1)
             for w in WORD.findall(line)]
    assert _words(lines) == plain


def test_the_real_corpus_has_no_fragment_left_in_the_sweep_output():
    """The whole point, measured against the corpus rather than a fixture."""
    from bonitz_pipeline.normalize import corpus_columns
    from bonitz_pipeline.diacritic_sweep import clean_opus
    fragments = 0
    for p in corpus_columns():
        lines = unicodedata.normalize(
            'NFC', clean_opus(p.read_text(encoding='utf-8'))).splitlines()
        for _, w, _ in column_words(lines):
            if w.endswith('-'):
                fragments += 1
    assert fragments == 0
