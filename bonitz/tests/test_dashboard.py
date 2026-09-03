"""The status page, and the difference between a finding and a task.

John read the sweeps table and asked whether the red numbers were resolved
findings. They were neither resolved nor new: most of them are places he has
already ruled, where he told us to keep what Bonitz printed — so the sweep goes
on disagreeing with its authority for as long as the page says what it says.
The dashboard was counting those beside the ones nobody has looked at, which is
the two-states-where-there-are-three failure, committed by the page whose whole
job is to make that failure impossible.

Every test here is about a distinction surviving: open against adjudicated,
adjudicated against never-looked-at, and both against the three states the page
already kept.
"""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path

import pytest

from bonitz_pipeline import adjudication as A
from bonitz_pipeline import dashboard as D

LO, HI = 53, 62


# --- the corpus as it stands ------------------------------------------------

def test_the_findings_on_53_62_are_answered_not_new():
    """⚠ THE QUESTION JOHN ACTUALLY ASKED. Every finding the sweeps still make
    on 53-62 sits at a site he has ruled — 42 of them, none open. The page said
    "42 findings to review", and there was nothing to review."""
    counted = D.findings(LO, HI)
    split = D.adjudication(LO, HI, counted)
    # ⚠ THE CLAIM IS `0 OPEN`, NOT THE TOTAL. This read (0, 20) until the
    # hyphen join of 2026-08-18 retired twelve fragment findings — words
    # Bonitz broke at the column edge, which `diacritic_sweep` had been
    # comparing to whole LlamaParse forms. Those questions were never real, so
    # the total falls to 8 and nothing was lost; the open count, which is what
    # John asked about, is still zero. Asserting the total would make this
    # test fail every time a sweep gets more precise.
    assert split['diacritic_sweep'][0] == 0, split['diacritic_sweep']
    assert split['diacritic_sweep'][1] == 8, split['diacritic_sweep']
    # ⚠ ONLY THE SWEEPS THE MAPPER KNOWS. Six more gained counters on
    # 2026-08-19 — alphacheck, bekker, family, lexcheck, quotecheck, the
    # breathing oracle — and none of their findings passes through
    # `merge_review.collect`, so the mapper cannot split them and the page
    # says NOT MAPPED. That is the state this module reserves for exactly
    # this case, not a defect: a counter without a mapper must never render
    # as all-adjudicated. Asserting a mapper for every counted sweep would
    # force the choice between deleting real counts and faking a split.
    mapped = set(A.SWEEP_NAMES.values())
    for name, hits in counted.items():
        if not isinstance(hits, int) or name not in mapped:
            continue
        got = split[name]
        assert got != D.NOT_MAPPED, f'{name} could not be mapped'
        assert sum(got) == hits, (
            f'{name}: {hits} counted but {got} split — a finding fell between '
            f'the counter and the mapper')
        assert got[0] == 0, (
            f'{name} has {got[0]} open finding(s); if that is real it belongs '
            f'in a card, and this expectation should say so')


def test_a_held_back_site_is_answered_only_by_its_own_follow_up():
    """An excluded site is the opposite of a ruled one: John looked at that
    crop and declined to let the card's answer bind it, so it waited in the
    follow-up queue. Counting it as answered would lose exactly the site he
    protected.

    ⚠ AND THAT SITTING HAS NOW HAPPENED, so this cannot be pinned to "none of
    them are adjudicated" — the state closed on 2026-08-11, when all twelve got
    a real verdict. It is keyed on the store instead: a held-back site is
    adjudicated exactly when its own follow-up card carries a real verdict, and
    open otherwise. The direction it was written to guard is kept in a fixture,
    where the unruled state can be synthesised on demand.
    """
    store = A.SWEEPS / 'ligature-rulings.json'
    queue = A.WORK / 'queue-ligature.json'
    followup = A.SWEEPS / 'ligature-excluded-rulings.json'
    if not store.exists() or not queue.exists():
        pytest.skip('no ligature sitting in this tree')
    answers = json.loads(store.read_text(encoding='utf-8'))
    cards = json.loads(queue.read_text(encoding='utf-8'))['cards']
    excluded = {s for v in answers.values() for s in (v.get('excluded') or ())}
    assert excluded, 'no site was excluded, so this proves nothing'
    later = (json.loads(followup.read_text(encoding='utf-8'))
             if followup.exists() else {})

    held = [m for c in cards for m in c['members']
            if A._member_sid(m) in excluded]
    assert len(held) == len(excluded), 'an excluded sid names no member'
    sites = A.ruled_sites(min(m['page'] for m in held),
                          max(m['page'] for m in held))
    for m in held:
        span = ((m['line'], m['char_at'], m['char_at'] + len(m['form'])),)
        hit = A.adjudicated_by(m['page'], m['col'], span, sites)
        own = later.get('site:' + A._member_sid(m)) or {}
        if own.get('verdict') in A.REAL_VERDICTS:
            assert hit is not None, (
                f"{A._member_sid(m)} has been answered and is still counted "
                f"as work")
        else:
            assert hit is None, (
                f"{A._member_sid(m)} was held back, nothing has answered it, "
                f"and it is being counted as ruled")


