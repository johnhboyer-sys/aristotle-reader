"""A spine that changes engine at the line, and a queue that can see Latin."""

import json
from pathlib import Path

import pytest

from bonitz_pipeline import carry_rulings, compare4, latin_spine
from bonitz_pipeline import word_flags as wf
from bonitz_pipeline.normalize import canonical


# --- which language is this line in? ----------------------------------------

def test_a_line_kraken_hellenised_is_still_classed_latin():
    # The documented blind spot: kraken turns Latin `p` into Greek `ρ`. Judged
    # from kraken's read alone this line looks part-Greek and would keep the
    # spine that got it wrong — which is the one line that most needs the
    # switch.
    kraken = 'quas extremo locο ρosuimus veluti'
    calamari = 'quas extremo loco posuimus veluti'
    assert latin_spine.line_script(kraken, calamari) == latin_spine.LATIN


def test_greek_prose_stays_on_kraken():
    line = 'ἀλλὰ καὶ τῶν ἄλλων ζῴων ἕκαστον'
    assert latin_spine.line_script(line, line) == latin_spine.GREEK


def test_a_mixed_line_is_not_handed_to_the_latin_engine():
    # Its Greek is the bulk of the characters and kraken reads Greek better,
    # so switching would buy a Latin gain with a Greek loss.
    line = 'βέστερον ἂν θεωρηθείη ἐκ (ipsis verbis'
    assert latin_spine.line_script(line, line) == latin_spine.MIXED


# --- building the mixed column ----------------------------------------------

def test_the_latin_line_comes_from_calamari_and_the_greek_from_kraken():
    kraken = 'ἀλλὰ καὶ τῶν ἄλλων\nmentionibus Aristofeles addit\n'
    calamari = 'ἀλλα και τῶν ἄλλων\nmentionibus Aristoteles addit\n'
    text, engines, scripts = latin_spine.build_column(kraken, calamari)
    assert scripts == [latin_spine.GREEK, latin_spine.LATIN]
    assert engines == ['kraken-r6', 'calamari-r2']
    lines = text.splitlines()
    assert lines[0] == 'ἀλλὰ καὶ τῶν ἄλλων'          # kraken's accents kept
    assert lines[1] == 'mentionibus Aristoteles addit'  # calamari's Latin taken


def test_a_line_count_mismatch_is_refused_rather_than_spliced():
    # Both reads come off the SAME filtered ALTO at the same 61 lines. A
    # mismatch means one of them is not what it claims to be, and zipping them
    # by index would attach calamari's line 40 to kraken's line 41.
    with pytest.raises(ValueError, match='line count differs'):
        latin_spine.build_column('a\nb\nc\n', 'a\nb\n')


def test_the_sidecar_names_an_engine_for_every_line(tmp_path):
    k, c = tmp_path / 'k', tmp_path / 'c'
    for d, latin_word in ((k, 'Aristofeles'), (c, 'Aristoteles')):
        d.mkdir()
        for col in 'LR':
            (d / f'page-107-{col}.txt').write_text(
                f'ἀλλὰ καὶ τῶν ἄλλων\nmentionibus {latin_word} addit\n',
                encoding='utf-8')
    doc = latin_spine.build([107], k, c, tmp_path / 'out')
    assert doc['n_lines'][latin_spine.LATIN] == 2
    assert doc['n_lines'][latin_spine.GREEK] == 2
    for key in ('107-L', '107-R'):
        assert doc['columns'][key]['engines'] == ['kraken-r6', 'calamari-r2']
    written = json.loads((tmp_path / 'out' / 'spine-engines.json')
                         .read_text(encoding='utf-8'))
    assert written['columns'] == doc['columns']


# --- the twin map, and the vote it protects ---------------------------------

def test_twin_intervals_name_the_engine_behind_each_stream_character():
    base = 'ἀβγ\nabc\n'
    stream, offs = canonical(base)
    got = latin_spine.twin_intervals(base, offs, ['kraken-r6', 'calamari-r2'])
    # Contiguous, non-overlapping, and covering exactly the stream.
    assert got[0][0] == 0 and got[-1][1] == len(stream)
    assert [name for _, _, name in got] == ['kraken', 'calamari']


