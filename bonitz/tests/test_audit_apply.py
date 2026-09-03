"""The apply step for the ground-truth audit queue.

Every test here is a failure this project has already paid for once:

  * a ruling written to the wrong line, because the card's text and the
    corpus spell a Bekker reference differently;
  * a ruling applied after the card it was made on had been rebuilt in
    another shape (the 78 dissolved cards of 2026-08-10);
  * two rulings on one line, refused as a conflict when they agreed;
  * a ruling that reached sites John never saw, because the member list is
    re-derived from a corpus this step is editing;
  * a keep that left no trace anywhere, which is how a keep dies.
"""

import json

import pytest

from bonitz_pipeline import audit_apply as aa
from bonitz_pipeline import audit_review as review
from bonitz_pipeline import john_rulings

COL = 'page-999-L'


@pytest.fixture(autouse=True)
def clean_corpus_cache():
    aa._LINES.clear()
    yield
    aa._LINES.clear()


def stage(*lines: str) -> None:
    """A column in memory, so a test never touches work/reconciled."""
    aa._LINES[COL] = list(lines)


def perline_card(gt: str, reading: str) -> review.Card:
    return review.Card(f'{COL}:_x', COL, '_x', 'letter', gt,
                       {'kraken e26': reading})


# --- carrying an edit through the printed Bekker gap --------------------------

def test_a_fix_keeps_the_bekker_space_the_card_never_saw():
    """The card reads `1136a33`, the corpus prints `1136 a33`. A wholesale
    line swap would strip a space nobody ruled on — and John ruled that space
    a matter of RENDERING, not of the record."""
    raw = 'τὸν αὑτὸν ἀδικεῖν Hε15. 1136 a33.'
    got = aa.remap(raw, 'τὸν αὑτὸν ἀδικεῖν Ηε15. 1136a33.')
    assert got == 'τὸν αὑτὸν ἀδικεῖν Ηε15. 1136 a33.'


def test_remap_refuses_when_it_cannot_reproduce_the_ruling():
    """The post-condition is the whole guard: strip the spaces back out and
    the result must be exactly what John ruled, or nothing is written."""
    with pytest.raises(aa.ApplyError):
        aa.remap('τι 15 a3.', 'wholly different text')


def test_locate_refuses_a_text_that_matches_no_line():
    stage('ἀγαθόν Ρα7. 1365 b16.')
    assert aa.locate(COL, 'ἀγαθόν Ρα7. 1365b16.') == (1, False)
    with pytest.raises(aa.ApplyError):
        aa.locate(COL, 'a line this column does not hold')


def test_locate_finds_a_line_that_already_reads_what_was_ruled():
    """The second run must not refuse the first run's work: John has 248
    cards still to rule, and this step will be run again."""
    stage('ἀγαθὸν Ρα7.')
    assert aa.locate(COL, 'ἀγαθόν Ρα7.', 'ἀγαθὸν Ρα7.') == (1, True)


def test_locate_refuses_a_text_that_matches_twice():
    """Two identical lines cannot be told apart, and the wrong one is the
    edit nobody would catch."""
    stage('ἴδε ἄλλο.', 'ἴδε ἄλλο.')
    with pytest.raises(aa.ApplyError):
        aa.locate(COL, 'ἴδε ἄλλο.')


# --- a ruling is checked against the card that produced it --------------------

def test_a_ruling_whose_detail_is_no_longer_an_option_is_refused():
    """The signature of a card rebuilt under an answer already given. It must
    stop the run, not be guessed at."""
    stage('ἀγαθόν Ρα7.')
    card = perline_card('ἀγαθόν Ρα7.', 'ἀγαθὸν Ρα7.')
    plan = aa.resolve({card.sid: card},
                      {card.sid: {'verdict': 'fix',
                                  'detail': 'something else entirely'}}, {})
    assert not plan.edits
    assert plan.refusals and 'rebuilt in a different shape' in \
        plan.refusals[0][1]


def test_a_keep_is_resolved_and_changes_nothing():
    stage('ἀγαθόν Ρα7.')
    card = perline_card('ἀγαθόν Ρα7.', 'ἀγαθὸν Ρα7.')
    plan = aa.resolve({card.sid: card},
                      {card.sid: {'verdict': 'keep', 'detail': 'ἀγαθόν Ρα7.'}},
                      {})
    assert not plan.refusals
    final, clashes = aa.compose(plan)
    assert (final, clashes) == ({}, [])
    assert plan.edits[0].verdict == 'keep'      # recorded all the same


# --- two rulings, one line ----------------------------------------------------

def test_two_rulings_touching_one_line_in_different_places_both_apply():
    """page-021-R:4: the siglum sweep rules the `H` a Greek `Η`; the line's
    own card rules the same `H` AND a missing space. Compared as whole
    strings they look like a conflict. They are not."""
    raw = 'ἀδικεῖν Hε15. 12.1136b17.'
    edits = [
        aa.Edit('siglum', COL, 1, 'line', 'fix', old=raw,
                new='ἀδικεῖν Ηε15. 12.1136b17.'),
        aa.Edit('perline', COL, 1, 'line', 'fix', old=raw,
                new='ἀδικεῖν Ηε15. 12. 1136b17.'),
    ]
    assert aa._compose(raw, edits) == 'ἀδικεῖν Ηε15. 12. 1136b17.'


