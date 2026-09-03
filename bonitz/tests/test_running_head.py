"""A running head is furniture, not index text.

⚠ IT SURVIVED THREE RULES BY NINE PIXELS. On 127-R the guide word and the
page number are ONE printed line that kraken segments as two boxes, and every
existing test missed it:

    gutter_beside     the number is 110 wide against a threshold of 100
    residual_beside   neither box pairs with a long line — only each other
    head_short        the guide word is 208 wide against a threshold of 207,
                      with a 2px gap where the rule wants 1.15x the lead

⚠ AND RULE 4 WOULD HAVE KEPT IT REGARDLESS. It spares a short stub at the
head "because it may continue the prior column", which is load-bearing: 21
columns on 118-281 open with a short line and every one is an entry's tail
carrying over. Widening a threshold to catch the running head eats those, so
the discriminator has to be the thing no continuation tail ever has — a bare
page number sharing its baseline.

John found it by ruling a card on the guide word: "running head shouldn't be
in there should it". One column in 328.
"""
from __future__ import annotations

from bonitz_pipeline.filter_kraken_lines import filter_lines

LEAD = 56
WIDTH = 1379


def _line(by, x0, w, content):
    return {'by': by, 'hpos': x0, 'width': w, 'n': len(content),
            'content': content}


def _body(n=8, start=175):
    return [_line(start + i * LEAD, 111, 1252, f'body line {i} with real text')
            for i in range(n)]


def test_the_running_head_is_dropped():
    """The measured geometry of page-127-R: by 61 and 63, widths 208 and 110."""
    lines = [_line(61, 563, 208, 'ἀστακός'),
             _line(63, 1255, 110, '115')] + _body()
    kept, dropped = filter_lines(lines, WIDTH)
    assert [l['content'] for l in dropped if l['drop_reason'] == 'running_head'
            ] == ['ἀστακός', '115']
    assert kept[0]['content'].startswith('body line 0')


def test_a_continuation_tail_is_kept():
    """⚠ THE CASE THE RULE MUST NOT EAT. 21 columns on 118-281 open with an
    entry's tail carried over from the previous column — `f 37. 1481a1.`
    before `αὔρα.` starts on 135-R. It has no page number beside it."""
    lines = [_line(61, 111, 300, 'f 37. 1481a1.')] + _body()
    kept, dropped = filter_lines(lines, WIDTH)
    assert not [l for l in dropped if l['drop_reason'] == 'running_head']
    assert kept[0]['content'] == 'f 37. 1481a1.'


def test_a_tail_beside_a_gutter_number_is_still_a_tail():
    """A marginal line-number beside a head stub is not a page number: rule 1
    takes it as `gutter_beside`, and the tail stays."""
    lines = [_line(61, 111, 300, 'ϗ̀ βραχύτης μκ1. 464b20.'),
             _line(63, 5, 66, '5')] + _body()
    kept, dropped = filter_lines(lines, WIDTH)
    assert not [l for l in dropped if l['drop_reason'] == 'running_head']
    assert kept[0]['content'].startswith('ϗ̀ βραχύτης')


def test_two_short_lines_without_a_number_are_kept():
    lines = [_line(61, 563, 208, 'ἀστακός'),
             _line(63, 1255, 110, 'cf')] + _body()
    _, dropped = filter_lines(lines, WIDTH)
    assert not [l for l in dropped if l['drop_reason'] == 'running_head']
