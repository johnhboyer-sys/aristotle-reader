"""Carding an already-carded file writes a twin instead of overwriting.

`build` names its output `stem + '-carded.jsonl'`. Handed its own output it
appends again, so `flags4-118-127-carded.jsonl` becomes
`flags4-118-127-carded-carded.jsonl` — byte-identical, and invisible until
some later glob of `*-carded.jsonl` counts that tranche twice.

That happened on 2026-08-29 and was found on 2026-08-31, when it had inflated
a measured 8,801 rows to 9,362. It then happened AGAIN the next morning, in a
loop whose glob picked up the files its own previous pass had written. Two
occurrences from one naming rule is what a guard is for.
"""

from __future__ import annotations

import pytest

from bonitz_pipeline import cold_queue


def test_an_already_carded_file_is_refused(tmp_path):
    f = tmp_path / 'flags5-118-127-carded.jsonl'
    f.write_text('{"page": 118, "col": "L", "cls": "letters"}\n',
                 encoding='utf-8')
    with pytest.raises(SystemExit) as e:
        cold_queue.build(f, tmp_path)
    assert 'already a carded file' in str(e.value)
    assert not (tmp_path / 'flags5-118-127-carded-carded.jsonl').exists()


def test_the_refusal_says_what_to_pass_instead(tmp_path):
    f = tmp_path / 'x-carded.jsonl'
    f.write_text('{}\n', encoding='utf-8')
    with pytest.raises(SystemExit) as e:
        cold_queue.build(f, tmp_path)
    assert 'source flags' in str(e.value)