def test_the_engine_that_wrote_the_line_does_not_vote_on_it():
    # Two columns' worth of stream: kraken wrote the first half, calamari the
    # second. Without the muting kraken agrees with itself on its own half and
    # the spine's reading is tallied twice — the two-LlamaParse-variants
    # mistake in a new place.
    spine = 'αβγδ'
    segs = [compare4.Segment(107, 'L', 0, 4)]
    readers = {'kraken': 'αβγδ', 'calamari': 'αβχδ', 'genie': 'αβχδ'}
    twins = [(0, 4, 'kraken')]

    muted = compare4.compare(spine, segs, readers, spine_twins=twins)
    unmuted = compare4.compare(spine, segs, readers)
    # Muted: spine + genie + calamari, and the two voters outvote the spine.
    assert [r['cls'] for r in muted] == ['spine-outvoted']
    assert muted[0]['spine_from'] == 'kraken'
    # kraken's reading is still SHOWN — it is never counted, never hidden.
    assert muted[0]['kraken'] == 'γ'
    # Unmuted, kraken's copy of the spine turns the same evidence into a tie.
    assert unmuted[0]['cls'] != 'spine-outvoted'


def test_spine_engine_at_reports_nothing_outside_the_intervals():
    twins = [(0, 3, 'kraken'), (3, 6, 'calamari')]
    assert compare4.spine_engine_at(twins, 0) == 'kraken'
    assert compare4.spine_engine_at(twins, 3) == 'calamari'
    assert compare4.spine_engine_at(twins, 9) is None
    assert compare4.spine_engine_at([], 0) is None


# --- the widened word class -------------------------------------------------

def test_latin_widens_the_word_class_without_admitting_a_citation():
    assert not wf.is_word_char('p')
    assert wf.is_word_char('p', latin=True)
    assert wf.is_word_char('ſ', latin=True)
    # Digits stay out under both: a Bekker citation is not a word, and the
    # citation sweep is its own sitting.
    assert not wf.is_word_char('1', latin=True)
    assert not wf.is_word_char('.', latin=True)


def test_the_ou_ligature_is_greek_even_though_unicode_calls_it_latin():
    # ⚠ `ȣ` is U+0223 LATIN SMALL LETTER OU and is Bonitz's GREEK ou-ligature,
    # 2,204 of them in the corpus. It is admitted as Greek, and the Latin range
    # stops short of it so widening cannot reclassify a single one.
    assert wf.is_word_char('ȣ')
    assert wf.is_word_char('ȣ', latin=True)


def _column(d: Path, page: int, col: str, lines: list[str]) -> None:
    d.mkdir(parents=True, exist_ok=True)
    (d / f'page-{page:03d}-{col}.txt').write_text(
        '\n'.join(lines) + '\n', encoding='utf-8')


def _latin_flag(tmp_path):
    spine = tmp_path / 'txt'
    _column(spine, 107, 'L', ['nondum significatur, scniptos iam libros'])
    stream, _ = canonical((spine / 'page-107-L.txt').read_text(encoding='utf-8'))
    off = stream.index('scnipt') + 2          # the disputed `n`
    flags = tmp_path / 'flags.jsonl'
    flags.write_text(json.dumps({
        'page': 107, 'col': 'L', 'spine_off': off, 'opus': 'n',
        'genie': 'r', 'llama': 'r', 'calamari': 'r',
        'cls': 'spine-outvoted', 'flag': True,
    }, ensure_ascii=False) + '\n', encoding='utf-8')
    return spine, flags