def test_two_rulings_that_disagree_on_one_character_refuse():
    raw = 'ἀδικεῖν Hε15.'
    edits = [
        aa.Edit('a', COL, 1, 'line', 'fix', old=raw, new='ἀδικεῖν Ηε15.'),
        aa.Edit('b', COL, 1, 'line', 'fix', old=raw, new='ἀδικεῖν Νε15.'),
    ]
    with pytest.raises(aa.ApplyError):
        aa._compose(raw, edits)


def test_a_line_ruling_made_against_text_the_line_no_longer_holds_refuses():
    with pytest.raises(aa.ApplyError):
        aa._compose('what the line reads now',
                    [aa.Edit('a', COL, 1, 'line', 'fix',
                             old='what it read then', new='something else')])


def test_a_token_ruling_another_ruling_already_satisfied_is_not_a_conflict():
    """page-021-R:13: the siglum sweep rewrites both `Pα` with the whole
    line, so the glyph-pair ruling that binds the same sites finds nothing
    left to do. Its outcome holds."""
    raw = 'εἴδη Pα13. μεῖζον Pα14.'
    edits = [
        aa.Edit('sweep', COL, 1, 'line', 'fix', old=raw,
                new='εἴδη Ρα13. μεῖζον Ρα14.'),
        aa.Edit('encoding:P-Ρ', COL, 1, 'token', 'fix',
                token='Pα', becomes='Ρα'),
    ]
    assert aa._compose(raw, edits) == 'εἴδη Ρα13. μεῖζον Ρα14.'


def test_a_token_ruling_whose_spelling_has_simply_vanished_refuses():
    with pytest.raises(aa.ApplyError):
        aa._compose('εἴδη Μα13.',
                    [aa.Edit('encoding:P-Ρ', COL, 1, 'token', 'fix',
                             token='Pα', becomes='Ρα')])


def test_a_token_rewrite_takes_whole_runs_not_substrings():
    """`οβ` is the Oeconomica siglum and also two letters inside φόβος."""
    got, n = aa._replace_runs('φόβος oβ1351.', 'oβ', 'οβ')
    assert (got, n) == ('φόβος οβ1351.', 1)


# --- the siglum space is a rendering rule, and only that ----------------------

def test_the_siglum_space_is_recorded_not_refused():
    """⚠ IT USED TO REFUSE, AND A REFUSAL BLOCKS THE WHOLE WRITE. John pressed
    B on a 65-site spacing bundle of which fifteen were siglum gaps, and 18
    good lines could not be written because of it. His ruling is not wrong —
    it is about how the text RENDERS, which he settled on 2026-08-13 — so it
    is recorded under its own exception and the sitting goes in."""
    with pytest.raises(aa.RenderingOnly):
        aa._guard_siglum_space('Ηε10. 1135a24', 'Ηε 10. 1135a24')
    assert not issubclass(aa.RenderingOnly, aa.ApplyError)


def test_a_word_division_mend_is_not_the_siglum_space():
    """`ἀξιȣ͂ νἀξίωμ` → `ἀξιȣ͂ν ἀξίωμ` is where a WORD divides — the sweep's
    own finding, and nothing to do with sigla. The first guard written here
    swallowed it, and two more like it."""
    aa._guard_siglum_space('μηδὲν ἀξιȣ͂ νἀξίωμ᾽', 'μηδὲν ἀξιȣ͂ν ἀξίωμ᾽')
    aa._guard_siglum_space('100a3sqq. εἴ τις', '100a3 sqq. εἴ τις')


# --- a class ruling binds the sites it was shown, and no others ---------------

def encoding_card(*members: tuple[str, int, str]) -> review.Card:
    ms = [review.Member(f'{c}:L{n}:{t}', c, n, t, t) for c, n, t in members]
    return review.Card('encoding:P-Ρ', members[0][0], '', 'encoding',
                       'P / Ρ', {}, members=ms,
                       options=[('fix', 'Greek Ρ', 'Ρ', '', ''),
                                ('fix', 'Latin P', 'P', '', ''),
                                ('keep', 'both stand', 'leave both spellings',
                                 '', '')])


def test_an_excluded_site_is_not_edited():
    stage('εἴδη Pα13.', 'ἄλλο Pα14.')
    card = encoding_card((COL, 1, 'Pα'), (COL, 2, 'Pα'))
    plan = aa.resolve({card.sid: card},
                      {card.sid: {'verdict': 'fix', 'detail': 'Ρ',
                                  'excluded': [f'{COL}:L2:Pα']}}, {})
    assert not plan.refusals
    assert [(e.col, e.line) for e in plan.edits] == [(COL, 1)]
    assert plan.classes[0]['sites'] == [f'{COL}:L1:Pα']


