<script lang="ts">
  // App chrome for the Translation Workbench. The library rail lists every
  // work from the manifests; corpus-ready works open in the row-lock editor
  // with rows sliced from the Greek spine (src/lib/data). Works without a
  // corpus on this machine degrade to one quiet line. The footnote panel and
  // lexicon drawer are wired below.
  import { onMount } from 'svelte';
  import ThemeToggle from './components/ThemeToggle.svelte';
  import LibraryRail from './components/LibraryRail.svelte';
  import type { RailSelection, RailWork } from './components/LibraryRail.svelte';
  import AddWorkDialog from './components/AddWorkDialog.svelte';
  import LexiconDrawer from './components/LexiconDrawer.svelte';
  import FootnotePanel from './components/FootnotePanel.svelte';
  import ExportButton from './components/ExportButton.svelte';
  import ChapterEditor from './lib/editor/ChapterEditor.svelte';
  import EditorToolbar from './lib/editor/EditorToolbar.svelte';
  import { listWorks } from './lib/works/manifest';
  import type { WorkManifest } from './lib/works/manifest';
  import { invalidateCorpus, loadCorpus } from './lib/data/corpusStore';
  import type { WorkCorpus } from './lib/data/corpusStore';
  import { bookChapterNumbers, chapterForEditor } from './lib/data/chapterRows';
  import { loadSettings, updateSettings } from './lib/settings';
  import { isTauri } from './lib/runtime';
  import { wordAt } from './lib/lexicon/wordAt';

  const works: WorkManifest[] = listWorks();

  let railOpen = $state(true);
  let footnotesOpen = $state(false);
  let lexiconOpen = $state(false);
  let addWorkOpen = $state(false);

  // Per-work corpus (null = not on this machine). Loaded once at startup;
  // refreshed per work after onboarding.
  let corpora = $state<Record<string, WorkCorpus | null>>({});
  let booted = $state(false);
  let selection = $state<RailSelection | null>(null);

  const railWorks: RailWork[] = $derived(
    works.map((work) => {
      const corpus = corpora[work.id] ?? null;
      return {
        work,
        status: corpus ? ('ready' as const) : ('absent' as const),
        books: corpus
          ? work.books.map((b) => ({
              n: b.n,
              label: b.label,
              chapters: bookChapterNumbers(corpus, b.n),
            }))
          : [],
      };
    }),
  );

  const currentWork: WorkManifest | null = $derived(
    selection ? (works.find((w) => w.id === selection!.workId) ?? null) : null,
  );

  const currentChapter = $derived.by(() => {
    if (!selection || !currentWork) return null;
    const corpus = corpora[selection.workId];
    if (!corpus) return null;
    return chapterForEditor(currentWork, corpus, selection.book, selection.chapter);
  });

  /** Breadcrumb parts: work title carries the weight, locus stays quiet. */
  const breadcrumb = $derived.by(() => {
    if (!selection || !currentWork) return { work: 'Translation Workbench', locus: null };
    const label = currentWork.books[selection.book - 1]?.label ?? String(selection.book);
    return { work: currentWork.title, locus: `${label} · ${selection.chapter}` };
  });

  function validSelection(sel: RailSelection): boolean {
    const corpus = corpora[sel.workId];
    if (!corpus) return false;
    return bookChapterNumbers(corpus, sel.book).includes(sel.chapter);
  }

  /** First chapter of the first book of the first ready work (Metaphysics
   * preferred) — the first-run landing. Null when no corpus exists at all. */
  function defaultSelection(): RailSelection | null {
    const ordered = [...works].sort((a, b) =>
      a.id === 'metaphysics' ? -1 : b.id === 'metaphysics' ? 1 : 0,
    );
    for (const work of ordered) {
      const corpus = corpora[work.id];
      if (!corpus) continue;
      for (const book of work.books) {
        const chapters = bookChapterNumbers(corpus, book.n);
        if (chapters.length > 0) return { workId: work.id, book: book.n, chapter: chapters[0] };
      }
    }
    return null;
  }

  onMount(() => {
    // Startup: load every work's corpus, then land on the last-opened chapter
    // (or book Α chapter 1 of the Metaphysics on first run).
    void (async () => {
      const settings = await loadSettings();
      const loaded: Record<string, WorkCorpus | null> = {};
      await Promise.all(
        works.map(async (work) => {
          loaded[work.id] = await loadCorpus(work.id);
        }),
      );
      corpora = loaded;
      const last = settings.lastOpened;
      if (last && works.some((w) => w.id === last.workId) && validSelection(last)) {
        selection = last;
      } else {
        selection = defaultSelection();
      }
      booted = true;
    })();
  });

  function select(workId: string, book: number, chapter: number) {
    selection = { workId, book, chapter };
    void updateSettings({ lastOpened: { workId, book, chapter } });
  }

  async function handleOnboarded(workId: string) {
    invalidateCorpus(workId);
    corpora = { ...corpora, [workId]: await loadCorpus(workId) };
  }

  function toggleRail() {
    railOpen = !railOpen;
  }
  function toggleFootnotes() {
    footnotesOpen = !footnotesOpen;
  }
  function toggleLexicon() {
    lexiconOpen = !lexiconOpen;
  }
  function closeLexicon() {
    lexiconOpen = false;
  }

  // ── click-to-parse: word-click delegation over the Greek column ─────────
  //
  // The editor (lib/editor/**) is read-only from here — this listener sits
  // on the viewport container and never touches editor internals. It finds
  // the click's text offset via caretRangeFromPoint (Safari/Chrome) or
  // caretPositionFromPoint (Firefox), walks up to the nearest .grc-cell (the
  // read-only Greek spine cell — see lib/editor/GreekCell.svelte), and pulls
  // the clicked word out of that cell's own text via wordAt(). A transient
  // CSS class flashes the clicked word (removed on the next click / timeout)
  // — applied to a synthetic wrapper span injected around the exact text
  // range, then unwrapped again so the cell's plain-text contract used by
  // caretRangeFromPoint on subsequent clicks is undisturbed.
  let lexiconWord = $state<string | null>(null);
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;

  function caretOffsetInCell(cell: HTMLElement, x: number, y: number): number | null {
    const docWithCaret = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let node: Node | null = null;
    let offset = 0;
    if (docWithCaret.caretRangeFromPoint) {
      const range = docWithCaret.caretRangeFromPoint(x, y);
      if (!range) return null;
      node = range.startContainer;
      offset = range.startOffset;
    } else if (docWithCaret.caretPositionFromPoint) {
      const pos = docWithCaret.caretPositionFromPoint(x, y);
      if (!pos) return null;
      node = pos.offsetNode;
      offset = pos.offset;
    } else {
      return null;
    }
    if (!cell.contains(node)) return null;
    // Always resolve via a Range spanning from the cell's start to the click
    // point: GreekCell normally holds a single text node (where this equals
    // `offset` directly), but a still-animating flash from a PRIOR click
    // splits the cell into three siblings (text-before / .lex-word-flash
    // span / text-after) for up to 900ms — a raw `offset` would then be
    // local to whichever fragment was clicked, not the cell's full text, so
    // this must always account for preceding sibling text length.
    try {
      const full = document.createRange();
      full.selectNodeContents(cell);
      full.setEnd(node, offset);
      return full.toString().length;
    } catch {
      return null;
    }
  }

  function flashWord(cell: HTMLElement, start: number, end: number) {
    clearTimeout(highlightTimer);
    cell.querySelectorAll<HTMLElement>('.lex-word-flash').forEach((el) => {
      // Undo any previous wrap so the cell returns to a single text node.
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    });
    const textNode = [...cell.childNodes].find((n) => n.nodeType === Node.TEXT_NODE) as Text | undefined;
    if (!textNode) return;
    try {
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      const wrap = document.createElement('span');
      wrap.className = 'lex-word-flash';
      range.surroundContents(wrap);
    } catch {
      return; // best-effort highlight only — never block the lookup
    }
    highlightTimer = setTimeout(() => {
      cell.querySelectorAll<HTMLElement>('.lex-word-flash').forEach((el) => {
        const parent = el.parentNode;
        if (!parent) return;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        parent.normalize();
      });
    }, 900);
  }

  function onEditorClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    const cell = target?.closest<HTMLElement>('.grc-cell');
    if (!cell) return;
    const offset = caretOffsetInCell(cell, e.clientX, e.clientY);
    if (offset === null) return;
    const text = cell.textContent ?? '';
    const span = wordAt(text, offset);
    if (!span) return;
    lexiconWord = span.text;
    lexiconOpen = true;
    flashWord(cell, span.start, span.end);
  }
