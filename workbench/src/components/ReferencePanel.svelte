<script lang="ts">
  // Reference-translation panel (design doc D5 §4, build spec §13). Docks in
  // App.svelte's right .side-panel slot — the FootnotePanel skin exactly:
  // .panel-head with an uppercase title + close button, scrollable body.
  //
  // Auto-targets the current (workId, book, chapter) from props; changing
  // chapters in the rail re-targets with no user action. When a work has
  // more than one imported edition, a picker appears in the head; the last
  // pick is remembered per work (localStorage — LexiconDrawer's persistence
  // pattern). Absence is quiet and unremarkable (§12): one plain italic
  // sentence, never a badge or a nag.
  import { referenceStorage } from '../lib/reference/storage';
  import { referenceForSelection } from '../lib/reference/view';
  import type { ReferenceManifest, ReferenceParagraph } from '../lib/reference/types';
  import {
    loadChapterBody,
    loadEditions,
    readEditionPref,
    resolveActiveSlug,
    writeEditionPref,
  } from '../lib/referenceui/editions';

  let {
    workId,
    book,
    chapter,
    reloadKey = 0,
    onClose,
    onImport,
  }: {
    /** Currently open work, or null when nothing is selected. */
    workId: string | null;
    book: number | null;
    chapter: number | null;
    /** Bump to force a reload (App increments it after a reference import). */
    reloadKey?: number;
    onClose: () => void;
    /** Inline import action for the no-editions state (App gates this the
     * way LibraryRail's onImportChapter is gated — Tauri or dev harness). */
    onImport?: () => void;
  } = $props();

  const kv = typeof localStorage === 'undefined' ? undefined : localStorage;

  let editions = $state<ReferenceManifest[]>([]);
  let corruptSlugs = $state<string[]>([]);
  let activeSlug = $state<string | null>(null);
  let paragraphs = $state<ReferenceParagraph[]>([]);
  /** Body lookup outcome for the current chapter (null body = absent). */
  let chapterAbsent = $state(false);
  let loaded = $state(false);

  const activeEdition = $derived(editions.find((e) => e.slug === activeSlug) ?? null);

  // Reload editions when the work changes (or after an import bumps
  // reloadKey); reload the chapter body when the edition or locus changes.
  // A stale async result that lands after a newer request is discarded.
  let requestToken = 0;

  $effect(() => {
    const work = workId;
    const b = book;
    const c = chapter;
    void reloadKey;
    const token = ++requestToken;
    if (!work) {
      editions = [];
      corruptSlugs = [];
      activeSlug = null;
      paragraphs = [];
      chapterAbsent = false;
      loaded = true;
      return;
    }
    loaded = false;
    void (async () => {
      const storage = referenceStorage();
      const result = await loadEditions(storage, work);
      if (token !== requestToken) return;
      editions = result.editions;
      corruptSlugs = result.corruptSlugs;
      const slug = resolveActiveSlug(result.editions, readEditionPref(kv, work));
      activeSlug = slug;
      await showChapter(storage, work, slug, b, c, token);
    })();
  });

  async function showChapter(
    storage: ReturnType<typeof referenceStorage>,
    work: string,
    slug: string | null,
    b: number | null,
    c: number | null,
    token: number,
  ) {
    const manifest = editions.find((e) => e.slug === slug) ?? null;
    if (!manifest || b === null || c === null) {
      if (token !== requestToken) return;
      paragraphs = [];
      chapterAbsent = manifest !== null;
      loaded = true;
      return;
    }
    const body = await loadChapterBody(storage, manifest, b, c);
    if (token !== requestToken) return;
    if (body === null) {
      paragraphs = [];
      chapterAbsent = true;
    } else {
      const view = referenceForSelection(body);
      paragraphs = view.mode === 'chapter' ? view.paragraphs : view.segments;
      chapterAbsent = false;
    }
    loaded = true;
  }

  function pickEdition(slug: string) {
    if (!workId) return;
    activeSlug = slug;
    writeEditionPref(kv, workId, slug);
    const token = ++requestToken;
    void showChapter(referenceStorage(), workId, slug, book, chapter, token);
  }
</script>

<div class="ref-panel">
  <header class="panel-head">
    <h2>Reference</h2>
    {#if editions.length > 1}
      <select
        class="edition-picker"
        aria-label="Reference edition"
        value={activeSlug ?? ''}
        onchange={(e) => pickEdition((e.currentTarget as HTMLSelectElement).value)}
      >
        {#each editions as edition (edition.slug)}
          <option value={edition.slug}>{edition.displayName}</option>
        {/each}
      </select>
    {/if}
    <button class="icon-btn" onclick={onClose} aria-label="Close reference panel">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </header>

  {#if activeEdition}
    <p class="edition-caption">{activeEdition.displayName}</p>
  {/if}

  <div class="panel-body">
    {#if !loaded || !workId}
      <!-- still resolving, or nothing is open; keep the panel quiet -->
    {:else if editions.length === 0}
      {#if corruptSlugs.length > 0}
        <p class="quiet-line">This reference edition couldn't be read — try importing it again.</p>
      {:else}
        <p class="quiet-line">Import a reference translation to read it alongside your work.</p>
      {/if}
      {#if onImport}
        <button class="inline-import" onclick={onImport}>Import reference…</button>
      {/if}
    {:else if chapterAbsent}
      <p class="quiet-line">No reference translation for this chapter yet.</p>
    {:else}
      <div class="ref-prose">
        {#each paragraphs as para (para.id)}
          <p class="ref-para">{para.text}</p>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .ref-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* Same skin as App.svelte's .panel-head for the footnote panel. */
  .panel-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .panel-head h2 {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-mid);
  }

  .edition-picker {
    flex: 1;
    min-width: 0;
    margin-left: auto;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 0.2rem 0.35rem;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.9rem;
    height: 1.9rem;
    flex: none;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-mid);
    cursor: pointer;
  }
  .icon-btn:hover {
    color: var(--text);
    background: var(--ui-hover);
  }

  /* "The chapter opposite" caption (D5 §4): which translation is showing. */
  .edition-caption {
    flex: none;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--text-light);
    padding: var(--space-2) var(--space-4) 0;
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4);
  }

  /* Absence copy: plain, quiet, italic — the lexicon placeholder's voice. */
  .quiet-line {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.6;
    font-style: italic;
    color: var(--text-light);
  }

  .inline-import {
    margin-top: var(--space-3);
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-mid);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
  .inline-import:hover {
    color: var(--text);
    background: var(--ui-hover);
  }

  /* Reference prose: the app's English reading face at a comfortable size. */
  .ref-prose {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .ref-para {
    font-family: var(--font-english);
    font-size: 0.95rem;
    line-height: 1.65;
    color: var(--text);
  }
</style>