def test_the_follow_up_sitting_answers_only_what_it_has_answered():
    """The excluded sites were rebuilt into per-site cards — sids like
    `site:page-015-R:43:51` — and John's earlier `none` answers stayed on the
    form-set sids of the first sitting, where they now name no card at all.
    Those four settle nothing, which is right twice over. The twelve that got a
    real verdict are answered; anything else is still open."""
    queue = A.WORK / 'queue-ligature-excluded.json'
    store = A.SWEEPS / 'ligature-excluded-rulings.json'
    if not queue.exists():
        pytest.skip('no follow-up queue in this tree')
    cards = json.loads(queue.read_text(encoding='utf-8'))['cards']
    assert cards, 'the follow-up queue is empty, so this proves nothing'
    answers = (json.loads(store.read_text(encoding='utf-8'))
               if store.exists() else {})

    pages = [m['page'] for c in cards for m in c['members']]
    sites = A.ruled_sites(min(pages), max(pages))
    for card in cards:
        real = (answers.get(card['sid']) or {}).get('verdict') \
            in A.REAL_VERDICTS
        for m in card['members']:
            span = ((m['line'], m['char_at'],
                     m['char_at'] + len(m['form'])),)
            hit = A.adjudicated_by(m['page'], m['col'], span, sites)
            assert (hit is not None) == real, (
                f"{card['sid']}: answered={real} but adjudicated={hit}")

    # ⚠ A VERDICT IS THE FACT; THE DETAIL IS NOT. `site:page-021-L:32:52` is
    # ruled accept with detail `οὐχ` — spelled out, no ligature — because the
    # page literally prints it that way and no card button could offer the
    # absent sort. The mapper must never look past the verdict to judge whether
    # a form is composed, or that site would read as unanswered forever.
    odd = [k for k, v in answers.items()
           if v.get('verdict') in A.REAL_VERDICTS and 'ȣ' not in v.get(
               'detail', '')]
    for sid in odd:
        page, col, line, at = A.MEMBER_SID.search(sid).groups()
        member = next(m for c in cards if c['sid'] == sid
                      for m in c['members'])
        span = ((member['line'], member['char_at'],
                 member['char_at'] + len(member['form'])),)
        assert A.adjudicated_by(int(page), col, span, sites) is not None, (
            f'{sid} was ruled but its detail spells no ligature, and the '
            f'mapper is judging the detail instead of the verdict')


def test_the_three_states_the_page_already_kept_are_untouched():
    """This change ADDS a distinction. A sweep that never ran, one with no
    counter, and one that found nothing were three different things before and
    must be three different things after."""
    counted = D.findings(LO, HI)
    split = D.adjudication(LO, HI, counted)
    seen = {D.cell_state(hits, split.get(n))[0]
            for n, hits in counted.items()}
    assert 'not counted' in seen and 'zero' in seen
    assert D.cell_state(None, None)[0] == 'never run'
    assert D.cell_state(D.NOT_COUNTED, None)[0] == 'not counted'
    assert D.cell_state(0, (0, 0))[0] == 'zero'
    assert D.cell_state(20, (0, 20))[0] == 'settled'
    assert D.cell_state(20, (2, 18))[0] == 'open'
    assert D.cell_state(20, D.NOT_MAPPED)[0] == 'not mapped'
    assert len({'never run', 'not counted', 'zero', 'settled', 'open',
                'not mapped'}) == 6


def test_a_row_with_nothing_open_does_not_read_as_a_row_with_nothing_found():
    """Both are quiet, and they mean opposite things: one was disputed and
    settled, the other was never disputed at all.

    ⚠ COMPUTED, NOT PINNED. This asserted `all 20 adjudicated`, then `all 8`
    when the hyphen join retired twelve fragment findings, and would have
    needed a third number the moment the dashboard's range stopped being
    frozen at 53-62. A test that has to be re-pinned after every honest
    change stops guarding anything and starts being edited to match. What is
    actually under test is that a SETTLED row and a ZERO row render
    differently — so the number comes from the same state the page renders.
    """
    s = D.state()
    # ⚠ THROUGH cell_state, NOT THE RAW DICT. `adjudication` still holds
    # accent_law's (0, 8) while the page renders it STALE and prints neither
    # number — its report predates the corpus, so "8 adjudicated" is arithmetic
    # over pages it never opened. Reading the dict directly made this test
    # demand a number the page is right to withhold.
    settled = [n for n, v in s['adjudication'].items()
               if D.cell_state(s['findings'].get(n), v,
                               n in s['stale'])[0] == 'settled']
    assert settled, 'no settled row to test with'
    total = s['adjudication'][settled[0]][1]

    html = D.html()
    assert f'all {total} adjudicated' in html
    assert 'pill done' in html
    md = D.markdown()
    assert f'| all {total} adjudicated |' in md

    # ⚠ THE ZERO ROW IS ASSERTED ONLY WHEN ONE EXISTS. Over 53-62 there was
    # always a sweep with nothing to say; over the whole applied corpus there
    # is not — every counted sweep now has findings. Requiring `pill zero`
    # against live data would fail for a true reason, and manufacturing a
    # zero row to satisfy it would be fiction. The zero STATE is proved
    # directly, on synthetic input, by the cell_state test above.
    zero = [n for n, v in s['adjudication'].items()
            if D.cell_state(s['findings'].get(n), v,
                            n in s['stale'])[0] == 'zero']
    if zero:
        assert 'pill zero' in html and '| 0 |' in md


def test_the_tile_counts_work_and_not_history():
    """`findings to review` counted 42 things John had reviewed."""
    s = D.state()
    adjudicated = sum(
        D.cell_state(s['findings'].get(n), v, n in s['stale'])[2]
        for n, v in s['adjudication'].items())
    html = D.html()
    assert 'findings open' in html and 'findings to review' not in html
    assert f'{adjudicated} adjudicated' in html


# --- a synthetic sweep, so the OPEN direction is proved too -----------------

PAGE = 900
LINE = 'κατ᾽ ἀναλογίαν λέγεσθαι Ζγα1. 715 b20.\n'
# The same line as Bonitz sets it at 59-R:60 — the word twice, elided once and
# bare at the measure. One report row, two sites.
TWICE = 'κατ᾽ ἀναλογίαν λέγεσθαι Ζγα1. 715 b20. μεταφοραὶ κατ\n'


