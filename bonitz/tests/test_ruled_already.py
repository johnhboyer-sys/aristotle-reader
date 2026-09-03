"""A card that re-asks a question John has answered is a defect in the tool.

His ruling belongs to the SITE, and it outranks whatever the readers agree on
later. The case that prompted this module: at `page-116-R:61:2844` he was
shown `raοtetur | tractetur | uactetur` — LlamaParse and Genie BOTH reading
`tractetur` — and he ruled `none`, the ink shows something else. A later
sweep found the same line, asked LlamaParse again, got `tractetur` again, and
built a card proposing it. Two readers agreeing is not new evidence when the
ruling was made against the ink that overrules them.

THREE THINGS THIS MUST GET RIGHT, each one a way of being wrong that already
happened while writing it:

A SITE IS NOT A LINE. Matching `page-116-R:61` against every store flagged 24
of 52 cards, almost all of them different tokens that merely share a line.
The address is `page-NNN-C:line:word_off`, and `test_a_different_word_on_the
_same_line_is_not_the_same_site` pins it.

AN EXCLUSION IS NOT A RULING. `dispute:letters:b>t` was ACCEPTED with
`page-112-L:23:1056` in its `excluded` list. John declined ONE change there;
he did not rule the site correct, and a different change with new evidence is
a fair question. Reported, but as `excluded`, not `ruled`.

`none` IS THE LOUDEST ANSWER, not the absence of one. It means he looked and
rejected what he was shown, so re-proposing a form from that same form-set is
the worst case and gets its own severity.
"""

import json

import pytest

from bonitz_pipeline import ruled_already as ra


def _store(tmp_path, name, doc):
    d = tmp_path / 'rulings'
    d.mkdir(exist_ok=True)
    (d / name).write_text(json.dumps(doc, ensure_ascii=False), encoding='utf-8')
    return d


def _queue(page, col, line, off, becomes, cur='x'):
    return [{'page': page, 'col': col, 'line': line, 'word_off': off,
             'readers': {'opus': cur}, 'becomes': becomes,
             'form_set': [becomes, cur]}]


def test_a_different_word_on_the_same_line_is_not_the_same_site(tmp_path):
    d = _store(tmp_path, 's.json',
               {'forms:a|b': {'verdict': 'accept', 'detail': 'a',
                              'sites': ['page-116-R:61:2844']}})
    assert ra.collisions(_queue(116, 'R', 61, 9999, 'z'), [d]) == []


def test_the_same_site_is_reported(tmp_path):
    d = _store(tmp_path, 's.json',
               {'forms:a|b': {'verdict': 'accept', 'detail': 'a',
                              'sites': ['page-116-R:61:2844']}})
    c, = ra.collisions(_queue(116, 'R', 61, 2844, 'z'), [d])
    assert c.severity == 'ruled' and c.verdict == 'accept'


def test_a_none_verdict_re_proposing_a_rejected_form_is_the_worst_case(tmp_path):
    d = _store(tmp_path, 's.json',
               {'forms:raοtetur|tractetur|uactetur':
                {'verdict': 'none', 'detail': '',
                 'sites': ['page-116-R:61:2844']}})
    c, = ra.collisions(_queue(116, 'R', 61, 2844, 'tractetur'), [d])
    assert c.severity == 'rejected'
    assert 'tractetur' in c.why


def test_a_whole_line_card_cannot_hide_a_rejected_form_inside_itself(tmp_path):
    """The card that prompted the module proposed the rejected word in a span.

    `tractetur, quaestionis ac docti-` is not equal to `tractetur`, so an
    equality test against the form-set reports nothing and the rejected form
    reaches John a second time. The form must be sought as a WORD.
    """
    d = _store(tmp_path, 's.json',
               {'forms:raοtetur|tractetur|uactetur':
                {'verdict': 'none', 'detail': '',
                 'sites': ['page-116-R:61:2844']}})
    c, = ra.collisions(
        _queue(116, 'R', 61, 2844, 'tractetur, quaestionis ac docti-'), [d])
    assert c.severity == 'rejected' and 'tractetur' in c.why


def test_a_word_boundary_keeps_a_longer_word_from_matching(tmp_path):
    d = _store(tmp_path, 's.json',
               {'forms:est|uactetur': {'verdict': 'none', 'detail': '',
                                       'sites': ['page-116-R:61:2844']}})
    c, = ra.collisions(_queue(116, 'R', 61, 2844, 'potestas quaestionis'), [d])
    assert c.severity == 'ruled'


