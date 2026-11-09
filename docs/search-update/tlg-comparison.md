# Search: TLG (new site, 2026) against ours

Written 2026-11-09. Sources:
- TLG's own help pages (text_simple, text_proximity, wildcard, ngrams, statistics, lexica, vocabulary, saved_searches, browser, par_browser, canon), read in full.
- A live session in the Abridged TLG (`/Iris/demo/new/`). It is the same engine as the full corpus, with fewer texts.
- John's 13 screenshots of the full site.
- Our code on `main`, plus the search diff on `claude/redesign-build`. An agent inventoried it file:line, and I spot-checked the claims below.

UI looks are out of scope here, because the redesign is being built now. "UI" below means how a feature *works* for the user: where a control lives, what it does, what it remembers. It does not mean styling.

---

## 1. What TLG offers

### 1.1 Text Search: three tabs

| Tab | Term types | Options shown | Notes |
|---|---|---|---|
| **Simple** | Word Index · Lemma · Textual | Case Sensitive, Exact Match, Diacritics Sensitive, Wildcard. Textual adds Non-alphab. chars and Adscript as subscript. | **The option set changes with the type**: Lemma hides Exact Match and Wildcard. A phrase can be typed straight in. |
| **Proximity** | One type for all three terms: Word Index, Lemma or Textual | The same as Simple, by type | Up to 3 terms. "Within N words" (max 50) sits on term 1. Each later term has **and / or / not** and **near / before / after** (relative to the term before it). |
| **Advanced Proximity** | **Each term chooses its own**: Word Index, Lemma or **Grammar** | Case, Diacritics, Exact (WI only), Wildcard (WI only) | A Grammar term is a multi-check grid (below) and needs no word. Results come as a list only, with no Per Word, By Author or Grammar views. |

**Grammar grid** (Advanced Proximity), which needs no word:
- Part of speech: Noun, Adj., Verb, Article, Pron., Num., Adv., Prep., Particle.
- Gender: Masc., Fem., Neut.
- Case: Nom., Gen., Dat., Acc., Voc.
- Number: Sg., Dual, Plural.
- Degree: Pos., Comp., Superl.
- Person: 1st, 2nd, 3rd.
- Tense: Pres., Imperf., Fut., Aor., Perf., Plup., Fut. Perf.
- Mood: Indic., Subj., Opt., Imper., Part., Infin.
- Voice: Act., Mid., Pass., Mid/Pass.
- A Reset link clears the grid.

**Input** (one menu for every tab):
- Greek, Beta (the default) or Transliteration.
- An on-screen polytonic keyboard: letters, rough and smooth breathing, the three accents, diaeresis, iota subscript, punctuation, backspace, clear, space.

**Lemma autocomplete:**
- A live list appears as you type. It ignores accents (`DEI=` brings up δεῖα and δεῖγμα).
- Up to 50 entries, in alphabetical order.
- Each entry shows the dictionary headword with its genitive and article, e.g. "αἰτία, -ας, ἡ".
- You have to pick an entry, which pins the lemma id.
- Observed: fast typing gets HTTP 503s on the in-between requests.

**Wildcards** (Word Index and Textual): full regular-expression syntax.

| Syntax | Meaning |
|---|---|
| `^` and `$` | Start or end of a word (Word Index), or of a line (Textual) |
| `[AE]` | One of the letters listed |
| `[^U]` | Any letter but these |
| `.` | Any one character |
| `a\|b` and `( )` | Alternatives, grouped with parentheses |
| `?` `*` `+` | The thing before is optional, repeats zero or more times, or repeats one or more times |
| `[0-9]` | A digit |

Beta Code's special characters must be escaped with `\`.

**Textual** works character by character over the running text. So it can find:
- part of a word,
- a run across word boundaries,
- punctuation,
- Beta Code escapes.

It is slower than the word index.

### 1.2 The results page

Toolbar:
- **Display results**: As a List · Per Word · By Author · **Grammar**.
- Cite this search · Save this search · Export to CSV · Print.
- Previous and next page.

The settings gear holds five controls:

| Control | Choices |
|---|---|
| Lines of context | 3 (default) / 5 / 7 / 10 |
| Display | Greek / Beta / Raw Beta |
| Sort | Author # / Date (earliest) / Date (latest) / Case (upper) / Case (lower) |
| Links | Active / None |
| Results per page | 10 / 20 / 50 / 100, or 200, 500 or 1000 as citations only |