@pytest.fixture
def bench(tmp_path, monkeypatch):
    """One column, one sweep report, and whatever rulings a test writes.

    The whole stack is pointed at `tmp_path`: the corpus the mapper anchors in,
    the Opus read its offsets are measured against, the report the finding comes
    from, and the sittings it is checked against.
    """
    from bonitz_pipeline import accent, breathing
    from bonitz_pipeline import merge_review as mr

    auto = tmp_path / 'work' / 'reconciled-auto'
    opus = tmp_path / 'raw' / 'opus'
    smyth = tmp_path / 'work' / 'sweeps' / 'smyth'
    smyth.mkdir(parents=True)
    auto.mkdir(parents=True)
    opus.mkdir(parents=True)
    for col in ('L', 'R'):
        name = f'page-{PAGE}-{col}.txt'
        (auto / name).write_text(LINE, encoding='utf-8')
        (opus / name).write_text(LINE, encoding='utf-8')
    (smyth / 'D1.tsv').write_text(
        'column\tline\tword\tdetail\tcontext\n'
        f'page-{PAGE}-L\t1\tκατ\tends in τ\t{LINE.strip()}\n',
        encoding='utf-8')

    def column(page, col, *, required=True):
        p = auto / f'page-{page}-{col}.txt'
        if p.exists():
            return p
        if required:
            raise FileNotFoundError(f'page-{page}-{col} is in no corpus stage')
        return None

    def columns(pages=None):
        return [auto / f'page-{PAGE}-{c}.txt' for c in ('L', 'R')]

    for mod in (mr, accent, breathing):
        monkeypatch.setattr(mod, 'corpus_column', column)
    monkeypatch.setattr(mr, 'corpus_columns', columns)
    monkeypatch.setattr(mr, 'SWEEPS', tmp_path / 'work' / 'sweeps')
    monkeypatch.setattr(mr, 'OPUS', opus)
    monkeypatch.setattr(mr, 'ROOT', tmp_path)
    mr._LINES.clear()
    yield tmp_path
    mr._LINES.clear()


def _sources(monkeypatch, tmp_path, queue: dict | None, store: dict | None,
             shape: str = 'settle'):
    if queue is None:
        monkeypatch.setattr(A, 'SOURCES', [])
        return
    q = tmp_path / 'queue.json'
    s = tmp_path / 'store.json'
    q.write_text(json.dumps(queue, ensure_ascii=False), encoding='utf-8')
    s.write_text(json.dumps(store or {}, ensure_ascii=False), encoding='utf-8')
    monkeypatch.setattr(A, 'SOURCES', [(q, s, shape)])


def _spans_of_the_finding():
    """Where `κατ᾽` sits on the fixture line — the site every test below uses."""
    line = unicodedata.normalize('NFC', LINE.split('\n')[0])
    return [{'line': 1, 'start': 0, 'text': line[:4]}]


def test_a_finding_that_maps_to_no_ruling_is_open(bench, monkeypatch):
    """⚠ THE DIRECTION THAT MUST NEVER DEFAULT. Overstating the work costs an
    hour; understating it loses a site."""
    _sources(monkeypatch, bench, None, None)
    split = A.split(PAGE, PAGE)
    assert split['smyth_sweep'].total == 1
    assert (split['smyth_sweep'].open, split['smyth_sweep'].adjudicated) \
        == (1, 0)


def test_a_finding_at_a_ruled_site_is_adjudicated(bench, monkeypatch):
    """And the same finding, once the site carries an answer."""
    entry = {'page': PAGE, 'col': 'L', 'line': 1, 'char_at_corpus': 0,
             'readers': {'opus': 'κατ᾽'}, 'form_set': ['κατ᾽'],
             'pieces': _spans_of_the_finding()}
    _sources(monkeypatch, bench, {'entries': [entry]},
             {'forms:κατ᾽': {'verdict': 'preserve', 'detail': 'κατ᾽'}})
    split = A.split(PAGE, PAGE)
    assert (split['smyth_sweep'].open, split['smyth_sweep'].adjudicated) \
        == (0, 1)


def test_a_ruling_nobody_gave_adjudicates_nothing(bench, monkeypatch):
    """A queue entry whose form-set is absent from the store is a card that was
    served and never answered — the site is still open."""
    entry = {'page': PAGE, 'col': 'L', 'line': 1, 'char_at_corpus': 0,
             'readers': {'opus': 'κατ᾽'}, 'form_set': ['κατ᾽'],
             'pieces': _spans_of_the_finding()}
    _sources(monkeypatch, bench, {'entries': [entry]}, {})
    assert A.split(PAGE, PAGE)['smyth_sweep'].open == 1


def test_a_site_excluded_from_a_ligature_card_stays_open(bench, monkeypatch):
    """The ligature sitting rules a form across every site at once, except the
    ones John excluded from that ruling. An excluded site is not answered — it
    is waiting in the follow-up queue, and it must count as work."""
    # ⚠ THE TWO OFFSETS MUST DIFFER IN THE FIXTURE. The ligature sitting names
    # a site by `char_at`, where every other queue here uses `word_off`, and
    # building the key from the habit matched no member at all — so every site
    # John held back was counted as answered, silently, by an empty set. A
    # fixture where the two are equal cannot catch that coming back.
    member = {'page': PAGE, 'col': 'L', 'line': 1, 'char_at': 0,
              'word_off': 137, 'form': 'κατ᾽'}
    assert member['char_at'] != member['word_off']
    card = {'sid': 'forms:κατ᾽', 'members': [member]}
    ruling = {'forms:κατ᾽': {'verdict': 'accept', 'detail': 'κατ᾽',
                             'excluded': [A._member_sid(member)]}}
    _sources(monkeypatch, bench, {'cards': [card]}, ruling, 'ligature')
    assert A.split(PAGE, PAGE)['smyth_sweep'].open == 1

    # …and the identical card without the exclusion answers it.
    ruling['forms:κατ᾽']['excluded'] = []
    _sources(monkeypatch, bench, {'cards': [card]}, ruling, 'ligature')
    assert A.split(PAGE, PAGE)['smyth_sweep'].adjudicated == 1


