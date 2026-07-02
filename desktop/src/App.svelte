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
  const dataRoot = () =>
    (globalThis as { __ARISTOTLE_DATA_ROOT__?: string }).__ARISTOTLE_DATA_ROOT__ ?? '/data';
  let chapterTitles: Record<string, string> = {};
  let titlesFor = '';
  $: if (`${workId}:${bookNum}` !== titlesFor) {
    titlesFor = `${workId}:${bookNum}`;
    chapterTitles = {};
    fetch(`${dataRoot()}/${workId}/chapter-titles.json`)
      .then(r => (r.ok ? r.json() : {}))
      .then((all: Record<string, Record<string, string>>) => {
        if (titlesFor === `${workId}:${bookNum}`) chapterTitles = all[String(bookNum)] ?? {};
      })
      .catch(() => { /* no titles for this work */ });
  }

  function persistLoc() {
    try { localStorage.setItem('desktop-loc', JSON.stringify({ work: workId, book: bookNum })); } catch { /* fine */ }
  }

  // Set the URL the Reader will parse on mount (?loc= forces bilingual + line
  // scroll; #hash covers chapter targets), then remount it.
  function nav(id: string, book?: number, opts: { loc?: string; hash?: string } = {}) {
    const m = getWork(id);
    if (!m) return;
    let b = book ?? bookNum;
    if (id !== workId && book === undefined) {
      // Entering a work fresh: resume its last-read book if the Reader saved one.
      const savedBook = (() => { try { return localStorage.getItem(`reader-book-${id}`); } catch { return null; } })();
      b = savedBook ? Number(savedBook) : 1;
    }
    b = Math.min(Math.max(1, b), m.books);
    const url = `/${opts.loc ? `?loc=${opts.loc}` : ''}${opts.hash ? `#${opts.hash}` : ''}`;
    try { history.replaceState(null, '', url); } catch { /* tauri origin quirks */ }
    workId = id;
    bookNum = b;
    navSeq += 1;
    persistLoc();
    scrollTo({ top: 0 });
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
    if (href.includes('/lemma/')) {
      e.preventDefault();
      showToast('The Lexicon is not in the desktop app yet');
    } else if (!/^https?:/.test(href)) {
      // Any other relative site link (work paths from future reuse): swallow
      // rather than let the webview leave the app.
      e.preventDefault();
    }
  }
</script>

<svelte:window on:click|capture={onGlobalClick} />

<div class="dt-shell">
  {#if railOpen}
    <aside class="dt-rail">
      <div class="dt-rail-head">
        <span class="dt-rail-brand">The Aristotle Reader</span>
      </div>
      <LibraryRail
        currentWork={workId}
        currentBook={bookNum}
        {onOpenWork}
        {onOpenChapter}
      />
    </aside>
  {/if}

  <div class="dt-main">
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
      <button class="dt-cite" on:click={copyCitation} title="Copy a citation for the current position">
        Copy citation
      </button>
      <ThemeToggle />
    </header>

    {#key `${workId}:${bookNum}:${navSeq}`}
      <Reader work={workId} bookNum={bookNum} bookData={null} {chapterTitles} />
    {/key}
  </div>
</div>

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