def test_an_acknowledged_re_ask_is_marked_not_silenced(tmp_path):
    """Re-asking is sometimes right, but it must be written down.

    116-R:61 is the case: his `none` was given on a word-level card with no
    whole-line crop, and the line turns out to be TRUNCATED — the corpus is
    missing `nae, sed certos quosdam Ari-` outright. That is evidence he did
    not have. `ack_ruled` records why; without it the re-ask stays an error.
    """
    d = _store(tmp_path, 's.json',
               {'forms:raοtetur|tractetur|uactetur':
                {'verdict': 'none', 'detail': '',
                 'sites': ['page-116-R:61:2844']}})
    q = _queue(116, 'R', 61, 2844, 'tractetur, quaestionis ac doctrinae')
    c, = ra.collisions(q, [d])
    assert c.severity == 'rejected'
    q[0]['ack_ruled'] = 'the line is truncated; the first card had no line crop'
    c, = ra.collisions(q, [d])
    assert c.severity == 'acknowledged' and 'truncated' in c.why


def test_a_none_on_a_site_still_warns_even_for_a_form_he_never_saw(tmp_path):
    d = _store(tmp_path, 's.json',
               {'forms:raοtetur|uactetur': {'verdict': 'none', 'detail': '',
                                            'sites': ['page-116-R:61:2844']}})
    c, = ra.collisions(_queue(116, 'R', 61, 2844, 'quaestionis'), [d])
    assert c.severity == 'ruled'


def test_accepting_a_different_form_from_the_same_set_is_also_a_rejection(tmp_path):
    """`none` is not the only way he says no.

    At `page-111-L:38:1722` the card offered `τοῆς | τοῖς` and he ACCEPTED —
    with detail `τοῆϛ`, the stigma spelling. He was shown `τοῖς` and chose
    something else, so a later sweep proposing `τοῖς` is re-asking a settled
    question exactly as much as if he had ruled none. Rate only `none` as a
    rejection and this site sails through as a mild `ruled`.
    """
    d = _store(tmp_path, 's.json',
               {'forms:τοῆς|τοῖς': {'verdict': 'accept', 'detail': 'τοῆϛ',
                                    'sites': ['page-111-L:38:1722']}})
    c, = ra.collisions(_queue(111, 'L', 38, 1722, 'τοῖς'), [d])
    assert c.severity == 'rejected'
    assert 'τοῆϛ' in c.why


def test_accepting_the_form_we_now_propose_is_not_a_rejection(tmp_path):
    """He accepted this very form — the ruling agrees with us, it does not
    refuse us. Only a DIFFERENT accepted form is a refusal."""
    d = _store(tmp_path, 's.json',
               {'forms:a|b': {'verdict': 'accept', 'detail': 'b',
                              'sites': ['page-111-L:38:1722']}})
    c, = ra.collisions(_queue(111, 'L', 38, 1722, 'b'), [d])
    assert c.severity == 'ruled'


def test_an_exclusion_is_not_a_ruling(tmp_path):
    d = _store(tmp_path, 's.json',
               {'dispute:letters:b>t':
                {'verdict': 'accept', 'detail': 'bundle:b>t',
                 'excluded': ['page-112-L:23:1056'],
                 'sites': ['page-114-L:30:1354', 'page-112-L:23:1056']}})
    c, = ra.collisions(_queue(112, 'L', 23, 1056, 'δ10.'), [d])
    assert c.severity == 'excluded'


def test_no_stores_raises_rather_than_reporting_clean(tmp_path):
    """Absence rendered as clean is the defect this repo has fixed four times."""
    with pytest.raises(ra.RuledAlreadyError):
        ra.collisions(_queue(1, 'L', 1, 0, 'x'), [tmp_path / 'nope'])


def test_no_live_queue_re_asks_a_question_he_has_already_refused():
    """The invariant, not a headcount: no card carries severity `rejected`.

    Two cards DO touch answered sites and both are deliberate — 112-L:23 was
    held out of the `b>t` bundle, which declined one change and did not rule
    the site right, and 115-L:23 settled `De` against `Πe` while leaving the
    `1on-` beside it open. Each says so on its own card. What must never come
    back is a form he was shown and refused.
    """
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    qs = sorted((root / 'work' / 'kraken15-102' / 'apply').glob('queue-*.json'))
    stores = [root / 'work' / 'rulings', root / 'work' / 'sweeps']
    if not qs or not all(s.is_dir() for s in stores):
        pytest.skip('queues or stores absent')
    entries = []
    for q in qs:
        doc = json.loads(q.read_text(encoding='utf-8'))
        entries += doc['entries'] if isinstance(doc, dict) else doc
    got = ra.collisions(entries, stores)
    refused = sorted({f'{c.site} {c.sid}' for c in got
                      if c.severity == 'rejected'})
    assert refused == [], refused