def test_a_row_naming_two_places_is_answered_only_when_both_are(bench,
                                                                monkeypatch):
    """⚠ ONE ROW, TWO SITES. `κατ` occurs twice on 59-R:60 — elided at the line
    start, bare at the measure — and the sweep reports it once. Counting the
    row as answered because one of its places is would drop the other, so the
    row stays open until every place it names has been ruled."""
    from bonitz_pipeline import merge_review as mr
    for col in ('L', 'R'):
        (bench / 'work' / 'reconciled-auto' / f'page-{PAGE}-{col}.txt'
         ).write_text(TWICE, encoding='utf-8')
        (bench / 'raw' / 'opus' / f'page-{PAGE}-{col}.txt'
         ).write_text(TWICE, encoding='utf-8')
    mr._LINES.clear()

    first = {'page': PAGE, 'col': 'L', 'line': 1, 'char_at_corpus': 0,
             'readers': {'opus': 'κατ᾽'}, 'form_set': ['κατ᾽'],
             'pieces': [{'line': 1, 'start': 0, 'text': 'κατ᾽'}]}
    last = {'page': PAGE, 'col': 'L', 'line': 1, 'char_at_corpus': 49,
            'readers': {'opus': 'κατ'}, 'form_set': ['κατ'],
            'pieces': [{'line': 1, 'start': 49, 'text': 'κατ'}]}
    store = {'forms:κατ᾽': {'verdict': 'preserve'},
             'forms:κατ': {'verdict': 'accept', 'detail': 'κατ᾽'}}

    _sources(monkeypatch, bench, {'entries': [first]}, store)
    assert A.split(PAGE, PAGE)['smyth_sweep'].open == 1, 'one place is not both'

    _sources(monkeypatch, bench, {'entries': [first, last]}, store)
    assert A.split(PAGE, PAGE)['smyth_sweep'].adjudicated == 1


def test_a_held_back_site_is_open_until_a_real_verdict_lands(bench,
                                                             monkeypatch):
    """⚠ THE DIRECTION THE LIVE TEST CAN NO LONGER PIN. John has now ruled all
    twelve held-back sites, so the tree carries no example of one waiting. The
    state is synthesised here instead: the same follow-up card, in each of the
    three conditions it passes through.

    Nothing about a site's own coordinates changes on the way — only whether an
    answer exists — so a mapper that ever reports it settled before one does is
    losing the site John deliberately protected."""
    member = {'page': PAGE, 'col': 'L', 'line': 1, 'char_at': 0,
              'word_off': 137, 'form': 'κατ᾽'}
    sid = 'site:' + A._member_sid(member)
    card = {'sid': sid, 'members': [member]}

    def outcome(store):
        _sources(monkeypatch, bench, {'cards': [card]}, store, 'ligature')
        return A.split(PAGE, PAGE)['smyth_sweep']

    assert outcome({}).open == 1                      # never asked
    assert outcome({sid: {'verdict': 'none', 'detail': ''}}).open == 1
    assert outcome({sid: {'verdict': 'accept',
                          'detail': 'κατ᾽'}}).adjudicated == 1

    # And a verdict answers whatever its detail happens to spell — John ruled
    # one of these sites `accept οὐχ`, spelled out, because the page prints no
    # ligature there. The verdict is the fact.
    assert outcome({sid: {'verdict': 'accept', 'detail': 'οὐχ',
                          'ruled_via': 'chat'}}).adjudicated == 1


def test_none_is_a_deferral_and_leaves_the_site_open(bench, monkeypatch):
    """⚠ "NONE OF THESE" MEANS THE CARD WAS WRONG, NOT THAT THE SITE IS DONE.
    It says every reading offered was wrong, so a follow-up is owed — which is
    exactly what open means on a status page. Seven of the eight `none` answers
    on 53-62 proved it: each came back as a corrected card and got a real
    verdict."""
    entry = {'page': PAGE, 'col': 'L', 'line': 1, 'char_at_corpus': 0,
             'readers': {'opus': 'κατ᾽'}, 'form_set': ['κατ᾽'],
             'pieces': [{'line': 1, 'start': 0, 'text': 'κατ᾽'}]}
    _sources(monkeypatch, bench, {'entries': [entry]},
             {'forms:κατ᾽': {'verdict': 'none', 'detail': ''}})
    assert A.split(PAGE, PAGE)['smyth_sweep'].open == 1

    # The site is still recorded — a deferral is a fact — it just answers
    # nothing.
    site = A.ruled_sites(PAGE, PAGE)[0]
    assert site.verdict == 'none' and not site.answers


