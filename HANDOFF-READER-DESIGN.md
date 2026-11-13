# HANDOFF: reader page design rounds

Started 13 Nov 2026. Branch `claude/redesign-build` (unpushed), this worktree. The coordinator for UI work is the
session `aristotle-reader-62`: report to it, and it pings John for decisions. John rules on design; you don't.

## The question (John, 13 Nov 16:22)

"the look of the plato reader's reader pages is very easy on the eyes. aristotle reader pages? i'm not so sure it's
cut out for long sessions." Then: hill-climb the reader page.

## State at 17:28, 13 Nov (wrapped for a restart)

Flip page: https://claude.ai/artifact/6b1rJ55cg3ntyP4Fsy44rY. Tabs: Round 1, Round 2, Round 3 · phone; Desktop,
Phone, Sideways; Light, Dark. Each option flips against its round's start, Now (this branch), Live
(aristotle.johnhboyer.com), and Plato; letters are fixed per round. Source in `.redesign-shots/notes/reader/r1/`:
`index.html`; shooters `shoot-r1.mjs`, `shoot-r2.mjs`, `shoot-r3p.mjs`; shots `img/` (round 1), `img2/` (round 2),
`img3/` (round 3); `probe2.mjs` + `probe2.json` (the measurements); `align.mjs` (phone-parallel alignment check);
`review-brief.md`, `opus-review-r1.md`, `codex-review-r1.md`. All scratch work (raw shots, probes, contact sheets) is
in `.redesign-shots/notes/reader/work/`. Shooters inject CSS into the built page (`app/dist` served on 127.0.0.1:4331,
a server this track did not start) before the reader measures; no app code is touched. Every shot is Ethics I at
1094b1, Both view. Run a shooter as `node <shooter> <outdir> [option ...]` from any directory; it resolves
Playwright from `app/`.

Round 3 (phone parallel: start, wrap as a unit; the larger-Gentium entries are marked out) waits for John's look.

### What the measurements found (probe2.json)

Against Plato's Republic I: Aristotle sets each Bekker line as its own line, and at 1152px 12 of 13 visible lines
wrap into a long part plus a short indented stub (Greek column 369px; Bekker lines median 503px, p90 548px, max
629px in Literata 19.5px). Literata 300 (x-height .52) against Gentium Book Plus 400 (.47). Light page #FBFBF9 /
ink #141413 17.8:1 against Plato #F3F4F6 / #12161C 16.5:1; dark 15.0:1 against 13.6:1. Full-ink bar rule, bold bar
words, and a black view button against Plato's pale bar. Sideways left margin 108px against 26px. Sizes, leading,
red, and motion are not the difference.

### John's rulings (13 Nov)

- No running prose: "citation and direct accurate bekkers are really important." Every Bekker line stays a line.
- No stacked layout (Greek over English on desktop or sideways): "fuck no. no stacked."
- Literata 400: "too heavy." (Thread left open: the auto-reply offered a 350.)
- Quiet bar: "I like this." The tinted chosen view was near invisible in dark (both reviewers); round 2 underlines it.
- Plato's fonts: "nice to read", "for both" → Gentium Book Plus 400 for Greek and English.
- Wrap as a unit: "oh that is nicer"; then kept for sideways ("b for sideways phone? yes"), on hold for the upright
  phone until he sees it in parallel (round 3).
- Phone Both is PARALLEL ONLY (17:11, caps): "NO STACKED ON PHONE. PARALLEL ONLY." The built B stacks each passage on
  a phone; that goes. Round 3 (phone) shows parallel at 18 and 20px, with and without wrap as a unit.
- English keeps its Bekker numbers on the phone ("you better fucking believe they do"). In phone parallel the
  column label (1094b) goes in the left margin so Greek and English start on one line; `align.mjs` in the notes
  folder checks it (0 of 31 rows off; the old label-above layout fails 19 of 31, its positive control). Live today:
  Cardo 14.4px/23.04 against EB Garamond 14.4px/22.32, so the columns start 2px apart and drift 0.7px a line.
