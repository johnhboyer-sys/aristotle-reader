# Group 6: notes

Oxford *Works of Aristotle* vol. V (1912) and vol. VI, *Opuscula* (1913). 810 corrections in `results/g6.json`, 18 rejected detector candidates in `results/g6-rejected.json`. Working files, scripts and page crops are in `agents/g6/`.

## Corrections per translation

| dir | corrections | print-checked | scan-agrees | sense-only |
|---|---|---|---|---|
| pa-ogle | 75 | 1 | 74 | 0 |
| ma-farquharson | 4 | 0 | 4 | 0 |
| ia-farquharson | 11 | 2 | 9 | 0 |
| ga-platt | 71 | 3 | 68 | 0 |
| mech-forster | 15 | 1 | 14 | 0 |
| col-loveday-forster | 63 | 2 | 60 | 1 |
| aud-loveday-forster | 57 | 0 | 57 | 0 |
| phgn-loveday-forster | 159 | 9 | 150 | 0 |
| mirab-dowdall | 209 | 3 | 206 | 0 |
| vent-forster | 19 | 0 | 19 | 0 |
| lin-joachim | 1 | 0 | 1 | 0 |
| mxg-loveday-forster | 126 | 2 | 121 | 3 |
| **total** | **810** | **23** | **783** | **4** |

Detector candidates: 86. Of these, 68 are corrected (some inside a larger correction) and 18 are rejected with a reason.

## Scans used

- **Vol. V (PA, MA, IA, GA):** `worksofaristotle05arisuoft` (Toronto copy of the 1912 volume) for scandiff and the page images. This copy's OCR lacks a few pages: PA 656a–b and 697b, the end of IA, and GA 724b–725a. For those pages, and as a second pass over all four texts, I used `worksofaristotle512aris` (Wellesley copy, same volume). The second pass found one more error (PA 659a, 'the horns of certain oxen'). The PA corrections already in `english-corrections.json` cite `b29012284` (the 1911 separate PA). I did not download that scan, so these sources name the vol. V scan. The site labels PA 'Oxford, 1882'. The text matches the Oxford 1911/1912 translation, not Ogle's 1882 Kegan Paul version.
- **Vol. VI (Col, Aud, Phgn, Mirab, Mech, Lin, Vent, MXG):** `worksofaristotle06arisuoft` (Toronto copy, 1913) and `works0006aris` (another copy). The site's Opuscula texts come from the `worksofaristotle06arisuoft` OCR: they share its misreadings ('Sekehusions', 'eee', 'Sout', 'ΑΒ' for 'As'). They also share the footnotes and margin numbers it ran into the text. So `works0006aris` served as the independent OCR. I also aligned against the body text of the `worksofaristotle06arisuoft` djvu XML, with running heads, footnote regions and margin words removed. That alignment found the dropped lines. The page images come from `worksofaristotle06arisuoft`.
  - Mech: the repo test says its source OCR was `works0006aris`; it was checked against both scans.
  - Lin: the site's source is Joachim's 1908 separate printing (`delineisinsecabi00arisrich`, already corrected 49 times). It was checked against the same translation reprinted in vol. VI. Only one new error turned up.
  - Mirab: the site labels it 'Dowdall (Oxford, 1909)'. It was checked against the 1913 reprint in vol. VI. The sources therefore read 'Oxford 1913'.
- No translation lacked a scan.

## What the Opuscula texts suffer from

All of this is in the source HTML; the parser adds none of it.