def test_a_none_superseded_by_a_real_verdict_is_adjudicated(bench,
                                                            monkeypatch):
    """The ordering rule, and it needs no timestamps: a `none` never answers,
    so a site ruled none-and-then-accept is adjudicated by the accept and a
    site ruled only none is open. Both orders give the same result, which is
    the point — the stores record no time."""
    pieces = [{'line': 1, 'start': 0, 'text': 'κατ᾽'}]
    defective = {'page': PAGE, 'col': 'L', 'line': 1, 'char_at_corpus': 0,
                 'readers': {'opus': 'κατ'}, 'form_set': ['κατ'],
                 'pieces': pieces}
    corrected = dict(defective, readers={'opus': 'κατ᾽'}, form_set=['κατ᾽'])
    store = {'forms:κατ': {'verdict': 'none', 'detail': ''},
             'forms:κατ᾽': {'verdict': 'preserve', 'detail': 'κατ᾽'}}

    _sources(monkeypatch, bench, {'entries': [defective, corrected]}, store)
    assert A.split(PAGE, PAGE)['smyth_sweep'].adjudicated == 1
    # …and the same two answers in the other order say the same thing.
    _sources(monkeypatch, bench, {'entries': [corrected, defective]}, store)
    assert A.split(PAGE, PAGE)['smyth_sweep'].adjudicated == 1
    # Alone, the deferral leaves it open.
    _sources(monkeypatch, bench, {'entries': [defective]},
             {'forms:κατ': {'verdict': 'none', 'detail': ''}})
    assert A.split(PAGE, PAGE)['smyth_sweep'].open == 1


def test_one_word_two_cards_do_not_answer_for_each_other():
    """⚠ GROK'S COUNTERFACTUAL, AND THE DEFECT IT FOUND IS NOW GONE AT SOURCE.

    `εὐ-θεῖαν` at 58-L was one printed word carrying two cards — the breathing
    on the head, the circumflex on the tail. Matching whole tokens let either
    ruling answer both, so deleting the `εὐ` ruling left the `εὐ` finding
    green, answered by a card about the other end of the word.

    On 2026-08-18 `diacritic_sweep` learned to join words Bonitz breaks at the
    column edge, and `εὐ` stopped being a finding at all: it is a fragment, and
    the sweep was comparing it against whole LlamaParse forms. So the probe
    this test used has no target, and rather than skip in silence — which
    would read exactly like a passing test — it now asserts the stronger thing
    the fix bought: on 53-62 NO printed line carries more than one finding, so
    no ruling can answer for another word's card.

    The general property still has a guard that does not depend on the corpus:
    `test_a_straddling_span_is_not_the_same_site` below, on synthetic spans. If
    a multi-finding line ever returns, this fails and the counterfactual should
    be rebuilt on it.
    """
    from collections import defaultdict

    from bonitz_pipeline import merge_review as mr

    by_line = defaultdict(list)
    for page in range(53, 63):
        for f in mr.collect(page, page):
            by_line[(f.page, f.col, f.line)].append(f.printed)
    multi = {k: v for k, v in by_line.items() if len(v) > 1}
    assert not multi, (
        'a printed line carries two findings again — one ruling can now answer '
        'for the other word. Rebuild the deletion counterfactual on it: '
        f'{sorted(multi.items())[:5]}')


def test_a_straddling_span_is_not_the_same_site(bench, monkeypatch):
    """Containment either way, never a partial overlap: the ruled token may be
    inside the finding's or the other way round, but two spans that merely
    share an edge are two words, and one's answer is not the other's."""
    site = A.Ruled(PAGE, 'L', ((1, 2, 9),), 'forms:x', 'preserve', 'test')
    assert A.adjudicated_by(PAGE, 'L', ((1, 0, 4),), [site]) is None
    assert A.adjudicated_by(PAGE, 'L', ((1, 3, 6),), [site]) is not None
    assert A.adjudicated_by(PAGE, 'L', ((1, 0, 20),), [site]) is not None
    assert A.adjudicated_by(PAGE, 'R', ((1, 3, 6),), [site]) is None
    assert A.adjudicated_by(PAGE, 'L', ((2, 3, 6),), [site]) is None


def test_a_counter_with_no_mapper_is_not_mapped(monkeypatch):
    """⚠ THE SPLIT MUST REFUSE TO GUESS. Add a counter here without a mapper
    there and every one of its findings would show as answered — the exact
    silent-loss shape this page exists to prevent. When the two disagree the
    cell says so."""
    monkeypatch.setattr(A, 'split', lambda lo, hi: {})
    assert D.adjudication(LO, HI, {'invented': 7}) == {'invented': D.NOT_MAPPED}
    # A sweep with no findings and none enumerated is agreement, not a gap.
    assert D.adjudication(LO, HI, {'invented': 0}) == {'invented': (0, 0)}
    # And a count that drifts from the mapper's is a gap, not a rounding.
    monkeypatch.setattr(A, 'split', lambda lo, hi: {'x': A.Split(total=3,
                                                                 open=1,
                                                                 adjudicated=2)})
    assert D.adjudication(LO, HI, {'x': 4}) == {'x': D.NOT_MAPPED}
    assert D.adjudication(LO, HI, {'x': 3}) == {'x': (1, 2)}


def test_the_page_still_renders_when_a_sweep_is_unmapped(monkeypatch):
    """The unmapped state has to survive the trip to HTML and Markdown, or it
    is a distinction the code keeps and the reader never sees.

    ⚠ THE OTHER INPUTS TO `cell_state` ARE PINNED HERE ON PURPOSE, AND THE
    REASON IS THE BUG THIS TEST ONCE HAD.  Staleness outranks unmappedness in
    `cell_state` — correctly, since a report that predates the corpus is the
    more urgent thing to say — so a sweep whose report happens to be stale on
    disk never reaches the branch under test.  Pinning only `adjudication` left
    the assertion at the mercy of whichever sweep had been re-run most
    recently: it passed for months, then failed the day `diacritic_sweep` went
    stale over the widened 15-106 range, having never once exercised what its
    own docstring claims.  A test that reads the corpus to decide what it
    tests is not testing the renderer.
    """
    monkeypatch.setattr(D, 'adjudication',
                        lambda lo=LO, hi=HI, counted=None: {
                            'diacritic_sweep': D.NOT_MAPPED})
    monkeypatch.setattr(D, 'findings',
                        lambda lo=LO, hi=HI: {'diacritic_sweep': 8})
    monkeypatch.setattr(D, 'stale_sweeps', lambda lo=LO, hi=HI: set())
    html, md = D.html(), D.markdown()
    assert 'not mapped' in html and 'not mapped' in md


