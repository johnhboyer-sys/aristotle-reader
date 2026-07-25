"""Verdicts must bind to the flag they actually answer.

Regression from page 050-R: flags 4 and 5 sit inside overlapping ctx windows
(the ȣ of ἀμύνȣσιν and the ιι of Ζιι37 are five characters apart). The
adjudicator quoted a window shifted five characters left of the flag's, so
the greedy ctx-prefix search bound flag 5 to verdict 4, and the positional
leftover fallback then bound flag 4 to verdict 5 — the two verdicts swapped,
which would have spliced ιι into the ligature slot and ȣ into the siglum.
"""

from bonitz_pipeline.reconcile import match_verdicts


FLAGS = [
    {'ctx': 'τον,ἀναπλέȣσινεἰςτȣςποταμȣςΖιθ13.598a22,27.19.601b2', 'opus': 'ȣ'},
    {'ctx': 'θ13.598a22,27.19.601b21.πῶςθηρίοντιἀμύνȣσινΖιι37.62', 'opus': 'ῶ'},
    {'ctx': '19.601b21.πῶςθηρίοντιἀμύνȣσινΖιι37.621a17.easdemfer', 'opus': 'ȣ'},
    {'ctx': '1b21.πῶςθηρίοντιἀμύνȣσινΖιι37.621a17.easdemferenοtas', 'opus': 'ιι'},
]

VERDICTS = [
    {'ctx': 'τον,ἀναπλέȣσινεἰςτȣςποταμȣς', 'verdict': 'ȣ̀'},
    {'ctx': 'θ13.598a22,27.19.601b21.πῶςθη', 'verdict': 'ῶ'},
    {'ctx': '1b21.πῶςθηρίοντιἀμύνȣσινΖιι', 'verdict': 'ȣ'},
    {'ctx': '1b21.πῶςθηρίοντιἀμύνȣσινΖιι37', 'verdict': 'ιι'},
]


def test_overlapping_windows_do_not_swap_verdicts():
    matched = match_verdicts(FLAGS, VERDICTS)
    assert [v['verdict'] for _, v in matched] == ['ȣ̀', 'ῶ', 'ȣ', 'ιι']


def test_genuine_reordering_still_recovered():
    shuffled = [VERDICTS[1], VERDICTS[0], VERDICTS[3], VERDICTS[2]]
    matched = match_verdicts(FLAGS, shuffled)
    # flags 2/3 share a window, so only the unambiguous pair is asserted here
    assert [v['verdict'] for _, v in matched][:2] == ['ȣ̀', 'ῶ']


def test_missing_verdict_leaves_none():
    matched = match_verdicts(FLAGS, VERDICTS[:2])
    assert [v['verdict'] if v else None for _, v in matched] == ['ȣ̀', 'ῶ', None, None]