def test_a_class_ruling_refuses_when_a_site_no_longer_holds_its_spelling():
    """The member list is re-derived from a corpus this step edits. A member
    whose spelling has gone means the ruling is being applied to a set John
    did not rule on."""
    stage('εἴδη Μα13.')
    card = encoding_card((COL, 1, 'Pα'))
    plan = aa.resolve({card.sid: card},
                      {card.sid: {'verdict': 'fix', 'detail': 'Ρ'}}, {})
    assert plan.refusals and 'no longer holds' in plan.refusals[0][1]


def test_a_class_site_an_earlier_run_already_wrote_is_not_a_refusal():
    """`Ρα` is what the ruling asked for. Finding it already there is the
    step having done its work, not the corpus having moved."""
    stage('εἴδη Ρα13.')
    card = encoding_card((COL, 1, 'Pα'))
    plan = aa.resolve({card.sid: card},
                      {card.sid: {'verdict': 'fix', 'detail': 'Ρ'}}, {})
    assert not plan.refusals and not plan.edits
    assert plan.classes[0]['sites'] == [f'{COL}:L1:Pα']


def test_keep_on_a_glyph_pair_leaves_both_spellings():
    stage('εἴδη Pα13.')
    card = encoding_card((COL, 1, 'Pα'))
    plan = aa.resolve({card.sid: card},
                      {card.sid: {'verdict': 'keep',
                                  'detail': 'leave both spellings'}}, {})
    assert not plan.refusals and not plan.edits
    assert plan.classes[0]['verdict'] == 'keep'      # still recorded


# --- the ledger, which is the point of the step -------------------------------

@pytest.fixture
def ledger(tmp_path, monkeypatch):
    path = tmp_path / 'john.json'
    monkeypatch.setattr(john_rulings, 'LEDGER', path)
    return path


def test_every_ruling_reaches_the_ledger_including_the_keeps(ledger):
    """⚠ THE WHOLE REASON THIS STEP EXISTS. `audit-rulings.json` is a sixth
    store `migrate()` cannot see; a ruling that stops here is one rebuild
    from gone."""
    stage('ἀγαθόν Ρα7.', 'ἕτερον Ρα8.')
    keep = review.Card(f'{COL}:_a', COL, '_a', 'letter', 'ἀγαθόν Ρα7.',
                       {'kraken e26': 'ἀγαθὸν Ρα7.'})
    none = review.Card(f'{COL}:_b', COL, '_b', 'letter', 'ἕτερον Ρα8.',
                       {'kraken e26': 'ἕτερὸν Ρα8.'})
    plan = aa.resolve({keep.sid: keep, none.sid: none},
                      {keep.sid: {'verdict': 'keep', 'detail': 'ἀγαθόν Ρα7.'},
                       none.sid: {'verdict': 'none', 'detail': ''}}, {})
    aa.record_ledger(plan, {})
    kinds = {r['kind'] for r in json.loads(ledger.read_text())['rulings']}
    assert kinds == {'keep', 'declined'}


def test_a_class_ruling_records_the_sites_it_resolved_to(ledger):
    """The member list was never stored with the verdict — the queue
    re-derives it every build. This is where the scope John actually ruled on
    stops being re-computable and starts being recorded."""
    stage('εἴδη Pα13.')
    card = encoding_card((COL, 1, 'Pα'))
    plan = aa.resolve({card.sid: card},
                      {card.sid: {'verdict': 'fix', 'detail': 'Ρ'}}, {})
    aa.record_ledger(plan, {})
    entry = [r for r in json.loads(ledger.read_text())['rulings']
             if r['kind'] == 'policy'][0]
    assert entry['quote'] == f'{COL}:L1:Pα'
    assert '1 sites bound' in entry['note']


def test_two_rulings_on_one_line_both_reach_the_ledger(ledger):
    """⚠ `add()` ids a ruling as col:line:form, so two cards answering one
    line produce ONE id and the second silently replaced the first. Two of
    John's rulings vanished that way while this step reported success."""
    stage('ἀδικεῖν Hε15. 12.1136b17.')
    plan = aa.Plan(edits=[
        aa.Edit('sweep:sid', COL, 1, 'line', 'fix',
                old='ἀδικεῖν Hε15. 12.1136b17.',
                new='ἀδικεῖν Ηε15. 12.1136b17.'),
        aa.Edit('perline:sid', COL, 1, 'line', 'fix',
                old='ἀδικεῖν Hε15. 12.1136b17.',
                new='ἀδικεῖν Ηε15. 12. 1136b17.'),
    ])
    aa.record_ledger(plan, {(COL, 1): 'ἀδικεῖν Ηε15. 12. 1136b17.'})
    assert aa.recorded_sids() == {'sweep:sid', 'perline:sid'}
    assert len(json.loads(ledger.read_text())['rulings']) == 1


def test_a_superseded_ruling_is_recorded_rather_than_dropped(ledger):
    """The rulings John gave to cards this session then renamed. Nothing is
    applied from them; leaving them out would let the rename finish the job
    of losing them."""
    plan = aa.Plan(superseded=[('encoding:Ρα', 'superseded by encoding:P-Ρ')])
    aa.record_ledger(plan, {})
    assert aa.recorded_sids() == {'encoding:Ρα'}