# --- the one ledger, and the answers that never passed through a queue ------
#
# John rules in two ways. He clicks a card, and the verdict lands in a sweep
# store that `SOURCES` names. Or he types the form in conversation — "018-L:54
# should be ἁγνός", "headword is ROUGH" — and `john_rulings` appends it to
# `work/rulings/john.json`, the one ledger. Only the first route was wired, so
# on 2026-08-18 the status page called 041-R:32 and 043-L:35 OPEN for hours
# after he had answered both. These pin the second route.

def test_the_ledger_anchors_sites_and_does_not_silently_anchor_none():
    """⚠ THIS EXISTS BECAUSE THE FIRST CUT ANCHORED 0 OF 689 AND SAID NOTHING.

    The ledger spells a column `page-024-L`; `corpus_column` builds that stem
    itself from the page and the side, so it was handed `page-024-page-024-L`,
    found it in no stage, and answered None with `required=False` — the same
    answer it gives for a page nobody has transcribed. Every entry fell through
    the absence branch and the function returned an empty list, cleanly.
    """
    sites = A._ledger_sites(15, 102)
    assert len(sites) > 100, (
        f'only {len(sites)} ledger sites anchored — the ledger holds hundreds '
        'of ruled sites in this range, so near-zero means the anchor is broken, '
        'not that John has not ruled')
    assert len({(s.page, s.col) for s in sites}) > 20
    assert all(s.col in ('L', 'R') for s in sites), (
        'Ruled.col must be the side alone, as findings spell it — a full stem '
        'here matches no finding and quietly adjudicates nothing')


def test_declined_and_pending_never_close_a_site():
    """John saying he has not answered is not an answer.

    `declined` and `pending` are him declining to rule. Mapping either to a
    verdict would close a site he deliberately left open, and this module's
    standing rule is that overstating the work left costs an hour while
    understating it loses a site.
    """
    assert 'declined' not in A.LEDGER_VERDICTS
    assert 'pending' not in A.LEDGER_VERDICTS
    assert 'policy' not in A.LEDGER_VERDICTS
    assert set(A.LEDGER_VERDICTS.values()) <= set(A.REAL_VERDICTS)


def test_a_form_that_has_moved_does_not_anchor(tmp_path, monkeypatch):
    """A ruling anchors to the ink, or it does not anchor at all."""
    ledger = tmp_path / 'john.json'
    ledger.write_text(json.dumps({'rulings': [
        {'kind': 'keep', 'col': 'page-053-L', 'line': 1,
         'form': 'ΝΟΤΑΦΟΡΜΟΝΤΗΙΣΛΙΝΕ'},
        {'kind': 'text', 'col': 'not-a-column', 'line': 1, 'form': 'x'},
    ]}, ensure_ascii=False), encoding='utf-8')
    monkeypatch.setattr(A, 'LEDGER', ledger)
    assert A._ledger_sites(53, 62) == []


def test_wiring_the_ledger_only_ever_closes_findings():
    """It may answer an open finding. It must never open a settled one."""
    after = A.split(LO, HI)
    real = A._ledger_sites
    try:
        A._ledger_sites = lambda lo, hi: []
        before = A.split(LO, HI)
    finally:
        A._ledger_sites = real
    for name, b in before.items():
        a = after.get(name)
        assert a is not None, f'{name} vanished when the ledger was read'
        assert a.total == b.total, f'{name}: the ledger changed a total'
        assert a.open <= b.open, f'{name}: reading the ledger OPENED findings'


# --- a report older than the corpus is not evidence about the corpus --------
#
# `_tsv_hits` filters a report's rows to [lo, hi] and never asks whether the
# report EXAMINED [lo, hi]. `accent-law-violations.tsv`, written 2026-08-17, was
# filtered against a corpus carrying 276 rulings made on the 18th and reported
# "all 8 adjudicated" — a clean bill of health for pages it had never opened.

def test_stale_outranks_the_reassuring_states():
    """Settled and zero are exactly what a lagging report produces."""
    assert D.cell_state(20, (0, 20), True)[0] == 'stale'
    assert D.cell_state(0, (0, 0), True)[0] == 'stale'
    assert D.cell_state(20, (2, 18), True)[0] == 'stale'
    assert D.cell_state(20, D.NOT_MAPPED, True)[0] == 'stale'


def test_stale_does_not_swallow_never_run_or_not_counted():
    """A report that does not exist cannot be out of date — it is absent.

    Collapsing those would be the two-states-where-there-are-three mistake in
    a new place, and 'stale' implies a report exists to re-run.
    """
    assert D.cell_state(None, None, True)[0] == 'never run'
    assert D.cell_state(D.NOT_COUNTED, None, True)[0] == 'not counted'


def test_stale_defaults_off_so_a_missed_call_site_cannot_hide_a_finding():
    assert D.cell_state(20, (2, 18))[0] == 'open'


def test_no_corpus_in_range_means_no_staleness_claim():
    """With nothing to lag behind, 'stale' asserts something nobody checked."""
    real = D._corpus_mtime
    try:
        D._corpus_mtime = lambda lo, hi: 0.0
        assert D.stale_sweeps(15, 102) == set()
    finally:
        D._corpus_mtime = real


