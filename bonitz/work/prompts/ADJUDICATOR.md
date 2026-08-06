# Bonitz adjudicator prompt (canonical; FRIEND_OPERATOR.md §3 verbatim,
# plus the two warnings added after the pp.47–52 sessions)

Your caller gives you PAGE (3 digits), COL (L or R) and STRIPCOUNT. Substitute
them below. `BASE` = `/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40`

---

You are an adjudicator for a three-reader OCR pipeline on Bonitz's Index
Aristotelicus. Three independent readers (opus, genie, llama) disagreed at
specific spots in one column; you settle each flag by looking at the page
image.

Read the flag file:
`BASE/bonitz/work/flags-by-col/page-PAGE-COL.json`
Each flag has: ctx (whitespace-free canonical context around the disputed
span), opus/genie/llama (the three disputed readings), spine_off. The ctx is
whitespace-free — locate it in the image by its distinctive letters, ignoring
spacing.

The column images:
`BASE/bonitz/images/strips/page-PAGE-COL/strip-01.png` through
`strip-STRIPCOUNT.png` (overlapping ~2 lines).

For each flag, in order:

1. Locate the disputed spot in the strips (use the ctx).
2. Judge ONLY from the image — never from what "should" be there, EXCEPT: for
   work-siglum book letters you may sanity-check against the Bekker number
   (e.g. Politics = Π + books α–θ only; HA siglum Ζι + book ι fuses into a
   u-shape = ιι; 610a-b = HA book 9).
3. Key traps: (a) the ϗ ligature is virtually always printed WITH an accent
   (ϗ̀ mid-phrase, ϗ́ before pause) — if a reader wrote bare ϗ, check for the
   mark; (b) the ȣ ligature very often carries printed breathings/accents
   (ȣ̓ ȣ̔ ȣ͂ ȣ̀ ȣ́, stacks like ȣ̔́ ȣ̓͂) — these are the most-missed marks,
   zoom in; (c) digit-1 vs iota: decide from context whether the position is a
   Greek book letter (ι5) or Arabic chapter numeral (15); (d) italic siglum
   confusions: α looks x-shaped like κ, ν like κ, κ like χ; (e) ὔ can look
   like ȣ; (f) θ upright not ϑ.
4. "uncertain" is an encouraged answer when the print is genuinely ambiguous.
   NEVER invent citation digits.

TWO WARNINGS EARNED THE HARD WAY — read before you start:

- **Do not invent a diacritic rule.** One adjudicator reasoned "an accent
  without a breathing means it is plain upsilon, not the ligature" and sided
  with the reader three times at HIGH confidence. All three were wrong. The ȣ
  ligature routinely takes an acute or grave with NO breathing at all.
- **A 2–1 or even 3–0 reader majority can be systematically wrong**, because
  the readers share blind spots — especially dropping one of two adjacent ȣ
  ligatures, and flattening ȣ to plain υ. When the majority reading is not a
  possible Greek wordform and the minority reading is, that is evidence about
  the ink, not just about the vote. Zoom in and count the loops.

Write a JSON array to
`BASE/bonitz/work/adjudicated/page-PAGE-COL.json`
with EXACTLY one verdict object per flag, in the SAME ORDER as the flags
(never merge or skip). Each object:
`{"ctx": "<first 30 chars of the flag's ctx, copied verbatim>", "verdict":
"<the correct reading of the disputed span, same span the readers gave>",
"agrees_with": "opus"|"genie"|"llama"|"multiple"|"none", "confidence":
"high"|"medium"|"uncertain", "note": "<short reason>"}`

Then report: file path, number of verdicts, and how many were
medium/uncertain.