def test_recording_twice_records_each_ruling_once(ledger):
    """`add()` replaces by id, so a re-run converges instead of doubling."""
    stage('ἀγαθόν Ρα7.')
    card = perline_card('ἀγαθόν Ρα7.', 'ἀγαθὸν Ρα7.')
    plan = aa.resolve({card.sid: card},
                      {card.sid: {'verdict': 'keep', 'detail': 'ἀγαθόν Ρα7.'}},
                      {})
    aa.record_ledger(plan, {})
    aa.record_ledger(plan, {})
    assert len(json.loads(ledger.read_text())['rulings']) == 1


# --- an erratum keeps the ink and banks the correction -----------------------

def test_an_erratum_banks_the_line_as_printed():
    stage('quod intellexit')
    card = perline_card('quod intellexit', 'quod intcllexit')
    plan = aa.resolve({card.sid: card},
                      {card.sid: {'verdict': 'fix', 'detail': 'quod intcllexit',
                                  'erratum': True}}, {})
    final, _ = aa.compose(plan)
    entries = aa.corrigenda_for(plan, final)
    assert len(entries) == 1
    assert entries[0]['printed'] == 'quod intcllexit'   # the ink stands
    assert entries[0]['page'] == 999 and entries[0]['col'] == 'L'


# --- the guard that was missing until it bit ---------------------------------

def test_an_edit_that_would_falsify_an_earlier_ruling_is_withheld(ledger):
    """⚠ THIS MODULE REPRODUCED THE 2026-08-08 FAILURE ON ITS FIRST RUN. A
    later pass overwrote two of John's July rulings then and nothing noticed
    for weeks; on 2026-08-13 this step did it again, to his rulings of 8-09
    and 8-10, and reported success. The line must be left exactly as it is —
    and left UNRECORDED, so the next run offers it again once he has settled
    which of his two rulings stands."""
    stage('ἐν νέφροις Ζμγ9. 673')
    john_rulings.add('text', col=COL, line=1, form='Ζμγ9. 673',
                     ruled='book span', source='work/sweeps/book-rulings.json',
                     date='2026-08-09', applied=True)
    plan = aa.Plan(edits=[aa.Edit('audit:sid', COL, 1, 'line', 'fix',
                                  old='ἐν νέφροις Ζμγ9. 673',
                                  new='ἐν νέφροις Ζμγ9. 679')])
    final = {(COL, 1): 'ἐν νέφροις Ζμγ9. 679'}
    conflicts = aa.ledger_conflicts(plan, final)
    assert [key for key, _sid, _why in conflicts] == [(COL, 1)]
    assert conflicts[0][1] == 'audit:sid'
    assert '2026-08-09' in conflicts[0][2]


def test_a_ruling_john_has_already_reversed_does_not_block(ledger):
    """`reversed_by` is hand-added and means he has said the newer ruling
    stands. Blocking on it would make his own reversal unenforceable."""
    stage('ἐν νέφροις Ζμγ9. 673')
    john_rulings.add('text', col=COL, line=1, form='Ζμγ9. 673',
                     ruled='book span', source='work/sweeps/book-rulings.json',
                     date='2026-08-09', applied=True)
    d = john_rulings.load()
    d['rulings'][0]['reversed_by'] = 'John, 2026-08-13'
    john_rulings.save(d)
    plan = aa.Plan(edits=[aa.Edit('audit:sid', COL, 1, 'line', 'fix',
                                  old='ἐν νέφροις Ζμγ9. 673',
                                  new='ἐν νέφροις Ζμγ9. 679')])
    assert aa.ledger_conflicts(plan, {(COL, 1): 'ἐν νέφροις Ζμγ9. 679'}) == []


def test_a_keep_of_johns_is_defended_as_hard_as_a_fix(ledger):
    """A keep is the ruling most easily lost: the text carries no trace that
    a human looked at it and approved it."""
    stage('ἁλιάετος γίνεται')
    john_rulings.add('keep', col=COL, line=1, form='ἁλιάετος',
                     ruled='he ruled the ink', source='review server',
                     date='2026-08-10', applied=True)
    plan = aa.Plan(edits=[aa.Edit('audit:sid', COL, 1, 'line', 'fix',
                                  old='ἁλιάετος γίνεται',
                                  new='ἁλιαίετος γίνεται')])
    assert len(aa.ledger_conflicts(plan, {(COL, 1): 'ἁλιαίετος γίνεται'})) == 1


# --- the writer, which nothing tested ----------------------------------------

def test_the_write_touches_only_the_lines_it_named(tmp_path, monkeypatch):
    """⚠ AN APPLY THAT REWRITES A WHOLE COLUMN IS INDISTINGUISHABLE FROM ONE
    THAT EDITS TWO LINES, until the day it is not. Every other line must come
    back byte-identical, including the ones that merely sit next to an edit."""
    monkeypatch.setattr(aa, 'RECONCILED', tmp_path)
    col = tmp_path / f'{COL}.txt'
    before = 'ἀγαθόν Ρα7.\nεἴδη Pα13.\nτρίτη γραμμή\nτετάρτη\n'
    col.write_text(before, encoding='utf-8')
    aa._LINES.clear()
    assert aa.write_corpus({(COL, 2): 'εἴδη Ρα13.'}) == 1
    after = col.read_text(encoding='utf-8').splitlines()
    assert after == ['ἀγαθόν Ρα7.', 'εἴδη Ρα13.', 'τρίτη γραμμή', 'τετάρτη']
    assert col.read_text(encoding='utf-8').endswith('\n')


