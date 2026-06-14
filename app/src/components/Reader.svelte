<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { fetchBook, parseBekker, type Segment, type GreekLine, type Token } from '../lib/data';
  import { greekFold } from '../lib/search';
  import WordPopup from './WordPopup.svelte';

  export let bookNum: number = 1;

  let segments: Segment[] = [];
  let loading = true;
  let error = '';

  // Search jump-in: highlight query terms + scroll to a line (?hlg=&hle=&loc=).
  let hlGrkFolds: string[] = [];
  let hlEngTerms: string[] = [];
  let targetId: string | null = null;

  // Reading view: bilingual (default), Greek only, or English only. Persisted
  // per reader in localStorage; a citation/search jump forces 'both' so the
  // targeted Greek line is visible.
  // Which English translation fills the English column. Rackham (Loeb, TEI,
  // Bekker-anchored per line), Ross (MIT, chapter-anchored prose), or 'compare'
  // = both side by side (three columns with Greek). Persisted.
  type Trans = 'rackham' | 'ross' | 'compare';
  let trans: Trans = 'rackham';
  function setTrans(t: Trans) {
    trans = t;
    try { localStorage.setItem('ne-trans', t); } catch {}
  }

  type View = 'both' | 'greek' | 'english';
  let view: View = 'both';
  async function setView(v: View) {
    view = v;
    try { localStorage.setItem('ne-view', v); } catch {}
    // The tracked anchors differ by view (Greek lines vs. whole columns), so
    // rebuild the scroll-spy once the DOM reflects the new view.
    await tick();
    if (spyArmed) setupScrollSpy();
  }

  // ── Live URL tracking (aquinas.cc style) ─────────────────────────────────
  // As the reader scrolls, rewrite the location hash to the Bekker citation at
  // the top of the reading area, so any position is a citable link. Line-level
  // when the Greek column is visible (our lineation is canonical Bekker);
  // column-level in English-only view (its line numbers are interpolated
  // estimates). history.replaceState keeps this out of back-history and avoids
  // jumping the scroll. We arm the spy only on the first user scroll so an
  // opened #citation link isn't overwritten before the reader actually moves.
  let spyObserver: IntersectionObserver | null = null;
  let spyState = new Map<Element, number | null>();
  let spyArmed = false;
  let lastCite = '';
  let suppressArmUntil = 0;   // ignore scroll-events from our own programmatic scrolls
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;

  function citeOf(el: Element): string | null {
    const lm = el.id.match(/^L(.+)-(\d+)$/);   // greek line: L{col}-{n} → {col}{n}
    if (lm) return `${lm[1]}${lm[2]}`;
    const cm = el.id.match(/^col-(.+)$/);       // segment: col-{column} → {column}
    return cm ? cm[1] : null;
  }

  function updateHash(cite: string | null) {
    if (!cite || cite === lastCite) return;
    lastCite = cite;
    try { history.replaceState(history.state, '', `#${cite}`); } catch {}
  }

  function setupScrollSpy() {
    spyObserver?.disconnect();
    spyState = new Map();
    const greekVisible = view === 'greek' || view === 'both';
    const els = Array.from(document.querySelectorAll(greekVisible ? '.greek-line[id]' : '.segment[id]'));
    if (!els.length) return;
    const headerH = Math.round(document.querySelector('.page-header')?.getBoundingClientRect().height ?? 60);
    // Detection band: a strip just below the sticky header. The intersecting
    // anchor highest on screen is the line currently at the top of the reading area.
    spyObserver = new IntersectionObserver((entries) => {
      for (const e of entries) spyState.set(e.target, e.isIntersecting ? e.boundingClientRect.top : null);
      let best: Element | null = null;
      let bestTop = Infinity;
      for (const [el, top] of spyState) {
        if (top != null && top < bestTop) { bestTop = top; best = el; }
      }
      if (best) updateHash(citeOf(best));
    }, { rootMargin: `-${headerH + 8}px 0px -82% 0px`, threshold: 0 });
    els.forEach((el) => spyObserver!.observe(el));
  }

  // Arm on the first genuine user scroll. Scroll events from our own
  // programmatic jumps (citation/search) fall inside the suppression window and
  // are ignored, so an opened #citation stays put until the reader moves.
  function onScrollArm() {
    if (Date.now() < suppressArmUntil) return;
    window.removeEventListener('scroll', onScrollArm);
    spyArmed = true;
    setupScrollSpy();
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (spyArmed) setupScrollSpy(); }, 200);
  }

  // Open at a Bekker citation from the URL hash: the exact Greek line if it's
  // present and visible, otherwise the owning column. Instant (no animation) so
  // it doesn't stream scroll-events, and suppressed so it doesn't self-arm.
  function scrollToCitation(column: string, line: number) {
    suppressArmUntil = Date.now() + 800;
    const lineEl = document.getElementById(`L${column}-${line}`);
    if (lineEl && (lineEl as HTMLElement).offsetParent !== null) {
      lineEl.scrollIntoView({ behavior: 'auto', block: 'center' });
    } else {
      document.getElementById(`col-${column}`)?.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }

  onDestroy(() => {
    spyObserver?.disconnect();
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', onScrollArm);
      window.removeEventListener('resize', onResize);
    }
  });

  function isHit(surface: string): boolean {
    if (!hlGrkFolds.length) return false;
    const f = greekFold(surface);
    return f.length > 0 && hlGrkFolds.some(q => f.startsWith(q));
  }
  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function highlightEng(text: string): string {
    if (!hlEngTerms.length) return esc(text);
    let out = esc(text);
    for (const t of hlEngTerms) {
      const clean = t.replace(/[^a-z'*]/gi, '').replace(/\*+$/, '');
      if (!clean) continue;
      out = out.replace(new RegExp(`\\b(${clean}\\w*)\\b`, 'gi'), '<mark>$1</mark>');
    }
    return out;
  }

  // A segment renders as one or more blocks split at chapter boundaries.
  // `chapter` is non-null on the block that begins a new chapter (heading shown).
  // `rows` lay the English prose out beside its Bekker-line gutter (see below).
  // A GreekLine may be a partial slice of a real line (cont = its tail half,
  // after a mid-line chapter split): it suppresses the repeated line number/id.
  type RLine = GreekLine & { cont?: boolean };
  interface EngRow { n: number | null; real: boolean; text: string; }
  interface Block { chapter: string | null; bekker: string; lines: RLine[]; rows: EngRow[]; rossRows: EngRow[]; }

  // The char position where token `w` begins in a line's text (0 at the start,
  // text.length at/after the end), so a cut preserves the verbatim
  // punctuation/sigla between words on the correct side.
  function tokenPos(line: GreekLine, w: number): number {
    if (w <= 0) return 0;
    if (w >= line.tokens.length) return line.text.length;
    let ptr = 0;
    for (let i = 0; i < w; i++) {
      const idx = line.text.indexOf(line.tokens[i].t, ptr);
      if (idx >= 0) ptr = idx + line.tokens[i].t.length;
    }
    const cut = line.text.indexOf(line.tokens[w].t, ptr);
    return cut >= 0 ? cut : ptr;
  }

  // The sub-line covering tokens [fromW, toW) — used to split a Greek line at a
  // chapter boundary that falls mid-line (most chapters start mid-line). A
  // partial tail (fromW>0) is marked `cont` so the line number/id isn't repeated.
  function lineSlice(line: GreekLine, fromW: number, toW: number): RLine {
    fromW = Math.max(0, fromW);
    toW = Math.min(line.tokens.length, toW);
    if (fromW === 0 && toW === line.tokens.length) return line;
    let text = line.text.slice(tokenPos(line, fromW), tokenPos(line, toW));
    if (fromW > 0) text = text.replace(/^\s+/, '');
    if (toW < line.tokens.length) text = text.replace(/\s+$/, '');
    return { n: line.n, text, tokens: line.tokens.slice(fromW, toW), cont: fromW > 0 };
  }

  // The gutter renders each tick as its own block row, so a row boundary forces
  // a visual line break. To avoid splitting a sentence (which happens when an
  // estimated tick lands mid-sentence), snap every tick to the nearest sentence
  // boundary in the slice, then drop ticks that collapse onto an earlier row.
  // Numbers stay as approximate margin references; breaks fall only at sentence
  // ends. Boundaries are positions after . ? ! (optionally a closing quote) + space.
  function snapTicksToSentences(
    text: string,
    ticks: { n: number; real: boolean; off: number }[],
  ): { n: number; real: boolean; off: number }[] {
    if (!ticks.length) return ticks;
    const bounds = [0];
    const re = /[.?!]["'”’)\]]?\s+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) bounds.push(m.index + m[0].length);
    bounds.push(text.length);
    const nearest = (off: number) => {
      let best = bounds[0], bestD = Infinity;
      for (const b of bounds) { const d = Math.abs(b - off); if (d < bestD) { bestD = d; best = b; } }
      return best;
    };
    const out: { n: number; real: boolean; off: number }[] = [];
    let lastOff = -1;
    for (const t of ticks) {
      const off = nearest(t.off);
      if (off <= lastOff) continue; // collapsed into a row already begun — drop
      out.push({ ...t, off });
      lastOff = off;
    }
    return out;
  }

  // Break an English slice into gutter rows at its Bekker ticks. Each row is the
  // prose from one tick to the next, labelled with that tick's Bekker line; a
  // leading numberless row holds any text before the first tick.
  function buildRows(text: string, ticks: { n: number; real: boolean; off: number }[]): EngRow[] {
    if (!ticks.length) return text ? [{ n: null, real: false, text }] : [];
    const rows: EngRow[] = [];
    if (ticks[0].off > 0) rows.push({ n: null, real: false, text: text.slice(0, ticks[0].off) });
    for (let i = 0; i < ticks.length; i++) {
      const off = Math.max(0, Math.min(ticks[i].off, text.length));
      const end = i + 1 < ticks.length ? Math.max(0, Math.min(ticks[i + 1].off, text.length)) : text.length;
      rows.push({ n: ticks[i].n, real: ticks[i].real, text: text.slice(off, end) });
    }
    return rows;
  }

  // Split a line into clickable words and the verbatim text between them.
  // The tokens hold bare words (for the popup lookup); the line `text` keeps
  // the original punctuation AND the OCT editorial sigla ( ) [ ] < > † " — so
  // we locate each word in `text` and render the gaps (sigla/punctuation) as
  // plain, non-clickable text, preserving the critical edition faithfully.
  interface LinePart { text: string; tok: Token | null; }
  function lineParts(line: GreekLine): LinePart[] {
    const parts: LinePart[] = [];
    const text = line.text;
    let ptr = 0;
    for (const tok of line.tokens) {
      const i = text.indexOf(tok.t, ptr);
      if (i < 0) {            // shouldn't happen; keep the word clickable anyway
        parts.push({ text: tok.t, tok });
        continue;
      }
      if (i > ptr) parts.push({ text: text.slice(ptr, i), tok: null });
      parts.push({ text: tok.t, tok });
      ptr = i + tok.t.length;
    }
    if (ptr < text.length) parts.push({ text: text.slice(ptr), tok: null });
    return parts;
  }

  function splitSegment(seg: Segment): Block[] {
    const greek = seg.greek;
    const text = seg.english?.text ?? '';
    const allTicks = seg.english?.bekker ?? [];
    // English rows for the slice [a, b), with Bekker ticks rebased into it.
    const rowsFor = (a: number, b: number): EngRow[] => {
      const slice = text.slice(a, b);
      const ticks = allTicks
        .filter(t => t.offset >= a && t.offset < b)
        .map(t => ({ n: t.n, real: t.real, off: t.offset - a }))
        .sort((x, y) => x.off - y.off);
      return buildRows(slice, snapTicksToSentences(slice, ticks));
    };
    // Ross slices for this column, paired to blocks: the continuation slice
    // (a chapter begun in an earlier column) and one per chapter that starts
    // here. Each slice lays out as gutter rows like Rackham, with its
    // interpolated Bekker ticks (snapped to sentences so prose stays continuous).
    const rossPieces = seg.ross ?? [];
    const rossRowsOf = (p: typeof rossPieces[number] | undefined): EngRow[] => {
      if (!p || !p.text) return [];
      const ticks = (p.bekker ?? []).map(t => ({ n: t.n, real: t.real, off: t.offset }));
      return buildRows(p.text, snapTicksToSentences(p.text, ticks));
    };
    const rossCont = () => rossRowsOf(rossPieces.find(p => p.cont) ?? rossPieces[0]);
    const rossFor = (chapter: string) => rossRowsOf(rossPieces.find(p => !p.cont && p.chapter === chapter));

    const starts = (seg.chapterStarts ?? []).slice()
      .sort((a, b) => a.beforeLine - b.beforeLine || (a.wordIndex || 0) - (b.wordIndex || 0));
    if (!starts.length) return [{ chapter: null, bekker: '', lines: greek, rows: rowsFor(0, text.length), rossRows: rossCont() }];

    const lineIdx = (beforeLine: number) => {
      const i = greek.findIndex(l => l.n >= beforeLine);
      return i === -1 ? greek.length : i;
    };
    // Each chapter boundary is a cut at (line index, word index within the line).
    const bounds = starts.map(s => ({
      chapter: s.chapter, bekker: s.bekker, engOffset: s.engOffset,
      idx: lineIdx(s.beforeLine), word: s.wordIndex || 0,
    }));

    // The Greek lines spanning a block from cut (idxA,wA) to cut (idxB,wB),
    // splitting the boundary lines mid-line where wA/wB > 0.
    const linesFor = (idxA: number, wA: number, idxB: number, wB: number): RLine[] => {
      if (idxA >= greek.length) return [];
      if (idxA === idxB) {                       // block lies within one line
        const sl = lineSlice(greek[idxA], wA, wB);
        return sl.tokens.length || sl.text.trim() ? [sl] : [];
      }
      const res: RLine[] = [];
      for (let i = idxA; i < idxB && i < greek.length; i++) {
        res.push(i === idxA && wA > 0 ? lineSlice(greek[i], wA, greek[i].tokens.length) : greek[i]);
      }
      if (wB > 0 && idxB < greek.length) res.push(lineSlice(greek[idxB], 0, wB));
      return res;
    };

    const blocks: Block[] = [];
    const first = bounds[0];
    // Lines/English before the first chapter start continue the previous chapter.
    if (first.idx > 0 || first.word > 0 || starts[0].engOffset > 0) {
      blocks.push({
        chapter: null, bekker: '',
        lines: linesFor(0, 0, first.idx, first.word),
        rows: rowsFor(0, starts[0].engOffset), rossRows: rossCont(),
      });
    }
    for (let i = 0; i < bounds.length; i++) {
      const b = bounds[i];
      const next = bounds[i + 1];
      const engTo = next ? next.engOffset : text.length;
      blocks.push({
        chapter: b.chapter, bekker: b.bekker,
        lines: linesFor(b.idx, b.word, next ? next.idx : greek.length, next ? next.word : 0),
        rows: rowsFor(b.engOffset, engTo), rossRows: rossFor(b.chapter),
      });
    }
    return blocks;
  }

  // Active popup state
  let popup: { token: Token; anchor: { x: number; y: number } } | null = null;

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    hlGrkFolds = (params.get('hlg') ?? '').trim().split(/\s+/).filter(Boolean)
      .map(t => greekFold(t.replace(/\*/g, ''))).filter(Boolean);
    hlEngTerms = (params.get('hle') ?? '').trim().split(/\s+/).filter(Boolean);
    const loc = params.get('loc');
    let locCol = '';
    let locLine = NaN;
    if (loc) {
      const [col, ln] = loc.split(':');
      locCol = col;
      locLine = Number(ln);
      targetId = `L${col}-${ln}`;
    }
    // Restore saved view, but a jump-in (loc/highlight) forces bilingual so the
    // target Greek line is on screen.
    if (loc || hlGrkFolds.length) {
      view = 'both';
    } else {
      const saved = (() => { try { return localStorage.getItem('ne-view'); } catch { return null; } })();
      if (saved === 'greek' || saved === 'english' || saved === 'both') view = saved;
      // No saved choice: a phone defaults to English only (the bilingual columns
      // are cramped on a narrow screen); desktop stays bilingual. The toggle —
      // and any saved choice — overrides this on either.
      else if (window.matchMedia('(max-width: 680px)').matches) view = 'english';
    }
    const savedTrans = (() => { try { return localStorage.getItem('ne-trans'); } catch { return null; } })();
    if (savedTrans === 'rackham' || savedTrans === 'ross' || savedTrans === 'compare') trans = savedTrans;
    try {
      const data = await fetchBook(bookNum);
      segments = data.segments;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
      // After Svelte renders, scroll to the jumped-to line (loc), a Bekker
      // citation in the hash, or a plain element-id hash.
      const hash = window.location.hash.slice(1);
      setTimeout(() => {
        if (targetId) {
          let el = document.getElementById(targetId);
          // Snap to the nearest existing line in the column if the exact
          // citation line isn't a Greek line break (e.g. mid-line citations).
          if (!el && locCol && !Number.isNaN(locLine)) {
            const seg = document.getElementById(`col-${locCol}`);
            let best: Element | null = null;
            let bestDist = Infinity;
            seg?.querySelectorAll('.greek-line').forEach((node) => {
              const m = node.id.match(/-(\d+)$/);
              if (!m) return;
              const d = Math.abs(Number(m[1]) - locLine);
              if (d < bestDist) { bestDist = d; best = node; }
            });
            if (best) { el = best as HTMLElement; targetId = (best as HTMLElement).id; }
          }
          if (el) { suppressArmUntil = Date.now() + 1500; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        } else if (hash) {
          const ref = parseBekker(hash);
          if (ref) {
            scrollToCitation(ref.column, ref.line);
            lastCite = `${ref.column}${ref.line}`;
            // Tint the cited line so a shared link makes the passage obvious.
            targetId = `L${ref.column}-${ref.line}`;
          } else {
            document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
        // Begin live URL tracking once the reader actually scrolls (programmatic
        // jumps above are suppressed), so an opened #citation isn't overwritten.
        window.addEventListener('scroll', onScrollArm, { passive: true });
        window.addEventListener('resize', onResize);
      }, 0);
    }
  });

  function handleTokenClick(e: MouseEvent, token: Token) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    popup = {
      token,
      anchor: { x: rect.left, y: rect.bottom },
    };
  }

  function closePopup() {
    popup = null;
  }

  // Show line number only for multiples of 5 (and line 1)
  function showLineNum(n: number): string {
    if (n === 1 || n % 5 === 0) return String(n);
    return '';
  }
</script>

{#if loading}
  <p style="padding:2rem;font-family:system-ui;color:#888">Loading Book {bookNum}…</p>
{:else if error}
  <p style="padding:2rem;color:red">{error}</p>
{:else}
  <div class="reader-body view-{view} trans-{trans}" role="main">
    <div class="reader-controls">
      {#if view !== 'greek'}
        <label class="trans-picker">
          <span class="trans-label">Translation</span>
          <select bind:value={trans} on:change={() => setTrans(trans)} aria-label="English translation">
            <option value="rackham">Rackham (Loeb)</option>
            <option value="ross">Ross (Oxford)</option>
            <option value="compare">Compare both</option>
          </select>
        </label>
      {/if}
      <div class="view-toggle" role="group" aria-label="Reading view">
        <button class:active={view === 'greek'} aria-pressed={view === 'greek'} on:click={() => setView('greek')}>Greek</button>
        <button class:active={view === 'both'} aria-pressed={view === 'both'} on:click={() => setView('both')}>Both</button>
        <button class:active={view === 'english'} aria-pressed={view === 'english'} on:click={() => setView('english')}>English</button>
      </div>
    </div>
    {#each segments as seg (seg.id)}
      <div class="segment" id="col-{seg.column}">
        <div class="seg-ref">
          {seg.column}
        </div>

        {#each splitSegment(seg) as block}
          {#if block.chapter}
            <div class="chapter-head" id="ch-{bookNum}-{block.chapter}">
              <span class="chapter-label">Chapter {block.chapter}</span>
              {#if block.bekker}<span class="chapter-bekker">({block.bekker})</span>{/if}
            </div>
          {/if}
          <div class="seg-row">
            <!-- Greek column -->
            <div class="greek-col">
              {#each block.lines as line}
                <div class="greek-line" id={line.cont ? `L${seg.column}-${line.n}-c` : `L${seg.column}-${line.n}`} class:target={!line.cont && targetId === `L${seg.column}-${line.n}`}>
                  <span class="line-num">{line.cont ? '' : showLineNum(line.n)}</span>
                  <span class="line-text">{#each lineParts(line) as part}{#if part.tok}<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions --><span
                        class="tok"
                        class:active={popup?.token === part.tok}
                        class:hit={isHit(part.text)}
                        on:click={(e) => handleTokenClick(e, part.tok)}
                      >{part.text}</span>{:else}{part.text}{/if}{/each}</span>
                </div>
              {/each}
            </div>

            <!-- English column: prose laid out beside its Bekker-line gutter.
                 Real anchors (column start / ~line 20) are full weight; estimated
                 ticks are lighter/italic. -->
            <!-- English column: Ross alone when selected, else Rackham (also the
                 left English column in Compare). -->
            <div class="english-col">
              {#if trans === 'ross'}
                {#if block.rossRows.length}
                  <!-- Ross with an interpolated Bekker gutter (all estimates). -->
                  <div class="english-text">
                    {#each block.rossRows as row}
                      <span class="eng-num" class:approx={row.n !== null && !row.real}>{row.n ?? ''}</span>
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                      <div class="eng-seg">{@html highlightEng(row.text)}</div>
                    {/each}
                  </div>
                {/if}
              {:else}
                {#if trans === 'compare'}<div class="col-label">Rackham</div>{/if}
                {#if block.rows.length}
                  <div class="english-text">
                    {#each block.rows as row}
                      <span class="eng-num" class:approx={row.n !== null && !row.real}>{row.n ?? ''}</span>
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                      <div class="eng-seg">{@html highlightEng(row.text)}</div>
                    {/each}
                  </div>
                {/if}
              {/if}
            </div>

            <!-- Third column: Ross beside Rackham in Compare (hidden in Greek-only). -->
            {#if trans === 'compare' && view !== 'greek'}
              <div class="ross-col">
                <div class="col-label">Ross</div>
                {#if block.rossRows.length}
                  <div class="english-text">
                    {#each block.rossRows as row}
                      <span class="eng-num" class:approx={row.n !== null && !row.real}>{row.n ?? ''}</span>
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                      <div class="eng-seg">{@html highlightEng(row.text)}</div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/if}

{#if popup}
  <WordPopup
    token={popup.token}
    anchor={popup.anchor}
    onClose={closePopup}
  />
{/if}
