<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import {
    search,
    searchCombo,
    searchPhraseVariants,
    speakerRoster,
    greekFold,
    greekHitForms,
    greekHitGrammar,
    formAccents,
    patternPieces,
    patternMatcher,
    letterClusters,
    greekScript,
    englishQueryUnits,
    englishWords,
    COMBO_TERMS_MAX,
    COMBO_WINDOW_DEFAULT,
    COMBO_WINDOW_MAX,
    comboGroups,
    lemmaOptions,
    type ComboGroup,
    type SpeakerFilter,
    type SpeakerRosterEntry,
    type SearchMode,
    type LangOp,
    type MatchMode,
    type SearchResult,
    type GrammarQuery,
    type SlotKind,
    type ComboSlot,
    type SlotRelation,
    type ComboOptions,
    type WindowUnit,
    type EngHit,
    type HitForms,
    type HitGrammar,
    type Reading,
    type SearchOutcome,
    pool,
  } from '../lib/search';
  import { joinEnglish, searchRunningText } from '../lib/running-text';
  import { englishPlace, englishMarked, markEnglishHtml, markWordsHtml, plainEnglish, translationTexts, turnTranslationTexts } from '../lib/english-hit';
  import {
    pairGreekWindow, pairEnglishWindow, PAIR_GREEK_LINES, bekkerEnglish, pairContext, pairUnits, sectionEnglish, unitAtEnglish, unitAtGreek, unitEnglish, unitPieces,
    type PairIndex, type PairUnit,
  } from '../lib/paired-hit';
  import { AUTHENTIC_IDS, HAS_SPEAKERS } from '../lib/works';
  import { isChapterSection } from '../lib/data';
  import { loadOffsets, offsetRef, type Offsets } from '../lib/search';
  import { engHitCount, hitCount, paginate } from '../lib/search-pages';
  import {
    fetchBook,
    fetchChapters,
    fetchSections,
    fetchLemmaPickerShard,
    fetchLemmaGlosses,
    type BookData,
    type Segment,
    type Token,
    type ChapterRef,
    type SectionRef,
    type LemmaCandidate,
    type LemmaChoice,
  } from '../lib/data';
  import { WORKS, getWork, workPath, WORK_ORDER, SEARCH_GROUPS, searchableTranslations, type TranslationRef } from '../lib/works';
  import { formatCite, formatLocValue, schemeFor } from '../lib/citation';
  import { decodeSearchUrl, encodeSearchUrl, hasSearch, type UrlCombo, type UrlSearch } from '../lib/search-url';
  import { grammarWords, proximitySentence, proximityTerms, termWords } from '../lib/proximity-sentence';
  import { FULL, addSaved, findSaved, savedAvailable, summarizeSearch } from '../lib/saved-searches';
  import { betaQueryToGreek, betaToGreek, liveGreek } from '../lib/betacode';
  import { addMark, deleteBack, GREEK_MARKS, insertText, KEY_ROWS, type KeyEdit } from '../lib/greek-keys';
  import { formGroups } from '../lib/form-panel';
  import { lineRenderParts } from '../lib/speakers';
  import WordPopup from './WordPopup.svelte';
  import {
    ambiguityNote, compareForms, cutPositions, facetCounts, facetKeep, formatReading, formGroupsOf, grammarHitNote, hasFacets, orderHits, refine, withTicked,
    type Facets, type PageSize, type ResultContext, type ResultSort, type ResultView,
  } from '../lib/result-views';

  // Chapter titles, {work: {book: {chapter: title}}}, for the chapter name
  // lines (ruling 17): read from the corpus when the page is built (see
  // app/src/pages/search.astro), since most works have none and asking for
  // each would be a 404 apiece. Absent (the desktop app), numbers alone.
  export let chapterTitles: Record<string, Record<string, Record<string, string>>> = {};
  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');
  // Aristotle: no work carries speaker turns, so the Plato-only
  // "Spoken by" filter is hidden.
  const SPEAKERS = HAS_SPEAKERS;

  // One match occurrence, located precisely enough to label and jump to.
  interface Instance {
    lang: 'grk' | 'eng';
    work: string;
    book?: number;
    column: string;
    line: number;
    sub?: string;
    ref: string;       // e.g. "34b"
    html: string;      // KWIC snippet
    jumpUrl: string;
    // Greek hits: each word the instance holds (one, a proximity window's,
    // or a section's), for its note and its speaker.
    held?: HeldTok[];
    // Greek hits under a speaker filter: who is speaking at the matched words,
    // each once, in order.
    speaker?: string;
    // English only: one row per translation the query matched in this section,
    // in the work's own order, so where Lamb and Jowett render the same lines
    // their words sit together. An English instance's html/jumpUrl are its
    // first row's. A Greek instance carries rows when the English query matched
    // in the same aligned unit: one instance, each side with its marks.
    rows?: TransRow[];
    // The other language's side of the hit, from the same aligned unit
    // (lib/paired-hit): the English of a Greek hit, in one translation, or the
    // Greek of an English one. Neither is marked: no word of it matched.
    pairEnglish?: { text: string; label: string; title: string; jumpUrl: string };
    pairGreek?: string;   // HTML: its words are buttons, as a hit's are
    // The unit the hit stands in, and where in its section, for merging and
    // for order within a line.
    unit?: PairUnit;
    at?: number;
    // Greek hits: the segment the token stands in, for its readings, and the
    // token as printed and folded, for the form view (greekFold of the
    // surface is the form index's key).
    seg?: string;
    surface?: string;
    form?: string;
    // A merged hit filed under one of its forms: each spelling of that form it holds.
    surfaces?: string[];
    // Greek hits: the tokens the instance counts, each a hit (a match of
    // several words, its window, is one hit together).
    toks?: number[];
    // Its Greek hits alone (the tokens above), never the English rows it
    // carries: what a form's frequency counts, in the sort and in hitsIn.
    grkHits?: number;
    // The hit's whole section, both sides (what "more" opens). Under the
    // whole-section context the instance is the section itself (`isSection`).
    whole?: SectionView;
    isSection?: boolean;
    // A whole section with hits of several forms: the section once for each
    // form, as the form and grammar views file it.
    forms?: Instance[];
  }
  // One Greek word a hit holds. `oneOf` is a grammatical search's note on it,
  // stated as one-of-N when the parse does not settle the reading; absent when
  // it does. `speaker`: who says it, under a speaker filter.
  interface HeldTok { pos: number; surface: string; oneOf?: string; speaker?: string }
  // A whole Stephanus section: its Greek with every Greek hit of the page
  // there marked (`held`), and its English in each translation that matched there,
  // marked; or, with none, one translation's unmarked.
  interface SectionView {
    seg: string;      // the section's segment id, for its words' readings
    greek: string;
    held: HeldTok[];
    rows: TransRow[];
    pair?: { text: string; label: string; title: string; jumpUrl: string };
  }
  interface TransRow {
    translation: string;   // TranslationRef id
    // The translator's short name, shown on every row: a reader is owed whose
    // words the snippet is in, whether or not the work offers a choice.
    label: string;
    title: string;         // full citation
    html: string;
    jumpUrl: string;
    hits: number;          // the words it matched here, each a hit
  }
  // All instances within one Stephanus page (the `chapter` of the sister repo's
  // shape): the unit the pages break at, and the CSV's page column.
  interface ChapterGroup {
    work: string;
    book: number;
    chapter: string;
    order: number;     // chapter position within the book, for sorting
    title?: string;    // the chapter's title, where the corpus has one
    instances: Instance[];
  }

  let grkQuery = '';
  let engQuery = '';
  // Greek and English each get an independent match mode (Change 5).
  let grkMode: SearchMode = 'all';
  let engMode: SearchMode = 'all';
  let langOp: LangOp = 'and';
  // 'text': the running text (PR 9): the Greek box is a regular expression
  // over each work's Greek as one text (lib/running-text).
  let matchMode: MatchMode | 'text' = 'lemma';
  // Running text: match the punctuation too (pu=1).
  let punctuation = false;
  // Running text: works searched so far, for the progress line.
  let rtProgress: { done: number; total: number } | null = null;
  // English "any form": a word also finds its plurals and possessives.
  let engForms = true;
  // Which works to search. Default: all. Selected in the collapsible panel below.
  let selectedWorks = new Set<string>(WORKS.map(w => w.id));
  let worksOpen = false;  // is the works "Refine" panel expanded?
  let groups: ChapterGroup[] = [];        // chapter groups of the CURRENT page
  let totalInstances = 0;                 // across the whole result set (all pages)
  let expanded = new Set<string>();
  let loading = false;                    // running the index search
  let searched = false;
  let error = '';
  let failedWorks: string[] = [];         // works whose index didn't load this run
  // Works whose turn starts are line-precise only; set solely when the query
  // depends on where a speech begins, so it is never noise.
  let approximateTurns: string[] = [];
  let approximateChapters: string[] = [];

  // Inflected variants of a typed phrase. Offered only for a Greek phrase
  // searched by surface form, which is the case where finding the variants by
  // hand means knowing every word's dictionary form.
  let variantNote = '';
  let variantBusy = false;
  let variantsShown = false;
  // Offered for ANY multi-word Greek query, not only a form-phrase one. Tying it
  // to "Exact phrase" + "Exact form" hid it behind two controls a reader has no
  // reason to touch, so the people it helps most were the least likely to meet
  // it. What it does does not depend on the current mode: it finds the phrase
  // under every dictionary form of its words.
  $: canWiden = !comboActive && !soloLemmaActive && matchMode !== 'text'
    && grkQuery.trim().split(/\s+/).filter(Boolean).length > 1;

  // Lemma mode matches dictionary forms, so a phrase typed as it stands on the
  // page (ἦν δ’ ἐγώ) finds nothing — ἦν is not a headword, εἰμί is. That reads
  // as "no such phrase" when it is really "not in one passage". A typed
  // inflection now resolves to its headword, so this no longer fires for the
  // reader who simply did not know the dictionary form — what is left is a
  // genuine miss, and widening is what answers it.
  $: lemmaDeadEnd = searched && !error && totalInstances === 0 && !variantsShown
    && matchMode === 'lemma' && canWiden && !engQuery.trim();

  // Stepping through history can start a search while another is running;
  // only the latest may write results.
  let searchRun = 0;

  // `keep`: filters the reader already has on widened results, to stay on
  // when they are widened again (the speaker lifted from them). A first
  // widening has none: its results are another search's.
  async function findVariants(keep?: { work: string | null; trans: string | null; facets: Facets }) {
    // Counted with the searches: the back button must be able to retire it.
    const run = ++searchRun;
    // That retires the search whose first page may still be loading, and with
    // it the only code that would end "Searching…": doSearch clears `loading`
    // for its own run alone.
    loading = false;
    variantBusy = true;
    error = '';
    try {
      const works = WORKS.map(w => w.id).filter(id => selectedWorks.has(id));
      const query = searchCtx.grkQuery || grkQuery;
      // The speaker filter frozen with the search, not the live control: the
      // note under the results describes the search that ran.
      const speaker = searchCtx.speaker;
      const outcome = await searchPhraseVariants(query, works, speaker);
      if (run !== searchRun) return;
      if (!outcome.results.length && !outcome.readings.length) {
        variantNote = 'No dictionary form is recorded for one of these words, so there is nothing to widen.';
        return;
      }
      failedWorks = outcome.failedWorks;
      unsearched = [];
      unresolved = [];
      allResults = outcome.results;
      // The widened results are another search's: its forms are not these,
      // nor its readings.
      hitForms = null;
      formsFailed = null;
      excludedForms = new Set();
      resetGrammar();
      facets = keep?.facets ?? {};
      // Kept where these results still hold them.
      transFilter = keep?.trans && outcome.results.some(r => r.engHits?.some(h => h.translation === keep.trans)) ? keep.trans : null;
      workFilter = keep?.work && outcome.results.some(r => r.work === keep.work) ? keep.work : null;
      // Facets kept need the readings before the first page is drawn, or the
      // hits they reject would show until the readings came.
      if (hasFacets(facets)) {
        await needGrammar();
        if (run !== searchRun) return;
      } else if (view === 'grammar') needGrammar();
      // The widened results are other inflections by definition, so the typed
      // accent pattern must not be held against them — kept, buildGroups would
      // drop τῷ and τοῦ from a search typed as τὸ, the very forms this finds.
      // Built whole, as runSearch builds it, so the ctx describes the search
      // that produced these results rather than patching the previous one.
      searchCtx = { ...emptyCtx(), grkQuery: query, speaker };
      searched = true;
      variantsShown = true;
      await showResults(outcome.results);
      if (run !== searchRun) return;
      // Say what was actually searched. Two readings of one word routinely land
      // on the same tokens — one passage under two parses — so the places are
      // unioned, not added up, and the count below is places, not readings.
      const readings = outcome.productive.length || outcome.readings.length;
      variantNote =
        `Showing every place this phrase stands under any dictionary form of its words`
        + ` (${readings} reading${readings === 1 ? '' : 's'} matched`
        + (outcome.cappedFrom ? `, of ${outcome.cappedFrom} possible — the rest were not tried` : '')
        + ').';
    } catch (err) {
      if (run === searchRun) error = err instanceof Error ? err.message : String(err);
    } finally {
      if (run === searchRun) variantBusy = false;
    }
  }
  let showHelp = false;
  let helpModal: HTMLDivElement;
  let helpTrigger: HTMLElement | null = null;

  // Pagination. search() returns the complete hit list (index-only); we render
  // it a page at a time, breaking pages only between chapters
  // (lib/search-pages) so a card never splits across result pages — and so only
  // the current page's books are fetched. That keeps the request burst small
  // however broad the query is, instead of loading every result's book at once.
  // ~instances per page (whole chapters): the Page-size control, and
  // more for a list of citations alone.
  const pageTarget = (ps: PageSize) => (ps === 'c' ? 400 : Number(ps));
  let pages: SearchResult[][] = [];       // each page's slice of the result set
  let shownResults: SearchResult[] = [];  // every page's results, once each
  let pageIdx = 0;
  let pageLoading = false;                // fetching the current page's books
  let pageError = '';                     // partial-load notice for this page
  let csvBusy = false;
  let csvNote = '';

  // Immutable snapshot of the SUBMITTED query. Pagination and CSV build snippets
  // and jump-links after the search completes, so they must use the query that
  // produced the results — not whatever is currently typed in the boxes (a user
  // can edit the inputs without re-submitting, then page/retry/export).
  interface SearchCtx {
    grkQuery: string; engQuery: string; engUnits: string[][]; grkAccentTerms: string[];
    grkCaseTerms: string[];   // "Case exact": the terms whose capitals must match
    engPhrase: boolean;   // the English terms are a phrase: mark the run, not each word
    engForms: boolean;    // the English terms matched any form of each word
    langOp: LangOp;       // how the two queries were joined, for the translation filter
    // The speaker filter the results on screen were produced under. Frozen with
    // the rest of the query: "widen to all inflections" runs after the fact,
    // and reading the live control there would rerun it under a filter the
    // note beneath the results no longer describes.
    speaker?: SpeakerFilter;
  }
  const emptyCtx = (): SearchCtx => ({
    grkQuery: '', engQuery: '', engUnits: [], grkAccentTerms: [], grkCaseTerms: [], engPhrase: false, engForms: false, langOp: 'and',
  });
  let searchCtx: SearchCtx = emptyCtx();

  // ── Translations ───────────────────────────────────────────────────────────
  // An English query is asked of every translation a work carries, and each
  // hit says whose prose it is in. The full result set is kept so the reader
  // can narrow it to one translator and back without searching again.
  let allResults: SearchResult[] = [];
  let transFilter: string | null = null;   // a TranslationRef id, or every translation
  // Translations the English query could not be asked of (their index did
  // not load), as "Jowett (Meno)".
  let unsearched: string[] = [];
  // Greek words searched only as typed: the headword map did not load.
  let unresolved: string[] = [];

  function translationsOf(work: string): TranslationRef[] {
    const w = getWork(work);
    return w ? searchableTranslations(w) : [];
  }
  function translationRef(work: string, id: string): TranslationRef | undefined {
    return translationsOf(work).find(t => t.id === id);
  }

  // ── Forms ──────────────────────────────────────────────────────────────────
  // What the Greek result is made of: every form found, with its count and a
  // tick box (lib/form-panel). The forms are looked up once, after the search
  // (greekHitForms); setting some aside then filters the results in hand, as
  // the translator and work chips do, and asks the network for nothing.
  let hitForms: HitForms | null = null;        // the forms of the search on screen
  // The lookup failed: wholly (true), or for these works. Forms that could not
  // be read cannot be set aside, and the page says so rather than show hits
  // the address bar claims are gone.
  let formsFailed: true | string[] | null = null;
  let excludedForms = new Set<string>();       // set aside and applied (?xf=)
  let formTicks = new Set<string>();           // ticked in the panel, not yet applied
  // Everything downstream reads the results through this: the hits left once
  // the forms set aside and those the grammar facets reject are gone.
  function withoutForms(results: SearchResult[]): SearchResult[] {
    return refine(results, { forms: hitForms ?? undefined, excluded: excludedForms, grammar: hitGrammar ?? undefined, facets }, searchCtx.langOp);
  }
  $: formResults = refine(allResults, { forms: hitForms ?? undefined, excluded: excludedForms, grammar: hitGrammar ?? undefined, facets }, searchCtx.langOp);
  // Counted before any form is set aside, so one set aside stays listed, and
  // within the translation and work chosen and the facets ticked, so the
  // counts add up to the Greek hits shown.
  $: keepFacet = facetKeep(hitGrammar, facets);
  $: formPanel = hitForms ? formGroups(narrowWork(narrow(allResults, transFilter, searchCtx), workFilter), hitForms, keepFacet) : [];
  $: formKeys = [...new Set(formPanel.flatMap(g => g.forms.map(f => f.form)))];
  $: formChoice = formKeys.length > 1 || excludedForms.size > 0;
  // Apply has something to do when the ticks differ from what is in force.
  $: formsDirty = formKeys.some(f => formTicks.has(f) === excludedForms.has(f));
  const resetFormTicks = () => {
    formTicks = new Set((hitForms ? [...new Set([...hitForms.byResult.values()].flat())] : []).filter(f => f && !excludedForms.has(f)));
  };
  function toggleFormTick(form: string) {
    if (formTicks.has(form)) formTicks.delete(form);
    else formTicks.add(form);
    formTicks = formTicks;
  }
  // Only the forms in view: another work's keep the ticks they had.
  function toggleAllForms() {
    const on = !formKeys.some(f => formTicks.has(f));
    for (const f of formKeys) { if (on) formTicks.add(f); else formTicks.delete(f); }
    formTicks = formTicks;
  }
  // Looks up the forms of the results on screen, under the match mode the
  // search was submitted with: the control may have moved since.
  let formsMode: MatchMode = 'lemma';
  async function loadForms(results: SearchResult[]) {
    let found: HitForms | null = null;
    try {
      found = await greekHitForms(results, searchCtx.grkQuery, formsMode);
    } catch (err) {
      console.warn('search: no form list —', err);
    }
    // Forms are positions in the results they were read for, so they are kept
    // exactly when those results are still the ones on screen. Not "when no
    // newer action has started": a widening that finds nothing leaves these
    // results up, and their forms are still wanted.
    if (results !== allResults) return;
    hitForms = found;
    formsFailed = !found ? true : found.failedWorks.length ? found.failedWorks : null;
    resetFormTicks();
    if (found) void loadSpellings(found);
    fillPickInfo([...new Set([...(found?.headwords.values() ?? [])].flat())]);
  }
  // How the panel prints a form: every accented spelling the corpus has of its
  // folded key, commonest first, joined by " · " (John, 2026-11-10). Display
  // only — the keys stay folded in the URL, the ticks and the counts. A key
  // without spellings, or still loading, prints its fold. The spellings are
  // the corpus's, not the search's, so they are kept for the page's life.
  let formSpellings = new Map<string, string>();
  async function loadSpellings(found: HitForms) {
    const keys = [...new Set([...found.byResult.values()].flat())].filter(k => k && !formSpellings.has(k));
    if (!keys.length) return;
    const accents = await formAccents(keys).catch(() => new Map<string, string[]>());
    if (!accents.size) return;
    for (const [key, spellings] of accents) formSpellings.set(key, spellings.join(' · '));
    formSpellings = formSpellings;
  }
  async function retryForms() {
    const results = allResults;
    await loadForms(results);
    if (results === allResults) showResults(allResults);
  }
  function applyForms() {
    // Forms outside the work in view keep the state they had.
    const inView = new Set(formKeys);
    excludedForms = new Set([
      ...[...excludedForms].filter(f => !inView.has(f)),
      ...formKeys.filter(f => !formTicks.has(f)),
    ]);
    // A filter, not a new search, as the translator chip is.
    if (lastSearch) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
    showResults(allResults);
  }
  // ── Views and grammar ──────────────────────────────────────────────────────
  // The hits of the page in view listed under their work (the default), or
  // grouped by form, or with each form's readings; and narrowed by those
  // readings (lib/result-views). The readings are looked up once the grammar
  // view or a facet asks for them (greekHitGrammar); ticking a facet then
  // filters the results in hand, as the form panel does.
  // A choice in a menu over the hits: its label, the word the menu shows
  // while it is chosen, and its gloss (§5.2, exactly).
  // `short`: its label on the phone's View sheet, two to a row (p04).
  interface DisplayChoice { id: string; label: string; short?: string; value: string; gloss?: string; rule?: boolean }
  const VIEWS: (DisplayChoice & { id: ResultView })[] = [
    { id: 'page', label: 'By work', value: 'work', gloss: 'a heading for each work' },
    { id: 'form', label: 'By form', value: 'form', gloss: 'each spelling apart' },
    { id: 'grammar', label: 'By grammar', value: 'grammar', gloss: 'case, number, tense, and so on' },
  ];
  let view: ResultView = 'page';
  // Settings of the results, not of the search: a new search keeps them.
  let context: ResultContext = '3';             // ?ctx=
  let sort: ResultSort = 'page';                // ?so=
  let pageSize: PageSize = '40';                // ?ps=
  let facets: Facets = {};                      // ticked (?gf=)
  let hitGrammar: HitGrammar | null = null;     // the readings of the search on screen
  // The lookup failed: wholly (true), or for these works. Their hits are not
  // narrowed, and the page says so.
  let grammarFailed: true | string[] | null = null;
  // The results a lookup was last started for, so none is asked for twice.
  let grammarAsked: SearchResult[] | null = null;
  let grammarPending: Promise<void> = Promise.resolve();
  const resetGrammar = () => { hitGrammar = null; grammarFailed = null; grammarAsked = null; };
  async function loadGrammar(results: SearchResult[]) {
    let found: HitGrammar | null = null;
    try {
      found = await greekHitGrammar(results);
    } catch (err) {
      console.warn('search: no grammar —', err);
    }
    // Readings are positions in the results they were read for, as forms are.
    if (results !== allResults) return;
    hitGrammar = found;
    grammarFailed = !found ? true : found.failedWorks.length ? found.failedWorks : null;
  }
  function needGrammar(): Promise<void> {
    if (grammarAsked !== allResults) {
      grammarAsked = allResults;
      grammarPending = loadGrammar(allResults);
    }
    return grammarPending;
  }
  async function retryGrammar() {
    const results = allResults;
    await loadGrammar(results);
    if (results === allResults) showResults(allResults);
  }
  // Regroups the page in view; the results and the pages stay as they are.
  function setView(next: ResultView) {
    popup = null;
    view = next;
    if (lastSearch) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
    if (view === 'grammar') needGrammar();
  }
  // How much text a hit shows. The pages stay as they are; the page in view
  // is drawn again.
  const CONTEXTS: (DisplayChoice & { id: ResultContext })[] = [
    { id: '1', label: '1 line', value: '1 line', gloss: 'the line with the hit' },
    { id: '3', label: '3 lines', value: '3 lines', gloss: 'a line either side' },
    { id: 's', label: 'Whole section', value: 'whole section', gloss: 'the section the hit is in' },
  ];
  function setContext(next: ResultContext) {
    if (next === context) return;
    context = next;
    if (lastSearch) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
    if (pages.length) renderPage(pageIdx);
  }
  // Hits per page, or citations alone. The pages are laid out again from the
  // results in hand, from the first.
  const PAGE_CHOICES: (DisplayChoice & { id: PageSize })[] = [
    { id: '20', label: '20', value: '20' },
    { id: '40', label: '40', value: '40' },
    { id: '100', label: '100', value: '100' },
    { id: 'c', label: 'Citations only', value: 'citations only', gloss: 'places, no text', rule: true },
  ];
  let citeList: CiteGroup[] = [];      // the page in view, under citations only
  function setPageSize(next: PageSize) {
    if (next === pageSize) return;
    pageSize = next;
    if (lastSearch) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
    showResults(allResults);
  }
  // The hits opened to their whole section by "more", on the page in view.
  let more = new Set<Instance>();
  function toggleMore(inst: Instance) {
    if (more.has(inst)) more.delete(inst);
    else more.add(inst);
    more = more;
  }
  // Ruling 18: an instance shows one translation's English, the one first in
  // the side column's Translations list (by count) unless the reader picked
  // another under it, for that instance alone.
  let shownTrans = new Map<Instance, string>();
  $: transOrder = new Map(transCounts.map((t, i) => [t.id, i]));
  const orderedRows = (rows: TransRow[], order: Map<string, number>) =>
    [...rows].sort((a, b) => (order.get(a.translation) ?? Infinity) - (order.get(b.translation) ?? Infinity));
  function shownRow(inst: Instance, rows: TransRow[] | undefined, order: Map<string, number>, chosen: Map<Instance, string>): TransRow | undefined {
    if (!rows?.length) return undefined;
    return rows.find(row => row.translation === chosen.get(inst)) ?? orderedRows(rows, order)[0];
  }
  function showTrans(inst: Instance, id: string) {
    shownTrans.set(inst, id);
    shownTrans = shownTrans;
  }
  // A form's readings under the grammar view, folded under their count (d12).
  let readingsOpen = new Set<string>();
  function toggleReadings(key: string) {
    if (readingsOpen.has(key)) readingsOpen.delete(key);
    else readingsOpen.add(key);
    readingsOpen = readingsOpen;
  }
  // A chapter's name line: "Chapter 13", then its title where the corpus has
  // one. A title that is itself a chapter number (the Rhetoric to Alexander
  // counts its letter as chapter 1) is the line on its own.
  const chapterName = (c: { n: string; title?: string }) => /^chapter\s/i.test(c.title ?? '')
    ? { label: c.title!, title: '' }
    : { label: `Chapter ${c.n}`, title: c.title ?? '' };
  // The book an instance is in, where its work has several.
  const bookOf = (inst: Instance) => {
    const labels = getWork(inst.work)?.bookLabels ?? [];
    return labels.length > 1 && inst.book ? labels[inst.book - 1] ?? String(inst.book) : '';
  };
  // The order of the page in view: within it only, so a sort never moves a
  // hit to another page (lib/result-views orderHits).
  const SORTS: (DisplayChoice & { id: ResultSort })[] = [
    { id: 'page', label: 'Bekker order', value: 'Bekker order', gloss: 'page, column, and line' },
    { id: 'work', label: 'Works A–Z', value: 'Works A–Z', gloss: 'by title' },
    { id: 'form', label: 'Forms A–Z', value: 'Forms A–Z', gloss: 'by spelling' },
    { id: 'freq', label: 'Commonest form first', short: 'Commonest form', value: 'Commonest form first', gloss: 'the biggest group on top' },
  ];
  function setSort(next: ResultSort) {
    popup = null;
    sort = next;
    if (lastSearch) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
  }
  // A filter, not a new search, applied as soon as it is ticked.
  function toggleFacet(category: string, value: string) {
    const values = facets[category] ?? [];
    const next = values.includes(value) ? values.filter(v => v !== value) : [...values, value];
    const { [category]: _, ...rest } = facets;
    facets = next.length ? { ...rest, [category]: next } : rest;
    if (lastSearch) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
    showResults(allResults);
  }
  function clearFacets() {
    facets = {};
    if (lastSearch) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
    showResults(allResults);
  }
  // Counted before the facets, so every value stays on offer, but after the
  // forms set aside and within the translation and work chosen.
  const formKeep = (forms: HitForms | null, excluded: Set<string>) => (r: SearchResult, i: number) => {
    const own = forms?.byResult.get(`${r.work}:${r.meta.id}`);
    return !own || !excluded.has(own[i]);
  };
  $: keepForm = formKeep(hitForms, excludedForms);
  $: facetRows = withTicked(
    hitGrammar ? facetCounts(narrowWork(narrow(allResults, transFilter, searchCtx), workFilter), hitGrammar, keepForm) : [],
    facets);
  const categoryLabel = (key: string) => GRAMMAR_CATEGORIES.find(c => c.key === key)?.label ?? key;
  // A value in a reader's word where the grid gives one (adj → adjective).
  const valueName = (key: string, value: string) => GRAMMAR_CATEGORIES.find(c => c.key === key)?.names?.[value] ?? value;
  // The readings of each Greek hit, by work, segment and token.
  $: grammarAt = (() => {
    const at = new Map<string, Reading[]>();
    for (const r of hitGrammar ? allResults : []) {
      hitGrammar!.byResult.get(`${r.work}:${r.meta.id}`)
        ?.forEach((readings, i) => at.set(`${r.work}:${r.meta.id}:${r.grkPositions[i]}`, readings));
    }
    return at;
  })();
  const readingsOf = (inst: Instance, at: Map<string, Reading[]>) =>
    inst.lang === 'grk' && inst.seg ? at.get(`${inst.work}:${inst.seg}:${inst.at}`) : undefined;
  // A word the facets pass on some of its readings and not others.
  function facetOneOf(inst: Instance, pos: number, at: Map<string, Reading[]>, ticked: Facets): string | undefined {
    // An English hit has no Greek word of its own; opened to its section, the
    // words marked there are the section's.
    const seg = inst.seg ?? inst.whole?.seg;
    const readings = hasFacets(ticked) && seg ? at.get(`${inst.work}:${seg}:${pos}`) : undefined;
    return readings && ambiguityNote(readings, ticked);
  }
  // What an instance says of its ambiguous words: the grammatical search's
  // note on each, else the facets'. A hit of one word, its note; of several
  // (a window, a section), each distinct note with the word it is about, so
  // the reader knows which. A hit opened with "more" keeps its own note and
  // adds those of the section's other hits, now marked in it.
  function noteOf(inst: Instance, at: Map<string, Reading[]>, ticked: Facets, open: boolean): string | undefined {
    const notes = (list: HeldTok[]) => list
      .map(h => ({ surface: h.surface, note: h.oneOf ?? facetOneOf(inst, h.pos, at, ticked) }))
      .filter(x => x.note);
    const own = inst.held ?? [];
    const out = own.length === 1 ? notes(own).map(x => x.note!) : notes(own).map(x => `${x.surface}: ${x.note}`);
    if (open && !inst.isSection) {
      const mine = new Set(own.map(h => h.pos));
      out.push(...notes((inst.whole?.held ?? []).filter(h => !mine.has(h.pos))).map(x => `${x.surface}: ${x.note}`));
    }
    return out.length ? [...new Set(out)].join(' · ') : undefined;
  }
  // Who speaks the words held, each once, in order.
  const speakersOf = (held: HeldTok[]) => [...new Set(held.map(h => h.speaker).filter(Boolean))].join(' · ') || undefined;
  const groupReadings = (g: ViewGroup, at: Map<string, Reading[]>) =>
    [...new Set(g.instances.flatMap(inst => (readingsOf(inst, at) ?? []).map(formatReading)))];
  // A group by form spans works, so its citations name theirs.
  // The work and its place never part; a range of lines may break after
  // its dash (the template's <wbr>), so "1095b29–33" fits the column.
  // An English hit cites its column, as the old Search did: the English is
  // not yet aligned line by line in every work (John, 13 Nov: "for now the
  // column. once every work is properly aligned, the line"). A
  // chapter-section work keeps its section ("49.3"). The link still opens
  // the reader at the line.
  const englishCiteLine = (work: string, turnFlow: unknown, line: number) =>
    !turnFlow && isChapterSection(getWork(work)) ? line : undefined;
  const citeText = (inst: Instance, v: ResultView) =>
    v === 'form' || v === 'grammar' ? `${getWork(inst.work)?.abbr ?? inst.work}\u00a0${inst.ref}` : inst.ref;

  // A headword's key as the reader knows it: its dictionary form where the
  // picker data has it, else the key in Greek letters.
  const headLabel = (key: string, info: typeof pickInfo) => info[key]?.heads ?? betaToGreek(key);

  // Hits per translator, most first — the breakdown is itself an answer
  // (which translators use this word, and how often). Counted within the work
  // chosen below, if any, so the counts add up to the English hits shown.
  $: transCounts = (() => {
    const by = new Map<string, { id: string; short: string; n: number }>();
    for (const r of narrowWork(formResults, workFilter)) {
      for (const h of r.engHits ?? []) {
        const entry = by.get(h.translation)
          ?? by.set(h.translation, { id: h.translation, short: translationRef(r.work, h.translation)?.short ?? h.translation, n: 0 }).get(h.translation)!;
        entry.n += engHitCount(h);
      }
    }
    return [...by.values()].sort((a, b) => b.n - a.n || a.short.localeCompare(b.short));
  })();
  // A filter is offered only where some work answered in two translations or
  // more; across single-translation works it would only restate the work list.
  // A filter in force stays on offer, so it can be lifted.
  $: transChoice = transFilter !== null || (() => {
    const shown = narrowWork(formResults, workFilter);
    return new Set(shown.flatMap(r => (r.engHits ?? []).map(h => `${r.work}:${h.translation}`))).size
      > new Set(shown.filter(r => r.engHits?.length).map(r => r.work)).size;
  })();

  // Which works a second translation can answer in, said beside the row: a
  // translator's count is out of those works, not the whole corpus.
  const secondScope = (() => {
    const multi = WORKS.filter(w => searchableTranslations(w).length > 1);
    const names = [...new Set(multi.flatMap(w => searchableTranslations(w).slice(1).map(t => t.short)))];
    if (!multi.length) return '';
    return names.length === 1
      ? `in the ${multi.length} works that carry ${names[0]}`
      : `in the ${multi.length} works with a second translation`;
  })();

  // ── Works ──────────────────────────────────────────────────────────────────
  // Where the hits fall, most first, and a way to narrow to one work. Pages run
  // in corpus order, so without this a broad search's first page says nothing
  // of the works further on. Counted under the translation filter, so the
  // counts add up to the total shown.
  let workFilter: string | null = null;    // a work id, or every work
  function narrowWork(results: SearchResult[], id: string | null): SearchResult[] {
    return id ? results.filter(r => r.work === id) : results;
  }
  $: workCounts = (() => {
    const by = new Map<string, number>();
    for (const r of narrow(formResults, transFilter, searchCtx)) {
      const n = hitCount(r);
      if (n) by.set(r.work, (by.get(r.work) ?? 0) + n);
    }
    return [...by.entries()]
      .map(([id, n]) => ({ id, n, abbr: getWork(id)?.abbr ?? id, title: getWork(id)?.title ?? id }))
      .sort((a, b) => b.n - a.n || (WORK_ORDER.get(a.id) ?? 0) - (WORK_ORDER.get(b.id) ?? 0));
  })();
  $: workChoice = workFilter !== null || workCounts.length > 1;

  $: countText = totalInstances === 0
    ? 'No passages found.'
    : `${totalInstances} instance${totalInstances === 1 ? '' : 's'}`
      + (pages.length > 1 ? ` · page ${pageIdx + 1} of ${pages.length}` : '');

  function setWorkFilter(id: string | null) {
    workFilter = workFilter === id ? null : id;
    // A filter, not a new search, as the translator chip is.
    if (lastSearch) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
    showResults(allResults);
  }

  // One translation's hits, or all of them. A passage that matched only in
  // the translations set aside drops out — unless its Greek matched and the
  // two queries were joined by "either", when the Greek hit still stands.
  function narrow(results: SearchResult[], id: string | null, ctx: SearchCtx): SearchResult[] {
    if (!id) return results;
    return results.flatMap(r => {
      if (!r.engHits) return [r];
      const engHits = r.engHits.filter(h => h.translation === id);
      if (engHits.length) return [{ ...r, engHits, engMatch: true }];
      return r.grkMatch && ctx.langOp === 'or' ? [{ ...r, engHits: [], engMatch: false }] : [];
    });
  }

  let pageOf: (r: SearchResult, chapter: string) => number = () => 0;
  let layoutRun = 0;
  // The search index's offsets of the works with hits: where each page
  // breaks, and the line of a Greek hit under citations only.
  let pageOffsets = new Map<string, Offsets | null>();
  async function showResults(results: SearchResult[]) {
    // A filter that leaves no page draws none, so the card goes here too.
    popup = null;
    const run = ++layoutRun;
    const shown = narrowWork(narrow(withoutForms(results), transFilter, searchCtx), workFilter);
    totalInstances = shown.reduce((n, r) => n + hitCount(r), 0);
    shownResults = shown;
    // Load chapter offsets to cut pages at chapter boundaries before fetching books.
    const offsets = new Map<string, Awaited<ReturnType<typeof loadOffsets>> | null>();
    await Promise.all([...new Set(shown.map(r => r.work))].map(async work => {
      try { offsets.set(work, await loadOffsets(work)); } catch { offsets.set(work, null); }
    }));
    if (run !== layoutRun) return;
    pageOffsets = offsets;
    const layout = paginate(shown, offsets, pageTarget(pageSize));
    pages = layout.pages;
    pageOf = layout.pageOf;
    if (run !== layoutRun) return;
    if (pages.length) await renderPage(0);
    // A retired page leaves pageLoading to the layout that retired it.
    else { groups = []; citeList = []; pageIdx = 0; pageLoading = false; }
  }

  function setTransFilter(id: string | null) {
    transFilter = transFilter === id ? null : id;
    // A filter, not a new search: it replaces the history entry rather than
    // adding one.
    if (lastSearch) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
    showResults(allResults);
  }

  // ── The side column ────────────────────────────────────────────────────────
  // What narrows this search's hits, in the order of the controls below it,
  // each with the way to undo it. All but the speaker filter are filters on
  // the results in hand; that one is part of the search. How the hits are
  // shown (Group by, Sort, Context, Per page) is View's, not listed here.
  type Chosen = { key: string; label: string; remove: () => void | Promise<void> };
  $: chosen = ((): Chosen[] => {
    const out: Chosen[] = [];
    if (lastSearch?.combo?.crossChapter === false) out.push({ key: 'cx', label: 'Within a chapter', remove: dropChapter });
    if (workFilter) out.push({ key: 'wf', label: getWork(workFilter)?.title ?? workFilter, remove: () => setWorkFilter(workFilter) });
    if (transFilter) {
      const short = transCounts.find(t => t.id === transFilter)?.short ?? transFilter;
      out.push({ key: 't', label: short, remove: () => setTransFilter(transFilter) });
    }
    const n = excludedForms.size;
    if (n) out.push({ key: 'xf', label: `${n} form${n === 1 ? '' : 's'} set aside`, remove: restoreForms });
    for (const [category, values] of Object.entries(facets)) {
      for (const value of values) {
        out.push({ key: `gf:${category}.${value}`, label: `${categoryLabel(category)} ${valueName(category, value)}`, remove: () => toggleFacet(category, value) });
      }
    }
    const sp = searchCtx.speaker;
    if (sp) {
      const names = listNames(sp.names);
      out.push({ key: 'sp', label: sp.mode === 'only' ? `${names} only` : `Anyone but ${names}`, remove: dropSpeaker });
    }
    return out;
  })();
  // Counted on Filter; how the hits are shown is View's, which a red dot
  // marks while it is not the default (§5.7).
  $: filtersOn = chosen.length;
  // Every form back in, as ticking them all and Apply would.
  function restoreForms() {
    excludedForms = new Set();
    resetFormTicks();
    if (lastSearch) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
    showResults(allResults);
  }
  // The speaker filter is part of the search, so lifting it searches again,
  // keeping the filters on the results.
  async function dropSpeaker() {
    // The search as it was submitted, less its speaker: the box may hold a
    // word typed since and never searched for, and that is not what the
    // results on screen, or the line being removed, are about.
    // The settings of the results stay as they now are (applySearch would
    // put the submitted ones back).
    const now = { view, sort, context, pageSize };
    // The results may be the widened ones ("any inflection"), a step taken
    // from the search: lifting the speaker must widen again for everyone, not
    // fall back to the search before the widening.
    const widened = variantsShown;
    if (lastSearch) applySearch(lastSearch);
    ({ view, sort, context, pageSize } = now);
    speakerMode = 'anyone';
    speakerNames = new Set();
    // The reactive speakerFilter that doSearch reads must catch up.
    await tick();
    if (widened) {
      // Only the speaker was asked to go: the work, the translation and the
      // facets the reader has on the widened results stay, and the widening
      // itself puts them back, under its own guard against a newer search.
      // Forms set aside do not carry over: widened results have no form list.
      const keep = { work: workFilter, trans: transFilter, facets };
      const address = () => {
        if (lastSearch) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [], view, facets, context, sort, pageSize }, 'replace');
      };
      searchCtx = { ...searchCtx, speaker: undefined };
      speakerNote = '';
      speakerNoteKey = '';
      if (lastSearch) lastSearch = { ...lastSearch, speaker: null };
      // The address loses the speaker at once, and is written again with the
      // filters that still hold once the widened results are in.
      address();
      const mine = searchRun + 1;   // the run findVariants is about to take
      await findVariants(keep);
      if (searchRun === mine && variantsShown && !error) address();
      return;
    }
    await doSearch(undefined, { trans: transFilter, work: workFilter, xforms: [...excludedForms], facets });
    // The search writes its address before it knows whether the work and the
    // translation still hold; written again, they are in it.
    if (lastSearch && searched) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
  }
  async function dropChapter() {
    if (!lastSearch) return;
    const run = searchRun;
    const now = { view, sort, context, pageSize };
    const keep = { trans: transFilter, work: workFilter, xforms: [...excludedForms], facets };
    applySearch(lastSearch);
    ({ view, sort, context, pageSize } = now);
    comboCrossChapter = true;
    await tick();
    if (run !== searchRun) return;
    const mine = searchRun + 1;
    await doSearch(undefined, keep);
    if (searchRun === mine && lastSearch && searched) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
  }
  // Every filter at once, with one new search at most; View's settings stay.
  async function clearChosen() {
    workFilter = null;
    transFilter = null;
    excludedForms = new Set();
    resetFormTicks();
    facets = {};
    comboCrossChapter = true;
    if (lastSearch?.combo?.crossChapter === false) {
      await dropChapter();
    } else if (searchCtx.speaker) {
      await dropSpeaker();
    } else {
      if (lastSearch) writeUrl({ ...lastSearch, trans: transFilter, workFilter, xforms: [...excludedForms], view, facets, context, sort, pageSize }, 'replace');
      showResults(allResults);
    }
    await tick();
    (sumEl ?? sheetEl)?.focus();
  }
  // The button pressed goes with its line, so focus goes to the list; on the
  // sheet's menu the list goes when its last line does, and focus with it.
  async function removeChosen(c: Chosen) {
    await c.remove();
    await tick();
    (sumEl ?? sheetEl)?.focus();
  }

  // On a narrow screen the column is a sheet over the page (P4, John
  // 2026-11-10). The filter icon opens it as a menu of the filters, "This
  // search" at its head, each filter on a screen of its own; the sort icon
  // opens it as the display settings. Focus goes into it, and back to the
  // icon that opened it when it shuts.
  type SheetScreen = 'menu' | 'works' | 'trans' | 'forms' | 'grammar';
  const SCREEN_LABELS: Record<SheetScreen, string> = { menu: 'Filter', works: 'Works', trans: 'Translations', forms: 'Forms', grammar: 'Grammar' };
  let sheetOpen = false;
  let sheetKind: 'filter' | 'sort' = 'filter';
  let sheetScreen: SheetScreen = 'menu';
  let sheetEl: HTMLElement | null = null;
  let sumEl: HTMLElement | null = null;
  let filterBtn: HTMLButtonElement | null = null;
  let sortBtn: HTMLButtonElement | null = null;
  let backBtn: HTMLButtonElement | null = null;
  const menuRows: Partial<Record<SheetScreen, HTMLButtonElement>> = {};
  async function openSheet(kind: 'filter' | 'sort') {
    sheetKind = kind;
    sheetScreen = 'menu';
    sheetOpen = true;
    await tick();
    sheetEl?.focus();
  }
  function closeSheet() {
    sheetOpen = false;
    (sheetKind === 'sort' ? sortBtn : filterBtn)?.focus();
  }
  async function openScreen(next: SheetScreen) {
    sheetScreen = next;
    await tick();
    backBtn?.focus();
  }
  async function backToMenu() {
    const from = sheetScreen;
    sheetScreen = 'menu';
    await tick();
    (menuRows[from] ?? sheetEl)?.focus();
  }
  $: sheetLabel = !sheetOpen ? 'Refine results' : sheetKind === 'sort' ? 'View' : SCREEN_LABELS[sheetScreen];
  // The grammar is on offer where the side column offers it; its own screen
  // keeps it while the reader unticks the last value.
  $: grammarOffered = facetRows.length > 0 && (view === 'grammar' || hasFacets(facets));
  $: grammarShown = facetRows.length > 0 && (grammarOffered || (sheetOpen && sheetScreen === 'grammar'));
  // A screen whose filter has gone (new results, say) gives way to the menu,
  // and focus, which was on the screen, goes to the sheet.
  $: if (sheetOpen && sheetKind === 'filter' && sheetScreen !== 'menu'
    && !({ works: workChoice, trans: transChoice, forms: formChoice, grammar: facetRows.length > 0 } as Record<string, boolean>)[sheetScreen]) toMenu();
  async function toMenu() {
    sheetScreen = 'menu';
    await tick();
    if (sheetOpen && !sheetEl?.contains(document.activeElement)) sheetEl?.focus();
  }
  $: shownForms = formKeys.filter(f => !excludedForms.has(f)).length;
  // The hits with every form back in, for "of 967 · restore all forms" under
  // the count while some are set aside (d21).
  $: allFormsTotal = excludedForms.size
    ? narrowWork(narrow(refine(allResults, { forms: hitForms ?? undefined, excluded: new Set(), grammar: hitGrammar ?? undefined, facets }, searchCtx.langOp), transFilter, searchCtx), workFilter)
      .reduce((n, r) => n + hitCount(r), 0)
    : totalInstances;
  const instancesLabel = (n: number) => `Show ${n} instance${n === 1 ? '' : 's'}`;
  $: hitsLabel = instancesLabel(totalInstances);
  // What the forms ticked on the sheet would leave (q08), and its button:
  // the ticks applied, then the hits.
  $: formsPreview = formsDirty
    ? narrowWork(narrow(refine(allResults, { forms: hitForms ?? undefined, excluded: new Set([...[...excludedForms].filter(f => !formKeys.includes(f)), ...formKeys.filter(f => !formTicks.has(f))]), grammar: hitGrammar ?? undefined, facets }, searchCtx.langOp), transFilter, searchCtx), workFilter)
      .reduce((n, r) => n + hitCount(r), 0)
    : totalInstances;
  function showForms() {
    if (formsDirty) applyForms();
    closeSheet();
  }
  // The page behind an open sheet stays where it is: a wheel or swipe over
  // the backdrop would otherwise scroll it, and shutting the sheet would
  // leave the reader somewhere else.
  $: if (typeof document !== 'undefined') document.documentElement.style.overflow = sheetOpen ? 'hidden' : '';
  // The sheet is part of the results. When they are off the page (a search
  // running, a request that failed) it is not there to be shut, so it is shut
  // here, or the page would stay held with nothing to let it go.
  $: if (sheetOpen && (error || !searched)) sheetOpen = false;
  // Escape shuts the sheet; Tab stays inside it while it is open.
  function onSheetKey(e: KeyboardEvent, root = sheetOpen ? sheetEl : null, close = closeSheet) {
    if (!root) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    // A radio group is one stop: its checked radio, or its first if none is.
    const els = [...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])')].filter(el => {
      if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name) return true;
      const group = [...root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${el.name}"]:not([disabled])`)];
      return el.checked || (!group.some(r => r.checked) && group[0] === el);
    });
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    const at = document.activeElement;
    if (!root.contains(at) || (e.shiftKey && (at === first || at === root)) || (!e.shiftKey && at === last)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }

  // ── Accent-sensitive Greek matching ────────────────────────────────────────
  // The indexes are accent-folded (λόγος and λογός share a key), which is the
  // right default and stays the default. The toggle offers strict matching as
  // an instance-level post-filter: the index still finds the folded hits, then
  // each matched surface token must carry the query's exact diacritics. Strict
  // semantics, stated on the control: a query typed WITHOUT accents then only
  // matches genuinely unaccented tokens.
  let accentSensitive = false;
  // NFC + lowercase + final-sigma normalisation, diacritics KEPT. The elision
  // mark folds as greekFold folds it: the text stores ' and, in a few words, ’.
  // Lowercased before it is composed: a capital with two marks (Ϊ́) has no
  // composed form, its small letter has (ΐ).
  const accentNorm = (s: string) =>
    s.toLowerCase().normalize('NFC').replace(/ς/g, 'σ').replace(/[’ʼ]/g, "'");
  // This filter compares ACCENTED tokens, so it cannot reuse the engine's
  // fold-form matcher — but it has to honour the same wildcard syntax, or a `?`
  // or mid-word `*` query with accents on would find its hits in the index and
  // then silently drop every one of them here.
  // The pattern is read by the index's own rule (patternPieces), over accented
  // letters: one letter is a base letter with its marks, compared whole. A
  // Latin letter in a Greek term is its Beta Code letter (λόgος), as the index
  // folds it; the pattern's symbols stay symbols. A pattern that does not
  // compile matches nothing, as in the index.
  // A Latin letter keeps any accent typed on it (λóγος): the base letter is
  // converted, its marks are kept.
  const accentLetter = (ch: string) => {
    const [base, ...marks] = ch.toLowerCase().normalize('NFD');
    return /^[a-z]$/.test(base) ? accentNorm(betaQueryToGreek(base) + marks.join('')) : ch;
  };
  const ACCENT_UNITS = {
    literal: (ch: string) => [accentLetter(ch)],
    isLetter: (u: string) => /^\p{L}/u.test(u),
  };
  const _accentMatch = new Map<string, ((word: ArrayLike<string>) => boolean) | null>();
  function accentMatcher(q: string) {
    if (!_accentMatch.has(q)) {
      const pieces = patternPieces(q);
      _accentMatch.set(q, pieces && patternMatcher(pieces, ACCENT_UNITS));
    }
    return _accentMatch.get(q) ?? null;
  }
  function accentTokenMatch(token: string, terms: string[]): boolean {
    const t = letterClusters(accentNorm(token));
    return terms.some(q => accentMatcher(q)?.(t) ?? false);
  }

  // ── Case-exact Greek matching ──────────────────────────────────────────────
  // The same kind of post-filter: the index is case-folded, and with the
  // switch on each matched token must carry the query's capitals (Σωκράτης,
  // not σωκράτης). Accents are dropped on both sides here, so the two
  // switches stay apart: with both on, a token must pass both filters. Beta
  // Code is read as the accent filter reads it (betaQueryToGreek), so its
  // leading * is the capital.
  let caseExact = false;
  const caseNorm = (s: string) =>
    s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ς/g, 'σ').replace(/[’ʼ]/g, "'");
  const caseLetter = (ch: string) => {
    const base = ch.normalize('NFD')[0];
    return caseNorm(/^[a-zA-Z]$/.test(base) ? betaQueryToGreek(base) : base);
  };
  const CASE_UNITS = {
    literal: (ch: string) => [caseLetter(ch)],
    isLetter: (u: string) => /^\p{L}/u.test(u),
  };
  const _caseMatch = new Map<string, ((word: ArrayLike<string>) => boolean) | null>();
  function caseMatcher(q: string) {
    if (!_caseMatch.has(q)) {
      const pieces = patternPieces(q);
      _caseMatch.set(q, pieces && patternMatcher(pieces, CASE_UNITS));
    }
    return _caseMatch.get(q) ?? null;
  }
  function caseTokenMatch(token: string, terms: string[]): boolean {
    const t = [...caseNorm(token)];
    return terms.some(q => caseMatcher(q)?.(t) ?? false);
  }

  // The accent and case filters applied to the results themselves, before
  // anything counts them, so the count line, pager and chips give the true
  // count (audit, 2026-11-11), not the count before filtering. Each result's
  // book is read for its printed words. A phrase run (a window) stands or
  // falls whole. A book that does not load leaves its results as found; the
  // page filters them again as it draws them.
  async function exactFilter(results: SearchResult[], ctx: SearchCtx): Promise<SearchResult[]> {
    if (!ctx.grkAccentTerms.length && !ctx.grkCaseTerms.length) return results;
    const pass = (tok: string) => (!ctx.grkAccentTerms.length || accentTokenMatch(tok, ctx.grkAccentTerms))
      && (!ctx.grkCaseTerms.length || caseTokenMatch(tok, ctx.grkCaseTerms));
    const pairs = [...new Set(results.filter(r => r.grkMatch).map(r => `${r.work}:${r.meta.book}`))];
    const segs = new Map<string, Segment>();
    await pool(pairs, 8, async pair => {
      const [w, b] = pair.split(':');
      try { for (const s of (await fetchBook(w, Number(b))).segments) segs.set(`${w}:${s.id}`, s); }
      catch (err) { console.warn(`search: book failed for ${pair} —`, err); }
    });
    return results.flatMap(r => {
      const seg = segs.get(`${r.work}:${r.meta.id}`);
      if (!r.grkMatch || !seg) return [r];
      const toks = segTokens(seg).map(tok => tok.t);
      const ok = new Set(r.grkPositions.filter(p => pass(toks[p] ?? '')));
      if (r.windows) for (const w of r.windows) if (!w.every(p => ok.has(p))) w.forEach(p => ok.delete(p));
      const keep = r.grkPositions.map(p => ok.has(p));
      if (keep.every(Boolean)) return [r];
      const left = cutPositions(r, keep);
      if (left.grkPositions.length) return [left];
      return r.engMatch && ctx.langOp === 'or' ? [{ ...left, grkMatch: false }] : [];
    });
  }

  // ── Grammatical descriptions ───────────────────────────────────────────────
  // Grammatical features never make a question on their own: asked alone,
  // "genitive plural feminine" answers with tens of thousands of tokens, which
  // is a fact about Greek and not an answer to anything. So the grammar index
  // is reachable ONLY as one term beside another, and search.ts refuses a combo
  // with no lexical term. Nothing here offers a standalone grammar search.
  //
  // Aristotle uses Morpheus grammar categories, including its word-class tags.
  const GRAMMAR_CATEGORIES: { key: string; label: string; values: string[]; names?: Record<string, string> }[] = [
    { key: 'case',   label: 'Case',   values: ['nom', 'gen', 'dat', 'acc', 'voc'] },
    { key: 'number', label: 'Number', values: ['sg', 'pl', 'dual'] },
    { key: 'gender', label: 'Gender', values: ['masc', 'fem', 'neut'] },
    { key: 'tense',  label: 'Tense',  values: ['pres', 'imperf', 'fut', 'aor', 'perf', 'plup', 'futperf'] },
    { key: 'mood',   label: 'Mood',   values: ['ind', 'subj', 'opt', 'imperat', 'inf', 'part'] },
    { key: 'voice',  label: 'Voice',  values: ['act', 'mid', 'pass', 'mp'] },
    { key: 'person', label: 'Person', values: ['1st', '2nd', '3rd'] },
    { key: 'degree', label: 'Degree', values: ['comp', 'superl', 'irreg_comp'] },
    { key: 'marker', label: 'Word class', values: ['adverb', 'adverbial', 'particle', 'prep', 'conj', 'interrog', 'exclam', 'indecl', 'numeral', 'letter'] },
  ];
  // Aristotle's grammar dictionary retains Morpheus's word-class tags.

  // ── Combo search: the proximity editor ────────────────────────────────────
  // Each term a word in any of its forms, a word as typed, an exact phrase,
  // or a grammatical description; each after the first joined to the one
  // before by "and" or "or" (an or-joined term is one term with it), and
  // placed near, before, after, or not near an earlier term (ruling 8-10).
  const SLOT_KINDS: { v: SlotKind; l: string }[] = [
    { v: 'lemma', l: 'any form' },
    { v: 'form', l: 'as typed' },
    { v: 'phrase', l: 'exact phrase' },
    { v: 'grammatical', l: 'by grammar' },
  ];
  const RELATIONS: { v: SlotRelation; l: string }[] = [
    { v: 'near', l: 'near' },
    { v: 'before', l: 'before' },
    { v: 'after', l: 'after' },
    { v: 'not', l: 'not near' },
  ];
  // An empty term's example, so it never reads as entered.
  const TERM_EXAMPLES = ['ἀρετή', 'ἕξις', 'ἡδονή', 'λύπη'];

  interface LemmaMatch {
    key: string;
    count: number;              // tokens a search on this fold key returns
    candidates: LemmaCandidate[];
  }
  interface ComboEditor {
    id: number;
    kind: SlotKind;
    text: string;
    picked: string[];
    grammar: GrammarQuery;
    lemmaInput: string;
    lemmaMatches: LemmaMatch[];
    lemmaCapped: boolean;
    lemmaLoading: boolean;
    lemmaError: string;
    lemmaRequest: number;
    relation: SlotRelation;
    or: boolean;                 // joined to the term before by "or"
    targetId: number | null;     // the editor it is measured from; null = term 1
  }

  let nextComboId = 1;
  let nextLemmaRequest = 1;
  function newComboEditor(kind: SlotKind): ComboEditor {
    return {
      id: nextComboId++,
      kind,
      text: '',
      picked: [],
      grammar: {},
      lemmaInput: '',
      lemmaMatches: [],
      lemmaCapped: false,
      lemmaLoading: false,
      lemmaError: '',
      lemmaRequest: 0,
      relation: 'near',
      or: false,
      targetId: null,
    };
  }

  let comboEditors: ComboEditor[] = [newComboEditor('lemma'), newComboEditor('lemma')];

  // One dictionary word on its own. Combo could express it with a single slot,
  // but asking for every occurrence of a lemma is the commonest scholarly
  // question there is, and it should not cost the reader a proximity query to
  // ask. It reuses the combo lemma picker so both offer the same headword list.
  let soloLemma = newComboEditor('lemma');
  $: soloLemmaActive = soloLemma.picked.length > 0;

  // The picker edits whichever of these holds the id; combo slots live in an
  // array, the solo term on its own, so reads and writes go through these.
  function editorById(id: number): ComboEditor | undefined {
    return id === soloLemma.id ? soloLemma : comboEditors.find((slot) => slot.id === id);
  }
  function commitEditor(id: number) {
    if (id === soloLemma.id) soloLemma = soloLemma;
    else comboEditors = [...comboEditors];
  }
  let comboWindow = COMBO_WINDOW_DEFAULT;
  let comboUnit: WindowUnit = 'words';
  let comboOrdered = false;
  let comboCrossChapter = true;
  let lemmaGlosses: Record<string, string[]> = {};
  const lemmaGlossLoading = new Set<string>();

  const editorUsable = (ed: ComboEditor) =>
    ed.kind === 'grammatical' ? Object.keys(ed.grammar).length > 0 : ed.kind === 'lemma' ? ed.picked.length > 0 : !!ed.text.trim();
  // The editors as the engine and the address read them: terms that ask
  // nothing left out, or-runs joined, each target an index among the rest
  // (comboGroups). `ordered` comes in rather than from scope, so the
  // reactive statements below re-run when the lock is toggled.
  function editorGroups(editors: ComboEditor[]) {
    return comboGroups(editors.map((editor, i) => {
      const t = editor.targetId === null ? 0 : editors.findIndex(ed => ed.id === editor.targetId);
      return { editor, or: i > 0 && editor.or, relation: editor.relation, target: t > 0 && t < i ? t : 0 };
    }), j => editorUsable(j.editor));
  }
  // Before or after set the order themselves: the lock then binds nothing
  // (the editor says "Order set by before or after" in its place).
  const orderSet = (editors: ComboEditor[]) => editors.some((ed, i) =>
    i > 0 && !ed.or && (ed.relation === 'before' || ed.relation === 'after'));
  // The groups flattened back into slots, the first of each group carrying
  // its relation and target, the rest joined by "or".
  function flatSlots<T>(groups: ComboGroup<{ editor: ComboEditor }>[], make: (ed: ComboEditor) => T): (T & { relation: SlotRelation; or?: true; target?: number })[] {
    const first: number[] = [];
    let n = 0;
    for (const g of groups) { first.push(n); n += g.members.length; }
    return groups.flatMap(g => g.members.map((m, k) => ({
      ...make(m.editor),
      relation: g.relation,
      ...(k > 0 ? { or: true as const } : first[g.target] > 0 && k === 0 ? { target: first[g.target] } : {}),
    })));
  }
  function engineSlot(ed: ComboEditor): ComboSlot {
    if (ed.kind === 'grammatical') return { kind: ed.kind, query: { ...ed.grammar } };
    if (ed.kind === 'lemma') return { kind: ed.kind, terms: [...ed.picked] };
    const text = ed.text.trim();
    return { kind: ed.kind, terms: ed.kind === 'phrase' ? text.split(/\s+/) : [text] };
  }
  const urlSlot = (ed: ComboEditor) => ({ kind: ed.kind, text: ed.text, picked: [...ed.picked], grammar: { ...ed.grammar } });

  $: comboGroupsNow = editorGroups(comboEditors);
  $: comboSearchSlots = flatSlots(comboGroupsNow, engineSlot);
  $: comboOrderSet = orderSet(comboEditors);
  $: comboLocked = comboOrdered && !comboOrderSet;
  // A search whose first term is NOT has nothing for it to stand apart from,
  // so it is no proximity search, as with one term.
  // Grammar alone (ruling 3, John, 2026-11-10): one grammar term and no other
  // is a search too, run once something narrows it — fewer than all works or
  // a speaker (a second term makes it an ordinary combo). Unnarrowed, Search
  // stays enabled and pressing it shows the narrowing controls (option C2),
  // with no sentence of explanation; searchCombo refuses it in any case.
  $: grammarAlone = comboGroupsNow.length === 1 && comboGroupsNow[0].relation !== 'not'
    && comboGroupsNow[0].members.every(m => m.editor.kind === 'grammatical');
  $: comboReady = (comboGroupsNow.length >= 2 && comboGroupsNow[0].relation !== 'not') || grammarAlone;
  // The page is in proximity: a proximity search is what it shows (set when
  // one runs or arrives in the address, cleared by Turn off), or the editor
  // is open. Opening Options keeps a filled editor active until Turn off.
  let proxOn = false;
  let advancedOpen = false;
  $: comboActive = comboReady && (advancedOpen || proxOn);
  let narrowPrompt = false;
  $: comboOptions = {
    window: comboWindow,
    unit: comboUnit,
    ordered: comboLocked,
    crossChapter: comboCrossChapter,
    speaker: speakerFilter,
  } satisfies ComboOptions;

  // The editor's search as the address would write it; null until its terms
  // make one. Read against the last search's to tell a pending edit.
  function editorCombo(editors: ComboEditor[], window: number, unit: WindowUnit, locked: boolean, crossChapter: boolean): UrlCombo | null {
    const groups = editorGroups(editors);
    const ready = (groups.length >= 2 && groups[0].relation !== 'not')
      || (groups.length === 1 && groups[0].relation !== 'not' && groups[0].members.every(m => m.editor.kind === 'grammatical'));
    return ready ? { slots: flatSlots(groups, urlSlot), window, unit, ordered: locked, crossChapter } : null;
  }
  $: comboNow = editorCombo(comboEditors, comboWindow, comboUnit, comboLocked, comboCrossChapter);
  const comboKey = (c: UrlCombo | null | undefined) => (c ? JSON.stringify(c) : '');
  // What the proximity search shown is, in one sentence; and the editor's,
  // when it differs and is not yet searched (d28).
  $: proxLive = proxOn && !!lastSearch?.combo;
  // Pending whenever the open editor differs from the search shown, a
  // complete search or not (Codex review, 12 Nov): an edit that leaves too
  // few terms still leaves the results it no longer describes.
  $: comboPending = advancedOpen && comboKey(comboNow) !== comboKey(lastSearch?.combo);
  // What an editor that makes no search lacks, said when its Search is
  // pressed; any edit takes the line away.
  const comboMissing = (editors: ComboEditor[]) => {
    const groups = editorGroups(editors);
    return !groups.length ? 'Add two terms' : groups[0].relation === 'not' ? 'Fill term 1' : 'Add a second term';
  };
  let comboAsked = '';
  $: comboEditors, comboAsked = '';
  const headsOf = (info: typeof pickInfo) => (key: string) => info[key]?.heads.split(' · ')[0] ?? key;
  // The In value of a search's works: none for all works.
  const sameSet = (a: string[], b: Set<string>) => a.length === b.size && a.every(id => b.has(id));
  const inValue = (works: string[], chosen: Set<string>, label: string) =>
    works.length === WORK_IDS.length ? null
      : sameSet(works, new Set(AUTHENTIC_IDS)) ? 'authentic works'
      : sameSet(works, chosen) ? label
      : `${works.length} works`;
  $: proxSentence = proxLive && lastSearch?.combo
    ? proximitySentence(lastSearch.combo.slots, lastSearch.combo, headsOf(pickInfo), inValue(lastSearch.works, selectedWorks, worksValue), narrowScreen && advancedOpen) : '';
  // While proximity holds the box, it shows the terms, "; " between them
  // (John, 12 Nov): the search shown, or the open editor's before one is.
  $: proxTerms = !comboActive ? ''
    : proximityTerms((proxLive && lastSearch?.combo ? lastSearch.combo : comboNow)?.slots ?? [], headsOf(pickInfo));
  $: pendingSentence = comboPending && comboNow
    ? proximitySentence(comboNow.slots, comboNow, headsOf(pickInfo), inValue(WORK_IDS.filter(id => selectedWorks.has(id)), selectedWorks, worksValue)) : '';

  // Proximity opens the editor in one click (ruling 2), and shuts it.
  let proxTrigger: HTMLButtonElement | undefined;
  function toggleAdvanced() {
    advancedOpen = !advancedOpen;
    if (advancedOpen) { optsOpen = false; void seedFromQuery(); }
  }
  // A phone folds the options under "Options" (§5.7): open, they are a grid
  // of two columns; shut, a line under the row says what they are set to.
  // Options and the editor are open one at a time there. A wide screen
  // draws neither the link nor the line, so this never shows on it.
  let optsOpen = false;
  function toggleOpts() {
    optsOpen = !optsOpen;
    if (optsOpen) {
      if (advancedOpen && comboReady) proxOn = true;
      advancedOpen = false;
    }
    else for (const m of document.querySelectorAll<HTMLDetailsElement>('.sopt:not(.sx-display) .opt[open]')) m.open = false;
  }
  $: optsLine = optionWords(lang, soloLemmaActive ? 'any' : grkMode, engMode, soloLemmaActive ? 'lemma' : matchMode, engForms, accentSensitive, punctuation, lemmaOn, langOp, soloLemmaActive && !!engQuery.trim(), worksValue);
  function optionWords(lang: Lang, gm: SearchMode, em: SearchMode, form: MatchMode | 'text', engAny: boolean, accents: boolean,
    stops: boolean, lemma: boolean, op: LangOp, joined: boolean, works: string): string[] {
    const g = lang !== 'english', en = lang !== 'greek';
    const both = (gw: string | null, ew: string | null) =>
      !gw ? (ew ? [ew] : []) : !ew || gw === ew ? [gw] : [`Greek ${gw}`, `English ${ew}`];
    const gForm = form === 'text' ? 'running text' : form === 'lemma' ? 'any form' : 'as typed';
    return [
      ...both(g && form !== 'text' ? lower1(modeLabel(gm)) : null, en ? lower1(modeLabel(em)) : null),
      ...both(g ? gForm : null, en ? (engAny ? 'any form' : 'as typed') : null),
      ...(g ? [accents ? 'accents observed' : 'accents ignored'] : []),
      ...(g && form === 'text' && stops ? ['punctuation observed'] : []),
      ...(g && form !== 'text' && lemma ? ['by lemma'] : []),
      ...(lang === 'both' || joined ? [op === 'and' ? 'both languages' : 'either language'] : []),
      `in ${works}`,
    ];
  }
  // The settings of the results that are not their defaults, in red after
  // the options ("grouped by grammar").
  $: viewLine = [
    ...(view !== 'page' ? [`grouped by ${VIEWS.find(v => v.id === view)?.value ?? view}`] : []),
    ...(sort !== 'page' ? [lower1(SORTS.find(v => v.id === sort)?.value ?? sort)] : []),
    ...(context !== '3' ? [CONTEXTS.find(v => v.id === context)?.value ?? context] : []),
    ...(pageSize === 'c' ? ['citations only'] : pageSize !== '40' ? [`${pageSize} per page`] : []),
  ];
  async function closeEditor() {
    advancedOpen = false;
    await tick();
    proxTrigger?.focus();
  }
  async function openEditor() {
    optsOpen = false;
    advancedOpen = true;
    await tick();
    document.querySelector<HTMLElement>('#advanced-tools .combo-slot :is(input, select, button)')?.focus();
  }
  // The editor's Search: the page is in proximity from now on. An editor
  // that makes no search says what it lacks, and nothing is searched.
  function searchEditor(e: MouseEvent) {
    if (!comboNow) {
      e.preventDefault();
      comboAsked = comboMissing(comboEditors);
      return;
    }
    proxOn = true;
  }
  // Measure the whole bar, including wrapped text, border and safe area.
  // Both reserves inherit this value; only the narrow layout uses it.
  function reserveProxBar(node: HTMLElement) {
    const frame = node.closest<HTMLElement>('.frame.dir-b') ?? node.closest<HTMLElement>('.search-page');
    const measure = () => frame?.style.setProperty('--prox-bar-height', `${node.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(node, { box: 'border-box' });
    measure();
    return { destroy() {
      observer.disconnect();
      frame?.style.removeProperty('--prox-bar-height');
    } };
  }
  // Turn off: back to the search the boxes hold, or to the empty page.
  async function turnOffProximity() {
    proxOn = false;
    advancedOpen = false;
    comboEditors = [newComboEditor('lemma'), newComboEditor('lemma')];
    comboWindow = COMBO_WINDOW_DEFAULT;
    comboUnit = 'words';
    comboOrdered = false;
    comboCrossChapter = true;
    await tick();
    if (grkQuery.trim() || engQuery.trim() || soloLemmaActive) await doSearch();
    else {
      window.history.pushState(null, '', window.location.pathname);
      pageUrl = here();
      await searchFromUrl();
    }
    await tick();
    proxTrigger?.focus();
  }

  // Term 1 takes the page's query when the editor opens on one (the mock-up's
  // empty term 1 was a defect): each typed word a term in turn, as the Form
  // menu reads it (any form: the dictionary word it is a form of), or the
  // whole query one phrase. Only into an editor nobody has filled.
  async function seedFromQuery() {
    if (comboEditors.some(editorUsable) || comboEditors.some(ed => ed.lemmaInput.trim())) return;
    const ids = comboEditors.map(ed => ed.id).join();
    let fill: ComboEditor[];
    if (soloLemmaActive) {
      fill = [{ ...newComboEditor('lemma'), picked: [...soloLemma.picked] }];
    } else {
      const query = lang === 'english' ? '' : grkQuery.trim();
      if (!query) return;
      const words = query.split(/\s+/).map(w => (greekScript(w) ? w : betaQueryToGreek(w)));
      if (grkMode === 'phrase' && words.length > 1) {
        fill = [{ ...newComboEditor('phrase'), text: words.join(' ') }];
      } else if (matchMode === 'form') {
        fill = words.slice(0, COMBO_TERMS_MAX).map(w => ({ ...newComboEditor('form'), text: w }));
      } else {
        fill = await Promise.all(words.slice(0, COMBO_TERMS_MAX).map(async w => {
          const ed = newComboEditor('lemma');
          const keys = await headwordKeys(w);
          if (keys.length) ed.picked = keys;
          else ed.lemmaInput = w;
          return ed;
        }));
      }
    }
    // Filled meanwhile, or rebuilt: leave it.
    if (comboEditors.map(ed => ed.id).join() !== ids || comboEditors.some(editorUsable)) return;
    comboEditors = [...fill, ...comboEditors.slice(fill.length)];
    if (comboEditors.length < 2) comboEditors = [...comboEditors, newComboEditor('lemma')];
    void fillPickInfo(fill.flatMap(ed => ed.picked));
    for (const ed of fill) if (ed.lemmaInput) void searchLemmaChoices(ed.id, ed.lemmaInput);
  }
  // The picker's keys for a typed word: itself when it is a dictionary word,
  // else the dictionary words the corpus map files it under.
  async function headwordKeys(word: string): Promise<string[]> {
    const fold = greekFold(word);
    if (!fold) return [];
    const has = async (key: string) => {
      try { return Object.hasOwn(await fetchLemmaPickerShard(/^[a-z]/.test(key) ? key[0] : '_'), key); } catch { return false; }
    };
    if (await has(fold)) return [fold];
    const heads = (await lemmaOptions([fold]))?.[0] ?? [];
    const found = await Promise.all(heads.map(async h => ((await has(h)) ? h : '')));
    return found.filter(Boolean);
  }

  function setComboKind(id: number, kind: SlotKind) {
    const index = comboEditors.findIndex((slot) => slot.id === id);
    if (index < 0 || comboEditors[index].kind === kind) return;
    // The joiner, relation and target are the term's place, not its kind.
    const { relation, or, targetId } = comboEditors[index];
    comboEditors[index] = { ...newComboEditor(kind), id, relation, or, targetId };
    comboEditors = [...comboEditors];
  }

  function setComboRelation(id: number, relation: SlotRelation) {
    const editor = comboEditors.find((slot) => slot.id === id);
    if (!editor) return;
    editor.relation = relation;
    // A NOT term is no word of the match: what was measured from it is
    // measured from what it is measured from.
    if (relation === 'not') for (const ed of comboEditors) if (ed.targetId === id) ed.targetId = editor.targetId;
    comboEditors = [...comboEditors];
  }

  function setComboJoin(id: number, or: boolean) {
    const editor = comboEditors.find((slot) => slot.id === id);
    if (!editor) return;
    editor.or = or;
    comboEditors = [...comboEditors];
  }

  function setComboTarget(id: number, targetId: number | null) {
    const editor = comboEditors.find((slot) => slot.id === id);
    if (!editor) return;
    editor.targetId = targetId;
    comboEditors = [...comboEditors];
  }

  function setComboText(id: number, text: string) {
    const editor = comboEditors.find((slot) => slot.id === id);
    if (!editor) return;
    editor.text = text;
    comboEditors = [...comboEditors];
  }

  // The earlier terms a term may be measured from: the first of each
  // or-run, never a NOT term, named by its word ("term 2" while empty).
  function targetChoices(editors: ComboEditor[], index: number, info: typeof pickInfo): { id: number | null; label: string }[] {
    const out: { id: number | null; label: string }[] = [];
    for (let i = 0; i < index; i++) {
      const ed = editors[i];
      if (i > 0 && (ed.or || ed.relation === 'not')) continue;
      const run = [ed];
      for (let k = i + 1; k < editors.length && editors[k].or; k++) run.push(editors[k]);
      const names = run.map(r => (editorUsable(r) ? termWords({ ...r }, headsOf(info)) : '')).filter(Boolean);
      out.push({ id: i === 0 ? null : ed.id, label: names.length ? names.join(' or ') : `term ${i + 1}` });
    }
    return out;
  }
  // What a term is measured from, as its select shows it: the editor named,
  // unless that one is now an or-joined term (then the first of its run) or
  // a NOT term (then what that one is measured from), as comboGroups reads it.
  function shownTarget(editors: ComboEditor[], index: number): number | null {
    let id = editors[index].targetId;
    for (let guard = 0; id !== null && guard < editors.length; guard++) {
      let t = editors.findIndex(ed => ed.id === id);
      if (t < 1 || t >= index) return null;
      while (t > 0 && editors[t].or) t--;
      if (t === 0) return null;
      if (editors[t].relation !== 'not') return editors[t].id;
      id = editors[t].targetId;
    }
    return null;
  }
  // The chips' short names, as round 34 sets them.
  const CHIP_NAMES: Record<string, string> = { imperat: 'imper', futperf: 'fut perf', mp: 'mid/pass', irreg_comp: 'irreg' };
  // The term number of the first of an or-run, for "as term n".
  const runHead = (editors: ComboEditor[], index: number) => {
    let i = index;
    while (i > 0 && editors[i].or) i--;
    return i + 1;
  };

  // Shown in place of results; the focus goes to the first button when the
  // reader pressed Search, so a screen reader hears where they are.
  async function showNarrowPrompt(history: 'push' | 'none') {
    narrowPrompt = true;
    searched = false;
    loading = false;
    error = '';
    allResults = [];
    if (lastSearch) {
      lastSearch = { ...lastSearch, xforms: [], facets: {} };
      if (history === 'push') writeUrl(lastSearch, 'push');
    }
    if (history === 'push') {
      await tick();
      document.querySelector<HTMLElement>('.narrow-prompt button')?.focus();
    }
  }

  // The narrowing controls a lone grammar term asks for (option C2). Each
  // opens the control and puts the focus in it; the reader searches again.
  async function openNarrower(which: 'works' | 'speakers' | 'word') {
    if (which === 'works') { worksOpen = true; speakerOpen = false; }
    if (which === 'speakers') { speakerOpen = true; worksOpen = false; }
    let target = which === 'works' ? '#works-panel' : which === 'speakers' ? '#speaker-panel' : '';
    if (which === 'word') {
      let free = comboEditors.find(ed => ed.kind !== 'grammatical' && !ed.text.trim() && !ed.picked.length);
      if (!free) {
        addComboEditor();
        free = comboEditors[comboEditors.length - 1];
      }
      target = `[aria-labelledby="combo-slot-${free.id}"]`;
      advancedOpen = true;
    }
    await tick();
    const panel = document.querySelector<HTMLElement>(target);
    panel?.scrollIntoView({ block: 'start' });
    // The works chooser opens on "Select all" (disabled while every work is
    // in) and "Clear", no place to land: the focus goes to the first work.
    // The speaker panel opens on "Anyone", which narrows nothing: the focus
    // goes to "Only these speakers".
    // Tried in this order: a selector list would take whichever comes first
    // in the page, and "Anyone" comes first.
    const field = ['.work-chip', 'input[value="only"]', 'input:not([type=hidden]):not(:disabled), select:not(:disabled)', 'button:not(:disabled)']
      .map(sel => panel?.querySelector<HTMLElement>(sel)).find(Boolean);
    field?.focus({ preventScroll: true });
  }

  // A fresh empty term, any form, near term 1 (it copies nothing: the
  // mock-up's copy of the last term was a defect).
  async function addComboEditor() {
    if (comboEditors.length >= COMBO_TERMS_MAX) return;
    const ed = newComboEditor('lemma');
    comboEditors = [...comboEditors, ed];
    await tick();
    document.getElementById(`lemma-${ed.id}`)?.focus();
  }

  // What was measured from a removed term is measured from what it was; an
  // or-run's next term takes its place. A removed member of an or-run leaves
  // its run standing: what was measured from it is measured from the member
  // before it, which is the same term (Codex review, 12 Nov).
  function removeComboEditor(id: number) {
    const index = comboEditors.findIndex((slot) => slot.id === id);
    if (index < 1) return;
    const gone = comboEditors[index];
    const next = comboEditors[index + 1];
    const heir = next?.or && !gone.or ? next : null;
    if (heir) Object.assign(heir, { or: false, relation: gone.relation, targetId: gone.targetId });
    const standIn = heir ? heir.id : gone.or ? comboEditors[index - 1].id : gone.targetId;
    for (const ed of comboEditors) if (ed.targetId === id) ed.targetId = standIn;
    comboEditors = comboEditors.filter((slot) => slot.id !== id);
  }

  // One value per category: a chip picks it, the chosen chip unpicks it.
  function setComboGrammar(id: number, key: string, value: string) {
    const editor = comboEditors.find((slot) => slot.id === id);
    if (!editor) return;
    const next = { ...editor.grammar };
    if (value && next[key] !== value) next[key] = value; else delete next[key];
    editor.grammar = next;
    comboEditors = [...comboEditors];
  }

  // Commonest first, not alphabetical: typing "log" should offer λόγος
  // before λόγιον. Candidates within a key are already frequency-ordered by
  // the build, so the first one carries the key's weight. Ties fall back to
  // alphabetical so the list is stable. The panel and the Greek box's
  // suggestions both rank this way.
  function rankLemmaChoices(shard: Record<string, LemmaChoice>, folded: string): LemmaMatch[] {
    return Object.entries(shard)
      .filter(([key]) => key.startsWith(folded))
      .sort(([a, ca], [b, cb]) => cb.n - ca.n || a.localeCompare(b))
      .map(([key, choice]) => ({ key, count: choice.n, candidates: choice.c }));
  }
  const lemmaHeads = (m: LemmaMatch) => (m.candidates.length ? m.candidates.map((c) => c.h).join(' · ') : m.key);

  async function searchLemmaChoices(id: number, input: string) {
    const editor = editorById(id);
    if (!editor) return;
    editor.lemmaInput = input;
    editor.lemmaMatches = [];
    editor.lemmaCapped = false;
    editor.lemmaError = '';
    const folded = greekFold(input.trim());
    // Counted across the panel, not per editor: changing a slot's kind swaps in
    // a fresh editor under the same id, so a per-editor counter would restart
    // and let an in-flight response from the old editor pass the staleness check.
    const request = nextLemmaRequest++;
    editor.lemmaRequest = request;
    if (!folded) {
      editor.lemmaLoading = false;
      commitEditor(id);
      return;
    }
    editor.lemmaLoading = true;
    commitEditor(id);
    const letter = /^[a-z]/.test(folded) ? folded[0] : '_';
    try {
      const shard = await fetchLemmaPickerShard(letter);
      const found = rankLemmaChoices(shard, folded);
      const current = editorById(id);
      if (!current || current.lemmaRequest !== request) return;
      current.lemmaMatches = found.slice(0, 30);
      current.lemmaCapped = found.length > 30;
      current.lemmaLoading = false;
      commitEditor(id);
    } catch {
      const current = editorById(id);
      if (!current || current.lemmaRequest !== request) return;
      current.lemmaLoading = false;
      current.lemmaError = 'Lemma choices could not be loaded. Try typing again.';
      commitEditor(id);
    }
  }

  // What a picked key looks like, kept from the list it was picked in, so the
  // picked row can show headword, gloss and count after the list is gone. A
  // key restored from the address bar has none and shows as the key.
  let pickInfo: Record<string, { heads: string; slug?: string; count: number }> = {};

  function toggleComboLemma(id: number, key: string, info?: { heads: string; slug?: string; count: number }) {
    const editor = editorById(id);
    if (!editor) return;
    if (info) pickInfo = { ...pickInfo, [key]: info };
    if (editor.picked.includes(key)) {
      editor.picked = editor.picked.filter((picked) => picked !== key);
    } else {
      editor.picked = [...editor.picked, key];
      // A pick closes the list, as choosing from a field does.
      editor.lemmaInput = '';
      editor.lemmaMatches = [];
      editor.lemmaCapped = false;
    }
    commitEditor(id);
  }

  // A pick from the list: the focus goes to its Change, the field being gone.
  async function pickComboLemma(id: number, key: string, info: { heads: string; slug?: string; count: number }) {
    toggleComboLemma(id, key, info);
    await tick();
    document.querySelector<HTMLElement>(`[aria-labelledby="combo-slot-${id}"] .lpsel .x`)?.focus();
  }

  // Change: the pick goes, and the focus to the field it leaves.
  async function changeComboLemma(id: number, key: string) {
    toggleComboLemma(id, key);
    await tick();
    document.getElementById(`lemma-${id}`)?.focus();
  }

  // Picks restored from the address bar arrive as bare keys. Read each one's
  // headwords and count back from its picker shard, so the picked row reads as
  // it did when it was chosen.
  async function fillPickInfo(keys: string[]) {
    for (const key of keys) {
      if (pickInfo[key]) continue;
      try {
        const shard = await fetchLemmaPickerShard(/^[a-z]/.test(key) ? key[0] : '_');
        const choice = Object.hasOwn(shard, key) ? shard[key] : undefined;
        if (!choice) continue;
        const slug = choice.c.find((c) => c.s)?.s;
        pickInfo = { ...pickInfo, [key]: { heads: choice.c.length ? choice.c.map((c) => c.h).join(' · ') : key, slug, count: choice.n } };
        if (slug) loadLemmaGlosses(slug);
      } catch { /* the key stands for itself */ }
    }
  }

  async function loadLemmaGlosses(slug: string) {
    if (lemmaGlosses[slug] || lemmaGlossLoading.has(slug)) return;
    lemmaGlossLoading.add(slug);
    try {
      // Awaited before the map is copied: a list opens several of these at
      // once, and a copy taken before the await would let the last one to
      // land write back a map without the others' glosses.
      const glosses = await fetchLemmaGlosses(slug);
      lemmaGlosses = { ...lemmaGlosses, [slug]: glosses };
    } catch {
      lemmaGlosses = { ...lemmaGlosses, [slug]: [] };
    } finally {
      lemmaGlossLoading.delete(slug);
    }
  }

  function glossOnMount(_node: HTMLElement, slug?: string) {
    if (slug) loadLemmaGlosses(slug);
    return {
      update(next?: string) {
        if (next) loadLemmaGlosses(next);
      },
    };
  }

  function clampComboWindow() {
    comboWindow = Math.max(1, Math.min(Number(comboWindow) || COMBO_WINDOW_DEFAULT, COMBO_WINDOW_MAX));
  }

  // Shared option list for the per-language mode selectors.
  // Each with the one-line gloss its menu shows under it.
  const MODE_OPTS: { v: SearchMode; l: string; g: string }[] = [
    { v: 'all', l: 'All words', g: 'every word, anywhere in the passage' },
    { v: 'any', l: 'Any word', g: 'at least one of them' },
    { v: 'phrase', l: 'Exact phrase', g: 'these words, in this order' },
  ];

  function toggleWork(id: string) {
    if (selectedWorks.has(id)) { if (selectedWorks.size > 1) selectedWorks.delete(id); }
    else selectedWorks.add(id);
    selectedWorks = selectedWorks; // reactivity
  }

  // "Select all" reflects the true all-selected state: deselecting any single
  // work flips it off automatically (no fire-and-forget flag). Toggling it on
  // selects every work; toggling it off clears the selection.
  $: allSelected = selectedWorks.size === WORKS.length;
  function selectAll() { selectedWorks = new Set(WORKS.map(w => w.id)); }
  function clearWorks() { selectedWorks = new Set(); }

  // Per-group scope helpers for the works panel. "only" narrows the selection to
  // exactly this division; "add" unions the division into the current selection.
  function groupState(ids: string[]): 'all' | 'some' | 'none' {
    const n = ids.filter(id => selectedWorks.has(id)).length;
    return n === 0 ? 'none' : n === ids.length ? 'all' : 'some';
  }
  function selectOnly(ids: string[]) { selectedWorks = new Set(ids); }
  function addGroup(ids: string[]) {
    for (const id of ids) selectedWorks.add(id);
    selectedWorks = selectedWorks;
  }

  // Authenticity scope — quick-filter the selection by authorship status.
  // "Authentic" = works with no authenticity flag (or explicitly 'genuine');
  // the others match the tagged works. Each acts like a division "only": clicking it
  // narrows the selection to exactly that class. Empty classes render disabled.
  const AUTH_SCOPES = [
    { key: 'all',      label: 'All',      ids: WORKS.map((w) => w.id) },
    { key: 'genuine',  label: 'Authentic', ids: AUTHENTIC_IDS },
    { key: 'dubious',  label: 'Dubious',  ids: WORKS.filter((w) => w.authenticity === 'dubious').map((w) => w.id) },
    { key: 'spurious', label: 'Spurious', ids: WORKS.filter((w) => w.authenticity === 'spurious').map((w) => w.id) },
  ] as const;
  // Which scope (if any) the current selection exactly matches — drives the active pill.
  $: activeAuthScope = allSelected
    ? 'all'
    : (AUTH_SCOPES.find(
        (s) => s.key !== 'all' && s.ids.length > 0 &&
          s.ids.length === selectedWorks.size && s.ids.every((id) => selectedWorks.has(id)),
      )?.key ?? null);

  // Compact summary for the collapsed trigger.
  $: worksSummary = allSelected
    ? 'All works'
    : selectedWorks.size === 0
      ? 'None selected'
      : `${selectedWorks.size} of ${WORKS.length}`;

  // ── In: all works, the authentic works, or a choice ────────────────────────
  // A menu like Match (ruling 1). Authentic is a selection like any other,
  // the one the authenticity flags give; "Choose works…" opens the picker.
  type WorksScope = 'all' | 'auth' | 'pick';
  const WORKS_SCOPES: { v: WorksScope; l: string; g: string }[] = [
    { v: 'all', l: 'All works', g: 'dubious and spurious included' },
    { v: 'auth', l: 'Authentic works', g: `the ${AUTHENTIC_IDS.length} authentic works only` },
    { v: 'pick', l: 'Choose works…', g: 'pick works from the list' },
  ];
  $: worksScope = (allSelected ? 'all' : activeAuthScope === 'genuine' ? 'auth' : 'pick') as WorksScope;
  $: worksValue = worksScope === 'all' ? 'all works' : worksScope === 'auth' ? 'authentic works' : lower1(worksSummary);
  // On click, not change: "Choose works…" is already the checked radio when
  // the selection is a choice, and must still open the picker.
  async function setWorksScope(v: WorksScope, e: Event) {
    if (v === 'all') selectAll();
    else if (v === 'auth') selectOnly(AUTHENTIC_IDS);
    else {
      // The radios follow the selection, which opening the picker has not
      // changed yet.
      const menu = (e.currentTarget as HTMLElement).closest('details');
      menu?.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach((r) => { r.checked = r.value === worksScope; });
      if (menu) menu.open = false;
      worksOpen = true;
      speakerOpen = false;
      await tick();
      document.querySelector<HTMLElement>('#works-panel .work-chip')?.focus();
    }
  }
  function closeWorks() {
    worksOpen = false;
    document.querySelector<HTMLElement>('.opt-in > summary')?.focus();
  }
  // The picker's "Find a work": title or abbreviation, any case.
  let worksFind = '';
  function findsWork(id: string, find: string): boolean {
    const q = find.trim().toLowerCase();
    if (!q) return true;
    const w = getWork(id);
    return !!w && (w.title.toLowerCase().includes(q) || w.abbr.toLowerCase().includes(q) || id.toLowerCase().includes(q));
  }

  // ── Spoken by ──────────────────────────────────────────────────────────────
  //
  // The TLG labels every change of speaker, so each Greek word in a dialogue
  // has a speaker, and a search can be held to one: ἀρετή in Socrates' mouth
  // only, or anywhere but. The cast is read from each selected work's turn
  // bounds (offsets.json), fetched only once this control is switched on. The
  // narrated works carry no labels in the OCT and so have no cast here; a
  // filtered search leaves them out and says so.
  type SpeakerMode = 'anyone' | 'only' | 'except';
  let speakerMode: SpeakerMode = 'anyone';
  let speakerNames = new Set<string>();
  let speakerOpen = false;
  let roster: SpeakerRosterEntry[] = [];
  let rosterLoading = false;
  let rosterError = '';
  // The request the roster on screen answers; a stale response is discarded.
  let rosterKey = '';

  $: rosterWanted = speakerMode !== 'anyone' ? [...selectedWorks].sort().join(',') : '';
  $: if (rosterWanted && rosterWanted !== rosterKey) loadRoster(rosterWanted);

  async function loadRoster(key: string) {
    rosterKey = key;
    rosterLoading = true;
    rosterError = '';
    try {
      const works = WORKS.map(w => w.id).filter(id => selectedWorks.has(id));
      const entries = await speakerRoster(works);
      if (rosterKey !== key) return;
      roster = entries;
      // Drop ticked names that no selected work has.
      // Prune ticked names no selected work has — but only against the works
      // that actually loaded. A work whose offsets.json failed contributes no
      // names, so pruning against it would silently untick a speaker who lives
      // only there, and unticking the last one turns the filter off entirely:
      // the next search would run over the whole corpus while the panel still
      // read as filtered. When anything failed, keep the selection as it is.
      if (entries.every(e => e.loaded)) {
        const present = new Set(entries.flatMap(e => e.speakers.map(s => s.name)));
        const kept = [...speakerNames].filter(n => present.has(n));
        if (kept.length !== speakerNames.size) speakerNames = new Set(kept);
      }
    } catch (err) {
      if (rosterKey !== key) return;
      rosterError = err instanceof Error ? err.message : String(err);
    } finally {
      if (rosterKey === key) rosterLoading = false;
    }
  }

  // One row per speaker across the selected works: total turns, and how many
  // works they appear in. Most turns first, so Socrates heads every list he is
  // in and a walk-on part sits at the end.
  $: cast = (() => {
    const by = new Map<string, { name: string; turns: number; works: number }>();
    for (const e of roster) {
      for (const s of e.speakers) {
        const row = by.get(s.name) ?? { name: s.name, turns: 0, works: 0 };
        row.turns += s.turns;
        row.works += 1;
        by.set(s.name, row);
      }
    }
    return [...by.values()].sort((a, b) => b.turns - a.turns || a.name.localeCompare(b.name));
  })();
  const workTitle = (id: string) => getWork(id)?.title ?? id;
  $: unlabelledWorks = roster.filter(e => e.loaded && !e.narrator && !e.speakers.length).map(e => workTitle(e.work));
  // Works reported by a narrator: the labels are the frame, not the speeches,
  // so the filter leaves them out — said apart from the works with no labels.
  $: narratedWorks = roster.filter(e => e.loaded && e.narrator).map(e => `${workTitle(e.work)} (${e.narrator})`);
  $: rosterFailedWorks = roster.filter(e => !e.loaded).map(e => workTitle(e.work));
  // Works whose turn starts were matched only to a line of Greek: every word
  // between the true boundary and the snapped one is attributed to the wrong
  // speaker, which a filtered result has to admit rather than imply away.
  $: approxRosterWorks = roster.filter(e => e.approximate && !e.narrator).map(e => workTitle(e.work));
  // Whether `roster` actually describes the works now selected. The note under
  // the results is written from it, so while a reload is in flight it would
  // otherwise name the previous selection's exclusions.
  $: rosterFresh = rosterKey === rosterWanted && !rosterLoading && !rosterError;

  function toggleSpeaker(name: string) {
    if (speakerNames.has(name)) speakerNames.delete(name);
    else speakerNames.add(name);
    speakerNames = speakerNames;
  }
  function clearSpeakers() { speakerNames = new Set(); }

  // The filter a search runs with: nothing until a mode is chosen AND a name
  // is ticked, so switching the mode on cannot by itself empty the results.
  $: speakerFilter = (SPEAKERS && speakerMode !== 'anyone' && speakerNames.size
    ? { mode: speakerMode, names: [...speakerNames] }
    : undefined) as SpeakerFilter | undefined;

  const listNames = (names: string[]) =>
    names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  $: speakerSummary = speakerMode === 'anyone'
    ? 'Anyone'
    : !speakerNames.size
      ? (speakerMode === 'only' ? 'Only… (pick a speaker)' : 'Anyone but… (pick a speaker)')
      : `${speakerMode === 'only' ? 'Only' : 'Anyone but'} ${listNames([...speakerNames])}`;

  // Frozen at search time so the note under the results describes the search
  // that ran, not the control as it stands now.
  let speakerNote = '';
  // The works a filtered search ran over. Its note names the works the filter
  // left out, which only the cast of those works can say; a search arriving
  // from the address bar runs before the cast has loaded, so the note is
  // written again once it has, and only for those works.
  let speakerNoteKey = '';
  $: if (speakerNoteKey && rosterFresh && rosterKey === speakerNoteKey) {
    speakerNote = describeSpeakerFilter(searchCtx.speaker);
  }
  // One plain line (John, 2026-11-09): who the results are held to, and the
  // one thing their reader must be told, that narrated works are not among
  // them. A filtered search skips those silently, and a Republic with no hits
  // would otherwise read as "Socrates never says it". Which works, and the
  // rest of the fine print, is in the Spoken-by panel.
  function describeSpeakerFilter(filter: SpeakerFilter | undefined): string {
    if (!filter) return '';
    const who = listNames(filter.names);
    let note = filter.mode === 'only' ? `${who} only.` : `Anyone but ${who}.`;
    // Only from a roster that describes this search's works; a stale one would
    // claim an exclusion that did not happen, and saying nothing is better.
    if (rosterFresh && (unlabelledWorks.length || narratedWorks.length)) {
      note += ' Narrated works are left out: a speaker’s words cannot be picked out in them.';
    }
    return note;
  }

  // The page's hits as the view groups them. A section is a work holding
  // one group, the fold under its heading (work view), or the whole page
  // (form and grammar views); the groups keep the instances in corpus order.
  // A group's hits come in runs: by work, a run for each chapter, under a
  // line naming it (ruling 17), and a line naming the book where a work has
  // several; in the other views, one run. John, 2026-11-10: no Stephanus
  // page headings, they "just add clicks".
  interface ViewRun {
    key: string;
    book?: { label: string; hits: number };
    chapter?: { n: string; title?: string };
    instances: Instance[];
  }
  interface ViewGroup { key: string; label: string; greek?: boolean; instances: Instance[]; runs: ViewRun[] }
  interface ViewSection { key: string; work?: string; groups: ViewGroup[] }
  function sectionsFor(groups: ChapterGroup[], v: ResultView, by: ResultSort): ViewSection[] {
    // The sort orders the page's hits before the view groups them; a form is
    // counted over the whole page.
    const title = (work: string) => getWork(work)?.title ?? work;
    // A form's frequency is its Greek hits: an English row a hit carries is
    // no occurrence of the form.
    const itemOf = (inst: Instance) => ({ inst, work: inst.work, form: inst.lang === 'grk' ? inst.form : undefined, surface: inst.surface, surfaces: inst.surfaces, hits: hitsIn(inst), grk: inst.grkHits ?? 0 });
    const freq = new Map<string, number>();
    for (const g of groups) for (const inst of g.instances) {
      for (const hit of inst.forms ?? [inst]) {
        if (hit.lang === 'grk' && hit.form) freq.set(hit.form, (freq.get(hit.form) ?? 0) + (hit.grkHits ?? 0));
      }
    }
    const ordered = (list: Instance[], s: ResultSort) => orderHits(list.map(itemOf), s, title, freq).map(x => x.inst);
    if (v === 'form' || v === 'grammar') {
      // The groups by form A–Z under "by form", else most hits first; under
      // "by work" the hits in each group by work.
      const items = groups.flatMap(g => g.instances.flatMap(inst => inst.forms ?? [inst]).map(itemOf));
      const formed = formGroupsOf(by === 'work' ? orderHits(items, 'work', title) : items);
      if (by === 'form') formed.sort((a, b) => (a.form === null ? 1 : 0) - (b.form === null ? 1 : 0) || (a.form && b.form ? compareForms(a.form, b.form) : 0));
      return [{
        key: v,
        groups: formed.map(fg => {
          const key = fg.form === null ? `${v}::english` : `${v}:f:${fg.form}`;
          const instances = fg.items.map(item => item.inst);
          // A dot stays on the line of the form after it.
          return { key, label: fg.form === null ? 'English' : fg.surfaces.join(' ·\u00a0'), greek: fg.form !== null, instances, runs: [{ key, instances }] };
        }),
      }];
    }
    // groups arrive in corpus order (buildGroups), so works, books and
    // chapters are met in that order. Sorted by form, a book's hits are one
    // run: a chapter line over hits out of chapter order would name none of
    // them.
    const byChapter = by === 'page' || by === 'work';
    const sections = new Map<string, ViewSection>();
    for (const g of groups) {
      let sec = sections.get(g.work);
      if (!sec) {
        sec = { key: `page:${g.work}`, work: g.work, groups: [{ key: `page:${g.work}`, label: title(g.work), instances: [], runs: [] }] };
        sections.set(g.work, sec);
      }
      const vg = sec.groups[0];
      vg.instances.push(...g.instances);
      const w = getWork(g.work);
      const last = vg.runs.at(-1);
      const sameBook = last?.key.startsWith(`${g.work}:${g.book}:`);
      // Stephanus works are paged, not chaptered: no line for them.
      const named = byChapter && g.chapter !== '—' && schemeFor(g.work).id !== 'stephanus';
      if (!byChapter && sameBook && last) { last.instances.push(...g.instances); continue; }
      vg.runs.push({
        key: `${g.work}:${g.book}:${byChapter ? g.chapter : ''}`,
        book: !sameBook && (w?.bookLabels.length ?? 0) > 1 ? { label: w?.bookLabels[g.book - 1] ?? String(g.book), hits: 0 } : undefined,
        chapter: named ? { n: g.chapter, title: g.title } : undefined,
        instances: [...g.instances],
      });
    }
    for (const sec of sections.values()) {
      const vg = sec.groups[0];
      if (by === 'form' || by === 'freq') for (const run of vg.runs) run.instances = ordered(run.instances, by);
      // The book line counts the book's hits on the page.
      let head: ViewRun | undefined;
      for (const run of vg.runs) {
        if (run.book) head = run;
        if (head?.book) head.book.hits += groupHits(run);
      }
    }
    const list = [...sections.values()];
    return by === 'work' ? list.sort((a, b) => title(a.work!).localeCompare(title(b.work!))) : list;
  }
  $: viewSections = sectionsFor(groups, view, sort);
  // By work a reference is the section alone, so its column is narrow, unless
  // a hit on the page puts a speaker's name or a reading's note under it.
  $: narrowRefs = view === 'page' && !viewSections.some(sec => sec.groups.some(g => g.instances.some(inst =>
    inst.speaker || noteOf(inst, grammarAt, facets, more.has(inst)))));
  // Every heading starts open (John, 2026-11-10): no hit waits behind a click.
  $: expanded = new Set(viewSections.flatMap(sec => sec.groups.map(g => g.key)));

  // A shut group is not in the page, so it would not print: every group is
  // opened for printing, and the ones the reader had shut are shut after.
  let openBeforePrint: Set<string> | null = null;
  function openForPrint() {
    openBeforePrint = new Set(expanded);
    expanded = new Set(viewSections.flatMap(sec => sec.groups.map(g => g.key)));
  }
  function closeAfterPrint() {
    if (openBeforePrint) expanded = openBeforePrint;
    openBeforePrint = null;
  }

  function toggle(key: string) {
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
    expanded = expanded; // trigger reactivity
  }

  // Beta Code reference for the "How to type Greek" chart. Keys are the same
  // letters the search index uses, so anything typed here matches directly.
  const BETA_LETTERS: { beta: string; greek: string; name: string }[] = [
    { beta: 'a', greek: 'α', name: 'alpha' },
    { beta: 'b', greek: 'β', name: 'beta' },
    { beta: 'g', greek: 'γ', name: 'gamma' },
    { beta: 'd', greek: 'δ', name: 'delta' },
    { beta: 'e', greek: 'ε', name: 'epsilon' },
    { beta: 'z', greek: 'ζ', name: 'zeta' },
    { beta: 'h', greek: 'η', name: 'eta' },
    { beta: 'q', greek: 'θ', name: 'theta' },
    { beta: 'i', greek: 'ι', name: 'iota' },
    { beta: 'k', greek: 'κ', name: 'kappa' },
    { beta: 'l', greek: 'λ', name: 'lambda' },
    { beta: 'm', greek: 'μ', name: 'mu' },
    { beta: 'n', greek: 'ν', name: 'nu' },
    { beta: 'c', greek: 'ξ', name: 'xi' },
    { beta: 'o', greek: 'ο', name: 'omicron' },
    { beta: 'p', greek: 'π', name: 'pi' },
    { beta: 'r', greek: 'ρ', name: 'rho' },
    { beta: 's', greek: 'σ / ς', name: 'sigma' },
    { beta: 't', greek: 'τ', name: 'tau' },
    { beta: 'u', greek: 'υ', name: 'upsilon' },
    { beta: 'f', greek: 'φ', name: 'phi' },
    { beta: 'x', greek: 'χ', name: 'chi' },
    { beta: 'y', greek: 'ψ', name: 'psi' },
    { beta: 'w', greek: 'ω', name: 'omega' },
  ];

  // Diacritics are typed AFTER the vowel. They're stripped before matching,
  // so they're optional — but they show how full Beta Code is written.
  const BETA_MARKS: { beta: string; example: string; name: string }[] = [
    { beta: ')', example: 'a) → ἀ', name: 'smooth breathing' },
    { beta: '(', example: 'a( → ἁ', name: 'rough breathing' },
    { beta: '/', example: 'a/ → ά', name: 'acute accent' },
    { beta: '\\', example: 'a\\ → ὰ', name: 'grave accent' },
    { beta: '=', example: 'a= → ᾶ', name: 'circumflex' },
    { beta: '|', example: 'a| → ᾳ', name: 'iota subscript' },
    { beta: '+', example: 'i+ → ϊ', name: 'diaeresis' },
  ];

  const BETA_EXAMPLES: { beta: string; greek: string }[] = [
    { beta: 'a)reth/', greek: 'ἀρετή' },
    { beta: 'lo/gos', greek: 'λόγος' },
    { beta: 'yuxh/', greek: 'ψυχή' },
    { beta: 'h(donh/', greek: 'ἡδονή' },
    { beta: 'eu)daimoni/a', greek: 'εὐδαιμονία' },
    { beta: 'fron*', greek: 'φρόν… (wildcard)' },
  ];

  async function openHelp(e?: MouseEvent) {
    helpTrigger = e?.currentTarget instanceof HTMLElement
      ? e.currentTarget
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    showHelp = true;
    await tick();
    helpModal?.focus();
  }

  function closeHelp() {
    showHelp = false;
    helpTrigger?.focus();
    helpTrigger = null;
  }

  function helpFocusableEls(): HTMLElement[] {
    return helpModal
      ? Array.from(helpModal.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
      : [];
  }

  function onHelpKey(e: KeyboardEvent) {
    if (!showHelp) return;
    if (e.key === 'Escape') {
      closeHelp();
      return;
    }
    if (e.key !== 'Tab') return;
    const els = helpFocusableEls();
    if (els.length === 0) {
      e.preventDefault();
      helpModal?.focus();
      return;
    }
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Map a hit's (column, line) to the group it falls in, for one book.
  // Groups are ordered by document position; pick the last whose start is
  // at or before the hit.
  function chapterLookup(bookData: { segments: Segment[] }, chapters: OutlineRef[]) {
    const colIdx = new Map<string, number>();
    bookData.segments.forEach((s, i) => { if (!colIdx.has(s.column)) colIdx.set(s.column, i); });
    const chs = chapters
      .map((c, i) => ({ ...c, ci: colIdx.get(c.column) ?? 0, ln: parseInt(c.line), order: i }))
      .sort((a, b) => a.ci - b.ci || a.ln - b.ln);
    const at = (column: string, line: number): { chapter: string; order: number } => {
      // Defensive: never return undefined (callers deref .chapter). If the
      // outline is empty, group the hit under a placeholder rather than
      // throwing and collapsing the whole page.
      if (!chs.length) return { chapter: '—', order: 0 };
      const ci = colIdx.get(column) ?? 0;
      let found = chs[0];
      for (const c of chs) {
        if (c.ci < ci || (c.ci === ci && c.ln <= line)) found = c;
        else break;
      }
      return found;
    };
    return Object.assign(at, { named: (chapter: string) => chs.find(c => c.chapter === chapter) });
  }

  // What grouping reads of an outline entry: its label and where it starts.
  type OutlineRef = Pick<ChapterRef, 'chapter' | 'column' | 'line'>;

  // Stephanus works (all of Plato) ship an EMPTY chapters.json — they're cited by
  // page+section, so the outline lives in sections.json instead. Adapt a book's
  // section outline into the shape chapterLookup/buildGroups expect, grouping
  // hits by Stephanus page: one "chapter" per page, anchored at its first
  // section column (page 2 → anchor "2a"). Without this the group builder
  // treats every book as unloadable and renders zero results.
  function sectionsToChapters(secs: Record<string, SectionRef[]>): Record<string, OutlineRef[]> {
    const out: Record<string, OutlineRef[]> = {};
    for (const [book, sections] of Object.entries(secs)) {
      const anchors = new Map<number, string>();
      for (const s of sections) if (!anchors.has(s.page)) anchors.set(s.page, s.column);
      out[book] = [...anchors.values()].map((anchor) => ({
        chapter: anchor.slice(0, -1) || anchor,   // page label ("2a" → "2")
        column: anchor,
        line: '0',
      }));
    }
    return out;
  }

  // Load a work's grouping outline: Stephanus works from sections.json, everyone
  // else from chapters.json.
  function fetchOutline(work: string): Promise<Record<string, OutlineRef[]>> {
    return schemeFor(work).id === 'stephanus'
      ? fetchSections(work).then(sectionsToChapters)
      : fetchChapters(work);
  }

  // The Greek line of the token at index `pos` within a segment. A proximity
  // measure only: the citation is formatted through the work's scheme, which
  // for Stephanus prints the section alone.
  function lineOfPosition(seg: Segment, pos: number): number {
    let count = 0;
    for (const line of seg.greek) {
      if (pos < count + line.tokens.length) return line.n;
      count += line.tokens.length;
    }
    return seg.greek[seg.greek.length - 1]?.n ?? 1;
  }

  // What an instance counts for: each Greek hit it holds (a word, a match of
  // several words, or a section's); an English one, each word or phrase its
  // translations matched (see hitCount in lib/search-pages, which counts the
  // total and lays out pages from the index alone).
  const hitsIn = (inst: Instance) => (inst.rows?.reduce((n, row) => n + row.hits, 0) ?? 0)
    + (inst.lang === 'grk' ? inst.grkHits ?? 0 : inst.rows ? 0 : 1);
  const groupHits = (g: { instances: Instance[] }) => g.instances.reduce((n, inst) => n + hitsIn(inst), 0);

  // The reader's address for a hit. Carry the SUBMITTED queries so the reader
  // can highlight them; loc scrolls to the section. Use the snapshot (ctx),
  // not live input state.
  function jumpLinks(ctx: SearchCtx) {
    const qs = new URLSearchParams();
    if (ctx.grkQuery) qs.set('hlg', ctx.grkQuery);
    if (ctx.engQuery) qs.set('hle', ctx.engQuery);
    if (ctx.engQuery && ctx.engPhrase) qs.set('hlm', 'phrase');
    if (ctx.engQuery && ctx.engForms) qs.set('hlf', 'any');
    const base = qs.toString();
    // A translation hit opens the reader in that translation, where the
    // highlighted words are; a Greek one leaves the reader's choice alone.
    // A Greek hit also names its exact tokens (hlt), so the reader marks the
    // words the search found — every form a lemma search reached, the words
    // of a grammatical or proximity search — not whatever begins like the
    // typed text. The `loc=` value composes through the work's citation
    // scheme: "17a" for Stephanus, which has no user-facing lines.
    return (work: string, book: number, column: string, line: number, trans?: string, hits?: number[]) =>
      `${BASE_URL}${workPath(work, book)}?${base}${base ? '&' : ''}`
      + `${trans ? `trans=${encodeURIComponent(trans)}&` : ''}`
      + `${hits?.length ? `hlt=${column}:${hits.join(',')}&` : ''}loc=${formatLocValue(work, column, line)}`;
  }

  // Citations only: each place with hits and its count, read off the results
  // and the search index's offsets alone, so no book is fetched. A Greek hit
  // is cited to its line (a match of several words, to its first word's);
  // an English one to its section, as its line is known only from the book.
  // By work and book, in corpus order.
  interface CiteGroup { key: string; work: string; book: number; cites: { ref: string; href: string; n: number }[] }
  function citationsFor(results: SearchResult[], ctx: SearchCtx, offsets: Map<string, Offsets | null>): CiteGroup[] {
    const jump = jumpLinks(ctx);
    const out = new Map<string, CiteGroup>();
    const segIdx = new Map<string, Map<string, number>>();   // work → "book:column" → segment index
    const indexOf = (work: string, book: number, column: string) => {
      const o = offsets.get(work);
      if (!o) return -1;
      let m = segIdx.get(work);
      if (!m) { m = new Map(o.segments.map((sg, i) => [`${sg.book}:${sg.column}`, i])); segIdx.set(work, m); }
      return m.get(`${book}:${column}`) ?? -1;
    };
    for (const r of results) {
      if (!hitCount(r)) continue;
      const key = `${r.work}:${r.meta.book}`;
      const g = out.get(key) ?? out.set(key, { key, work: r.work, book: r.meta.book, cites: [] }).get(key)!;
      const add = (ref: string, href: string, n: number) => {
        const known = g.cites.find(c => c.ref === ref);
        if (known) known.n += n;
        else g.cites.push({ ref, href, n });
      };
      const column = r.meta.column;
      const eng = hitCount(r) - (!r.grkMatch ? 0 : r.windows ? r.windows.length : r.grkPositions.length);
      // An English-only hit in one translation opens the reader in it, where
      // the work offers a choice.
      const hits = r.engHits ?? [];
      const trans = !r.grkMatch && hits.length === 1 && translationsOf(r.work).length > 1 ? hits[0].translation : undefined;
      if (eng) add(formatCite(r.work, column), jump(r.work, r.meta.book, column, 1, trans), eng);
      if (!r.grkMatch) continue;
      const o = offsets.get(r.work);
      const i = indexOf(r.work, r.meta.book, column);
      for (const w of r.windows ?? r.grkPositions.map(p => [p])) {
        const at = o && i >= 0 ? offsetRef(o, o.seg_base_offset[i] + w[0]) : null;
        if (!at) { add(formatCite(r.work, column), jump(r.work, r.meta.book, column, 1, undefined, r.grkPositions), 1); continue; }
        add(formatCite(r.work, at.column, at.line, at.sub),
          jump(r.work, r.meta.book, at.column, at.line, undefined, at.column === column ? r.grkPositions : undefined) + (at.sub ?? ''), 1);
      }
    }
    return [...out.values()];
  }

  // Build the Stephanus-page groups for a slice of results: load the books and
  // outlines they touch (bounded concurrency), then assemble and sort. A failed
  // book or outline fetch is evicted (see data.ts) and its work:book key
  // collected in `failed` — NOT swallowed as a successful empty result — so the
  // caller can show an incomplete-results notice and offer a retry.
  async function buildGroups(
    results: SearchResult[],
    ctx: SearchCtx,
    context: ResultContext,
    allPages = false,
  ): Promise<{ groups: ChapterGroup[]; failed: string[]; segs: Map<string, Segment> }> {
    const wbPairs = [...new Set(results.map(r => `${r.work}:${r.meta.book}`))];
    const workSet = [...new Set(results.map(r => r.work))];
    const failed: string[] = [];

    const chaptersByWork = new Map<string, Record<string, OutlineRef[]>>();
    await pool(workSet, 8, async w => {
      try { chaptersByWork.set(w, await fetchOutline(w)); }
      catch (err) { console.warn(`search: outline failed for ${w} —`, err); failed.push(w); }
    });
    const segMap = new Map<string, Segment>();             // key: work:segId
    const books = new Map<string, BookData>();             // key: work:book
    const lookups = new Map<string, ReturnType<typeof chapterLookup>>(); // key: work:book
    await pool(wbPairs, 8, async pair => {
      const [w, bStr] = pair.split(':');
      const b = Number(bStr);
      // If the work's outline never loaded we can't group its hits — mark the
      // pair failed and skip (don't feed an empty list into chapterLookup),
      // so the page shows the partial-results notice instead of crashing.
      const chapters = chaptersByWork.get(w)?.[String(b)];
      if (!chapters) { failed.push(pair); return; }
      try {
        const data = await fetchBook(w, b);
        for (const s of data.segments) segMap.set(`${w}:${s.id}`, s);
        books.set(pair, data);
        lookups.set(pair, chapterLookup(data, chapters));
      } catch (err) { console.warn(`search: book failed for ${pair} —`, err); failed.push(pair); }
    });
    // A turn-aligned translation's texts, cut per section from its book once
    // (lib/english-hit turnTranslationTexts, the pipeline's own order).
    const turnTexts = new Map<string, Map<string, string[]>>();   // work:book:id
    const turnsOf = (pair: string, id: string) => {
      const key = `${pair}:${id}`;
      let m = turnTexts.get(key);
      if (!m) { m = turnTranslationTexts(books.get(pair)!, id); turnTexts.set(key, m); }
      return m;
    };

    // The aligned units of each book (lib/paired-hit), built once.
    const pairIx = new Map<string, PairIndex>();                  // work:book
    const pairsOf = (pair: string, work: string) => {
      let ix = pairIx.get(pair);
      if (!ix) { ix = pairUnits(books.get(pair)!, translationsOf(work)); pairIx.set(pair, ix); }
      return ix;
    };

    // A translation's texts for a segment, each with the section its words
    // lie in: cut by unit where they can be (unitPieces), else as the index
    // counted them, in the segment's own section. The same words in the same
    // order either way, so the index's word positions count through them.
    const piecesOf = (pair: string, ix: PairIndex, seg: Segment, t: Pick<TranslationRef, 'id' | 'slot'>) =>
      unitPieces(ix, seg, t)?.map(piece => ({ text: piece.text, section: piece.unit.section }))
      ?? translationTexts(seg, t, t.slot === 'overlay' ? turnsOf(pair, t.id) : undefined).map(text => ({ text, section: seg.column }));
    // The English words the results hold, by piece (`${pair}:${translation}:
    // ${segment}:${piece}`), each as its place in its piece: a section's whole
    // text marks these, not every word the query would match there.
    const held = new Map<string, Set<number>>();

    // A hit's chapter, as the page groups it.
    const chapterOf = (work: string, book: number, inst: Pick<Instance, 'column' | 'line'>) => lookups.get(`${work}:${book}`)!(inst.column, inst.line ?? 1);
    // Whole sections hold only the hits of this page's chapters.
    const onPage = (work: string, book: number, inst: Pick<Instance, 'column' | 'line'>) => {
      if (allPages || context !== 's') return true;
      const source = results.find(r => r.work === work && r.meta.book === book && r.meta.column === inst.column);
      return !source || pageOf(source, chapterOf(work, book, inst).chapter) === pageIdx;
    };

    const gmap = new Map<string, ChapterGroup>();
    const add = (work: string, book: number, ch: { chapter: string; order: number }, inst: Instance) => {
      const source = results.find(r => r.work === work && r.meta.book === book && r.meta.column === inst.column);
      if (!allPages && source && pageOf(source, ch.chapter) !== pageIdx) return;
      const key = `${work}:${book}:${ch.chapter}`;
      let g = gmap.get(key);
      if (!g) {
        g = { work, book, chapter: ch.chapter, order: ch.order, title: chapterTitles[work]?.[String(book)]?.[ch.chapter] || undefined, instances: [] };
        gmap.set(key, g);
      }
      g.instances.push(inst);
    };

    const jumpFor = jumpLinks(ctx);

    // Every instance is made first and placed in its group afterwards: a
    // Greek and an English hit in one unit become one instance, and the two
    // may come from different results (a turn-aligned translation is indexed
    // under the section its turn starts in, wherever its words fall).
    const made: { work: string; book: number; inst: Instance }[] = [];
    // Context either side of a hit: words of Greek, characters of English.
    const greekReach = context === '1' ? 4 : 12;
    const grkByUnit = new Map<PairUnit, Instance[]>();
    const engByUnit = new Map<PairUnit, Instance>();
    const firstLine = (unit: PairUnit) => unit.greek[0]?.n ?? 1;
    // What each Greek hit shows, as token places in its section (a match run
    // on past the section counts on, as hitTokens does), and how to draw
    // another stretch of the same words with other marks: the overlap merge
    // below joins hits whose passages share words.
    // `turns`: a book aligned by speaker turn, whose hits join only within a
    // turn, so each turn's English stays under its own words.
    interface Shown { key: string; from: number; to: number; turns: boolean; draw: (from: number, to: number, marked: Set<number>) => string }
    const shownOf = new Map<Instance, Shown>();

    for (const r of results) {
      const pair = `${r.work}:${r.meta.book}`;
      const seg = segMap.get(`${r.work}:${r.meta.id}`);
      if (!seg || !lookups.has(pair)) continue;
      const ix = pairsOf(pair, r.work);
      if (r.grkMatch) {
        // Flattened surface tokens, for the accent post-filter and each hit's
        // form (positions are token indices — the same flattening greekKwic uses).
        const toks: string[] = [];
        for (const line of seg.greek) for (const tok of line.tokens) toks.push(tok.t);
        // A match that runs on into the next sections (above): their words too.
        const top = Math.max(-1, ...r.grkPositions);
        const after = sectionsAfter(books.get(pair)!.segments, seg, top, greekReach);
        for (const s of after) for (const tok of segTokens(s)) toks.push(tok.t);
        const kept = r.grkPositions.filter(pos => (!ctx.grkAccentTerms.length
          || accentTokenMatch(toks[pos] ?? '', ctx.grkAccentTerms))
          && (!ctx.grkCaseTerms.length || caseTokenMatch(toks[pos] ?? '', ctx.grkCaseTerms)));
        const keep = new Set(kept);
        // A match of several words (phrase, proximity, running text) is one
        // instance per window, its words marked together; a word search, one
        // per word. Each window is cut as the accent filter cuts the positions.
        const windows = r.windows?.map(w => w.filter(p => keep.has(p))).filter(w => w.length);
        const hits = windows?.length ? windows : kept.map(pos => [pos]);
        for (const own of hits) {
          const pos = own[0];
          const line = lineOfPosition(seg, pos);
          let left = pos;
          let sub: string | undefined;
          for (const l of seg.greek) { if (left < l.tokens.length) { sub = l.sub; break; } left -= l.tokens.length; }
          // Every word of the hit, a window's later terms as much as its first.
          // r.grammar runs parallel to grkPositions on a grammatical search.
          // Where the parse doesn't settle the reading, say so on the hit
          // rather than letting the match imply a certainty it doesn't have.
          const held = own.map((p): HeldTok => {
            const i = r.grkPositions.indexOf(p);
            const g = r.grammar?.[i];
            const oneOf = g ? grammarHitNote(g) : undefined;
            return { pos: p, surface: toks[p] ?? '', oneOf, speaker: r.speakers?.[i] ?? undefined };
          });
          const speaker = speakersOf(held);
          const unit = unitAtGreek(ix, seg, pos);
          const surface = toks[pos];
          const inst: Instance = { lang: 'grk', work: r.work, book: r.meta.book, seg: r.meta.id, surface, form: greekFold(surface ?? ''), column: seg.column, line, sub, ref: formatCite(r.work, seg.column, line, sub), html: windows?.length
            ? greekKwic(r.work, seg, kept, greekReach, [own[0], own[own.length - 1]], after)
            : greekKwic(r.work, seg, [pos], greekReach),
            toks: own, grkHits: 1, jumpUrl: jumpFor(r.work, r.meta.book, seg.column, line, undefined, kept) + (sub ? sub : ''), held, speaker, unit, at: pos };
          // Drawn by whole lines, a window runs on to its last word's line;
          // a window that runs on into the next section keeps its words.
          const last = own[own.length - 1];
          if (!books.get(pair)!.turnFlow && seg.english?.bekker?.length && !isChapterSection(getWork(r.work))
            && last < segTokens(seg).length) {
            const win = pairGreekWindow(seg, unit, line, context, windows?.length ? last : undefined, sub);
            inst.html = pairGreekHtml(r.work, seg, win, true, new Set(own));
            // By whole lines: the stretch is the lines it touches.
            const span = lineTokens(seg);
            const lines = win.greek.map(l => span.get(`${l.n}${l.sub ?? ''}`)).filter((x): x is [number, number] => !!x);
            if (lines.length && !windows?.length) shownOf.set(inst, {
              key: `${pair}:${seg.id}:lines`, from: lines[0][0], to: lines.at(-1)![1], turns: false,
              draw: (from, to, marked) => pairGreekHtml(r.work, seg, { ...unit, greek: seg.greek
                .filter(l => { const t = span.get(`${l.n}${l.sub ?? ''}`); return !!t && t[0] < to && t[1] > from; })
                .map(l => ({ n: l.n, sub: l.sub, from: 0, to: l.text.length, text: l.text })) }, true, marked),
            });
          } else if (!windows?.length) {
            // A window of several words (phrase, proximity) keeps its own
            // instance here: its shaded span would not survive a join.
            const words = [seg, ...after].flatMap(s => segTokens(s).map((tok, i) => ({ tok, seg: s, i })));
            const [first, last] = [own[0], own[own.length - 1]].map(p => Math.min(p, words.length - 1));
            shownOf.set(inst, {
              key: `${pair}:${seg.id}:words`, from: Math.max(0, first - greekReach), to: Math.min(words.length, last + greekReach + 1), turns: !!books.get(pair)!.turnFlow,
              draw: (from, to, marked) => greekWords(r.work, words, from, to, marked),
            });
          }
          made.push({ work: r.work, book: r.meta.book, inst });
          (grkByUnit.get(unit) ?? grkByUnit.set(unit, []).get(unit)!).push(inst);
        }
      }
      if (r.engMatch) {
        const ts = translationsOf(r.work);
        const several = ts.length > 1;
        // A work the registry does not list still has its one translation.
        const hits: EngHit[] = r.engHits ?? [{ translation: ts[0]?.id ?? 'english', positions: [] }];
        for (const hit of hits) {
          const t = ts.find(x => x.id === hit.translation)
            ?? { id: hit.translation, slot: 'english' as const, short: hit.translation, name: hit.translation };
          const texts = piecesOf(pair, ix, seg, t).map(piece => piece.text);
          // The matched words, by the unit each stands in: every unit is an
          // instance of its own, beside the Greek it translates. With nothing
          // to mark, the passage's head stands for the section.
          const marked = englishMarked(texts, hit.positions, ctx.engUnits, ctx.engPhrase, ctx.engForms);
          const starts: number[] = [];
          texts.reduce((n, text) => { starts.push(n); return n + englishWords(text).length; }, 0);
          for (const w of marked) {
            const unit = unitAtEnglish(ix, seg, t, w);
            if (!onPage(r.work, r.meta.book, { column: unit.section, line: firstLine(unit) })) continue;
            let k = starts.length - 1;
            while (k > 0 && starts[k] > w) k--;
            const key = `${pair}:${t.id}:${seg.id}:${k}`;
            (held.get(key) ?? held.set(key, new Set()).get(key)!).add(w - starts[k]);
          }
          const byUnit = new Map<PairUnit, number[]>();
          for (const w of marked) {
            const unit = unitAtEnglish(ix, seg, t, w);
            (byUnit.get(unit) ?? byUnit.set(unit, []).get(unit)!).push(w);
          }
          if (!marked.length) byUnit.set(unitAtEnglish(ix, seg, t, 0), []);
          // What the hit counts for is the index's to say (engHitCount). Where
          // the marks are the index's positions, each unit counts its own (a
          // phrase where its first word stands); otherwise the whole count
          // goes on the first row.
          const counted = new Map<number, number>();
          for (const p of hit.matches ?? hit.positions) counted.set(p, (counted.get(p) ?? 0) + 1);
          const found = new Set(hit.positions);
          const exact = marked.length > 0 && marked.length === found.size && marked.every(w => found.has(w));
          let k = 0;
          for (const [unit, words] of byUnit) {
            const n = exact ? words.reduce((sum, w) => sum + (counted.get(w) ?? 0), 0) : k ? 0 : engHitCount(hit);
            k++;
            const line = firstLine(unit);
            const display = { ...pairContext(ix, seg, unit, context) };
            const hitLine = englishPlace(seg, t, words, ctx.engUnits.flat(), ctx.engPhrase, ctx.engForms)?.line ?? line;
            const greekWindow = books.get(pair)!.turnFlow ? display : pairGreekWindow(seg, display, hitLine, context);
            const spanText = plainEnglish(display.english[t.id] ?? bekkerEnglish(seg, t, display.greek[0]?.n ?? line, (display.greek.at(-1)?.n ?? line)+1));
            display.english = { ...display.english, [t.id]: spanText };
            const firstMark = englishMarked([spanText], [], ctx.engUnits, ctx.engPhrase, ctx.engForms)[0];
            const indexedText = plainEnglish(texts.join(' '));
            const spanStart = indexedText.indexOf(spanText);
            const indexedOffset = englishWords(indexedText)[words[0]]?.start;
            const hitOffset = spanStart >= 0 && indexedOffset !== undefined
              && indexedOffset >= spanStart && indexedOffset < spanStart + spanText.length
              ? indexedOffset - spanStart : englishWords(spanText)[firstMark]?.start;
            const clipped = context === 's' ? spanText : pairEnglishWindow(seg, t, display, hitLine,
              greekWindow.greek.reduce((n, l) => n + l.text.split(/\s+/).length, 0), hitOffset);
            // A row for each passage the words fall in; the count goes on the first.
            const rows = [markEnglishHtml(clipped, ctx.engUnits, ctx.engPhrase, ctx.engForms)]
              .map((html, j): TransRow => ({
                translation: t.id,
                label: t.short,
                title: t.name,
                html,
                // Named wherever there is a choice, so a reader's saved choice of
                // the other translation does not open the hit in the wrong words.
                jumpUrl: jumpFor(r.work, r.meta.book, unit.section, line, several ? t.id : undefined),
                hits: j ? 0 : n,
              }));
            if (!rows.length) continue;
            // Every translation's hit in one unit shares one instance: the
            // same lines in each translator's words.
            let inst = engByUnit.get(unit);
            if (!inst) {
              inst = { lang: 'eng', work: r.work, book: r.meta.book, column: unit.section, line, ref: formatCite(r.work, unit.section, englishCiteLine(r.work, books.get(pair)!.turnFlow, line)), html: '', jumpUrl: '', rows: [], unit, at: unit.first, pairGreek: books.get(pair)!.turnFlow ? undefined : pairGreekHtml(r.work, seg, greekWindow, true) };
              engByUnit.set(unit, inst);
              made.push({ work: r.work, book: r.meta.book, inst });
            }
            inst.rows!.push(...rows);
          }
        }
      }
    }

    // One unit, one instance: an English hit joins the first Greek hit of its
    // unit; alone, it shows the unit's Greek.
    const firstGrk = new Map<PairUnit, Instance>();
    for (const [unit, list] of grkByUnit) firstGrk.set(unit, list.reduce((a, b) => (b.at! < a.at! ? b : a)));
    const merged = new Set<Instance>();
    for (const { work, book, inst } of made) {
      if (inst.lang !== 'eng') continue;
      const ts = translationsOf(work);
      const order = (id: string) => ts.findIndex(t => t.id === id);
      inst.rows!.sort((a, b) => order(a.translation) - order(b.translation));
      inst.html = inst.rows![0].html;
      inst.jumpUrl = inst.rows![0].jumpUrl;
      const grk = firstGrk.get(inst.unit!);
      if (grk) { grk.rows = inst.rows; merged.add(inst); }
      else {
        const seg = books.get(`${work}:${book}`)?.segments.find(x => x.column === inst.unit!.section);
        inst.pairGreek = inst.pairGreek || (seg && pairGreekHtml(work, seg, pairContext(pairsOf(`${work}:${book}`, work), seg, inst.unit!, context), !books.get(`${work}:${book}`)!.turnFlow)) || undefined;
      }
    }
    // Hits whose passages share words are one instance, every hit of them
    // marked, so no lines are shown twice (S4a). It counts each of its hits,
    // as the instances did. A hit carrying English rows joins only a run
    // with none: two units' English would not be one passage's; in a book
    // aligned by turns, a hit joins only its own turn's. In the form
    // views the instance is filed once under each of its forms, that form's
    // hits marked, as a whole section is. Not for the CSV (allPages), which
    // is a row per hit.
    if (context !== 's' && !allPages) {
      const byKey = new Map<string, Instance[]>();
      for (const { inst } of made) {
        const sh = shownOf.get(inst);
        if (sh && !merged.has(inst)) {
          const chapter = lookups.get(`${inst.work}:${inst.book}`)!(inst.column, inst.line ?? 1).chapter;
          const key = `${sh.key}:chapter:${chapter}`;
          (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(inst);
        }
      }
      const mergeRun = (run: Instance[]) => {
        const parts = run.map(inst => ({ ...inst }));
        const shown = run.map(inst => shownOf.get(inst)!);
        const from = Math.min(...shown.map(sh => sh.from));
        const to = Math.max(...shown.map(sh => sh.to));
        const draw = (list: Instance[]) => shown[0].draw(from, to, new Set(list.flatMap(inst => inst.toks ?? [inst.at!])));
        // The place of the hits it holds: "1095b29–30", each line named, so a
        // hit's own line ("2b6b") stays on the page.
        const place = (list: Instance[]) => {
          const [first, last] = [list[0].ref, list.at(-1)!.ref];
          const col = list[0].column;
          return first === last || !first.startsWith(col) || !last.startsWith(col) ? first : `${first}–${last.slice(col.length)}`;
        };
        const join = (list: Instance[]) => ({
          ref: place(list),
          html: draw(list),
          toks: list.flatMap(inst => inst.toks ?? []).sort((a, b) => a - b),
          held: list.flatMap(inst => inst.held ?? []).sort((a, b) => a.pos - b.pos),
          grkHits: list.reduce((n, inst) => n + (inst.grkHits ?? 0), 0),
          rows: list.find(inst => inst.rows)?.rows,
        });
        const head = run[0];
        Object.assign(head, join(parts));
        const surfaces = [...new Set(parts.map(part => part.surface ?? ''))].filter(Boolean);
        if (surfaces.length > 1) head.surfaces = surfaces;
        head.speaker = speakersOf(head.held!);
        for (const inst of run.slice(1)) merged.add(inst);
        const byForm = new Map<string, Instance[]>();
        for (const part of parts) (byForm.get(part.form ?? '') ?? byForm.set(part.form ?? '', []).get(part.form ?? '')!).push(part);
        if (byForm.size > 1) {
          head.forms = [...byForm.values()].map(list => {
            const sub: Instance = { ...head, ...join(list), surface: list[0].surface, form: list[0].form, line: list[0].line, at: list[0].at, forms: undefined,
              surfaces: [...new Set(list.map(part => part.surface ?? ''))].filter(Boolean) };
            sub.speaker = speakersOf(sub.held!);
            return sub;
          });
        }
      };
      for (const list of byKey.values()) {
        list.sort((a, b) => a.at! - b.at!);
        let run: Instance[] = [];
        let end = -1;
        for (const inst of list) {
          const sh = shownOf.get(inst)!;
          const rows = run.filter(x => x.rows).length + (inst.rows ? 1 : 0);
          if (run.length && sh.from < end && rows <= 1 && (!sh.turns || inst.unit === run[0].unit)) { run.push(inst); end = Math.max(end, sh.to); continue; }
          if (run.length > 1) mergeRun(run);
          run = [inst];
          end = sh.to;
        }
        if (run.length > 1) mergeRun(run);
      }
    }
    for (const { work, book, inst } of made) {
      if (merged.has(inst)) continue;
      // A Greek hit shows its unit's English, once: under the first hit of the
      // unit. In the translation the reader narrowed to, else the reference
      // translation, which may borrow from the turn beside it in the section.
      if (inst.lang === 'grk' && (!inst.rows || inst.forms?.some(f => !f.rows)) && (!books.get(`${work}:${book}`)!.turnFlow || firstGrk.get(inst.unit!) === inst)) {
        const ix = pairsOf(`${work}:${book}`, work);
        const ts = translationsOf(work);
        const ref = ts.find(t => t.slot === 'english') ?? ts[0];
        const chip = ts.find(t => t.id === transFilter);
        for (const [t, near] of [[chip, false], [ref, false], [ref, true]] as const) {
          const seg = books.get(`${work}:${book}`)!.segments.find(s => s.column === inst.column)!;
          const display = pairContext(ix, seg, inst.unit!, context);
          const paired = unitEnglish(ix, display, t?.id ?? '', near);
          const greekWindow = pairGreekWindow(seg, display, inst.line ?? firstLine(inst.unit!), context, undefined, inst.sub);
          const text = t ? (context === 's' ? plainEnglish(paired) : pairEnglishWindow(seg, t, { ...display, english: { ...display.english, [t.id]: paired } }, inst.line ?? firstLine(inst.unit!),
            greekWindow.greek.reduce((n, l) => n + l.text.split(/\s+/).length, 0))) : '';
          if (!t || !text) continue;
          const pairEnglish = {
            text, label: t.short, title: t.name,
            jumpUrl: jumpFor(work, book, inst.unit!.section, firstLine(inst.unit!), ts.length > 1 ? t.id : undefined),
          };
          if (!inst.rows) inst.pairEnglish = pairEnglish;
          // A merged hit filed under each of its forms: the forms without the
          // English rows show the passage's English as a Greek hit does.
          for (const f of inst.forms ?? []) if (!f.rows) f.pairEnglish = pairEnglish;
          break;
        }
      }
    }

    // The whole section of every hit, both sides at once: what "more" opens,
    // and under the whole-section context the instance itself, one for each
    // section and holding all its hits, so the Greek and the English widen
    // together (John, 2026-11-09: "Both, to the section").
    const placed = made.filter(m => !merged.has(m.inst) && onPage(m.work, m.book, m.inst));
    const bySection = new Map<string, { work: string; book: number; column: string; insts: Instance[] }>();
    for (const { work, book, inst } of placed) {
      const key = `${work}:${book}:${inst.column}`;
      (bySection.get(key) ?? bySection.set(key, { work, book, column: inst.column, insts: [] }).get(key)!).insts.push(inst);
    }
    for (const { work, book, column, insts } of bySection.values()) {
      const pair = `${work}:${book}`;
      const seg = books.get(pair)!.segments.find(x => x.column === column);
      if (!seg) continue;
      const ix = pairsOf(pair, work);
      const ts = translationsOf(work);
      const line = seg.greek[0]?.n ?? 1;
      const grks = insts.filter(inst => inst.lang === 'grk').sort((a, b) => a.at! - b.at!);
      const positions = grks.flatMap(inst => inst.toks ?? [inst.at!]).sort((a, b) => a - b);
      // Each translation that matched here, in the work's order, with every
      // word it matched here.
      const matched = new Map<string, number>();
      for (const row of insts.flatMap(inst => inst.rows ?? [])) matched.set(row.translation, (matched.get(row.translation) ?? 0) + row.hits);
      // A translation's text here is its pieces that lie in this section,
      // wherever the index filed them, in order.
      const sectionHtml = (t: TranslationRef) => books.get(pair)!.segments
        .flatMap(s => piecesOf(pair, ix, s, t).map((piece, k) => ({ ...piece, key: `${pair}:${t.id}:${s.id}:${k}` })))
        .filter(piece => piece.section === column)
        .map(piece => markWordsHtml(piece.text, held.get(piece.key) ?? new Set()).trim())
        .filter(Boolean).join(' ');
      const rows = ts.filter(t => matched.has(t.id)).map((t): TransRow => ({
        translation: t.id, label: t.short, title: t.name,
        html: sectionHtml(t),
        jumpUrl: jumpFor(work, book, column, line, ts.length > 1 ? t.id : undefined),
        hits: matched.get(t.id)!,
      }));
      // The section's English unmarked: as under a Greek hit, in the
      // translator chip in force, else the reference.
      // As far as the Greek it goes under: the sections `marked` reaches.
      // The cited section's own English must be there, or the next
      // translation is tried; a later section with none is left out.
      const unmarkedFor = (marked: number[]): SectionView['pair'] => {
        const ref = ts.find(t => t.slot === 'english') ?? ts[0];
        const chip = ts.find(t => t.id === transFilter);
        for (const t of [chip, ref]) {
          if (!t) continue;
          const parts = wholeSections(books.get(pair)!.segments, seg, marked)
            .map(({ seg: s }) => ({ column: s.column, text: plainEnglish(sectionEnglish(ix, s, t)).trim() }));
          if (!parts[0].text) continue;
          const text = parts.filter(p => p.text).map((p, k) => (k ? `${p.column} ` : '') + p.text).join(' ');
          return { text, label: t.short, title: t.name, jumpUrl: jumpFor(work, book, column, line, ts.length > 1 ? t.id : undefined) };
        }
        return undefined;
      };
      const unmarked = unmarkedFor(positions);
      const heldOf = (list: Instance[]) => list.flatMap(inst => inst.held ?? []).sort((a, b) => a.pos - b.pos);
      const view: SectionView = { seg: seg.id, greek: wholeGreekHtml(work, books.get(pair)!.segments, seg, positions), held: heldOf(grks), rows, pair: rows.length ? undefined : unmarked };
      for (const inst of insts) {
        inst.whole = view;
        for (const f of inst.forms ?? []) f.whole = view;
      }
      if (context !== 's') continue;
      // The section as one instance, holding the Greek hits `held` and
      // showing `whole`.
      const sectionInst = (held: Instance[], whole: SectionView): Instance => {
        const toks = held.flatMap(inst => inst.toks ?? [inst.at!]).sort((a, b) => a - b);
        return {
          lang: held.length ? 'grk' : 'eng', work, book, column, line, ref: formatCite(work, column),
          html: whole.greek, jumpUrl: toks.length ? jumpFor(work, book, column, line, undefined, toks) : whole.rows[0]?.jumpUrl ?? jumpFor(work, book, column, line),
          rows: whole.rows.length ? whole.rows : undefined, pairEnglish: whole.pair, whole, isSection: true,
          toks, grkHits: held.reduce((n, inst) => n + (inst.grkHits ?? 0), 0), seg: seg.id, at: toks[0] ?? 0, surface: held[0]?.surface, form: held[0]?.form,
          held: whole.held, speaker: speakersOf(whole.held),
        };
      };
      const inst = sectionInst(grks, view);
      // The form views file a section once for each form among its hits,
      // with that form's hits marked and counted, so no form is lost under
      // another's. The English goes on the first, so it is counted once; the
      // others show the section's English unmarked, as a Greek hit does.
      const byForm = new Map<string, Instance[]>();
      for (const g of grks) (byForm.get(g.form ?? '') ?? byForm.set(g.form ?? '', []).get(g.form ?? '')!).push(g);
      if (byForm.size > 1) {
        inst.forms = [...byForm.values()].map((held, k) => sectionInst(held, {
          seg: seg.id,
          greek: wholeGreekHtml(work, books.get(pair)!.segments, seg, held.flatMap(g => g.toks ?? [g.at!])),
          held: heldOf(held),
          rows: k ? [] : rows,
          pair: k || !rows.length ? unmarkedFor(held.flatMap(g => g.toks ?? [g.at!])) : undefined,
        }));
      }
      // Filed under the first chapter its hits are in.
      add(work, book, insts.map(i => chapterOf(work, book, i)).reduce((a, b) => (b.order < a.order ? b : a)), inst);
    }
    if (context !== 's') {
      for (const { work, book, inst } of placed) add(work, book, lookups.get(`${work}:${book}`)!(inst.column, inst.line), inst);
    }

    for (const g of gmap.values()) g.instances.sort(bekkerCmp);
    const out = [...gmap.values()].sort((a, b) =>
      ((WORK_ORDER.get(a.work) ?? 0) - (WORK_ORDER.get(b.work) ?? 0)) || a.book - b.book || a.order - b.order);
    return { groups: out, failed: [...new Set(failed)], segs: segMap };
  }

  // Each render of a page takes a number; only the latest may write, so a
  // slow render (a Context change, say) cannot draw over a newer one.
  let renderSeq = 0;
  async function renderPage(i: number) {
    const seq = ++renderSeq;
    // The card is a word of the hits on screen: it goes with them.
    popup = null;
    pageIdx = i;
    pageLoading = true;
    pageError = '';
    // A newer search (the back button can start one mid-load) replaces
    // `pages`; this page's books must not then overwrite its results.
    // A newer search or filter starts a new layout before its pages exist, so
    // the layout is checked as well as the pages.
    const set = pages;
    const layout = layoutRun;
    const stale = () => seq !== renderSeq || set !== pages || layout !== layoutRun;
    if (pageSize === 'c') {
      groups = [];
      citeList = citationsFor(set[i] ?? [], searchCtx, pageOffsets);
      pageLoading = false;
      return;
    }
    try {
      const { groups: g, failed, segs } = await buildGroups(set[i] ?? [], searchCtx, context);
      if (stale()) return;
      // Again here: a word of the old page may have been opened while this
      // one's books were loading.
      popup = null;
      groups = g;
      citeList = [];
      more = new Set();
      shownTrans = new Map();
      pageSegs = segs;
      if (failed.length) {
        pageError = `${failed.length} passage source${failed.length === 1 ? '' : 's'} on this page didn’t load — some hits may be missing.`;
      }
    } catch (err) {
      if (stale()) return;
      pageError = String(err);
      groups = [];
    } finally {
      if (!stale()) pageLoading = false;
    }
  }

  function goPage(i: number) {
    if (i < 0 || i >= pages.length || i === pageIdx || pageLoading) return;
    renderPage(i);
    if (typeof document !== 'undefined') {
      document.querySelector('.sx-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ── The search in the address bar ──────────────────────────────────────────
  // Every search is written to the URL (see lib/search-url), so it can be
  // shared, bookmarked, reloaded, and stepped back through. The widened
  // "any inflection" results are not: they are a step taken from a search,
  // and the URL keeps the search they were taken from.
  const WORK_IDS = WORKS.map(w => w.id);
  let lastSearch: UrlSearch | null = null;   // the submitted search, as written

  function currentSearch(): UrlSearch {
    return {
      grk: grkQuery, eng: engQuery, grkMode, engMode, matchMode, accent: accentSensitive, punctuation, caseExact, langOp, engForms,
      works: WORK_IDS.filter(id => selectedWorks.has(id)),
      trans: null,
      workFilter: null,
      xforms: [],
      lemmas: [...soloLemma.picked],
      combo: comboActive ? comboNow : null,
      speaker: speakerFilter ?? null,
      view,
      facets: {},
      context,
      sort,
      pageSize,
    };
  }

  function writeUrl(s: UrlSearch, how: 'push' | 'replace') {
    const qs = encodeSearchUrl(s, WORK_IDS);
    const search = qs ? `?${qs}` : '';
    // Searching again for the same thing adds no history entry. The address
    // may spell it differently (a ?q= arrival, say): rewrite that in place.
    if (how === 'push' && search === window.location.search) return;
    if (how === 'push' && encodeSearchUrl(decodeSearchUrl(window.location.search, WORK_IDS), WORK_IDS) === qs) how = 'replace';
    const url = `${window.location.pathname}${search}${window.location.hash}`;
    if (how === 'push') window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
    pageUrl = here();
  }

  // Saved searches (PR 8): the page's URL is the search, so Save keeps it.
  // A blocked store hides the control.
  const here = () => `${window.location.pathname}${window.location.search}`;
  let canSave = false;
  let pageUrl = '';
  let savedNow = false;
  // What the last Save said, for its live region; a new URL clears it.
  let saveNote = '';
  let saveFailed = false;
  $: savedNow = canSave && !!pageUrl && !!findSaved(pageUrl);
  $: pageUrl, (saveNote = ''), (saveFailed = false);
  function saveSearch() {
    if (savedNow) return;
    // A proximity search is named with the sentence the page shows.
    const name = lastSearch?.combo
      ? summarizeSearch(pageUrl, headsOf(pickInfo), inValue(lastSearch.works, selectedWorks, worksValue)) : undefined;
    saveFailed = !addSaved(pageUrl, name);
    savedNow = !saveFailed;
    saveNote = saveFailed ? `${FULL}.` : 'Search saved.';
  }

  // Sets every control from a URL, defaults included, so stepping back to a
  // plain search clears what a later one set.
  function applySearch(s: UrlSearch) {
    grkQuery = s.grk;
    engQuery = s.eng;
    grkMode = s.grkMode;
    engMode = s.engMode;
    matchMode = s.matchMode;
    accentSensitive = s.accent;
    punctuation = s.punctuation;
    caseExact = s.caseExact;
    langOp = s.langOp;
    engForms = s.engForms;
    selectedWorks = new Set(s.works);
    soloLemma = { ...newComboEditor('lemma'), picked: [...s.lemmas] };
    // A dictionary-word search is the Lemma switch on, its word in the box.
    lemmaOn = s.lemmas.length > 0;
    if (lemmaOn) grkQuery = lemmaBoxText(s.lemmas);
    void fillPickInfo([...s.lemmas, ...(s.combo?.slots.flatMap(slot => slot.picked) ?? [])]).then(() => {
      // The headwords, once known, in place of the keys the box stood in for.
      if (lemmaOn && s.lemmas.join() === soloLemma.picked.join() && grkQuery === lemmaBoxText(s.lemmas, {})) grkQuery = lemmaBoxText(s.lemmas);
    });
    const combo = s.combo;
    const eds = combo
      ? combo.slots.map(slot => ({ ...newComboEditor(slot.kind), relation: slot.relation, or: !!slot.or, text: slot.text, picked: [...slot.picked], grammar: { ...slot.grammar } }))
      : [newComboEditor('lemma'), newComboEditor('lemma')];
    combo?.slots.forEach((slot, i) => { if (slot.target) eds[i].targetId = eds[slot.target]?.id ?? null; });
    // An older link with the order lock beside before or after: the lock won
    // there, the relations reading as near (the old editor's rule).
    if (combo?.ordered && orderSet(eds)) for (const ed of eds) if (ed.relation === 'before' || ed.relation === 'after') ed.relation = 'near';
    comboEditors = eds;
    comboWindow = combo?.window ?? COMBO_WINDOW_DEFAULT;
    comboUnit = combo?.unit ?? 'words';
    comboOrdered = combo?.ordered ?? false;
    comboCrossChapter = combo?.crossChapter ?? true;
    proxOn = !!combo;
    view = s.view;
    context = s.context;
    sort = s.sort;
    pageSize = s.pageSize;
    speakerMode = (SPEAKERS ? s.speaker?.mode : null) ?? 'anyone';
    speakerNames = new Set(SPEAKERS ? s.speaker?.names ?? [] : []);
    // A filter arriving in the address bar is shown, not hidden in a shut panel.
    if (SPEAKERS && s.speaker) speakerOpen = true;
  }

  // The empty page's examples: shown once the address is known to hold no
  // search, so a search arriving in it never flashes them first.
  let showTry = false;
  const TRY: { q: string; g: string; href: string; grc: boolean }[] = [
    { q: 'ἀρετή', g: 'every form of the word', href: `?g=${encodeURIComponent('ἀρετή')}`, grc: true },
    { q: 'virtue', g: 'in the English translations', href: '?e=virtue', grc: false },
    { q: 'ἀρετή near ἕξις', g: 'within five words', href: '?c=l:areth&c=l:ecis', grc: true },
    { q: 'τὸ τί ἦν εἶναι', g: 'an exact phrase', href: `?g=${encodeURIComponent('τὸ τί ἦν εἶναι')}&gm=phrase&m=form`, grc: true },
  ];

  // Runs whatever search the address bar holds; with none, clears the page.
  async function searchFromUrl() {
    popup = null;
    closeSugg();
    const s = decodeSearchUrl(window.location.search, WORK_IDS);
    applySearch(s);
    // The reactive comboActive / soloLemmaActive / speakerFilter that doSearch
    // reads must catch up with the controls just set.
    await tick();
    if (hasSearch(s)) {
      await doSearch(undefined, { history: 'none', trans: s.trans, work: s.workFilter, xforms: s.xforms, facets: s.facets });
      return;
    }
    searchRun++;
    lastSearch = null;
    searched = false;
    narrowPrompt = false;
    showTry = true;
    // The sheet refined results that are gone; left open, it would cover the
    // next search's.
    sheetOpen = false;
    loading = false;
    error = '';
    allResults = [];
    pages = [];
    groups = [];
    totalInstances = 0;
    transFilter = null;
    workFilter = null;
    hitForms = null;
    formsFailed = null;
    excludedForms = new Set();
    resetGrammar();
    facets = {};
    variantNote = '';
    variantsShown = false;
    variantBusy = false;
  }

  // The command palette hands off ?g= (Greek) / ?e= (English); those, and
  // any search this page wrote, are run on load.
  const onPopState = () => { pageUrl = here(); searchFromUrl(); };
  // Widened past the sheet's breakpoint, the column is beside the hits again.
  // Focus that was in the sheet goes to what stands for it there: the menus
  // over the hits for the sort sheet, the column for the filter.
  const onWide = async (e: MediaQueryListEvent) => {
    wide = e.matches;
    narrowScreen = !e.matches;
    if (!e.matches || !sheetOpen) return;
    const had = !!sheetEl?.contains(document.activeElement);
    const kind = sheetKind;
    sheetOpen = false;
    await tick();
    if (!had || sheetEl?.contains(document.activeElement)) return;
    (kind === 'sort' ? document.querySelector<HTMLElement>('.sx-display summary') ?? sheetEl : sheetEl)?.focus();
  };
  let wideQuery: MediaQueryList | undefined;
  // A desktop width (round 34, 961px and up): the rail beside the hits, and
  // the word card in the rail's column. Every other width is narrow: one
  // query, so no width is neither (b-search.css keeps the same line).
  const WIDE = '(min-width: 961px)';
  let wide = false;
  // A phone or a tablet (under 961px): the open editor's sentence leads
  // with its distance (§5.7).
  let narrowScreen = false;
  // Sideways: narrow and no more than 500px tall; the language switch is a
  // menu (b-search.css draws it so on the same lines).
  let shortQuery: MediaQueryList | undefined;
  let short = false;
  const onShort = (e: MediaQueryListEvent) => { short = e.matches; };
  $: sideways = narrowScreen && short;
  onMount(() => {
    window.addEventListener('popstate', onPopState);
    canSave = savedAvailable();
    pageUrl = here();
    wideQuery = window.matchMedia?.(WIDE);
    wide = !!wideQuery?.matches;
    narrowScreen = !!wideQuery && !wide;
    wideQuery?.addEventListener?.('change', onWide);
    shortQuery = window.matchMedia?.('(max-height: 500px)');
    short = !!shortQuery?.matches;
    shortQuery?.addEventListener?.('change', onShort);
    phoneQuery = window.matchMedia?.(PHONE);
    phoneQuery?.addEventListener?.('change', onPhone);
    const s = decodeSearchUrl(window.location.search, WORK_IDS);
    if (hasSearch(s)) searchFromUrl();
    else showTry = true;
  });
  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('popstate', onPopState);
    wideQuery?.removeEventListener?.('change', onWide);
    shortQuery?.removeEventListener?.('change', onShort);
    phoneQuery?.removeEventListener?.('change', onPhone);
    if (typeof document !== 'undefined') document.documentElement.style.overflow = '';
  });

  async function doSearch(e?: Event, opts: { history?: 'push' | 'none'; trans?: string | null; work?: string | null; xforms?: string[]; facets?: Facets } = {}) {
    e?.preventDefault();
    if (!grkQuery.trim() && !engQuery.trim() && !comboActive && !soloLemmaActive) return;
    // Lemma on and no word picked yet: the list to pick from, not a search.
    if (lemmaOn && !soloLemmaActive && grkQuery.trim() && !comboActive) {
      grkInput?.focus();
      void suggest(grkQuery);
      return;
    }
    popup = null;
    closeSugg();
    showTry = false;
    const run = ++searchRun;
    proxOn = comboActive;
    lastSearch = currentSearch();
    // Unnarrowed, a lone grammar term asks for the narrowing controls instead
    // (ruling 3, C2). The query is still recorded and any search in flight
    // retired, so the address and the page agree with what is on screen.
    // No work at all is no narrowing either, speaker or not: there is nowhere
    // to search, and "Choose works" is the answer.
    narrowPrompt = grammarAlone && (selectedWorks.size === 0 || (allSelected && !speakerFilter));
    if (narrowPrompt) {
      showNarrowPrompt(opts.history ?? 'push');
      return;
    }
    // A new search starts with every form in; one read from the address bar
    // keeps the forms it names.
    hitForms = null;
    formsFailed = null;
    formsMode = soloLemmaActive ? 'headword' : matchMode === 'text' ? 'form' : matchMode;
    excludedForms = new Set(opts.xforms ?? []);
    lastSearch.xforms = [...excludedForms];
    // Likewise no facet is ticked, in whatever view the reader is in.
    resetGrammar();
    facets = opts.facets ?? {};
    lastSearch.facets = facets;
    if ((opts.history ?? 'push') === 'push') writeUrl(lastSearch, 'push');
    loading = true;
    error = '';
    failedWorks = [];
    unsearched = [];
    unresolved = [];
    approximateTurns = [];
    approximateChapters = [];
    variantNote = '';
    variantsShown = false;
    // It retires any inflection lookup still running, so frees its button.
    variantBusy = false;
    pageError = '';
    csvNote = '';
    searched = false;
    speakerNote = describeSpeakerFilter(speakerFilter);
    speakerNoteKey = speakerFilter ? rosterWanted : '';
    // The running text names no word: no forms, no accent or case filter
    // after the search (accents are in the pattern), and its hits are marked
    // by token (hlt) alone.
    const runningText = matchMode === 'text' && !comboActive && !soloLemmaActive && !!grkQuery.trim();
    rtProgress = null;
    try {
      const works = WORKS.map(w => w.id).filter(id => selectedWorks.has(id));
      // Snapshot the submitted query for all deferred (per-page / CSV) rendering.
      searchCtx = {
        // Grammatical and combo queries name no single word, so there is
        // nothing for the reader to highlight on jump and no accent
        // post-filter to apply.
        grkQuery: comboActive || runningText ? '' : soloLemmaActive ? soloLemma.picked.join(' ') : grkQuery.trim(),
        engQuery: comboActive ? '' : engQuery.trim(),
        // The words as the index splits them: "coming-to-be" is three.
        engUnits: comboActive ? [] : englishQueryUnits(engQuery),
        // A picked lemma is a fold key, not the reader's spelling, so there is
        // no typed accent pattern to post-filter against.
        // Beta Code is converted first: it arrives as typed from the address
        // bar, or from the box with the β toggle off. A term in Greek script
        // is not, or its ( | + would turn into marks and its leading * into
        // a capital.
        grkAccentTerms: !comboActive && !soloLemmaActive && !runningText && accentSensitive
          ? grkQuery.trim().split(/\s+/).filter(Boolean)
            .map(t => accentNorm(greekScript(t) ? t : betaQueryToGreek(t)))
          : [],
        grkCaseTerms: !comboActive && !soloLemmaActive && !runningText && caseExact
          ? grkQuery.trim().split(/\s+/).filter(Boolean)
            .map(t => (greekScript(t) ? t : betaQueryToGreek(t)).normalize('NFC'))
          : [],
        engPhrase: engMode === 'phrase',
        engForms,
        langOp,
        speaker: speakerFilter,
      };
      const { results: found, failedWorks: failed, approximateTurns: approximate, approximateChapters: chaptersApproximate, unsearchedTranslations, unresolvedTerms, unnarrowed } = comboActive
        ? await searchCombo(comboSearchSlots, comboOptions, works)
        // Picked headwords are OR-ed: choosing two spellings of one word, or two
        // homonyms, asks for either, never for both in the same passage.
        // 'headword', not 'lemma': the picks ARE the headword keys. Under
        // 'lemma' each would be looked up as a surface again and widened to
        // every headword that spelling can belong to — ἤν back to εἰμί and ὅς —
        // which is exactly what the picker exists to rule out.
        : soloLemmaActive
          ? await search(soloLemma.picked.join(' '), engQuery, 'any', engMode, langOp, works, 'headword', engForms, speakerFilter)
          : runningText
            ? await searchText(works, run)
            : await search(grkQuery, engQuery, grkMode, engMode, langOp, works, matchMode === 'text' ? 'lemma' : matchMode, engForms, speakerFilter);
      if (run !== searchRun) return;
      // Accents and case exact: filtered before anything counts the results.
      const results = await exactFilter(found, searchCtx);
      if (run !== searchRun) return;
      // The engine found nothing narrows it (a NOT term that occurs nowhere).
      if (unnarrowed) {
        await showNarrowPrompt(opts.history ?? 'push');
        return;
      }
      failedWorks = failed;
      approximateTurns = approximate ?? [];
      approximateChapters = chaptersApproximate ?? [];
      unresolved = unresolvedTerms ?? [];
      unsearched = (unsearchedTranslations ?? []).map(({ work, translation }) =>
        `${translationRef(work, translation)?.short ?? translation} (${getWork(work)?.title ?? work})`);
      // New results: whatever was read for the old ones goes with them, here
      // and not only when the search began, since a lookup for the old
      // results may have landed while this search was out.
      hitForms = null;
      formsFailed = null;
      resetGrammar();
      allResults = results;
      // A translation named in the URL holds only if this search found it.
      const trans = opts.trans ?? null;
      transFilter = trans && results.some(r => r.engHits?.some(h => h.translation === trans)) ? trans : null;
      lastSearch.trans = transFilter;
      // So does a work, if it holds a hit.
      const work = opts.work ?? null;
      workFilter = work && results.some(r => r.work === work) ? work : null;
      lastSearch.workFilter = workFilter;
      if ((trans && !transFilter) || (work && !workFilter)) writeUrl(lastSearch, 'replace');
      searched = true;
      // The readings of the hits, for the grammar view or the facets. Like
      // the forms, the first page waits for them only if a facet is ticked.
      const grammar = view === 'grammar' || hasFacets(facets) ? needGrammar() : null;
      // The forms of a word search (a proximity search names no one word).
      // They come after the results unless some are set aside already, when
      // the first page must wait for them.
      if (searchCtx.grkQuery) {
        const forms = loadForms(results);
        if (excludedForms.size) await forms;
        if (run !== searchRun) return;
      }
      if (grammar && hasFacets(facets)) {
        await grammar;
        if (run !== searchRun) return;
      }
      await showResults(results);
    } catch (err) {
      if (run === searchRun) error = err instanceof Error ? err.message : String(err);
    } finally {
      if (run === searchRun) { loading = false; rtProgress = null; }
    }
  }

  // The running-text search, joined with the English one as search() joins
  // its two languages.
  async function searchText(works: string[], run: number): Promise<SearchOutcome> {
    const grk = await searchRunningText({ pattern: grkQuery, accents: accentSensitive, punctuation }, works, speakerFilter,
      (done, total) => { if (run === searchRun) rtProgress = { done, total }; });
    if (!engQuery.trim()) return grk;
    return joinEnglish(grk, await search('', engQuery, grkMode, engMode, langOp, works, 'lemma', engForms, speakerFilter), langOp);
  }

  // Greek keyword-in-context: a window of surface tokens around the match,
  // with the matched token(s) highlighted. Positions come from the index.
  // `reach` is the words shown either side (the Context control). With
  // `span`, a proximity window's first and last term, the passage runs from
  // `reach` words before the one to `reach` after the other, and the span is
  // shaded; every one of `positions` in the passage is marked.
  // A match that runs on past the section counts its later words on from the
  // section's first (hitTokens): `after`, the sections that follow it in its
  // book, carry the passage on, so every word of the match is shown marked.
  function greekKwic(work: string, seg: Segment, positions: number[], reach: number, span?: [number, number], after: Segment[] = []): string {
    const words = [seg, ...after].flatMap(s => segTokens(s).map((tok, i) => ({ tok, seg: s, i })));
    const n = words.length;
    if (!positions.length) return greekWords(work, words, 0, Math.min(n, 2 * reach + 1), new Set());
    const [first, last] = (span ?? [positions[0], positions[0]]).map(p => Math.min(p, n - 1));
    return greekWords(work, words, Math.max(0, first - reach), Math.min(n, last + reach + 1), new Set(positions), span && [first, last]);
  }

  // A segment's Greek tokens in the order the index counts them.
  const segTokens = (seg: Segment): Token[] => seg.greek.flatMap(line => line.tokens);
  // Each line's tokens in that order: number and suffix → [first, past last).
  function lineTokens(seg: Segment): Map<string, [number, number]> {
    const out = new Map<string, [number, number]>();
    let at = 0;
    for (const line of seg.greek) { out.set(`${line.n}${line.sub ?? ''}`, [at, at + line.tokens.length]); at += line.tokens.length; }
    return out;
  }

  // The sections after `seg` in its book that a match `last` words on from
  // its first reaches into, `reach` words more: none for a match inside it.
  function sectionsAfter(segments: Segment[], seg: Segment, last: number, reach: number): Segment[] {
    let n = segTokens(seg).length;
    const out: Segment[] = [];
    for (let k = segments.indexOf(seg) + 1; k > 0 && k < segments.length && n <= last + reach; k++) {
      out.push(segments[k]);
      n += segTokens(segments[k]).length;
    }
    return last < segTokens(seg).length ? [] : out;
  }

  // Every Greek word of a hit is a button that opens its card (WordPopup),
  // naming the token the one click handler on the results looks up.
  const wordButton = (work: string, seg: Segment, i: number, inner: string) =>
    `<button type="button" class="gw" data-w="${attr(work)}" data-s="${attr(seg.id)}" data-i="${i}">${inner}</button>`;

  // Words `from` to `to` (not included) of a run of tokens, each with its
  // section and place there, the `marked` ones in <mark>, with "…" where the
  // text is cut.
  function greekWords(work: string, words: { tok: Token; seg: Segment; i: number }[], from: number, to: number, marked: Set<number>, span?: [number, number]): string {
    let html = '';
    for (let i = from; i < to; i++) {
      const w = esc(words[i].tok.t);
      if (i > from) html += ' ';
      if (i === span?.[0]) html += '<span class="prox">';
      html += wordButton(work, words[i].seg, words[i].i, marked.has(i) ? `<mark>${w}</mark>` : w);
      if (i === span?.[1]) html += '</span>';
    }
    if (from > 0) html = '… ' + html;
    if (to < words.length) html += ' …';
    return html;
  }

  // A whole section's Greek as the page has it: every line, punctuation kept,
  // each word a button, the `marked` ones in <mark>. A window of words reads
  // well enough without its stops; a whole section does not.
  // Every fifth line carries its Bekker number, as the printed page does,
  // so a reader can find a word's line in an opened section (§7.5).
  function sectionGreekHtml(work: string, seg: Segment, marked: Set<number>): string {
    const index = new Map<Token, number>();
    segTokens(seg).forEach((tok, i) => index.set(tok, i));
    const numbered = schemeFor(work).hasUserFacingLines;
    return joinLines(seg.greek.map(line => {
      const html = lineRenderParts(line.text, line.tokens).map(part => {
        if (part.kind === 'text') return esc(part.text);
        if (part.kind !== 'token') return '';
        const i = index.get(part.tok)!;
        const w = esc(part.text);
        return wordButton(work, seg, i, marked.has(i) ? `<mark>${w}</mark>` : w);
      }).join('').trim();
      return html && numbered && line.n % 5 === 0 && !line.sub ? `<span class="ln" aria-hidden="true">${line.n}</span> ${html}` : html;
    }).filter(Boolean));
  }

  // A whole section, and where a match runs on past its last word (a token
  // past the section's end counts on into the next, as hitTokens reads it),
  // each following section it reaches, headed by its letter, its words
  // marked in place (John, 2026-11-11: carry on into the next section).
  function wholeSections(segments: Segment[], seg: Segment, marked: number[]): { seg: Segment; marked: Set<number> }[] {
    const top = Math.max(-1, ...marked);
    const out = [{ seg, marked: new Set(marked) }];
    let base = segTokens(seg).length;
    for (const s of sectionsAfter(segments, seg, top, 0)) {
      out.push({ seg: s, marked: new Set(marked.filter(p => p >= base).map(p => p - base)) });
      base += segTokens(s).length;
    }
    return out;
  }
  function wholeGreekHtml(work: string, segments: Segment[], seg: Segment, marked: number[]): string {
    return wholeSections(segments, seg, marked)
      .map(({ seg: s, marked: m }, k) => (k ? `<span class="sec-on">${esc(s.column)}</span> ` : '') + sectionGreekHtml(work, s, m))
      .join(' ');
  }

  // Printed lines as running text: joined by a space, except where a line
  // opens with the stop that belongs to the last word of the line before it;
  // then each word held to its stops (keepStops).
  const joinLines = (lines: string[]) =>
    keepStops(lines.reduce((html, line) => html + (html && !/^[,.;:·!?)\]’]/.test(line) ? ' ' : '') + line, ''));

  // A word button is a box, and a line may break at a box's edge, which would
  // send a comma to the head of the next line on its own. Each word is held
  // together with the stops and brackets written against it.
  const WORD_AND_STOPS = /([^\s<>]*)(<button type="button" class="gw"[^>]*>(?:<mark>)?[^<]*(?:<\/mark>)?<\/button>)([^\s<]*)/g;
  const keepStops = (html: string) => html.replace(WORD_AND_STOPS,
    (all, before: string, word: string, after: string) => (before || after ? `<span class="nb">${all}</span>` : all));

  // The Greek printed under an English hit: the unit's first PAIR_GREEK_LINES
  // lines as pairGreekText cuts them, punctuation kept, each word a button.
  function pairGreekHtml(work: string, seg: Segment, unit: PairUnit, full = false, marked = new Set<number>()): string {
    const index = new Map<Token, number>();
    segTokens(seg).forEach((tok, i) => index.set(tok, i));
    const spans = unit.greek.filter(span => span.text);
    const lineIndex = (span: PairUnit['greek'][number]) => seg.greek.findIndex(l => l.n === span.n && l.sub === span.sub);
    const lines = spans.slice(0, full ? undefined : PAIR_GREEK_LINES).map(span => {
      const line = seg.greek[lineIndex(span)];
      if (!line) return esc(span.text);
      const toks = line.tokens.filter(tok => tok.o >= span.from && tok.o < span.to);
      return lineRenderParts(line.text.slice(span.from, span.to), toks)
        .map(part => part.kind === 'token' ? wordButton(work, seg, index.get(part.tok)!, marked.has(index.get(part.tok)!) ? `<mark>${esc(part.text)}</mark>` : esc(part.text))
          : part.kind === 'text' ? esc(part.text) : '')
        .join('').trim();
    });
    return (full && spans.length && lineIndex(spans[0]) > 0 ? '… ' : '') + joinLines(lines) + (full && spans.length && lineIndex(spans.at(-1)!) < seg.greek.length - 1 ? ' …' : '') + (!full && spans.length > PAIR_GREEK_LINES ? ' …' : '');
  }

  // ── The word card ──────────────────────────────────────────────────────────
  // One WordPopup for the page, as the reader mounts it; it loads the work's
  // analyses itself on first use. The page's segments are kept so a click can
  // hand it the book's own token.
  let pageSegs = new Map<string, Segment>();   // work:segment id
  let popup: { work: string; token: Token; anchor: { x: number; y: number }; el?: HTMLElement } | null = null;
  // The word clicked stays marked while its card is open (d24).
  let picked: HTMLElement | null = null;
  function markPicked(el: HTMLElement | null) {
    if (picked === el) return;
    picked?.classList.remove('gw-on');
    el?.classList.add('gw-on');
    picked = el;
  }
  $: markPicked(popup?.el ?? null);
  // Close and Esc give the focus back to the word.
  function closeWord() {
    const el = popup?.el;
    popup = null;
    if (el?.isConnected) el.focus({ preventScroll: true });
  }
  // On a desktop the card takes the rail's column (ruling 12, d24).
  $: railWord = wide && !!popup;
  // One listener on the results, not one per word.
  function wordClicks(node: HTMLElement) {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('button.gw');
      if (!el) return;
      const { w, s: id, i } = el.dataset;
      const seg = pageSegs.get(`${w}:${id}`);
      const token = seg ? segTokens(seg)[Number(i)] : undefined;
      if (!w || !token) return;
      const rect = el.getBoundingClientRect();
      popup = { work: w, token, anchor: { x: rect.left, y: rect.bottom }, el };
      // On a narrow screen the word stays in view over its sheet, which takes
      // at most 45% of the screen (q09).
      const room = window.innerHeight * 0.55 - 12;
      if (!wide && rect.bottom > room) window.scrollBy({ top: rect.bottom - room });
    };
    node.addEventListener('click', onClick);
    return { destroy: () => node.removeEventListener('click', onClick) };
  }

  function esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  const attr = (s: string) => esc(s).replace(/"/g, '&quot;');

  // Bekker order within a chapter: page number, then column half (a < b), then
  // line. Sorting by line alone mis-orders hits that span two columns of one
  // chapter (e.g. 1097b3 before 1097a15). Works for grk and eng instances alike.
  function bekkerCmp(a: Instance, b: Instance): number {
    const pa = parseInt(a.column, 10) || 0;
    const pb = parseInt(b.column, 10) || 0;
    if (pa !== pb) return pa - pb;
    const ha = a.column.slice(-1), hb = b.column.slice(-1);
    if (ha !== hb) return ha < hb ? -1 : 1;
    return a.line - b.line || (a.at ?? 0) - (b.at ?? 0);
  }

  // --- CSV export (the FULL result set, every page) ------------------------
  function stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .trim();
  }
  function csvCell(v: string): string {
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }
  async function exportCsv() {
    if (csvBusy) return;
    csvBusy = true;
    csvNote = '';
    try {
      // Export every result, not just the current page — so build groups over
      // the whole set (loads any not-yet-fetched books on demand, bounded +
      // retried). If some book truly can't load, the CSV omits those rows and
      // we say so rather than silently shipping a short file.
      // A row per hit, whatever the page shows.
      const { groups: allGroups, failed } = await buildGroups(shownResults, searchCtx, '3', true);
      const origin = typeof location !== 'undefined' ? location.origin : '';
      // One row per hit, with quoted text fields and the reader URL last.
      const rows: string[][] = [['Work', 'Book', 'Chapter', 'Bekker', 'Language', 'Translation', 'Snippet', 'URL']];
      for (const g of allGroups) {
        const w = getWork(g.work);
        const workTitle = w?.title ?? g.work;
        const book = w?.bookLabels[g.book - 1] ?? String(g.book);
        for (const inst of g.instances) {
          // A Greek hit, then one row per translation: each is its own hit,
          // in its own words. An instance may hold both.
          if (inst.lang === 'grk' || !inst.rows) {
            rows.push([
              workTitle, String(book), g.chapter, inst.ref,
              inst.lang === 'grk' ? 'Greek' : 'English',
              '', stripHtml(inst.html), origin + inst.jumpUrl,
            ]);
          }
          // An English row cites its column (John, 13 Nov), even under a
          // Greek hit, whose own row keeps its line.
          const engRef = inst.lang === 'eng' || isChapterSection(w) ? inst.ref : formatCite(g.work, inst.column);
          for (const row of inst.rows ?? []) {
            const t = translationRef(g.work, row.translation);
            rows.push([
              workTitle, String(book), g.chapter, engRef, 'English',
              t?.short ?? row.translation, stripHtml(row.html), origin + row.jumpUrl,
            ]);
          }
        }
      }
      const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
      // Prepend a UTF-8 BOM so Excel renders Greek correctly.
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aristotle-search-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (failed.length) {
        csvNote = `Exported, but ${failed.length} passage source${failed.length === 1 ? '' : 's'} couldn’t load — the CSV may be missing some rows. Try again to retry those.`;
      }
    } catch (err) {
      csvNote = `Export failed: ${String(err)}`;
    } finally {
      csvBusy = false;
    }
  }

  function onEnter(e: KeyboardEvent) {
    if (e.key === 'Enter') doSearch();
  }

  // ── The field: Greek, English or Both ───────────────────────────────────────
  //
  // One field searches one language; Both shows the second. Switching empties
  // the box that goes out of view, so a hidden box never searches, and a query
  // that arrives in a hidden box (a URL, a step back) brings it into view.
  type Lang = 'greek' | 'english' | 'both';
  const LANGS: { v: Lang; l: string }[] = [
    { v: 'greek', l: 'Greek' },
    { v: 'english', l: 'English' },
    { v: 'both', l: 'Both' },
  ];
  let lang: Lang = 'greek';
  function setLang(next: Lang) {
    if (next === 'greek') engQuery = '';
    // Leaving Greek drops all of the Greek search: the typed word, and a
    // picked dictionary word with the Lemma switch that holds it.
    if (next === 'english') {
      grkQuery = '';
      lemmaOn = false;
      soloLemma = { ...soloLemma, picked: [] };
      closeSugg();
    }
    lang = next;
  }
  $: if (engQuery.trim() && lang === 'greek') lang = grkQuery.trim() ? 'both' : 'english';
  $: if (grkQuery.trim() && lang === 'english') lang = engQuery.trim() ? 'both' : 'greek';

  // "β Beta Code": with the toggle on, the Greek box turns Beta Code into
  // Greek as you type (lo/gos → λόγος), caret kept. Off on every visit: a
  // toggle that outlived the visit would quietly turn the next query Greek.
  // Greek and Both only: it converts the Greek field alone, never the English
  // one, and the English tab hides it.
  let betaMode = false;
  let grkInput: HTMLInputElement;

  function toggleBeta() {
    betaMode = !betaMode;
    if (betaMode && lang !== 'english' && grkQuery) grkQuery = liveGreek(grkQuery);
    grkInput?.focus();
  }

  // An IME or a phone keyboard that composes whole words (Gboard) is
  // converted when the word is committed, never mid-composition; an undo or
  // redo is left as it restores, though the list follows it.
  function onGreekInput(e: Event) {
    const ie = e as InputEvent;
    // An edit to a picked dictionary word unpicks it: the box no longer says it.
    if (soloLemma.picked.length) soloLemma = { ...soloLemma, picked: [] };
    if (ie.isComposing) return;
    if (ie.inputType !== 'historyUndo' && ie.inputType !== 'historyRedo') convertGreekBox(e.currentTarget as HTMLInputElement);
    suggest((e.currentTarget as HTMLInputElement).value);
  }

  // ── Dictionary words under the Greek box ───────────────────────────────────
  // As a single word is typed, the headwords it begins, from the Single-lemma
  // panel's data and in its order (commonest first). Picking one puts it in
  // the box; it does not run the search. A wildcard or a second
  // word asks for no list: the box is then searching as typed.
  const SUGGEST_MAX = 8;
  let sugg: LemmaMatch[] = [];
  let suggActive = -1;
  let suggRequest = 0;
  function closeSugg() {
    suggRequest++;
    sugg = [];
    suggActive = -1;
  }
  async function suggest(text: string) {
    const term = text.trimStart();
    // The old list goes at once: left up while the shard loads, Enter or a
    // click would pick a word the box no longer reads.
    closeSugg();
    const request = suggRequest;
    const pieces = term && !/\s/.test(term) && lang !== 'english' && matchMode !== 'text' ? patternPieces(term) : null;
    const folded = pieces?.every((p) => p.kind === 'char') ? greekFold(term) : '';
    let found: LemmaMatch[] = [];
    if (folded) {
      try {
        found = rankLemmaChoices(await fetchLemmaPickerShard(/^[a-z]/.test(folded) ? folded[0] : '_'), folded);
      } catch { /* no list */ }
    }
    if (request !== suggRequest) return;
    sugg = found.slice(0, SUGGEST_MAX);
    suggActive = -1;
  }
  // The running text is a pattern, not a word: no dictionary words for it.
  $: if (matchMode === 'text') closeSugg();

  // ── Lemma ──────────────────────────────────────────────────────────────────
  // The switch alone (ruling 5). On, the Greek box asks for a dictionary word
  // and its list opens at once; a pick from it is the search (?l=), every
  // form of that word and no other word that shares a form. Off, the box
  // searches what it says.
  let lemmaOn = false;
  const lemmaBoxText = (keys: string[], info = pickInfo) => keys.map((k) => info[k]?.heads ?? betaToGreek(k)).join(' ');
  async function toggleLemma() {
    lemmaOn = !lemmaOn;
    if (!lemmaOn) {
      soloLemma = { ...soloLemma, picked: [] };
      closeSugg();
      return;
    }
    await tick();
    grkInput?.focus();
    void suggest(grkQuery);
  }
  // Running text has no dictionary words: choosing it turns Lemma off.
  $: if (matchMode === 'text' && lemmaOn) { lemmaOn = false; soloLemma = { ...soloLemma, picked: [] }; }
  // A pick puts the headword in the box in place of the word typed, caret
  // after it, and leaves the search to the Search button (John, 2026-11-11).
  // The Greek keyboard shuts on a pick, as it did when a pick searched.
  async function pickSuggestion(m: LemmaMatch) {
    closeSugg();
    kbdOpen = false;
    if (lemmaOn) {
      // Lemma on: the pick is the search, every form of this dictionary word.
      const slug = m.candidates.find((c) => c.s)?.s;
      pickInfo = { ...pickInfo, [m.key]: { heads: lemmaHeads(m), slug, count: m.count } };
      soloLemma = { ...soloLemma, picked: [m.key] };
      grkQuery = lemmaHeads(m);
    } else grkQuery = m.candidates[0]?.h ?? m.key;
    await tick();
    grkInput?.focus();
    grkInput?.setSelectionRange(grkQuery.length, grkQuery.length);
  }
  function onGreekKey(e: KeyboardEvent) {
    if (sugg.length) {
      const n = sugg.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        suggActive = e.key === 'ArrowDown' ? (suggActive + 1) % n : suggActive <= 0 ? n - 1 : suggActive - 1;
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); closeSugg(); return; }
      if (e.key === 'Enter' && suggActive >= 0) { e.preventDefault(); void pickSuggestion(sugg[suggActive]); return; }
    }
    if (e.key === 'Escape' && kbdOpen) { e.preventDefault(); closeKbd(); return; }
    if (e.key === 'Enter') closeSugg();
    onEnter(e);
  }

  // ── The Greek keyboard ─────────────────────────────────────────────────────
  // Letters and marks typed into the Greek box through the path live typing
  // takes (an input event), so the bound query, the Beta Code conversion and
  // the suggestions all see them. Under the box on a wide screen; a sheet
  // from the bottom on a phone, by the site's phone rule (global.css).
  const PHONE = '(max-width: 680px), (orientation: landscape) and (max-height: 500px)';
  // A mark key shows its mark large over a bare ι: Literata's own breathings
  // read as dots at key size. The subscript key shows ῳ (ruling 6).
  const MARK_GLYPH: Record<string, string> = {
    'smooth breathing': '᾿', 'rough breathing': '῾', acute: '΄', grave: '`', circumflex: '῀', diaeresis: '¨',
  };
  let kbdOpen = false;
  let kbdSheet = false;
  // Proximity takes the box, so the keyboard has nothing to type into.
  $: if (comboActive && kbdOpen) kbdOpen = false;
  let phoneQuery: MediaQueryList | undefined;
  const onPhone = (e: MediaQueryListEvent) => { kbdSheet = e.matches; };
  async function toggleKbd() {
    if (kbdOpen) { closeKbd(); return; }
    kbdSheet = !!phoneQuery?.matches;
    kbdOpen = true;
    // A phone's own keyboard stays down (inputmode none) while this is open.
    await tick();
    if (!kbdSheet) grkInput?.focus();
  }
  function closeKbd() {
    kbdOpen = false;
    grkInput?.focus();
  }
  function keyEdit(edit: (value: string, start: number, end: number) => KeyEdit | null) {
    const el = grkInput;
    if (!el || el.disabled) return;
    const start = el.selectionStart ?? el.value.length;
    const next = edit(el.value, start, el.selectionEnd ?? start);
    if (!next) return;
    el.value = next.value;
    el.setSelectionRange(next.caret, next.caret);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  }
  // Esc on a key shuts the keyboard; Esc in the box is onGreekKey's.
  function onKbdKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !kbdOpen || e.defaultPrevented) return;
    if (!document.getElementById('grk-keys')?.contains(e.target as Node)) return;
    e.preventDefault();
    closeKbd();
  }

  function convertGreekBox(el: HTMLInputElement) {
    if (!betaMode || lang === 'english') return;
    const raw = el.value;
    const converted = liveGreek(raw);
    if (converted === raw) return;
    let caret = liveGreek(raw.slice(0, el.selectionStart ?? raw.length)).length;
    // A mark typed after the caret joins the letter before it; where the two
    // do not precompose, step past the mark rather than split them.
    while (caret < converted.length && /\p{M}/u.test(converted[caret])) caret++;
    el.value = converted;
    grkQuery = converted;
    el.setSelectionRange(caret, caret);
  }

  // The menus read "Match all words ▾", "In all works ▾".
  const modeLabel = (m: SearchMode) => MODE_OPTS.find((o) => o.v === m)?.l ?? m;
  const lower1 = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

  // The option menus are <details>: one open at a time, closed by a click
  // elsewhere or by Escape, which hands focus back to the menu's own button.
  // The menus open one at a time: the form's and the results' (.sopt), and
  // the language menu a sideways screen draws.
  const OPEN_MENUS = '.sopt .opt[open], .lang-menu[open]';
  let optSheetHead = '';
  function optSheetAttrs(head: string, active: string, narrow: boolean) {
    const modal = narrow && active === head;
    return {
      role: modal ? 'dialog' as const : undefined,
      'aria-modal': modal ? 'true' as const : undefined,
      'aria-labelledby': head,
      tabindex: modal ? -1 : undefined,
    };
  }
  async function closeOtherOpts(e: Event) {
    const el = e.currentTarget as HTMLDetailsElement;
    const head = el.querySelector('.sheet legend')?.id ?? '';
    if (!el.open) {
      if (optSheetHead === head) optSheetHead = '';
      return;
    }
    optSheetHead = head;
    for (const m of document.querySelectorAll<HTMLDetailsElement>(OPEN_MENUS)) if (m !== el) m.open = false;
    if (narrowScreen) {
      await tick();
      if (el.open) el.querySelector<HTMLElement>('.sheet')?.focus();
    }
  }
  // The form's menus stay open after a choice; the results' menus shut, their
  // choice applied at once, and focus goes back to the menu's own button.
  // An arrow key steps through the choices, each applied as it is reached:
  // the menu stays open for those, and Enter shuts it.
  let optArrowed = false;
  function optKey(e: KeyboardEvent) {
    optArrowed = e.key.startsWith('Arrow');
    // The change an arrow makes comes in the same turn as the key. One that
    // changed nothing (Ctrl+arrow) must not hold the next choice's menu open.
    if (optArrowed) setTimeout(() => (optArrowed = false));
    // Stopped, or the Enter goes on to the menu's button, which shutting
    // has just given the focus, and opens the menu again.
    if (e.key === 'Enter') { e.preventDefault(); shutOpt(e); }
  }
  function shutOpt(e: Event) {
    if (optArrowed) { optArrowed = false; return; }
    const m = (e.currentTarget as HTMLElement).closest('details');
    if (!m) return;
    m.removeAttribute('open');
    m.querySelector('summary')?.focus();
  }
  function onWindowClick(e: MouseEvent) {
    for (const m of document.querySelectorAll<HTMLDetailsElement>(OPEN_MENUS)) {
      if (!m.contains(e.target as Node)) {
        m.open = false;
        if (narrowScreen && m.querySelector('.sheet')) m.querySelector('summary')?.focus();
      }
    }
  }
  function onWindowKey(e: KeyboardEvent) {
    onKbdKey(e);
    const opt = narrowScreen ? document.querySelector<HTMLDetailsElement>('.search-form .opt[open]:has(.sheet)') : null;
    if (opt) onSheetKey(e, opt.querySelector<HTMLElement>('.sheet'), () => {
      opt.open = false;
      opt.querySelector('summary')?.focus();
    });
    else onSheetKey(e);
    onHelpKey(e);
    if (e.defaultPrevented) return;
    if (e.key !== 'Escape') return;
    const m = document.querySelector<HTMLDetailsElement>(OPEN_MENUS);
    if (m) {
      m.open = false;
      m.querySelector('summary')?.focus();
      return;
    }
    // Nothing else took the Escape: it shuts the proximity editor, and the
    // focus goes back to Proximity.
    if (!e.defaultPrevented && advancedOpen) {
      e.preventDefault();
      void closeEditor();
    }
  }