A hit carries:
- the full citation: author, work, TLG id, then the structural position (e.g. "Book 1 chapter 23 section 5 line 2");
- a **booklet** that opens the bibliography;
- a **magnifier** that opens the passage in the text browser, in a new tab;
- a **preview snippet** modal of about 20 lines.

Two kinds of highlighting:
- the matched word,
- and for proximity searches, **the whole span from term to term in yellow, with the terms themselves in orange**.

**Every word in every hit can be clicked.** It fills a **Morphology** panel in the sidebar with:
- the form,
- the lemma,
- every possible analysis,
- "Show entry in:" links to LSJ, Middle LS, Lampe, Kriaras, Triantafyllides, Cunliffe, Slater and Powell, as the lemma allows.

The right sidebar stays on screen while you refine:
- **Search In**: limit to an author (autocomplete).
- **Search Results**: the count, then a **per-form list with counts and a checkbox each** ("λόγος (11319)", "λογος (340)"), Deselect All, and Go to search again with only the ticked forms. In proximity searches each term has its own list.
- **Per Word**: the same list, each form a link.
- **By Author**: the authors, each with a count.
- **Grammar**:
  - Results are grouped under one heading per distinct form, so ΑΙΤΙΑ, αἰτίᾳ and Αἰτία each get their own.
  - The sidebar shows facet checkboxes built from the result set; for αἰτία, gender, number and case only.
  - "Show grammar" prints each form's analyses under it, with a dialect tag.
  - Choosing Genitive and pressing Go took the count from 6,195 to 1,871.

Test run in the Abridged TLG:

| Search | Count | Breakdown |
|---|---|---|
| Lemma αἰτία | 6,195 hits | 18 forms; Aristotle 743 |
| The same, filtered to Genitive | 1,871 hits | — |

Weaknesses seen on the live site:
- **The grammar filter works on forms, not on each occurrence.** Genitive kept αἰτίας throughout, including Thuc. 1.23.5 τὰς αἰτίας, which is accusative plural. The tool cannot tell which reading holds at a given place. **Ours has the same limit** (section 3.4).
- Moving to By Author **reset** the grammar filter (1,871 went back to 6,195).
- The search state lives on the server, and the URL holds only a step number (`#cat=simple&s=4`). Nothing in the URL describes the query, so it is not a link anyone else can open. This is inferred from the URL; I did not test it in a second browser.
- "Cite this search" gives only a generic citation of the TLG database: no query and no link.
- Advanced Proximity results lack the Per Word, By Author and Grammar views.
- The page script (`tsearch.js`) suspends accounts after "a large number of hits". I kept the live test to about eight searches.

### 1.3 Other TLG tools that touch search

