# How we place Bekker numbers on the translations

Every passage of Aristotle has a standard address — the **Bekker number**
(like *1098a16*) — taken from the 1831 Greek edition. Scholars cite by it, and
it lets you line a translation up against the Greek. The trouble: most English
translations in the public domain were printed **without** these numbers. This
page explains how we add them back, and why you can rely on them.

## The method, in plain terms

The Bekker numbers belong to the **Greek**, where their exact positions are
known. Our job is to find the matching spot in the English. We do it the way a
translator working line by line would:

1. **We translate the Greek itself, line by line.** For every Bekker mark, we
   make a fresh, literal English rendering of that line of Greek (with the lines
   just before and after it for context, since a line often begins in the middle
   of a sentence).
2. **We find where that line lands in the published translation.** We match our
   plain rendering against the translation's own wording and mark the Bekker
   number at that point.
3. **We double-check the uncertain spots.** Where the first match isn't clean,
   a second, independent pass re-reads the Greek and the English and pins the
   line precisely.

Crucially, the translation's text is **never altered** — we only attach the
reference marks. And where we still aren't confident, we **show the number as an
estimate** (lightened/italic) rather than claiming a precision we don't have.

## Why you can trust it

We tested the method on a translation whose true positions we *do* know
(a separately numbered edition), so we could grade every placement:

- **About 6 in 7 marks landed exactly on the correct sentence**, with no help
  from any pre-numbered version of that translation.
- The **double-check pass cleaned up almost all of the remaining cases** — in our
  test it took the unsure marks from a third correct to **eight of nine exact**,
  and the one holdout turned out to be correctly placed (the *reference* we
  graded against was the imprecise one there).
- Typical error on the marks we show as solid is well under a sentence; the marks
  we're unsure of are flagged, not hidden.

In short: the numbers anchored to the start of each Bekker column and line are
matched to the Greek directly, checked, and honestly labelled. You can cite from
them with confidence, and treat the lightened estimates as approximate.

*Note:* between two confirmed marks, individual lines are spaced out by the length
of the Greek they cover — a reasonable estimate, shown as such. The solid marks
are the ones we've verified.

## Lettered lines (5a, 5b …)

Bekker numbers a handful of lines with a letter — Physics 244b runs 1–5, then
5a, 5b, 5c, 5d, then 6–15 — where an edition inserts text after an already
numbered line. They are ordinary lines of text, not headings or apparatus.

We hold them with the number of the line they follow plus a `sub` field
(`{"n": 5, "sub": "a"}`), so a citation to *244b5* still resolves and document
order still sorts. Anything keyed on the line number alone will collide with
the plain line of the same number; key on `(n, sub)`.

This was found the hard way in July 2026, via a Bonitz citation. `stage1_greek`
had been filing lettered lines as headings and dropping them from the text
flow. Because Ross splits a word across that seam — `ἀλλοιού-` ending line 5,
`μενον` opening 5a — the hyphen rejoin then took its continuation from the next
*surviving* line, fusing line 5 to line 6's first word and stealing it from
line 6. Physics 244b lost about 57 words and gained the non-word
`ἀλλοιούεἰρημένων`, with nothing raising an error.

Two lessons worth keeping. Our TLG source was clean throughout — verified
against Ross on every neighbouring column, including the two-run structure in
243a that looked like a merge bug. And no cheap heuristic finds this class of
damage after the fact: counting accents drowns in enclitics, long-hapax
filtering drowns in rare inflections, and the `k` field is a transliteration of
the surface form rather than a morphological analysis. The way to size it is to
re-export and diff.
