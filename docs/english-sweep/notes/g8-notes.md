# Group 8 notes: Politics (Jowett, Ellis), Oeconomica, Rhetoric, Poetics (Fyfe, Butcher)

378 corrections in `results/g8.json`. 22 detector candidates were judged fine, and 16 other look-alike differences are recorded as non-errors, in `results/g8-rejected.json`. The other 35 of the 57 detector candidates are among the corrections.

| dir | corrections | print-checked | scan-agrees | sense-only |
|---|---|---|---|---|
| pol-jowett | 147 | 5 | 142 | 0 |
| pol-ellis | 40 | 0 | 40 | 0 |
| oec-forster | 37 | 12 | 25 | 0 |
| rhet-roberts | 108 | 19 | 89 | 0 |
| poet-fyfe | 24 | 0 | 5 | 19 |
| poet-butcher | 22 | 4 | 18 | 0 |

## Scans used

- **pol-jowett**: `worksofaristotle10arisuoft`, Oxford *Works* vol. X (1921): Jowett's *Politica* as revised by W. D. Ross. I also downloaded the 1885 vol. 1 (`politicsofaristo01arisuoft`) but it is **not** the text the site carries (see below).
- **pol-ellis**: `treatisegovernme00arisiala`, Everyman's Library, Dent (1912 edition; 1913 printing). This copy is heavily underlined, so the OCR is garbled in places (Bk V especially), and an error in those stretches could have been missed. I stripped the running heads ("A Treatise on Government BOOK ...") from a copy before diffing.
- **oec-forster**: `worksofaristotle10arisuoft` (same volume X, 1921).
- **rhet-roberts**: `worksofaristotle11arisuoft`, Oxford *Works* vol. XI (1924).
- **poet-fyfe**: `aristotlepoetics00aris_0`, the Loeb **1927 first printing**. All the 1932-revision copies on archive.org are lending-only: `aristotlepoetics0000aris` (1965) returns 403, and `bwb_KU-348-495` and `aristotlepoetics0000fyfe` are restricted. Fyfe revised many wordings in 1932, so I reported only mechanical errors and readings that cannot be revisions. About 40 wording differences from 1927 were set aside as revisions.
- **poet-butcher**: `aristotlestheory00butcuoft`, 4th edition (1907, "reprinted with corrections 1911"; this copy is a 1920s reprint). I also checked `aristotlestheory0000butc` (3rd ed., 1902) and `aristotlestheor01arisgoog` (1895).

Page images I looked at are listed in each entry's `source` (`page image nNNN`).

## Edition findings (worth fixing in the manifests and labels)

1. **The site's "Jowett (Oxford, 1885)" is really the Ross revision of 1921, in American spelling.** It probably came to MIT through McKeon's *Basic Works* (Random House, 1941). Against the 1921 text there are 1,188 small differences, mostly OCR noise and US spellings. Against 1885 there are 2,762. The lettered appointment scheme in IV.15, '(A 1 a) ... (B 2 c)', exists only in the 1921 revision. I treated the US spellings (honor, labor, practice, connection, judgment, ...) as house convention.
2. **The site's "Butcher (Macmillan, 1895)" follows the 3rd/4th edition** (1902/1907), not 1895. For example, the site has 'of its various kinds' and 'medium' where 1895 has 'of its several species' and 'means'. This text also has US spelling (meter, color).
3. **Truncated source pages** (cut at about 101.5 KB):
   - `sources/pol-jowett/book-02.html` (101,496 bytes) ends 'tombs, whic'. The rest of II.12 is lost (1274a35–b28, about 280 words).
   - `sources/pol-jowett/book-05.html` (101,497 bytes) ends 'let it b'. The rest of V.11 and all of V.12 are lost (1315a14–1316b27, about 1,400 words).
   - `sources/pol-jowett/book-07.html` (101,496 bytes) is cut inside the page footer. The text is complete, but the site shows a stray `<A HREF="/Buy/Aris` at the end of VII.17.

   Both lost passages are recorded as **append** corrections, transcribed from the 1921 print and checked against the page images. They use the print's British spelling, dashes as hyphens, and leave out footnote marks. Because these are appends, each `find` stays a prefix of its `replace`, so a "find must be absent" check cannot pass for those two entries. V.12 also needs its own 'Part XII' chapter, so re-fetching the full MIT pages is the cleaner fix. `Pol-public.yaml` says "Jowett omits the close of Book 5" and allows 5:1316a/5:1316b to stay unmatched. Both rest on this truncation: Jowett translates V.12 in both 1885 and 1921.

   I checked the end of every other book in this group against its print (Jowett I, III, IV, VI, VIII; Ellis I–VIII; Oec I–II; Rhet I–III; both Poetics). All end where the print ends; no other source page is cut.