1. Footnote marks left on words. The superscripts are OCR'd as ? ! * ® ° © ’ ” or digits, e.g. 'black?', 'things,?', 'Maedian!'. Spot-checked on the page images: Col n10 and n26, Phgn n65, Mech n196, MXG n275.
2. Margin Bekker columns and line numbers left in the text, e.g. '8007' for 800a, '3°' for 30, 'το', 'Io', 'ro', 'to' for 10, 'a5' for 25. Some of these turned into words: 'darker to near the body' and 'taken to captives' (page image n146).
3. Whole footnotes run into the text at page breaks, including Greek. Twenty-three were removed. The longest are MXG 979a35-37, in two halves, and Mirab's notes on Tartessus, Hypate/Ismenium and the Scythian poison.
4. Dropped words. Most are 'or' and 'as': Col 6 + 6, Phgn 17 'as' + 2 'or', MXG 11 'or' + 6 'as'. The OCR seems to have read these as Greek letters, and a later clean-up stripped them; Aud 'ΑΒ for the windpipe' (for 'As') is the visible case. Other dropped words: 'size.' (Phgn), 'he says that' and 'appointed' (MXG verse quotations), 'else.' (MXG), 'a' (Mirab).
5. Dropped lines and passages:
   - Col 795b15-20 (64 words), 797a15-25 (123 words), and the opening of ch. 6, 797a33-b28 (310 words).
   - Mirab ch. 84 opening (836b30-837a5) and ch. 141 opening (845a1-4), plus 'inscription—‘ Diomede to Artemis’. Now the legend re-' in ch. 110.
   - MXG 976a13-14 ('reason why one kind should not be rare and another').
   - The restored text was taken from both OCRs where they agree word for word, with footnote marks and margin numbers left out.
6. Words split at the print's line ends ('com- pletely', 'pro duces'). Compounds that lost their line-end hyphen ('winecoloured', 'flamecolour', 'shoulderblades', 'illarticulated') are corrected only where the compound is hyphenated elsewhere in the same text, the chapter list or the index.

## Vol. V

These texts come from the MIT archive and Adelaide (GA). Their errors are typing slips: dropped words and changed words. Some change the sense:

