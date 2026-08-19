from collections import Counter

import pytest

from aristotle_pipeline.offline.tlg_canon import (
    CONTEMPORARY,
    IGNORED,
    STRICT_BEFORE,
    date_bucket,
    parse_canon,
)


def _field(tag: str, value: str, marker: int | None = None) -> bytes:
    if marker is None:
        marker = 0xFF if tag == "key" else 0x80
    return bytes([marker]) + tag.encode("ascii") + b" " + value.encode("latin-1") + b" "


def test_parse_canon_author_fields_and_ignore_work_fields():
    data = b"".join(
        [
            _field("key", "0001"),
            _field("nam", "EARLY AUTHOR"),
            _field("dat", "6-5 B.C."),
            _field("key", "0001 001"),
            _field("wrk", "WORK"),
            _field("dat", "A.D. 9"),
            _field("key", "0059"),
            _field("nam", "PLATO", 0x85),
            _field("dat", "5-4 B.C.?"),
            _field("key", "0099"),
            _field("nam", "UNKNOWN"),
            _field("dat", "Incertum"),
            _field("key", "0086"),
            _field("nam", "ARISTOTELES"),
            _field("dat", "4 B.C."),
        ]
    )

    assert parse_canon(data) == {
        "0001": {
            "name": "EARLY AUTHOR",
            "dat_raw": "6-5 B.C.",
            "bucket": STRICT_BEFORE,
        },
        "0059": {
            "name": "PLATO",
            "dat_raw": "5-4 B.C.?",
            "bucket": CONTEMPORARY,
        },
        "0099": {
            "name": "UNKNOWN",
            "dat_raw": "Incertum",
            "bucket": IGNORED,
        },
        "0086": {
            "name": "ARISTOTELES",
            "dat_raw": "4 B.C.",
            "bucket": IGNORED,
        },
    }


def test_date_bucketing_grammar():
    for value in ("8 B.C.", "5 B.C.", "8-6 B.C.", "6%19`5 B.C."):
        assert date_bucket(value) == STRICT_BEFORE
    for value in ("4 B.C.", "5-4 B.C.", "4-3 B.C.", "5-3 B.C.", "4 B.C.?"):
        assert date_bucket(value) == CONTEMPORARY
    for value in (
        "5 B.C.?",
        "3 B.C.",
        "9 B.C.",
        "Incertum",
        "Varia",
        "A.D. 2",
        "5-3 B.C.? A.D. 1",
    ):
        expected = CONTEMPORARY if value == "5-3 B.C.? A.D. 1" else IGNORED
        assert date_bucket(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("p. 4 B.C.", IGNORED),
        ("p. 4 B.C.?", IGNORED),
        ("p. 4 B.C.%3a. A.D. 2", IGNORED),
        ("p. 5 B.C.", CONTEMPORARY),
        ("p. 6 B.C.%3a. 5 B.C.", STRICT_BEFORE),
        ("p. 5 B.C.%3a. 4 B.C.", IGNORED),
        ("a. 3 B.C.", IGNORED),
        ("a. 4 B.C.", STRICT_BEFORE),
        ("a. 4 B.C.?", IGNORED),
        ("a. 5 B.C.", STRICT_BEFORE),
    ],
)
def test_date_bucketing_tlg_ante_post_grammar(value, expected):
    assert date_bucket(value) == expected


def test_parse_canon_realistic_markers_produce_nonignored_buckets():
    data = b"".join(
        [
            _field("key", "0001"),
            _field("nam", "EARLY", 0x80),
            _field("dat", "6 B.C.", 0x85),
            _field("key", "0002"),
            _field("nam", "CONTEMPORARY", 0x86),
            _field("dat", "4 B.C.", 0x80),
        ]
    )

    buckets = Counter(record["bucket"] for record in parse_canon(data).values())

    assert buckets[STRICT_BEFORE] == 1
    assert buckets[CONTEMPORARY] == 1


def test_work_titles_and_testimonia_predicate():
    from aristotle_pipeline.offline.tlg_canon import is_testimonia, parse_work_titles

    data = (
        b"\xffkey 1342 \x80nam EMPEDOCLES \x80dat 5 B.C. "
        b"\xffkey 1342 003 \x80wrk &1Testimonia& \x80wct 12,000 "
        b"\xffkey 1342 004 \x80wrk &1Fragmenta& \x80wct 8,000 "
    )
    titles = parse_work_titles(data)
    assert titles[("1342", "003")] == "Testimonia"
    assert titles[("1342", "004")] == "Fragmenta"
    assert is_testimonia(titles[("1342", "003")])
    assert not is_testimonia(titles[("1342", "004")])


def test_hesiod_override_and_work_xmt():
    from aristotle_pipeline.offline.tlg_canon import (
        BUCKET_OVERRIDES, STRICT_BEFORE, parse_canon, parse_work_xmt,
    )

    data = (
        b"\xffkey 0020 \x80nam HESIODUS \x80dat 8%3`7 B.C.? "
        b"\xffkey 0020 001 \x80wrk &1Opera et dies& \x80xmt Cod "
        b"\xffkey 0020 005 \x80wrk &1Testimonia& \x80xmt Q "
    )
    authors = parse_canon(data)
    assert BUCKET_OVERRIDES["0020"] == STRICT_BEFORE
    assert authors["0020"]["bucket"] == STRICT_BEFORE  # the ?-rule is overridden

    xmt = parse_work_xmt(data)
    assert xmt[("0020", "001")] == "Cod"
    assert xmt[("0020", "005")] == "Q"


def test_unreliable_attestation_rule():
    from aristotle_pipeline.offline.tlg_canon import is_unreliable_attestation

    direct = {"Cod", "Pap"}
    assert is_unreliable_attestation("Epistulae", "Q", direct)          # quotation
    assert is_unreliable_attestation("Fragmenta", "Pap", direct)        # Speusippus quirk
    assert is_unreliable_attestation("Testimonia", "Cod", direct)       # doxography
    assert is_unreliable_attestation("Epistulae [Sp.]", "Cod", direct)  # canon spuria
    assert is_unreliable_attestation("De sensu [Dub.]", "Cod", direct)
    assert not is_unreliable_attestation("Historiae", "Cod", direct)
    assert not is_unreliable_attestation("Argonautica", "Pap", direct)

    # The canon's other spellings (Sol review, 2026-08-19): Plato's Spuria is
    # Cod; Callisthenes has "Testimonium et fragmentum"; Menander a
    # "fragmentum dubium" without brackets.
    assert is_unreliable_attestation("Spuria", "Cod", direct)
    assert is_unreliable_attestation("Testimonium et fragmentum", "Pap", direct)
    assert is_unreliable_attestation("Theophorumenae fragmentum dubium", "Pap", direct)
    # A real papyrus work carrying "fragmenta" late in its title is direct
    # physical evidence and must NOT be excluded.
    assert not is_unreliable_attestation("Comoediae: papyri et membranae", "Pap", direct)
