import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from aristotle_pipeline.stage1_english import add_bekker_gutter, parse_english
from aristotle_pipeline.stage7_emit import chapter_ranges, emit_books


class DummyManifest:
    work_id = "TST"
    first_column = "1094a"
    data = {"work": {"english_translation": "Fixture"}}


def _write_tei(path: Path, inner: str) -> None:
    path.write_text(
        f"""<TEI>
  <text>
    <body>
      <div subtype="book" n="1">
        <milestone resp="Bekker" unit="page" n="1094a"/>
        <div subtype="section" n="1">
          <milestone resp="Bekker" unit="line" n="1"/>
          {inner}
        </div>
      </div>
    </body>
  </text>
</TEI>""",
        encoding="utf-8",
    )


def _spine():
    return {
        "work": "TST",
        "segments": [
            {
                "id": "1:1094a",
                "book": 1,
                "column": "1094a",
                "lines": [
                    {"n": 1, "text": "alpha"},
                    {"n": 2, "text": "beta"},
                    {"n": 3, "text": "gamma"},
                    {"n": 4, "text": "delta"},
                    {"n": 5, "text": "epsilon"},
                ],
            }
        ],
    }


def _tokens_doc():
    return {
        "segments": [
            {
                "id": "1:1094a",
                "lines": [
                    {"n": n, "tokens": []}
                    for n in range(1, 6)
                ],
            }
        ],
    }


def _parse_with_gutter(path: Path):
    english = parse_english(path, DummyManifest())
    add_bekker_gutter(english, _spine())
    english.pop("_line_ms", None)
    return english


def _bekker_bytes(english: dict) -> bytes:
    by_id = {c["id"]: c["bekker"] for c in english["chunks"]}
    return json.dumps(by_id, sort_keys=True, separators=(",", ":")).encode("utf-8")


