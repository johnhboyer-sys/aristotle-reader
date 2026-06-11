<script lang="ts">
  import { search, type SearchMode, type LangOp, type SearchResult, greekFold } from '../lib/search';

  let grkQuery = '';
  let engQuery = '';
  let mode: SearchMode = 'all';
  let langOp: LangOp = 'and';
  let results: SearchResult[] = [];
  let loading = false;
  let searched = false;
  let error = '';

  const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];

  async function doSearch(e?: Event) {
    e?.preventDefault();
    if (!grkQuery.trim() && !engQuery.trim()) return;
    loading = true;
    error = '';
    searched = false;
    try {
      results = await search(grkQuery, engQuery, mode, langOp);
      searched = true;
    } catch (err) {
      error = String(err);
    } finally {
      loading = false;
    }
  }

  // Highlight fold-matched terms in a preview string.
  // Works on English (plain) and Greek (surface form).
  function highlightGreek(text: string, terms: string[]): string {
    if (!terms.length) return esc(text);
    // Match surface form by doing a fold-insensitive find
    // Simple approach: bold any token whose fold matches a query fold
    const queryFolds = new Set(
      terms.flatMap(t => {
        const base = t.replace('*', '');
        return [greekFold(base)];
      })
    );
    return text.split(/(\s+)/).map(word => {
      const fold = greekFold(word);
      return queryFolds.has(fold) ? `<mark>${esc(word)}</mark>` : esc(word);
    }).join('');
  }

  function highlightEnglish(text: string, terms: string[]): string {
    if (!terms.length) return esc(text);
    let out = esc(text);
    for (const t of terms) {
      const clean = t.replace(/[^a-z'*]/gi, '').replace('*', '');
      if (!clean) continue;
      const re = new RegExp(`\\b(${clean}\\w*)\\b`, 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    }
    return out;
  }

  function esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function bookLink(meta: SearchResult['meta']): string {
    return `/book/${meta.book}#col-${meta.column}`;
  }

  $: grkTerms = grkQuery.trim().split(/\s+/).filter(Boolean);
  $: engTerms = engQuery.trim().split(/\s+/).filter(Boolean);

  function onEnter(e: KeyboardEvent) {
    if (e.key === 'Enter') doSearch();
  }
</script>

<div class="search-page">
  <form class="search-form" on:submit={doSearch} novalidate>

    <div class="query-row">
      <label class="query-label" for="grk-input">Greek</label>
      <input
        id="grk-input"
        class="query-input greek-input"
        type="search"
        placeholder="τέχνη, φρόνησις*, …"
        bind:value={grkQuery}
        on:keydown={onEnter}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="none"
        spellcheck="false"
      />
    </div>

    <div class="query-row">
      <label class="query-label" for="eng-input">English</label>
      <input
        id="eng-input"
        class="query-input"
        type="search"
        placeholder="virtue, happiness, …"
        bind:value={engQuery}
        on:keydown={onEnter}
        autocomplete="off"
      />
    </div>

    <div class="controls-row">
      <fieldset class="mode-group">
        <legend>Mode</legend>
        {#each [{v:'all',l:'All words'},{v:'any',l:'Any word'},{v:'phrase',l:'Phrase'}] as opt}
          <label>
            <input type="radio" name="mode" value={opt.v} bind:group={mode} />
            {opt.l}
          </label>
        {/each}
      </fieldset>

      {#if grkQuery.trim() && engQuery.trim()}
        <fieldset class="op-group">
          <legend>Combine</legend>
          <label><input type="radio" name="op" value="and" bind:group={langOp} /> AND</label>
          <label><input type="radio" name="op" value="or"  bind:group={langOp} /> OR</label>
        </fieldset>
      {/if}

      <button type="submit" class="search-btn" disabled={loading}>
        {loading ? 'Searching…' : 'Search'}
      </button>
    </div>

    <p class="search-hint">
      Use <code>*</code> for a wildcard on Greek lemmata: <code>φρον*</code> matches all forms of φρόνησις, φρόνιμος, etc.
    </p>
  </form>

  {#if error}
    <p class="search-error">{error}</p>
  {:else if searched}
    <p class="result-count">
      {results.length === 0
        ? 'No passages found.'
        : `${results.length} passage${results.length === 1 ? '' : 's'} found`}
    </p>

    <ul class="result-list">
      {#each results as r}
        <li class="result-card">
          <a class="result-ref" href={bookLink(r.meta)}>
            <span class="result-col">{r.meta.column}</span>
            <span class="result-book">Book {ROMAN[r.meta.book - 1]}</span>
          </a>
          {#if r.grkMatch}
            <p class="result-greek">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html highlightGreek(r.meta.greek_head, grkTerms)}
            </p>
          {/if}
          {#if r.engMatch}
            <p class="result-english">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html highlightEnglish(r.meta.english_head, engTerms)}
            </p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search-page {
    max-width: 760px;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
  }

  .search-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: var(--col-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1.25rem 1.5rem 1rem;
    margin-bottom: 1.5rem;
  }

  .query-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .query-label {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: .04em;
    color: var(--text-mid);
    width: 3.5rem;
    flex-shrink: 0;
  }

  .query-input {
    flex: 1;
    font-family: var(--font-english);
    font-size: 1rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.4rem 0.6rem;
    background: #fff;
    color: var(--text);
    appearance: none;
    -webkit-appearance: none;
  }
  .query-input:focus {
    outline: 2px solid var(--accent-light);
    outline-offset: 1px;
  }
  .greek-input { font-family: var(--font-greek); }

  .controls-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
  }

  fieldset {
    border: none;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  legend {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: .04em;
    color: var(--text-mid);
    float: left;
    margin-right: 0.5rem;
    padding-top: 0.1rem;
  }

  fieldset label {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    color: var(--text);
  }

  .search-btn {
    margin-left: auto;
    font-family: var(--font-ui);
    font-size: 0.9rem;
    font-weight: 600;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0.45rem 1.25rem;
    cursor: pointer;
    letter-spacing: .02em;
  }
  .search-btn:hover:not(:disabled) { background: var(--accent-light); }
  .search-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .search-hint {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    color: var(--text-light);
    margin-top: -0.25rem;
  }
  .search-hint code {
    background: var(--border);
    border-radius: 2px;
    padding: 0 0.25em;
    font-size: 0.85em;
  }

  .search-error { color: #c00; font-family: var(--font-ui); font-size: 0.9rem; }

  .result-count {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--text-mid);
    margin-bottom: 0.75rem;
  }

  .result-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .result-card {
    background: var(--col-bg);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 0.75rem 1rem;
  }

  .result-ref {
    display: inline-flex;
    align-items: baseline;
    gap: 0.5rem;
    text-decoration: none;
    margin-bottom: 0.4rem;
  }
  .result-ref:hover .result-col { text-decoration: underline; }

  .result-col {
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--accent);
  }
  .result-book {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    color: var(--text-light);
  }

  .result-greek {
    font-family: var(--font-greek);
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--text);
    margin-bottom: 0.25rem;
  }
  .result-english {
    font-family: var(--font-english);
    font-size: 0.88rem;
    line-height: 1.55;
    color: var(--text-mid);
  }

  :global(mark) {
    background: #ffe082;
    border-radius: 2px;
    padding: 0 0.1em;
  }

  @media (max-width: 500px) {
    .search-form { padding: 1rem; }
    .query-row { flex-direction: column; align-items: stretch; }
    .query-label { width: auto; }
    .controls-row { gap: 0.5rem; }
    .search-btn { margin-left: 0; width: 100%; margin-top: 0.25rem; }
  }
</style>
