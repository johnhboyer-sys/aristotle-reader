# HANDOFF: search build (the redesigned search page, for real)

Written 12 Nov 2026, 13:20, at the end of the session that refined the search
mock-up. Rewrite this file (don't append) when you hand off.

## 0. State (13 Nov 13:10): John's review rulings being built; tip goes to the coordinator

- **Built and merged before 13 Nov:** stages S1–S6 (Codex R1–R9), tip e987866002;
  the redesign gates' a11y fixes ead5584589 (R10). Track A (home/work/reader on
  `claude/redesign-build`) is coordinator: it merges this branch and runs the
  release gates (build:public, deploy:dry, link and leak checks). One deploy for
  the whole redesign. Nothing is pushed.
- **John's rulings of 13 Nov, built and committed on `claude/search-build`
  (each with a Codex review, R11–R14):**
  - English hits cite the column ("Cat 2b"), links still go to the line; "for
    now the column. once every work is properly aligned, the line"
    (55159aa136; `englishCiteLine` holds the rule).
  - The proximity editor folds after its Search (cd9221f2dc).
  - Rulings 1–5: (1) Accents on sets Form to "Only as I typed it" (not in
    Running text) — built; (2) the phone "This search" lists filters only, Clear
    all keeps the view — as built; (3) the guide keeps Typing Greek first — as
    built; (4) superseded by (a); (5) keep the new wildcard rules; the PR lists
    the change for old links.
  - (a) A translation switch on Greek-only hits and opened sections, the work's
    own order, reference first (8e7a2bedf1 on the side branch).
  - Keyboard: the seven mark keys above the first letter row, CSS dotted ring
    under Literata's spacing marks ("c2: b for all", bd62434c9f).
  - Group by (1e7738c278): form key = spelling with every accent off, breathing,
    subscript, diaeresis kept; phrase/running text keyed on the whole phrase;
    By form only for one word / phrase / running text (lemma off), By grammar
    only for lemma searches, else By work only; By grammar = headword over its
    paradigm (round B opt 2); stage6 `signature()` carries each reading's lemma,
    and the client keeps only the searched headwords' readings. **Needs the
    corpus rebuild** (Track A, build:public after merge) before the grammar rows
    and facets lose the homograph's parses.
  - Shot d27 retired (word card option b dropped).
  - Merge of the side branch `claude/search-build-b`: b024fb2ba2.
- **Waiting on John (pictures on his rounds page, folders in the session
  scratchpad `rounds/`):** D (Both view compact: D5b vs his two-column D6;
  phone and/or centred in its own gap, letters centred, D7); F (proximity editor
  = opt-4b, one line per term, footer on one row) after G (grammar chips:
  G-3 one menu per category + switches recommended); H (phone query width: H2
  tools under the rule recommended); Group by: rows open or shut, the data size
  (grammar-dict EN gz 7.7 → 87 KB), facets lemma-only. Track A relays rulings.
- **13 Nov afternoon: the page re-mocked; BUILD ON HOLD until John rules on it.** John chose D6 (Greek and
  English side by side on desktop, stacked on the phone) and D8: no Greek | English | Both switch; the filled
  fields decide the search; a field's options show only once it has text, as one compact row. Other choices:
  - "In all works | authentic works | choose works…" as words on the Proximity/Search row.
  - F 4b: Search on the editor's foot row, no "Not searched yet".
  - G-3 with switches: one menu per grammar category, word class first. The class is derived from the data: case →
    declined word, mood → verb, marker → the rest. The mood decides a verb's menus.

  The full mock-up is published at https://claude.ai/artifact/F1rX9UHRYpqEvyui5aUk7X. Source:
  `/private/tmp/claude-501/-Users-johnboyer-Developer-aristotle-reader/fd0fa02b-3cff-421e-a7cc-90c9514c6193/scratchpad/mock/`
  (notes.md has every choice and measure). The four review rounds and their log are in `…/scratchpad/mock-review/`.
  - **Reviews:** Opus and Codex alternating. All four chose H3 and (a) words, and said adopt the 44px keyboard and the
    sideways fold after Search.
  - **John ruled (17:07, final 17:08): options (b), the menus, on the PHONE, upright and sideways; (a), the words,
    on desktop (1152 and 961).** In his words: "except for phone upright, i think a works better" … "and phone
    sideways". Every state that shows options follows that split.
  - **One row on the phone: B1 option 3, "switches as words"** (John, 17:23). Match ▾ and Form ▾ stay menus;
    Accents and Lemma lose the switch track and become words: off is mid on a hairline, on is ink with the red
    underline (one tap each, as ruling 5). Gaps 20px, 12px below 380px. Pictures and measures:
    `/private/tmp/claude-501/-Users-johnboyer-Developer-aristotle-reader/fd0fa02b-3cff-421e-a7cc-90c9514c6193/scratchpad/rounds/B1/`
    (index.html, notes.md, shoot.mjs). It fits on one row at 390, 360 and sideways, but at 360 with the longest
    values it has only 2px to spare (322 of 324). The build's 360 test must hold that, or let the row wrap rather
    than clip.
  - **H3 on the phone, upright and sideways** (John, 17:21: "phone (both) H3"): "Greek" and "English" labels above
    the fields, Keyboard and Beta Code beside the Greek label. His reason: he likes H2 better on the empty page and
    Greek only, "it's not working for both mode".
  - **Still open for John:** the count on a Both search (it adds Greek and English word hits, `hitCount` in
    search-pages.ts); what Lemma does beyond "any form"; two lines per term in the upright editor; naming
    "Keep hits that cross a chapter" in the folded line; paradigm rows shut.
  - **For the build:**
    - `lang` becomes derived. The switch, `setLang` and `LANGS` go. Keyboard and Beta Code stop keying off
      `lang !== 'english'`.
    - R-S1's language loop must be rewritten (Track A's gate).
    - Dark `--go` has no dark value: two reds.
    - Controls under the sideways key sheet stay focusable.
    - Segment words should be radio groups (one tab stop).
    - The chapter-starts NOTE before results breaks the no-explainer rule.
    - At 360px the count runs into Save.
    - The measuring gaps R4 lists, for whoever ports these checks into a gate.
