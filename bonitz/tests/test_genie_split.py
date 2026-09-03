"""Genie read the whole book and nothing could see it.

Every other reader is `page-NNN-C.txt` in a directory. Genie is nine .docx
archives, so `ls raw/genie* | grep page-` returns nothing and a coverage table
built that way prints `0 files` — which reads as "genie did not read this"
rather than "my glob does not fit genie". I reported genie absent past page
117 three times in one session, and John says the slip recurs across sessions.
So the fix is not a note to remember; it is putting genie where a glob finds
it.

FOUR THINGS THIS HAS TO GET RIGHT:

THE DOCX IS THE ORIGINAL AND IS NOT TOUCHED. Its bold runs mark Bonitz's
headwords, which plain text cannot hold — so the split CARRIES THEM as `**…**`
rather than dropping them, and the archives stay exactly where they are.

PAGES, NOT COLUMNS. Genie's paragraphs are lemma entries that flow across both
columns; nothing in the file says where a column or a printed line breaks. A
`page-NNN-C.txt` at 61 lines is not derivable from genie and pretending
otherwise would invent a boundary. One file per printed page is what the
source supports.

THE RUNNING HEAD IS THE PRINTED PAGE, THE FILENAME IS THE SCAN PAGE. Genie's
heads read 88, 89, 90 where our scans read 100, 101, 102 — an offset of 12,
and `work/reconciled/page-114` is printed 102. Emitting genie under printed
numbers would put it 12 pages away from every other reader.

AND SOME HEADS CARRY NO NUMBER AT ALL. `ἀρετή`, `διαπατᾶν` — a headword and
nothing else. Those pages are filled by counting from their labelled
neighbours, and a run that does not come out monotonic is refused rather than
guessed at.
"""

import pytest

from bonitz_pipeline import genie_split as gs


def test_a_running_head_gives_up_its_printed_page():
    assert gs.head_page('88 ἀπυσία ἀποφυτεία') == 88
    assert gs.head_page('ἀποφυτεύειν | ἅπτεσθαι | 89') == 89
    assert gs.head_page('90') == 90
    assert gs.head_page('ἀραιότης — "Αργος 91') == 91


def test_a_head_with_no_number_says_so_rather_than_guessing():
    assert gs.head_page('ἀρετή') is None
    assert gs.head_page('διαπατᾶν') is None
    assert gs.head_page('Μ 2') is None          # a signature mark, not a page


def test_a_bekker_number_in_a_head_is_not_a_page_number():
    """`1403 a5` is a citation. Page numbers here run to three digits."""
    assert gs.head_page('ἀριθμός Μμ 8. 1083 ᵇ16') is None


def test_gaps_are_filled_by_counting_from_labelled_neighbours():
    assert gs.number([88, None, 90, None, None, 93]) == [88, 89, 90, 91, 92, 93]


def test_a_run_that_does_not_come_out_monotonic_is_refused():
    with pytest.raises(gs.GenieSplitError):
        gs.number([88, None, 87])


def test_a_run_with_no_label_at_all_is_refused():
    with pytest.raises(gs.GenieSplitError):
        gs.number([None, None, None])


def test_bold_runs_survive_as_headword_markers():
    """The whole reason the docx is kept — plain text would lose them."""
    xml = ('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>ἀρετή</w:t></w:r>'
           '<w:r><w:t> universe</w:t></w:r></w:p>')
    assert gs.paragraph_text(xml) == '**ἀρετή** universe'


def test_an_unbolded_paragraph_gains_no_markers():
    xml = '<w:p><w:r><w:t>plain text</w:t></w:r></w:p>'
    assert gs.paragraph_text(xml) == 'plain text'


def test_the_scan_number_is_the_printed_number_plus_the_offset():
    assert gs.scan_page(102, offset=12) == 114
    assert gs.scan_page(88, offset=12) == 100


def test_the_real_archive_yields_the_page_we_already_hold():
    """page-114 is printed 102, and its text must mention what 114 is about."""
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    doc = root / 'raw' / 'genie400' / 'bonitz-hi-res-p100-p199.docx'
    if not doc.exists():
        pytest.skip('genie400 absent')
    pages = gs.split(doc)
    assert 114 in pages, sorted(pages)[:5]
    # 114-L holds the Rhetoric/Poetics citation list and the Zeller note
    assert 'Zeller iudicat' in pages[114]