def test_every_lagging_sweep_reaches_the_rendered_table():
    """The set is derived in state(); both renderers must actually use it."""
    s = D.state()
    md = D.markdown()
    for name in s['stale']:
        row = [l for l in md.splitlines() if l.startswith(f'| `{name}` |')]
        assert row, f'{name} is missing from the sweeps table entirely'
        assert 'stale' in row[0], (
            f'{name} lags the corpus but the table reports: {row[0]}')


# --- the six sweeps that had no counter ------------------------------------
#
# `alphacheck`, `bekker`, `family`, `lexcheck`, `quotecheck` and the breathing
# oracle read "not counted" for months — not because they had never run, but
# because nothing here called them. The page could say nothing at all about
# whether quotations matched the lines they cite.

def test_every_live_counter_returns_a_number_or_says_why_not():
    """A counter that raises reads as `counter failed`, never as a count.

    ⚠ AND A COUNTER OVER MISSING EVIDENCE RETURNS NO NUMBER AT ALL. This test
    used to require an int from every counter, which is the right demand while
    every input is on disk and the wrong one after 2026-08-28: `alphacheck`
    reads the indent, the round-5 ALTO carrying it for 103-117 was deleted, and
    the sweep answered 18 over a corpus that had not changed. An int is only
    honest when the sweep saw everything, so the two allowed answers are a
    count and `blind` — never a count taken over a hole.
    """
    f = D.findings(*D.state()['range'])
    for name in D._live_counters():
        assert f[name] != D.FAILED, f'{name} counter raised'
        blind = isinstance(f[name], str) and f[name].startswith(D.BLIND)
        assert isinstance(f[name], int) or blind, f'{name} gave {f[name]!r}'
        if blind:
            assert D.cell_state(f[name], None)[0] == D.BLIND


def test_a_counter_counts_findings_and_not_candidates():
    """⚠ THE FIRST CUT COUNTED CANDIDATES AND LOOKED PLAUSIBLE DOING IT.

    `alphacheck` reported 1782 against its own CLI's 34, because `_cols` yields
    each page once per column and the same page handed to `scan` twice shatters
    the alphabetical run it walks. `quotecheck` reported 2962 against 60 — every
    citation it examined, rather than the ones that failed. A wrong number that
    looks like a right number is worse than `not counted`.
    """
    from bonitz_pipeline import alphacheck, quotecheck
    lo, hi = D.state()['range']
    f = D.findings(lo, hi)
    pages = sorted({p for p, _ in D._cols(lo, hi)})

    # alphacheck: the run must be walked over distinct pages, in order. The
    # dashboard withholds the count while any column has no geometry, so the
    # claim is pinned against `scan` itself — the defect this guards (a page
    # handed to scan twice) has nothing to do with the geometry hole, and the
    # test must go on catching it while that hole is open.
    if alphacheck.geometry_missing(pages):
        assert str(f['alphacheck']).startswith(D.BLIND)
    else:
        assert f['alphacheck'] == len(alphacheck.scan(pages))
    assert len(alphacheck.scan(pages)) < len(
        alphacheck.scan([p for p, _ in D._cols(lo, hi)]))

    # quotecheck: a finding is a checkable citation that scored zero and has no
    # standing ruling — strictly fewer than the citations examined
    index = quotecheck.load_corpus()
    examined = sum(len(quotecheck.scan(p, c, index))
                   for p, c in D._cols(lo, hi)[:8])
    assert examined > 0
    assert f['quotecheck'] < sum(len(quotecheck.scan(p, c, index))
                                 for p, c in D._cols(lo, hi))


def test_a_failed_counter_does_not_read_as_never_run():
    assert D.cell_state(D.FAILED, None)[0] == 'counter failed'
    assert D.cell_state(D.FAILED, None)[0] != 'never run'
    assert D.FAILED not in (D.NOT_COUNTED, D.NOT_MAPPED, D.STALE)


def test_a_blind_sweep_reads_as_blind_and_not_as_zero_or_settled():
    """⚠ THE REASSURING STATES ARE THE ONES A HOLE PRODUCES.

    `blind` has to outrank them the way `stale` does. A sweep whose evidence is
    part-missing can answer nothing (its geometry is gone, so it raises no
    finding) or answer wildly (the same geometry gone, so it raises fifteen);
    both render as a considered result. It also must not be mistaken for
    `counter failed` — nothing raised, the sweep ran fine over a corpus that
    is not all there.
    """
    blind = f'{D.BLIND}: 33 columns have no geometry'
    assert D.cell_state(blind, None)[0] == D.BLIND
    assert D.cell_state(blind, (0, 0))[0] == D.BLIND
    assert D.cell_state(blind, None, True)[0] == D.BLIND
    assert D.cell_state(blind, None)[0] not in (
        'zero', 'settled', 'open', 'never run', 'counter failed')
    assert D.BLIND not in (D.NOT_COUNTED, D.NOT_MAPPED, D.STALE, D.FAILED)


def test_the_counter_hands_scan_distinct_pages_even_while_it_is_blind(
        monkeypatch):
    """⚠ THE BLIND BRANCH RETURNS BEFORE `scan` IS CALLED, so no test that runs
    today touches the line that once reported 1782 findings for 34.

    Codex, reviewing this file cross-family, wrote an implementation that passed
    both new tests while reintroducing the duplicate-page defect: with every
    geometry file missing the counter never reaches `scan`, and the assertion
    that duplicates inflate a count is made against `scan` directly, not against
    the wiring. The wiring goes unguarded until the fixtures come back — which
    is precisely when nobody will be looking at it.

    So force the sighted branch and watch what the counter passes.
    """
    from bonitz_pipeline import alphacheck
    seen = {}
    monkeypatch.setattr(alphacheck, 'geometry_missing',
                        lambda pages, yielded=False: [])
    monkeypatch.setattr(alphacheck, 'scan',
                        lambda pages: seen.setdefault('pages', list(pages)) and [])
    lo, hi = D.state()['range']
    D._live_counters()['alphacheck'](lo, hi)
    got = seen['pages']
    assert got == sorted(set(got)), f'scan got repeats or disorder: {got[:8]}'
    assert got == sorted({p for p, _ in D._cols(lo, hi)})