def test_a_latin_word_dispute_survives_the_merge(tmp_path):
    # ⚠ THE BUG THIS TEST EXISTS FOR. `_merge_word_sites` re-checks the merged
    # word against the character class. Greek-only there threw away every
    # Latin reconstruction `_site_words` had just built, leaving `opus` alone,
    # which fell out as `merge_no_dispute` — 99 sites on 107-117, and it made
    # carding the Latin look like it had gained five cards.
    spine, flags = _latin_flag(tmp_path)
    rep = wf.report(flags, opus_dir=spine, cleaner=lambda t: t, latin=True)
    assert [e.reason for e in rep.excluded] == []
    assert len(rep.words) == 1
    w = rep.words[0]
    assert w.readers['opus'].startswith('scnipt')
    assert {v for k, v in w.readers.items() if k != 'opus'} == {
        w.readers['opus'].replace('scnipt', 'script')}


def test_without_the_flag_the_same_site_is_excluded_and_says_so(tmp_path):
    spine, flags = _latin_flag(tmp_path)
    rep = wf.report(flags, opus_dir=spine, cleaner=lambda t: t)
    assert rep.words == []
    # The name has to be true: Greek-only really did not look at Latin.
    assert [e.reason for e in rep.excluded] == ['not_greek_word']


def test_the_widened_exclusion_does_not_claim_latin_was_never_looked_at(tmp_path):
    spine = tmp_path / 'txt'
    _column(spine, 107, 'L', ['locis 1094a1 citatis'])
    stream, _ = canonical((spine / 'page-107-L.txt').read_text(encoding='utf-8'))
    flags = tmp_path / 'flags.jsonl'
    flags.write_text(json.dumps({
        'page': 107, 'col': 'L', 'spine_off': stream.index('1094'), 'opus': '1',
        'genie': 'l', 'cls': 'spine-outvoted', 'flag': True,
    }, ensure_ascii=False) + '\n', encoding='utf-8')
    rep = wf.report(flags, opus_dir=spine, cleaner=lambda t: t, latin=True)
    assert [e.reason for e in rep.excluded] == ['not_a_word']


# --- carrying a sitting across a re-spine -----------------------------------

def _queue(path: Path, entries: list[dict]) -> None:
    path.write_text(json.dumps({'entries': entries}, ensure_ascii=False),
                    encoding='utf-8')


def test_a_ruling_is_carried_across_a_respine_that_moved_every_offset(tmp_path):
    # ⚠ `word_off` is an offset INTO THE SPINE. It survives a reader being
    # re-read and does not survive the spine being rebuilt: `latin_spine` swaps
    # calamari's line in for kraken's and moves every offset after it in the
    # column. Keyed by offset, John's whole sitting is asked again.
    def entry(word_off):
        return {'page': 113, 'col': 'L', 'line': 22, 'word_off': word_off,
                'char_at': 4, 'kind': 'letters', 'reason': 'cold:letters',
                'readers': {'opus': 'Γα', 'genie': 'Ια'},
                'forms': ['Γα', 'Ια'], 'form_set': ['Γα', 'Ια'],
                'n_same_form_set': 1}

    old_q, new_q = tmp_path / 'old.json', tmp_path / 'new.json'
    _queue(old_q, [entry(500)])
    # Same printed site, moved by the re-spine, and the form-set has gained
    # genie's Latin lookalike so the CARD is renamed too.
    moved = entry(517)
    moved['readers'] = {'opus': 'Γα', 'genie': 'Ια', 'llama': 'Γa'}
    moved['forms'] = moved['form_set'] = ['Γa', 'Γα', 'Ια']
    _queue(new_q, [moved])

    rulings = tmp_path / 'rulings.json'
    rulings.write_text(json.dumps({'forms:Γα|Ια': {'verdict': 'preserve',
                                                   'detail': 'Γα'}}),
                       encoding='utf-8')

    by_off, todo_off, _ = carry_rulings.carry(new_q, old_q, rulings,
                                              carry_rulings.by_offset)
    assert by_off == {} and len(todo_off) == 1      # the offset key carries nothing

    carried, todo, conflicts = carry_rulings.carry(new_q, old_q, rulings,
                                                   carry_rulings.by_line)
    assert conflicts == [] and todo == []
    assert carried == {'forms:Γa|Γα|Ια': {'verdict': 'preserve',
                                          'detail': 'Γα',
                                          'carried_from': ['forms:Γα|Ια']}}
