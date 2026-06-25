"""
Transcribe a Bonitz Index Aristotelicus column image using Claude (vision).

Usage:
    python -m bonitz_pipeline.transcribe PAGE-015-L.tif --out pilot/p15_left_opus48.xml
    python -m bonitz_pipeline.transcribe PAGE-015-L.tif --model claude-sonnet-4-6 --out out.xml

Requires ANTHROPIC_API_KEY in environment.
"""

from __future__ import annotations
import argparse
import base64
import sys
from pathlib import Path

import anthropic


PROMPT = """\
You are transcribing a scanned column from Bonitz's *Index Aristotelicus* (Berlin 1870).

Produce an XML transcription following this schema:

```xml
<column page="N" col="left|right" section="LETTER">
  <section_head>Α</section_head>

  <!-- Simple entry (single sense): -->
  <entry>
    <lemma>ἀάζειν</lemma>
    <text>θερμόν μβ8.<cit>367b2</cit>. opp φυσᾶν πλδ7.<cit>964a11</cit>.</text>
  </entry>

  <!-- Entry with multiple senses (use <sense> children): -->
  <entry>
    <lemma>ἀγαθός</lemma>
    <sense n="1"><text>primary sense… <cit>1094a1</cit>.</text></sense>
    <sense n="2">
      <text>second sense…</text>
      <sense n="2a"><text>sub-sense a… <cit>1097a15</cit>.</text></sense>
      <sense n="2b"><text>sub-sense b…</text></sense>
    </sense>
  </entry>

  <!-- Entry cut off at column boundary: -->
  <entry continues="next">
    <lemma>ἀγαθός</lemma>
    <text>…text that continues in next column…</text>
  </entry>
</column>
```

If the column BEGINS mid-entry (continuation from the previous column):
```xml
<column page="N" col="right" section="LETTER">
  <entry type="continuation">
    <text>…continuation text, no lemma…</text>
  </entry>
  <!-- remaining entries follow normally -->
</column>
```

Rules:
1. Each `<cit>` tag wraps a Bekker citation verbatim as it appears in the scan (e.g., `1456b27`, `964α11`, `1022b32`). Do NOT resolve or standardize them.
2. Use `<unclear>TEXT</unclear>` for any passage you cannot confidently read.
3. Preserve the Greek text exactly, including polytonic diacritics (acute, grave, circumflex, smooth/rough breathings, iota subscript, diaeresis). Use Unicode NFC form.
4. Latin abbreviations (e.g., `opp`, `cf`, `ie`, `sim`, `dist`, `act`, `pass`) appear as-is.
5. The first entry in a column that begins with no lemma (opening line is a section header gloss, not a continuation) uses `<entry type="header_gloss">` with a `<text>` child.
6. For the section header line (the big Greek capital letter at top of a new section), use `<section_head>Α</section_head>`.
7. Do NOT include running heads (page number / section letter printed at top margin).
8. Entries are separated by a hard left margin. Continuation lines are indented.
9. Entry text may contain cross-references (`Xref_abbrev N. CITATION`) — transcribe as plain text; only the Bekker number+column+line gets a `<cit>` tag.
10. **Sense divisions:** Use `<sense n="1">`, `<sense n="2">` etc. when an entry has clearly distinct senses or usage clusters, signalled by:
    - Em-dashes (—) introducing a new sub-topic or contrast
    - Arabic numerals (1. 2. 3.) Bonitz has printed in the entry
    - `act` / `pass` marking distinct active/passive sense clusters
    - Nested sub-senses use `n="1a"`, `n="1b"` etc.
    Simple entries with no internal divisions use `<text>` directly (no `<sense>` wrapper).
    Place `<sense>` elements as DIRECT children of `<entry>` — do NOT wrap them inside a
    `<text>` element. `<sense>` is a sibling of `<lemma>`. This holds for continuation
    entries too: `<entry type="continuation"><sense n="1">…</sense>…</entry>`.
11. **Cross-column continuation:** If the last entry of the column is cut off (continues into the next column), add `continues="next"` to that `<entry>` tag. If the column opens mid-entry, use `<entry type="continuation">` with no `<lemma>`.
12. **Latin prose:** Bonitz writes descriptive Latin phrases inline (e.g. "signa terminorum in prima syllogismorum figura", "de vi atque usu huius vocis", "quaeritur an", "pro eo quod"). Wrap any Latin phrase longer than a single scholarly abbreviation in `<lat gloss="English translation">Latin text</lat>`. Short fixed abbreviations (`opp`, `cf`, `ie`, `sim`, `dist`, `act`, `pass`, `al`, `veluti`, `hoc loco`, `cum codd`, `e cod`, `scripsit`) do NOT need `<lat>` tags — they are handled automatically. Everything else that is Latin prose gets a `<lat>` tag with your best English rendering as the `gloss` attribute.
13. **19th-century printing ligatures:** Bonitz uses two special characters not in standard Greek Unicode. Recognise them in any diacritical form and expand to standard polytonic Greek:
    - **ϗ** (the kai symbol, looks like a stylized κ) — always the word καί ("and"). Apply the oxytone grave rule: write **καὶ** (grave) before a following word, **καί** (acute) before punctuation or a pause.
    - **ȣ** (the ou digraph, looks like a joined ο+υ) — represents the vowel cluster -ου-. Expand to ου. Never render ȣ as υ or ῦ.
    - **CRITICAL — fully accent the expanded word.** Bonitz frequently prints the ȣ ligature *bare* (no visible accent) even when the ου-syllable itself carries the accent. Do NOT reproduce a bare, unaccented ου: supply the correct polytonic accent and breathing the word requires in context. Examples: bare τȣ → **τοῦ** (genitive article, circumflex); ȣκ → **οὐκ**, ȣ → **οὐ**, ȣχ → **οὐχ** (negative, smooth breathing); ȣτω → **οὕτω** (rough breathing); νȣς → **νοῦς**; τȣτο → **τοῦτο** but τȣτων → **τούτων** (accent shifts by case); αὐτȣ → **αὐτοῦ**; contract-verb endings → **-οῦσι / -οῦνται / -οῦν** (circumflex); contract participles where ου is the antepenult → **-ούμεν-** (acute, e.g. καλούμενον); genitives of oxytone stems → **-οῦ** (e.g. ἀγαθοῦ, ξηροῦ). When a mark IS printed on the ligature (overline = circumflex οῦ, acute = ού, breathing, etc.), honour it. The result must always be a correctly accented Greek word — never bare ου.

Output ONLY the XML, starting with `<column`. No prose before or after.
"""