def test_the_blind_state_names_the_columns_it_could_not_see():
    """The count in the cell is the count of columns, not of findings.

    A bare `blind` would be a shrug. The number says how much of 15-117 the
    sweep could not measure — the columns that never paired, and those whose
    only geometry was the deleted round-5 ALTO.

    ⚠ AND IT SAYS WHICH NUMBER IT IS. The message names the columns whose
    geometry FILE is gone; more columns than that measure nothing, because a
    crop that ate the outdent is refused on the evidence. Reporting only the
    first number reads as a claim about the second, which is the whole failure
    this state exists to prevent — Codex caught the page saying "11 columns have
    no geometry" over a corpus where 19 yield none.
    """
    from bonitz_pipeline import alphacheck
    lo, hi = D.state()['range']
    pages = sorted({p for p, _ in D._cols(lo, hi)})
    missing = alphacheck.geometry_missing(pages)
    silent = alphacheck.geometry_missing(pages, yielded=True)
    hits = D.findings(lo, hi)['alphacheck']
    if not missing:
        assert isinstance(hits, int)
        return
    assert str(hits).startswith(f'{D.BLIND}: {len(missing)} columns lost')
    assert len(silent) >= len(missing)
    if len(silent) > len(missing):
        assert f'{len(silent) - len(missing)} more measure none' in str(hits)


def test_the_recurrence_report_is_not_a_findings_count():
    """ngram_check finds 23,513 recurring phrases over 15-102.

    That describes the corpus; it is not a list of defects. Counted here it
    would put a red five-figure number on the page meaning nothing while
    looking like everything. book_review is a review UI with no findings at
    all. Both stay `not counted`, which is the honest state.
    """
    assert 'ngram_check' not in D._live_counters()
    assert 'book_review' not in D._live_counters()
    f = D.findings(*D.state()['range'])
    assert f['ngram_check'] == D.NOT_COUNTED
    assert f['book_review'] == D.NOT_COUNTED


def test_the_memo_is_keyed_on_the_inputs_and_not_on_a_clock():
    """A time-based cache would put back the staleness --serve removes."""
    lo, hi = D.state()['range']
    D.findings(lo, hi)
    first = set(D._FINDINGS_MEMO)
    assert len(first) == 1
    real = D._corpus_mtime
    try:
        D._corpus_mtime = lambda a, b: real(a, b) + 1000
        D.findings(lo, hi)
        assert set(D._FINDINGS_MEMO) != first, (
            'the corpus moved and the memo answered from before it')
    finally:
        D._corpus_mtime = real


def test_the_rulings_table_reads_every_store_directory():
    """⚠ IT GLOBBED `work/sweeps/*rulings*.json` AND CALLED THAT THE RULINGS.

    Every store built for a cold tranche lives in `work/rulings/` and is named
    for its sitting — `cold-107-117.json`, `space-107-117.json`,
    `encoding-107-117.json` — so not one of them matched, and neither did
    `john.json`, which alone holds more answers than the whole table showed.
    The page reported a number and meant a subdirectory.

    This is the fault the sweep table above already carries a warning about,
    one level up: a report that reads one stage cannot speak for the corpus,
    and a report that reads one ruling directory cannot speak for the rulings.
    [[an-authority-claims-more-than-its-evidence]]
    """
    from bonitz_pipeline import dashboard
    got = dashboard.rulings()
    live = dashboard.ROOT / 'work' / 'rulings'
    if not live.is_dir():
        pytest.skip('no work/rulings in this checkout')
    seen = {k.split('/', 1)[-1] for k in got}
    missing = sorted(p.name for p in live.glob('*.json')
                     if p.name not in seen)
    assert not missing, f'stores the table never counted: {missing}'


def test_a_ruling_store_is_named_by_where_it_lives():
    """Two directories can hold the same file name, and a bare name in the
    table would silently collapse them into one row."""
    from bonitz_pipeline import dashboard
    got = dashboard.rulings()
    assert got, 'no ruling stores found at all'
    assert any('/' in k for k in got), (
        'no row says which directory it came from')


def test_a_wrapped_store_is_counted_by_its_rulings_not_its_keys():
    """⚠ `john.json` REPORTED 2. It wraps its answers — `{"_": [...notes],
    "rulings": [...1081]}` — and the table counted the two top-level keys, so
    the single largest store in the project showed as the smallest. A column
    headed `rulings` has to hold rulings.
    """
    from bonitz_pipeline import dashboard
    got = dashboard.rulings()
    live = dashboard.ROOT / 'work' / 'rulings' / 'john.json'
    if not live.exists():
        pytest.skip('john.json is not in this checkout')
    assert got.get('rulings/john.json', 0) > 1000, got.get('rulings/john.json')


def test_a_flat_store_is_still_counted_flat():
    """The unwrapping must not start guessing at ordinary stores, whose keys
    ARE the rulings."""
    from bonitz_pipeline import dashboard
    assert dashboard._count_rulings({'forms:a|b': {}, 'forms:c|d': {}}) == 2
    assert dashboard._count_rulings({'_': [1], 'rulings': [1, 2, 3]}) == 3
    assert dashboard._count_rulings([1, 2]) == 2
    assert dashboard._count_rulings({'entries': [1, 2, 3, 4]}) == 4