</script>

<div class="shell">
  <header class="topbar">
    <button
      class="icon-btn"
      onclick={toggleRail}
      title={railOpen ? 'Hide library' : 'Show library'}
      aria-label="Toggle library"
      aria-pressed={railOpen}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>

    <span class="breadcrumb">
      <span class="crumb-work">{breadcrumb.work}</span>
      {#if breadcrumb.locus}
        <span class="crumb-locus">{breadcrumb.locus}</span>
      {/if}
    </span>

    <span class="spacer"></span>

    <div class="toolbar-slot" role="toolbar" aria-label="Toolbar">
      <EditorToolbar />
    </div>

    <ExportButton work={currentWork} book={selection?.book ?? 0} chapter={selection?.chapter ?? 0} />

    <span class="tb-divider" aria-hidden="true"></span>

    <div class="panel-toggles" role="group" aria-label="Panels">
      <button
        class="icon-btn"
        class:active={footnotesOpen}
        onclick={toggleFootnotes}
        title={footnotesOpen ? 'Hide footnotes' : 'Show footnotes'}
        aria-label="Toggle footnotes panel"
        aria-pressed={footnotesOpen}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 4h16v12H8l-4 4V4z" />
        </svg>
      </button>

      <button
        class="icon-btn"
        class:active={lexiconOpen}
        onclick={toggleLexicon}
        title={lexiconOpen ? 'Hide lexicon' : 'Show lexicon'}
        aria-label="Toggle lexicon drawer"
        aria-pressed={lexiconOpen}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      </button>

      <ThemeToggle />
    </div>
  </header>

  <div class="body">
    {#if railOpen}
      <aside class="rail">
        {#if booted}
          <LibraryRail
            {railWorks}
            selected={selection}
            onSelect={select}
            onAddWork={isTauri() ? () => (addWorkOpen = true) : undefined}
          />
        {/if}
      </aside>
    {/if}

    <div class="center-col">
      <main class="editor-viewport" onclick={onEditorClick}>
        {#if !booted}
          <!-- corpus still loading; keep the viewport quiet -->
        {:else if currentChapter}
          {#key `${selection?.workId}:${selection?.book}.${selection?.chapter}`}
            <ChapterEditor fixture={currentChapter} />
          {/key}
        {:else if selection}
          <div class="empty-state-wrap">
            <div class="empty-state">
              <p>This chapter isn't available.</p>
            </div>
          </div>
        {:else}
          <div class="empty-state-wrap">
            <div class="empty-state">
              <p>Nothing to work on yet.</p>
              <p class="empty-sub">Works appear in the library once their texts are on this Mac.</p>
            </div>
          </div>
        {/if}
      </main>

      {#if lexiconOpen}
        <LexiconDrawer workId={selection?.workId ?? ''} word={lexiconWord} onClose={closeLexicon} />
      {/if}
    </div>

    {#if footnotesOpen}
      <aside class="side-panel" aria-label="Footnotes">
        <header class="panel-head">
          <h2>Footnotes</h2>
          <button class="icon-btn" onclick={toggleFootnotes} aria-label="Close footnotes">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div class="panel-body">
          <FootnotePanel />
        </div>
      </aside>
    {/if}
  </div>

  {#if addWorkOpen}
    <AddWorkDialog
      works={works.filter((w) => !corpora[w.id])}
      onClose={() => (addWorkOpen = false)}
      onOnboarded={handleOnboarded}
    />
  {/if}
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  /* ── Top bar ──────────────────────────────────────────────────────── */
  .topbar {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 3rem;
    padding: 0 var(--space-4);
    background: var(--col-bg);
    border-bottom: 1px solid var(--border);
  }
  .breadcrumb {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-2);
    font-family: var(--font-ui);
    font-size: 0.85rem;
    letter-spacing: 0.01em;
    white-space: nowrap;
    min-width: 0;
    overflow: hidden;
  }
  .crumb-work {
    font-weight: 600;
    color: var(--text);
  }
  .crumb-locus {
    font-weight: 400;
    font-size: 0.8rem;
    color: var(--text-mid);
    font-variant-numeric: tabular-nums;
  }
  .crumb-locus::before {
    content: '·';
    color: var(--text-light);
    margin-right: var(--space-2);
  }
  .spacer {
    flex: 1;
  }
  .toolbar-slot {
    min-width: 0;
  }

  .tb-divider {
    flex: none;
    width: 1px;
    height: 1.1rem;
    background: var(--border);
    margin: 0 var(--space-2);
  }

  .panel-toggles {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  /* Quiet toolbar buttons: borderless, a soft wash on hover — the native-
     toolbar treatment rather than a row of outlined web buttons. */
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
  .icon-btn.active {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  /* ── Body: rail · center · side panel ────────────────────────────── */
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .rail {
    flex: none;
    width: 260px;
    min-height: 0;
    overflow-y: auto;
    background: var(--page-bg);
    border-right: 1px solid var(--border);
  }

  .center-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .editor-viewport {
    flex: 1;
    min-height: 0;
    /* The ChapterEditor owns its own scroll container (scroll anchoring +
       settle guard need direct scrollTop control). */
    overflow: hidden;
  }

  .empty-state-wrap {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .empty-state {
    font-family: var(--font-english);
    font-size: 1rem;
    color: var(--text-light);
    font-style: italic;
    text-align: center;
  }
  .empty-sub {
    margin-top: var(--space-2);
    font-size: 0.85rem;
  }

  .side-panel {
    flex: none;
    width: 320px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--page-bg);
    border-left: 1px solid var(--border);
  }

  /* Transient click-to-parse highlight: a synthetic wrapper span injected
     around the clicked word's exact text range inside a read-only .grc-cell
     (see onEditorClick/flashWord above). Global, not scoped — Svelte's
     scoped-style attribute is only added to elements present at compile
     time, and this span is created imperatively at runtime. */
  :global(.lex-word-flash) {
    background: var(--greek-active);
    border-radius: 2px;
    transition: background 0.6s ease-out;
  }

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

  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4);
  }

  .placeholder-text {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--text-light);
  }
</style>
