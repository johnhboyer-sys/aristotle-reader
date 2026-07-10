<script lang="ts">
  import { tick } from 'svelte';
  import { fetchColumns, fetchLemmata, resolveBekker, type LemmaRef } from '../lib/data';
  import { workPath, getWork } from '../lib/works';
  import { resumeFor } from '../lib/resume';
  import { hasGreek, parseCitation, rankLemmata, rankWorks } from '../lib/palette';

  // The work currently open in the reader (enables Bekker-citation jumps);
  // null on pages with no work context (home, landings).
  export let work: string | null = null;
  // Hosts with their own routing pass a callback; the site default navigates
  // the tab (same contract as BekkerJump's onJump).
  export let onNavigate: ((href: string) => void) | null = null;

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  interface Item {
    kind: 'bekker' | 'work' | 'lemma' | 'search';
    label: string;
    detail: string;
    href: string;
  }

  let open = false;
  let query = '';
  let items: Item[] = [];
  let selected = 0;
  let inputEl: HTMLInputElement | undefined;
  let lemmata: Record<string, LemmaRef> | null = null;
  let seq = 0; // stale-async guard

  function navigate(href: string) {
    close();
    if (onNavigate) onNavigate(href);
    else window.location.href = href;
  }

  export async function openPalette() {
    open = true;
    query = '';
    items = [];
    selected = 0;
    await tick();
    inputEl?.focus();
  }

  function close() {
    open = false;
    query = '';
    items = [];
  }

  function onWindowKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (open) close();
      else openPalette();
      return;
    }
    if (open && e.key === 'Escape') { e.preventDefault(); close(); }
  }

  async function compute(q: string) {
    const mySeq = ++seq;
    const out: Item[] = [];
    const trimmed = q.trim();
    if (!trimmed) { items = []; selected = 0; return; }

    // 1. A Bekker citation jumps within the current work.
    const cite = work ? parseCitation(trimmed) : null;
    if (cite && work) {
      const cols = await fetchColumns(work).catch(() => null);
      if (mySeq !== seq) return; // a newer keystroke superseded this pass
      const book = cols ? resolveBekker(cols, cite.column, cite.line ?? 1) : null;
      if (book != null) {
        const w = getWork(work);
        out.push({
          kind: 'bekker',
          label: `Go to ${cite.column}${cite.line ?? ''}`,
          detail: w ? `${w.title} · Book ${book}` : `Book ${book}`,
          href: cite.line != null
            ? `${base}${workPath(work, book)}?loc=${cite.column}:${cite.line}`
            : `${base}${workPath(work, book)}#${cite.column}`,
        });
      }
    }

    // 2. Works by name/abbreviation — resuming a saved position when one exists.
    for (const w of rankWorks(trimmed)) {
      const pos = resumeFor(w.id);
      const book = pos ? Math.min(Math.max(1, pos.book), w.books) : 1;
      out.push({
        kind: 'work',
        label: w.title,
        detail: pos?.cite ? `resumes at ${pos.cite}` : w.blurb,
        href: `${base}${workPath(w.id, book)}${pos?.cite ? `#${pos.cite}` : ''}`,
      });
    }

    // 3. Greek input also matches lemma pages (concordance + LSJ).
    if (hasGreek(trimmed)) {
      lemmata ??= await fetchLemmata().catch(() => ({}));
      if (mySeq !== seq) return;
      for (const ref of rankLemmata(trimmed, lemmata)) {
        out.push({
          kind: 'lemma',
          label: ref.head,
          detail: `lexicon · ${ref.count.toLocaleString()} occurrences`,
          href: `${base}/lemma/${ref.slug}/`,
        });
      }
    }

    // 4. Always offer the full corpus search.
    out.push({
      kind: 'search',
      label: `Search the corpus for “${trimmed}”`,
      detail: 'Greek & English · all works',
      href: `${base}/search?${hasGreek(trimmed) ? 'g' : 'e'}=${encodeURIComponent(trimmed)}`,
    });

    items = out;
    selected = 0;
  }

  $: if (open) compute(query);

  function onInputKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selected];
      if (item) navigate(item.href);
    }
  }
</script>

<svelte:window on:keydown={onWindowKey} />

{#if open}
  <div class="cp-backdrop" on:click={(e) => { if (e.target === e.currentTarget) close(); }} role="presentation">
    <div class="cp-box" role="dialog" aria-modal="true" aria-label="Jump to a work, citation, or lemma" tabindex="-1">
      <input
        class="cp-input"
        type="text"
        bind:this={inputEl}
        bind:value={query}
        on:keydown={onInputKey}
        placeholder="Work, Bekker citation, or Greek word…"
        aria-label="Jump to a work, Bekker citation, or Greek word"
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls="cp-list"
        aria-activedescendant={items.length ? `cp-item-${selected}` : undefined}
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
      />
      {#if items.length}
        <ul class="cp-list" id="cp-list" role="listbox">
          {#each items as item, i}
            <li
              id={`cp-item-${i}`}
              role="option"
              aria-selected={i === selected}
              class="cp-item"
              class:active={i === selected}
            >
              <button type="button" on:click={() => navigate(item.href)} on:mousemove={() => (selected = i)}>
                <span class="cp-kind">{item.kind === 'bekker' ? '§' : item.kind === 'work' ? '📖' : item.kind === 'lemma' ? 'λ' : '🔍'}</span>
                <span class="cp-label" class:gk={item.kind === 'lemma'}>{item.label}</span>
                <span class="cp-detail">{item.detail}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else if query.trim()}
        <p class="cp-empty">Keep typing — a work name, “1103a14”, or a Greek word.</p>
      {/if}
      <p class="cp-hint"><kbd>↑↓</kbd> select · <kbd>⏎</kbd> open · <kbd>esc</kbd> close</p>
    </div>
  </div>
{/if}

<style>
  .cp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1200;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: clamp(3rem, 16vh, 9rem);
  }
  .cp-box {
    width: min(34rem, 92vw);
    background: var(--page-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.22);
    padding: 0.65rem;
    font-family: var(--font-ui);
  }
  .cp-input {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: 1rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--col-bg);
    color: var(--text);
  }
  .cp-input:focus { outline: none; border-color: var(--accent); }
  .cp-list { list-style: none; margin: 0.45rem 0 0; padding: 0; max-height: 20rem; overflow-y: auto; }
  .cp-item button {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
    width: 100%;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 0.6rem;
    font: inherit;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .cp-item.active button { background: var(--col-bg); }
  .cp-kind { flex-shrink: 0; width: 1.3rem; text-align: center; color: var(--text-light); font-size: 0.85rem; }
  .cp-label { font-weight: 600; }
  .cp-label.gk { font-family: var(--font-greek); font-weight: 400; font-size: 1.05rem; }
  .cp-detail {
    margin-left: auto;
    color: var(--text-light);
    font-size: 0.74rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 55%;
  }
  .cp-empty { margin: 0.6rem 0.2rem 0.2rem; color: var(--text-light); font-size: 0.85rem; }
  .cp-hint { margin: 0.5rem 0.2rem 0; color: var(--text-light); font-size: 0.72rem; }
  .cp-hint kbd {
    font: inherit;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 0.3rem;
    background: var(--col-bg);
  }
</style>