def test_a_column_with_no_edit_is_not_rewritten_at_all(tmp_path, monkeypatch):
    """Not a formality: a rewrite with no change still moves the mtime, and
    every freshness gate in this pipeline reads mtimes."""
    monkeypatch.setattr(aa, 'RECONCILED', tmp_path)
    quiet = tmp_path / 'page-998-L.txt'
    quiet.write_text('nothing happens here\n', encoding='utf-8')
    (tmp_path / f'{COL}.txt').write_text('ἀγαθόν Ρα7.\n', encoding='utf-8')
    aa._LINES.clear()
    stamp = quiet.stat().st_mtime_ns
    aa.write_corpus({(COL, 1): 'ἀγαθὸν Ρα7.'})
    assert quiet.stat().st_mtime_ns == stamp
    assert quiet.read_text(encoding='utf-8') == 'nothing happens here\n'


# --- what makes the step runnable a second time ------------------------------

def test_a_store_already_recorded_needs_no_cards(tmp_path, monkeypatch, ledger):
    """⚠ THE PROPERTY THAT LET JOHN KEEP CLICKING WHILE THIS RAN. Applying a
    ruling changes the corpus the sweeps read, so `audit_review` then refuses
    to rebuild its cards — by design. If this step asked for cards it could
    not get, it would run exactly once. What it has already recorded is a
    question for the ledger, so the card build must not even be attempted."""
    store = tmp_path / 'audit-rulings.json'
    store.write_text(json.dumps({'page-900-L:_x': {'verdict': 'keep',
                                                   'detail': 'ἀγαθόν'}}),
                     encoding='utf-8')
    john_rulings.add('keep', col='page-900-L', line=1, form='ἀγαθόν',
                     ruled='audit page-900-L:_x', source=aa.SOURCE,
                     date='2026-08-13', applied=True)

    def explode():
        raise SystemExit('the sweeps have drifted — rerun the sweep')
    monkeypatch.setattr(aa.review, 'load_cards', explode)

    plan, final = aa.build_plan(store)
    assert final == {} and plan.recorded == ['page-900-L:_x']
    assert not plan.refusals and not plan.edits


# --- the corners of a class ruling and an erratum ----------------------------

def test_an_exclude_on_a_site_that_occurs_twice_is_refused():
    """Two occurrences of one spelling on one line share a member id, so an ✕
    on either would silently pull out both. Resolving that in the ruling's
    favour is the kind of guess this project does not make."""
    stage('εἴδη Pα13. μεῖζον Pα14.')
    card = encoding_card((COL, 1, 'Pα'), (COL, 1, 'Pα'))
    with pytest.raises(aa.ApplyError):
        aa._members(card, {f'{COL}:L1:Pα'})


def test_an_erratum_on_a_none_verdict_banks_nothing():
    """`none` says the ink reads none of the offered readings. There is no
    reading to call print-accurate, so there is no corrigendum to bank."""
    stage('quod intellexit')
    card = perline_card('quod intellexit', 'quod intcllexit')
    plan = aa.resolve({card.sid: card},
                      {card.sid: {'verdict': 'none', 'detail': '',
                                  'erratum': True}}, {})
    assert aa.corrigenda_for(plan, {}) == []


def test_an_insertion_at_the_end_of_a_line_survives_the_remapping():
    """The alignment's tail: characters ruled onto the END of a line have no
    following character to hang from, and were dropped by the first draft."""
    assert aa.remap('τι 15 a3', 'τι 15a3.') == 'τι 15 a3.'
    assert aa.remap('ἀγαθόν Ρα7', 'ἀγαθόν Ρα7 al.') == 'ἀγαθόν Ρα7 al.'


def test_a_deletion_carries_through_the_bekker_spacing():
    assert aa.remap('σ9. 973 a12.', 'σ973a12.') == 'σ973 a12.'


# --- the one rule this module writes twice -----------------------------------