</script>

  <!-- `glosses` is passed in, not read from scope: a snippet re-renders for a
       change to what it is handed, and the glosses arrive after the list. -->
  {#snippet lemmaPicker(editor: ComboEditor, groupLabel: string, glosses: Record<string, string[]>, example: string)}
    <div class="lp">
      {#each editor.picked as key}
        {@const info = pickInfo[key]}
        <!-- A picked word reads as headword, count and Change, the gloss in
             italic under it; Change drops it and returns to the field. -->
        <div class="lpsel">
          <span class="hw" lang="grc">{info?.heads ?? key}</span>
          {#if info}<span class="ct">{info.count.toLocaleString('en')}</span>{/if}
          <button type="button" class="x" aria-label={`Change ${info?.heads ?? key} in ${groupLabel}`}
            on:click={() => changeComboLemma(editor.id, key)}>Change</button>
        </div>
        {#if info?.slug && glosses[info.slug]?.length}<i class="gl">{glosses[info.slug].slice(0, 2).join('; ')}</i>{/if}
      {/each}
      {#if !editor.picked.length}
        <input
          id={`lemma-${editor.id}`}
          class="prox-field"
          lang="grc"
          type="search"
          placeholder={`e.g. ${example}`}
          aria-label={`${groupLabel}: a dictionary word`}
          value={editor.lemmaInput}
          on:input={(e) => searchLemmaChoices(editor.id, e.currentTarget.value)}
          autocomplete="off"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
        />
      {/if}
      {#if editor.lemmaLoading}
        <p class="lp-status" aria-live="polite">Loading dictionary words…</p>
      {:else if editor.lemmaError}
        <p class="lp-status" role="alert">{editor.lemmaError}</p>
      {:else if editor.lemmaInput.trim() && editor.lemmaMatches.length === 0}
        <p class="lp-status">No dictionary word starts with that text.</p>
      {:else if editor.lemmaMatches.length}
        <!-- One choice per fold key, not per headword. The index is
             accent-folded, so ὅρος, ὄρος and ὀρός are a single key and no
             search can separate them; offering them as three choices would
             promise a distinction that does not exist. -->
        <ul class="lplist" aria-label={`Dictionary words for ${groupLabel}`}>
          {#each editor.lemmaMatches as match (match.key)}
            {@const heads = match.candidates.length ? match.candidates.map((c) => c.h).join(' · ') : match.key}
            {@const slug = match.candidates.find((c) => c.s)?.s}
            <li class:on={editor.picked.includes(match.key)} use:glossOnMount={slug}>
              <button type="button" aria-pressed={editor.picked.includes(match.key)}
                on:click={() => pickComboLemma(editor.id, match.key, { heads, slug, count: match.count })}>
                <span class="hw" lang="grc">{heads}</span>
                <span class="gl">{#if !match.candidates.length}no headword recorded{:else if match.candidates.length > 1}searched together — the index cannot separate them{:else if slug && glosses[slug]?.length}{glosses[slug].slice(0, 2).join('; ')}{/if}</span>
                <span class="ct">{match.count.toLocaleString('en')}</span>
              </button>
            </li>
          {/each}
        </ul>
        {#if editor.lemmaCapped}
          <p class="lp-status">Showing the first 30 matches. Type more to narrow the list.</p>
        {/if}
      {/if}
    </div>
  {/snippet}


  <!-- The Greek box's dictionary words. Under the box; inside the open
       keyboard panel instead, so the list never covers its keys. -->
  {#snippet suggestList(items: LemmaMatch[], active: number, glosses: Record<string, string[]>, lemma: boolean)}
    {#if lemma}<p class="gs-cap" aria-hidden="true">Lemma · Dictionary words</p>{/if}
    <ul id="grk-suggest" class="gs" role="listbox" aria-label="Dictionary words">
      {#each items as m, i (m.key)}
        {@const slug = m.candidates.find((c) => c.s)?.s}
        <li id={`grk-sugg-${i}`} role="option" tabindex="-1" aria-selected={i === active} class:on={i === active}
          use:glossOnMount={slug}
          on:mousedown|preventDefault
          on:click={() => pickSuggestion(m)}
          on:keydown={(e) => { if (e.key === 'Enter') pickSuggestion(m); }}>
          <span class="hw" lang="grc">{lemmaHeads(m)}</span>
          <span class="gl">{slug && glosses[slug]?.length ? glosses[slug].slice(0, 2).join('; ') : ''}</span>
          <span class="ct">{m.count.toLocaleString('en')}</span>
        </li>
      {/each}
    </ul>
  {/snippet}

  <!-- A menu of the form is a sheet on a phone (§5.9): a head, its choices,
       and a Done band at its foot; a wide screen draws no band. -->
  {#snippet sheetDone()}<div class="sheet-foot"><button type="button" class="sheet-done" on:click={shutOpt}>Done</button></div>{/snippet}

  {#snippet caret()}<svg class="opt-caret" width="8" height="5" viewBox="0 0 10 6" aria-hidden="true" fill="currentColor"><path d="M0 0l5 6 5-6z"/></svg>{/snippet}

  <!-- A menu over the hits, drawn as the search form's are (§5.2): its value
       on a hairline, a panel titled with its name, a gloss under each choice.
       A choice applies at once and shuts the menu. -->
  {#snippet displayMenu(title: string, name: string, choices: DisplayChoice[], current: string, choose: (id: string) => void)}
    <details class="opt" on:toggle={closeOtherOpts}>
      <summary>{title} <b>{choices.find(c => c.id === current)?.value ?? current}{@render caret()}</b></summary>
      <fieldset class="opt-panel">
        <legend class="opt-title">{title}</legend>
        {#each choices as c}
          <div class="opt-row" class:opt-rule={c.rule}>
            <label class="ck"><input type="radio" {name} value={c.id} checked={current === c.id} aria-describedby={c.gloss ? `${name}-${c.id}` : undefined}
              on:keydown={optKey} on:change={e => { choose(c.id); shutOpt(e); }} /><span>{c.label}</span></label>
            {#if c.gloss}<small class="opt-gloss" id={`${name}-${c.id}`}>{c.gloss}</small>{/if}
          </div>
        {/each}
      </fieldset>
    </details>
  {/snippet}

  {#snippet pager(cls: string)}
    <nav class="pager {cls}" aria-label="Result pages">
      <button type="button" class="pager-btn" aria-label="Previous page" on:click={() => goPage(pageIdx - 1)} disabled={pageIdx === 0 || pageLoading}><span class="pager-arrow" aria-hidden="true"></span></button>
      <span class="pager-status">{pageLoading ? 'Loading…' : `Page ${pageIdx + 1} of ${pages.length}`}</span>
      <button type="button" class="pager-btn pager-next" aria-label="Next page" on:click={() => goPage(pageIdx + 1)} disabled={pageIdx >= pages.length - 1 || pageLoading}><span class="pager-arrow" aria-hidden="true"></span></button>
    </nav>
  {/snippet}

  <!-- The translations with hits in a passage, under its English (ruling
       18): the one shown bold and underlined; a click shows another's
       English, its hits marked, in this instance only. One translation is
       its name alone. -->
  {#snippet names(inst: Instance, rows: TransRow[], current: string, order: Map<string, number>)}
    {@const list = orderedRows(rows, order)}
    {#if list.length === 1}
      <p class="tr-names"><span class="tr-name">{list[0].label}</span></p>
    {:else}
      <p class="tr-names" role="group" aria-label="Translations">
        {#each list as row, i (row.translation)}
          {#if i}<span class="tr-dot" aria-hidden="true">·</span>{/if}
          <button type="button" class="tr-name" aria-pressed={row.translation === current} title={row.title}
            on:click={() => showTrans(inst, row.translation)}>{row.label}</button>
        {/each}
      </p>
    {/if}
  {/snippet}

<svelte:window on:keydown={onWindowKey} on:click={onWindowClick} on:beforeprint={openForPrint} on:afterprint={closeAfterPrint} />

<main class="search-page" class:prox-pending={comboPending && searched}>
  <form class="search-form" on:submit={doSearch} novalidate>

    <!-- One field and the switch for what it searches: Greek, English, or Both
         (two fields). The box out of view is kept empty (setLang), and a URL or
         a step back that fills it brings it into view. Keyboard and Beta Code
         sit on the Greek field's rule, quiet tools, not buttons. -->
    <div class="sq">
      <div class="sq-fields">
        <!-- Proximity searches the Greek: its terms show on every tab. -->
        <div class="sq-row" hidden={lang === 'english' && !comboActive}>
          <svg class="sq-glass" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>
          <label class="query-label" class:sr-only={lang !== 'both'} for="grk-input">Greek</label>
          {#if comboActive}
            <!-- Proximity holds the box: its terms, read-only, at full ink. -->
            <input id="grk-input" class="query-input greek-input" lang="grc" type="search" value={proxTerms} disabled />
          {:else}
          <input
            id="grk-input"
            class="query-input greek-input"
            lang="grc"
            type="search"
            placeholder={lemmaOn ? 'a dictionary word, then pick it below' : 'e.g. τέχνη'}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={sugg.length > 0}
            aria-controls={sugg.length ? 'grk-suggest' : undefined}
            aria-activedescendant={suggActive >= 0 ? `grk-sugg-${suggActive}` : undefined}
            inputmode={kbdOpen ? 'none' : undefined}
            bind:value={grkQuery}
            bind:this={grkInput}
            on:input={onGreekInput}
            on:compositionend={(e) => { convertGreekBox(e.currentTarget); suggest(e.currentTarget.value); }}
            on:keydown={onGreekKey}
            on:blur={closeSugg}
            autocomplete="off"
            autocorrect="off"
            autocapitalize="none"
            spellcheck="false"
          />
          {/if}
          <button type="button" class="sq-tool gk-toggle" aria-label="Greek keyboard" aria-expanded={kbdOpen} aria-controls={kbdOpen && lang !== 'english' ? 'grk-keys' : undefined}
            disabled={comboActive} on:click={toggleKbd}>
            <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="0.7" y="0.7" width="20.6" height="14.6"/><path d="M4 4.5h2M8 4.5h2M12 4.5h2M16 4.5h2M4 8h2M8 8h2M12 8h2M16 8h2M6 11.5h10"/></svg>
            <span class="sq-tool-l" aria-hidden="true">Keyboard</span>
          </button>
          {#if lang !== 'english'}
            <button type="button" class="sq-tool tog" aria-pressed={betaMode} disabled={comboActive} on:click={toggleBeta} title="Type Beta Code, see Greek: lo/gos becomes λόγος as you type"><span lang="grc">β</span> <span class="sq-tool-l">Beta Code</span></button>
          {/if}
          {#if sugg.length && !lemmaOn && !(kbdOpen && !kbdSheet)}{@render suggestList(sugg, suggActive, lemmaGlosses, false)}{/if}
        </div>
        {#if kbdOpen && lang !== 'english'}
          <!-- Apple's Greek layout, each row half a key right of the one above;
               the marks on a row of their own, each drawn over a bare ι (the
               subscript as ῳ); space, ⌫ and Close at the foot (ruling 6). -->
          <div id="grk-keys" class="gk" class:gk-sheet={kbdSheet} role="group" aria-label="Greek keyboard">
            {#if sugg.length && !kbdSheet && !lemmaOn}{@render suggestList(sugg, suggActive, lemmaGlosses, false)}{/if}
            <div class="gk-keys">
              {#each KEY_ROWS as row, r}
                {#each [...row] as k, j}
                  <button type="button" class="gk-key" lang="grc" style:grid-row={r + 1} style:grid-column={`${r + 2 + 2 * j} / span 2`}
                    on:mousedown|preventDefault
                    on:click={() => keyEdit((v, a, b) => insertText(v, a, b, k))}>{k}</button>
                {/each}
              {/each}
              {#each GREEK_MARKS as m, j}
                <button type="button" class="gk-key gk-mark" aria-label={m.name} title={m.name} style:grid-row={4} style:grid-column={`${4 + 2 * j} / span 2`}
                  on:mousedown|preventDefault
                  on:click={() => keyEdit((v, a) => addMark(v, a, m.mark))}>
                  {#if MARK_GLYPH[m.name]}
                    <span class="gk-mf" aria-hidden="true" lang="grc"><span class="gk-mm">{MARK_GLYPH[m.name]}</span><span class="gk-mb">ι</span></span>
                  {:else}
                    <span class="gk-mf" aria-hidden="true" lang="grc">ῳ</span>
                  {/if}
                </button>
              {/each}
              <button type="button" class="gk-key gk-space" style:grid-row={5} style:grid-column="2 / span 12" on:mousedown|preventDefault
                on:click={() => keyEdit((v, a, b) => insertText(v, a, b, ' '))}>space</button>
              <button type="button" class="gk-key gk-bs" aria-label="backspace" title="backspace" style:grid-row={5} style:grid-column="14 / span 3" on:mousedown|preventDefault
                on:click={() => keyEdit(deleteBack)}><span aria-hidden="true">⌫</span></button>
              <button type="button" class="gk-key gk-wide" style:grid-row={5} style:grid-column="17 / span 4" on:click={closeKbd}>Close</button>
            </div>
          </div>
        {/if}
        <div class="sq-row" hidden={lang === 'greek'}>
          <svg class="sq-glass" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>
          <label class="query-label" class:sr-only={lang !== 'both'} for="eng-input">English</label>
          <input
            id="eng-input"
            class="query-input"
            type="search"
            placeholder="e.g. virtue"
            bind:value={engQuery}
            on:keydown={onEnter}
            autocomplete="off"
            disabled={comboActive}
          />
        </div>
      </div>
      <div class="lang-switch" role="group" aria-label="Search in">
        {#each LANGS as l}
          <button type="button" aria-pressed={lang === l.v} on:click={() => setLang(l.v)}>{l.l}</button>
        {/each}
      </div>
      <!-- Sideways the switch is a menu on the field's row (s01, r34-13). -->
      {#if sideways}
      <details class="opt lang-menu" on:toggle={closeOtherOpts}>
        <summary>{LANGS.find(l => l.v === lang)?.l}<span class="sr-only">{' search'}</span>{@render caret()}</summary>
        <fieldset class="opt-panel sheet" {...optSheetAttrs('lang-menu-head', optSheetHead, narrowScreen)}>
          <legend class="opt-title sheet-head" id="lang-menu-head">Search in</legend>
          {#each LANGS as l}
            <div class="opt-row">
              <label class="ck"><input type="radio" name="lang-m" value={l.v} checked={lang === l.v} on:keydown={optKey}
                on:change={e => { setLang(l.v); shutOpt(e); }} /><span>{l.l}</span></label>
            </div>
          {/each}
          {@render sheetDone()}
        </fieldset>
      </details>
      {/if}
    </div>

    <!-- The options: menus on a hairline underline, the switches alone, and
         Proximity with Search as one block at the right (ruling 4). Under Both,
         three rows: Greek, English, then what joins them and where. -->
    <div class="sopt" class:sopt-both={lang === 'both'} class:prox-editing={advancedOpen} class:opts-open={optsOpen} class:works-picking={worksOpen}>
      {#if lang !== 'english'}
        <div class="sopt-g">
          {#if matchMode !== 'text'}
          <details class="opt" on:toggle={closeOtherOpts}>
            <summary>{lang === 'both' ? 'Greek match' : 'Match'} <b>{lower1(modeLabel(grkMode))}{@render caret()}</b></summary>
            <fieldset class="opt-panel sheet" {...optSheetAttrs('grk-match-head', optSheetHead, narrowScreen)}>
              <legend class="opt-title sheet-head" id="grk-match-head">{lang === 'both' ? 'Greek match' : 'Match'}</legend>
              {#each MODE_OPTS as opt}
                <div class="opt-row">
                  <label class="ck"><input type="radio" name="grkmode" value={opt.v} bind:group={grkMode} aria-describedby={`gm-${opt.v}`} /><span>{opt.l}</span></label>
                  <small class="opt-gloss" id={`gm-${opt.v}`}>{opt.g}</small>
                </div>
              {/each}
              {@render sheetDone()}
            </fieldset>
          </details>
          {/if}
          <details class="opt" on:toggle={closeOtherOpts}>
            <summary>{lang === 'both' ? 'Greek form' : 'Form'} <b>{matchMode === 'text' ? 'running text' : matchMode === 'lemma' ? 'any form' : 'as typed'}{@render caret()}</b></summary>
            <fieldset class="opt-panel sheet" {...optSheetAttrs('grk-form-head', optSheetHead, narrowScreen)}>
              <legend class="opt-title sheet-head" id="grk-form-head">{lang === 'both' ? 'Greek form' : 'Form'}</legend>
              <div class="opt-row">
                <label class="ck"><input type="radio" name="matchmode" value="lemma" bind:group={matchMode} aria-describedby="gf-lemma" /><span>Any form of this word</span></label>
                <small class="opt-gloss" id="gf-lemma"><span lang="grc">ἀρετή</span> finds <span lang="grc">ἀρετῆς</span> and <span lang="grc">ἀρετάς</span></small>
              </div>
              <div class="opt-row">
                <label class="ck"><input type="radio" name="matchmode" value="form" bind:group={matchMode} aria-describedby="gf-form" /><span>Only as I typed it</span></label>
                <small class="opt-gloss" id="gf-form">this spelling and no other</small>
              </div>
              <div class="opt-row">
                <label class="ck"><input type="radio" name="matchmode" value="text" bind:group={matchMode} aria-describedby="gf-text" /><span>Running text</span></label>
                <small class="opt-gloss" id="gf-text"><span lang="grc">λογ</span> finds <span lang="grc">λόγος</span> and <span lang="grc">ἀναλογία</span></small>
              </div>
              {@render sheetDone()}
            </fieldset>
          </details>
          <!-- One choice, so one tap: a switch, drawn alone (ruling 5). -->
          <button type="button" class="opt-btn opt-switch" aria-pressed={accentSensitive}
            title="Match diacritics exactly: λόγος and λογός become different queries. A query typed without accents then only matches unaccented tokens."
            on:click={() => (accentSensitive = !accentSensitive)}>Accents<span class="sw" aria-hidden="true"></span></button>
          {#if matchMode === 'text'}
          <button type="button" class="opt-btn opt-switch" aria-pressed={punctuation}
            title="Match the stops between words: , . ; and · (typed · or :). Off, each break between words is one space."
            on:click={() => (punctuation = !punctuation)}>Punctuation<span class="sw" aria-hidden="true"></span></button>
          {:else}
          <!-- Capitals is gone (ruling 5): capitals are always ignored. Lemma
               takes its place: on, the box asks for a dictionary word. -->
          <button type="button" class="opt-btn opt-switch opt-lemma" aria-pressed={lemmaOn}
            title="Search one dictionary word in all its forms: type it, then pick it from the list"
            on:click={toggleLemma}>Lemma<span class="sw" aria-hidden="true"></span></button>
          {/if}
        </div>
      {/if}
      {#if lang !== 'greek'}
        <div class="sopt-e">
          <details class="opt" on:toggle={closeOtherOpts}>
            <summary>{lang === 'both' ? 'English match' : 'Match'} <b>{lower1(modeLabel(engMode))}{@render caret()}</b></summary>
            <fieldset class="opt-panel sheet" {...optSheetAttrs('eng-match-head', optSheetHead, narrowScreen)}>
              <legend class="opt-title sheet-head" id="eng-match-head">{lang === 'both' ? 'English match' : 'Match'}</legend>
              {#each MODE_OPTS as opt}
                <div class="opt-row">
                  <label class="ck"><input type="radio" name="engmode" value={opt.v} bind:group={engMode} aria-describedby={`em-${opt.v}`} /><span>{opt.l}</span></label>
                  <small class="opt-gloss" id={`em-${opt.v}`}>{opt.g}</small>
                </div>
              {/each}
              {@render sheetDone()}
            </fieldset>
          </details>
          <details class="opt" on:toggle={closeOtherOpts}>
            <summary>{lang === 'both' ? 'English form' : 'Form'} <b>{engForms ? 'any form' : 'as typed'}{@render caret()}</b></summary>
            <fieldset class="opt-panel sheet" {...optSheetAttrs('eng-form-head', optSheetHead, narrowScreen)} title="Any form: virtue also finds virtues and virtue’s, man finds men. Only as I typed it: the spelling you gave, and no other.">
              <legend class="opt-title sheet-head" id="eng-form-head">{lang === 'both' ? 'English form' : 'Form'}</legend>
              <div class="opt-row"><label class="ck"><input type="radio" name="engforms" value={true} bind:group={engForms} /><span>Any form of this word</span></label></div>
              <div class="opt-row"><label class="ck"><input type="radio" name="engforms" value={false} bind:group={engForms} /><span>Only as I typed it</span></label></div>
              {@render sheetDone()}
            </fieldset>
          </details>
        </div>
      {/if}
      <div class="sopt-w">
        <!-- A picked headword is the Greek side too, with the Greek box empty. -->
        {#if lang === 'both' || (soloLemmaActive && engQuery.trim())}
          <details class="opt" on:toggle={closeOtherOpts}>
            <summary>Hits match <b>{langOp === 'and' ? 'both languages' : 'either language'}{@render caret()}</b></summary>
            <fieldset class="opt-panel sheet op-group" {...optSheetAttrs('hits-match-head', optSheetHead, narrowScreen)}>
              <legend class="opt-title sheet-head" id="hits-match-head">Hits match</legend>
              <div class="opt-row"><label class="ck" title="Only passages matching both queries"><input type="radio" name="op" value="and" bind:group={langOp} /><span>Both languages</span></label></div>
              <div class="opt-row"><label class="ck" title="Passages matching either query"><input type="radio" name="op" value="or" bind:group={langOp} /><span>Either language</span></label></div>
              {@render sheetDone()}
            </fieldset>
          </details>
        {/if}
        <!-- In: all works, the authentic ones (works.ts authenticity), or a
             choice from the works picker, which shows In open while it is. -->
        <details class="opt opt-in" class:picking={worksOpen} on:toggle={closeOtherOpts}>
          <summary>In <b>{worksValue}{@render caret()}</b></summary>
          <fieldset class="opt-panel sheet" {...optSheetAttrs('works-scope-head', optSheetHead, narrowScreen)}>
            <legend class="opt-title sheet-head" id="works-scope-head">In</legend>
            {#each WORKS_SCOPES as sc}
              <div class="opt-row" class:opt-rule={sc.v === 'pick'}>
                <label class="ck"><input type="radio" name="worksscope" value={sc.v} checked={worksScope === sc.v} on:click={(e) => setWorksScope(sc.v, e)} aria-describedby={`ws-${sc.v}`} /><span>{sc.l}</span></label>
                <small class="opt-gloss" id={`ws-${sc.v}`}>{sc.g}</small>
              </div>
            {/each}
            {@render sheetDone()}
            </fieldset>
        </details>
        {#if SPEAKERS}
        <button
          type="button"
          class="works-trigger opt-btn"
          aria-expanded={speakerOpen}
          aria-controls="speaker-panel"
          on:click={() => { speakerOpen = !speakerOpen; if (speakerOpen) worksOpen = false; }}
        >Spoken by <b>{lower1(speakerSummary)}{@render caret()}</b></button>
        {/if}
      </div>
      <div class="sopt-act">
        <!-- A phone's: the options folded under one link (§5.7). -->
        <button type="button" class="opts-toggle" aria-expanded={optsOpen} on:click={toggleOpts}>Options{@render caret()}</button>
        <button
          type="button"
          class="advanced-trigger"
          aria-expanded={advancedOpen}
          aria-controls="advanced-tools"
          bind:this={proxTrigger}
          on:click={toggleAdvanced}
        >{#if proxLive}<span class="prox-dot" aria-hidden="true"></span>{/if}Proximity<span class="sr-only"> search{proxLive ? ', on' : ''}</span>{@render caret()}</button>
        <!-- With the editor open, its own Search is the one. -->
        {#if !advancedOpen}
          <button type="submit" class="search-btn" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        {/if}
      </div>
    </div>
    {#if !optsOpen && !advancedOpen && !proxLive && !worksOpen}
      <!-- A phone's line of what the folded options are set to, and the
           settings of the results that are not their defaults, in red. -->
      <p class="sopt-sum">{optsLine.join(' · ')}{#each viewLine as v}{' · '}<span class="sopt-sum-v">{v}</span>{/each}</p>
    {/if}
    {#if lemmaOn && sugg.length}
      <!-- Lemma on: the dictionary words open under the options, so the
           choice is in view, and the results step back behind them. -->
      <div class="gs-under">{@render suggestList(sugg, suggActive, lemmaGlosses, true)}</div>
    {/if}

    {#if loading && rtProgress}
      <p class="rt-progress">Searching {rtProgress.done} of {rtProgress.total} work{rtProgress.total === 1 ? '' : 's'}…</p>
    {/if}
    {#if !searched && !advancedOpen}
      <p class="sx-hint">
        {#if matchMode === 'text' && lang !== 'english'}
        <span class="hk"><code>.</code> one letter</span>
        <span class="hk"><code>.*</code> any run</span>
        <span class="hk"><code>|</code> or</span>
        {:else}
        <span class="hk"><code>*</code> any letters</span>
        <span class="hk"><code>?</code> one letter</span>
        {/if}
        <span class="hk"><code>texnh</code> → <span lang="grc">τέχνη</span>, in <button type="button" class="link-btn" on:click={openHelp} aria-haspopup="dialog" title="How to type Greek">Beta Code</button></span>
      </p>
    {/if}

    <!-- Proximity (§5.5): the search in one sentence while it is live, with
         Turn off · Close (Change when shut) · Guide; the editor under it. -->
    {#if proxLive || advancedOpen}
      <div id="advanced-tools" class="prox">
        {#if proxLive}
          <p class="prox-sum" class:prox-was={comboPending}>{#if comboPending}<span class="prox-last">Last search ·</span>{' '}{/if}{proxSentence}</p>
          <p class="prox-links">
            <button type="button" class="prox-link" on:click={turnOffProximity}>Turn off</button>
            {#if advancedOpen}
              <button type="button" class="prox-link" on:click={closeEditor}>Close</button>
            {:else}
              <button type="button" class="prox-link prox-change" aria-expanded="false" on:click={openEditor}>Change</button>
            {/if}
            <a class="prox-link" href={`${BASE_URL}/advanced#combo`}>Guide</a>
          </p>
        {/if}
        {#if advancedOpen}
          <div class="prox-terms" role="group" aria-label="Proximity search">
            {#each comboEditors as slot, i (slot.id)}
              {@const n = i + 1}
              {@const inRun = i > 0 && (slot.or || !!comboEditors[i + 1]?.or) || (i === 0 && !!comboEditors[1]?.or)}
              <section class="combo-slot" class:prox-run={inRun} aria-labelledby={`combo-slot-${slot.id}`}>
                {#if i === 0}
                  <span class="prox-colh prox-c1" id={`combo-slot-${slot.id}`}>Term 1</span>
                  <span class="prox-colh prox-c2" aria-hidden="true">Relation</span>
                  <span class="prox-colh prox-c3" aria-hidden="true">Kind</span>
                  <span class="prox-colh prox-c4" aria-hidden="true">Distance</span>
                {:else}
                  <div class="prox-head prox-c1">
                    <span class="prox-sel">
                      <span class="prox-selv" aria-hidden="true">{slot.or ? 'or' : 'and'}</span>
                      <select class="prox-join" aria-label={`Join term ${n} to term ${i}`} value={slot.or ? 'or' : 'and'}
                        on:change={(e) => setComboJoin(slot.id, e.currentTarget.value === 'or')}>
                        <option value="and">and</option>
                        <option value="or">or</option>
                      </select>
                    </span>
                    <span class="prox-tn" id={`combo-slot-${slot.id}`}>Term {n}</span>
                  </div>
                {/if}

                <!-- A phone names each control over it (§5.7); a wide screen
                     names the columns once, on term 1's line. -->
                <span class="prox-ml prox-m1" aria-hidden="true">{i === 0 ? 'Kind' : 'Relation'}</span>
                <span class="prox-ml prox-m2" aria-hidden="true">{i === 0 ? 'Distance' : 'Kind'}</span>

                <div class="prox-word prox-c1">
                  {#if slot.kind === 'lemma'}
                    {@render lemmaPicker(slot, `Term ${n}`, lemmaGlosses, TERM_EXAMPLES[i] ?? 'ἀρετή')}
                  {:else if slot.kind === 'grammatical'}
                    <span class="prox-gram" class:prox-empty={!Object.keys(slot.grammar).length}>{Object.keys(slot.grammar).length ? grammarWords(slot.grammar) : 'any word'}</span>
                  {:else}
                    <input
                      id={`combo-text-${slot.id}`}
                      class="prox-field"
                      lang="grc"
                      type="text"
                      placeholder={slot.kind === 'phrase' ? 'e.g. τὸ τί ἦν εἶναι' : `e.g. ${TERM_EXAMPLES[i] ?? 'ἀρετή'}`}
                      aria-label={`Term ${n}: ${slot.kind === 'phrase' ? 'the words, in order' : 'the word as written'}`}
                      value={slot.text}
                      on:input={(e) => setComboText(slot.id, e.currentTarget.value)}
                      autocomplete="off"
                      autocorrect="off"
                      autocapitalize="none"
                      spellcheck="false"
                    />
                  {/if}
                </div>

                {#if i > 0}
                  <div class="prox-rel prox-c2">
                    {#if slot.or}
                      <span class="prox-as">as term {runHead(comboEditors, i)}</span>
                    {:else}
                      {@const choices = targetChoices(comboEditors, i, pickInfo)}
                      {@const shown = shownTarget(comboEditors, i)}
                      <span class="prox-relw">
                        <span class="prox-sel">
                          <span class="prox-selv" aria-hidden="true">{RELATIONS.find(r => r.v === slot.relation)?.l}</span>
                          <select aria-label={`Relation of term ${n}`} value={slot.relation}
                          on:change={(e) => setComboRelation(slot.id, e.currentTarget.value as SlotRelation)}>
                          {#each RELATIONS as r}<option value={r.v}>{r.l}</option>{/each}
                          </select>
                        </span>
                      </span>
                      <span class="prox-sel">
                        <span class="prox-selv prox-targetv" aria-hidden="true" lang="grc">{choices.find(c => c.id === shown)?.label ?? choices[0]?.label}</span>
                        <select class="prox-target" aria-label={`Term ${n} is measured from`} value={String(shown ?? '')}
                          on:change={(e) => setComboTarget(slot.id, e.currentTarget.value ? Number(e.currentTarget.value) : null)}>
                          {#each choices as c}<option value={String(c.id ?? '')} lang="grc">{c.label}</option>{/each}
                        </select>
                      </span>
                    {/if}
                  </div>
                {/if}

                <div class="prox-kindc prox-c3">
                  <span class="prox-sel">
                    <span class="prox-selv" aria-hidden="true">{SLOT_KINDS.find(k => k.v === slot.kind)?.l}</span>
                    <select class="prox-kind" aria-label={`Kind for term ${n}`} value={slot.kind}
                      on:change={(e) => setComboKind(slot.id, e.currentTarget.value as SlotKind)}>
                      {#each SLOT_KINDS as k}<option value={k.v}>{k.l}</option>{/each}
                    </select>
                  </span>
                </div>

                {#if i === 0}
                  <div class="prox-dist prox-c4">
                    {#if comboUnit === 'words'}
                      <span>within</span>
                      <input type="number" class="prox-win" min="1" max={COMBO_WINDOW_MAX} aria-label="Distance in words"
                        bind:value={comboWindow} on:blur={clampComboWindow} />
                    {:else}
                      <span>in</span>
                    {/if}
                    <span class="prox-sel">
                      <span class="prox-selv" aria-hidden="true">{comboUnit === 'words' ? 'words' : comboUnit === 'line' ? 'the same line' : 'the same chapter'}</span>
                      <select aria-label="Distance measured in" bind:value={comboUnit}>
                        <option value="words">words</option>
                        <option value="line">the same line</option>
                        {#if comboUnit === 'chapter'}<option value="chapter">the same chapter</option>{/if}
                      </select>
                    </span>
                  </div>
                {:else}
                  <button type="button" class="prox-remove prox-c5" aria-label={`Remove term ${n}`} on:click={() => removeComboEditor(slot.id)}>Remove</button>
                {/if}

                {#if slot.kind === 'grammatical'}
                  <!-- Every category at once, as rows of chips; one value each. -->
                  <div class="combo-grammar-grid prox-chips">
                    {#each GRAMMAR_CATEGORIES as cat}
                      <span class="prox-chiph" class:prox-chiph-wide={cat.key === 'marker'} id={`g-${slot.id}-${cat.key}`}>{cat.label}</span>
                      <div class="prox-chipset" class:prox-chipset-wide={cat.key === 'marker'} role="group" aria-labelledby={`g-${slot.id}-${cat.key}`}>
                        {#each cat.values as v}
                          <button type="button" class="prox-chip" aria-pressed={slot.grammar[cat.key] === v}
                            on:click={() => setComboGrammar(slot.id, cat.key, v)}>{CHIP_NAMES[v] ?? v}</button>
                        {/each}
                      </div>
                    {/each}
                  </div>
                {/if}
              </section>
            {/each}
          </div>

          <button type="button" class="prox-add" disabled={comboEditors.length >= COMBO_TERMS_MAX} on:click={addComboEditor}>Add term</button>
          {#if comboOrderSet}
            <p class="prox-order">Order set by before or after</p>
          {:else}
            <label class="prox-lock"><input type="checkbox" bind:checked={comboOrdered} /> In this order</label>
          {/if}
          <!-- Aristotle's own: a match may stand across a chapter break, or not
               (cx=0). Round 34, drawn on Plato, has no chapters to keep. -->
          <label class="prox-lock"><input type="checkbox" bind:checked={comboCrossChapter} /> Keep hits that cross a chapter</label>
          <div class="prox-go" use:reserveProxBar>
            <button type="submit" class="search-btn prox-search" disabled={loading} on:click={searchEditor}>{loading ? 'Searching…' : 'Search'}</button>
            {#if pendingSentence}<p class="prox-pend">Not searched yet: {pendingSentence}</p>
            {:else if comboAsked}<p class="prox-pend" role="status">{comboAsked}</p>{/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- The works picker, opened from In's "Choose works…". -->
    <div id="works-panel" class="works-panel" role="group" aria-label="Works to search" hidden={!worksOpen}>
      {#if worksOpen}
        <div class="works-body">
          <div class="works-actions">
            <span class="works-count">{selectedWorks.size} of {WORKS.length} works</span>
            <button type="button" class="works-action" on:click={selectAll} disabled={allSelected}>Select all</button>
            <button type="button" class="works-action" on:click={clearWorks} disabled={selectedWorks.size === 0}>Clear</button>
            <button type="button" class="works-done" on:click={closeWorks}>Done</button>
          </div>

          <input type="search" class="works-find" placeholder="Find a work" aria-label="Find a work" bind:value={worksFind}
            autocomplete="off" spellcheck="false" />

          <div class="works-auth" role="group" aria-label="Filter works by authorship status">
            {#each AUTH_SCOPES as s}
              <button
                type="button"
                class="auth-btn"
                class:on={activeAuthScope === s.key}
                aria-pressed={activeAuthScope === s.key}
                disabled={s.ids.length === 0}
                on:click={() => selectOnly(s.ids)}
                title={s.key === 'all' ? 'Search all works' : `Search only ${s.label.toLowerCase()} works`}
              >{s.label}{#if s.key !== 'all'}<span class="auth-count">{s.ids.length}</span>{/if}</button>
            {/each}
          </div>

          {#each SEARCH_GROUPS as grp}
            {@const shown = grp.ids.filter(id => findsWork(id, worksFind))}
            {#if shown.length}
            <div class="works-group">
              <div class="works-group-head">
                <span class="works-group-name">{grp.ref ? `${grp.ref}. ` : ''}{grp.label}</span>
                <span class="works-group-scope">
                  <button type="button" class="scope-btn" on:click={() => selectOnly(grp.ids)} title="Search only this division">Only these {grp.ids.length}</button>
                  <button type="button" class="scope-btn" on:click={() => addGroup(grp.ids)} title="Add this division to the selection">Add these {grp.ids.length}</button>
                </span>
              </div>
              <div class="works-chips">
                {#each shown as id}
                  {@const w = getWork(id)}
                  {#if w}
                    <button
                      type="button"
                      class="work-chip"
                      class:on={selectedWorks.has(id)}
                      aria-pressed={selectedWorks.has(id)}
                      on:click={() => toggleWork(id)}
                      title={`${w.abbr} · ${w.title}`}
                    >{w.title}</button>
                  {/if}
                {/each}
              </div>
            </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    {#if SPEAKERS}
    <div id="speaker-panel" class="works-panel speaker-panel" role="group" aria-label="Spoken by" hidden={!speakerOpen}>
      {#if speakerOpen}
        <div class="works-body speaker-body">
          <fieldset class="mode-group speaker-mode">
            <legend>Keep words spoken by</legend>
            <label><input type="radio" name="speakermode" value="anyone" bind:group={speakerMode} /> Anyone</label>
            <label><input type="radio" name="speakermode" value="only" bind:group={speakerMode} /> Only these speakers</label>
            <label><input type="radio" name="speakermode" value="except" bind:group={speakerMode} /> Anyone but these</label>
          </fieldset>

          {#if speakerMode === 'anyone'}
            <p class="speaker-note">
              Every word in a dialogue has a speaker. Choose a mode to hold the
              search to one voice — <span lang="grc">ἀρετή</span> in Socrates'
              mouth only, or anywhere but.
              <a class="guide-link" href={`${BASE_URL}/advanced#speaker`} target="_blank" rel="noreferrer">What is this?</a>
            </p>
          {:else}
            {#if rosterLoading}
              <p class="speaker-note">Reading the cast of the selected works…</p>
            {:else if rosterError}
              <p class="speaker-note warn">
                The cast could not be loaded: {rosterError}
                <button type="button" class="retry-btn" on:click={() => loadRoster(rosterWanted)}>Retry</button>
              </p>
            {:else if !cast.length}
              <p class="speaker-note">
                None of the selected works carries speaker labels the filter can
                use, so there is nobody to choose.
                {#if unlabelledWorks.length}
                  {listNames(unlabelledWorks)} {unlabelledWorks.length > 1 ? 'are' : 'is'} narrated without
                  speaker labels.
                {/if}
                {#if narratedWorks.length}
                  {listNames(narratedWorks)} {narratedWorks.length > 1 ? 'are' : 'is'} reported by a narrator —
                  the text labels the frame, not the speeches inside it.
                {/if}
                Add a dialogue to the works above.
              </p>
            {:else}
              <div class="works-actions">
                <span class="speaker-count">{speakerNames.size ? `${speakerNames.size} chosen` : 'Pick one or more'}</span>
                <button type="button" class="works-action" on:click={clearSpeakers} disabled={speakerNames.size === 0}>Clear</button>
              </div>
              <div class="works-chips speaker-chips">
                {#each cast as s (s.name)}
                  <button
                    type="button"
                    class="work-chip"
                    class:on={speakerNames.has(s.name)}
                    aria-pressed={speakerNames.has(s.name)}
                    on:click={() => toggleSpeaker(s.name)}
                    title={`${s.turns} ${s.turns === 1 ? 'speech' : 'speeches'} across ${s.works} ${s.works === 1 ? 'work' : 'works'}`}
                  >{s.name} <span class="speaker-turns">{s.turns}</span></button>
                {/each}
              </div>
              <p class="speaker-note">
                Greek hits are held to the word; English hits to the passage,
                because the translation is aligned to the section, not the word.
                {#if unlabelledWorks.length}
                  {listNames(unlabelledWorks)} {unlabelledWorks.length > 1 ? 'are' : 'is'} narrated without
                  speaker labels and will be left out of a filtered search.
                {/if}
                {#if narratedWorks.length}
                  {listNames(narratedWorks)} {narratedWorks.length > 1 ? 'are' : 'is'} reported by a narrator —
                  the text labels the frame, not the speeches inside it — and will be left out too.
                {/if}
                {#if approxRosterWorks.length}
                  Where a speech begins in {listNames(approxRosterWorks)} is recorded to the line rather
                  than the word, so a match at the very edge of a speech may belong to the one beside it.
                {/if}
                {#if rosterFailedWorks.length}
                  The cast of {listNames(rosterFailedWorks)} did not load.
                {/if}
                <a class="guide-link" href={`${BASE_URL}/advanced#speaker`} target="_blank" rel="noreferrer">What is this?</a>
              </p>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
    {/if}
  </form>

  {#if showHelp}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="help-backdrop" on:click={closeHelp}>
      <div
        class="help-modal"
        bind:this={helpModal}
        role="dialog"
        aria-modal="true"
        aria-label="How to type Greek"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown={onHelpKey}
      >
        <div class="help-head">
          <h2>How to type Greek</h2>
          <button type="button" class="help-close" on:click={closeHelp} aria-label="Close">×</button>
        </div>

        <p class="help-intro">
          The Greek box accepts Greek letters <em>or</em> <strong>Beta Code</strong> — a plain-ASCII
          transliteration. Each Greek letter is one Latin key:
        </p>

        <div class="beta-grid">
          {#each BETA_LETTERS as L}
            <div class="beta-cell">
              <span class="beta-key">{L.beta}</span>
              <span class="beta-grk" lang="grc">{L.greek}</span>
              <span class="beta-name">{L.name}</span>
            </div>
          {/each}
        </div>

        <h3>Accents &amp; breathings <span class="help-note">(optional — ignored when matching)</span></h3>
        <p class="help-sub">Type the mark right after the vowel:</p>
        <ul class="mark-list">
          {#each BETA_MARKS as M}
            <li><span class="beta-key">{M.beta}</span> <span class="mark-ex" lang="grc">{M.example}</span> <span class="beta-name">{M.name}</span></li>
          {/each}
        </ul>

        <h3>Examples</h3>
        <ul class="example-list">
          {#each BETA_EXAMPLES as E}
            <li><code>{E.beta}</code> <span class="ex-arrow" aria-hidden="true">→</span> <span class="ex-grk" lang="grc">{E.greek}</span></li>
          {/each}
        </ul>

        <p class="help-foot">
          Long vowels are distinct: <code>h</code> = η (not <code>e</code> = ε), <code>w</code> = ω (not <code>o</code> = ο).
          Type them exactly. Accents and breathings may be included or left off.
        </p>

        <h3>Wildcards</h3>
        <ul class="example-list">
          <li><code>?</code> or <code>.</code> one letter</li>
          <li><code>*</code> any letters</li>
          <li><code>+</code> one or more of the letter before</li>
          <li><code>[εη]</code> one of these; <code>[^εη]</code> any letter but these</li>
          <li><code>(ος|ου)</code> one or the other</li>
          <li><code>^</code> <code>$</code> start and end of the word</li>
        </ul>
        <p class="help-sub">
          In Greek letters all of these work: <code>*ικος</code> ends in -ικος. In Beta Code a
          leading <code>*</code> is a capital and <code>( ) | +</code> are marks, so write
          <code>.*ikos$</code>; with β on, those keys type marks. English takes <code>*</code> and
          <code>?</code> only (<code>*ness</code>).
        </p>
      </div>
    </div>
  {/if}

  <!-- Always in the page, so a screen reader hears it change: a live region
       added with its text already in it is usually not announced, and the
       visible count is rebuilt with every search. -->
  <p class="sr-only" role="status" aria-live="polite">{loading ? 'Searching…' : searched && !error ? countText : ''}</p>

  {#if showTry && !searched && !loading && !error && !narrowPrompt}
    <section class="sx-try" aria-labelledby="sx-try-h">
      <h2 id="sx-try-h">Try</h2>
      <ul>
        {#each TRY as t}
          <li><a href={`${BASE_URL}/search/${t.href}`}><span lang={t.grc ? 'grc' : 'en'}>{t.q}</span><small>{t.g}</small></a></li>
        {/each}
      </ul>
      <p>
        <a href={`${BASE_URL}/advanced`}>How search works</a>
        <a href={`${BASE_URL}/saved`}>Saved searches</a>
      </p>
    </section>
  {/if}

  {#if error}
    <p class="search-error">{error}</p>
  {:else if narrowPrompt}
    <div class="narrow-prompt" role="group" aria-label="Narrow the search">
      <button type="button" on:click={() => openNarrower('works')}>Choose works</button>
      {#if SPEAKERS}<button type="button" on:click={() => openNarrower('speakers')}>Choose speakers</button>{/if}
      <button type="button" on:click={() => openNarrower('word')}>Add a word near or not near</button>
    </div>
  {:else if searched}
    <!-- The controls of the results in one place: on a desktop the rail beside
         the hits (round 34, §5.6); on a narrow screen a sheet opened from the
         icons on the count row (John, 2026-11-10: P4; S5 redraws it). -->
    <div class="sx-layout">
      <div class="sx-side" class:wp-open={railWord}>
        <div class="sx-head">
        <!-- On a desktop: the count, large, with Save search beside it. On a
             narrow screen one row (§5.7): the count with "instances" under
             it, Save, the pager ‹ 1/28 ›, Filter, and View, each an icon over
             its 14px label; a red dot on View while it is not the default. -->
        <div class="result-bar" class:paged={pages.length > 1}>
          <p class="result-count" style="--n: {countText.length}; --d: {String(totalInstances).length}" title={countText}>{#if totalInstances === 0}{countText}{:else}<span class="rc-n">{totalInstances}</span>{' '}<span class="rc-w">{totalInstances === 1 ? 'instance' : 'instances'}</span>{#if pages.length > 1}<span class="rc-p">{` · page ${pageIdx + 1} of ${pages.length}`}</span>{/if}{/if}</p>
          {#if canSave}
            <!-- Not disabled once saved: that would drop the focus. -->
            <button type="button" class="sx-save" class:saved={savedNow} on:click={saveSearch}><svg class="sx-ico" width="22" height="22" viewBox="0 0 24 24" fill={savedNow ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h11v17L12 16l-5.5 4.5z"/></svg><span class="sx-lab">{#if savedNow}Saved<span class="sx-save-w">{' '}✓</span>{:else if saveFailed}{FULL}{:else}Save<span class="sx-save-w">{' '}search</span>{/if}</span></button>
          {/if}
          {#if pages.length > 1}
            <button type="button" class="sx-icon sx-arrow" aria-label="Previous page" on:click={() => goPage(pageIdx - 1)} disabled={pageIdx === 0 || pageLoading}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>
            </button>
            <span class="sx-pg" aria-hidden="true">{pageIdx + 1}/{pages.length}</span>
            <button type="button" class="sx-icon sx-arrow" aria-label="Next page" on:click={() => goPage(pageIdx + 1)} disabled={pageIdx >= pages.length - 1 || pageLoading}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>
            </button>
          {/if}
          <button type="button" class="sx-icon sx-filter" bind:this={filterBtn} aria-haspopup="dialog" aria-expanded={sheetOpen && sheetKind === 'filter'}
            aria-label={`Filter${filtersOn ? `, ${filtersOn} chosen` : ''}`} on:click={() => openSheet('filter')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 5h17l-6.5 8v5.5l-4-2V13z"/></svg>
            <span class="sx-lab">Filter</span>
            {#if filtersOn}<span class="sx-badge" aria-hidden="true">{filtersOn}</span>{/if}
          </button>
          {#if totalInstances > 0}
            <button type="button" class="sx-icon sx-view" bind:this={sortBtn} aria-haspopup="dialog" aria-expanded={sheetOpen && sheetKind === 'sort'}
              aria-label={`View${viewLine.length ? `, ${viewLine.join(', ')}` : ''}`} on:click={() => openSheet('sort')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 4.5v15m0 0-3-3m3 3 3-3M16.5 19.5v-15m0 0-3 3m3-3 3 3"/></svg>
              <span class="sx-lab">View</span>
              {#if viewLine.length}<span class="sx-dot" aria-hidden="true"></span>{/if}
            </button>
          {/if}
        </div>
        <!-- Under the count on a desktop (d21, d23, r34-05); on a narrow
             screen these are in the sheet. -->
        {#if !sheetOpen}
          <div class="sx-head-more">
            {#if excludedForms.size && allFormsTotal !== totalInstances}
              <p class="sx-of">of {allFormsTotal} · <button type="button" class="sx-link" on:click={restoreForms}>restore all forms</button></p>
            {/if}
            {#if savedNow}<a class="sx-link" href={`${BASE_URL}/saved`}>In Saved searches</a>{/if}
            {#if totalInstances > 0}
              <button type="button" class="sx-link export-btn" on:click={exportCsv} disabled={csvBusy}>
                {csvBusy ? 'Preparing CSV…' : 'Export results as CSV'}
              </button>
            {/if}
            {#if canWiden && !variantsShown}
              <button type="button" class="sx-link sx-variants" on:click={() => findVariants()} disabled={variantBusy}
                title="ἦν δ’ ἐγώ also stands as ἦ δ’ ὅς — one formula, different endings">
                {variantBusy ? 'Looking…' : 'Find this phrase in any inflection'}
              </button>
            {/if}
          </div>
        {/if}
        </div>
        {#if canSave}<span class="sr-only sx-save-live" aria-live="polite">{saveNote}</span>{/if}
        {#if sheetOpen}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="sx-scrim" on:click={closeSheet}></div>
        {/if}
        <!-- The word clicked, in the rail's place while it is open (d24). -->
        {#if railWord && popup}
          <WordPopup rail work={popup.work} token={popup.token} onClose={closeWord} />
        {/if}
        <!-- On a narrow screen a sheet (S5a's): its title and Close over a
             2px rule ("‹ Filter" over them on a filter's own screen), and a
             foot band (p03, p04, q07, q08). -->
        <aside class="sx-panel" class:open={sheetOpen} class:sheet={sheetOpen} bind:this={sheetEl} aria-label={sheetLabel} tabindex="-1"
          data-screen={sheetOpen ? (sheetKind === 'sort' ? 'sort' : sheetScreen) : undefined}
          role={sheetOpen ? 'dialog' : undefined} aria-modal={sheetOpen ? 'true' : undefined}>
          {#if sheetOpen}
            <div class="sx-sheet-head sheet-head">
              {#if sheetKind === 'filter' && sheetScreen !== 'menu'}
                <button type="button" class="sx-back" bind:this={backBtn} on:click={backToMenu}>‹ Filter</button>
              {/if}
              <h2 class="sx-sheet-t">{sheetKind === 'sort' ? 'View' : SCREEN_LABELS[sheetScreen]}</h2>
              <button type="button" class="sx-close" on:click={closeSheet}>Close</button>
            </div>
          {/if}
          {#if sheetOpen && sheetKind === 'sort'}
            <!-- How the hits are shown (p04): Group by, Sort, Context, Per page,
                 no glosses; Export; Done. A list of citations has nothing to
                 group, order or widen. -->
            {#if pageSize !== 'c'}
              <fieldset class="sx-seg sx-seg-3">
                <legend class="k">Group by</legend>
                {#each VIEWS as v}
                  <label class="ck"><input type="radio" name="sx-m-view" value={v.id} checked={view === v.id} on:change={() => setView(v.id)} /><span>{v.label}</span></label>
                {/each}
              </fieldset>
              <fieldset class="sx-seg sx-seg-2">
                <legend class="k">Sort</legend>
                {#each SORTS as so}
                  <label class="ck"><input type="radio" name="sx-m-sort" value={so.id} checked={sort === so.id} on:change={() => setSort(so.id)} /><span>{so.short ?? so.label}</span></label>
                {/each}
              </fieldset>
              <fieldset class="sx-seg sx-seg-3">
                <legend class="k">Context</legend>
                {#each CONTEXTS as c}
                  <label class="ck"><input type="radio" name="sx-m-context" value={c.id} checked={context === c.id} on:change={() => setContext(c.id)} /><span>{c.label}</span></label>
                {/each}
              </fieldset>
            {/if}
            <fieldset class="sx-seg sx-seg-3">
              <legend class="k">Per page</legend>
              {#each PAGE_CHOICES as ps}
                <label class="ck" class:sx-seg-row={ps.rule}><input type="radio" name="sx-m-pagesize" value={ps.id} checked={pageSize === ps.id} on:change={() => setPageSize(ps.id)} /><span>{ps.label}</span></label>
              {/each}
            </fieldset>
            {#if totalInstances > 0}
              <div class="sx-tools">
                <button type="button" class="export-btn" on:click={exportCsv} disabled={csvBusy}>
                  {csvBusy ? 'Preparing CSV…' : 'Export results as CSV'}
                </button>
              </div>
            {/if}
            <div class="sx-foot sheet-foot">
              <button type="button" class="sheet-done" on:click={closeSheet}>Done</button>
            </div>
          {:else}
          <!-- What narrows the results, each undone by its ×. On
               the sheet, at the head of its menu, and only when there is
               something in it. -->
          <!-- On the sheet's menu only: on a desktop each filter is undone where
               it is set (round 34 has no summary in the rail). -->
          {#if sheetOpen && sheetScreen === 'menu' && chosen.length}
          <div class="sx-sum" role="group" aria-labelledby="sx-sum-k" tabindex="-1" bind:this={sumEl}>
            <span class="k" id="sx-sum-k">This search</span>
            {#if chosen.length}
              <ul>
                {#each chosen as c (c.key)}
                  <li>
                    <span>{c.label}</span>
                    <button type="button" class="x" aria-label={`Remove ${c.label}`} on:click={() => removeChosen(c)}>×</button>
                  </li>
                {/each}
              </ul>
              {#if chosen.length > 1}
                <button type="button" class="sx-clear" on:click={clearChosen}>Clear all</button>
              {/if}
            {/if}
          </div>
          {/if}
          <!-- The sheet's menu: a line per filter, with what it is set to. -->
          {#if sheetOpen && sheetScreen === 'menu'}
            <div class="sx-menu">
              {#if workChoice}
                <button type="button" class="sx-nav" bind:this={menuRows.works} on:click={() => openScreen('works')}>
                  <span>Works</span>{' '}<small>{workFilter ? getWork(workFilter)?.title ?? workFilter : `All ${workCounts.length}`}</small>{' '}<span class="gt">›</span>
                </button>
              {/if}
              {#if transChoice}
                <button type="button" class="sx-nav" bind:this={menuRows.trans} on:click={() => openScreen('trans')}>
                  <span>Translations</span>{' '}<small>{transFilter ? transCounts.find(t => t.id === transFilter)?.short ?? transFilter : `All ${transCounts.length}`}</small>{' '}<span class="gt">›</span>
                </button>
              {/if}
              {#if formChoice}
                <button type="button" class="sx-nav" bind:this={menuRows.forms} on:click={() => openScreen('forms')}>
                  <span>Forms</span>{' '}<small>{shownForms === formKeys.length ? `All ${formKeys.length}` : `${shownForms} of ${formKeys.length}`}</small>{' '}<span class="gt">›</span>
                </button>
              {/if}
              {#if grammarOffered}
                <button type="button" class="sx-nav" bind:this={menuRows.grammar} on:click={() => openScreen('grammar')}>
                  <span>Grammar</span>{' '}<small>{hasFacets(facets) ? Object.entries(facets).flatMap(([c, vs]) => vs.map(v => `${categoryLabel(c)} ${valueName(c, v)}`)).join(', ') : 'Any'}</small>{' '}<span class="gt">›</span>
                </button>
              {/if}
            </div>
          {/if}
          <!-- Where the hits fall, most first, each list whole in a box of its
               own that scrolls (§8 item 5). Choosing one narrows the results
               to it, drawn as an ink bar with its ×; choosing it again lifts
               the narrowing. -->
          {#if workChoice && (!sheetOpen || sheetScreen === 'works')}
            <div class="sx-row sx-works" role="group" aria-label="Show hits from one work">
              <span class="k">Works with hits <small>by count</small></span>
              <div class="sx-list">
                <!-- The sheet's lists are one choice of many, from all (q07). -->
                {#if sheetOpen}
                  <button type="button" class="i i-all" class:on={!workFilter} aria-pressed={!workFilter}
                    on:click={() => { if (workFilter) setWorkFilter(workFilter); }}><span class="i-t">All works</span></button>
                {/if}
                {#each workCounts as wc}
                  <button type="button" class="i" class:on={workFilter === wc.id} aria-pressed={workFilter === wc.id}
                    title={`Show only hits in the ${wc.title}${workFilter === wc.id ? ' (again for all)' : ''}`}
                    on:click={() => setWorkFilter(wc.id)}><span class="i-t">{wc.title}</span><small>{wc.n}</small>{#if workFilter === wc.id}<span class="i-x" aria-hidden="true">×</span>{/if}</button>
                {/each}
              </div>
            </div>
          {/if}
          {#if transChoice && (!sheetOpen || sheetScreen === 'trans')}
            <div class="sx-row sx-trans" role="group" aria-label="Show English hits from one translation">
              <span class="k">Translations <small>by count</small></span>
              <div class="sx-list">
                {#if sheetOpen}
                  <button type="button" class="i i-all" class:on={!transFilter} aria-pressed={!transFilter}
                    on:click={() => { if (transFilter) setTransFilter(transFilter); }}><span class="i-t">All translations</span></button>
                {/if}
                {#each transCounts as tc}
                  <button type="button" class="i" class:on={transFilter === tc.id} aria-pressed={transFilter === tc.id}
                    title={`Show only hits in ${tc.short}’s translation${transFilter === tc.id ? ' (again for all)' : ''}`}
                    on:click={() => setTransFilter(tc.id)}><span class="i-t">{tc.short}</span><small>{tc.n}</small>{#if transFilter === tc.id}<span class="i-x" aria-hidden="true">×</span>{/if}</button>
                {/each}
              </div>
              {#if secondScope}<span class="note">{secondScope}</span>{/if}
            </div>
          {/if}
          <!-- What the Greek result is made of. A tick box each; Apply drops the
               unticked forms from the hits and from every count above. -->
          {#if formChoice && (!sheetOpen || sheetScreen === 'forms')}
            <div class="sx-row sx-forms" role="group" aria-label="Greek forms found">
              <span class="k">Forms</span>
              <!-- Every form, in a box of its own height that scrolls; the
                   heading and the buttons stay in view. -->
              <div class="fx-list">
                {#each formPanel as group}
                  <span class="fx-group">
                    {#if group.headword}<span class="fx-head" lang="grc">{headLabel(group.headword, pickInfo)}</span>{/if}
                    {#each group.forms as f}
                      <label class="fx">
                        <input type="checkbox" checked={formTicks.has(f.form)} on:change={() => toggleFormTick(f.form)} />
                        <span lang="grc">{formSpellings.get(f.form) ?? betaToGreek(f.form)}</span> <small>{f.count}</small>
                      </label>
                    {/each}
                  </span>
                {/each}
              </div>
              <!-- At the foot of the forms screen on the sheet, where the button
                   applies the ticks and shows the hits they leave (q08). -->
              <div class="sx-foot fx-foot" class:sheet-foot={sheetOpen}>
                <button type="button" class="more" on:click={toggleAllForms}>
                  {formKeys.some(f => formTicks.has(f)) ? 'Deselect all' : 'Select all'}
                </button>
                {#if sheetOpen}
                  <button type="button" class="more fx-apply sheet-done" on:click={showForms}
                    disabled={!formKeys.some(f => formTicks.has(f))}>{instancesLabel(formsPreview)}</button>
                {:else}
                  <button type="button" class="more fx-apply" on:click={applyForms}
                    disabled={!formsDirty || !formKeys.some(f => formTicks.has(f))}>Apply</button>
                {/if}
              </div>
            </div>
          {/if}
          <!-- The readings present among the Greek hits, a chip each, applied
               as ticked. Shown in the grammar view, and wherever one is ticked. -->
          {#if grammarShown && (!sheetOpen || sheetScreen === 'grammar')}
            <div class="sx-row sx-facets" role="group" aria-label="Narrow by grammar">
              <span class="k">Grammar</span>
              {#each facetRows as fc}
                <span class="gx-group">
                  <span class="gx-head">{categoryLabel(fc.category)}</span>
                  <span class="gx-chips">
                    {#each fc.values as v}
                      <label class="gx-chip" class:on={facets[fc.category]?.includes(v.value) ?? false}>
                        <input type="checkbox" checked={facets[fc.category]?.includes(v.value) ?? false}
                          aria-label={`${categoryLabel(fc.category)} ${valueName(fc.category, v.value)}`}
                          on:change={() => toggleFacet(fc.category, v.value)} />
                        <span>{valueName(fc.category, v.value)}</span> <small>{v.count}</small>
                      </label>
                    {/each}
                  </span>
                </span>
              {/each}
            </div>
          {/if}
          <!-- The inflection search, on the sheet's menu; Export is in View. -->
          {#if canWiden && !variantsShown && sheetOpen && sheetScreen === 'menu'}
            <div class="sx-tools">
              <button type="button" class="export-btn" on:click={() => findVariants()} disabled={variantBusy}
                title="ἦν δ’ ἐγώ also stands as ἦ δ’ ὅς — one formula, different endings">
                {variantBusy ? 'Looking…' : 'Find this phrase in any inflection'}
              </button>
              <a class="guide-link result-guide" href={`${BASE_URL}/advanced#variants`} target="_blank" rel="noreferrer">What is this?</a>
            </div>
          {/if}
          {#if sheetOpen && sheetScreen !== 'forms'}
            <div class="sx-foot sheet-foot">
              {#if sheetScreen === 'grammar'}
                <button type="button" class="sx-clear" on:click={clearFacets} disabled={!hasFacets(facets)}>Clear</button>
              {/if}
              <button type="button" class="sx-show sheet-done" on:click={closeSheet}>{hitsLabel}</button>
            </div>
          {/if}
          {/if}
        </aside>
      </div>
      <div class="sx-main">
        <!-- How the hits are shown: the search form's menus (§5.2), each with
             its title and a gloss under every choice, then the pager. A list
             of citations has nothing to group, order or widen (John,
             2026-11-10: set B). -->
        {#if totalInstances > 0}
          <div class="sopt sx-display">
            {#if pageSize !== 'c'}
              {@render displayMenu('Group by', 'sx-view', VIEWS, view, (id) => setView(id as ResultView))}
              {@render displayMenu('Sort', 'sx-sort', SORTS, sort, (id) => setSort(id as ResultSort))}
              {@render displayMenu('Context', 'sx-context', CONTEXTS, context, (id) => setContext(id as ResultContext))}
            {/if}
            {@render displayMenu('Per page', 'sx-pagesize', PAGE_CHOICES, pageSize, (id) => setPageSize(id as PageSize))}
            {#if pages.length > 1}{@render pager('')}{/if}
          </div>
        {/if}
        {#if failedWorks.length || formsFailed || grammarFailed || unsearched.length || unresolved.length || approximateTurns.length || approximateChapters.length}
          <!-- Notices are rows: what kind, what happened, and what to do. -->
          <div class="sx-notes">
            {#if failedWorks.length}
              <div class="sx-note warn" role="alert">
                <span class="k">Warning</span>
                <span>{failedWorks.length === 1 ? 'The index for' : 'The indexes for'} {failedWorks.map((w) => getWork(w)?.title ?? w).join(', ')} did not load, so {failedWorks.length === 1 ? 'its' : 'their'} results are missing and the counts below may be short.</span>
                <button type="button" class="a" on:click={doSearch}>Try again</button>
              </div>
            {/if}
            {#if formsFailed}
              <div class="sx-note warn" role="alert">
                <span class="k">Warning</span>
                <span>{formsFailed === true
                  ? 'The list of forms did not load'
                  : `The forms in ${formsFailed.map((w) => getWork(w)?.title ?? w).join(', ')} did not load`}{!excludedForms.size ? '.'
                    : formsFailed === true ? ', so the forms set aside are still among the hits.'
                    : `, so forms set aside may still be among ${formsFailed.length === 1 ? 'its' : 'their'} hits.`}</span>
                <button type="button" class="a" on:click={retryForms}>Try again</button>
              </div>
            {/if}
            {#if grammarFailed}
              <div class="sx-note warn" role="alert">
                <span class="k">Warning</span>
                <span>{grammarFailed === true
                  ? 'The grammar of this result did not load'
                  : `The grammar in ${grammarFailed.map((w) => getWork(w)?.title ?? w).join(', ')} did not load`}{hasFacets(facets) ? ', so the hits are not narrowed.' : '.'}</span>
                <button type="button" class="a" on:click={retryGrammar}>Try again</button>
              </div>
            {/if}
            {#if unsearched.length}
              <div class="sx-note warn" role="alert">
                <span class="k">Warning</span>
                <span>English was not searched in {unsearched.join(', ')}: {unsearched.length === 1 ? 'its index' : 'their indexes'} did not load.</span>
                <button type="button" class="a" on:click={doSearch}>Try again</button>
              </div>
            {/if}
            {#if unresolved.length}
              <div class="sx-note warn" role="alert">
                <span class="k">Warning</span>
                <span>The list of dictionary forms did not load, so {unresolved.join(', ')} {unresolved.length === 1 ? 'was' : 'were'} searched only as typed, not in every form: results may be missing.</span>
                <button type="button" class="a" on:click={doSearch}>Try again</button>
              </div>
            {/if}
            {#if approximateChapters.length}
              <div class="sx-note">
                <span class="k">Note</span>
                <span>Chapter starts in {approximateChapters.map((w) => getWork(w)?.title ?? w).join(', ')} are recorded to the Bekker line, not the word, so a hit within the first line of a chapter may belong to the one before it.</span>
                <span></span>
              </div>
            {/if}
            {#if approximateTurns.length}
              <div class="sx-note">
                <span class="k">Note</span>
                <span>Where a speech begins in {approximateTurns.map((w) => getWork(w)?.title ?? w).join(', ')} is recorded to the line of Greek rather than the word, so a hit at the very start of a speech may belong to the one before it.</span>
                <span></span>
              </div>
            {/if}
          </div>
        {/if}
        {#if lemmaDeadEnd || speakerNote || variantNote || csvNote}
          <div class="sx-notes">
            {#if lemmaDeadEnd}
              <div class="sx-note">
                <span class="k">Note</span>
                <span>These words occur, but not together in one passage. Searching for the phrase in any inflection looks for them in the order you typed them, which is usually what an empty result means here.</span>
                <span></span>
              </div>
            {/if}
            {#if speakerNote}
              <div class="sx-note"><span class="k">Spoken by</span><span>{speakerNote}</span><span></span></div>
            {/if}
            {#if variantNote}
              <div class="sx-note"><span class="k">Note</span><span>{variantNote}</span><span></span></div>
            {/if}
            {#if csvNote}
              <div class="sx-note"><span class="k">Export</span><span>{csvNote}</span><span></span></div>
            {/if}
          </div>
        {/if}


        {#if pageError}
          <p class="search-note warn">
            {pageError}
            <button type="button" class="retry-btn" on:click={() => renderPage(pageIdx)} disabled={pageLoading}>Retry</button>
          </p>
        {/if}

        {#if pageSize === 'c'}
          <!-- Places only (d17): a work's name once, then its books. -->
          <div class="sx-results sx-cites">
            {#each citeList as cg, i (cg.key)}
              <section class="book-section cite-group" class:cite-more={i > 0 && citeList[i - 1].work === cg.work}>
                {#if i === 0 || citeList[i - 1].work !== cg.work}
                  <h2 class="book-header"><span class="work-name">{getWork(cg.work)?.title ?? cg.work}</span></h2>
                {/if}
                {#if (getWork(cg.work)?.bookLabels.length ?? 0) > 1}
                  <h3 class="sx-book">Book {getWork(cg.work)?.bookLabels[cg.book - 1] ?? cg.book}</h3>
                {/if}
                <p class="cite-list">
                  {#each cg.cites as c}
                    <a class="cite" href={c.href} target="_blank" rel="noopener" title="Open in reader (new tab)">{c.ref}{#if c.n > 1}<small>×{c.n}</small>{/if}</a>
                  {/each}
                </p>
              </section>
            {/each}
          </div>
        {/if}
        <div class="sx-results" class:by-work={narrowRefs} use:wordClicks>
        {#each viewSections as sec (sec.key)}
          {#each sec.groups as g (g.key)}
            {@const n = groupHits(g)}
            <section class="book-section" class:form-section={!sec.work}>
              <!-- The heading opens and shuts its hits (d25). -->
              <h2 class="book-header">
                <button type="button" class="group-head" class:work-head={!!sec.work} on:click={() => toggle(g.key)} aria-expanded={expanded.has(g.key)}>
                  {#if sec.work}
                    <span class="work-name">{g.label}</span>
                  {:else}
                    <span class="group-label" class:grc={g.greek} lang={g.greek ? 'grc' : undefined}>{g.label}</span>
                  {/if}
                  <span class="group-count">{n} {n === 1 ? 'instance' : 'instances'}</span>
                  <span class="caret" aria-hidden="true"></span>
                </button>
              </h2>
              <div class="chapter-group" class:shut={!expanded.has(g.key)}>
                {#if expanded.has(g.key)}
                  {#if view === 'grammar' && g.greek}
                    {@const readings = groupReadings(g, grammarAt)}
                    {#if readings.length}
                      <!-- The form's readings, folded under a count (d12). -->
                      <button type="button" class="sx-analyses" aria-expanded={readingsOpen.has(g.key)} on:click={() => toggleReadings(g.key)}>{readings.length} {readings.length === 1 ? 'analysis' : 'analyses'}<span class="sx-analyses-caret" aria-hidden="true">{readingsOpen.has(g.key) ? '▾' : '▸'}</span></button>
                      {#if readingsOpen.has(g.key)}<p class="group-readings">{readings.join(' · ')}</p>{/if}
                    {/if}
                  {/if}
                  {#each g.runs as run (run.key)}
                    {#if run.book}<h3 class="sx-book">Book {run.book.label}{' '}<span class="sx-book-n">{run.book.hits}</span></h3>{/if}
                    {#if run.chapter}
                      {@const name = chapterName(run.chapter)}
                      <h3 class="sx-chap"><span class="sx-chap-n">{name.label}</span>{#if name.title}{' '}<span class="sx-chap-t">{name.title}</span>{/if}</h3>
                    {/if}
                    <ul class="instance-list">
                      {#each run.instances as inst}
                        {@const oneOf = noteOf(inst, grammarAt, facets, more.has(inst))}
                        {@const opened = !inst.isSection && more.has(inst)}
                        {@const whole = inst.isSection || opened ? inst.whole : undefined}
                        {@const rows = whole ? whole.rows : inst.rows}
                        {@const pair = whole ? whole.pair : inst.pairEnglish}
                        {@const shown = shownRow(inst, rows, transOrder, shownTrans)}
                        <li class="instance" class:open={opened}>
                          <a class="inst-ref" href={inst.lang === 'eng' && shown ? shown.jumpUrl : inst.jumpUrl} target="_blank" rel="noopener" title="Open in reader (new tab)">{#each citeText(inst, view).split('–') as part, i}{#if i}–<wbr>{/if}{part}{/each}</a>
                          <div class="inst-body">
                            {#if opened}
                              <!-- The opened hit's head: where it is, and the way back (r34-06). -->
                              <div class="inst-ohead">
                                <span>{getWork(inst.work)?.title ?? inst.work}{bookOf(inst) ? ` · Book ${bookOf(inst)}` : ''}</span>
                                <button type="button" class="inst-less" on:click={() => toggleMore(inst)}>Show less</button>
                              </div>
                            {/if}
                            {#if whole || inst.lang === 'grk'}
                              <!-- The Greek: a Greek hit's passage, or the passage an English hit translates. -->
                              <span class="inst-snippet greek" lang="grc">
                                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                {@html whole ? whole.greek : inst.html}
                              </span>
                            {/if}
                            {#if shown}
                              <div class="inst-en inst-rows" class:inst-hit-en={!whole && inst.lang === 'eng'} lang="en">
                                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                <span class="inst-snippet">{@html shown.html}</span>
                                {@render names(inst, rows ?? [], shown.translation, transOrder)}
                              </div>
                            {:else if pair}
                              <div class="inst-en inst-pair" lang="en">
                                <span class="inst-pair-text">{pair.text}</span>
                                <p class="tr-names"><span class="tr-name">{pair.label}</span></p>
                              </div>
                            {/if}
                            {#if !whole && inst.lang === 'eng' && rows?.length && inst.pairGreek}
                              <div class="inst-pair greek" lang="grc">
                                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                {@html inst.pairGreek}
                              </div>
                            {/if}
                            {#if !inst.isSection && inst.whole}
                              <button type="button" class="inst-more" aria-expanded={opened}
                                on:click={() => toggleMore(inst)}>{opened ? 'Show less' : 'Show the whole section'}</button>
                            {/if}
                          </div>
                          {#if inst.speaker}
                            <span class="inst-speaker">{inst.speaker}</span>
                          {/if}
                          {#if oneOf}
                            <span class="inst-oneof" title="The morphological analysis allows more than one reading of this form">{oneOf}</span>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                  {/each}
                {/if}
              </div>
            </section>
          {/each}
        {/each}
        </div>

        {#if pages.length > 1}{@render pager('pager-bottom')}{/if}
      </div>
    </div>
  {/if}

  <!-- A narrow screen's word card: a sheet over the page (q09), in the page
       so its rules are the search page's. -->
  {#if popup && !wide}
    <WordPopup searchSheet work={popup.work} token={popup.token} anchor={popup.anchor} onClose={closeWord} />
  {/if}
</main>
<style>
  /* The search page in the chosen design and the "Search features" tab of the
     mockups: one underlined field with the Greek / English / Both switch, one
     line of menus on dotted underlines, then the Advanced sections, the Works
     and Spoken-by panels, and the results on ruled rows. House rules: square
     corners, rules not boxes, Gentium for everything read, Geologica Light only
     in capitals, colour from the tokens, the highlight #d9e2f4 for search marks. */
  /* The search form, its field, menus and hint, and the results (S4a),
     live in shared/styles/b-search.css. */
  /* A choice: a square ink box, a blue square inside when chosen. The square
     is painted on the box, not put inside it: a box with a child takes its
     baseline from the child, and in a row aligned by baseline (the speaker
     filter's) the chosen box then sits lower than the empty ones. */
  .ck, .mode-group label { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--text); cursor: pointer; }
  .ck input, .mode-group input {
    appearance: none;
    flex: none;
    width: 0.9375rem;
    height: 0.9375rem;
    margin: 0;
    border: 1.5px solid var(--text);
    border-radius: 0;
    background: none;
    cursor: pointer;
  }
  .ck input:checked, .mode-group input:checked {
    background: linear-gradient(var(--accent), var(--accent)) center / 0.5rem 0.5rem no-repeat;
  }
  .ck input:focus-visible, .mode-group input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .search-page code, .help-modal code { font-family: var(--font-english); font-style: italic; font-size: 1em; color: var(--text); }
  .guide-link { color: var(--text-mid); text-decoration: none; border-bottom: 1px solid var(--border); }
  .guide-link:hover { color: var(--accent); border-bottom-color: var(--accent); }

  .retry-btn {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
  }
  .retry-btn:hover { text-decoration: underline; text-underline-offset: 0.2em; }
  /* The proximity editor: shared/styles/b-search.css. */

  /* The works picker and the Spoken-by panel: shared/styles/b-search.css. */
  .speaker-turns { margin-left: 0.25rem; font-family: var(--font-caps); font-weight: 300; font-size: 0.75rem; color: var(--text-mid); font-variant-numeric: tabular-nums; }
  .mode-group { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem 1.5rem; margin: 0; padding: 0; border: none; }
  .mode-group legend {
    float: left;
    margin-right: 1rem;
    padding: 0;
    font-family: var(--font-caps);
    font-weight: 300;
    font-size: 0.6875rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-mid);
  }
  .speaker-note, .search-note { max-width: 42.5rem; margin: 0.75rem 0 0; font-size: 0.9375rem; line-height: 1.55; color: var(--text-mid); }
  .speaker-note.warn, .search-note.warn, .search-error { color: var(--accent-2); }
  .speaker-chips { margin-top: 0.75rem; }

  /* ── How to type Greek ─────────────────────────────────────────────────── */
  .help-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 4rem 1rem;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.45);
  }
  .help-modal {
    width: 100%;
    max-width: 36rem;
    padding: 1.5rem 1.75rem 1.75rem;
    border: 1px solid var(--text);
    background: var(--page-bg);
    box-shadow: 0 12px 40px -14px rgba(0, 0, 0, 0.45);
    color: var(--text);
  }
  .help-modal:focus { outline: none; }
  .help-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
  .help-head h2 { margin: 0; font-family: var(--font-english); font-size: 1.5rem; font-weight: 400; }
  .help-close { padding: 0; border: none; background: none; font-size: 1.5rem; line-height: 1; color: var(--text-mid); cursor: pointer; }
  .help-close:hover { color: var(--text); }
  .help-modal h3 { margin: 1.25rem 0 0.375rem; font-family: var(--font-english); font-size: 1.0625rem; font-weight: 400; }
  .help-intro, .help-sub, .help-foot { margin: 0.625rem 0 0; font-size: 0.9375rem; line-height: 1.55; color: var(--text-mid); }
  .help-note { font-size: 0.875rem; font-style: italic; color: var(--text-mid); }
  .help-modal strong { font-weight: 400; font-style: italic; }
  .beta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr)); gap: 0 1rem; margin: 0.75rem 0 0; border-top: 1px solid var(--text); }
  .beta-cell { display: grid; grid-template-columns: auto auto; justify-content: start; align-items: baseline; column-gap: 0.5rem; padding: 0.375rem 0; border-bottom: 1px solid var(--border); }
  .beta-key { font-style: italic; }
  .beta-grk, .mark-ex, .ex-grk { font-family: var(--font-greek); font-size: 1.125rem; }
  .beta-name {
    grid-column: 1 / -1;
    font-family: var(--font-caps);
    font-weight: 300;
    font-size: 0.625rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-mid);
  }
  .mark-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 0.25rem 0.75rem; margin: 0; padding: 0; list-style: none; font-size: 0.9375rem; }
  .mark-list .beta-name { display: inline; }
  .example-list { display: grid; gap: 0.25rem; margin: 0; padding: 0; list-style: none; font-size: 0.9375rem; }
  .ex-arrow { color: var(--text-mid); }

  /* ── Results ───────────────────────────────────────────────────────────── */
  .search-error { margin: 1.5rem 0 0; }
  /* Notices are ruled rows: what kind, what happened, what to do. */
  .sx-notes { display: grid; margin: 1.375rem 0 0; border-top: 1px solid var(--text); }
  .sx-note {
    display: grid;
    grid-template-columns: 6.875rem minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: baseline;
    padding: 0.625rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.9375rem;
  }
  .sx-note .k, .sx-note .a {
    font-family: var(--font-caps);
    font-weight: 300;
    font-size: 0.6875rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .sx-note .k { color: var(--text-mid); }
  .sx-note.warn .k { color: var(--accent-2); }
  .sx-note .a { padding: 0; border: none; background: none; color: var(--accent); cursor: pointer; }
  /* The rail and the narrow screen's sheet: shared/styles/b-search.css. */

  /* ── Phones ────────────────────────────────────────────────────────────── */
  @media (max-width: 680px) {
    .sx-note { grid-template-columns: minmax(0, 1fr); gap: 0.125rem; }
  }
</style>