- **Follow-ups (not blockers):** the Forms rail needs an accents stream for
  Aristotle (pipeline), then its tick boxes split by case; until then ἀρετή and
  ἀρετῇ are two groups in the results but one row (αρετη) in the rail. Also:
  the desktop app mounts the new Search unstyled; an opened section's English
  can start a clause early; b.css still uses `max-width: 960px` elsewhere; after
  "Find this phrase in any inflection" the address keeps the old sp/sn/wf; dead
  code from the port (`groupState`, corpus-tools, inscription, sect-ticks,
  speaker-colors); the 6-term proximity cap's speed test; R-A3 exempts `.tr-dot`
  by name (Track A's gate). Then the port of the design fixes to plato-reader (§1).

## 1. What this track is

Build the redesigned search page into the site: the Svelte component, its
styles, and the engine work the design needs. The design is settled as a
mock-up (round 34). John, 12 Nov 12:31: refining is done, "whatever tweaks can
come after the build". Then: "let's do build in fresh session".

After this lands, the design fixes go to plato-reader too (memory
`port-search-fixes-to-plato`): per hunk, never a directory sync.

**Who does what.** Codex (`--model gpt-6.1-sol --effort medium`, via
`~/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs task`)
writes the code. Claude (Opus) reviews it. John set this ("codex writes, not
grok"); Grok is benched until he lifts it. Implementation and review are never
the same model family. Load the `delegate` skill before the first dispatch.

## 2. Ask John first (do not guess these)

**D1. How the engine comes in. RULED (John, 12 Nov 13:25): (a), adopt and reconcile.** The mock-up was drawn on Plato's search, not
Aristotle's. An Opus agent copied Plato's whole search stack (plato-reader
origin/main `51aa7c3b22`) into `shared/psearch/` of a throwaway worktree, with
two shims (`psearch/lib/works.ts` re-exports Aristotle's registry;
`psearch/lib/citation.ts` is Plato's scheme contract). Every screen in the
mock-up therefore shows Plato's features: paired Greek and English hits, the
Greek keyboard, Beta Code, running text, saved searches, the forms panel, the
grammar grid, the word card, the count fixes (#107), the whole-section view
(#108).

Aristotle's own search (`shared/components/Search.svelte`, 3,849 lines;
`shared/lib/search.ts`, 1,625) lacks most of that. Measured 12 Nov: Plato's
`Search.svelte` is 5,440 lines and differs from Aristotle's by 6,393 changed
lines; 15 of Plato's lib files have no Aristotle counterpart (citation,
corpus-tools, form-panel, greek-keys, inscription, numerals, paired-hit,
popup-class, result-views, running-match, running-text, running-text.worker,
saved-searches, sect-ticks, speaker-colors, speakers); the shared ones differ
by 8 to 1,572 lines (search.ts 1,472, works.ts 1,572, data.ts 797).

Two ways in:
- **(a) Adopt and reconcile (recommended).** Make Plato's stack Aristotle's
  search: move it into `shared/lib` and `shared/components`, then put back
  every Aristotle-only hunk file by file (Bekker citation and line numbers,
  the works registry and `authenticity`, the PR #194 accent fixes, `lineRef`,
  SVG figures in the sanitizer, anything `git log -p main -- shared/lib/search.ts`
  shows that Plato lacks). Port Plato's own tests with it
  (`~/Developer/plato-reader/shared/__tests__/`, 71 files; at least combo,
  running-text, search, search-url, search-pages, english-hit, paired-hit,
  saved-searches, greek-keys, betacode, form-panel) and keep every Aristotle
  test green. This matches what the mock-up shows and gives one lineage to
  port back to Plato later.
- **(b) Forward-port Plato's PRs one by one** (#86 to #109, the order in
  memory `search-tlg-parity-track`) into Aristotle's files, then the redesign.
  Safer per step, many more steps, and every one must reach the same feature
  set anyway, because the design needs it.

Either way: memory `shared-is-copied-not-a-submodule` applies. Nothing that is
Aristotle's may be lost silently. Plato's shared code has had two commits since
the spike (`5b2ce79844`, `2ac8ccb4b5`, part of speech for #109); Aristotle has no
`pos_table.json` yet, so part-of-speech search stays out (it waits for its own
port).

**D2. Branch and worktree. RULED (John, 12 Nov 13:30: parallel sessions now).** Cut `claude/search-build` from the tip of `claude/redesign-build` (the commit that adds this file, 12 Nov 13:40) in a new worktree: `git worktree add .claude/worktrees/search-build -b claude/search-build claude/redesign-build`, run from the main checkout. If the home and work-page session has committed since, that is fine; it all merges back. Reason: round 9 of the home and work pages is ruled but not built (HANDOFF-REDESIGN-BUILD.md), and another session builds it in redesign-build while this one builds search; one worktree each keeps them apart. **Styles:** both tracks would edit `shared/styles/b.css`. To keep the merge clean, put the search page's styles in a new file, `shared/styles/b-search.css`, imported by `app/src/pages/search.astro` only, and touch `b.css` only for a shared token or a line the search page cannot do without (say so in the commit message). Track A edits `index.astro`, `Landing.astro`, `poster-fit.ts`, `plates.json`, and the redesign gates; leave those alone. When search is done, merge `claude/search-build` into `claude/redesign-build`; the redesign goes to main as one PR. Nothing is pushed, merged, or deployed until John says so; commit only when he asks.

**D3. PR shape. RULED (John took the recommendation):** a commit and an Opus review per stage (§6), one PR at the end (half a redesigned search page should not go
live). If S1 works under the old search page by itself, it may go first; judge that after S1.

**This session (John, 12 Nov 13:29):** runs on Opus 5.5 at high effort; raise it for the S1 review if that review needs more depth, then drop back. It writes the briefs, reviews every diff and screenshot, and decides when a stage is done.

**Models (recommended to John 12 Nov 13:25; he took the defaults):** Codex `gpt-6.1-sol` writes; effort `high` for S1 (the engine reconcile, where a dropped Aristotle hunk fails silently), `medium` for S2 to S6. Escalate a stage to `gpt-6-astra --effort medium` only after Sol fails it twice. Opus reviews every stage.

## 3. Where the design lives

The source of truth is the **round 34 screenshots**, not the overlay code.

- Flip page (John's view of every round, tabs Desktop, Phone, Proximity,
  Sideways): https://claude.ai/artifact/B9pKNaLxdQHqVYbVCzzb8U (v27; opens on
  round 34; source `.redesign-shots/notes/d26/search/flip-menus2/`).
- Every menu and control opened, 57 states:
  `.redesign-shots/notes/d26/search/menus/m34/*.png`. Names: `d` desktop
  1152 wide, `n` proximity (`n05` phone), `p`/`q` phone 390×844, `s` phone held
  sideways 844×390. The list with captions is in `menus/m33/BRIEF-M33.md`
  (same states as round 34).
- The search page as a whole, 13 states: `.redesign-shots/notes/d26/search/round34/r34-*.png`
  (empty, Greek, English, proximity, phrase, whole section, options open, the
  guide page, dark, phone empty, phone Greek, phone dark, sideways).
- The overlay itself, for exact values only: `round8/r8.css` + `r8.js`, then
  `menus/m34/m34.css` + `m34.js` (about 2,500 lines of stacked overrides;
  each round copies the last and appends a commented block, so the LAST rule
  for a selector wins). **A sketch to read, never code to paste.**
- Reviews of each round: `menus/mN/{opus,codex}-review-mN.md`. Round 34 was
  not reviewed; it fixes round 33's own misses (handoff block "ROUND 34" in
  `.redesign-shots/notes/HANDOFF-REDESIGN-BUILD-archive-2026-11-12.md`).

All paths above are under
`~/Developer/aristotle-reader/.claude/worktrees/redesign-build/`.
`.redesign-shots/` is untracked and must stay so: never `git add` it.

Scores at the end (Opus, Codex): search page 9, 9; desktop menus 9, 9; phone
menus 8.5, 8.5, flat for rounds 31 to 33. Both reviewers said the phone's
remaining faults are scroll structure that an overlay cannot fix and the
Svelte build can (§5.9).

## 4. Rulings that bind (John's; do not undo)

From the decision rounds (the archived handoff `.redesign-shots/notes/HANDOFF-REDESIGN-BUILD-archive-2026-11-12.md`, "Search
mock-ups" and "Round 7"), the artifact comments, and 12 Nov:

1. **Authentic works is a MUST**: "a works feature that toggles authentic |
   all works. simple. not hidden but not clutter… all works by default."
   Drawn as In: All works · Authentic works · Choose works… (§5.3).
2. Advanced is renamed **Proximity** and opens the editor in one click; no
   inner row, no chevron.
3. Menus open **flush under their trigger** (4px under the value's
   underline), with a **full outline all round** (the open trigger must not
   paint over the panel's top edge).
4. Proximity and Search are **one block pinned right** on desktop.
5. **Capitals is gone** (capitals always ignored). **Lemma** is a switch, the
   switch alone, no on/off word ("toggle is sufficient"); Accents is drawn the
   same way, desktop and phone.
6. **Keyboard**: Apple's Greek layout (ς ε ρ τ υ θ ι ο π / α σ δ φ γ η ξ κ λ /
   ζ χ ψ ω β ν μ), each row set half a key right of the one above; the seven
   mark keys on their own row, drawn large and centred over a bare ι
   (ἰ ἱ ί ὶ ῖ ϊ) and ῳ; foot row space, ⌫, Close; keys set in Literata (Sofia
   Sans has no polytonic Greek; its fallback put the marks beside the letter).
7. Keyboard and Beta Code are **quiet tools**, not chunky buttons.
8. **Proximity editor**: any number of terms; each term a word as written,
   any of its forms, an exact phrase, or a grammatical description; each
   placed Near, Before, After, or Not near a term; window in words or the
   same line; an order lock. Term 1's row carries the distance, right of Kind
   (desktop). No semicolon after term 1 (dropped 12 Nov 06:46).
9. **And / or on terms** (John's comment, 12 Nov): "or" is inclusive.
10. **Term-to-term relations** (John: "proximity to second word is a very
    useful feature"): a term may be measured from any earlier term, not only
    term 1.
11. The **summary is one sentence** ("three separate lines takes up too much
    space").
12. The **word panel must not cover results**: it takes the rail's column on
    desktop (option a; all three reviewers chose it).
13. Phone: **Options is a quiet underlined link; Search a smaller red
    button**.
14. Design is collaborative except where John says NOT THIS or MUST HAVE
    THIS (memory `design-calls-are-suggestions`).
15. **Running text is in** (12 Nov 16:53): port Plato's running-text search
    whole, pipeline included (done as S1b).
16. **No gloss line above the results** (12 Nov 17:53): the old page's
    "word: meaning · Lexicon" line stays out; the word panel covers it.
17. **Page breaks: the chapter rule stays, with chapter name lines**
    (12 Nov 18:02, option A on the decision page
    https://claude.ai/artifact/CEmX4yFRkqPk45sBUfme3U): a page never splits a
    chapter; each chapter's hits get a name line ("Chapter 13" plus its title
    where the corpus has one), so a page that ends short ends at a chapter.
    S4.
18. **Translator names under the English** (12 Nov 18:36, John's idea, from the
    Lyceum Presocratics reader's `seg-trans-toggle`): a passage several
    translations hit is ONE instance, Greek once, ONE English shown; under it the
    names of the translators with hits ("Rackham · Ross · Ostwald · Peters"),
    the label's small capitals, chosen one bold and underlined, others `--mid`;
    clicking a name shows that translation with its hits. No buttons drawn. A
    single translator's name sits in the same place. Names set close under the
    English, more room before the next passage. Phone: full label size and a
    44px tap area. First shown: the Translations rail's order. S4. (Opus also
    suggested the same names for a Greek hit's English, all translations of the
    passage; not yet ruled.)

Standing rules from memory: **never shrink type or tap targets** (one reader is
vision-impaired and reads on a phone held sideways); **no explainer text in
the reader** (labels, refs, numbers, and the texts; the menu glosses are the
agreed exception); 14px floor for phone labels; the design bar is the Vase,
nothing that looks machine-made (memory `design-bar-is-the-vase`).

## 5. The design, part by part

Tokens are the site's (`shared/styles/b.css`): light `--bg #f4f4f1`, `--ink
#141413`, `--mid #5d5c57`, `--line #d9d8d2`, `--red-ink #b42419`, `--hl
#f3e2a4`; dark `--bg #121211`, `--ink #ecebe6`, `--mid #a7a59e`, `--red-ink
#ff7b70`, `--hl #5a4917`. Type: Oswald 700 uppercase for titles, Literata
(`--read`) for reading text and Greek, Sofia Sans (`--sans`) for labels and
controls. Breakpoint 960/961px; sideways = ≤960 wide and ≤500 tall.

### 5.1 Search form, desktop (d01, d26, r34-01, r34-02)

- One big query field, Literata, magnifier at left, placeholder "e.g. τέχνη".
  At its right on the same rule: Keyboard (keyboard icon + label) and Beta Code
  (β + label), quiet text-weight tools. Then the Greek · English · Both
  segmented control.
- Options row under it: `Match all words ▾` · `Form any form ▾` · `Accents ○`
  · `Lemma ○` · `In all works ▾`; at the right, `Proximity ▾` and the red
  Search as one block. Labels `--mid`, values `--ink` with a hairline
  underline and a caret one space after the word.
- A wildcard hint line under the field when empty ("* any letters · ? one
  letter · texnh → τέχνη"); hidden while the proximity editor is open.
- **Both** (d20): two fields (Greek, English) and three option rows: Greek
  match, Greek form, Accents, Lemma; English match, English form; Hits match,
  In, then Proximity and Search at the right. Every row inside the 1080px
  content edge; labels never wrap.

### 5.2 Menus (d01, d02, d11, d14, d15, d16, d30)

Each menu: outlined panel flush under its trigger; a small caps title (the
control's name: MATCH, FORM, IN, GROUP BY, SORT, CONTEXT, PER PAGE); radios,
each with a one-line gloss under its label; a veil over the rest of the page
(light `rgba(244,243,238,.88)`, dark `rgba(20,20,19,.88)`); the trigger stays
above the veil at full ink. Glosses, exactly:

| Menu | Choice | Gloss |
|---|---|---|
| Match | All words | every word, anywhere in the passage |
| | Any word | at least one of them |
| | Exact phrase | these words, in this order |
| Form | Any form of this word | ἀρετή finds ἀρετῆς and ἀρετάς (Greek in Literata) |
| | Only as I typed it | this spelling and no other |
| | Running text | λογ finds λόγος and ἀναλογία |
| In | All works | dubious and spurious included |
| | Authentic works | the 31 authentic works only |
| | Choose works… | pick works from the list (set off by a rule) |
| Group by | By work | a heading for each work |
| | By form | each spelling apart |
| | By grammar | case, number, tense, and so on |
| Sort | Bekker order | page, column, and line |
| | Works A–Z | by title |
| | Forms A–Z | by spelling |
| | Commonest form first | the biggest group on top |
| Context | 1 line | the line with the hit |
| | 3 lines | a line either side |
| | Whole section | the section the hit is in |
| Per page | 20, 40, 100 | (none) |
| | Citations only | places, no text |

### 5.3 In and the works picker (d30, d31, d05, q13, q03)

- In is a menu like Match. **All works** is the default (no `w` param).
  **Authentic works** = the 31 works whose `authenticity` in
  `shared/lib/works.ts` is unset or 'genuine' (the field is optional; 3 are
  'dubious', 13 'spurious'). Derive the list from that field; never hard-code
  it. (The mock-up used
  `w=-Oec,MM,Prob,VV,DM,Mech,Col,Phgn,Plant,MXG,Aud,Lin,Spir,Vent,Mirab,RhetAl`;
  a named value such as `w=auth` is cleaner if search-url allows; check old
  links still work.)
- **Choose works…** opens the works picker. While it is open, In shows its
  open state (value underlined in red, caret turned up).
- Picker: "46 of 46 works", Select all, Clear, Done; a "Find a work" field;
  tabs All · Authentic 31 · Dubious 3 · Spurious 13 (the tab Plato calls
  "Genuine" reads "Authentic" here); groups with "Only these N" and "Add these
  N" on the heading's edge.
- The value reads "all works", "authentic works", or the picked label.

### 5.4 Switches, Lemma, Beta Code, keyboard (d03, d07, d08, d18, d19, p05, s02)

- Accents and Lemma: the switch alone, no state word, desktop and phone.
- Lemma on: the box asks for a dictionary word (placeholder "a dictionary
  word, then pick it below"); the suggestion list opens at once, captioned
  "Dictionary words", each row headword, gloss, count.
- Beta Code on: typing `a)reth/` shows ἀρετή as you type.
- Keyboard: §4.6. Desktop: a panel centred under the field. Phone portrait: a
  sheet at the screen foot, 6px gutter each side. Sideways: the keys meet the
  search row (sheet from about 70px down), 54px rows; the summary and results
  hide behind it, so no half-cut line shows.
- On the phone the active tool's red underline must clear the label's
  descenders (the mock-up lifted icon and label 4px).

### 5.5 Proximity editor, desktop (d06, d09, d10, d28, n01 to n08)

- `Proximity ▾` opens it; open trigger: red underline, caret up; a red dot
  before the word when a proximity search is live.
- **Summary**, one sentence in Literata, the same grammar everywhere:
  "ἕξις near ἀρετή, ἡδονή before ἀρετή, within 10 words". "Any form of" is
  the default and is dropped; other kinds are named ("any genitive plural near
  ἀρετή"); not near reads "λύπη not near ἀρετή"; an or-group reads "either ἕξις
  or ἡδονή near ἀρετή"; add ", in authentic works" (or the In value) when In
  is not All works. Under it: Turn off · Close · Guide (Change instead of Close
  when the editor is shut).
- **Grid**: columns 300px · 168px · 130px · max-content · 1fr, gap 28px.
  Column heads on TERM 1's line: TERM 1, RELATION, KIND, DISTANCE (12px caps
  Sofia, letter-spacing .08em, `--mid`). Term 1 has no relation (blank, no
  dash).
- **A term**: a chosen word shows the headword (Literata), its count, and
  Change, with the gloss in italic below; an empty term shows a field with an
  example placeholder ("e.g. ἀρετή", "e.g. ἕξις", "e.g. ἡδονή", "e.g. λύπη").
- **Term 1's row**: Kind, then Distance "within [10] [words ▾]" on Kind's
  baseline.
- **Terms 2 on**: a head line "and ▾" (or "or") then "TERM n"; the row has
  the relation (near, before, after, not near) in a fixed 82px sub-column so
  the next select lines up on every row, then the term it is measured from,
  named by its word ("near ▾ ἀρετή ▾"); Kind; and Remove (red-underlined) in
  an unheaded column at the right edge.
- **Or-groups** (n07): a 2px ink bar at the content edge beside the joined
  terms; their word column indents 14px (the other columns stay aligned); the
  or-joined term's relation reads "as term 2".
- **Grammar terms** (n06, n08): Kind "by grammar"; the term reads "genitive
  plural"; every category shows at once as rows of choice chips, two columns
  (CASE nom gen dat acc voc · NUMBER sg pl dual · GENDER masc fem neut · TENSE
  pres imperf fut aor perf plup fut perf · MOOD ind subj opt imper inf part ·
  VOICE act mid pass mid/pass · PERSON 1st 2nd 3rd · DEGREE comp superl
  irreg); the chosen chip filled ink.
- Add term (link); "In this order" checkbox, replaced by the line "Order set
  by before or after" when any term says before or after.
- The editor's own red Search at its foot. **Pending state** (d28, n07, n08):
  an edit is not searched until Search is pressed. When the editor differs
  from what was searched: the summary is prefixed "LAST SEARCH ·" (caps,
  `--mid`) and kept at `--mid`, not faded; beside the editor's Search, "Not
  searched yet: <the new sentence>" in Literata; the results dim together.
- With the editor open: one Search (the editor's; the top one hides). Match
  and Form step back (opacity .78); In stays at full ink, since it applies.

### 5.6 Results, desktop (r34-02 to r34-07, d11 to d17, d21, d23 to d25, d27)

- **Rail** (left, 264px): the count (Oswald, red) and "instances" ("1
  instance" singular); Save search (outlined button; after a click "Saved ✓"
  and a link "In Saved searches"); "Export results as CSV"; WORKS WITH HITS
  (by count) and FORMS lists in their own scrolling boxes; the chosen work is
  an ink bar with 12px inner padding and a 20px ×; unticking a form shows "of
  967 · restore all forms" under the count and Deselect all under the list;
  TRANSLATIONS by count.
- **Toolbar**: Group by, Sort, Context, Per page menus (§5.2), then the pager
  "Page 1 of 28" with ‹ ›.
- **Group heads**: work titles in Oswald uppercase with "N instances" and a
  fold chevron (d25 shows a work folded). By form: the forms as the head,
  "ἀρετὴ · ἀρετή · ἀρετῇ", with each dot kept on the line of the form after
  it (a no-break space after the dot, never before). By grammar: "6 analyses
  ▸".
- **A hit**: Bekker reference in the left column; the Greek snippet in
  Literata with the hit washed `--hl`; the English under it with the
  translator's name; "Show the whole section".
- **Word panel** (d24): clicking a hit opens the word's card in the rail's
  column; the clicked word stays marked. It must say "across Aristotle"
  (the port printed "across Plato", a bug).
- **Citations only** (d17): places only, no text.

### 5.7 Phone (p01 to p06, q01 to q13, n05, r34-10 to r34-12)

- Field with Keyboard and Beta Code (icon over a 14px label) on its line;
  Greek · English · Both full width under it; then "Options ▾", "Proximity ▾",
  and a smaller red Search.
- **Options** open as a two-column grid: Match, Form / Accents, Lemma / In.
- A **summary line** under the row ("all words · any form · accents ignored ·
  in all works"); changed display settings in red ("grouped by grammar").
- Menus get the same veil as the desktop.
- **Results bar**: the count with "instances" (14px), Save, the pager ‹ 1/28
  ›, Filter, View (icon over a 14px label); a red dot on View when the view
  is not the default.
- **Filter sheet** (p03, q07, q08): Works and Forms as nested sheets ("‹
  Filter" back, the sheet's name as title); a Done foot band.
- **View sheet** (p04): title VIEW and Close; Group by three across; Sort two
  by two ("Commonest form" here); Context three across; Per page 20 · 40 ·
  100 across, Citations only below; Export results as CSV; Done. Everything
  fits above Done at rest on a 390×844 screen; no glosses in this sheet.
- **Proximity editor** (q05, p06): the summary leads with the distance
  ("within 10 words: ἕξις near ἀρετή, ἡδονή before ἀρετή"), two lines at
  most; Turn off · Close · Guide; every term has its TERM n name (term 1 too);
  each control carries its name above it (RELATION, KIND, DISTANCE); term 1's
  Kind and Distance share a row; terms 2 on: the joiner at a fixed 64px, then
  TERM n; field or word; RELATION (relation + target) | KIND | Remove. The
  editor's Search sits in a foot bar pinned to the screen bottom, and the
  editor has bottom padding of the bar's height so its last row scrolls clear.
  (The page frame is a CSS container, so `position: fixed` inside it pins to
  the frame; the mock-up appended the bar to `body`.)
- **Word sheet** (q09): a bottom sheet with a top rule only, at most 45% of
  the screen: headword, Close, "from" lemma, gloss, parse, Show LSJ
  definition, "Appears N× across Aristotle →".
- **Sideways** (s01, s02, r34-13): one row: field, Keyboard, Beta Code,
  Greek ▾, Options ▾, Proximity ▾, Search; options open as one row under it.

### 5.8 Dark theme (r34-09, r34-12)

Same layout on the dark tokens; the hit wash is `--hl` (dark amber); switch
tracks keep an outline.

### 5.9 What the overlay could not do and the build should

From the reviews of rounds 21 to 33; not rulings, and judge each against the
screenshots:
- Sheet scroll areas that end above their fixed foot bars, so no row is ever
  half hidden behind a bar.
- Match and Form as bottom sheets on the phone, with the Filter sheet's veil,
  head, and Done band (an overlay attempt turned them into floating popovers
  and was reverted).
- One fixed home for Keyboard and Beta Code on the phone (today they drop
  under the field when the query is long).
- The proximity editor's height on the phone.

## 6. Build plan

Each stage: Codex implements to a brief; Claude reviews (diff against the
brief's blast radius, tests re-run outside Codex's sandbox, screenshots
against round 34 in both themes); fix; then the next stage.

- **S0. Set up.** D1 to D3 answered. New worktree (D2). `node_modules`: clone
  with `cp -cR` (memory `smoke-in-a-worktree`). Data: link
  `app/public/data -> ../../build/dist` and point `build/dist` at
  `~/Developer/aristotle-reader/.claude/worktrees/redesign-build/build/dist`
  (as the throwaway worktree does; read-only, never write there). Node 22
  (`~/.nvm/versions/node/v22.23.1/bin`). Baseline: `cd app && npm test`, `npm
  run check` if present, `node scripts/check-redesign.mjs`, and
  `PUBLIC_SHOW_PRIVATE=0 npm run build`; record the counts.
- **S1. Engine** (D1). Done when: every Aristotle test passes; the ported
  Plato tests pass; a fixed query set gives the same hit counts on the new
  build as on the throwaway port at :4342 (write the script; queries at least:
  ἀρετή any form; virtue English; ἀρετή ἕξις any word; τὸ τί ἦν εἶναι
  phrase; ἀρετή near ἕξις within 10; ἀρετή with accents observed; λογ running
  text; a genitive plural near ἀρετή; In authentic works). Counts the throwaway
  port gets wrong (§7) are listed, not copied.
- **S2. Search form and menus** (§5.1 to §5.4).
- **S3. Proximity editor and its engine** (§5.5, §7 engine items 1 to 3).
- **S4. Results, rail, word panel** (§5.6).
- **S5. Phone and sideways** (§5.7, §5.9).
- **S6. Guide page** (`app/src/pages/advanced.astro`; reword the Beta Code
  section, which is Plato's text, "type the sounds").

**Screenshot gate.** The shooters are
`.redesign-shots/notes/d26/search/menus/menus.mjs` (57 states) and
`.../search/shots.mjs` (13 states). Both inject the round 8 overlay and
point at :4342; copy them to a `build-shots.mjs` that takes a base URL and
injects nothing, then shoot the new build at the same states and sizes and put
each beside its round 34 twin. A state may differ only where §5.9 or a John
ruling says so. Shots must wait for `document.fonts.ready` (an early capture
lost Oswald and Sofia Sans and the reviewers scored the fallback).
`d04-case-on` and `d22-works-more` no longer exist; skip them.

**Other gates** (CLAUDE.md): `npm run build:public` at the repo root passes
every gate; link integrity reports 0 broken; `/bonitz` stays 404; the deploy
leak check passes. Svelte component `<style>` blocks may not reach reader
pages; keep styles in `shared/styles/b.css` or `global.css` and check the
built page (memory `svelte-styles-dead-in-built-site`). Svelte 5 tests: mock
`lib/data` rather than `vi.resetModules()` (CLAUDE.md).

## 7. Engine and data work

The design needs these; the mock-up only drew them.
1. **Or-joins.** `searchCombo` in `shared/lib/search.ts` requires every slot.
   Or-joined slots must merge their hit lists into one slot before
   `comboWindows`. The URL needs a form for it (the mock's slots are
   `c=l:areth`; add a joiner per slot; old links must still open).
2. **Term-to-term relations.** `comboWindows` measures every slot from slot 0.
   Each slot needs a target index and a pairwise window check, and the URL a
   target per slot.
3. **Not near** (URL letter `n`, Plato's port list) and the order lock rule:
   with the lock on, only partner words after the anchor are marked.
4. **Authentic works** filter from `authenticity` (§5.3).
5. From the round 1 to 8 reviews, still open in the engine: Bekker line
   numbers inside an opened section; overlapping hits merged; page counts that
   break at group boundaries (ἀρετή shows 28 pages where 967 hits at 40 fill
   25); missing spaces where two sentences meet in a snippet
   ("λέγεταιὙπάρχει"); marks that take in the trailing space; English clamps
   cut mid-word with "..." where the Greek ends " …"; hits whose English an
   earlier hit showed carry none, with no sign why; an opened section's
   English starts a paragraph before its Greek (alignment is by section); the
   translations list has no "more".
6. Behaviours noted in the mock-up, to check in the build: observing Accents
   narrows to the exact spelling and drops the forms list while Form still
   says "any form"; grouping by grammar groups by form; Add term copies the
   last term; term 1 does not take the page's query; Citations only hides Group
   by, Sort, and Context, and drops line numbers; the phone query field cannot
   show a three-term search; the Filter badge counts display settings; the
   picker lists 46 works where the site says 47.
7. Hidden for want of Aristotle data (leave hidden): "Spoken by", turn data,
   the part-of-speech row of the grammar grid, accented spellings in the forms
   panel (accentless spellings show, and one spelling can appear under two
   lemmas).

## 8. After the build: John's open questions (tweaks, not blockers)

1. One Search or two while the proximity editor is open (Opus wants the top
   one kept beside Proximity).
2. Phone: Keyboard and Beta Code stay on the field's line with the query
   scrolling, or drop under it for a long query (today: drop; I lean to that,
   for the reader who needs to see the whole query).
3. The View sheet's Close and Done: choices apply at once, so the labels
   might say so.
4. Short descriptions in the phone sheets, against "no explainer text".
5. Rail lists: "15 more" link (round 8) or the scrolling box with a fade
   (now).
6. "Any form" renamed "every form of the word" (asked, not answered).
7. Citations only in Context rather than Per page (Opus).

## 9. Housekeeping

- Mock servers (only for the side-by-side; not needed to build):
  `cd .claude/worktrees/search-port-mock/app && PUBLIC_SHOW_PRIVATE=0 npx astro dev --port 4342`
  and Plato's `cd ~/Developer/plato-reader/.claude/worktrees/search-mock/app && PUBLIC_SHOW_PRIVATE=0 npx astro dev --port 4341`,
  Node 22. The throwaway port is backed up in
  `.redesign-shots/notes/d26/search/search-port-mock-backup-2026-11-12/`
  (`tracked.patch` against `BASE`, plus `shared-psearch.tgz`).
- Probe helper: `.redesign-shots/notes/d26/search/menus/tools/xprobe.mjs
  <round> <WxH> <path> <steps-file|''> <expr>` loads a round and prints a page
  expression.
- Budget: read the SessionStart board; Codex is the implementer, Opus the
  reviewer; ping John at 90% on any model.
- CLAUDE.md's list of live handoffs does not name this file yet; the main
  checkout's CLAUDE.md had another session's uncommitted edits on 12 Nov, so
  add the line when that is settled.
