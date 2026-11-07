"""Problemata: Forster's translation as the print has it, not as either scan read it.

The source is rebuilt from two archive.org OCR scans of the Oxford Works vol.
VII (1927) by pipeline/tools/build_prob_forster.py, which has its own --verify
against both scans. This test pins what that work settled (2026-11-06, Codex
review 7 clean) so a rebuild with a looser rule cannot quietly undo it.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from aristotle_pipeline import stage1_archive

ROOT = Path(__file__).resolve().parents[2]


def _prose() -> dict:
    cfg = yaml.safe_load((ROOT / "manifests" / "Prob.yaml").read_text(encoding="utf-8"))
    return stage1_archive._load_prose(cfg["english"]["primary"])


def _text() -> str:
    return "\n".join(v for _, v in sorted(_prose().items()))


def test_every_part_is_there():
    prose = _prose()
    assert len(prose) == 889
    assert {book for book, _ in prose} == set(range(1, 39))


def test_starts_and_ends_where_forster_does():
    prose = sorted(_prose().items())
    assert prose[0][1].startswith("Why is it that great excesses cause disease?")
    assert prose[-1][1].rstrip().endswith("for that which is earthy always becomes black when burnt.")


def test_no_note_marks():
    text = _text()
    assert not re.findall(r"[®°©*«}]", text)
    # Forster's own square brackets (Books 19, 20) open and close; a stray one is a speck.
    assert text.count("[") == text.count("]")


def test_no_scan_punctuation_specks():
    # Each of these stood in the text once (Opus review 5); none is in the print.
    text = _text()
    for bad in (",?", "?;", "?:", "?.", ",}", ".}", "‘),", "colour. than", "Is. it"):
        assert bad not in text, bad
    # "?)" stands only where the print has it (two places; image-checked in round 5; 25.13's
    # "floats?)" is Forster's pointed bracket, now "floats?⟩", A278).
    assert len(re.findall(r"\?\)", text)) == 2


def test_no_small_caps_misreads():
    text = _text()
    for bad in ("Wuy", "Whuy", "OVer", "OWing", "SO that"):
        assert bad not in text, bad


def test_case_as_printed():
    text = re.sub(r"\s+", " ", _text())
    assert "as Chaeremon says, that Wine mingles" in text      # 3.16, verse capital (A58)
    assert "Diluted wine on the other hand" in text             # 3.14, lower case (A58)
    assert "in the new locality, whereas with other" in text    # 10.7 (A119)
    assert "the sea extends over open spaces" in text           # 23.16 (A260)


def test_stray_full_stop_before_lower_case_is_gone():
    # A full stop then a lower-case word mid-sentence is a scan speck; the
    # print has none in this translation.
    hits = re.findall(r"\b[a-z]+\. [a-z]+\b", _text())
    allowed = {"viz. that"}
    assert [h for h in hits if h not in allowed] == []


def test_genie_pass_fixes():
    # Each reading below was wrong in both archive.org scans and in the build, found by
    # a diff against History Genie's second OCR read and settled on the page image
    # (2026-11-07). Leaf numbers are scan A's (build/prob-ocr/img/A<n>.jpg).
    text = re.sub(r"\s+", " ", _text())
    for bad in (
        "water differing? intrinsically",            # 1.13, A20: call-out 7
        "not easily concocted? For",                 # 1.47, A33
        "due to alike cause",                        # 3.26, A64
        "increased bull,",                           # 3.31, A66
        "from aman.",                                # 4.13, A75
        "was convertible the mind",                  # 5.25, A92: lost comma
        "shudder?—for",                              # 7.5, A102
        "‘sea-lungs’? and clay",                     # 9.6, A115
        "likeness of nature then",                   # 10.36, A129: lost italic "their"
        " er accidens", "Zer se",                    # 11.1, A143
        "set in motion... That",                     # 11.6, A145
        "their continuity... Now",                   # 11.28, A154
        "that if is altered",                        # 19.36, A221: lost italic "mese"
        "Is it because? ‘antiphony’",                # 19.39, A223
        "sing from hypate;",                         # 19.42, A225: lost italic "nete"
        "whereas being the most violent",            # 19.42, A225
        "Gevyoue",                                   # 19.48, A228
        "sweeter it drunk",                          # 21.19, A249
        "no clouds... The East",                     # 26.1, A283
        "world?—drive",                              # 26.27, A292
        "(Lips)? blows",                             # 26.44, A299
        "from the Opposite or",                      # 30.8, A336
        "makes ag sound",                            # 32.9, A353
        "because? his nostrils",                     # 33.10, A358
        "want to sneeze whereas",                    # 33.15, A359: lost ")," 
    ):
        assert bad not in text, bad
    for good in (
        "differing intrinsically", "not easily concocted. For", "due to a like cause",
        "increased bulk,", "from a man. And we", "was convertible, the mind",
        "shudder—for", "‘sea-lungs’ and clay", "likeness of their nature then",
        "as it were, per accidens, though not per se,", "set in motion. That",
        "their continuity. Now", "that if mese is altered", "Is it because ‘antiphony’",
        "to sing nete from hypate;", "whereas nete, being the most violent",
        "in the Geryone", "sweeter if drunk", "no clouds. The East", "world—drive",
        "(Lips) blows?", "from the opposite or", "makes a sound?",
        "Or is it because his nostrils", "want to sneeze), whereas",
    ):
        assert good in text, good


def test_italic_music_terms_are_lower_case():
    # Forster prints hypate, nete, mese, paranete, lichanos in italic lower case (A210-A227).
    text = _text()
    for bad in ("Hypate", "Paranete", "Lichanos"):
        assert bad not in text, bad


def test_pointed_brackets_for_supplied_words():
    # Forster sets words he supplies in pointed brackets, not parentheses (A62, A192, A220,
    # A249, A278, A338); parentheses would pass for his own.
    text = re.sub(r"\s+", " ", _text())
    assert text.count("⟨") == text.count("⟩") == 6
    for good in (
        "⟨Why is it that sweet wine and unmixed wine and mead if drunk from time to time during a drinking bout make men more sober? And⟩",
        "⟨there is no continuous shadow but⟩",
        "Why ⟨is the sound shrillest in the middle of the note? Is it because⟩",
        "much ⟨escapes⟩ compared",
        "⟨Why is it that an inflated skin floats?⟩",
        "⟨Why do those who sleep deeply and most pleasantly see no visions? Is it⟩",
    ):
        assert good in text, good