def test_one_page_split_in_two_is_rejoined_not_refused():
    """Six of the nine archives carry a `---` inside a page.

    The tell is two consecutive chunks whose heads give the SAME number: they
    are one printed page, not two, and refusing the whole archive over it
    threw away 800 pages of a reader that had already read them.
    """
    # the two 89s are one page: chunks 1 and 2 land in the same group
    assert gs.merge_split_pages([88, 89, 89, 90]) == [0, 1, 1, 2]
    # and an unlabelled chunk is its own page, never merged by accident
    assert gs.merge_split_pages([88, None, 90]) == [0, 1, 2]


def test_a_page_genie_never_produced_leaves_a_GAP_and_not_a_guess():
    """`430` then `432`: page 431 is absent, and absent is the honest record.

    Numbering the run as if nothing were missing would file 432's text under
    431 and every later page one out.
    """
    nums, missing = gs.number_with_gaps([430, None, 432])
    assert nums == [430, 431, 432] and missing == []
    nums, missing = gs.number_with_gaps([430, 432])
    assert nums == [430, 432] and missing == [431]


def test_a_gap_that_runs_backward_is_still_refused():
    with pytest.raises(gs.GenieSplitError):
        gs.number_with_gaps([88, 87])


# --- the column cut, found by alignment ------------------------------------

def test_the_cut_is_found_by_alignment_and_not_by_proportion():
    """Genie's text is a different LENGTH from the corpus, so halving is wrong.

    It is ordered, though — L complete, then R, 112 probes across eleven pages
    with zero inversions — so the boundary can be located rather than guessed.
    """
    page = 'alpha beta gamma DELTA epsilon zeta'
    L, R = 'alpha beta gamma', 'DELTA epsilon zeta'
    a, b = gs.split_columns(page, L, R)
    assert a.strip() == 'alpha beta gamma'
    assert b.strip() == 'DELTA epsilon zeta'


def test_the_two_halves_rejoin_to_the_whole_page():
    """Nothing may be dropped or duplicated at the seam."""
    page = 'alpha beta gamma DELTA epsilon zeta'
    a, b = gs.split_columns(page, 'alpha beta gamma', 'DELTA epsilon zeta')
    assert a + b == page


def test_genie_wording_need_not_match_the_corpus_exactly():
    """It is a different reader; the cut rides on what DOES align."""
    page = 'alpha beta gamna DELTA epsilon zeta'      # gamna, not gamma
    a, b = gs.split_columns(page, 'alpha beta gamma', 'DELTA epsilon zeta')
    assert 'DELTA' in b and 'DELTA' not in a


def test_an_unalignable_page_is_refused_rather_than_cut_at_a_guess():
    """A cut nobody can justify is worse than no column split at all."""
    with pytest.raises(gs.GenieSplitError):
        gs.split_columns('completely unrelated words here',
                         'alpha beta gamma', 'DELTA epsilon zeta')


def test_the_columns_do_not_pretend_to_hold_printed_lines():
    """Genie has lemma paragraphs, not the 61 printed lines kraken has.

    A file claiming 61 lines would invite `zip(alto_boxes, lines)` and pair
    the wrong ink with the wrong text.
    """
    page = 'alpha beta gamma DELTA epsilon zeta'
    a, b = gs.split_columns(page, 'alpha beta gamma', 'DELTA epsilon zeta')
    assert len(a.splitlines()) != 61 and len(b.splitlines()) != 61


def test_the_head_is_read_as_a_block_not_as_one_paragraph():
    """Genie breaks a running head across up to three paragraphs.

    Reading only the first found a number on 11 of the 16 pages of the
    selection archive; the five it missed were then filled by interpolation
    from a neighbour, and in a selection a neighbour is hundreds of pages away.
    """
    assert gs.head_number(['ἐνεότης', 'ἔνθεος', '251']) == 251
    assert gs.head_number(['**Λίγυς**', '**λιπαρός**', '**431**']) == 431
    assert gs.head_number(['ὄρνις 529 ὅρος']) == 529
    assert gs.head_number(['ἁπλῶς', '77', 'ἀπό']) == 77


def test_the_page_is_the_last_number_in_the_head_not_the_first():
    """`460 / μεταπείθειν / μεταφέρειν / 461` — the verso's number carried
    over ahead of the head belonging to this page. The page is 461."""
    assert gs.head_number(
        ['460', 'μεταπείθειν', 'μεταφέρειν', '461']) == 461