- Compare every round against the live site too (aristotle.johnhboyer.com); Live is a compare button on the page.
- Less glare: kept, and SITEWIDE for consistency (light --paper #F1F0EB, --bg #EBEAE4; dark --ink #E0DFD9). The
  tokens live on `.frame.dir-b` in shared/styles/b.css, so home, work, search, and lexicon pages change with it;
  show him those pages before building.
- Gentium larger (21.5px desktop, 20px phone): "no i don't want gentium larger". Gentium stays at 19.5px (phone 18).
- Narrow margins (desktop and sideways): "i do like the narrower margins." Kept.
- Plato (not this track): its phone default should be Both. Only the default is ruled; Plato's 15/14px two-column
  phone Both is a separate question to put to him as a picture. Memory `plato-phone-serves-both`; the coordinator
  queued it with the Plato search port.

### Round 1 reviews (fresh agents, findings only)

Opus 5.5 and Codex gpt-6.1-sol medium agreed: keep wrap-as-a-unit, narrow margins, less glare, phone English in
ink, whole lines on desktop (English must get width back), quiet bar with a visible chosen view. Both flagged
Gentium's smaller apparent size at the same px; hence round 2's "Gentium larger" (21.5px, phone 20px). Opus flagged
the sideways bar (57 of 390px). Codex's "missing line numbers" finding came from my brief's wording (the site numbers
every fifth line); set aside. The Opus review is in-family (I built the mocks on Opus); Codex is the cross-family read.

### Rounds 2 and 3

Round 2 (start = Gentium both + quiet bar with underlined chosen view): Gentium larger (out) · wrap as a unit (kept
sideways) · narrow margins (kept) · whole lines · less glare (kept, sitewide) · phone English in ink · shorter
sideways bar · two combinations. Round 3 (phone only): parallel Both at Gentium 18px, quiet bar, English in ink with
its Bekker numbers in the right margin, column label in the left margin; option: wrap as a unit.

## Next

1. John's look at round 3: does wrap as a unit stay on the upright phone in parallel?
2. Still unruled from round 2: whole lines on desktop (Greek 510px; English narrows), phone English in ink (moot if
   parallel puts both in ink, as round 3 does), shorter sideways bar (44px). Ask, or show them again combined.
3. Round 4: everything kept, combined, on all screens; then one Opus and one Codex review of it (fresh agents,
   findings only; brief pattern in `review-brief.md`; say the site numbers every fifth line).
4. Show the sitewide less-glare colours on home, work, search, and lexicon pages before any build.
5. Gentium's line-number baseline: the `.b-ln` offset formula uses Literata metrics (.4345); check numbers against
   Gentium baselines before any build.
6. Not yet shown: chapter openings, footnote markers, Greek-only and English-only views, and the book head (BOOK I).

## Standing rules

- A vision-impaired reader uses the site on a phone held sideways. Cut furniture, never type size or tap targets.
- No explainer text in the reader: labels, refs, numbers, and the texts only.
- Don't change `--red`. Don't write into `build/dist`. Never git-add `.redesign-shots/` or the root `node_modules/`.
- The design bar is greek-plays' Vase: elegant, stunning, and functional. No stock LLM look.
- John's mid-round ideas are hypotheses to test; say when one doesn't work.
- Pass `model:` on every agent spawn and label it with its model. Implementation and review are never the same model
  family. Codex briefs say "Do not launch a browser or run browser gates".
- Browser runs: single-page shooters are fine; tell `aristotle-reader-62` before a full gate run (check-redesign,
  search-shots, search-counts), because `aristotle-reader-9c` runs them too.
- Mock-ups and options only until John rules. No commits to app code, no gates, no pushes. Rewrite (don't append) this
  file when you hand off.
