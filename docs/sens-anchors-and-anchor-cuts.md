# Sens anchor drift and anchor-driven column cuts (2026-11-03)

Two questions: why Sens's ticks drift a column or more around 446a–448a, and
what `anchor_cuts`-style column breaks would do for EE, Phgn, Mirab, Pol and
Sens. The Sens chapter fix is its own commit; the cuts are an experiment on
branch `claude/nice-mclaren-754ffd`, awaiting John's decision.

Baseline: main's `build/dist`, built from `95972d93a0`. Measurement scripts
(tick diff, column survey, chapter audit) were scratch and are not committed.

## 1. Sens: why it drifted

The anchors are not the fault. The Greek chapter boundary is.

- `chapters.json` put Sens ch. 7 at **448a28**, mid-sentence ("ἔστιν, | ἔστι δέ
  τις ἐν τῷ συνεχεῖ"). The Greek and Beare both begin ch. 7 at **447a12**
  ("Ἔστι δ' ἀπορία καὶ ἄλλη" / "Another question respecting sense-perception").
  The First1KGreek TEI has the div in the right place.
- Cause: `extract_chapters_grc` could not match the TEI opening ("Ἔστι δέ τις
  ἀπορία καὶ ἄλλη τοιάδε") against the spine ("Ἔστι δ' ἀπορία καὶ ἄλλη τις
  τοιάδε"). `_step_back_match` then tried 3-word windows and caught "ἔστι δέ
  τις" at 448a28. With `start=0` its exactness test is `ow[:0] == []`, so the
  wrong hit was labelled `wordAnchor: True`.
- Effect on the gloss map (batch run 2026-10-25): Greek ch. 6 ran 445b3–448a27,
  about a column and a third past Beare's Part 6, which ends at 447a11. The
  aligner placed 445b3–447a10 correctly and piled 447a15–448a25 (15 ticks) on
  Part 6's last sentence, "for Light is an efficient cause of seeing." Part 7's
  ticks from 448a30 on are right. `gloss_map_to_anchors.py` copied the pile out.
- The "446a10 phrase in the 446b chunk" symptom is the proportional cut,
  squeezed by the overlong Greek chapter. The phrases sit where they should.
- Corpus check: of 1,642 chapter starts, Sens ch. 7 is the only one a column or
  more off. 27 others don't follow sentence punctuation, but they are line-level
  pins or one-word offsets.

### The fix (its own commit)

1. `manifests/Sens.yaml`: `skip: [7]` and `extra: [{ n: 7, bekker: "447a12" }]`,
   the Mechanica precedent. This also moves the live ch. 7 heading.
2. `sources/sens-beare/anchors.yaml`: drop the 15 piled entries and re-key the
   448a28 chapter entry to 447a12 (its phrase is Part 7's opening).

Sens alone, against main: ch. 6 445b3–447a11 and ch. 7 447a12–449b4; real ticks
157 → 176, estimated 31 → 16, unresolved anchors 31 → 1 (442b30, which resolves
once the cuts are on).

Still open: 447a15–448a25 have no anchors. They need a re-run of the gloss
aligner on Sens ch. 6–7 (paid API; the budget is on hold) or Beare's printed
margins. John's call.

## 2. Anchor-driven column cuts on EE, Phgn, Mirab, Pol, Sens

### Who could use them today

- `_column_starts` needs each `{column}1` phrase to occur exactly once. Of 38
  primary anchors files, 37 passed as they stood; **Pol failed** on three short
  phrases (1257a1 "have no limit", 1278b1, 1334a1).
- But only **Lin (10/10), Cat (30/30) and Pol (173/180)** have column-start
  coverage worth cutting on. The rest have a line-1 entry only where a chapter
  starts, because `gloss_map_to_anchors.py` drops the gloss map's `column` tier.
  Its stated reason, that a column-start phrase straddles the proportional cut,
  goes away once the anchors make the cut.
- Adding the gloss maps' column ticks as 80-char phrases: unique in 34 of 35
  gloss-mapped works (Meta has 2 not unique: 991a1, 1080a1). But 10 works (APr,
  Col, EE, GA, Int, Meta, Mirab, PA, Phys, Sens) have column ticks sharing an
  offset with another tick, the sign of a pile; two of those (EE 1241a1, Mirab
  833a1) made the build raise "did not become column breaks". **25 works are
  clean on both counts**, plus Lin and Cat. Uniqueness doesn't prove a work
  builds; see Pol 1276a1 below.

### The experiment

EE/Phgn/Mirab/Sens: gloss-map column ticks added as `{column}1` entries (EE +66,
Phgn +19, Mirab +24, Sens +25). Pol: its three ambiguous phrases lengthened.
`anchor_cuts: true` on all five. Three breaks had to go before the build would
pass, each a real fault the check exposed:

- EE 1241a1, Mirab 833a1: gloss ticks piled on the next English chapter's
  offset 0.
- Pol 1276a1 (hand-keyed): its phrase is Greek 1276a9–10, inside III.3, so the
  column start is wrongly keyed.
- Sens could not cut at all without the chapter fix (447a1's piece was squeezed
  to one sentence), so the Sens row includes it.

### Results (five works, main → experiment)

| work | real ticks | estimated | segs out of order | pairs <30 chars | tick changes | columns re-cut | unresolved |
|---|---|---|---|---|---|---|---|
| EE | 604 → 607 | 10 → 6 | 0 → 0 | 10 → 9 | 410 | 72/76 | 10 → 7 |
| Phgn | 141 → 151 | 9 → 0 | 0 → 0 | 9 → 0 | 103 | 19/20 | 9 → 0 |
| Mirab | 341 → 350 | 3 → 1 | 0 → 0 | 5 → 4 | 195 | 29/36 | 2 → 0 |
| Pol | 1546 → 1554 | 61 → 55 | 5 → 2 | 1 → 1 | 1268 | 181/189 | 8 → 0 |
| Sens | 157 → 177 | 31 → 15 | 0 → 0 | 0 → 0 | 127 | 27/28 | 31 → 0 |

After the rebase onto #182 the five works were rebuilt one by one: every
number is unchanged except Sens, which gains 447a12 from the chapter fix.

"Tick changes" is large because nearly every column's English start moves
(median 107–244 chars), which shifts every offset in it; the real/estimated
columns are the better measure.

- **Phgn 812a–814a: fixed.** Every tick real and evenly spaced (main: 812b had
  5@9, 10@24, 15@34).
- **Mirab 844b: fixed** (844b5 real at 297).
- **Pol:** line-1 ticks that sat mid-column on main (1276a 1@539, 1277a 1@1922,
  1298b 1@2363) go to 0. The two segments still out of order (1287a: 10 before
  5; 1300b: 30 before 25) are wrong anchors inside the column, not cuts.
- **EE 1239b: not fixed, and cuts can't fix it.** Greek VII.5 opens with a
  summary sentence (1239b3–6) and VII.6 with another (1240a5); Solomon ends each
  previous chapter with it. The aligner matched 1239b5 to the second summary
  (offset 2,679 of 2,859) and everything after piled behind it. Needs a
  re-alignment of VII.5 or a ruling.
- **Sens:** see §1; the chapter fix does nearly all of it.

### Full build and gates

`npm run build:public` (Node 22.23.1) on the experiment, before the rebase onto
#182: exit 0, 41 works stage 2 PASS, preflight ok, shared LSJ 63,261 keys
verified, 6,586 pages, **link gate 0 broken**. Each work's book files matched its
single-work build.

Against main's `build/dist`: 2,102 tick changes, all in the five works.
Corpus-wide, **segments out of order 19 → 16, tick pairs under 30 chars
90 → 79** (segments with 3+ such pairs 4 → 2). Changes outside the five works
are derived data: lemmata (299), search shards (222) and ngrams (123). In the
lemmata, Sens passages move from ch. 6 to ch. 7 with the corrected boundary.

One defect the build exposed: a new English search word, "ntly". The gloss
map's Sens 441b1 tick sits mid-word ("evide|ntly"), and the cut followed it.
Across all gloss maps only two column ticks start mid-word, both Sens (441b1,
442a1). A real implementation must snap column phrases to a word start.

## Recommendation

1. Merge the Sens chapter fix; decide separately how to fill 447a15–448a25.
2. Adopt anchor cuts work by work, not corpus-wide: Phgn and Mirab first (clean
   wins), then Pol (re-key 1276a1; the three short phrases are already
   lengthened here), then Sens after the word-start snap. Leave EE until VII.5
   is re-aligned.
3. To make that durable, `gloss_map_to_anchors.py` should emit the column tier,
   snapped to a word start, and refuse ticks that share an offset, so piles
   never reach `anchors.yaml`.
4. Follow-ups worth their own PRs: `_step_back_match` should not call a 3-word
   `start=0` hit word-exact; a stage-2 check should fail the build when a
   chapter start lands a column or more from its TEI position.
