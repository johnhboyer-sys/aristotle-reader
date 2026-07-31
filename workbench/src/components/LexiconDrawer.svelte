<script lang="ts">
  // Bottom drawer: click-to-parse lexicon. IDE-terminal-style panel — pushes
  // the editing viewport up (a flex sibling in App.svelte's .center-col),
  // never floats over it. Word clicks are captured by a delegation listener
  // in App.svelte (this component owns none of the editor's DOM); this
  // component only renders whatever word it's told to look up.
  //
  // Resizable by dragging the top edge (clamped 160px..60vh), reopens at its
  // last dragged height (persisted to localStorage — dev-harness-only
  // storage, matching lib/settings.ts's convention for this project).
  import { greekProvider, latinProvider } from '../lib/lexicon/provider';
  import type { LexiconResult } from '../lib/lexicon/provider';

  let {
    workId,
    word,
    language = 'greek',
    onClose,
  }: {
    workId: string;
    /** The word currently under lookup (the surface form as written), or null
     * when the drawer has nothing to show yet. */
    word: string | null;
    /** Which lexicon to look the word up in. Greek unless the work says Latin. */
    language?: 'greek' | 'latin';
    onClose: () => void;
  } = $props();

  const HEIGHT_KEY = 'workbench:lexicon:height';
  const MIN_H = 160;
  const DEFAULT_H = 260;

  function clampHeight(h: number): number {
    // window.innerHeight can be transiently 0 before the first layout pass
    // in some embeddings — guard so a real persisted height never gets
    // clamped down to MIN_H just because the viewport isn't measured yet.
    const viewportH = window.innerHeight || 0;
    const maxH = viewportH > 0 ? Math.round(viewportH * 0.6) : Infinity;
    return Math.min(Math.max(h, MIN_H), Math.max(MIN_H, maxH));
  }

  function loadHeight(): number {
    if (typeof localStorage === 'undefined') return DEFAULT_H;
    const raw = localStorage.getItem(HEIGHT_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? clampHeight(n) : DEFAULT_H;
  }

  let height = $state(loadHeight());
  let dragging = $state(false);
  let dragStartY = 0;
  let dragStartHeight = 0;

  /**
   * Only Greek is tagged. Tagging Latin `lang="la"` made WebKit substitute a
   * "v" glyph for an ordinary "u" ("Articulus" displayed as "Articvlvs")
   * while the untagged dictionary entry beside it rendered correctly — a
   * display fault only, the lookup itself resolves on the real characters.
   */
  const langTag = $derived<string | undefined>(language === 'latin' ? undefined : 'grc');

  let result = $state<LexiconResult | null>(null);
  let loading = $state(false);
  let loadedFor = '';

  // Re-run the lookup whenever `word` changes. A stale in-flight lookup that
  // resolves after a newer word was clicked is discarded (loadedFor guard).
  $effect(() => {
    const current = word;
    if (!current) {
      result = null;
      loading = false;
      return;
    }
    const token = `${workId}:${language}:${current}:${Date.now()}`;
    loadedFor = token;
    loading = true;
    result = null;
    // The Latin provider takes no workId — its morphology is corpus-wide, not
    // per work (see provider.ts).
    (language === 'latin' ? latinProvider() : greekProvider(workId))
      .lookup(current)
      .then((r) => {
        if (loadedFor === token) {
          result = r;
          loading = false;
        }
      })
      .catch(() => {
        if (loadedFor === token) {
          result = { analyses: [], lsjEntries: [] };
          loading = false;
        }
      });
  });

  function startDrag(e: PointerEvent) {
    dragging = true;
    dragStartY = e.clientY;
    dragStartHeight = height;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onDrag(e: PointerEvent) {
    if (!dragging) return;
    const delta = dragStartY - e.clientY; // dragging up (negative clientY delta) grows the drawer
    height = clampHeight(dragStartHeight + delta);
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (typeof localStorage !== 'undefined') localStorage.setItem(HEIGHT_KEY, String(Math.round(height)));
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

<section
  class="lex-drawer"
  style="height: {height}px"
  aria-label="Lexicon"
  onkeydown={onKeydown}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="lex-resize-handle"
    class:dragging
    role="separator"
    aria-orientation="horizontal"
    aria-label="Resize lexicon drawer"
    tabindex="-1"
    onpointerdown={startDrag}
    onpointermove={onDrag}
    onpointerup={endDrag}
    onpointercancel={endDrag}
  ></div>

  <header class="lex-head">
    {#if word}
      <span class="lex-headword" lang={langTag}>{word}</span>
    {:else}
      <h2 class="lex-title">Lexicon</h2>
    {/if}
    <span class="lex-spacer"></span>
    <button class="lex-close" onclick={onClose} aria-label="Close lexicon">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </header>

  <div class="lex-body">
    {#if !word}
      <p class="lex-placeholder">
        Click a {language === 'latin' ? 'Latin' : 'Greek'} word to see its analysis and dictionary
        entry here.
      </p>
    {:else if loading}
      <!-- Quiet: no spinner, no layout jump — the previous content (if any)
           has already been cleared, so this is just empty space until data
           arrives. -->
    {:else if !result || (result.analyses.length === 0 && result.lsjEntries.length === 0)}
      <p class="lex-placeholder">No entry found for “{word}”.</p>
    {:else}
      {#each result.analyses as a, i (i)}
        <div class="lex-analysis">
          <span class="lex-form" lang={langTag}>{a.form}</span>
          <span class="lex-sep">—</span>
          <span class="lex-parse">{a.parse}</span>
          <!-- Latin analyses carry no gloss (Diogenes' table has none), so the
               separator goes with it rather than dangling. -->
          {#if a.gloss}
            <span class="lex-sep">—</span>
            <span class="lex-gloss">{a.gloss}</span>
          {/if}
          <div class="lex-lemma-line">
            <span class="lex-lemma-label">lemma</span>
            <span class="lex-lemma" lang={langTag}>{a.lemmaDisplay}</span>
          </div>
        </div>
      {/each}

      {#if result.lsjEntries.length > 0}
        <div class="lex-lsj-section">
          <div class="lex-lsj-label">{language === 'latin' ? 'Lewis & Short' : 'LSJ'}</div>
          {#each result.lsjEntries as entry, i (entry.key + i)}
            {#if i > 0}<hr class="lex-lsj-sep" />{/if}
            <div class="lex-lsj-entry">
              <!-- eslint-disable-next-line svelte/no-at-html-tags — pipeline-produced LSJ HTML, same trusted source as the reader app -->
              {@html entry.html}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</section>

<svelte:window onpointermove={onDrag} onpointerup={endDrag} />

<style>
  .lex-drawer {
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 160px;
    background: var(--page-bg);
    border-top: 1px solid var(--border);
    position: relative;
  }

  .lex-resize-handle {
    position: absolute;
    top: -4px;
    left: 0;
    right: 0;
    height: 8px;
    cursor: row-resize;
    z-index: 5;
    touch-action: none;
  }
  .lex-resize-handle::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 50%;
    transform: translateX(-50%);
    width: 2.5rem;
    height: 3px;
    border-radius: 2px;
    background: var(--border);
  }
  .lex-resize-handle:hover::after,
  .lex-resize-handle.dragging::after {
    background: var(--accent-light);
  }

  .lex-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .lex-title {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-mid);
  }
  .lex-headword {
    font-family: var(--font-greek);
    font-size: 1.3rem;
    line-height: 1;
    color: var(--text);
  }
  .lex-spacer {
    flex: 1;
  }
  .lex-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.7rem;
    height: 1.7rem;
    flex: none;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-mid);
    cursor: pointer;
  }
  .lex-close:hover {
    color: var(--text);
    background: var(--ui-hover);
  }

  .lex-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4);
  }

  .lex-placeholder {
    font-family: var(--font-english);
    font-size: 0.9rem;
    color: var(--text-light);
    font-style: italic;
  }

  .lex-analysis {
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--border);
    font-family: var(--font-english);
    font-size: 0.92rem;
    line-height: 1.5;
  }
  .lex-analysis:last-of-type {
    border-bottom: none;
  }
  .lex-form {
    font-family: var(--font-greek);
    font-size: 1.05rem;
    color: var(--text);
  }
  .lex-sep {
    margin: 0 0.4em;
    color: var(--text-light);
  }
  .lex-parse {
    color: var(--text-mid);
    font-style: italic;
  }
  .lex-gloss {
    color: var(--text);
  }
  .lex-lemma-line {
    margin-top: 0.2rem;
    font-size: 0.82rem;
    color: var(--text-light);
  }
  .lex-lemma-label {
    font-family: var(--font-ui);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.7rem;
    margin-right: 0.4em;
  }
  .lex-lemma {
    font-family: var(--font-greek);
  }

  .lex-lsj-section {
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }
  .lex-lsj-label {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-light);
    margin-bottom: 0.4rem;
  }
  .lex-lsj-sep {
    border: none;
    border-top: 1px solid var(--border);
    margin: var(--space-3) 0;
  }
  .lex-lsj-entry {
    font-family: var(--font-english);
    font-size: 0.85rem;
    line-height: 1.55;
    color: var(--text);
  }
  /* LSJ HTML classes from the pipeline (stage5) — same scoped set as the
     reader app's .lsj-entry rules (app/src/styles/global.css), kept local
     to the drawer so no global CSS is needed here. */
  .lex-lsj-entry :global(.lsj-head) { font-family: var(--font-greek); font-weight: bold; font-size: 1rem; }
  .lex-lsj-entry :global(.lsj-gen)  { font-family: var(--font-greek); margin-left: .2em; }
  .lex-lsj-entry :global(.lsj-etym) { font-family: var(--font-greek); font-style: italic; }
  .lex-lsj-entry :global(.lsj-sense) { margin: 0.3em 0 0.3em 0.6em; }
  .lex-lsj-entry :global(.lsj-sense[data-level="1"]) { margin-left: 0; }
  .lex-lsj-entry :global(.lsj-sense-n) { font-weight: bold; margin-right: .3em; }
  .lex-lsj-entry :global(.lsj-bibl) { font-size: .82em; color: var(--text-mid); }
  .lex-lsj-entry :global(.lsj-greek) { font-family: var(--font-greek); }
  .lex-lsj-entry :global(.lsj-quote) { font-family: var(--font-greek); font-style: italic; }
  .lex-lsj-entry :global(.lsj-cit) { display: inline; }
  .lex-lsj-entry :global(.lsj-tr) { font-style: italic; }
  .lex-lsj-entry :global(.lsj-title) { font-style: italic; }
</style>
