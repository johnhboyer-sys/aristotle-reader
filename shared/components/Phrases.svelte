<script lang="ts">
  import { onMount } from 'svelte';
  import {
    decodeOffsets,
    fetchNgramOccurrences,
    fetchNgramShard,
    type NgramRow,
    type NgramStream,
  } from '../lib/data';
  import { betaToGreek } from '../lib/betacode';
  import { offsetRef, type Offsets } from '../lib/search';
  import { WORKS, getWork, workPath } from '../lib/works';

  type SortMode = 'score' | 'frequency' | 'length' | 'alphabetical';

  interface PhraseItem {
    key: string;
    row: NgramRow;
  }

  interface Citation {
    column: string;
    line: number;
    book: number;
    href: string;
  }

  interface WorkCitations {
    id: string;
    title: string;
    total: number;
    citations: Citation[];
    error?: string;
  }

  interface PhraseDetails {
    loading: boolean;
    error: string;
    works: WorkCitations[];
  }

  const DEFAULT_LETTER = 'k';
  const PAGE_SIZE = 50;
  const CITATION_CAP = 40;
  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');
  const WORK_ORDER = new Map(WORKS.map((work, index) => [work.id, index]));
  const countFormat = new Intl.NumberFormat('en-US');
  const scoreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

  let mounted = false;
  let stream: NgramStream = 'form';
  let prefix = '';
  let lengths: number[] = [2, 3, 4, 5];
  let minCount = 2;
  let selectedWorks: string[] = [];
  let sort: SortMode = 'score';
  let page = 0;

  let shard: Record<string, NgramRow> = {};
  let shardLoading = false;
  let shardError = '';
  let requestedShardKey = '';
  let loadedShardKey = '';
  let shardRequest = 0;

  let requestedWorkSignature = '';
  let loadedWorkSignature = '';
  let matchingWorkPhrases: Set<string> | null = null;
  let workFilterLoading = false;
  let workFilterError = '';
  let workRequest = 0;

  let expanded = new Set<string>();
  let details: Record<string, PhraseDetails> = {};

  const offsetsCache = new Map<string, Promise<Offsets>>();

  $: normalizedPrefix = prefix.trim().toLowerCase().replace(/\s+/g, ' ');
  $: letter = /^[a-z]/.test(normalizedPrefix)
    ? normalizedPrefix[0]
    : normalizedPrefix
      ? '_'
      : DEFAULT_LETTER;
  $: activeShardKey = `${stream}/${letter}`;
  $: minimum = Number.isFinite(minCount) ? Math.max(2, Math.floor(minCount)) : 2;
  $: selectedLengthKey = [...lengths].sort((a, b) => a - b).join(',');
  $: selectedWorkKey = [...selectedWorks].sort().join(',');
  $: workSignature = selectedWorks.length
    ? `${activeShardKey}|${selectedLengthKey}|${selectedWorkKey}`
    : '';

  $: if (mounted && activeShardKey !== requestedShardKey) {
    void loadShard(stream, letter);
  }

  $: if (mounted && workSignature !== requestedWorkSignature) {
    void loadWorkFilter(
      workSignature,
      stream,
      letter,
      [...lengths],
      [...selectedWorks],
    );
  }

  $: localRows = loadedShardKey === activeShardKey
    ? Object.entries(shard)
        .filter(([key, row]) =>
          (!normalizedPrefix || key.startsWith(normalizedPrefix)) &&
          lengths.includes(row[0]) &&
          row[1] >= minimum)
        .map(([key, row]) => ({ key, row }))
    : [];

  $: filteredRows = selectedWorks.length === 0
    ? localRows
    : loadedWorkSignature === workSignature && matchingWorkPhrases
      ? localRows.filter((item) => matchingWorkPhrases?.has(item.key))
      : [];

  $: sortedRows = [...filteredRows].sort((a, b) => comparePhrases(a, b, sort));
  $: pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  $: if (page >= pageCount) page = pageCount - 1;
  $: pageRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  $: shownFrom = sortedRows.length ? page * PAGE_SIZE + 1 : 0;
  $: shownTo = Math.min((page + 1) * PAGE_SIZE, sortedRows.length);

  onMount(() => {
    mounted = true;
  });

  function comparePhrases(a: PhraseItem, b: PhraseItem, mode: SortMode): number {
    if (mode === 'frequency') {
      return b.row[1] - a.row[1] || b.row[2] - a.row[2] || a.key.localeCompare(b.key);
    }
    if (mode === 'length') {
      return a.row[0] - b.row[0] || b.row[2] - a.row[2] || a.key.localeCompare(b.key);
    }
    if (mode === 'alphabetical') return a.key.localeCompare(b.key);
    return b.row[2] - a.row[2] || b.row[1] - a.row[1] || a.key.localeCompare(b.key);
  }

  async function loadShard(nextStream: NgramStream, nextLetter: string) {
    const key = `${nextStream}/${nextLetter}`;
    const request = ++shardRequest;
    requestedShardKey = key;
    shardLoading = true;
    shardError = '';
    page = 0;
    expanded = new Set();
    try {
      const next = await fetchNgramShard(nextStream, nextLetter);
      if (request !== shardRequest) return;
      shard = next;
      loadedShardKey = key;
    } catch {
      if (request !== shardRequest) return;
      shard = {};
      loadedShardKey = '';
      shardError = `The ${nextLetter.toUpperCase()} phrase shard could not be loaded.`;
    } finally {
      if (request === shardRequest) shardLoading = false;
    }
  }

  async function loadWorkFilter(
    signature: string,
    nextStream: NgramStream,
    nextLetter: string,
    nextLengths: number[],
    works: string[],
  ) {
    const request = ++workRequest;
    requestedWorkSignature = signature;
    loadedWorkSignature = '';
    matchingWorkPhrases = null;
    workFilterError = '';

    if (!signature) {
      workFilterLoading = false;
      return;
    }

    workFilterLoading = true;
    try {
      const occurrences = await Promise.all(
        [...nextLengths]
          .sort((a, b) => a - b)
          .map((n) => fetchNgramOccurrences(nextStream, nextLetter, n)),
      );
      if (request !== workRequest) return;
      const matches = new Set<string>();
      for (const occurrenceShard of occurrences) {
        for (const [phrase, byWork] of Object.entries(occurrenceShard)) {
          if (works.some((work) => work in byWork)) matches.add(phrase);
        }
      }
      matchingWorkPhrases = matches;
      loadedWorkSignature = signature;
      page = 0;
    } catch {
      if (request !== workRequest) return;
      workFilterError = 'The extra occurrence data needed for this work filter could not be loaded.';
    } finally {
      if (request === workRequest) workFilterLoading = false;
    }
  }

  function retryShard() {
    requestedShardKey = '';
  }

  function retryWorkFilter() {
    requestedWorkSignature = '';
  }

  function clampMinimum() {
    minCount = minimum;
    page = 0;
  }

  function clearWorks() {
    selectedWorks = [];
    page = 0;
  }

  function phraseId(item: PhraseItem): string {
    return `${stream}-${letter}-${item.row[0]}-${item.key.replace(/[^a-z0-9_-]+/g, '-')}`;
  }

  function togglePhrase(item: PhraseItem) {
    const id = phraseId(item);
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!details[id]) void loadPhraseDetails(id, item);
    }
    expanded = next;
  }

  function fetchWorkOffsets(work: string): Promise<Offsets> {
    const cached = offsetsCache.get(work);
    if (cached) return cached;
    const promise = fetch(`${BASE_URL}/data/${work}/search/offsets.json`).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<Offsets>;
    });
    promise.catch(() => {
      if (offsetsCache.get(work) === promise) offsetsCache.delete(work);
    });
    offsetsCache.set(work, promise);
    return promise;
  }

  // Bound the offsets burst: a common phrase can span most of the corpus.
  async function pool<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>) {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await fn(items[index], index);
      }
    });
    await Promise.all(workers);
  }

  async function loadPhraseDetails(id: string, item: PhraseItem) {
    details = { ...details, [id]: { loading: true, error: '', works: [] } };
    try {
      const occurrenceShard = await fetchNgramOccurrences(stream, letter, item.row[0]);
      const byWork = occurrenceShard[item.key];
      if (!byWork) throw new Error('Phrase missing from its occurrence shard');

      const entries = Object.entries(byWork).sort(
        ([a], [b]) => (WORK_ORDER.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (WORK_ORDER.get(b) ?? Number.MAX_SAFE_INTEGER),
      );
      const groups: WorkCitations[] = entries.map(([work, deltas]) => ({
        id: work,
        title: getWork(work)?.title ?? work,
        total: deltas.length,
        citations: [],
      }));

      await pool(entries, 6, async ([work, deltas], index) => {
        try {
          const offsets = await fetchWorkOffsets(work);
          const citations = decodeOffsets(deltas)
            .map((global) => offsetRef(offsets, global))
            .filter((ref): ref is NonNullable<typeof ref> => ref !== null)
            .slice(0, CITATION_CAP)
            .map((ref) => ({
              column: ref.column,
              line: ref.line,
              book: ref.book,
              href: `${BASE_URL}${workPath(work, ref.book)}?loc=${ref.column}:${ref.line}`,
            }));
          groups[index] = { ...groups[index], citations };
        } catch {
          groups[index] = {
            ...groups[index],
            error: 'Citations for this work could not be resolved.',
          };
        }
      });

      details = { ...details, [id]: { loading: false, error: '', works: groups } };
    } catch {
      details = {
        ...details,
        [id]: {
          loading: false,
          error: 'Occurrences for this phrase could not be loaded.',
          works: [],
        },
      };
    }
  }
</script>

<main class="phrases-page">
  <header class="page-intro">
    <p class="eyebrow">Corpus phrase index</p>
    <h1>Phrases</h1>
    <p>
      Browse every recurrent two- to five-word phrase in the corpus: 173,617
      surface-form phrases and 390,238 dictionary-form phrases, each occurring
      at least twice.
    </p>
  </header>

  <section class="phrase-panel" aria-labelledby="phrase-filters">
    <h2 id="phrase-filters">Filter the index</h2>

    <fieldset class="stream-control">
      <legend>Stream</legend>
      <label>
        <input
          type="radio"
          name="phrase-stream"
          value="form"
          bind:group={stream}
          on:change={() => page = 0}
        />
        Surface form
      </label>
      <label>
        <input
          type="radio"
          name="phrase-stream"
          value="lemma"
          bind:group={stream}
          on:change={() => page = 0}
        />
        Dictionary form (lemma)
      </label>
    </fieldset>

    <label class="field prefix-field" for="phrase-prefix">
      <span>Phrase starts with</span>
      <input
        id="phrase-prefix"
        type="search"
        placeholder="ws epi to polu"
        bind:value={prefix}
        on:input={() => page = 0}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="none"
        spellcheck="false"
      />
      <small>
        Type a lowercase fold key. {normalizedPrefix
          ? `The ${letter.toUpperCase()} shard is loaded and prefix-filtered.`
          : `The whole ${DEFAULT_LETTER.toUpperCase()} shard is loaded by default.`}
      </small>
    </label>

    <div class="control-grid">
      <fieldset class="length-control">
        <legend>Length</legend>
        {#each [2, 3, 4, 5] as n}
          <label>
            <input type="checkbox" value={n} bind:group={lengths} on:change={() => page = 0} />
            {n}
          </label>
        {/each}
      </fieldset>

      <label class="field compact-field" for="phrase-minimum">
        <span>Minimum count</span>
        <input
          id="phrase-minimum"
          type="number"
          min="2"
          step="1"
          bind:value={minCount}
          on:input={() => page = 0}
          on:change={clampMinimum}
        />
      </label>

      <label class="field compact-field" for="phrase-sort">
        <span>Sort</span>
        <select id="phrase-sort" bind:value={sort} on:change={() => page = 0}>
          <option value="score">Distinctiveness</option>
          <option value="frequency">Frequency</option>
          <option value="length">Length</option>
          <option value="alphabetical">Alphabetical</option>
        </select>
      </label>
    </div>

    <p class="score-note">
      Distinctiveness measures how much more often the phrase occurs than its
      words appearing independently would predict. It only orders the list; it
      never removes anything.
    </p>

    <div class="work-field">
      <label for="phrase-works">Work</label>
      <select
        id="phrase-works"
        multiple
        size="7"
        bind:value={selectedWorks}
        on:change={() => page = 0}
        aria-describedby="work-filter-note"
      >
        {#each WORKS as work}
          <option value={work.id}>{work.title}</option>
        {/each}
      </select>
      <div class="work-meta">
        <p id="work-filter-note">
          No selection includes every work. Select one or more works to keep
          phrases found in any of them. This filter needs an extra occurrence
          fetch for each selected phrase length.
        </p>
        {#if selectedWorks.length}
          <button type="button" class="quiet-button" on:click={clearWorks}>Clear work filter</button>
        {/if}
      </div>
    </div>
  </section>

  <section class="results" aria-labelledby="phrase-results">
    <div class="results-head">
      <div>
        <h2 id="phrase-results">Recurrent phrases</h2>
        {#if !shardLoading && !workFilterLoading && !shardError && !workFilterError}
          <p aria-live="polite">
            Showing {countFormat.format(shownFrom)}–{countFormat.format(shownTo)}
            of {countFormat.format(sortedRows.length)} matching phrases.
          </p>
        {/if}
      </div>
      <span class="loaded-shard">{stream === 'form' ? 'Surface' : 'Lemma'} · {letter.toUpperCase()}</span>
    </div>

    {#if shardLoading}
      <p class="status" aria-live="polite">Loading the {letter.toUpperCase()} phrase shard…</p>
    {:else if shardError}
      <div class="status error" role="alert">
        {shardError}
        <button type="button" class="text-button" on:click={retryShard}>Retry</button>
      </div>
    {:else if workFilterLoading}
      <p class="status" aria-live="polite">Loading occurrence data for the work filter…</p>
    {:else if workFilterError}
      <div class="status error" role="alert">
        {workFilterError}
        <button type="button" class="text-button" on:click={retryWorkFilter}>Retry</button>
      </div>
    {:else if sortedRows.length === 0}
      <p class="status">
        No phrases match these filters. Try a shorter prefix, a lower count, or
        another work.
      </p>
    {:else}
      <div class="column-head" aria-hidden="true">
        <span>Phrase</span>
        <span>Words</span>
        <span>Count</span>
        <span>Works</span>
        <span>Score</span>
        <span></span>
      </div>

      <ul class="phrase-list">
        {#each pageRows as item (item.key)}
          {@const id = phraseId(item)}
          {@const isExpanded = expanded.has(id)}
          {@const itemDetails = details[id]}
          <li class:expanded={isExpanded}>
            <button
              id={`phrase-button-${id}`}
              type="button"
              class="phrase-row"
              aria-expanded={isExpanded}
              aria-controls={`phrase-details-${id}`}
              on:click={() => togglePhrase(item)}
            >
              <span class="phrase-name">
                <span class="phrase-greek" lang="grc">{betaToGreek(item.key)}</span>
                <span class="phrase-key">{item.key}</span>
              </span>
              <span class="metric" data-label="Words">{item.row[0]}</span>
              <span class="metric" data-label="Count">{countFormat.format(item.row[1])}</span>
              <span class="metric" data-label="Works">{item.row[3]}</span>
              <span class="metric score" data-label="Score">{scoreFormat.format(item.row[2])}</span>
              <span class="caret" aria-hidden="true">›</span>
            </button>

            {#if isExpanded}
              <div
                id={`phrase-details-${id}`}
                class="phrase-details"
                role="region"
                aria-labelledby={`phrase-button-${id}`}
              >
                {#if item.row[4]}
                  <p class="crossing-note">
                    {countFormat.format(item.row[4])}
                    {item.row[4] === 1 ? ' occurrence crosses' : ' occurrences cross'}
                    a chapter boundary.
                  </p>
                {/if}

                {#if itemDetails?.loading}
                  <p class="detail-status" aria-live="polite">Resolving citations from the corpus offsets…</p>
                {:else if itemDetails?.error}
                  <p class="detail-status error" role="alert">{itemDetails.error}</p>
                {:else if itemDetails}
                  {#each itemDetails.works as group}
                    <section class="work-citations" aria-labelledby={`phrase-${id}-${group.id}`}>
                      <div class="work-heading">
                        <h3 id={`phrase-${id}-${group.id}`}>{group.title}</h3>
                        <span>{countFormat.format(group.total)}</span>
                      </div>
                      {#if group.error}
                        <p class="detail-status error">{group.error}</p>
                      {:else}
                        <ul class="citation-list">
                          {#each group.citations as citation}
                            <li>
                              <a href={citation.href}>
                                {citation.column}{citation.line}
                              </a>
                            </li>
                          {/each}
                        </ul>
                        {#if group.citations.length < group.total}
                          <p class="cap-note">
                            Showing {countFormat.format(group.citations.length)}
                            of {countFormat.format(group.total)} occurrences.
                          </p>
                        {/if}
                      {/if}
                    </section>
                  {/each}
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>

      {#if pageCount > 1}
        <nav class="pager" aria-label="Phrase result pages">
          <button
            type="button"
            on:click={() => page -= 1}
            disabled={page === 0}
            aria-label="Previous phrase page"
          >‹ Previous</button>
          <span>Page {page + 1} of {pageCount}</span>
          <button
            type="button"
            on:click={() => page += 1}
            disabled={page >= pageCount - 1}
            aria-label="Next phrase page"
          >Next ›</button>
        </nav>
      {/if}
    {/if}
  </section>
</main>

<style>
  .phrases-page {
    max-width: 820px;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
    color: var(--text);
  }

  .page-intro {
    margin: 0 0 1.25rem;
  }

  .page-intro .eyebrow {
    margin: 0 0 0.25rem;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .page-intro h1 {
    margin: 0;
    font-family: var(--font-english);
    font-size: 2rem;
    font-weight: 600;
    line-height: 1.15;
  }

  .page-intro > p:last-child {
    max-width: 68ch;
    margin: 0.45rem 0 0;
    font-family: var(--font-english);
    font-size: 1rem;
    line-height: 1.55;
    color: var(--text-mid);
  }

  .phrase-panel {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding: 1.15rem 1.35rem 1.25rem;
    background: var(--col-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .phrase-panel h2,
  .results h2 {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend,
  .field > span,
  .work-field > label {
    font-family: var(--font-ui);
    font-size: 0.76rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--text-mid);
  }

  .stream-control,
  .length-control {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem 1rem;
  }

  .stream-control legend,
  .length-control legend {
    float: left;
    margin-right: 0.4rem;
  }

  .stream-control label,
  .length-control label {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    color: var(--text);
    cursor: pointer;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  input[type='search'],
  input[type='number'],
  select {
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--input-bg);
    color: var(--text);
  }

  input[type='search'] {
    width: 100%;
    padding: 0.48rem 0.65rem;
    font-family: var(--font-ui);
    font-size: 0.95rem;
  }

  input[type='number'],
  select {
    padding: 0.36rem 0.45rem;
    font-family: var(--font-ui);
    font-size: 0.84rem;
  }

  input:focus-visible,
  select:focus-visible,
  button:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--accent-light);
    outline-offset: 2px;
  }

  .prefix-field small {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    line-height: 1.4;
    color: var(--text-mid);
  }

  .control-grid {
    display: grid;
    grid-template-columns: minmax(13rem, 1fr) auto auto;
    align-items: end;
    gap: 0.85rem 1rem;
  }

  .compact-field input {
    width: 7rem;
  }

  .score-note,
  .work-meta p {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 0.76rem;
    line-height: 1.45;
    color: var(--text-mid);
  }

  .score-note {
    padding: 0.65rem 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  .work-field {
    display: grid;
    grid-template-columns: 4rem minmax(13rem, 17rem) 1fr;
    align-items: start;
    gap: 0.45rem 0.75rem;
  }

  .work-field > label {
    padding-top: 0.35rem;
  }

  .work-field select {
    width: 100%;
    padding: 0.2rem;
  }

  .work-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .quiet-button,
  .text-button,
  .pager button {
    font-family: var(--font-ui);
    color: var(--accent);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
  }

  .quiet-button {
    padding: 0.25rem 0.55rem;
    font-size: 0.74rem;
    font-weight: 600;
  }

  .results {
    margin-top: 1.5rem;
  }

  .results-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.65rem;
  }

  .results-head p {
    margin: 0.25rem 0 0;
    font-family: var(--font-ui);
    font-size: 0.76rem;
    color: var(--text-mid);
  }

  .loaded-shard {
    flex-shrink: 0;
    font-family: var(--font-ui);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-mid);
  }

  .status {
    margin: 0;
    padding: 1rem;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--text-mid);
    background: var(--col-bg);
    border: 1px solid var(--border);
    border-radius: 5px;
  }

  .error {
    color: var(--text);
  }

  .text-button {
    margin-left: 0.5rem;
    padding: 0.15rem 0.45rem;
    font-size: 0.78rem;
  }

  .column-head,
  .phrase-row {
    display: grid;
    grid-template-columns: minmax(15rem, 1fr) 3.2rem 4.6rem 4rem 5rem 1rem;
    align-items: center;
    gap: 0.45rem;
  }

  .column-head {
    padding: 0 0.7rem 0.3rem;
    font-family: var(--font-ui);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-align: right;
    text-transform: uppercase;
    color: var(--text-mid);
  }

  .column-head span:first-child {
    text-align: left;
  }

  .phrase-list {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .phrase-list > li {
    background: var(--input-bg);
    border-bottom: 1px solid var(--border);
  }

  .phrase-list > li:last-child {
    border-bottom: 0;
  }

  .phrase-list > li.expanded {
    background: var(--col-bg);
  }

  .phrase-row {
    width: 100%;
    padding: 0.62rem 0.7rem;
    font: inherit;
    text-align: left;
    color: var(--text);
    background: transparent;
    border: 0;
    cursor: pointer;
  }

  .phrase-row:hover {
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }

  .phrase-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.08rem;
  }

  .phrase-greek {
    overflow: hidden;
    font-family: var(--font-greek);
    font-size: 1.12rem;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .phrase-key {
    overflow: hidden;
    font-family: var(--font-ui);
    font-size: 0.69rem;
    color: var(--text-mid);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .metric {
    font-family: var(--font-ui);
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: var(--text-mid);
  }

  .metric.score {
    color: var(--accent);
  }

  .caret {
    justify-self: end;
    font-family: var(--font-ui);
    color: var(--accent);
    transition: transform 0.12s ease;
  }

  .expanded .caret {
    transform: rotate(90deg);
  }

  .phrase-details {
    padding: 0.8rem 1rem 1rem;
    border-top: 1px solid var(--border);
  }

  .crossing-note,
  .detail-status,
  .cap-note {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 0.74rem;
    line-height: 1.45;
    color: var(--text-mid);
  }

  .crossing-note {
    margin-bottom: 0.75rem;
    color: var(--text);
  }

  .work-citations + .work-citations {
    margin-top: 0.85rem;
  }

  .work-heading {
    display: flex;
    align-items: baseline;
    gap: 0.7rem;
    margin-bottom: 0.35rem;
    padding-bottom: 0.2rem;
    border-bottom: 1px solid var(--border);
  }

  .work-heading h3 {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .work-heading span {
    font-family: var(--font-ui);
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-mid);
  }

  .citation-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.32rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .citation-list a {
    display: inline-block;
    padding: 0.14rem 0.42rem;
    font-family: var(--font-ui);
    font-size: 0.74rem;
    font-variant-numeric: tabular-nums;
    text-decoration: none;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .citation-list a:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  .cap-note {
    margin-top: 0.35rem;
  }

  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.8rem;
    margin-top: 1rem;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-mid);
  }

  .pager button {
    padding: 0.32rem 0.7rem;
    font-size: 0.78rem;
  }

  .pager button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .caret {
      transition: none;
    }
  }

  @media (max-width: 650px) {
    .phrase-panel {
      padding: 1rem;
    }

    .control-grid,
    .work-field {
      grid-template-columns: 1fr;
      align-items: start;
    }

    .work-field > label {
      padding: 0;
    }

    .work-field select {
      max-width: none;
    }

    .column-head {
      display: none;
    }

    .phrase-row {
      grid-template-columns: minmax(0, 1fr) repeat(4, auto) 0.75rem;
      gap: 0.35rem 0.6rem;
    }

    .metric {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      font-size: 0.7rem;
    }

    .metric::before {
      content: attr(data-label);
      font-size: 0.54rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-mid);
    }
  }

  @media (max-width: 470px) {
    .phrase-row {
      grid-template-columns: minmax(0, 1fr) repeat(2, auto) 0.75rem;
    }

    .metric[data-label='Words'],
    .metric[data-label='Works'] {
      display: none;
    }

    .phrase-details {
      padding-inline: 0.7rem;
    }
  }
</style>
