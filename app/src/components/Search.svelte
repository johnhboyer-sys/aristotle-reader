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
  let showHelp = false;

  const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];

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

  function onHelpKey(e: KeyboardEvent) {
    if (e.key === 'Escape') showHelp = false;
  }

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

<svelte:window on:keydown={onHelpKey} />

<div class="search-page">
  <form class="search-form" on:submit={doSearch} novalidate>

    <div class="query-row">
      <label class="query-label" for="grk-input">Greek</label>
      <input
        id="grk-input"
        class="query-input greek-input"
        type="search"
        placeholder="τέχνη or texnh, fronhsis*, …"
        bind:value={grkQuery}
        on:keydown={onEnter}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="none"
        spellcheck="false"
      />
      <button type="button" class="help-btn" on:click={() => (showHelp = true)} aria-haspopup="dialog" title="How to type Greek">
        ⌨ Type Greek
      </button>
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
      Type Greek in Greek letters or <button type="button" class="link-btn" on:click={() => (showHelp = true)}>Beta Code</button>
      (<code>texnh</code> = τέχνη). Use <code>*</code> for a wildcard: <code>fron*</code> matches φρόνησις, φρόνιμος, etc.
    </p>
  </form>

  {#if showHelp}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="help-backdrop" on:click={() => (showHelp = false)}>
      <div
        class="help-modal"
        role="dialog"
        aria-modal="true"
        aria-label="How to type Greek"
        on:click|stopPropagation
      >
        <div class="help-head">
          <h2>How to type Greek</h2>
          <button type="button" class="help-close" on:click={() => (showHelp = false)} aria-label="Close">×</button>
        </div>

        <p class="help-intro">
          The Greek box accepts Greek letters <em>or</em> <strong>Beta Code</strong> — a plain-ASCII
          transliteration. Each Greek letter is one Latin key:
        </p>

        <div class="beta-grid">
          {#each BETA_LETTERS as L}
            <div class="beta-cell">
              <span class="beta-key">{L.beta}</span>
              <span class="beta-grk">{L.greek}</span>
              <span class="beta-name">{L.name}</span>
            </div>
          {/each}
        </div>

        <h3>Accents &amp; breathings <span class="help-note">(optional — ignored when matching)</span></h3>
        <p class="help-sub">Type the mark right after the vowel:</p>
        <ul class="mark-list">
          {#each BETA_MARKS as M}
            <li><span class="beta-key">{M.beta}</span> <span class="mark-ex">{M.example}</span> <span class="beta-name">{M.name}</span></li>
          {/each}
        </ul>

        <h3>Examples</h3>
        <ul class="example-list">
          {#each BETA_EXAMPLES as E}
            <li><code>{E.beta}</code> <span class="ex-arrow">→</span> <span class="ex-grk">{E.greek}</span></li>
          {/each}
        </ul>

        <p class="help-foot">
          Long vowels are distinct: <code>h</code> = η (not <code>e</code> = ε), <code>w</code> = ω (not <code>o</code> = ο).
          Type them exactly. Accents and breathings may be included or left off.
        </p>
      </div>
    </div>
  {/if}

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
  .search-hint code,
  .help-modal code {
    background: var(--border);
    border-radius: 2px;
    padding: 0 0.25em;
    font-size: 0.85em;
  }

  .help-btn {
    flex-shrink: 0;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-weight: 600;
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.35rem 0.6rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .help-btn:hover { background: var(--col-bg); border-color: var(--accent-light); }

  .link-btn {
    font: inherit;
    background: none;
    border: none;
    padding: 0;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
  }

  /* --- Help modal --- */
  .help-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 2rem 1rem;
    overflow-y: auto;
    z-index: 50;
  }
  .help-modal {
    background: #fff;
    border-radius: 8px;
    max-width: 540px;
    width: 100%;
    padding: 1.25rem 1.5rem 1.75rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    font-family: var(--font-ui);
    color: var(--text);
  }
  .help-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .help-head h2 {
    font-size: 1.1rem;
    margin: 0;
    color: var(--text);
  }
  .help-close {
    background: none;
    border: none;
    font-size: 1.6rem;
    line-height: 1;
    color: var(--text-light);
    cursor: pointer;
    padding: 0 0.25rem;
  }
  .help-close:hover { color: var(--text); }

  .help-intro {
    font-size: 0.85rem;
    color: var(--text-mid);
    line-height: 1.5;
    margin: 0 0 0.9rem;
  }

  .beta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 0.4rem;
    margin-bottom: 1.1rem;
  }
  .beta-cell {
    display: grid;
    grid-template-columns: auto auto;
    align-items: baseline;
    column-gap: 0.4rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.3rem 0.45rem;
  }
  .beta-key {
    font-family: var(--font-english);
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--accent);
  }
  .beta-grk {
    font-family: var(--font-greek);
    font-size: 1.05rem;
    color: var(--text);
  }
  .beta-name {
    grid-column: 1 / -1;
    font-size: 0.68rem;
    color: var(--text-light);
    letter-spacing: .02em;
  }

  .help-modal h3 {
    font-size: 0.9rem;
    margin: 1rem 0 0.35rem;
    color: var(--text);
  }
  .help-note {
    font-weight: 400;
    font-size: 0.72rem;
    color: var(--text-light);
  }
  .help-sub {
    font-size: 0.78rem;
    color: var(--text-mid);
    margin: 0 0 0.4rem;
  }

  .mark-list {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.3rem 0.75rem;
    margin: 0;
    padding: 0;
  }
  .mark-list li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.8rem;
  }
  .mark-ex { font-family: var(--font-greek); color: var(--text); }

  .example-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .example-list li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.85rem;
  }
  .ex-arrow { color: var(--text-light); }
  .ex-grk { font-family: var(--font-greek); font-size: 1rem; }

  .help-foot {
    font-size: 0.78rem;
    color: var(--text-mid);
    line-height: 1.5;
    margin: 1rem 0 0;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
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
