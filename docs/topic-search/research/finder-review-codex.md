1. **blocker — [pipeline/tools/topic_finder.py:144](/Users/johnboyer/Developer/aristotle-reader/pipeline/tools/topic_finder.py:144): Paragraph ends truncate the Greek passage.** `anchor_at(last)` finds the preceding anchor, but line 151 treats that anchor’s line as the passage’s final Greek line. Sparse anchors therefore drop translated lines. Real example: `EN.3.1` contains the opening paragraph about voluntary action, praise, blame, and punishment, but attaches only `1109b30`. Its English continues through `1109b35`; omitted line 33 contains **ἀναγκαῖον**, a core necessity word. `EN.3.2` also receives only line 30, so neither unit captures that hit. The fixture already exposes this: it contains Greek line `1027a30`, between English anchors 29 and 31, yet [test_topic_finder.py:52](/Users/johnboyer/Developer/aristotle-reader/pipeline/tests/test_topic_finder.py:52) asserts that the first paragraph ends at 29. That test preserves the defect.

2. **should-fix — [pipeline/tools/topic_finder.py:305](/Users/johnboyer/Developer/aristotle-reader/pipeline/tools/topic_finder.py:305): Lemma resolution silently merges distinct words and numbered homographs.** Resolution folds away accents and digits; the collision check then removes those same distinctions. In the real corpus, `εἰμί` resolves to both `ei)mi/` (“exist”) and `ei)=mi` (“come or go”). The current map’s `τίς εἰμί` phrase therefore accepts “go” as its second word. `τίς` also matches indefinite `tis`. Numbered examples include `ne/w1`, `ne/w2`, and `ne/w3`: a map entry `νέω` accepts them all without reporting ambiguity. A synthetic token sequence `[{"ti/s"}, {"ei)=mi"}]` counts as the map’s essential-property phrase.

3. **should-fix — [pipeline/tools/topic_finder.py:146](/Users/johnboyer/Developer/aristotle-reader/pipeline/tools/topic_finder.py:146): Reversed ranges become plausible one-line ranges, and the command succeeds.** The tool replaces the end with the start, then merely prints an anomaly count. Three built units take this path:
   - `Top.5.25`: source endpoints `133a35 → 133a20`; output `133a35–133a35`.
   - `GA.1.47`: `722b35 → 722b15`; output `722b35–722b35`.
   - `Int.1.75`: `21b5 → 21b1`; output `21b5–21b5`.

   This conceals bad source alignment from scoring and recall. Checking the emitted units for reversed ranges will always pass for these cases because the tool has erased the evidence.

4. **should-fix — [pipeline/tools/topic_finder.py:713](/Users/johnboyer/Developer/aristotle-reader/pipeline/tools/topic_finder.py:713): Recall can succeed without evaluating any ranking.** With a nonempty units file, one overlapping core locus, and candidates `{"rankers": {}}`, both ranker loops examine nothing. The command writes an empty recall table and returns 0. It never checks that rankers exist or contain ranked units. The tests cover empty keys, but not this empty evaluation.

5. **should-fix — [pipeline/tools/topic_finder.py:646](/Users/johnboyer/Developer/aristotle-reader/pipeline/tools/topic_finder.py:646): `parse-sorabji` reports success when it parses no loci.** A file containing only `### Locus table` produces `loci: []`, `unparsed: []`, and exit status 0. A table whose rows all fail parsing also succeeds. The printed counts help a human, but an automated check still gets a green result after extracting nothing.

6. **should-fix — [pipeline/tools/topic_finder.py:285](/Users/johnboyer/Developer/aristotle-reader/pipeline/tools/topic_finder.py:285): Blank English entries become an empty matching expression.** For `english: [" "]`, `entries` passes the initial check, but filtering leaves no alternatives. The resulting regex matches empty positions between nonword characters. English text `"..."` consequently earns four hits despite containing no search term. These false hits affect bilingual scores and problem counts.

The three unit spot-checks:

| Unit and source | Verdict |
|---|---|
| `Meta.6.1`, [Meta/book-06.json](/Users/johnboyer/Developer/aristotle-reader/build/dist/Meta/book-06.json) | **Fail for passage coverage.** Stored range `1025b3–15` follows the preceding-anchor rule, and its Greek and lemma sets exactly match those stored lines. But the English includes the argument through lines 16–18, which it omits. |
| `EN.3.1`, [EN/book-03.json](/Users/johnboyer/Developer/aristotle-reader/build/dist/EN/book-03.json) | **Fail.** Stored range `1109b30–30` attaches 10 tokens. The English reaches line 35; omitted line 33 carries the necessity word noted above. Greek and lemma sets are correct only for the truncated range. |
| `Meta.1.2`, [Meta/book-01.json](/Users/johnboyer/Developer/aristotle-reader/build/dist/Meta/book-01.json) | **Pass for joining and attached range; imprecise start.** The paragraph crosses `980a → 980b`, with the inserted space in the right place. Its range is `980a25–980b25`; Greek and lemma sets exactly match it. However, “By nature animals…” begins at Greek line `980a28`, so the preceding anchor adds lines 25–27 from the prior paragraph. |

The three key spot-checks:

| Key row | Verdict against the Locus table |
|---|---|
| [Row 1](/Users/johnboyer/Developer/aristotle-reader/docs/topic-search/necessity/keys/sorabji.json:5) | **Pass.** Meta VI 3, `1027a29–1027b16`, matches [table row 1](/Users/johnboyer/Developer/aristotle-reader/docs/topic-search/research/sorabji-method.md:146). The abbreviated `b16` expands correctly; parenthetical subranges are intentionally omitted. |
| [Row 10](/Users/johnboyer/Developer/aristotle-reader/docs/topic-search/necessity/keys/sorabji.json:140) | **Pass.** PA I 1 preserves both `639b21–640a9` and `642a1–642b4`, matching [table row 10](/Users/johnboyer/Developer/aristotle-reader/docs/topic-search/research/sorabji-method.md:155). |
| [Row 54](/Users/johnboyer/Developer/aristotle-reader/docs/topic-search/necessity/keys/sorabji.json:836) | **Pass.** Phys VIII preserves all four separate ranges, matching [table row 54](/Users/johnboyer/Developer/aristotle-reader/docs/topic-search/research/sorabji-method.md:199). It does not widen them into one continuous passage. |

Other areas examined:

- **Bekker arithmetic:** Numeric page/line ordering, `a < b`, full cross-page ends, abbreviated ends, and inclusive overlap checks look correct.
- **Offsets:** The code sets `base` after inserting a space and applies it to both anchors and markers. I found 2,532 such joins and no out-of-bounds English anchor offsets in the built books.
- **Work/book matching:** `bekker.json` has 46 columns shared across works; recall checks the work. I found no overlapping line ranges across books within one work, so ignoring book adds no demonstrated false match in this build.
- **Phrases and English:** The phrase loop allows exactly three intervening tokens per pair and counts overlapping starts. It operates within each unit. English alternatives use word boundaries and do not double-count nested terms; blank entries cause finding 6.
- **Recall and tests:** Resolved-only denominators are explicit. No top-500 unit overlaps four or more key rows. I found no literal self-comparison test; the endpoint assertion instead codifies the faulty range rule.

No files edited; no `uv` or tests run. Review used static reads and read-only stdlib JSON inspection.

FINDINGS: 6 (blockers 1)

Codex session ID: 01a1accd-4a78-7381-86b5-0f55c500cf75
Resume in Codex: codex resume 01a1accd-4a78-7381-86b5-0f55c500cf75
