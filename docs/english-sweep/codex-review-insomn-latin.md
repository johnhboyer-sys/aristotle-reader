No P1, P2, or P3 findings. Page-image access failed, so print verification remains incomplete.

1. **Latin text — no finding against the independent OCR.** Examined [book-01.html:211](sources/insomn-beare/book-01.html#L211) against the supplied OCR at lines 7953 and 7967. After joining whitespace and removing OCR line numbers and footnote marks, all 1,800 characters match exactly. This includes `lēvitatem`, `lēve`, the later unmarked `levitatem`, `aëris`, `[sic specula]`, curly single quotation marks, and all punctuation.

   The only differences from the OCR are whitespace, line numbers 5/10/15/20, and footnote marks ¹ after `venosi,` and ² after `eadem`. The corrections entry records the footnote omissions. I could not fetch [n380](https://archive.org/download/worksofaristotle03arisuoft/page/n380.jpg) or [n381](https://archive.org/download/worksofaristotle03arisuoft/page/n381.jpg), so these verdicts use the OCR alone.

2. **Passage edges — no finding.** Compared both edges with the OCR and parent commit. The preceding sentence remains complete through “so also it produces a certain effect upon it.” After `attingit.’`, the text resumes with the complete sentence beginning “From this therefore it is plain”. No displaced English remains, and neither edge loses English.

3. **Anchors and column cuts — no finding, with one verification limit.** In [anchors.yaml:39](sources/insomn-beare/anchors.yaml#L39), the OCR confirms the starts of 460a1 and 460a5/10/15/20. Its flattened 459b text does not preserve enough line layout to independently confirm that `menstruae inspexerint` begins printed line 459b30; that needs the image.

   Traced `anchor_cuts` through `_column_starts`, `build_english`, and `build_chunks`. Only `{column}1` entries supply cuts, and this file has just 460a1. Missing or repeated phrases raise an error; `build_english` also checks that the cut took effect. Replaying the cut calculations in memory against the cached Insomn spine shows only 460a changes—from chapter offset 3404 to 3627. Every other column cut stays fixed. The prior-cut constraint could affect later cuts in other data, but it does not here.

4. **Corrections entry and test — no finding.** The new JSON entry parses, has the same keys as its neighbour, and passes the list checks, including the new total of 3,071. Its full `replace` matches the parsed source. The correction check reports two problems on the parent text and none on the new text.

   Executed the new test’s assertions against both parsed versions: **old fails; new passes**. The full-passage correction check also covers the middle text that the dedicated test does not check. Pytest was unavailable, so I ran the test body directly without its decorator.

No files changed. I ran neither uv nor the build.

Codex session ID: 01a1b6d5-c595-7091-8e1c-9e09242737d1
Resume in Codex: codex resume 01a1b6d5-c595-7091-8e1c-9e09242737d1