def test_paragraph_boundary_is_sidecar_marker_and_does_not_move_bekker_offsets(tmp_path):
    with_para = tmp_path / "with_para.xml"
    baseline = tmp_path / "baseline.xml"
    _write_tei(with_para, "<p>First paragraph.</p><p>Second paragraph.</p>")
    _write_tei(baseline, "<p>First paragraph. Second paragraph.</p>")

    english = _parse_with_gutter(with_para)
    no_marker = _parse_with_gutter(baseline)

    chunk = english["chunks"][0]
    para_markers = [m for m in chunk["markers"] if m["kind"] == "paragraph"]
    assert chunk["text"] == "First paragraph. Second paragraph."
    assert para_markers == [
        {"kind": "paragraph", "n": "", "offset": len("First paragraph.")}
    ]
    assert _bekker_bytes(english) == _bekker_bytes(no_marker)

    out_dir = tmp_path / "dist"
    out_dir.mkdir()
    emitted_stats = emit_books(
        _spine(),
        _tokens_doc(),
        english,
        chapter_ranges(_spine(), english["chapters"]),
        out_dir,
    )
    emitted = json.loads((out_dir / "book-01.json").read_text(encoding="utf-8"))
    emitted_chunk = emitted["segments"][0]["english"]
    assert emitted_stats == [
        {"book": 1, "segments": 1, "first_column": "1094a", "last_column": "1094a"}
    ]
    assert emitted_chunk["text"] == chunk["text"]
    assert [m for m in emitted_chunk["markers"] if m["kind"] == "paragraph"] == para_markers
    assert json.dumps(
        emitted_chunk["bekker"], sort_keys=True, separators=(",", ":")
    ).encode("utf-8") == json.dumps(
        chunk["bekker"], sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def test_column_opening_paragraph_flag_and_continuation(tmp_path):
    path = tmp_path / "columns.xml"
    _write_tei(path, '<p>First.</p><milestone resp="Bekker" unit="page" n="1094b"/>'
               '<p>New paragraph <milestone resp="Bekker" unit="page" n="1095a"/>'
               'continues here.</p>')
    english = parse_english(path, DummyManifest())
    chunks = {c['column']: c for c in english['chunks']}
    assert chunks['1094b']['paraStart'] is True
    assert 'paraStart' not in chunks['1095a']
    assert not any(m['kind'] == 'paragraph' and m['offset'] == 0
                   for c in chunks.values() for m in c['markers'])


def test_overlay_paragraph_flag_survives_first_piece_strip_and_emission(tmp_path):
    from aristotle_pipeline.stage1_ross import build_chunks
    spine = _spine()
    second = dict(spine['segments'][0], id='1:1094b', column='1094b')
    spine['segments'].append(second)
    chapters = [{'book': 1, 'chapter': '1', 'column': '1094a', 'line': 1}]
    text = 'First sentence.\nNew paragraph continues.'
    anchors = {'1:1': {'anchors': [
        {'citation': '1094b1', 'offset': text.index('New'), 'confidence': 'reliable'},
    ]}}
    chunks = build_chunks(spine, chapters, {(1, 1): text}, anchors)
    piece = chunks['1:1094b'][0]
    assert piece['para'] is True
    assert not piece['text'].startswith('\n')
    assert piece['bekker'][0]['offset'] == 0
    assert 'para' not in chunks['1:1094a'][0]
    continued = build_chunks(spine, chapters, {(1, 1): text.replace('\n', ' ')}, anchors)
    assert 'para' not in continued['1:1094b'][0]
    english = {'chunks': [dict(id=s['id'], text='Text', notes=[], markers=[], paraStart=True)
                          for s in spine['segments']], 'chapters': chapters}
    tokens = {'segments': [dict(id=s['id'], lines=[{'n': n, 'tokens': []} for n in range(1, 6)])
                           for s in spine['segments']]}
    emit_books(spine, tokens, english, chapter_ranges(spine, chapters), tmp_path, chunks,
               third=chunks, overlays={'extra': chunks})
    segments = json.loads((tmp_path / 'book-01.json').read_text())['segments']
    assert segments[1]['english']['paraStart'] is True
    for field in ('ross', 'third'):
        assert segments[1][field][0]['para'] is True
    assert segments[1]['overlays']['extra'][0]['para'] is True


def test_trailing_paragraph_marker_marks_next_column():
    from aristotle_pipeline.stage1_common import carry_trailing_paragraphs
    chunks = [
        {"book": 1, "text": "End of one. ", "markers": [{"kind": "paragraph", "n": "", "offset": 11}]},
        {"book": 1, "text": "New paragraph here.", "markers": []},
        {"book": 1, "text": "Mid. More.", "markers": [{"kind": "paragraph", "n": "", "offset": 4}]},
        {"book": 1, "text": "continues", "markers": []},
        {"book": 2, "text": "Last. ", "markers": [{"kind": "paragraph", "n": "", "offset": 5}]},
    ]
    nxt = {"book": 3, "text": "x", "markers": []}
    kept = carry_trailing_paragraphs(chunks + [nxt], lambda c: c["text"].strip())
    assert kept == chunks + [nxt]
    assert chunks[1].get("paraStart") is True
    assert "paraStart" not in chunks[3]
    assert "paraStart" not in nxt  # a new book always breaks; never carried across books


def test_paragraph_start_on_a_dropped_empty_column_passes_on():
    # <p>First.</p><milestone 1094b/><p><milestone 1095a/>New paragraph.</p>:
    # 1094b opens the paragraph but holds no text, and is dropped.
    from aristotle_pipeline.stage1_common import carry_trailing_paragraphs
    chunks = [
        {"book": 1, "column": "1094a", "text": "First. ", "markers": [], "notes": []},
        {"book": 1, "column": "1094b", "text": "", "markers": [], "notes": [], "paraStart": True},
        {"book": 1, "column": "1095a", "text": "New paragraph.", "markers": [], "notes": []},
    ]
    kept = carry_trailing_paragraphs(chunks, lambda c: c["text"].strip() or c["notes"])
    assert [c["column"] for c in kept] == ["1094a", "1095a"]
    assert kept[1].get("paraStart") is True
