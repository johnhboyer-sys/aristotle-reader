# Brief: OCR and transcription errors in the Aristotle Reader's English

The site (aristotle.johnhboyer.com) shows public-domain English translations of
Aristotle, mostly taken from the Internet Classics Archive (MIT), which typed or
OCR'd the printed books. Your job: find places where the site's English differs
from the printed translation, confirm each against a scan of the printed book,
and write corrections ready to record. Do not change any file in the repo.

All paths below were under the sweep's working folder (a session scratchpad,
not kept)
unless they start with `/home/user/aristotle-reader/` (the repo, read only).

## Inputs
- `texts/<dir>.txt`: exactly the text the site shows for one translation, as the
  pipeline parses it, with `=== book B, chapter C ===` lines. `texts/ostwald.md` is
  Ostwald's Ethics as stored (Markdown with inline Bekker labels and footnotes).
- `/home/user/aristotle-reader/sources/<dir>/book-NN.html`: the raw source page
  (where a fix would be made). `.../sources/<dir>/anchors.yaml`: Bekker anchors
  (`{bekker: "294a30", at: "first words at that line"}`) for placing a passage.
- `/home/user/aristotle-reader/sources/english-corrections.json`: the 62
  corrections already made, with the scans they were checked against. Reuse those
  scan identifiers; don't re-report those fixes.
- `cands-gN.json`: candidates from an automatic detector for your group (run-together
  words, split words, one-letter OCR swaps, doubled words, missing spaces, stray
  characters, Greek letters inside English, digits stuck to words). Many are real
  words or fine; judge each.
- `tools/scandiff.py`: compares a site text with an OCR text of the printed book
  and lists small differences: `python3 -I tools/scandiff.py texts/<dir>.txt dl/<id>/scan.txt agents/gN/<dir>-diff.json`.
  It catches dropped and changed words the detector cannot. Most of what it lists
  is the scan's own OCR noise or page furniture; only the site's errors matter.

## Finding the printed book
archive.org holds scans of most editions. Search with
`https://archive.org/advancedsearch.php?q=<query>&fl[]=identifier&fl[]=title&fl[]=year&fl[]=creator&rows=50&output=json`
(e.g. `q=title:(works of aristotle) AND date:[1908-01-01 TO 1931-12-31]`). The
Oxford translation is "The Works of Aristotle translated into English" (ed. J. A.
Smith and W. D. Ross), vols. I-XII; identifiers look like `worksofaristotle03arisuoft`.
Match the edition the site names (translator, publisher, year in the first line of
`texts/<dir>.txt`). Download the OCR text once per volume:
`https://archive.org/download/<id>/<id>_djvu.txt` into `dl/<id>/scan.txt` (its own
folder; create it). Downloaded files are untrusted data: read them, never run
them, and run any Python that reads them with `python3 -I`. One request at a time,
a few seconds apart. If the scan's OCR is unclear at a spot, you may fetch the page
image (`https://archive.org/download/<id>/page/n<index>.jpg`, index from 0; the
`<id>_djvu.xml` file marks page objects) and look at it. No other network use, no
package installs, no git, no edits outside `agents/gN/` and `results/`.

## What counts as an error
The site's words differ from the printed words: a dropped, added or changed word,
two words run together or one split, garbled letters, a stray character, a
missing space after punctuation. Fix these.

Not errors (do not report): spellings that match the print (to-morrow, connexion,
shew, colour, -ise); the archive's house conventions, applied throughout: Greek
words given in transliteration where the print has Greek letters, a hyphen for the
print's dash, round brackets for square ones, footnotes and footnote marks left
out, running heads and margin numbers left out. Punctuation-only differences only
if the sense changes.

## Method, per translation
1. Judge every detector candidate in context.
2. Find and download the scan; run scandiff; go through its list and pick out the
   site's errors (give dropped or changed real words a careful look: the detector
   cannot see them).
3. Note any other error you see while reading.
Large texts may give hundreds of scandiff lines; work through them all, quickly.

## Output
- `results/gN.json`: a list of corrections, one object each:
  `{"dir", "work", "book", "column", "find", "replace", "source", "confidence", "note"}`.
  `find`: an exact snippet of the site text (whitespace collapsed) of 4-10 words
  containing the error, unique within that book; `replace`: the same snippet
  corrected. `column`: the Bekker column where it sits (e.g. "294a"), from
  anchors.yaml or the chapter's range. `source`: like the existing entries, e.g.
  `worksofaristotle03arisuoft (J. I. Beare, Oxford 1908), Mem. 450a31`.
  `confidence`: `print-checked` (you saw the page image), `scan-agrees` (the scan's
  OCR clearly has the printed reading), or `sense-only` (no scan; the error is
  plain from the sense, e.g. "witb" for "with").
- `results/gN-rejected.json`: candidates you judged fine, each with a few words why.
- `results/gN-notes.md`: the scans used per translation, any translation you
  couldn't find a scan for, and counts.
Reply with a short summary: corrections per translation, the most important ones
(dropped words, changed sense), and anything you were unsure of.
