from aristotle_pipeline.offline.quotation_review import (
    curated_records,
    decisions_storage_key,
    export_curation,
    is_absolute_https,
    render_html,
    trimmed_record,
)


def _candidate(**overrides):
    row = {
        "column": "1076a",
        "lo": 3,
        "hi": 4,
        "cite": "Il. 2.204",
        "source_author": "Homer",
        "url": "https://johnhboyer-sys.github.io/homer-reader/iliad/book/2?loc=204",
        "aristotle_text": "οὐκ ἀγαθὸν πολυκοιρανίη",
        "source_text": "οὐκ ἀγαθὸν πολυκοιρανίη",
    }
    row.update(overrides)
    return row


def test_exported_json_shape_from_decisions():
    candidates = [
        _candidate(),
        _candidate(
            column="1000a",
            lo=1,
            hi=2,
            cite="Rep. 509b",
            source_author="Plato",
            url="https://johnhboyer-sys.github.io/plato-reader/Republic/book/6?loc=509b",
        ),
        _candidate(
            column="1001a",
            lo=5,
            hi=6,
            cite="Empedocles 57",
            source_author="Empedocles",
            url="https://www.perseus.tufts.edu/hopper/text?doc=Perseus:abo:tlg,1342,001:57",
        ),
    ]
    decisions = [
        {"index": 0, "action": "accept"},
        {"index": 1, "action": "reject"},
        {
            "index": 2,
            "action": "accept_corrected",
            "url": "https://www.perseus.tufts.edu/hopper/text?doc=corrected",
        },
    ]

    rows = curated_records(candidates, decisions)

    assert rows == [
        {
            "column": "1076a",
            "lo": 3,
            "hi": 4,
            "cite": "Il. 2.204",
            "author": "Homer",
            "url": "https://johnhboyer-sys.github.io/homer-reader/iliad/book/2?loc=204",
        },
        {
            "column": "1001a",
            "lo": 5,
            "hi": 6,
            "cite": "Empedocles 57",
            "author": "Empedocles",
            "url": "https://www.perseus.tufts.edu/hopper/text?doc=corrected",
        },
    ]
    for row in rows:
        assert set(row) == {"column", "lo", "hi", "cite", "author", "url"}


def test_trimmed_record_exports_bounded_span():
    cand = _candidate(lo=3, hi=8, cite="Il. 2.204")
    row = trimmed_record(cand, 4, 4)
    assert row == {
        "column": "1076a",
        "lo": 4,
        "hi": 4,
        "cite": "Il. 2.204",
        "author": "Homer",
        "url": cand["url"],
    }
    clamped = trimmed_record(cand, 1, 99)
    assert (clamped["lo"], clamped["hi"]) == (3, 8)


def test_curated_records_export_trimmed_span():
    candidates = [_candidate(lo=3, hi=8)]
    decisions = [{"index": 0, "action": "accept", "lo": 4, "hi": 4}]
    rows = curated_records(candidates, decisions)
    assert rows == [{
        "column": "1076a",
        "lo": 4,
        "hi": 4,
        "cite": "Il. 2.204",
        "author": "Homer",
        "url": candidates[0]["url"],
    }]


def test_invalid_corrected_url_is_blocked_from_export():
    candidates = [_candidate()]
    bad = [
        {"index": 0, "action": "accept_corrected", "url": "http://example.com/x"},
    ]
    records, blocked = export_curation(candidates, bad)
    assert records == []
    assert blocked == 1
    assert not is_absolute_https("http://example.com/x")
    assert not is_absolute_https("/iliad/book/2")
    assert not is_absolute_https("https://")
    assert is_absolute_https("https://example.com/x")


def test_https_corrected_url_still_exports():
    candidates = [_candidate()]
    url = "https://www.perseus.tufts.edu/hopper/text?doc=corrected"
    decisions = [{"index": 0, "action": "accept_corrected", "url": url}]
    records, blocked = export_curation(candidates, decisions)
    assert blocked == 0
    assert records[0]["url"] == url


def test_review_html_has_span_steppers_storage_and_clear():
    page = render_html("Meta", [_candidate(lo=3, hi=8)])
    assert 'data-span="lo"' in page
    assert 'data-span="hi"' in page
    assert decisions_storage_key("Meta") in page
    assert 'id=clr' in page
    assert "localStorage" in page
    assert "https:" in page
    assert "blocked" in page.lower() or "invalid" in page.lower()
