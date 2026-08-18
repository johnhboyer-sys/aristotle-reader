"""A column can carry the same Bekker line number twice with no letter suffix.

Where the OCT sets a secluded or transposed block inside a line, stage1 emits
the line's two halves as separate lines under the same number (DA 430b.20,
APr 68a.16, Phys 205b.1, Phys 226b.23/26/27). Pairing a line with its tokens by
(n, sub) collapses those two into one dict entry, so both halves render the
LAST half's tokens — the reader then printed one line's words on the other's
text. The pairing has to be positional.
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.stage7_emit import emit_books

# DA 430b.20 as the corpus has it: the line's first half, a two-line secluded
# supplement lettered a/b, then the rest of line 20 — three entries numbered 20,
# two of them with no suffix at all.
_LINES = [
    {"n": 19, "text": "καὶ τὸ μῆκος."},
    {"n": 20, "text": "καὶ χρόνῳ καὶ μήκει."},
    {"n": 20, "sub": "a", "text": "<τὸ δὲ μὴ κατὰ τὸ ποσὸν"},
    {"n": 20, "sub": "b", "text": "νοεῖ ἐν ἀδιαιρέτῳ χρόνῳ.>"},
    {"n": 20, "text": "ἡ δὲ στιγμὴ καὶ πᾶσα διαίρεσις, καὶ"},
]


def _toks(text):
    """Tokens as stage3 makes them: every whitespace-run, offset in the line."""
    out, i = [], 0
    for raw in text.split(" "):
        word = raw.strip(".,·<>[]")
        if word:
            out.append({"t": word, "o": text.index(word, i), "k": word})
        i += len(raw) + 1
    return out


def _spine():
    return {
        "work": "TST",
        "segments": [
            {"id": "3:430b", "book": 3, "column": "430b", "lines": _LINES}
        ],
    }


def _tokens_doc():
    return {
        "segments": [
            {
                "id": "3:430b",
                "lines": [
                    {"n": l["n"], **({"sub": l["sub"]} if l.get("sub") else {}),
                     "tokens": _toks(l["text"])}
                    for l in _LINES
                ],
            }
        ],
    }


def _emit(tmp_path, spine, tokens_doc):
    out_dir = tmp_path / "dist"
    out_dir.mkdir()
    emit_books(spine, tokens_doc, {"chunks": [], "chapters": []}, {}, out_dir)
    return json.loads((out_dir / "book-03.json").read_text(encoding="utf-8"))


def test_each_line_keeps_its_own_tokens_when_a_number_repeats(tmp_path):
    emitted = _emit(tmp_path, _spine(), _tokens_doc())
    greek = emitted["segments"][0]["greek"]
    assert len(greek) == len(_LINES)
    for line, source in zip(greek, _LINES):
        assert line["text"] == source["text"]
        # Every token locates in its own line, in order — the property the
        # reader relies on. Under the old (n, sub) keying the first line
        # numbered 20 carried the last one's tokens and located none of them.
        ptr = 0
        for tok in line["tokens"]:
            found = line["text"].find(tok["t"], ptr)
            assert found >= 0, f"{tok['t']!r} not in {line['text']!r} (line {line['n']})"
            ptr = found + len(tok["t"])


def test_the_two_unlettered_halves_do_not_share_one_token_list(tmp_path):
    greek = _emit(tmp_path, _spine(), _tokens_doc())["segments"][0]["greek"]
    plain_20 = [l for l in greek if l["n"] == 20 and "sub" not in l]
    assert len(plain_20) == 2
    assert [t["t"] for t in plain_20[0]["tokens"]] == ["καὶ", "χρόνῳ", "καὶ", "μήκει"]
    assert [t["t"] for t in plain_20[1]["tokens"]][:3] == ["ἡ", "δὲ", "στιγμὴ"]


def test_a_tokens_doc_out_of_step_with_the_spine_raises(tmp_path):
    # Positional pairing is only sound while the two documents agree line for
    # line. If a stage ever reorders or drops one, say so instead of emitting
    # a book with silently mismatched tokens.
    tokens_doc = _tokens_doc()
    del tokens_doc["segments"][0]["lines"][2]
    with pytest.raises(ValueError, match="430b"):
        _emit(tmp_path, _spine(), tokens_doc)


def test_a_tokens_doc_with_reordered_lines_raises(tmp_path):
    tokens_doc = _tokens_doc()
    lines = tokens_doc["segments"][0]["lines"]
    lines[1], lines[2] = lines[2], lines[1]
    with pytest.raises(ValueError, match="430b"):
        _emit(tmp_path, _spine(), tokens_doc)


def test_the_guard_cannot_see_two_identically_keyed_lines_swapped(tmp_path):
    """The limit of the guard, pinned so nobody reads more into it.

    Both halves of DA 430b.20 are (20, None), so swapping them leaves the
    (n, sub) sequence intact and the check passes. Nothing downstream of
    stage3 reorders a segment's lines, which is what makes the positional
    pairing sound; the guard catches drift in length or numbering, not a
    transposition of two lines that carry the same number.
    """
    tokens_doc = _tokens_doc()
    lines = tokens_doc["segments"][0]["lines"]
    lines[1], lines[4] = lines[4], lines[1]
    greek = _emit(tmp_path, _spine(), tokens_doc)["segments"][0]["greek"]
    assert [t["t"] for t in greek[1]["tokens"]][:2] == ["ἡ", "δὲ"]
