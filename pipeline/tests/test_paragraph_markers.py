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
