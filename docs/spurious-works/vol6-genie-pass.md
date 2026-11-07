# Oxford vol. VI: second-read correction pass (2026-11-07)

The English of the nine vol. VI works (Col, Aud, Phgn, Plant, Mirab, Mech, Lin,
Vent, MXG) rested on one archive.org OCR read each. History Genie's whole-book
read of the volume is a second, independent witness. It lives in the main
checkout's `sources/genie-oxford/` (untracked, never committed).

Method: `pipeline/tools/vol6_genie.py diff` word-diffs our English against
Genie's read. Every difference was judged on the page image of archive.org
`worksofaristotle0001unse_r3i1` (hOCR page N is image `page/n{N-1}.jpg`), blind:
four Opus readers saw the two readings in random order. The image is the only
authority.

| Work | Our errors fixed | Genie's errors allowed | Genie's footnotes / a figure |
|---|---|---|---|
| Col | 0 | 1 | 0 |
| Aud | 2 | 1 | 0 |
| Phgn | 0 | 2 | 0 |
| Plant | 3 | 9 | 1 |
| Mirab | 11 | 4 | 1 |
| Mech | 41 | 14 | 2 |
| Lin | 32 | 26 | 17 |
| Vent | 1 | 1 | 1 |
| MXG | 10 | 5 | 2 |

The third column counts allowances. Most are Genie's misreads; a few are
typography our text does not carry (small capitals, a line-end hyphen). One is
unsettled: MXG leaf 266, "abovementioned", where "above-" ends the printed
line, so the print cannot say whether the word has its own hyphen.

What the fixes are:

- **Mech**: stops read as commas (15), figure labels misread (Δ and Λ as A, I as
  Γ, BΓΔE for BΓEΔ, KAM for KΛM), stray marks (A, as, —, ", ', -).
- **Lin**: Joachim marks his supplied words with angle brackets; our text had
  round ones. Genie caught 28 places. Checking every other parenthesis in Lin
  on the image found four more both reads missed: ⟨by the preceding argument⟩,
  ⟨which they are trying to establish⟩, ⟨with its predecessor or successor⟩,
  ⟨too⟩.
- **MXG**: "Notbeing" for "Not-being" (5), a false paragraph break before
  "limits?", lost "?" and ". . .".
- **Mirab**: Dowdall printed marvels 2, 10 and 12 in Latin. The first build
  (`cf32f2dc2f`, "Codex-cleaned") put a modern English version there under his
  name. The Latin is back, read off leaves 129 and 131.

## Rulings that are not fixes

- **Plant**: "Here ends the book on Plants." is printed; `build_plant_forster.py`
  keeps it out by design (`END`). Allowed as such.
- **Plant**: chapter openings in small capitals ("A PLANT") are given in plain
  case, as the build does everywhere.

## Limits

- Codex review 1 found holes in `verify`, all closed and planted in
  `selftest` (18 plants): label case folded like small capitals, an opening
  loss trimmed with Genie's front matter, a word lost beside a long allowed
  footnote, hyphens folded by our own vocabulary, all bare numerals dropped,
  and `check` passing when a deletion-type read was undone. Headless Genie
  segments dropped as notes are now pinned in `NOTE_SEGMENTS`. Codex check 2
  (`vol6-codex-review-2.md`) confirmed all fixed and found four more, also
  closed: two-letter labels that spell words (BE), a missing pinned opening,
  hyphens split across a line, pins bound only by their opening words.
- Open from check 2: a body numeral shaped like a margin figure (a multiple of
  five up to 40, a number from 791 to 980, any number opening a line, or in Lin
  and Plant any number up to 40) is dropped from Genie's read, so our losing
  one cannot be seen. Our English has no bare numerals at all, so this would
  need the print to carry one. Also a nit: `key()` reads module state set by
  the last `diff()`.
- The diff sees only where the two reads differ. An error both share stays
  hidden. That is how Lin's four brackets were missed until every parenthesis
  was checked. Mech's figure labels are the likeliest place for more: only the
  ZA/ZΛ cases near a judged difference were checked.
- `norm()` and `key()` ignore spacing inside curly quotes, Latin vs Greek
  capitals of the same glyph (A/Α), the case of an all-capital word that our
  text uses in lower case, and a line-end hyphen inside a word whose halves are
  not both words. A difference of only those kinds cannot be seen.
- A footnote line is recognised by its mark; a body line that our text lost
  and that opens with a raised margin number would be read as a note.
- Lin's apparatus accent `[ᾖ PZᵃ]` (print may read ῇ) was not checked closely.

## Commands (from `pipeline/`)

```
uv run python tools/vol6_genie.py verify     # exit 1 on any unruled difference or unused allowance
uv run python tools/vol6_genie.py selftest   # 18 planted defects and an undone read must all be caught
uv run python tools/vol6_genie.py check      # every print read in place (no Genie file needed)
uv run python tools/vol6_genie.py apply      # write PRINT_READS into sources/ (carries anchors, paragraphs)
```

`--genie PATH` points at Genie's read when it is not in the main checkout.
The tests are in `pipeline/tests/test_vol6_print_reads.py`.
