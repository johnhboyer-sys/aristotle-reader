<script lang="ts">
  // The Lexicon index — desktop port of the site's /lemma directory page.
  // Same data (the lemmata.json popup manifest), same fold-based filter that
  // accepts polytonic Greek or Beta Code, prefix-matched like a dictionary.
  import { fetchLemmata, type LemmaRef } from '@shared/lib/data';
  import { greekFold } from '@shared/lib/search';

  export let onOpenEntry: (slug: string) => void;

  let entries: (LemmaRef & { fold: string })[] = [];
  let loading = true;
  let error = '';
  let filter = '';

  fetchLemmata()
    .then(manifest => {
      entries = Object.values(manifest)
        .map(e => ({ ...e, fold: greekFold(e.head) }))
        .sort((a, b) => a.slug.localeCompare(b.slug));
      if (entries.length === 0) error = 'No lexicon data in this corpus.';
    })
    .catch(e => { error = String(e); })
    .finally(() => { loading = false; });

  $: q = greekFold(filter.trim());
  $: shown = q ? entries.filter(e => e.fold.startsWith(q)) : entries;
</script>

<div class="lxi">
  <h1 class="lxi-h1">Lexicon of Aristotle's Greek</h1>
  {#if loading}
    <p class="lxi-note">Loading…</p>
  {:else if error}
    <p class="lxi-note">{error}</p>
  {:else}
    <p class="lxi-lede">
      {entries.length.toLocaleString()} key terms — each with its LSJ definition, corpus-wide
      frequency, and every occurrence linked into the parallel text.
    </p>
    <div class="lxi-filter">
      <!-- svelte-ignore a11y_autofocus — the filter is this view's whole point -->
      <input
        type="search"
        bind:value={filter}
        placeholder="Filter — type Greek (οὐσ) or Beta Code (ous)…"
        aria-label="Filter the lexicon by Greek or Beta Code"
        autocomplete="off" autocapitalize="off" spellcheck="false"
        autofocus
      />
      <span class="lxi-count">{q ? `${shown.length} of ${entries.length}` : ''}</span>
    </div>
    {#if shown.length === 0}
      <p class="lxi-note">No entries match. Try the dictionary form (e.g. <span class="gk">οὐσία</span>, not an inflected form).</p>
    {:else}
      <ul class="lxi-grid">
        {#each shown as e (e.slug)}
          <li>
            <button on:click={() => onOpenEntry(e.slug)}>
              <span class="gk">{e.head}</span>
              <span class="n">{e.count.toLocaleString()}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .lxi { max-width: 900px; margin: 0 auto; padding: 1.5rem 1rem 5rem; font-family: var(--font-english); color: var(--text); }
  .lxi-h1 { font-size: 1.7rem; font-weight: 600; margin: 0 0 0.4rem; }
  .lxi-lede { color: var(--text-mid); line-height: 1.6; margin: 0 0 1.2rem; max-width: 60ch; }
  .lxi-note { color: var(--text-mid); font-size: 0.95rem; margin: 1rem 0; }
  .lxi-filter { display: flex; align-items: center; gap: 0.7rem; margin: 0 0 1.4rem; position: sticky; top: 0; z-index: 5; background: var(--col-bg); padding: 0.5rem 0; }
  .lxi-filter input {
    flex: 1 1 auto; min-width: 0; font-family: var(--font-ui); font-size: 1rem;
    padding: 0.55rem 0.8rem; color: var(--text); background: var(--page-bg);
    border: 1px solid var(--border); border-radius: 8px;
  }
  .lxi-filter input:focus { outline: none; border-color: var(--accent); }
  .lxi-count { font-family: var(--font-ui); font-variant-numeric: tabular-nums; font-size: 0.82rem; color: var(--text-mid); white-space: nowrap; }
  .lxi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr)); gap: 0.4rem; list-style: none; padding: 0; margin: 0; }
  .lxi-grid button {
    display: flex; justify-content: space-between; gap: 0.6rem; align-items: baseline;
    width: 100%; text-align: left; cursor: pointer;
    color: var(--text); background: none;
    border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.7rem;
    font: inherit;
  }
  .lxi-grid button:hover { border-color: var(--accent); }
  .gk { font-family: var(--font-greek); font-size: 1.05rem; }
  .n { font-family: var(--font-ui); font-variant-numeric: tabular-nums; font-size: 0.78rem; color: var(--text-mid); }
</style>
