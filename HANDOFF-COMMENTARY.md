# Handoff — commentary layer (Aquinas study, texts and translations)

Track: the commentary layer's design and its sources (plan in `docs/commentary-layer-plan.md`, data model in `docs/commentary-layer-decisions.md`). Last session 2026-11-04/05; its files went in with this handoff.

## State

- **Mockup, round 2, v19**: https://claude.ai/artifact/MDTtX4Y1nUxFKsHJPhKVaU. Comment threads: https://claude.ai/code/artifact/a3b444d7-4fcb-470e-b57d-4f24d344ccd5. Aquinas on De anima, lectio 1, as one document folded on his division. Five texts: Greek, Smith, Moerbeke's Latin, Aquinas's Latin, an English of Aquinas.
- **Source** is now in `docs/aquinas-commentary/mockup/`: `python3 build2.py` inside that folder joins `template2.html` + `aquinas-data.js` + `round2-data.js` + `aristotle.json` into `aquinas-r2.html` (the page that was published; a rebuild on 2026-11-05 matched it byte for byte) and `preview2.html` (the same, wrapped for local viewing). Round 1 (`template.html`, `build.py`, `aquinas-commentary.html`) is kept too. The edit scripts there (`swap_ct.py`, `no_moen.py`, `declutter.py`) each record one round of changes.
- **The commentary pages' design is not settled** (John, 2026-11-05). His verdict on round 2 is still to come. Ingest nothing past saving sources until it is.

## Decided, and why

1. **No English of Moerbeke**, for now (v18): "if someone is looking at moerbeke's latin, he probably can read latin."
2. **Aquinas's Latin comes from Corpus Thomisticum** ("Yes, use it"), word for word. v19 swapped lectio 1. CT claims rights only "quoad hanc editionem"; the words are Aquinas's. CT's De anima is the Turin 1959 (Marietti) text: pre-critical, not Gauthier's Leonine. Moerbeke's Latin still comes from Parma, which CT lacks.
3. **Parma vs CT is not worth worrying about** (John). The whole-work collation found about 60–65 real-word differences in 90,700 words. The report, https://claude.ai/artifact/SVKyvD6FD548pKKjN7nfvZ, says 55: a matching flaw hid a few insertions (n. 13 *in actu*). Scripts are in `docs/aquinas-commentary/collation/`; the scans and OCR they ran on (about 300 MB) stayed in the scratchpad and are gone.
4. **How CT was proofed**: Alarcón, *Anuario Filosófico* 35 (2002) 791–801. CT is Busa's Index Thomisticus tapes, converted by program; he claims no errata from the transfer. He describes no check of Busa's keying against the printed books. Our test of De anima found no non-word typos.
5. **English of Aquinas**:
   - De anima: Foster–Humphries (1951), **cleared** (2026-11-05).
   - Metaphysics: Rowan (Regnery 1961), **free to host** (registered A538676, no 1989 renewal found). Text taken from isidore, checked against the 1961 print ("Yes, from isidore").
   - Translations still in copyright (Litzinger's 1964 Ethics, White's 2005 De sensu, Larcher's 1970 Posterior Analytics, Pasnau 1999): John thinks them "fair game (for our purposes)" but is "not going to go yolo and say go". Not authorized.
   - Greek commentators: the labelled AI translation of the plan's pilot stands.
6. **isidore.co is grey**: it mirrors Joseph Kenny's old site, which the Dominicans pulled over copyright. John is "fine with grey, personally speaking". So isidore may supply the text of a translation we have cleared; it never makes an uncleared one hostable.
7. **Divisions**: "We can check divisions later." My weak points in the lectio 1 divisio are listed in the memory note.

## Files from this session

- `docs/translation-base-texts.md`: what every hosted Aristotle translation was made from (translator's own words, archive.org ids, 32 quotes checked against the scans). Also the Aquinas translations: Foster–Humphries, Regnery, and what isidore.co and aquinas.cc host.
- `sources/aquinas-meta-rowan/`: Rowan from isidore, English alone and Latin beside the English, Books I–XII, with a README. 2,648 of Cathala's 2,663 numbers carry numbers. Seven unnumbered paragraphs look present; 749–750 look missing. Unchecked against print.
- `docs/aquinas-commentary/`: the mockup and collation sources above.

## Next

1. John's verdict on round 2, then settle how the commentary pages work.
2. Mockup: swap the drafted English of Aquinas for Foster–Humphries, now cleared.
3. Add this handoff to the list of live handoffs in `CLAUDE.md` (left out because another session had uncommitted edits on that line). `docs/commentary-layer-plan.md` unknown 3 now records decisions 2 and 5.
4. Open questions:
   - Foster–Humphries' Latin base is unconfirmed. One lead: numbered to Pirotta's Marietti edition, 1925.
   - Check Rowan against the 1961 print, starting with 749–750.
   - Which English aquinas.cc carries for the commentaries other than De anima.
5. Parked by John: how to show Aristotle translations made from a different Greek text than the one on screen. Only Meta, EN and EE translate the Greek we show (Mete nearly); the rest follow Bekker, Biehl, Prantl, Apelt and others.

## Gotchas

- aquinas.cc's root URL hangs on "Loading…"; a lectio URL such as `https://aquinas.cc/la/en/~DeAn.Bk1.L1` loads. It names no translator or edition. Its De anima English is Foster–Humphries revised, and its Latin looks Leonine.
- Bot checks: the Navarra journal pages and Stanford's renewal database. Don't try to get around them. NYPL's `cce-renewals` TSVs on GitHub and the Catalog of Copyright Entries scans on archive.org cover renewals and registrations.
- Python urllib fails SSL on this machine; use curl.
- The Chrome extension dropped out late in the session; the built-in browser worked.
- Detail beyond this file is in memory, `commentary-layer-design.md`, items (9)–(12).