def test_the_apply_step_reads_the_same_buttons_the_page_shows(tmp_path,
                                                              monkeypatch):
    """⚠ THE OPTION LIST EXISTS IN TWO PLACES. `build_page` renders the
    buttons John clicks; `card_options` reconstructs them so a ruling can be
    checked against the card that produced it. Nothing but this test holds
    them together, and if they drift the failure is silent and backwards: a
    perfectly good ruling is refused as "a card rebuilt in a different
    shape" when nothing was rebuilt at all.
    """
    import html as html_mod
    import re as re_mod

    monkeypatch.setattr(review, 'PAGE', tmp_path / 'page.html')
    stage('εἴδη Pα13.')
    cards = [perline_card('ἀγαθόν Ρα7.', 'ἀγαθὸν Ρα7.'),
             encoding_card((COL, 1, 'Pα'))]
    for c in cards:                       # sections are assigned by load_cards
        c.section = review._section_for(c)
    review.build_page(cards)
    doc = (tmp_path / 'page.html').read_text(encoding='utf-8')

    blocks = re_mod.split(r'<div class="card" id="', doc)[1:]
    assert len(blocks) == len(cards), 'the page did not render every card'
    for card, block in zip(cards, blocks):
        shown = {(v, json.loads(html_mod.unescape(d)))
                 for v, d in re_mod.findall(
                     r'<button class="opt[^"]*" data-v="([^"]+)" '
                     r'data-d="([^"]*)"', block)}
        assert shown, f'{card.sid} rendered no buttons at all'
        missing = shown - set(aa.card_options(card))
        assert not missing, (
            f'{card.sid}: the page offers {missing} and the apply step does '
            f'not — a ruling on that button could never be applied')


# --- a line split into one card per dispute -----------------------------------

def split(gt: str, reading: str, sid: str = f'{COL}:_x') -> dict:
    c = review.Card(sid, COL, '_x', 'mark', gt, {'kraken e26': reading})
    return {p.sid: p for p in review.split_card(c)}


def rule(sid: str, cards: dict, verdict: str = 'fix', **extra) -> dict:
    detail = '' if verdict == 'none' else (
        cards[sid].gt if verdict == 'keep'
        else next(iter(cards[sid].readings.values())))
    return {sid: {'verdict': verdict, 'detail': detail, **extra}}


def test_two_parts_of_one_line_ruled_in_separate_runs_both_land():
    """⚠ THE SIBLING MOVES THE LINE. John rules a part whenever he reaches
    it, so the first is written and the line stops reading what every other
    part's card shows. Matching on the card text alone would refuse the rest
    of his rulings — a step that could only ever run once, which is the
    failure `locate`'s own fallback was written to stop."""
    stage('τȣ λόγȣ ἐστι')
    cards = split('τȣ λόγȣ ἐστι', 'τȣ͂ λόγȣ ἐστί')
    first, second = sorted(cards)

    plan = aa.resolve(cards, rule(first, cards), cards)
    final, clashes = aa.compose(plan)
    assert not plan.refusals and not clashes
    assert final[(COL, 1)] == 'τȣ͂ λόγȣ ἐστι'

    aa._LINES[COL][0] = final[(COL, 1)]          # as `write_corpus` would

    plan = aa.resolve(cards, rule(second, cards), cards)
    final, clashes = aa.compose(plan)
    assert not plan.refusals and not clashes
    assert final[(COL, 1)] == 'τȣ͂ λόγȣ ἐστί'


def test_both_parts_ruled_in_one_run_compose_rather_than_conflict():
    stage('τȣ λόγȣ ἐστι')
    cards = split('τȣ λόγȣ ἐστι', 'τȣ͂ λόγȣ ἐστί')
    first, second = sorted(cards)
    rulings = {**rule(first, cards), **rule(second, cards)}
    plan = aa.resolve(cards, rulings, cards)
    final, clashes = aa.compose(plan)
    assert not plan.refusals and not clashes
    assert final[(COL, 1)] == 'τȣ͂ λόγȣ ἐστί'


def test_one_part_fixed_and_its_sibling_kept_writes_only_the_fix():
    """The whole point of splitting: John can take one and refuse the other
    without a `none` that throws away both."""
    stage('τȣ λόγȣ ἐστι')
    cards = split('τȣ λόγȣ ἐστι', 'τȣ͂ λόγȣ ἐστί')
    first, second = sorted(cards)
    rulings = {**rule(first, cards),
               **rule(second, cards, verdict='keep')}
    plan = aa.resolve(cards, rulings, cards)
    final, _ = aa.compose(plan)
    assert not plan.refusals
    assert final[(COL, 1)] == 'τȣ͂ λόγȣ ἐστι'


def test_a_none_on_one_part_leaves_its_sibling_free_to_apply():
    stage('τȣ λόγȣ ἐστι')
    cards = split('τȣ λόγȣ ἐστι', 'τȣ͂ λόγȣ ἐστί')
    first, second = sorted(cards)
    rulings = {**rule(first, cards, verdict='none'),
               **rule(second, cards)}
    plan = aa.resolve(cards, rulings, cards)
    final, _ = aa.compose(plan)
    assert not plan.refusals
    assert final[(COL, 1)] == 'τȣ λόγȣ ἐστί'


def test_a_part_already_written_is_not_applied_twice():
    stage('τȣ͂ λόγȣ ἐστι')                      # part 0 already in the corpus
    cards = split('τȣ λόγȣ ἐστι', 'τȣ͂ λόγȣ ἐστί')
    first = sorted(cards)[0]
    plan = aa.resolve(cards, rule(first, cards), cards)
    final, _ = aa.compose(plan)
    assert not plan.refusals and final == {}
    assert [e.how for e in plan.edits] == ['none']


