"""The merged review queue: nothing lost between six sweeps and one sitting.

The point of merging is that John rules each SITE once, with every reason in
front of him, instead of meeting the same word in six separate sittings. The
risk is the ordinary one — a finding that quietly fails to anchor and drops out
of the queue looks exactly like a finding that was never made.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from bonitz_pipeline import adjudication
from bonitz_pipeline import merge_review as mr

LO, HI = 53, 62

# ---------------------------------------------------------------------------
# The corpus as it stood when John ruled the eight cards
#
# ⚠ A CLOSED SITTING CANNOT BE PINNED TO A LIVE CORPUS. These tests probe eight
# defects in eight printed tokens — and John's rulings have since been applied,
# so the corpus no longer holds any of them: 56-L:22 reads `ἀπόπλȣς` where the
# fixture reads `ἀπόπλ[?]ς`, and the `κατ` at the measure on 59-R:60 is now
# `κατ᾽`. Eleven tests failed the moment the work they were guarding succeeded,
# which is the worst way for a test to die: it looks like a regression.
#
# So the sitting gets a frozen corpus — the twenty columns of 53-62, the twenty
# Opus reads and the sweep rows for those pages, taken from bonitz-text at
# 5e3f048, the last commit before the apply. Nothing here is fabricated; the
# sweep reports are filtered to pages 53-62 and otherwise untouched, empty ones
# included, because a rule that found nothing in range still ran.
#
# ⚠ THE COLUMNS ARE EXACT; THE SWEEP REPORTS ARE THE COMMITTED ONES. Reports
# are regenerated artifacts and two diacritic rows existed only in an
# uncommitted working copy on the day, so this builds 37 sites where the
# sitting saw 39 — 56-L:6 `γνωσις` and 58-R:53 `Ῥα`, neither of them asserted
# anywhere. What matters is checked rather than assumed: rebuilding the eight
# SPECS here reproduces work/queue-review-53-62-fix.json exactly, form-set and
# word_off alike, which is the state John ruled.
#
# Invariants that must keep holding as the corpus moves stay on the LIVE
# corpus. Only the pins that describe a closed sitting are frozen.
# ---------------------------------------------------------------------------

FROZEN = Path(__file__).resolve().parent / 'fixtures' / 'fix-sitting-53-62'


@pytest.fixture
def frozen(monkeypatch):
    """Point the builder — and the two sweeps that read the corpus themselves
    — at the frozen columns, reports and Opus reads."""
    auto = FROZEN / 'work' / 'reconciled-auto'

    def column(page, col, *, required=True):
        p = auto / f'page-{page:03d}-{col}.txt'
        if p.exists():
            return p
        if required:
            raise FileNotFoundError(
                f'page-{page:03d}-{col} is in no corpus stage — it has not '
                f'been transcribed, so no check can report it clean')
        return None

    def columns(pages=None):
        if pages is None:
            return sorted(auto.glob('page-*.txt'))
        want = sorted(pages)
        missing = [f'{n:03d}-{c}' for n in want for c in ('L', 'R')
                   if not (auto / f'page-{n:03d}-{c}.txt').exists()]
        if missing:
            raise FileNotFoundError(
                f'no corpus column for {", ".join(missing)} in any stage')
        return [auto / f'page-{n:03d}-{c}.txt'
                for n in want for c in ('L', 'R')]

    from bonitz_pipeline import accent, breathing
    for mod in (mr, accent, breathing):
        monkeypatch.setattr(mod, 'corpus_column', column)
    monkeypatch.setattr(mr, 'corpus_columns', columns)
    monkeypatch.setattr(mr, 'ROOT', FROZEN)
    monkeypatch.setattr(mr, 'SWEEPS', FROZEN / 'work' / 'sweeps')
    monkeypatch.setattr(mr, 'OPUS', FROZEN / 'raw' / 'opus')
    mr._LINES.clear()
    yield FROZEN
    mr._LINES.clear()


def test_every_finding_reaches_the_queue():
    """⚠ THE INVARIANT, AND IT IS NOT A COUNT. Anchoring is the fragile step:
    it failed for 13 of 45 findings before the source, the wrap and the
    off-by-one line were fixed. A finding that cannot be placed must be
    REPORTED, and today none are."""
    queue, orphans = mr.build(LO, HI)
    assert orphans == [], (
        'findings that anchored nowhere and so are not rulable: '
        + ', '.join(f'{f.page:03d}-{f.col}:{f.line} {f.printed!r}'
                    for f in orphans))
    assert queue['n_sites'] > 0


def test_a_site_flagged_twice_is_one_card():
    """`ἄνθρώπȣ` is flagged by two Smyth rules and by the diacritic sweep. It
    is one place on one page and must be asked once, carrying all three
    reasons — asking three times is how a reader stops trusting the tool."""
    queue, _ = mr.build(LO, HI)
    hits = [e for e in queue['entries'] if e['readers']['opus'] == 'ἄνθρώπȣ']
    assert len(hits) == 1, hits
    assert len(hits[0]['sweeps']) >= 3, hits[0]['sweeps']
    for want in ('smyth:A6', 'smyth:B7', 'diacritic'):
        assert want in hits[0]['sweeps'], hits[0]['sweeps']


def test_the_anchor_lands_on_the_form_it_names():
    """A card pointing at the wrong glyph is worse than no card. Check the
    corpus really holds that form at that offset, on the line recorded — not
    the line the sweep claimed, which is wrong for four of them.

    The card's form is now the PRINTED token, which for a word broken at the
    measure spans two lines. So the check is per piece: every piece must sit
    where it says it sits, the pieces must spell the form, and the site itself
    must be one of them."""
    import unicodedata
    from bonitz_pipeline.normalize import corpus_column
    queue, _ = mr.build(LO, HI)
    for e in queue['entries']:
        lines = unicodedata.normalize(
            'NFC', corpus_column(e['page'], e['col']).read_text(
                encoding='utf-8')).splitlines()
        for p in e['pieces']:
            got = lines[p['line'] - 1][p['start']:p['start'] + len(p['text'])]
            assert got == p['text'], (
                f"{e['page']:03d}-{e['col']}:{p['line']} char {p['start']} "
                f"does not hold {p['text']!r} — it holds {got!r}")
        assert ''.join(p['text'] for p in e['pieces']) == e['readers']['opus']
        assert (e['line'], e['char_at_corpus']) in [
            (p['line'], p['start']) for p in e['pieces']], e


def test_a_repeated_form_becomes_two_cards_not_a_guess():
    """`str.find` would take the first occurrence and put John on a glyph the
    sweep never meant. Every occurrence is offered."""
    queue, _ = mr.build(LO, HI)
    amb = [e for e in queue['entries'] if e['ambiguous']]
    for e in amb:
        same = [x for x in queue['entries']
                if (x['page'], x['col'], x['line'],
                    x['readers']['opus']) == (e['page'], e['col'], e['line'],
                                              e['readers']['opus'])]
        assert len(same) > 1, e
        assert len({x['char_at'] for x in same}) == len(same), e


def test_the_written_queue_matches_what_build_produces():
    """The file John's tool serves must be the file this module describes —
    while the sitting is OPEN. Once every card is ruled the queue is a closed
    record: applying its accepts changes the corpus, the fixed findings stop
    firing, and a fresh build legitimately differs. Drift after a finished
    sitting is the success state, not staleness."""
    path = mr.ROOT / 'work' / f'queue-review-{LO}-{HI}.json'
    if not path.exists():
        return
    on_disk = json.loads(path.read_text(encoding='utf-8'))
    store = mr.ROOT / 'work' / 'sweeps' / 'review-rulings.json'
    if store.exists():
        ruled = set(json.loads(store.read_text(encoding='utf-8')))
        sids = {'forms:' + '|'.join(e['form_set']) for e in on_disk['entries']}
        if sids <= ruled:
            return                        # closed sitting, kept for the record
    fresh, _ = mr.build(LO, HI)
    assert on_disk['n_sites'] == fresh['n_sites'], (
        'work/queue-review-53-62.json is stale — rerun '
        '`python3 -m bonitz_pipeline.merge_review --pages 53-62 --write`')


def test_no_card_anchors_inside_a_longer_word():
    """⚠ THE WORST FAILURE THIS TOOL CAN HAVE. `str.find` respects no word
    boundary, so `ὑπερ` matched inside `ὑπερβάλ-` and `παλιν` inside
    `ἀνάπαλιν` — two cards pointing at a glyph the sweep never meant. A reader
    cannot tell a mis-anchored crop from a correct one, so this must be
    impossible rather than unlikely."""
    import re
    import unicodedata
    from bonitz_pipeline.normalize import corpus_column
    letter = re.compile(r'[^\W\d_]', re.UNICODE)
    queue, _ = mr.build(LO, HI)
    bad = []
    for e in queue['entries']:
        line = unicodedata.normalize(
            'NFC', corpus_column(e['page'], e['col']).read_text(
                encoding='utf-8')).splitlines()[e['line'] - 1]
        w, a = e['readers']['opus'], e['char_at']
        b = a + len(w)
        if line[a:b] != w:
            continue                      # the hyphen-head case
        before = line[a - 1] if a > 0 else ' '
        after = line[b] if b < len(line) else ' '
        if letter.match(before) or letter.match(after):
            bad.append(f"{e['page']:03d}-{e['col']}:{e['line']} {w!r} in "
                       f"{line[max(0, a - 12):b + 12]!r}")
    assert not bad, 'cards anchored inside a longer word: ' + '; '.join(bad)


def test_one_card_per_place_on_the_page():
    """Merging happens AFTER anchoring. Keyed on the line each sweep REPORTED,
    two sweeps naming the same word at 57-R:6 and 57-R:7 made two cards for one
    place — the duplication merging exists to prevent."""
    import collections
    queue, _ = mr.build(LO, HI)
    seen = collections.Counter(
        (e['page'], e['col'], e['line'], e['char_at'], e['readers']['opus'])
        for e in queue['entries'])
    dupes = {k: v for k, v in seen.items() if v > 1}
    assert not dupes, f'{len(dupes)} site(s) carry more than one card: {dupes}'


def test_the_queue_actually_loads_in_the_tool_that_serves_it():
    """⚠ THE TEST THAT SHOULD HAVE EXISTED FIRST. The queue was built, its
    contents checked exhaustively, and handed over with a serve command — and
    it had never once been loaded into `settle_review`, which does
    `int(e['word_off'])` and raised KeyError on every entry. Codex found it in
    review. Checking your own output against your own expectations is not a
    test of the thing you shipped."""
    import json
    import tempfile
    from pathlib import Path

    from bonitz_pipeline import settle_review as sr
    queue, _ = mr.build(LO, HI)
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / 'q.json'
        p.write_text(json.dumps(queue, ensure_ascii=False), encoding='utf-8')
        cards = sr.cards_from_queue(p)
    assert cards, 'settle_review produced no cards from the merged queue'
    assert sum(c.n for c in cards) == len(queue['entries'])


def test_a_page_in_no_corpus_stage_is_an_error_not_an_empty_queue():
    """`accent.scan` and `breathing.scan` answer [] for a page that does not
    exist, so build() once returned zero sites and zero orphans for page 9999 —
    the same 'clean report about an unopened page' this queue was made to end.
    """
    import pytest
    with pytest.raises(FileNotFoundError):
        mr.build(9999, 9999)


def test_siglum_findings_survive_an_arbitrary_page_range():
    """The range-named report is not the only one. `build(54, 60)` reported no
    siglum findings at all while the whole-corpus report held five for those
    pages — a queue that looks complete and is not."""
    queue, _ = mr.build(54, 60)
    assert queue['by_sweep'].get('siglum', 0) >= 5, queue['by_sweep']


def test_a_combining_mark_is_not_a_word_boundary():
    """⚠ ȣ AND ϗ CANNOT PRECOMPOSE, so they stay decomposed even under NFC:
    `τȣ̀ς` is τ + ȣ + U+0300 + ς. A letter-only boundary test called U+0300 a
    boundary, so the form `τȣ` matched inside `τȣ̀ς` and the card pointed at a
    bare ligature where the page carries an accented one. These are the two
    sorts this edition turns on, and `ϗ̀` is always accented, so it is the
    wrong-glyph failure in the place it costs most."""
    import unicodedata
    from bonitz_pipeline.merge_review import _joined
    for mark in ('̀', '͂', '̓', '̈'):
        assert _joined(mark), f'U+{ord(mark):04X} treated as a boundary'
    for sort in ('ȣ', 'ϗ', 'ς', 'α'):
        assert _joined(sort), sort
    for sep in (' ', '-', '.', ','):
        assert not _joined(sep), sep

    # The concrete case, end to end.
    line = unicodedata.normalize('NFC', 'τȣ̀ς λόγȣς')
    i = line.find('τȣ')
    after = line[i + 2]
    assert unicodedata.combining(after), 'fixture no longer decomposed'
    assert _joined(after), 'τȣ would still anchor inside τȣ̀ς'


def test_char_at_is_the_offset_the_cropper_actually_uses():
    """⚠ THE MAPPING WENT IN A FIELD NOTHING READ. `settle_review` crops with
    `char_at`, measured against the OPUS line — but this stored the CORPUS
    offset there and the mapped one beside it as `char_at_opus`, which no code
    anywhere consumed. The correct value existed and the crop still pointed one
    glyph early. Grok found it. Six lines on 53-62 differ in length between the
    two texts, so it is latent, not theoretical."""
    import unicodedata
    from pathlib import Path
    from bonitz_pipeline.normalize import clean_opus
    queue, _ = mr.build(LO, HI)
    for e in queue['entries']:
        if not e['opus_aligned']:
            continue
        src = Path(mr.OPUS / f"page-{e['page']:03d}-{e['col']}.txt")
        if not src.exists():
            continue
        lines = unicodedata.normalize(
            'NFC', clean_opus(src.read_text(encoding='utf-8'))).splitlines()
        if not (1 <= e['line'] <= len(lines)):
            continue
        # The crop measures char_at against this line, so it must be in range.
        assert 0 <= e['char_at'] <= len(lines[e['line'] - 1]), (
            f"{e['page']:03d}-{e['col']}:{e['line']} char_at {e['char_at']} "
            f"is outside the Opus line it will be measured against")


def test_the_hyphen_rule_refuses_a_shared_prefix():
    """A word broken at the measure is anchored on the line it BEGINS. But a
    shared prefix is not the same word: `ανα-` answered a finding for
    `αναλαμβανειν`, matched inside `συνανα-`, and a lone `ν-` answered `νεος`.
    The discriminator is that the next line must actually continue the word —
    not a minimum prefix length, which orphaned the real `ἀ-γνοιαν`."""
    def accepts(line, nxt, want):
        stripped = line.rstrip()
        if not stripped.endswith('-') or len(want) < 2:
            return None
        head = stripped[:-1]
        for n in range(len(want) - 1, 0, -1):
            if not head.endswith(want[:n]):
                continue
            start = len(head) - n
            before = head[start - 1] if start > 0 else ' '
            if mr._joined(before):
                continue
            if not nxt.startswith(want[n:]):
                continue
            return start
        return None

    assert accepts('something και ανα-', 'λλο τι', 'αναλαμβανειν') is None
    assert accepts('lemma συνανα-', 'γκαιον', 'αναγκαιον') is None
    assert accepts('end with ν-', 'ομος', 'νεος') is None
    # and the real break Bonitz sets on 54-L must still anchor
    assert accepts('εἰς τὴν τȣ͂ ἐλέγχȣ ἀ-', 'γνοιαν (syn', 'ἀγνοιαν') == 19


# ---------------------------------------------------------------------------
# The seven cards John answered "none of these" on 2026-08-11.
#
# ⚠ A "NONE" CAUSED BY THE CARD IS A DEFECT IN THE BUILDER. Eight sites, four
# defect classes, and every one of them the same mistake: the card asked about
# something the page does not print. These fixtures are those eight sites, and
# each test below fails against the builder as it stood that morning.
# ---------------------------------------------------------------------------

# page, col, anchor line, anchor char, the form the sweep reported
NONE_SITES = [
    (54, 'L', 32, 52, 'ἀγνοιαν'),        # hyphen head, accent on this line
    (56, 'L', 22, 19, 'ἀπόπλ'),          # damaged token, stub shown
    (57, 'R', 7, 53, 'ὑπερἔχοντας'),     # hyphen head, breathing on the tail
    (59, 'R', 23, 0, 'ληψις'),           # hyphen tail, head not shown
    (59, 'R', 46, 51, 'ὑπερἔχειν'),      # hyphen head, breathing on the tail
    (59, 'R', 60, 0, 'κατ'),             # elision apostrophe dropped
    (59, 'R', 60, 49, 'κατ'),            # the same word at the measure
    (62, 'R', 2, 19, 'ἔξȣσιν'),          # ligature expanded off the page
]
SPECS = [f'{p:03d}-{c}:{ln}:{ch}={form}' for p, c, ln, ch, form in NONE_SITES]


def _site(queue, page, col, line, char, form):
    hits = [e for e in queue['entries']
            if (e['page'], e['col'], e['anchor_line'], e['anchor_char'],
                e['src_form']) == (page, col, line, char, form)]
    assert len(hits) == 1, (page, col, line, char, form, len(hits))
    return hits[0]


def test_a_word_broken_at_the_measure_shows_its_hyphen(frozen):
    """John, on the card that asked about `άγνοιαν`: the call was on a
    hyphenated word at the end of a line but asked about the full word without
    diplomatically recognising the hyphen. 54-L:32 ends `ἐλέγχȣ ἀ-` and 33
    begins `γνοιαν`; the rejoined word is on no line of the book."""
    queue, _ = mr.build(LO, HI)
    e = _site(queue, 54, 'L', 32, 52, 'ἀγνοιαν')
    assert e['printed_token'] == 'ἀ-γνοιαν'
    assert [(p['line'], p['start'], p['text']) for p in e['pieces']] == [
        (32, 52, 'ἀ-'), (33, 0, 'γνοιαν')]
    assert e['form_set'] == ['ἀ-γνοιαν', 'ἄ-γνοιαν']
    assert not any('-' not in f for f in e['form_set']), (
        'a seamless rejoin is back on the card: ' + str(e['form_set']))
    # The accent under dispute is on the alpha, which is on line 32.
    assert (e['line'], e['char_at_corpus']) == (32, 52)


def test_the_card_sits_on_the_piece_under_dispute(frozen):
    """`ὑπερ-` ends 57-R:7 and the breathing in question is on the `ἔ` that
    opens 57-R:8. A card anchored where the word BEGINS shows John the head and
    asks him about the tail — the wrong-glyph failure, dressed as a correct
    crop. Same shape at 59-R:46/47."""
    queue, _ = mr.build(LO, HI)
    for page, ln, ch, form, want, tail in (
            (57, 7, 53, 'ὑπερἔχοντας', 'ὑπερ-ἔχοντας', 8),
            (59, 46, 51, 'ὑπερἔχειν', 'ὑπερ-ἔχειν', 47)):
        e = _site(queue, page, 'R', ln, ch, form)
        assert e['printed_token'] == want
        assert e['broken'] is True
        assert (e['line'], e['char_at_corpus']) == (tail, 0), e
        assert all('-' in f for f in e['form_set']), e['form_set']


def test_a_tail_carries_the_head_it_continues(frozen):
    """`ληψις` opens 59-R:23 and is the tail of `ἀνά-` at the end of 22. Shown
    alone it is not a word, and the card that showed it alone was answered
    "none of these"."""
    queue, _ = mr.build(LO, HI)
    e = _site(queue, 59, 'R', 23, 0, 'ληψις')
    assert e['printed_token'] == 'ἀνά-ληψις'
    assert e['pieces'][0] == {'line': 22, 'start': 54, 'text': 'ἀνά-'}
    assert e['form_set'] == ['ἀνά-ληψις', 'ἀνά-λῆψις']
    # The circumflex under dispute is on the tail, and that is where it points.
    assert (e['line'], e['char_at_corpus']) == (23, 0)
    assert 'ἀνά-' in e['reason']


def test_a_damaged_token_is_shown_whole(frozen):
    """`smyth` stops its token at the bracket, so the card read `ἀπόπλ` and the
    rule fired on `ends in λ`. The page prints `ἀπόπλ[?]ς` — which does not end
    in λ at all, and holds a mark for ink nobody has read."""
    queue, _ = mr.build(LO, HI)
    e = _site(queue, 56, 'L', 22, 19, 'ἀπόπλ')
    assert e['printed_token'] == 'ἀπόπλ[?]ς'
    assert e['form_set'] == ['ἀπόπλ[?]ς']
    assert e['readers']['opus'] == 'ἀπόπλ[?]ς'
    assert "'ἀπόπλ'" in e['reason'] and 'ἀπόπλ[?]ς' in e['reason']


def test_an_elision_apostrophe_belongs_to_the_word(frozen):
    """59-R:60 carries `κατ` twice: `κατ᾽ ἀναλογίαν` at the line start and
    `μεταφοραὶ κατ` at the measure. One card covered both, showed `κατ` for
    each, and was answered "none of these" — the first is not what the page
    prints and the second had no answerable option at all."""
    queue, _ = mr.build(LO, HI)
    first = _site(queue, 59, 'R', 60, 0, 'κατ')
    assert first['printed_token'] == 'κατ᾽'
    assert first['form_set'] == ['κατ᾽']

    last = _site(queue, 59, 'R', 60, 49, 'κατ')
    assert last['printed_token'] == 'κατ'
    assert last['form_set'] == ['κατ', 'κατ᾽']
    assert 'prints' in last['reason'], last['reason']

    # Two printed tokens, so two cards: one ruling can no longer reach both.
    assert first['form_set'] != last['form_set']


def test_the_page_itself_licenses_the_elided_form(frozen):
    """The elided reading is a proposal no reader made, so it is offered only
    where this column already prints it. `ηκ` on 54-L:8 is a geometric label —
    the lines drawn from Η and Κ — and D1 fires on it too; an apostrophe there
    would be invention."""
    queue, _ = mr.build(LO, HI)
    hits = [e for e in queue['entries']
            if e['page'] == 54 and e['col'] == 'L' and e['src_form'] == 'ηκ']
    assert hits and all(e['form_set'] == ['ηκ'] for e in hits), hits


def test_a_reading_that_cannot_be_on_the_page_is_not_offered(frozen):
    """62-R:2 prints `ἔξȣσιν` with the ou-ligature. The breathing sweep offered
    `ἑξουσιν`, which spells the sort out — a form that cannot be on the page,
    so both buttons were wrong and "none of these" was the only true answer.
    The rough breathing it means is `ἕξȣσιν`."""
    queue, _ = mr.build(LO, HI)
    e = _site(queue, 62, 'R', 2, 19, 'ἔξȣσιν')
    assert e['form_set'] == ['ἔξȣσιν', 'ἕξȣσιν']
    assert all('ȣ' in f and 'ου' not in f for f in e['form_set'])


def test_a_sweep_key_does_not_delete_the_marks_it_never_mentioned(frozen):
    """`breathing.breath_key` strips accents and `accent.accent_key` strips
    breathings — by design, because each is asking about its own marks. Laying
    the whole key on the page deletes a mark the sweep never disputed: the ink
    at 57-R:8 plainly reads `έχοντας`, and the card offered a bare `εχοντας`
    nobody had read."""
    queue, _ = mr.build(LO, HI)
    breathing = _site(queue, 57, 'R', 7, 53, 'ὑπερἔχοντας')
    assert 'ὑπερ-έχοντας' in breathing['form_set']    # accent kept
    assert 'ὑπερ-εχοντας' not in breathing['form_set']
    accent = _site(queue, 54, 'L', 32, 52, 'ἀγνοιαν')
    assert 'ἄ-γνοιαν' in accent['form_set']           # breathing kept
    assert 'ά-γνοιαν' not in accent['form_set']
    assert 'key and not a reading' in breathing['reason']


def test_the_fix_queue_holds_every_site_it_was_asked_for(frozen):
    """⚠ THE VOLUME RULE. A follow-up queue built from a list is only as good
    as its refusal to come back short: seven cards where eight were asked for
    looks exactly like eight unless the missing one is named.

    This also pins the fixture itself: the eight cards it rebuilds are the
    eight John ruled, so `work/queue-review-53-62-fix.json` is the check on
    whether the frozen corpus really is the corpus of that morning."""
    queue, orphans = mr.build(LO, HI, SPECS)
    served = mr.ROOT / 'work' / 'queue-review-53-62-fix.json'
    if not served.exists():                  # only in the tree that served it
        served = (Path(mr.__file__).resolve().parent.parent / 'work'
                  / 'queue-review-53-62-fix.json')
    if served.exists():
        ruled = json.loads(served.read_text(encoding='utf-8'))['entries']
        assert [(e['form_set'], e['word_off']) for e in queue['entries']] == \
               [(e['form_set'], e['word_off']) for e in ruled], (
            'the frozen corpus no longer rebuilds the queue John ruled')
    assert queue['unmatched_sites'] == []
    assert orphans == [], orphans
    assert queue['n_sites'] == len(NONE_SITES), queue['n_sites']
    got = {(e['page'], e['col'], e['anchor_line'], e['anchor_char'],
            e['src_form']) for e in queue['entries']}
    assert got == set(NONE_SITES)

    # And a site that anchors nowhere is REPORTED, not quietly absent.
    short, _ = mr.build(LO, HI, SPECS + ['054-L:1:0=οὐδέποτε'])
    assert short['unmatched_sites'] == ['054-L:1:0=οὐδέποτε']
    assert short['n_sites'] == len(NONE_SITES)


def test_word_off_opens_the_word_and_not_the_disputed_piece(frozen):
    """⚠ THE CROP MOVED AND THE OFFSET FOLLOWED IT. Anchoring the card on the
    piece under dispute is right for the reader and wrong for `word_off`:
    `canonical` folds the measure hyphen, so the stream holds the seamless
    word and the tail's offset lands MID-WORD. `settle_apply` matches
    stream[word_off:word_off+len(printed)] and `carry_rulings` identifies a
    site by (page, col, word_off) — both would miss, and neither would say so.
    Grok found it. The display keeps the piece; the identity keeps the word."""
    import unicodedata
    from bonitz_pipeline.normalize import canonical, clean_opus
    queue, _ = mr.build(LO, HI)

    # The three cards whose crop moved to the tail — both offsets pinned to
    # their values, not merely to being different: a swap of the two fields
    # on these cards must fail on the numbers themselves.
    for page, col, ln, ch, form, want, dispute in (
            (57, 'R', 7, 53, 'ὑπερἔχοντας', 294, 298),
            (59, 'R', 46, 51, 'ὑπερἔχειν', 1894, 1898),
            (59, 'R', 23, 0, 'ληψις', 872, 875)):
        e = _site(queue, page, col, ln, ch, form)
        assert e['word_off'] == want, e
        assert e['dispute_off'] == dispute, e

    # On an UNBROKEN card the disputed piece IS the word, so the two offsets
    # must coincide — pinned so a future swap cannot hide behind cards where
    # the swap happens to be a no-op.
    for e in queue['entries']:
        if not e.get('broken'):
            assert e['dispute_off'] == e['word_off'], (
                f"{e['page']:03d}-{e['col']}:{e['line']} is one piece; "
                'its dispute_off must equal its word_off')

    # And no site anywhere opens anything but its own word. The stream is
    # whitespace-free, so "not mid-word" has to be checked against the token:
    # the letters at word_off must be the printed token's, the measure hyphen
    # folded away exactly as `canonical` folds it in the text. Marks may
    # differ — word_off is an OPUS offset and the corpus carries John's
    # rulings, which is the whole reason it is an Opus offset.
    for e in queue['entries']:
        text = unicodedata.normalize('NFC', clean_opus(
            (mr.OPUS / f"page-{e['page']:03d}-{e['col']}.txt").read_text(
                encoding='utf-8')))
        stream, _o = canonical(text)
        token = canonical('\n'.join(p['text'] for p in e['pieces']))[0]
        got = stream[e['word_off']:e['word_off'] + len(token)]
        assert mr._base(got) == mr._base(token), (
            f"{e['page']:03d}-{e['col']}:{e['line']} word_off {e['word_off']} "
            f"opens {got!r}, not {token!r}")


def test_every_sweep_reading_reaches_the_buttons(frozen):
    """`collect` kept the FIRST sweep's expectation and dropped the rest, so at
    60-R:35 the accent sweep's key `ταυτό` took the slot and LlamaParse's real
    reading `ταὐτό` never became a button — while the reason text named it. A
    card that prints a reading and will not let you choose it is the defect the
    NONE button was invented for, with the evidence in plain view."""
    import re
    queue, _ = mr.build(LO, HI)
    hits = [e for e in queue['entries']
            if e['page'] == 60 and e['col'] == 'R' and e['line'] == 35]
    assert len(hits) == 1, hits
    assert hits[0]['form_set'] == ['ταυτό', 'ταὐτό', 'ταῦτο'], hits[0]

    # Nowhere may a reason name a reading that is neither a button nor
    # recorded as one the printed token cannot carry.
    for e in queue['entries']:
        for form in re.findall(r'LlamaParse reads (\S+)', e['reason']):
            assert (form in e['dropped_forms']
                    or any(form in f for f in e['form_set'])), (
                f"{e['page']:03d}-{e['col']}:{e['line']} names {form!r} and "
                f"offers {e['form_set']}")


def test_a_trailing_hyphen_is_not_a_proof_of_continuation():
    """`anchor` checks that the next line really continues the word before it
    will resolve a break; `token_at` joined the halves with no check at all. On
    53-62 every join is right, which is the condition under which a missing
    check is invisible."""
    import unicodedata

    def nfc(s):
        return unicodedata.normalize('NFC', s)

    # The real break on 54-L: the form spans it and agrees.
    lines = [nfc('εἰς τὴν τȣ͂ ἐλέγχȣ ἀ-'), nfc('γνοιαν (syn ἀναλύειν')]
    tok = mr.token_at(lines, 1, 19, nfc('ἀγνοιαν'))
    assert tok.printed == nfc('ἀ-γνοιαν') and tok.join == 'verified'

    # A different word under the hyphen must not be swallowed.
    lines = [nfc('something ἀ-'), nfc('λόγος rest')]
    tok = mr.token_at(lines, 1, 10, nfc('ἀγνοιαν'))
    assert tok.printed == nfc('ἀ-'), tok.printed
    assert tok.join == 'refused' and not tok.broken

    # A form that stops at the hyphen cannot vouch for the join — say so
    # rather than let it pass as a check that succeeded.
    lines = [nfc('ἀναιρεῖν τȣ̀ς ὑπερ-'), nfc('ἔχοντας, τȣ̀ς')]
    at = lines[0].index(nfc('ὑπερ'))       # τȣ̀ς is decomposed; do not count
    tok = mr.token_at(lines, 1, at, nfc('ὑπερ'))
    assert tok.printed == nfc('ὑπερ-ἔχοντας') and tok.join == 'unverified'

    # A citation opening the next line is not a continuation and never joins.
    lines = [nfc('τὴν πλευράν ἀνά-'), nfc('1414 a5. Ργ10.')]
    tok = mr.token_at(lines, 1, 12, nfc('ἀνά'))
    assert tok.printed == nfc('ἀνά-') and not tok.broken


def test_the_command_says_so_when_a_requested_site_is_missing(frozen):
    """The volume rule has to reach the shell: a follow-up queue that comes
    back short must FAIL, not print a warning into a log nobody reads."""
    assert mr.main(['--pages', f'{LO}-{HI}', '--sites', ','.join(SPECS)]) == 0
    assert mr.main(['--pages', f'{LO}-{HI}',
                    '--sites', ','.join(SPECS + ['054-L:1:0=οὐδέποτε'])]) == 1


def test_no_fixed_card_inherits_a_ruling_given_to_the_broken_one(frozen):
    """settle_review keys a ruling by the form-set. If a corrected card kept
    the old form-set it would arrive already answered — with the "none of
    these" that the defect provoked — and vanish under --only-unruled.

    The hazard is inheritance from the DEFECTIVE cards, so the guard names
    their sids. Comparing against the whole store was wrong: once John rules
    the corrected cards, their fresh verdicts live in the same store, and a
    fresh answer is not a stale one."""
    DEFECTIVE_SIDS = {
        'forms:άγνοιαν|ἀγνοιαν', 'forms:ἀπόπλ', 'forms:κατ',
        'forms:ὑπερεχοντας|ὑπερἔχοντας', 'forms:ὑπερεχειν|ὑπερἔχειν',
        'forms:ληψις|λῆψις', 'forms:ἑξουσιν|ἔξȣσιν'}
    queue, _ = mr.build(LO, HI, SPECS)
    clash = ['forms:' + '|'.join(e['form_set']) for e in queue['entries']
             if 'forms:' + '|'.join(e['form_set']) in DEFECTIVE_SIDS]
    assert not clash, f'corrected cards carrying a defective sid: {clash}'


# ---------------------------------------------------------------------------
# A ruling belongs to the SITE
#
# ⚠ AND THE CARD'S IDENTITY CHANGED UNDER IT. The builder now keys a card by
# the whole printed token — hyphen splits joined, damage markers and elision
# apostrophes included, every sweep's expectation offered — so sixteen of the
# thirty-one sites it rebuilds today carry form-set keys that appear nowhere in
# the ruling store. Served as they stand, John would be asked again about
# sixteen places he has already ruled. His standing rule is the answer: a
# ruling belongs to the site, and a re-keyed card inherits it.
#
# So this checks the two directions that matter, against the LIVE corpus,
# because it is an invariant and not a pin. Forward: every rebuilt site must
# resolve to a site some closed sitting ruled — one that does not is a genuinely
# new finding and must be named, not absorbed. Reverse: every ruled site must
# still be found, or its disappearance must be explained by the ruling that
# resolved it. Neither direction may be satisfied by a count.
# ---------------------------------------------------------------------------

WORK = Path(mr.__file__).resolve().parent.parent / 'work'
# ⚠ A SITTING JOINS THIS LIST WHEN IT CLOSES, AND 15-102 CLOSED ON 2026-08-18.
# John ruled all 245 of its cards that day and `settle_apply` carried them.
# It spans 53-62 as well, and its verdicts live in the same store, so leaving
# it out made every site it answered look unruled — which is how three
# `ȣ̓́τ’` sites he ruled `preserve` were reported as new findings.
CLOSED_SITTINGS = (WORK / 'queue-review-53-62.json',
                   WORK / 'queue-review-53-62-fix.json',
                   WORK / 'queue-review-15-102.json')
STORE = WORK / 'sweeps' / 'review-rulings.json'

# The ruled sites whose finding the applied corpus removed, and the ruling that
# removed it. Keyed by the site — page, col, printed line, offset on it.
#
# ⚠ THIS LEDGER IS THE POINT OF THE REVERSE CHECK. A finding that vanishes for
# a reason nobody wrote down is indistinguishable from one that was lost, and
# this project has lost findings that way before. A new line here costs one
# sentence; not requiring one costs the guarantee.
RESOLVED_BY = {
    # ⚠ THE HYPHEN JOIN RETIRED TEN QUESTIONS ON 2026-08-18, AND A RETIRED
    # QUESTION IS NOT AN ANSWERED ONE. `diacritic_sweep` compared each line's
    # tokens against whole-word LlamaParse forms, so a word Bonitz broke at
    # the column edge arrived as two fragments and disagreed every time — 136
    # of 247 flagged positions were that. `column_words` now joins across the
    # break before comparing, and the fragment findings below simply stopped
    # being made.
    #
    # John's verdicts on them stand and cost nothing: each was `preserve`, and
    # the join reaches the same place structurally. What is recorded here is
    # that they vanished by a fix and not by a loss.
    (56, 'R', 51, 48): ('forms:πάν|πᾶν',
     "retired by the hyphen join — πάν is a FRAGMENT of a word broken at the column edge; column_words joins it now"),
    (57, 'L', 44, 0): ('forms:θείαν|θειαν',
     "retired by the hyphen join — θειαν is a FRAGMENT of a word broken at the column edge; column_words joins it now"),
    (58, 'L', 13, 0): ('forms:τον|τὸν',
     "retired by the hyphen join — τον is a FRAGMENT of a word broken at the column edge; column_words joins it now"),
    (58, 'L', 35, 48): ('forms:περι|περὶ',
     "retired by the hyphen join — περι is a FRAGMENT of a word broken at the column edge; column_words joins it now"),
    (58, 'L', 38, 50): ('forms:εὐ|εὖ',
     "retired by the hyphen join — εὐ is a FRAGMENT of a word broken at the column edge; column_words joins it now"),
    (58, 'L', 39, 0): ('forms:θείαν|θεῖαν',
     "retired by the hyphen join — θεῖαν is a FRAGMENT of a word broken at the column edge; column_words joins it now"),
    (61, 'R', 32, 0): ('forms:ιέναι|ἰέναι',
     "retired by the hyphen join — ιέναι is a FRAGMENT of a word broken at the column edge; column_words joins it now"),
    (61, 'R', 53, 0): ('forms:ποδῶν|πόδων',
     "retired by the hyphen join — πόδων is a FRAGMENT of a word broken at the column edge; column_words joins it now"),
    (62, 'L', 60, 0): ('forms:πάλιν|παλιν',
     "retired by the hyphen join — παλιν is a FRAGMENT of a word broken at the column edge; column_words joins it now"),
    (62, 'R', 16, 0): ('forms:πάλιν|παλιν',
     "retired by the hyphen join — παλιν is a FRAGMENT of a word broken at the column edge; column_words joins it now"),
    (54, 'L', 32, 52): ('forms:ἀ-γνοιαν|ἄ-γνοιαν',
                        'accept ἄ-γνοιαν — the acute the accent sweep asked '
                        'for is now printed, so it no longer contradicts'),
    (56, 'L', 6, 0): ('forms:γνωσις|γνῶσις',
                      'accept γνωσιϛ — the final sigma is a stigma, and the '
                      'diacritic candidate went with it'),
    (56, 'L', 22, 19): ('forms:ἀπόπλ[?]ς',
                        'accept ἀπόπλȣς — the damaged letter was read, so no '
                        'token there ends in λ for D1 to report'),
    (60, 'R', 56, 36): ('page-060-R:L56:hand-υ[?]τον',
                        'accept ὦτον — the token he ruled `preserve` was the '
                        'bare `τον` of `υ[?]τον`, and on 2026-08-15 he read '
                        'the ink: "should be (τὸν ὦτον)". The placeholder and '
                        'the υ went with it, so there is no bare `τον` on the '
                        'line for D1 to report'),
    (58, 'R', 53, 7): ('forms:Ρα|Ῥα',
                       'accept Ρα — the siglum reads as the index sets it'),
    (59, 'R', 23, 0): ('forms:ἀνά-ληψις|ἀνά-λῆψις',
                       'accept ἀνά-ληψιϛ — stigma again, and the circumflex '
                       'candidate with it'),
    (59, 'R', 60, 0): ('forms:κατ|κατ᾽',
                       'the c49 accept — BOTH occurrences came from one D1 '
                       'row, and with the second elided too the row no longer '
                       'fires, so this site went with its twin'),
    (59, 'R', 60, 49): ('forms:κατ|κατ᾽',
                        'accept κατ᾽ — the token is elided, so §133 has '
                        'nothing to say about how it ends'),
    (62, 'R', 2, 19): ('forms:ἔξȣσιν|ἕξȣσιν',
                       'accept ἕξȣσιν — the rough breathing is now printed'),
}


def _closed_sittings():
    """Every site the closed sittings ruled, with its sid and verdict."""
    for path in CLOSED_SITTINGS:
        if not path.exists():
            pytest.skip(f'{path.name} is not in this tree')
    if not STORE.exists():
        pytest.skip('no ruling store in this tree')
    store = json.loads(STORE.read_text(encoding='utf-8'))
    out = []
    for path in CLOSED_SITTINGS:
        for e in json.loads(path.read_text(encoding='utf-8'))['entries']:
            # ⚠ ONLY THIS TEST'S RANGE. The 15-102 sitting spans the whole
            # corpus and `build(LO, HI)` rebuilds ten pages of it, so an entry
            # from page 101 is "no longer found" for the dull reason that
            # nothing looked there — which would drown the reverse check in
            # false losses the moment a wider sitting joined the list.
            if not (LO <= int(e['page']) <= HI):
                continue
            sid = 'forms:' + '|'.join(e['form_set'])
            if sid in store:
                out.append((e, sid, store[sid]['verdict']))
    return out


# Reading a queue entry's printed span — `pieces` where the entry has them, one
# offset and the sweep's token where it predates them — is fiddly enough to
# deserve one implementation. `bonitz_pipeline.adjudication` owns it, because
# the status page needs the same answer to tell an open finding from a settled
# one, and two copies of this would drift the day a queue shape changes.
#
# The RULE each caller builds on it stays its own. This one is strict — the
# ruled site whole inside the rebuilt token — because carrying John's answer to
# a place he never saw is the failure it guards. The dashboard's is looser by
# design: a ligature cluster is ruled INSIDE a word, not around it.
_spans = adjudication._settle_spans


def _covers(new: dict, ruled: dict) -> bool:
    """True when the rebuilt token contains the ruled site whole."""
    return all(any(adjudication._within(a, b) for b in _spans(new))
               for a in _spans(ruled))


def _place(e):
    """The site a queue entry names: page, column, printed line, offset."""
    return (e['page'], e['col'], e['line'], e['char_at_corpus'])


def test_no_site_john_already_ruled_is_served_again_as_new():
    """Every rebuilt site must resolve to one a closed sitting ruled.

    Identity is (page, col, word_off) — the word's start, per the round-2
    contract. Where the two disagree the rebuilt card must be a WIDENING of the
    ruled one: the whole ruled span inside the new printed token, which is what
    joining a hyphen or swallowing a damage marker does. Anything looser is a
    fuzzy match, and a fuzzy match here hands John's answer to a place he never
    saw.
    """
    ruled = _closed_sittings()
    queue, orphans = mr.build(LO, HI)
    assert orphans == [], orphans

    new_findings, loose = [], []
    for e in queue['entries']:
        exact = [(x, sid, v) for x, sid, v in ruled
                 if (x['page'], x['col'], x['word_off'])
                 == (e['page'], e['col'], e['word_off'])]
        if exact:
            continue
        wider = [(x, sid, v) for x, sid, v in ruled
                 if (x['page'], x['col']) == (e['page'], e['col'])
                 and _covers(e, x)
                 and len(e['printed_token']) > len(x['readers']['opus'])]
        if not wider:
            new_findings.append(
                f"{e['page']:03d}-{e['col']}:{e['line']} "
                f"{e['printed_token']!r} (word_off {e['word_off']}, "
                f"{'/'.join(e['form_set'])})")
            continue
        loose.append((e, wider))

    assert not new_findings, (
        f'{len(new_findings)} rebuilt site(s) match nothing John has ruled. '
        f'Each is either a genuinely new finding — which must reach him as a '
        f'card, not be absorbed here — or a broken identity join:\n  '
        + '\n  '.join(new_findings))

    # The looser join is only ever the round-2 widening, and it must stay that.
    for e, wider in loose:
        assert e['broken'] or '[' in e['printed_token'] or any(
            c in e['printed_token'] for c in mr.APOSTROPHES), (
            f"{e['page']:03d}-{e['col']}:{e['line']} {e['printed_token']!r} "
            f"needed a looser join without being a widened token")


def test_every_ruled_finding_either_survives_or_is_accounted_for():
    """The other direction: a ruled site that the rebuild no longer finds.

    That is the normal, wanted outcome — the corpus was corrected and the sweep
    has nothing left to say. But it must be SAID. An unexplained disappearance
    reads exactly like a finding that fell out of the queue, which is the
    failure this whole pipeline is built against.
    """
    ruled = _closed_sittings()
    queue, _ = mr.build(LO, HI)
    entries = queue['entries']

    gone, unexplained = {}, []
    for x, sid, verdict in ruled:
        found = [e for e in entries
                 if (e['page'], e['col']) == (x['page'], x['col'])
                 and (e['word_off'] == x['word_off'] or _covers(e, x))]
        if found:
            continue
        gone[_place(x)] = sid
        if _place(x) not in RESOLVED_BY:
            unexplained.append(
                f"{x['page']:03d}-{x['col']}:{x['line']} "
                f"{x['readers']['opus']!r} — ruled {verdict} under {sid}")

    assert not unexplained, (
        f'{len(unexplained)} site(s) John ruled are no longer found and '
        f'nothing records why. If the applied corpus resolved them, say which '
        f'ruling did it in RESOLVED_BY; if not, they have been lost:\n  '
        + '\n  '.join(unexplained))

    # And the ledger may not rot: an entry claiming a finding is gone when it
    # is still being served would hide a real re-serve.
    stale = [k for k in RESOLVED_BY if k not in gone]
    assert not stale, (
        f'RESOLVED_BY records {len(stale)} site(s) as resolved that the '
        f'rebuild still finds: {stale}')

    # Every resolution names a ruling that was actually given — in EITHER
    # store. ⚠ THE AUDIT QUEUE CORRECTS THESE PAGES TOO. `forms:` sids come
    # from the merge sitting; a `hand-` or per-line sid comes from
    # work/audit/audit-rulings.json, and 60-R:56 was mended from there when
    # John read `(τὸν υ[?]τον)` as `(τὸν ὦτον)`. Looking in one store only
    # would call his own ruling a fabrication.
    store = json.loads(STORE.read_text(encoding='utf-8'))
    audit = json.loads(
        (mr.ROOT / 'work/audit/audit-rulings.json').read_text(
            encoding='utf-8'))
    audit = audit.get('rulings', audit)
    for site, (sid, why) in RESOLVED_BY.items():
        where = store if sid in store else audit
        assert sid in where, f'{site} claims {sid}, which nobody ruled'
        assert where[sid].get('verdict') in ('accept', 'preserve', 'fix'), (
            f'{site} claims {sid}, which was answered '
            f'{where[sid].get("verdict")} and so corrected nothing')


def test_half_a_transcribed_page_is_not_a_clean_page():
    """`corpus_columns` checked page NUMBERS, so a page whose L existed and
    whose R did not was certified; the sweep then asked for R, got [] from a
    required=False lookup, and reported it clean."""
    import pytest
    from bonitz_pipeline.normalize import corpus_columns
    with pytest.raises(FileNotFoundError) as exc:
        corpus_columns([9999])
    assert '9999-L' in str(exc.value) and '9999-R' in str(exc.value)
