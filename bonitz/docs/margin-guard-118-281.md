# The gutter number is inside the line box on 67 columns of 118–281

2026-08-28. Measured before the panel was built, and the panel should not be
built until this is settled.

## What was measured

`margin_guard.line_widths` opens every dumped line image, and for this tranche
those images exist only in `/kaggle/working` — 19,978 of them, behind a 7 GB
download. The width it wants is the width of the box the SEGMENTER drew, and
kraken writes that into the ALTO as `TextLine WIDTH` before ketos cuts anything.
So the geometry was read off `work/kraken15-102/alto118-281` instead.

Refiltering the ALTO reproduced the spine in `txt118-281` exactly — 328 columns,
19,978 lines, no column differing — so the widths are keyed to the same lines
the panel would vote on.

Running `margin_guard.suspect_columns` on those widths:

    328 columns measured
     67 whose every-fifth lines run wide by 25px or more (the WIDE_BY threshold)
        65 of them L columns, 2 R
        the excess is consistently +44 to +55px — the same size as the +48px
        that marked the five bad columns on 107–117
    delta across all columns: −94px (page-127-L) to +100px (page-199-L),
        median +1px

## What the ink says

Geometry says the gutter was in frame; only the ink says whether it was read.
Two text-side probes on the kraken spine, comparing every-fifth lines against
their own column's neighbours:

**A short trailing token** (` X` or ` XX` at the line end, the `τῆς πρώτης as`
shape):

    suspect columns   numbered 15.4%  vs  other  9.1%
    clean columns     numbered  9.3%  vs  other  9.2%

The excess appears on exactly the numbered lines of exactly the flagged columns
and nowhere else.

**A line-final digit run of five or more** (the `70415` shape, where the number
is appended with no space) hits 5 numbered lines in suspect columns, 0 other
lines in suspect columns, and 1 line in the whole clean set:

    page-123-L line 40   …Ζιε14. 545 + 40
    page-162-L line 10   …322b6. β7. 334 + 10
    page-185-L line 25   …ημα11. 1187b24. 22. 1191 + 2
    page-203-L line 55   …τῆς θηλείας Ζιδ2. 527 + 56
    page-208-L line 25   …τῶν λόγων Πα6. 1255 + 2

⚠ **The appended digits are the printed line number.** Line 40 ends in `40`,
line 10 in `10`, line 55 in a misread `56`. That is not a coincidence a citation
can produce.

The four hits in clean columns are a different defect — `475a16.` read as
`475416.`, the superscript column letter as a `4` — and are not this.

## What it does not say

Neither probe counts the corruptions. The trailing-token test cannot see a
number appended without a space, and the digit-run test cannot see one read as
letters (`35` as `as`, `55` as `ς`). 15.4% against a 9.1% baseline over roughly
800 numbered lines is a floor of about fifty, and the true number is higher.
107–117 held 17 in 60 numbered lines.

## Then the panel answered it better — 2026-08-29

The panel for 118–281 is built, and it does not need the geometry to find these.
The corruption has a signature no other defect has: **genie and LlamaParse both
read NOTHING there**, because the number is marginal furniture and a whole-page
reader skips it, while the column readers put a short numeric run in the text.

Regions where both Latin readers are empty and the spine is a numeric run of
three characters or fewer: **82, of which 76 fall on an every-fifth line.** Not
an estimate — a list. `gutter-candidates.tsv` in this directory holds all 76
with the spine's reading, calamari's, the class, and the context.

    53  spine-outvoted   kraken alone carries the number
    23  2-2-split        kraken AND calamari both carry it

⚠ **AND THE GEOMETRY WAS FLAGGING THE WRONG COLUMNS.** The width test named 65 L
columns and 2 R. The ink puts 39 of the 76 on L columns and **37 on R** — and 34
of the 76 sit in columns the geometry called clean, every one of them an R
column. Both measurements are sound about what they measure: on an R column the
gutter sits where the crop does not widen for it, so the box never runs wide and
the number is read anyway. Sending anyone to check the 67 wide columns would
have missed half the damage and wasted most of the effort.

So the earlier estimate here — "a floor of about fifty over roughly 800 numbered
lines" — is superseded. It is 76 named lines.

## ⚠ AND 76 IS NOT THE POPULATION EITHER — 2026-08-29

John found `132-L:15` in the kai sitting: the ink reads `καπνὸς θερμὸν ϗ̀` and
the margin prints `15`, which kraken read as `ις` and fused onto the ligature,
giving `ϗ̀ις`. The margin queue never saw it.

The signature above requires the leaked run to (a) stand alone, (b) contain a
digit, and (c) have both Latin readers silent. The leak takes at least three
other shapes, and this note asserted a complete list while excluding all of them:

  * READ AS LETTERS, standing alone — 93 further candidates on numbered lines,
    where kraken has `η`, `s`, `ο`, `ι`, `ς`, `p` and both Latin readers nothing.
    `margin_guard`'s own docstring says a digit detector cannot find these
    (`35` as `as`, `55` as `ς`, `15` as `ιd`). It was quoted here and then a
    digit detector was written anyway.
  * FUSED ONTO THE EDGE WORD — 35 sites where kraken's edge token carries 1-3
    characters calamari's does not: `τροφῆςo`, `sχηλάς`, `oτὸ`.
  * FUSED WHERE THE READERS TOKENISE DIFFERENTLY — 132-L:15 itself, which none
    of the three signatures catches, because calamari split `ϗ̀ ι` in two.

⚠ NOTHING IS LOST BY THIS: the panel raises every one of them as an ordinary
card, which is how John found it. What was wrong was the claim, not the corpus.
The lesson is the one this project keeps relearning — a detector that answers
"76" without saying what it could not see is the authority claiming more than
its evidence.

`settle_review` now offers a `the margin number trimmed` option on any card
whose site sits on a numbered line and whose spine form is longer than another
reader's, so the correct reading is a BUTTON rather than a set-aside. Trimming
is by grapheme: `ϗ̀ις` cut three codepoints would be bare `ϗ`, the accent thrown
out with the margin.

## Why it still blocks adjudication

Not because the panel is blind to it: every one of the 76 is flagged. Because of
how they are flagged. The 23 two-two splits are kraken and calamari agreeing on
a printed line number against two readers who correctly have nothing — and the
standing habit is to trust the Greek pair on Greek. A card that shows
`Ζμδ5. 6821` from both Greek engines, with the Latin pair silent, reads as the
Latin pair failing. It is the opposite.

## The options, for John

1. **Rule on the 76 lines from the list.** They are enumerated, they are
   already cards, and the answer for each is the same shape: the trailing
   numeric run is the margin, delete it. No re-read, no GPU, no cold-tranche
   spend — the evidence is four readers already disagreeing on disk.
2. **Re-cut and re-read the affected columns** with the gutter out of frame.
   The principled fix, and the one that stops this recurring past 281. Costs a
   GPU run and invalidates the calamari read for those columns.
3. **Both**: (1) now so the tranche can be adjudicated, (2) before the next
   tranche is cut.

Option 1 was not available when this note was first written; the panel had not
run. It is now the cheap one.

The three probes and the full geometry report are in
`docs/margin-guard-118-281/` — they were written as scratch and are kept
because this may cost a GPU run to answer, and prose is a poor way to hand on a
measurement. Each hardcodes the worktree path; run them from the repo root:

    uv run --with pillow python3 docs/margin-guard-118-281/alto_margin_check.py
    python3 docs/margin-guard-118-281/ink_probe.py  docs/margin-guard-118-281/margin118-281.txt
    python3 docs/margin-guard-118-281/ink_probe2.py