def test_locate_ops_refuses_a_line_carrying_a_change_no_reading_proposed():
    """A line holding an edit this card never offered is not this card's
    line, and the wrong line is the one edit nobody would catch."""
    stage('τȣ λόγων ἐστι')
    cards = split('τȣ λόγȣ ἐστι', 'τȣ͂ λόγȣ ἐστί')
    with pytest.raises(aa.ApplyError):
        aa.locate_ops(COL, 'τȣ λόγȣ ἐστι',
                      next(iter(cards.values())).line_ops)


def test_a_part_ruling_that_names_a_dispute_its_card_never_asked_refuses():
    stage('τȣ λόγȣ ἐστι')
    card = sorted(split('τȣ λόγȣ ἐστι', 'τȣ͂ λόγȣ ἐστί').values(),
                  key=lambda c: c.sid)[0]
    with pytest.raises(aa.ApplyError):
        aa._apply_reading(aa.Plan(), card.sid, card, 'fix',
                          'τȣ͂ λόγȣ ἐστί', False)


def test_a_keep_on_a_part_still_banks_its_erratum():
    """⚠ A KEEP IS HOW AN ERRATUM ON AN UNCHANGED LINE REACHES THE REGISTER:
    John saying the print is wrong AND the corpus should keep it."""
    stage('τȣ λόγȣ ἐστι')
    cards = split('τȣ λόγȣ ἐστι', 'τȣ͂ λόγȣ ἐστί')
    first = sorted(cards)[0]
    plan = aa.resolve(cards, rule(first, cards, verdict='keep', erratum=True),
                      cards)
    assert not plan.refusals
    assert [e['printed'] for e in aa.corrigenda_for(plan, {})] == \
        ['τȣ λόγȣ ἐστι']


def test_a_bundle_of_parts_applies_each_at_its_own_place():
    """Bundling groups CARDS now, so a bundle's members can be single
    disputes of longer lines — the ligature perispomeni John pointed at."""
    stage('τȣ λόγȣ ἐστι', 'τȣ βίȣ ὁρα')
    lines = {}
    for i, (gt, model) in enumerate([('τȣ λόγȣ ἐστι', 'τȣ͂ λόγȣ ἐστί'),
                                     ('τȣ βίȣ ὁρα', 'τȣ͂ βίȣ ὅρα')]):
        lines.update(split(gt, model, sid=f'{COL}:_{i}'))
    bundle, taken = review._pattern_cards(list(lines.values()), ruled=set())
    sid, card = next(iter(bundle.items()))
    for m in card.members:
        m.column = COL
    fix_text = card.options[1][2]       # whatever this card labels button B
    plan = aa.resolve({sid: card},
                      {sid: {'verdict': 'fix', 'detail': fix_text}}, lines)
    final, clashes = aa.compose(plan)
    assert not plan.refusals and not clashes
    assert final == {(COL, 1): 'τȣ͂ λόγȣ ἐστι', (COL, 2): 'τȣ͂ βίȣ ὁρα'}


def test_an_edit_that_would_falsify_the_corrigenda_register_is_withheld(
        tmp_path, monkeypatch):
    """⚠ THE LEDGER IS NOT THE ONLY PLACE A HUMAN LOOK IS RECORDED. On
    2026-08-14 the class ruling pattern:ἀ-ἁ — 16 sites, none excluded —
    rewrote page-044-R:27 smooth to rough, and nothing refused it. That site
    had been read at 400 dpi on 2026-08-08, ruled SMOOTH with the reasoning
    written down, and an automated rough-propagation there explicitly
    reverted. The register said so; the guard read only john.json."""
    reg = tmp_path / 'entries.json'
    reg.write_text(json.dumps({'entries': [{
        'page': 999, 'col': 'L', 'line': 1, 'printed': 'ἀλίζειν',
        'correct': 'ἁλίζειν', 'checked': '400dpi 2026-08-08'}]}),
        encoding='utf-8')
    monkeypatch.setattr(aa, 'CORRIGENDA', reg)
    final = {(COL, 1): 'ἁλίζειν. ἄρτοι ἠλισμένοι'}
    plan = aa.Plan(edits=[aa.Edit('pattern:ἀ-ἁ', COL, 1, 'line', 'fix')])
    out = aa.ledger_conflicts(plan, final)
    assert [k for k, _s, _w in out] == [(COL, 1)]
    assert 'pattern:ἀ-ἁ' in out[0][1]
    assert '400dpi 2026-08-08' in out[0][2]


def test_an_edit_that_leaves_the_printed_form_standing_is_not_a_conflict():
    """A corrigendum records what the page PRINTS. An edit elsewhere on the
    line does not touch that claim."""
    reg = aa.CORRIGENDA
    if not reg.exists():
        pytest.skip('no register on disk')
    plan = aa.Plan(edits=[aa.Edit('x', COL, 1, 'line', 'fix')])
    assert aa.ledger_conflicts(plan, {}) == []


