<script lang="ts">
  // The desktop shell: persistent library rail · top bar · the website's
  // Reader.svelte mounted unchanged as the reading pane. Navigation is state
  // (work + book) with a keyed remount; jump-ins reuse the Reader's existing
  // URL contract (?loc=column:line, #hash) via history.replaceState, so the
  // Reader needs no desktop-specific changes.
  import Reader from '../../app/src/components/Reader.svelte';
  import { getWork, bookLabel, visibleTranslations } from '../../app/src/lib/works';
  import { parseBekker } from '../../app/src/lib/data';
  import { entryByDataId } from './lib/corpus';
  import type { DataLayerInfo } from './lib/runtime';
  import LibraryRail from './components/LibraryRail.svelte';
  import BekkerJumpDesktop from './components/BekkerJumpDesktop.svelte';
  import ThemeToggle from './components/ThemeToggle.svelte';
  import LexiconIndex from './components/LexiconIndex.svelte';
  import LexiconEntry from './components/LexiconEntry.svelte';
  import ImportDialog from './components/ImportDialog.svelte';
  import Search from '../../app/src/components/Search.svelte';
  import type { ImportSummary } from './lib/imports';
  import AnnotationsPanel from './components/AnnotationsPanel.svelte';
  import {
    addAnnotation, captureSelection, listAnnotations, newId, paintAnnotations,
    type Annotation,
  } from './lib/annotations';
  import { onMount } from 'svelte';

  export let dataLayer: DataLayerInfo;

  // ── Location state ────────────────────────────────────────────────────────
  let workId = 'EN';
  let bookNum = 1;
  let navSeq = 0;              // bumps on every navigation → keyed remount
  try {
    const saved = JSON.parse(localStorage.getItem('desktop-loc') ?? 'null');
    if (saved && getWork(saved.work)) {
      workId = saved.work;
      bookNum = Math.min(Math.max(1, saved.book ?? 1), getWork(saved.work)!.books);
    }
  } catch { /* first launch */ }

  $: meta = getWork(workId);
  $: busse = meta?.citation?.scheme === 'busse';
  $: titleSuffix = meta && meta.books > 1 ? ` · Book ${bookLabel(meta, bookNum)}` : '';

  // Optional curated chapter titles ({book: {chapter: title}}) — the website
  // reads this at build time in ReaderShell; the desktop fetches it at runtime.
  // Missing file = headings fall back to "Chapter N", same as the site.
  // Loaded BEFORE the Reader remounts (see nav below): a late title update
  // re-renders the chapter headings, and that layout shift aborts the Reader's
  // in-flight smooth scroll to a jumped-to line.
  const dataRoot = () =>
    (globalThis as { __ARISTOTLE_DATA_ROOT__?: string }).__ARISTOTLE_DATA_ROOT__ ?? '/data';
  let chapterTitles: Record<string, string> = {};
  const _titlesCache = new Map<string, Record<string, Record<string, string>>>();
  async function loadTitles(id: string): Promise<Record<string, Record<string, string>>> {
    const cached = _titlesCache.get(id);
    if (cached) return cached;
    const all = await fetch(`${dataRoot()}/${id}/chapter-titles.json`)
      .then(r => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    _titlesCache.set(id, all);
    return all;
  }
  loadTitles(workId).then(all => { chapterTitles = all[String(bookNum)] ?? {}; });

  function persistLoc() {
    try { localStorage.setItem('desktop-loc', JSON.stringify({ work: workId, book: bookNum })); } catch { /* fine */ }
  }

  // Set the URL the Reader will parse on mount (?loc= forces bilingual + line
  // scroll, ?hlg= highlights a Greek term; #hash covers chapter targets), then
  // remount it.
  async function nav(id: string, book?: number, opts: { loc?: string; hash?: string; hlg?: string; hle?: string } = {}) {
    const m = getWork(id);
    if (!m) return;
    let b = book ?? bookNum;
    if (id !== workId && book === undefined) {
      // Entering a work fresh: resume its last-read book if the Reader saved one.
      const savedBook = (() => { try { return localStorage.getItem(`reader-book-${id}`); } catch { return null; } })();
      b = savedBook ? Number(savedBook) : 1;
    }
    b = Math.min(Math.max(1, b), m.books);
    // Titles resolved before the remount so the first render is final (no
    // late heading reflow under the Reader's jump scroll).
    const allTitles = await loadTitles(id);
    chapterTitles = allTitles[String(b)] ?? {};
    const params = new URLSearchParams();
    if (opts.loc) params.set('loc', opts.loc);
    if (opts.hlg) params.set('hlg', opts.hlg);
    if (opts.hle) params.set('hle', opts.hle);
    const qs = params.toString();
    const url = `/${qs ? `?${qs}` : ''}${opts.hash ? `#${opts.hash}` : ''}`;
    try { history.replaceState(null, '', url); } catch { /* tauri origin quirks */ }
    workId = id;
    bookNum = b;
    navSeq += 1;
    persistLoc();
    scrollTo({ top: 0 });
    if (opts.loc) {
      const [col, ln] = opts.loc.split(':');
      armJumpVerifier(col, Number(ln));
    }
  }

  // The Reader's own jump-in scroll is smooth and one-shot; anything that
  // shifts layout mid-flight (font swap, image, late data) can abort it and
  // strand the view at the top. Verify the target actually made it on screen
  // and correct instantly if not — never fight a scroll that succeeded.
  let jumpSeq = 0;
  function armJumpVerifier(col: string, line: number) {
    const seq = ++jumpSeq;
    const check = (attempt: number) => {
      if (seq !== jumpSeq) return;             // superseded by a newer jump
      const el = document.getElementById(`L${col}-${line}`);
      if (el) {
        const r = el.getBoundingClientRect();
        const inView = r.top >= 0 && r.top <= window.innerHeight * 0.85;
        if (inView) return;                     // the Reader's scroll landed
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
        // Late layout drift (fonts, figures) can nudge the line back out of
        // view after an instant correction — verify once more before trusting.
        if (attempt < 3) setTimeout(() => check(attempt + 1), 900);
        return;
      }
      if (attempt < 3) setTimeout(() => check(attempt + 1), 900); // book still loading
    };
    setTimeout(() => check(0), 1100);
  }

  function onOpenWork(id: string, book?: number) { nav(id, book); }

  function onOpenChapter(book: number, chapter: string) {
    const target = `ch-${book}-${chapter}`;
    if (book === bookNum) {
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      nav(workId, book, { hash: target });
    }
  }

  function onBekkerJump(book: number, column: string, line: number) {
    nav(workId, book, { loc: `${column}:${line}` });
  }

  // ── Lexicon overlay ───────────────────────────────────────────────────────
  // The browsable dictionary (site: /lemma + /lemma/<slug>), ported as a
  // full-pane overlay with its own scroll so the reader underneath keeps its
  // exact position. null = closed; { slug: null } = the index.
  let lexicon: { slug: string | null } | null = null;
  function openLexicon(slug: string | null = null) { lexicon = { slug }; }
  function closeLexicon() { lexicon = null; }
  function lexiconJump(work: string, book: number, column: string, line: number, surface: string) {
    closeLexicon();
    nav(work, book, { loc: `${column}:${line}`, hlg: surface });
  }
  function onEsc(e: KeyboardEvent) {
    if (e.key === 'Escape' && searchOpen) { e.stopPropagation(); searchOpen = false; return; }
    if (e.key === 'Escape' && lexicon) { e.stopPropagation(); closeLexicon(); }
    // ⌘K / Ctrl-K opens search from anywhere.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchOpen = true;
    }
  }

  // ── Search overlay ────────────────────────────────────────────────────────
  // The site's Search.svelte mounted whole (dual boxes, All/Any/Phrase,
  // lemma/form, wildcards, works refine, CSV export), plus the desktop-only
  // accent-sensitivity toggle via its accentOption prop. Result links are
  // ordinary reader hrefs — the global click interceptor below turns them
  // into in-app navigation.
  let searchOpen = false;

  // ── Import flow ───────────────────────────────────────────────────────────
  // Both entry points the plan requires: a button (native picker) and true
  // drag-and-drop onto the library. A finished import reloads the app so the
  // Reader re-resolves its translation list and book caches with the new
  // overlay registered.
  let importDlg: { file: { name: string; text: string } | null } | null = null;
  function openImport() { importDlg = { file: null }; }
  function closeImport(imported: ImportSummary | null) {
    importDlg = null;
    if (imported) location.reload();
  }
  let dragOver = false;
  function onDragOver(e: DragEvent) {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      dragOver = true;
    }
  }
  function onDragLeave() { dragOver = false; }
  async function onDrop(e: DragEvent) {
    dragOver = false;
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    importDlg = { file: { name: f.name, text: await f.text() } };
  }

  // ── Annotations ───────────────────────────────────────────────────────────
  // Highlights + notes (one type; see lib/annotations.ts for the anchor
  // rules). Painting uses the CSS Custom Highlight API and re-runs whenever
  // the reader's DOM changes (nav, book load, view/translation switch) via a
  // debounced MutationObserver — the Reader itself is never modified.
  let annOpen = (() => {
    try { return localStorage.getItem('desktop-ann') === 'open'; } catch { return false; }
  })();
  function toggleAnn() {
    annOpen = !annOpen;
    try { localStorage.setItem('desktop-ann', annOpen ? 'open' : 'closed'); } catch { /* fine */ }
  }
  let annotations: Annotation[] = [];
  // The translation currently filling the English column — the Reader's own
  // resolution order: saved choice (if still valid), else the work's declared
  // default, else the primary 'english' slot.
  const activeTrans = (): string => {
    const m = getWork(workId);
    const ts = m ? visibleTranslations(m) : [];
    try {
      const saved = localStorage.getItem(`reader-trans-${workId}`);
      if (saved && (saved === 'compare' || ts.some(t => t.id === saved))) return saved;
    } catch { /* fall through */ }
    return ts.find(t => t.id === m?.defaultTranslation)?.id
      ?? ts.find(t => t.slot === 'english')?.id
      ?? ts[0]?.id
      ?? '';
  };
  let annTransShown = '';
  async function refreshAnnotations() {
    annotations = [...await listAnnotations(workId)];
    annTransShown = activeTrans();
    paintAnnotations(annotations, annTransShown);
  }
  $: if (workId) refreshAnnotations();

  let paintTimer: ReturnType<typeof setTimeout> | undefined;
  onMount(() => {
    const mo = new MutationObserver(() => {
      clearTimeout(paintTimer);
      paintTimer = setTimeout(() => {
        annTransShown = activeTrans();
        paintAnnotations(annotations, annTransShown);
      }, 300);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  });

  // Selection toolbar: appears over a selection inside the reader; offers
  // Highlight / Note. The anchor is captured the moment the toolbar opens —
  // clicking into the note textarea clears the document selection, so
  // capture-at-save would always come up empty. Compare view is not
  // supported for capture in v1 (which column's wording is ambiguous there).
  let selPos: { x: number; y: number } | null = null;
  let noteDraft: string | null = null;   // non-null = the note input is open
  let pendingCapture: ReturnType<typeof captureSelection> = null;
  function onReaderMouseUp() {
    setTimeout(() => {
      if (lexicon || searchOpen || importDlg) { selPos = null; return; }
      if (noteDraft !== null) return;    // don't tear down an open note input
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { selPos = null; pendingCapture = null; return; }
      const el = sel.anchorNode ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode as Element : sel.anchorNode.parentElement) : null;
      if (!el?.closest('.segment')) { selPos = null; return; }
      const t = activeTrans();
      if (t === 'compare') { selPos = null; return; }  // ambiguous column — no capture in v1
      pendingCapture = captureSelection(bookNum, t);
      if (!pendingCapture) { selPos = null; return; }  // unanchorable (spans columns, chrome)
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) { selPos = null; return; }
      selPos = { x: Math.min(rect.right, window.innerWidth - 180), y: Math.max(8, rect.top - 38) };
    }, 0);
  }
  async function saveAnnotation(body: string) {
    const cap = pendingCapture;
    if (!cap) { showToast('Could not anchor that selection — try selecting within one column'); selPos = null; return; }
    await addAnnotation({
      id: newId(), work: workId, created: new Date().toISOString(),
      body, layer: cap.layer, target: cap.target, exact: cap.exact,
    });
    pendingCapture = null;
    selPos = null;
    noteDraft = null;
    window.getSelection()?.removeAllRanges();
    await refreshAnnotations();
    if (body) annOpen = true;
    showToast(body ? 'Note saved' : 'Highlighted');
  }
  function annJump(a: Annotation) {
    if (a.target.kind === 'greek') {
      nav(workId, a.target.book, { loc: `${a.target.start.column}:${a.target.start.line}` });
    } else {
      const col = a.target.column;
      nav(workId, a.target.book).then(() => {
        let tries = 0;
        const seek = () => {
          const el = document.getElementById(`col-${col}`);
          if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
          else if (++tries < 5) setTimeout(seek, 700);
        };
        setTimeout(seek, 900);
      });
    }
  }

  // ── Library rail visibility ───────────────────────────────────────────────
  let railOpen = (() => {
    try { return localStorage.getItem('desktop-rail') !== 'closed'; } catch { return true; }
  })();
  function toggleRail() {
    railOpen = !railOpen;
    try { localStorage.setItem('desktop-rail', railOpen ? 'open' : 'closed'); } catch { /* fine */ }
  }

  // ── Copy Citation ─────────────────────────────────────────────────────────
  // A desktop window has no address bar, so the site's live-hash-as-citation
  // needs a real control. The scroll-spy inside Reader keeps location.hash at
  // the citation of the top visible line; format it properly and copy.
  let toast = '';
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function showToast(msg: string) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 3500);
  }

  function currentCitation(): string | null {
    if (!meta) return null;
    const hash = decodeURIComponent(location.hash.slice(1));
    // Only hashes that are actual citations count (not #ch-… chapter targets).
    const isCite = busse ? /^p?\d+/.test(hash) : (!!parseBekker(hash) || /^\d{3,4}[ab]$/.test(hash));
    if (!hash || !isCite) return null;
    const entry = entryByDataId(workId);
    const authorAbbr = entry?.author && entry.author !== 'aristotle'
      ? `${entry.author.slice(0, 5)}.`   // e.g. Porphyry → Porph.
      : 'Arist.';
    let cite = `${authorAbbr} ${meta.abbr} ${busse ? `p. ${hash.replace(/^p/, '')}` : hash}`;
    // Name the translation unless the reader is in Greek-only view.
    try {
      const view = localStorage.getItem('reader-view');
      const transId = localStorage.getItem(`reader-trans-${workId}`);
      if (view !== 'greek' && transId && transId !== 'compare') {
        const t = visibleTranslations(meta).find(x => x.id === transId);
        if (t) cite += `, trans. ${t.short}`;
      }
    } catch { /* citation without translator is still valid */ }
    return cite;
  }

  async function copyCitation() {
    const cite = currentCitation();
    if (!cite) { showToast('Scroll the text first — no citation at the top yet'); return; }
    try {
      // Packaged app: the OS clipboard via Tauri's plugin (WKWebView can deny
      // navigator.clipboard); browser dev: the web API.
      if ('__TAURI_INTERNALS__' in window) {
        const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
        await writeText(cite);
      } else {
        await navigator.clipboard.writeText(cite);
      }
      showToast(`Copied: ${cite}`);
    } catch {
      showToast('Could not access the clipboard');
    }
  }

  // ── Link interception ─────────────────────────────────────────────────────
  // Reused site components emit real <a href> links (the word popup's lemma
  // link). In a desktop window those would navigate the webview away; catch
  // them until the Lexicon is ported.
  function onGlobalClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest?.('a[href]');
    if (!(a instanceof HTMLAnchorElement)) return;
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#')) return; // in-page: fine
    const lemma = href.match(/\/lemma\/([^/#?]+)/);
    const reader = href.match(/^\/([A-Za-z]+)\/book\/(\d+)(?:\?([^#]*))?(?:#(.*))?$/);
    if (lemma) {
      // The word popup's "Appears N× across Aristotle" link → the Lexicon entry.
      e.preventDefault();
      openLexicon(decodeURIComponent(lemma[1]));
    } else if (reader && getWork(reader[1])) {
      // A reader link (search results, future cross-references): navigate
      // in-app, carrying the jump/highlight params through.
      e.preventDefault();
      const q = new URLSearchParams(reader[3] ?? '');
      searchOpen = false;
      closeLexicon();
      nav(reader[1], Number(reader[2]), {
        ...(q.get('loc') ? { loc: q.get('loc')! } : {}),
        ...(q.get('hlg') ? { hlg: q.get('hlg')! } : {}),
        ...(q.get('hle') ? { hle: q.get('hle')! } : {}),
        ...(reader[4] ? { hash: reader[4] } : {}),
      });
    } else if (!/^https?:/.test(href)) {
      // Any other relative site link (work paths from future reuse): swallow
      // rather than let the webview leave the app.
      e.preventDefault();
    }
  }
</script>

<svelte:window on:click|capture={onGlobalClick} on:keydown|capture={onEsc} />

<div class="dt-shell" class:drag-over={dragOver}
  on:dragover={onDragOver} on:dragleave={onDragLeave} on:drop={onDrop} role="application">
  {#if railOpen}
    <aside class="dt-rail">
      <div class="dt-rail-head">
        <span class="dt-rail-brand">The Aristotle Reader</span>
      </div>
      <div class="dt-rail-ref">
        <button class="dt-lexicon-link" on:click={() => openLexicon()}>
          <span>Greek Lexicon</span>
          <span class="dt-lexicon-arr" aria-hidden="true">→</span>
        </button>
        <button class="dt-lexicon-link" on:click={openImport}>
          <span>Import translation…</span>
          <span class="dt-lexicon-arr" aria-hidden="true">＋</span>
        </button>
      </div>
      <LibraryRail
        currentWork={workId}
        currentBook={bookNum}
        {onOpenWork}
        {onOpenChapter}
      />
    </aside>
  {/if}

  <div class="dt-main" on:mouseup={onReaderMouseUp} role="presentation">
    <header class="page-header dt-topbar">
      <button class="dt-railtoggle" on:click={toggleRail} title={railOpen ? 'Hide library' : 'Show library'} aria-label="Toggle library rail">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <h1>{meta?.title ?? workId}{titleSuffix}</h1>
      <span class="dt-spacer"></span>
      {#if !busse}
        <BekkerJumpDesktop work={workId} onJump={onBekkerJump} />
      {/if}
      <button class="dt-cite" on:click={() => (searchOpen = true)} title="Search the corpus (⌘K)">
        Search
      </button>
      <button class="dt-cite" on:click={copyCitation} title="Copy a citation for the current position">
        Copy citation
      </button>
      <button class="dt-cite" class:dt-on={annOpen} on:click={toggleAnn} title="Show highlights and notes">
        Notes{annotations.length ? ` (${annotations.length})` : ''}
      </button>
      <ThemeToggle />
    </header>

    {#key `${workId}:${bookNum}:${navSeq}`}
      <Reader work={workId} bookNum={bookNum} bookData={null} {chapterTitles} />
    {/key}
  </div>

  {#if annOpen}
    <AnnotationsPanel
      work={workId}
      activeTranslation={annTransShown}
      {annotations}
      onChanged={refreshAnnotations}
      onJump={annJump}
      onClose={toggleAnn}
    />
  {/if}
</div>

{#if selPos}
  <div class="dt-seltool" style="left:{selPos.x}px;top:{selPos.y}px" role="toolbar" aria-label="Annotate selection">
    {#if noteDraft === null}
      <button on:click={() => saveAnnotation('')}>Highlight</button>
      <button on:click={() => (noteDraft = '')}>Note…</button>
    {:else}
      <!-- svelte-ignore a11y_autofocus -->
      <textarea bind:value={noteDraft} rows="3" placeholder="Your note…" autofocus></textarea>
      <div class="dt-seltool-row">
        <button on:click={() => saveAnnotation(noteDraft ?? '')} disabled={!noteDraft?.trim()}>Save note</button>
        <button class="quiet" on:click={() => { noteDraft = null; selPos = null; }}>Cancel</button>
      </div>
    {/if}
  </div>
{/if}

{#if lexicon}
  <div class="dt-lexicon" role="dialog" aria-label="Greek Lexicon">
    <header class="page-header dt-lexicon-bar">
      <h1>Greek Lexicon</h1>
      <span class="dt-spacer"></span>
      <button class="dt-lexicon-close" on:click={closeLexicon} aria-label="Close the Lexicon">✕</button>
    </header>
    <div class="dt-lexicon-body">
      {#if lexicon.slug}
        <LexiconEntry slug={lexicon.slug} onJumpTo={lexiconJump} onBack={() => openLexicon()} />
      {:else}
        <LexiconIndex onOpenEntry={(s) => openLexicon(s)} />
      {/if}
    </div>
  </div>
{/if}

{#if searchOpen}
  <div class="dt-lexicon" role="dialog" aria-label="Search">
    <header class="page-header dt-lexicon-bar">
      <h1>Search</h1>
      <span class="dt-spacer"></span>
      <button class="dt-lexicon-close" on:click={() => (searchOpen = false)} aria-label="Close search">✕</button>
    </header>
    <div class="dt-lexicon-body">
      <Search accentOption={true} />
    </div>
  </div>
{/if}

{#if importDlg}
  <ImportDialog file={importDlg.file} presetWork={workId} onClose={closeImport} />
{/if}

{#if toast}
  <div class="dt-toast" role="status">{toast}</div>
{/if}

{#if dataLayer.host === 'tauri' && !dataLayer.corpusDir}
  <!-- Packaged app with no corpus found on disk AND no dev server data:
       everything will show load errors; say why once, honestly. -->
  <div class="dt-datanote">
    No local corpus directory found — reading data is being served from the dev
    server if available. A packaged build needs a corpus at app-data/corpus or
    bundled resources.
  </div>
{/if}

<style>
  .dt-shell { display: flex; align-items: flex-start; min-height: 100vh; }
  .dt-shell.drag-over { outline: 3px dashed var(--accent); outline-offset: -3px; }

  .dt-rail {
    position: sticky; top: 0;
    width: 290px; flex: none;
    height: 100vh; overflow-y: auto;
    background: var(--page-bg);
    border-right: 1px solid var(--border);
  }
  .dt-rail-head { padding: 0.85rem 1.1rem 0.15rem; }
  .dt-rail-brand {
    font-family: var(--font-ui); font-size: 0.8rem; font-weight: 700;
    letter-spacing: 0.03em; color: var(--text-mid);
  }

  .dt-main { flex: 1; min-width: 0; }

  /* Extends the site's .page-header (sticky, themed) with desktop controls. */
  .dt-topbar { align-items: center; }
  .dt-spacer { flex: 1; }

  .dt-railtoggle {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; flex: none;
    border: 1px solid var(--border); border-radius: 6px;
    background: transparent; color: var(--text-mid); cursor: pointer;
  }
  .dt-railtoggle:hover { color: var(--text); border-color: var(--text-light); }

  .dt-cite {
    font-family: var(--font-ui); font-size: 0.78rem; font-weight: 600;
    color: var(--text-mid); background: transparent;
    border: 1px solid var(--border); border-radius: 6px;
    padding: 0.32rem 0.7rem; cursor: pointer; white-space: nowrap;
  }
  .dt-cite:hover { color: var(--text); border-color: var(--text-light); }

  .dt-rail-ref { padding: 0.5rem 0.6rem 0; }
  .dt-lexicon-link {
    display: flex; justify-content: space-between; align-items: baseline; width: 100%;
    font-family: var(--font-ui); font-size: 0.86rem; font-weight: 600;
    color: var(--text); background: var(--col-bg);
    border: 1px solid var(--border); border-radius: 6px;
    padding: 0.45rem 0.7rem; cursor: pointer;
  }
  .dt-lexicon-link:hover { border-color: var(--accent); color: var(--accent); }
  .dt-lexicon-arr { color: var(--text-light); }
  .dt-lexicon-link:hover .dt-lexicon-arr { color: var(--accent); }

  /* Full-pane overlay with its own scroll: the reader underneath keeps its
     window scroll position untouched while the Lexicon is open. */
  .dt-lexicon {
    position: fixed; inset: 0; z-index: 150;
    display: flex; flex-direction: column;
    background: var(--col-bg);
  }
  .dt-lexicon-bar { position: static; flex: none; display: flex; align-items: center; }
  .dt-lexicon-close {
    font-size: 1rem; color: var(--text-mid); background: transparent;
    border: 1px solid var(--border); border-radius: 6px;
    width: 30px; height: 30px; cursor: pointer;
  }
  .dt-lexicon-close:hover { color: var(--text); border-color: var(--text-light); }
  .dt-lexicon-body { flex: 1; overflow-y: auto; }

  .dt-on { color: var(--accent) !important; border-color: var(--accent) !important; }

  .dt-seltool {
    position: fixed; z-index: 180;
    display: flex; flex-direction: column; gap: 0.35rem;
    background: var(--col-bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.35rem; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
    font-family: var(--font-ui);
  }
  .dt-seltool button {
    font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer;
    color: var(--text); background: transparent;
    border: 1px solid var(--border); border-radius: 6px; padding: 0.3rem 0.7rem;
  }
  .dt-seltool button:hover { border-color: var(--accent); color: var(--accent); }
  .dt-seltool button.quiet { color: var(--text-mid); }
  .dt-seltool button:disabled { opacity: 0.5; }
  .dt-seltool textarea {
    width: 16rem; font-family: var(--font-ui); font-size: 0.82rem;
    color: var(--text); background: var(--page-bg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.5rem;
  }
  .dt-seltool textarea:focus { outline: none; border-color: var(--accent); }
  .dt-seltool-row { display: flex; gap: 0.4rem; }
  .dt-seltool > button { display: block; }

  .dt-toast {
    position: fixed; bottom: 1.2rem; left: 50%; transform: translateX(-50%);
    z-index: 200; max-width: min(80vw, 40rem);
    font-family: var(--font-ui); font-size: 0.82rem;
    color: var(--on-accent); background: var(--accent);
    border-radius: 8px; padding: 0.55rem 1rem;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
  }

  .dt-datanote {
    position: fixed; bottom: 1.2rem; right: 1.2rem; z-index: 190;
    max-width: 22rem; font-family: var(--font-ui); font-size: 0.75rem;
    color: var(--text-mid); background: var(--col-bg);
    border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 0.8rem;
  }
</style>
