# Converting Scrivener files for import

Two ways to do this: run the script for the mechanical case, or hand a chapter to Claude for the
messy case. Both produce the same target format, described first.

## The canonical format

```
---
work: metaphysics
book: 7
chapter: 17
bekker_start: 1041a6   # optional -- a hint, not authoritative, see below
---
[GREEK]
Τί δὲ χρή λέγειν καὶ ὁποῖόν τι τὴν οὐσίαν, πάλιν
ἄλλην οἷον ἀρχὴν ποιησάμενοι λέγωμεν·
[ENGLISH]
What, then, should we say substance is, and what
kind of thing is it? Let us again begin
```

Rules:
- One line per Bekker line in each block, same count in `[GREEK]` and `[ENGLISH]`, matched by
  position (Greek line 1 ↔ English line 1, and so on) — exactly the verse-mode correspondence you
  already keep in Scrivener.
- No trailing Bekker numbers in the body text — leave those out entirely, or don't worry about
  stripping them yourself (the script does it; see below).
- `bekker_start` is a convenience, not ground truth. The app recovers real Bekker line numbers by
  matching your Greek text against its own bundled TLG corpus, not by trusting any number you
  supply. If you don't know the exact starting reference offhand, leave it out.

## Option A — the script, for clean chapters

Use this when a chapter's Scrivener docs are in reasonably good shape (consistent verse-mode line
breaks, no major stray formatting).

1. In Scrivener, export the Greek document and the English document for one chapter separately as
   **plain text** (`File > Export > Files...`, format: Plain Text / `.txt`).
2. Run:
   ```
   python3 scrivener_to_canonical.py \
       --greek "Meta 7.17 Greek.txt" \
       --english "Meta 7.17 (English).txt" \
       --work metaphysics --book 7 --chapter 17 \
       --bekker-start 1041a6 \
       --out "meta-7.17.md"
   ```
3. If it errors with a line-count mismatch, it's telling you the two files don't have the same
   number of verse-mode lines — open the two `.txt` files, find where they diverge (the error gives
   you the counts, not the exact line, so a quick eyeball comparison is usually enough), fix it, and
   re-run. It won't write a partial/misaligned file.
4. If it warns about an unusually long line, check that line — it usually means two Scrivener lines
   got merged into one during a copy/paste at some point.

The script only strips numbers and reassembles lines; it doesn't touch the actual Greek or English
text. Full details and flags are in the script's own `--help` / docstring.

## Option B — hand it to Claude, for messy chapters

For chapters where the formatting is inconsistent enough that the script's assumptions don't
hold (merged lines, RTF artifacts that didn't clean up in plain-text export, older files from years
ago with a different tab-number convention), paste the raw Scrivener content into a Claude
conversation with a prompt along these lines:

> I'm converting a Scrivener translation chapter into a specific format. Here are the Greek and
> English documents for [work] Book [X], Chapter [Y] — they're meant to correspond line-for-line
> in verse mode, but the formatting may be inconsistent (stray line breaks, merged lines, leftover
> tab-numbers). Please reconstruct them as matched Greek/English line pairs — one Greek line per
> English line, in original order, fixing obvious merge/split errors where the correspondence is
> clearly broken — and output in this exact format:
>
> ```
> ---
> work: [id]
> book: [n]
> chapter: [n]
> ---
> [GREEK]
> ...
> [ENGLISH]
> ...
> ```
>
> Drop any trailing line numbers from both texts — don't try to preserve or interpret them. If you
> can't confidently tell where a Greek line's corresponding English line begins or ends, flag it
> explicitly rather than guessing.
>
> Greek document:
> [paste]
>
> English document:
> [paste]

Review the output against the original before importing — Claude reconstructing line breaks from
messy source is inherently a judgment call in the ambiguous spots, which is exactly why it flags
them rather than silently resolving them. This is the "price of inconsistency" tradeoff already
agreed on: standardizing genuinely inconsistent historical files is manual/assisted work, not
something worth automating perfectly.

## After either option

Bekker numbers are still not trusted at this stage — the app's import step is what text-aligns the
`[GREEK]` block against its bundled corpus and assigns real, correct Bekker references per line.
`bekker_start` in the frontmatter just gives it a head start.