def test_a_site_marked_B_takes_the_engine_while_the_card_keeps():
    """⚠ A BUNDLE IS NOT ALWAYS ONE ANSWER. One sitting can now send three
    sites to the corpus and two to the engine, instead of ruling one way and
    ✕-ing the rest — which sent them back later as fresh cards asking what
    John had already decided while looking at them."""
    stage('τȣ λόγȣ ἐστι', 'τȣ βίȣ ὁρα')
    lines = {}
    for i, (gt, model) in enumerate([('τȣ λόγȣ ἐστι', 'τȣ͂ λόγȣ ἐστι'),
                                     ('τȣ βίȣ ὁρα', 'τȣ͂ βίȣ ὁρα')]):
        c = review.Card(f'{COL}:_{i}', COL, '_x', 'mark', gt,
                        {'kraken e26': model})
        lines[c.sid] = c
    bundle, _ = review._pattern_cards(list(lines.values()), ruled=set())
    sid, card = next(iter(bundle.items()))
    for m in card.members:
        m.column = COL
    a, b = sorted(m.sid for m in card.members)
    # the card says A (corpus stands); ONE site is sent to B on its own
    keep_text = card.options[0][2]      # whatever this card labels button A
    plan = aa.resolve({sid: card},
                      {sid: {'verdict': 'keep', 'detail': keep_text,
                             'sites': {b: 'B'}}}, lines)
    final, clashes = aa.compose(plan)
    assert not plan.refusals and not clashes
    assert list(final.values()) == ['τȣ͂ βίȣ ὁρα']
    assert plan.classes[0]['per_site'] == {b: 'fix'}


def test_a_letter_no_button_carries_is_refused():
    """The letters index the card's buttons. One recorded against a card since
    rebuilt with fewer options is refused, not resolved to whatever now sits
    at that position ([[carry-rulings-by-site]])."""
    card = review.Card('pattern:x', COL, '', 'mark', '', {},
                       options=[('keep', 'A', 'x', '', 'w'),
                                ('fix', 'B', 'y', '', 'w')],
                       members=[review.Member('s1', COL, 1, 't', 'l')])
    with pytest.raises(aa.ApplyError):
        aa.per_site(card, {'verdict': 'keep', 'detail': 'x',
                           'sites': {'s1': 'C'}})


def test_an_edit_that_would_spell_two_accents_is_withheld(tmp_path,
                                                          monkeypatch):
    """⚠ NOT THE GRAMMAR OVERRULING A READING. Bonitz PRINTED `ἄνθρώπȣ` with
    two accents and the corpus keeps it. But a class ruling that CREATES such
    a word is another matter: on 2026-08-14 `pattern:ο-ό` turned `ἀκυροτέρων`
    into `ἀκυρότέρων` at page-042-L:5, because the card showed John a glyph
    pair and not the word it lands in."""
    monkeypatch.setattr(aa, 'CORRIGENDA', tmp_path / 'none.json')
    stage('αἱ τῶν ἀκυροτέρων περίοδοι')
    final = {(COL, 1): 'αἱ τῶν ἀκυρότέρων περίοδοι'}
    plan = aa.Plan(edits=[aa.Edit('pattern:ο-ό', COL, 1, 'line', 'fix')])
    out = aa.ledger_conflicts(plan, final)
    assert [k for k, _s, _w in out] == [(COL, 1)]
    assert 'ἀκυρότέρων' in out[0][2] and 'erratum' in out[0][2]


def test_a_word_already_spelt_that_way_is_not_blamed_on_this_edit():
    stage('φησὶν ἄνθρώπȣ εἶναι')
    plan = aa.Plan(edits=[aa.Edit('x', COL, 1, 'line', 'fix')])
    assert aa.ledger_conflicts(plan, {(COL, 1): 'φησὶν ἄνθρώπȣ εἶναί'}) == []


def test_a_rendering_ruling_is_superseded_and_does_not_block_the_write():
    """The whole point of the split: one siglum-space ruling must not stop
    the other lines of the sitting from being written."""
    stage('Ηε10. 1135a24', 'ἀγαθόν Ρα7.')
    space = perline_card('Ηε10. 1135a24', 'Ηε 10. 1135a24')
    other = review.Card(f'{COL}:_b', COL, '_b', 'letter', 'ἀγαθόν Ρα7.',
                        {'kraken e26': 'ἀγαθὸν Ρα7.'})
    plan = aa.resolve(
        {space.sid: space, other.sid: other},
        {space.sid: {'verdict': 'fix', 'detail': 'Ηε 10. 1135a24'},
         other.sid: {'verdict': 'fix', 'detail': 'ἀγαθὸν Ρα7.'}}, {})
    assert not plan.refusals
    assert [s for s, _ in plan.superseded] == [space.sid]
    assert [e.new for e in plan.edits] == ['ἀγαθὸν Ρα7.']


def test_a_line_is_found_through_a_homoglyph_but_only_to_find_it():
    """⚠ A HOMOGLYPH CANNOT CHANGE WHICH LINE THIS IS. Two of John's keeps
    refused because a glyph-pair ruling of his own had written `AΖι` where
    their cards showed `AZι` — the same ink, a different codepoint. Folding
    is safe when identifying a line and nowhere else."""
    stage('cimen I p 1 AΖι I 86; sive fringilla')
    assert aa.locate(COL, 'cimen I p 1 AZι I 86; sive fringilla') == (1, False)