def transcribe_image(image_path: Path, model: str = "claude-opus-4-8") -> str:
    client = anthropic.Anthropic()

    # Claude API only accepts jpeg/png/gif/webp — convert TIFF on the fly
    suffix = image_path.suffix.lower()
    if suffix in (".tif", ".tiff"):
        from PIL import Image
        import io
        buf = io.BytesIO()
        Image.open(image_path).convert("RGB").save(buf, format="PNG")
        raw = buf.getvalue()
        media_type = "image/png"
    else:
        raw = image_path.read_bytes()
        media_type_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
        media_type = media_type_map.get(suffix, "image/png")

    image_data = base64.standard_b64encode(raw).decode("utf-8")

    message = client.messages.create(
        model=model,
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": PROMPT,
                    },
                ],
            }
        ],
    )
    return message.content[0].text


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Transcribe Bonitz column image with Claude")
    p.add_argument("image", type=Path, help="Input column image (TIFF/PNG)")
    p.add_argument("--model", default="claude-opus-4-8", help="Claude model ID")
    p.add_argument("--out", type=Path, required=True, help="Output XML file path")
    args = p.parse_args(argv)

    if not args.image.exists():
        print(f"Error: {args.image} not found", file=sys.stderr)
        sys.exit(1)

    print(f"Transcribing {args.image} with {args.model}…", file=sys.stderr)
    xml = transcribe_image(args.image, model=args.model)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(xml, encoding="utf-8")
    print(f"Saved → {args.out}", file=sys.stderr)
    print(xml)


if __name__ == "__main__":
    main()
