import tempfile
import unittest
from pathlib import Path

from bonitz_pipeline.xml_to_json import parse_column_xml


class XmlToJsonSegmentsTest(unittest.TestCase):
    def _parse(self, body: str) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "column.xml"
            path.write_text(
                f'<column page="1" col="left" section="Α"><entry>{body}</entry></column>',
                encoding="utf-8",
            )
            return parse_column_xml(path)["entries"][0]

    def test_preserves_text_before_nested_sense(self) -> None:
        entry = self._parse(
            '<sense n="1">before <sense n="1a"><text>child</text></sense></sense>'
        )
        self.assertEqual(entry["senses"][0]["segments"][0]["content"], "before ")

    def test_preserves_text_after_nested_sense(self) -> None:
        entry = self._parse(
            '<sense n="1"><sense n="1a"><text>child</text></sense> after</sense>'
        )
        self.assertTrue(any(seg.get("content") == " after" for seg in entry["senses"][0]["segments"]))

    def test_preserves_citations_around_nested_sense(self) -> None:
        entry = self._parse(
            '<sense n="1"><cit>100a1</cit><sense n="1a"><text>child</text></sense> after <cit>101a2</cit></sense>'
        )
        segments = entry["senses"][0]["segments"]
        self.assertEqual([seg["content"] for seg in segments if seg["kind"] == "cit"], ["100a1", "101a2"])
        self.assertTrue(any(seg.get("content") == " after " for seg in segments))

    def test_nested_sense_inside_text_wrapper(self) -> None:
        entry = self._parse(
            '<text>lead <sense n="1"><text>child</text></sense> tail <cit>101a2</cit></text>'
        )
        self.assertEqual(entry["senses"][0]["segments"][0]["content"], "child")


if __name__ == "__main__":
    unittest.main()