| Tool | What it does |
|---|---|
| **Canon** | Search authors and works by date, genre epithet, place and work class. Ticking works builds a custom corpus that is sent on to Text Search. |
| **Browser** (one text) | Tabs: Morphology/Lexica (click a word) · **N-grams Lemma / N-grams Wordform** (click in the text, see where else the sequence occurs, sortable, with page size and context lines) · Statistics (click a word, see its lemma's spread). |
| **Parallel** | Two texts side by side · Highlight similarities (shared n-grams) · Compare editions (differences highlighted). |
| **N-grams** | Compare any two texts by shared content-word trigrams or bigrams, by form or by lemma, skipping stop words. |
| **Statistics** | Full corpus / Author / Lemma views.<br>Lemma: raw and *relative* (actual against expected) distribution by century, author and work, plus a map.<br>Author: over- and under-represented lemmata, the most frequent forms and lemmata, and lemmata found only in that author. |
| **Vocabulary** | For an author or work: the lemma list with counts (each expands to its forms), the form list, and flashcards with definitions. |
| **Lexica** | Pick a lemma; the left pane gives its analysis and the dictionaries it is in, and the right pane shows the entry. You can switch dictionaries without leaving the page. |
| **Saved searches** | Stored in the account, with Restore, a note, Edit and Delete. Canon and text searches are kept apart. |

---

## 2. What we have (main, 2026-11-09)

Simple search page (`/search`, `shared/components/Search.svelte` + `shared/lib/search.ts`):

- **Greek box:**
  - Lemma by default, so every form of every headword the typed word could belong to.
  - Or "Only as I typed it", which searches forms (`m=form`).
  - All words / Any word / Exact phrase.
  - **A phrase works in lemma mode**, and the "Find this phrase in any inflection" button spreads a phrase across every headword reading.
- **English box:**
  - Every translation a work carries, each labelled with its translator.
  - "Any form" adds plurals, possessives and irregular forms.
  - All / Any / Phrase.
- **Greek and English** can be combined with and / or.
- **Wildcards**: `*` (any run of letters) and `?` (one letter), inside or at the end of a word. Greek allows **no leading `*`**, because it is Beta Code's capital marker, so there is **no suffix search in Greek**.
- **Input**: Greek or Beta Code. Plain Latin letters work only as far as they are Beta Code letters, so `logos` works but `theos` does not. The "Type Greek" button opens a **chart** of Beta Code, not a keyboard.
- **Accents**: everything is folded by default. "Match accents exactly" filters afterwards, and only in the simple Greek box.
- **Filters:**
  - work chips, grouped by division, with "only" and "+ add";
  - an authenticity pill (genuine, dubious, spurious);
  - after a search: work chips with counts, and translator chips with counts.
- **Results:**
  - Grouped Work → Book → Chapter, in Bekker order.
  - About 40 hits a page, breaking only at chapter edges.
  - Context fixed at 8 Greek words either side, or 140 characters for English.
  - Exact-line links that **highlight the very token** in the reader.
  - CSV of the whole result set.
  - **The whole state lives in the URL**, so links can be shared and Back works.

Combo search (the same page):
- 2–4 slots. Each slot is a Phrase, a Form, a Lemma (headwords ticked, combined with "or") or a **Grammatical** term.
- Window of 1–50 **words**, or **the same line**, or **the same chapter**.
- An "in this order" lock, or near / before / after for each term.
- A switch for whether a hit may cross a chapter.
- Grammar categories: case, number, gender, tense, mood, voice, person, degree, and word class (adverb, particle, preposition, conjunction, interrogative, exclamation, indeclinable, numeral, letter).
- Ambiguous parses show as "one of N readings".

Elsewhere on the site:

| Feature | What it does |
|---|---|
| **Single-lemma picker** (`l=`) | Prefix autocomplete over `lemma-picker/`, showing the headword, count and a short gloss, top 30 |
| **Phrases** (`/phrases`) | 2–5-word n-grams by form, by lemma or in English, ranked by distinctiveness (count × log₂ of actual over expected), frequency, length or alphabet. Filter by work. Occurrences link into the reader. |
| **Lemma pages** (`/lemma/<slug>`) | Count, spread across works with drill-down to each instance, a distinctiveness line (Aristotle against earlier and contemporary writers), and LSJ |
| **⌘K palette** | Jump to a Bekker citation, a work, or a lemma page, or hand off to search |
| **Word popup in the reader** | Every analysis, a gloss, LSJ, and a link to the lemma page |

On `claude/redesign-build`, search gains section citations for the Ath. Pol. model ("49.3"), and nothing else.

---

## 3. Side by side

### 3.1 Where we match or beat TLG

| Feature | TLG | Ours | TLG's UI is better at… |
|---|---|---|---|
| Word-form search | Word Index | `m=form` | Showing the result's **form list with counts** next to the hits |
| Lemma search | Pick from autocomplete | The default; a typed form spreads to every possible headword | **Autocomplete in the main box**, with dictionary-style headwords ("αἰτία, -ας, ἡ"). Ours exists only in the pickers. |
| Phrase | Word Index or Textual | Form **and lemma** ("in any inflection") | Nothing: ours is stronger |
| Proximity | 3 terms, words only, and/or/not | 2–4 terms; words, line or chapter; chapter-crossing switch; order lock | **Highlighting the whole span** plus the terms. TLG also has **NOT**, which we lack. |
| Mixing term types | Advanced: WI, Lemma or Grammar per term | Combo: Phrase, Form, Lemma or Grammar per slot | A Grammar term in TLG is a one-click grid; ours is a parameter string. Their headings also read as a sentence ("near first word"). |
| Grammar categories | POS + 8 categories | 8 categories + word class (conjunction etc.); **no noun/verb/adjective/article/pronoun** | POS. And TLG shows the categories **as facets on any lemma result** (Grammar view); ours exist only inside Combo. |
| Ambiguous parse | Filters by form, so it is silently too wide | Same data limit, but we **say** "one of N readings" | Ours is more honest |
| Diacritic sensitivity | A toggle, in every mode | A toggle, simple Greek box only, **and broken for Beta Code input** (3.4) | Works everywhere |
| Wildcard | Full regex | `*` and `?` only, no Greek suffix | Everything (3.2) |
| Scope | Author/work through the Canon; Search In after the search | Work chips before and after, authenticity, translator | Nothing big. Ours fits a single author better. |
| Results → text | The browser in a new tab | The reader **at the token, highlighted**, in a new tab | A **preview modal** (about 20 lines) without leaving the results |
| Export | CSV, Print | CSV (with URL column) | **Print view** |
| Citation | Generic | The URL encodes the whole query | Nothing: ours is stronger |
| Shareable state | Session step only | Full URL | — |
| Bilingual | Greek only | Greek + every English translation, and/or | — |
| Distinctiveness | Over-represented lemmata (Statistics) | Phrases ranking; distinctiveness on lemma pages | Actual-against-expected **charts** |
| Morphology | Click **any word in any hit** → sidebar panel | Reader popup only | Parse from the results page |
| Lexica | LSJ, Middle LS, Lampe, Cunliffe, Slater, Powell, Kriaras, Triantafyllides, Bauer, LBG | LSJ | Middle Liddell matters for us; the rest are outside Aristotle's period |

### 3.2 What TLG has that we lack

Grouped by how much each matters for reading Aristotle.

**High: closes a real research gap**
1. **A per-form list of the results, with counts and include/exclude checkboxes** ("λόγος 11319, λογος 340"). After a lemma search you see at once which forms carry the result, and you can drop a stray homograph's forms. We give per-work counts only.
2. **Grammar view on any result**: grouped by form, each with its analyses, and facet checkboxes (case, number, gender, tense, mood…) built from the result. "αἰτία, genitive only" takes two clicks there. Ours needs a Combo query.
3. **A grammar term alone**: "every aorist optative", "every neuter article followed within 2 words by an infinitive". Combo can do this only as 2+ slots, and has no POS.
4. **Real wildcards**: suffix search (`*ικός`, `ικος$`), letter classes, alternatives. Aristotle's coined -ικός, -ειδής and -τέον words need suffix search, and we cannot do it.
5. **Click a word in a hit → its parse and dictionary links** without leaving the results.
6. **NOT** in proximity ("φύσις near ἀρχή, not near κίνησις").

**Medium: convenience the TLG user will expect**
7. **Lemma autocomplete in the main Greek box.** We have the data (`lemma-picker/`) already.
8. **Transliteration input** (θ = th, φ = ph, χ = ch/kh, ψ = ps, η = ē, ω = ō, rough breathing = h) and **an on-screen polytonic keyboard**.
9. **Adjustable context** (3/5/7/10 lines) and an **inline preview** of more context.
10. **Sorting and page size**: per form, per work, by frequency; 10–100 per page, or a citations-only list for large result sets.
11. **Case-sensitive search** (proper names, sentence starts).
12. **A print view** of the results.
13. **Textual search**: character strings across word boundaries, punctuation, parts of words. This is the costliest item (section 4, phase 4).

**Low, or other tracks**
14. Saved searches with notes. We have no accounts; URL bookmarks cover most of this, and a local "saved searches with a note" list would cover the rest.
15. Statistics:
    - a lemma's spread by work and book, actual against expected;
    - per work: over- and under-represented lemmata, and lemmata found only in that work.

    The lemma pages hold part of this today.
16. Vocabulary tools: lemma and form lists per work, with counts. Flashcards.
17. N-grams:
    - "Where else does this phrase occur?" from the reader. The index already exists (`ngrams/`).
    - Comparing two works by shared n-grams.
18. More lexica: Middle Liddell. Bonitz's *Index Aristotelicus* is a better fit, and it is its own track.
19. Display as Beta / raw Beta; sort by date or by author number. These do not apply to a single-author corpus.

### 3.3 Where TLG's UI is better, in general

- **Refinement without re-querying.** The sidebar holds the form list, the facets and the author list beside the hits. You narrow by ticking, not by rewriting the query.
- **Controls that match the mode.** Options appear or vanish with the search type, so you never see a switch that does nothing.
- **Lemma suggestions that look like a dictionary.** "αἰτία, -ας, ἡ" tells you the word class at a glance.
- **Two-colour proximity highlight.** You see the distance as well as the words.

### 3.4 Defects found on our side

- **"Match accents exactly" + Beta Code input finds nothing.**
  - `grkAccentTerms` sends the raw typed string through `accentNorm` ([Search.svelte:1160](../../shared/components/Search.svelte)), so `lo/gos` is compared to the token λόγος and never equals it.
  - `betaToGreek` exists, but the search box never calls it.
  - I found this by reading the code; it has not been run. Fix: convert Beta Code to Greek before normalising, and write a test that fails first.
- The accent toggle does nothing in Combo or for a picked lemma (the code says so). TLG offers it in every mode.

---

## 4. Plan

Order, in one sentence: first the cheap fixes and refinement of the result set we already hold, which is where TLG feels most ahead; then query power; then the corpus tools; textual search last.

**Sequencing with the redesign.** Stage 4 of the redesign build (search) is paused mid-way in `claude/redesign-build`, and it restyles `Search.svelte`. Either:
- land stage 4 first, then start this track on the new markup, which I recommend;
- or limit phases 1–2 to `shared/lib/` and the pipeline until stage 4 lands.

Two lanes must not edit `Search.svelte` at the same time.

### Phase 0: fixes (one small PR)
- The accent toggle with Beta Code (3.4), with a test that fails first.
- The accent toggle in Combo slots and for a picked lemma.

### Phase 1: refine the result set (client-side; the postings are already loaded)
1. **Form panel.** For every Greek result:
   - a list of the forms found, with counts (and the headword, when a typed form maps to several lemmata);
   - a checkbox each, with *Deselect all* and *Apply*;
   - kept in the URL (e.g. `xf=` excluded forms).

   This beats TLG's: no new request, and the link stays shareable.
2. **Views:** By chapter (today's) · **By form** · **By work** · **Grammar**.
   - Grammar groups the results by form, prints each form's analyses (from `grammar-dict`), and builds facet checkboxes **from the categories present in the result**.
   - It reads `grammar-col.bin`, which every work already ships.
   - **Facets survive a change of view**, unlike TLG's.
3. **Click any Greek word in a hit** → the existing `WordPopup` card (parse, gloss, LSJ, lemma page), shown beside the results.
4. **Context:** 1 / 3 / 5 lines, or the whole sentence, plus an inline "more" control that expands the hit in place (no modal).
5. **Sort:**
   - Bekker order (the default) / by work / by form / by frequency of form;
   - page size 20 / 50 / 100;
   - a citations-only list for big results.
6. **Print stylesheet** for the results.
7. **Proximity highlight:** shade the span between the terms and mark the terms more strongly.

### Phase 2: query power
1. **A form-vocabulary file** (the corpus has 55,317 distinct folded forms) so wildcards can run over the whole vocabulary on the client:
   - `^` / `$` anchors, a **leading `*`** (suffix search, with a new escape for the Beta Code capital marker), `[ ]`, `[^ ]`, `|`, `( )`, `?` `+`;
   - matched forms are then looked up in the shards as usual.
2. **NOT** in Combo (a slot that must *not* fall in the window).
3. **A grammar term alone in the main search** ("every aorist optative"), plus **POS**: noun / verb / adjective / article / pronoun.
   - POS is not in `grammar-dict` today. `analyses.json` holds parse strings like "neut nom/voc/acc sg", which do not say noun or adjective.
   - So this needs pipeline work: take the word class from Morpheus's full output or from the LSJ headword. Size it before promising.
4. **Lemma autocomplete in the main Greek box** (reuse `lemma-picker/`; show the headword with its genitive and article where LSJ gives them, plus our count and gloss).
5. **Input:**
   - accept transliteration as well as Beta Code (a fixed mapping, shown on the page);
   - turn the "Type Greek" chart into a real polytonic keyboard that works by tapping (phone in landscape — big keys, per the vision-impaired-reader rule).
6. **Case-sensitive switch** (needs the token's case; the book text has it).

### Phase 3: corpus tools (beat TLG on its own ground, for one author)
1. **"Where else?" from the reader:** select 2–5 words → their occurrences from the existing `ngrams/` index, by form or by lemma.
2. **Compare two works:** their shared n-grams, side by side. This is TLG's *Highlight similarities*, using our index.
3. **Statistics on lemma pages:**
   - spread by work *and book*, actual against expected (per thousand words), with the most over-represented works;
   - per work: the lemmata most over- and under-represented against the rest of Aristotle, and lemmata found only in that work.
4. **Vocabulary per work:** the lemma list with counts, expandable to forms, linked to search.
5. **Bilingual hits:** under each Greek hit, the aligned English sentence (we hold the alignments). TLG cannot do this.
6. **Saved searches** kept in the browser (localStorage, wrapped in try/catch), each with a note, plus "Copy citation", which gives the URL and the date.
7. **Middle Liddell** beside LSJ in the word card (Perseus, CC BY-SA). Bonitz later, from its own track.

### Phase 4: textual search (only if wanted)
- Character search across word boundaries needs the running Greek text on the client.
- The book JSON is 72 MB with the English, so this means a new Greek-only folded text file per work. It could be built at the pipeline's stage 6, and its size measured before deciding.
- Run it on demand ("Search the running text, slower"), with a progress bar.

### Each PR's gates
- A test that fails first for every new matcher (wildcard syntax, NOT, form exclusion, facet filter). Each test must fail when the matcher returns nothing, so a gate cannot pass by examining no data.
- The link-integrity and preflight gates as now.
- A Codex review (cross-family) before merging.
- Screenshots in both themes and on a phone in landscape, for every change you can see.

### Decisions (John, 2026-11-09)

1. **The redesign's search stage lands first.** The search-page options (phase 1 and the controls of phase 2) are redone on the new markup once stage 4 is in. Phase 0 shipped ahead of it in this PR: it is two lines in `Search.svelte` plus `shared/lib`.
2. **Textual search: yes.** Build a Greek-only text file per work at pipeline stage 6 (phase 4). Measure its size before choosing how the client loads it.
3. **Part-of-speech search: yes.** Pipeline work to carry the word class (noun, verb, adjective, article, pronoun) into `grammar-dict` (phase 2.3). Size it from Morpheus's full output first.
4. **Saved searches: open.** The cost of keeping them in the browser is set out below.
5. **Middle Liddell: not now.** It waits for a full grammata t8 version of Middle Liddell. Bonitz is not a blocker.

6. **Every search upgrade is ported to the other readers afterwards** (plato-reader, homer).

#### What decision 6 means for how this is built

- `shared/` is copied into each reader, not linked. So porting goes hunk by hunk: a directory sync would overwrite each reader's own work.
- Keep each upgrade in `shared/lib/` and `shared/components/` wherever possible, so it ports as hunks, not rewrites.
- Nothing new may assume Bekker numbers. Use the citation helpers (`citeLabel` and the chapter.section scheme, both on main), so Plato's Stephanus pages and Homer's book.line work.
- Every new data file comes from a pipeline stage with a fixed format:
  - the form vocabulary for wildcards,
  - the Greek-only text for textual search,
  - the word class in `grammar-dict`.

  Each reader's pipeline must then emit the same file, and the PR says so.
- Each PR ends with a port note: which hunks, which data files, and anything specific to one corpus.
- The Phase 0 fixes in this PR (`betaQueryToGreek`, the accent fold) are the first to port.

#### What browser-only saved searches cost (decision 4)

A saved search would be the search's URL (which already holds the whole query, filters included), plus a name, a note and the date. They would be kept in the browser's local storage.

- **Build:** small, one PR. A Save control, a list panel with Open, Rename, Note and Delete, and every read and write wrapped so a blocked store never breaks the page.
- **What it costs the reader:**
  - The list lives in one browser on one device. Phone and laptop do not share it.
  - Clearing site data, or a private window, loses it with no warning.
  - The desktop app keeps its own, separate list.
- **Cheap mitigations:**
  - Export and import the list as a small file.
  - "Copy link" on each entry, since the URL is the portable form anyway.
- **What accounts would cost instead:** the site is static on GitHub Pages. Accounts mean a server, sign-in, a database, a privacy policy and upkeep, for one feature.
- **Recommendation:** browser-only, with export/import, and say on the panel where the list is kept.