def test_an_entry_is_not_head_material():
    """The gate is what keeps a citation from being read as a page number."""
    assert not gs.looks_like_head('ἐνεότης π. 40. 895 a 16.')
    assert not gs.looks_like_head('ἀριθμός Μμ 8. 1083 ᵇ16')
    assert gs.looks_like_head('ὄρνις 529 ὅρος')
    assert gs.looks_like_head('**πολύσαρκος** — **πολυχρόνιος** — **619**')


def test_the_head_block_stops_at_the_first_entry():
    """A page opening `ἐνεότης / ἔνθεος / 251 / ἐνεότης π. 40. 895 a 16.`
    is page 251, not page 895."""
    assert gs.head_number(
        ['ἐνεότης', 'ἔνθεος', '251', 'ἐνεότης π. 40. 895 a 16.']) == 251
    assert gs.head_number(['ἀρετή', 'ἀριθμός Μμ 8. 1083 ᵇ16']) is None


def _docx(path, paragraphs):
    """The smallest .docx `split` will read: one `word/document.xml`."""
    import zipfile
    body = ''.join(
        f'<w:p><w:r><w:t>{t}</w:t></w:r></w:p>' for t in paragraphs)
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('word/document.xml',
                   f'<w:document><w:body>{body}</w:body></w:document>')

def test_a_page_the_run_did_not_write_does_not_survive_from_the_last_run(tmp_path):
    """Renumbering moves pages, and the file left at the old number still
    answers a coverage glob — genie would look to have read a page it has
    not read, which is the one mistake this module exists to stop."""
    src = tmp_path / 'src'; src.mkdir()
    out = tmp_path / 'out'; out.mkdir()
    (out / 'page-636.txt').write_text('from an earlier run', encoding='utf-8')
    (out / 'page-636-L.txt').write_text('stale', encoding='utf-8')
    _docx(src / 'a.docx', ['77', 'ἀπό', gs.SEP, '78', 'ἀπόδειξις'])
    gs.main(['--src', str(src), '--out', str(out)])
    assert not (out / 'page-636.txt').exists()
    assert not (out / 'page-636-L.txt').exists()
    assert (out / 'page-089.txt').exists()      # printed 77 is scan 89


def test_a_citation_in_a_short_paragraph_is_not_a_page_number():
    """`ναυπηγεῖσθαι τριήρεις μέλλων οβ 1349 a 25` is eight tokens and every
    one of them passes the shape test — it made page 481 into page 25.

    A head carries at most its own page number. Two numbers means a citation,
    and the book ends at printed 878, so anything above 900 is one too.
    """
    assert not gs.looks_like_head('ναυπηγεῖσθαι τριήρεις μέλλων οβ 1349 a 25')
    assert not gs.looks_like_head('Πδ 1288 20')
    assert gs.looks_like_head('ναυπηγεῖσθαι — νέμειν | 481')
    assert gs.head_number(['ναυπηγεῖσθαι — νέμειν | 481',
                           'ναυπηγεῖσθαι τριήρεις μέλλων οβ 1349 a 25']) == 481


def test_a_chunk_two_distant_anchors_cannot_pin_is_left_unplaced():
    """Counting up from the anchor before it is right in a RUN and wrong in a
    SELECTION: with 759 before and 878 after, an unlabelled chunk could be any
    of 760-877, and calling it 760 invents a page number from position."""
    nums, missing = gs.number_with_gaps([759, None, 878])
    assert nums[1] is None
    assert 760 in missing and 877 in missing
    # a gap the anchors DO pin is still filled
    nums, missing = gs.number_with_gaps([430, None, 432])
    assert nums == [430, 431, 432] and missing == []


def test_the_bekker_column_letter_is_written_plain():
    """Genie types it as a superscript where the corpus uses plain `a`.

    `canonical()` does not fold modifier letters onto their base, so every
    citation on the page counted as a difference — 3958 false hits across the
    103 pages with a corpus column to compare against, and a faked 4-point
    accuracy gap between two passes that had read the page identically.
    """
    assert gs.plain_column_letter('1095ᵃ1. 1147ᵇ20.') == '1095a1. 1147b20.'
    assert gs.plain_column_letter('775 ª18') == '775 a18'
    # Bonitz has no column c; 12 stray superscripts are left alone, not guessed
    assert gs.plain_column_letter('308ᶜ7') == '308ᶜ7'
    # and the Greek is untouched
    assert gs.plain_column_letter('ἁπλῶς — ἀπό') == 'ἁπλῶς — ἀπό'