4. **Fyfe's missing spaces** ('magnitude.Being', 'are,it', 'poet(maker)to', 20 places) come from `tools/extract_fyfe_poetics.py`. It drops Perseus `<milestone>`/`<note>` tags without leaving a space; the Perseus TEI itself has 'magnitude.<milestone .../>Being'. These are corrected one by one, but a one-line fix in the extractor would catch any others. 'in this respect, differs' (dropped 'man') is already wrong in the Perseus TEI.
5. **Stray separator lines** (70 hyphens from the archive page) appear inside the site text: Butcher after chapters 11 and 20, and Roberts at the end of Books I and II. All four are corrected.

## Patterns in the errors

- Jowett: 'an' for 'all' 21 times; 'citizen' for 'citizens' 13 times; doubled phrases ('had their had their', 'too, in too, in', 'which all which all'). There is also a spliced fragment from VII.6 inside VI.6 ('e state need not be much increased,since there is no necessity tha'), and a garbled clause in III.1 ('a furthering the state, whether a certain act ...' for 'a further doubt, whether he who ought not to be a citizen, is one in fact').
- Ellis: misreadings of the æ ligature (Penestise, Helisea, Daphnseus, Mantinsea, Larisssean, Lacedasmon); two chapter openings lost their first word 'After' (III.4, III.14); a stray margin label 'I28oa'; and a transcriber's note '[***tr.: text is unintelligible here***]'.
- Oeconomica: three **dropped passages**: the Libyan's answer plus two sentences (1345a5–10); 'Mausolus, tyrant of Caria, when the king of Persia' (1348a); Dionysius's levy on orphans (1349b15–17). There are also margin numbers read into the text ('ao', 'as', '5', 'i. she' for 'he').
- Rhetoric: many dropped short words. Several change the sense: 'if he is [not] strong'; 'the unwritten words of the law' for 'written'; 'arbitration to motion' for 'litigation'; 'Demosthenes' for 'Democrates'; 'our nature' for 'your nature'; 'others like him' for 'them'.

## Columns

- **pol-jowett, oec-forster, poet-fyfe**: the column is that of the nearest preceding anchor in `anchors.yaml`. `source` gives that anchor's line as 'c. 1345a25'.
- **pol-ellis, rhet-roberts, poet-butcher** (no anchors): the column is a proportional estimate within the chapter, from the Greek TEI's Bekker milestones. This is the same idea as the Tier 0 gutter, so it can be off by one column near a column boundary. Spot checks against the Oxford margins for the Rhetoric agreed.

## Not reported (see the rejected file)

These were left alone:
- American spelling, and modernisations such as 'a hereditary' and 'a historical'.
- Differences that are only a hyphen against a space ('flute players', 'wealth getting').
- The archive's Greek transliterations, including Ellis's 'xeugitai', which looks like a slip for 'zeugitai'.
- Fyfe's 'Amphiaraos was was made', because the 1927 print has the doubled 'was'.
- Jowett's 'the first person', which is right; the 1921 print misprints 'the first people'.

## Unsure

- 'someone' (Rhet II.3), 'everyone' (Jowett II.5), 'wellbeing', 'wellbalanced', 'harpplayer' and 'nonessentials' are run-together forms of words the print spells as two words or hyphenates. They are included as minor; drop them if run-togethers that don't change the sense are not wanted.
- Butcher 'originally' (I) is in neither the 1902 nor the 1907/1911 text, but I have not seen every printing; 'media' for 'medium' likewise.
- Jowett 'remain'/'remains', 'holds'/'hold', 'would'/'will', 'when'/'while' are small grammatical differences from the 1921 print. They could be McKeon-era editing rather than transcription slips.
- For poet-fyfe, the scan is the 1927 printing. The 'man' restored in 'in this respect man differs' is from 1927, but without it the sentence has no subject.

Working files and tools are in `agents/g8/`: the `corr_*.py` data files and `build.py`, which validates every find (unique in its book, 4–10 words unless flagged long) and rebuilds `results/g8.json`.