- GA 'the so-called eggs contribute to generation' should read 'contribute nothing to generation' (it reverses the sense). GA also drops 'nyctalopia', ‘hoar-frost’, 'female', 'why' and 'out of anything'.
- PA: 'total weight' should read 'total eight' (the octopus's arms); 'when the fluid is discharged' should read 'whence'; 'invariably variably' should read 'invariably present.'
- MA: 'tightened or leased' should read 'released'.
- IA: 'at all every animal ... an even us' should read 'at all, [for every animal ... an even number],'.

Smaller items:

- Spelling slips toward American forms: center ×5, neighborhood ×2, molded, behooves, neighboring, connection. The print has the British form, and these texts use the British form elsewhere.
- PA 'The Emys [the fresh-water tortoise]': the bracketed gloss paraphrases Ogle's footnote and is not in the printed text.
- GA '(aerh)' becomes '(ἀήρ)', following the precedent of the PA '(ὁ λόγος)' fix.

## Deliberately not reported

- **Mirab chs. 2, 10, 12:** Dowdall printed these in Latin. The site gives them in English. This is an editorial choice in the source, not an OCR error, so I left it alone. It is worth a note on the page.
- **Dashes and punctuation that don't change the sense.** This covers GA's dropped dashes, PA 'the like-while', and the spacing in '‘ The' and ' ;'. Commas for full stops are reported only where both scans agree on the stop (e.g. Phgn 'soft hair, A thick'), or where the run-on changes the sense (GA 'comes from outside just as').
- **Uncertain cases left out:**
  - Aud 'in large quantities, The same' and Mirab 'tease them, Their head': both OCRs read a comma.
  - PA '(Parrot-fish)' and GA 'uni-coloured or vari-coloured': the OCRs read no hyphen, but that is not certain without an image.
  - Line-end compounds with no other evidence: Mirab 'winemerchant', 'Celtoligurians'; MXG 'abovementioned'.
  - Vent 'Scironian Cliffs' (capital C).
- **Mirab ch. 137:** opens '[And they say ...' and has no closing bracket in print either.

## Format notes

- **Long finds:** 220 finds run over 10 words. The error itself is long: run-in footnotes, restored passages, garbage strings. Or two neighbouring errors had to share one find so that the finds don't overlap.
  - Every find occurs exactly once in its book's whitespace-collapsed text, built as the repo test builds it.
  - No two finds overlap.
  - Each replace is unique after the fix.
- **Column:** the column is taken from the nearest preceding `anchors.yaml` tick. The Bekker line in `source` is interpolated between ticks. Where the site had dropped text, its ticks are bunched (Col 797a-b), so the column given there is approximate.
- **Anchors:** 75 corrections change one of the first four words of an `anchors.yaml` phrase. Those anchors stop resolving until they are updated. Restored passages also move later anchors: Col 797a-b, Mirab 836b30, 845a1. List:

- aud-loveday-forster: 803a25 (find begins “trumpet; when they are revelling! men relax…”)
- aud-loveday-forster: 803b5 (find begins “the air striking separately -. upon the hearing…”)
- aud-loveday-forster: 803b40 (find begins “when they are moved rapidly before our eyes. The…”)
- aud-loveday-forster: 804b10 (find begins “together with the sounds ; smooth το sounds, on …”)
- col-loveday-forster: 792a15 (find begins “colour. Buta vivid bright violet…”)
- col-loveday-forster: 792a30 (find begins “For + it is after this fashion…”)
- col-loveday-forster: 793b20 (find begins “seen by firelight or moonlight torchlight, becau…”)
- col-loveday-forster: 796a15, 796a20 (find begins “to a crimson colour, and the pavement be seen fr…”)
- col-loveday-forster: 797a15, 797a20 (find begins “one another in their colouring. finally becomes …”)
- col-loveday-forster: 797a33, 797a35, 797b10, 797b15, 797b20, 797b25, 797b5 (find begins “settles 1 owing to its abundance. So, too, with …”)
- ga-platt: 723a30 (find begins “disproportion of that comes from the woman…”)
- ga-platt: 724a20 (find begins “which makes them from it as simply because…”)
- ga-platt: 730a20 (find begins “the male spinkles the milt over them…”)
- ga-platt: 741a20 (find begins “It neither possible that they should live…”)
- ga-platt: 744b30 (find begins “As the animal grows the bones grow from the natu…”)
- ga-platt: 746b20 (find begins “But this kind, of mules, is universally so…”)
- ga-platt: 769a20 (find begins “amount of semen coming the male or female parent…”)
- ga-platt: 780a20 (find begins “towards old age; but is an excess of liquidity…”)
- ia-farquharson: 707b20 (find begins “their left hip rather inclined backwards…”)
- mech-forster: 856a10 (find begins “So, indeed, the lesser? circle has moved the gre…”)
- mirab-dowdall: 830a20 (find begins “employs this kind of defence, and the 2° excreti…”)
- mirab-dowdall: 832a10 (find begins “and on these they say it ferments for long time…”)
- mirab-dowdall: 832b31 (find begins “° Both in Media and in Psittacene, a district of…”)
- mirab-dowdall: 833a9 (find begins “[ is said that the places outside the Pillars of…”)
- mirab-dowdall: 834a23 (find begins “Inthe Lydian mines near Pergamos…”)
- mirab-dowdall: 835b1 (find begins “° They say that in Cappadocia there are mules…”)
- mirab-dowdall: 836a24 (find begins “2: In the Amber islands, which are situated…”)
- mirab-dowdall: 836b5 (find begins “from which falls what is called amber.* This, th…”)
- mirab-dowdall: 836b30 (find begins “spread a report about it, or a large number migh…”)
- mirab-dowdall: 837a20 (find begins “which they call ravenswort,? because raven, whic…”)
- mirab-dowdall: 837b15 (find begins “piercing it with tridents,' easily take out of i…”)
- mirab-dowdall: 838a5 (find begins “s At Cumae in Italy there is shown…”)
- mirab-dowdall: 838a20 (find begins “obtained possession, and sold it to.. the Cartha…”)
- mirab-dowdall: 838b3 (find begins “° [ the city of the Orchomenians in Boeotia…”)
- mirab-dowdall: 840b1 (find begins “9 In the district which bears the name of -Dauni…”)
- mirab-dowdall: 841a10, 841a9 (find begins “Inthe dominion of the Carthaginians ® they say t…”)
- mirab-dowdall: 841a27 (find begins “5 It is reported that in that part of Thrace…”)
- mirab-dowdall: 841b9 (find begins “7 At Scotussae in Thessaly they say…”)
- mirab-dowdall: 841b25 (find begins “most of all surprised at is thiswhenever the haw…”)
- mirab-dowdall: 842a5 (find begins “In the Thracian Chalcidice,? near Olynthus…”)
- mirab-dowdall: 843a1 (find begins “° Concerning the Sicilian Strait, apart from wha…”)
- mirab-dowdall: 843a15 (find begins “on both the promontories a tow,.- and produce a …”)
- mirab-dowdall: 843b6 (find begins “. In one of the islands, called the islands of A…”)
- mirab-dowdall: 845a1 (find begins “may be the wingless locust called dgipaxos or by…”)
- mirab-dowdall: 846a25 (find begins “15] Men say that the dogs pursue the wild beasts…”)
- mirab-dowdall: 846b10 (find begins “ro Othrys is a mountain of Thessaly…”)
- mirab-dowdall: 847a1 (find begins “Near the river Lycormas’ it is said that a plant…”)
- mirab-dowdall: 847b1 (find begins “° On the altar of the Orthosian® Artemis…”)
- mxg-loveday-forster: 974b5 (find begins “cannot be manifold, and the belief > that it is …”)
- mxg-loveday-forster: 975b15 (find begins “many things are at any time, but. by nature ther…”)
- mxg-loveday-forster: 977a5 (find begins “a placing of elements one above another,? or a p…”)
- mxg-loveday-forster: 977b10 (find begins “neither moved nor unmoved; for © inteaGbility be…”)
- mxg-loveday-forster: 979a12 (find begins “Goreias declares that nothing exists; and if any…”)
- mxg-loveday-forster: 979a34 (find begins “Nowit does not at all follow from what he has sa…”)
- mxg-loveday-forster: 980a20 (find begins “For how, he . 2 56, could any one communicate…”)
- pa-ogle: 660b30 (find begins “The tongue, however, on this animal is not attac…”)
- pa-ogle: 661a30 (find begins “the tongue agrees with description already given…”)
- phgn-loveday-forster: 805b30 (find begins “all animals that have some 3° mental affection i…”)
- phgn-loveday-forster: 807a5 (find begins “Suppose, e.g., that irasci- bility and morose su…”)
- phgn-loveday-forster: 807a10 (find begins “appropriate to masters of philosophy, Since it i…”)
- phgn-loveday-forster: 807a31 (find begins “Sicans of Courage are—coarse hair;…”)
- phgn-loveday-forster: 807b5 (find begins “soft hair; the figure stooping * and lacking in …”)
- phgn-loveday-forster: 807b10 (find begins “loins small and-weak; a rigid gesture of the bod…”)
- phgn-loveday-forster: 807b30 (find begins “lids slightly bulging; ὃ high shoulderblades; a …”)
- phgn-loveday-forster: 808b11 (find begins “Sout and body, as it seems to me…”)
- phgn-loveday-forster: 809a26 (find begins “I ὙΠ], now first attempt to make a division…”)
- phgn-loveday-forster: 809b20 (find begins “nor unduly long, and of moderate size:* his brow…”)
- phgn-loveday-forster: 810b5 (find begins “A narrow waist marks the hunter, as in the lion,…”)
- phgn-loveday-forster: 810b15 (find begins “i Strong sides indicate strength and weak sides …”)
- phgn-loveday-forster: 811a10 (find begins “difficult to apprehend sense-stimuli, A thick ne…”)
- phgn-loveday-forster: 811b20 (find begins “on the evidence of the ape: large eyes, lethargy…”)
- phgn-loveday-forster: 812b5 (find begins “of a white hue: but they are gleaming rather tha…”)
- phgn-loveday-forster: 812b20 (find begins “must be best. Hairy shoulders ~ mean lack of per…”)
- phgn-loveday-forster: 812b35 (find begins “A ridge of hair® on the upper part of the forehe…”)
- phgn-loveday-forster: 813b35 (find begins “will be found in persons of moderate i stature.…”)
