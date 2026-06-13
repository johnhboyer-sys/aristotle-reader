<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchBook, type Segment, type GreekLine, type Token } from '../lib/data';
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
  interface Block { chapter: string | null; bekker: string; lines: GreekLine[]; english: string; }

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
    const starts = (seg.chapterStarts ?? []).slice().sort((a, b) => a.beforeLine - b.beforeLine);
    if (!starts.length) return [{ chapter: null, bekker: '', lines: greek, english: text }];

    const lineIdx = (beforeLine: number) => {
      const i = greek.findIndex(l => l.n >= beforeLine);
      return i === -1 ? greek.length : i;
    };
    const blocks: Block[] = [];
    const firstIdx = lineIdx(starts[0].beforeLine);
    // Lines/English before the first chapter start continue the previous chapter.
    if (firstIdx > 0 || starts[0].engOffset > 0) {
      blocks.push({ chapter: null, bekker: '', lines: greek.slice(0, firstIdx), english: text.slice(0, starts[0].engOffset) });
    }
    for (let i = 0; i < starts.length; i++) {
      const from = lineIdx(starts[i].beforeLine);
      const to = i + 1 < starts.length ? lineIdx(starts[i + 1].beforeLine) : greek.length;
      const engTo = i + 1 < starts.length ? starts[i + 1].engOffset : text.length;
      blocks.push({ chapter: starts[i].chapter, bekker: starts[i].bekker, lines: greek.slice(from, to), english: text.slice(starts[i].engOffset, engTo) });
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
    try {
      const data = await fetchBook(bookNum);
      segments = data.segments;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
      // After Svelte renders, scroll to the jumped-to line (loc) or URL hash.
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
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
        }
        if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  <div class="reader-body" role="main">
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
                <div class="greek-line" id="L{seg.column}-{line.n}" class:target={targetId === `L${seg.column}-${line.n}`}>
                  <span class="line-num">{showLineNum(line.n)}</span>
                  <span class="line-text">{#each lineParts(line) as part}{#if part.tok}<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions --><span
                        class="tok"
                        class:active={popup?.token === part.tok}
                        class:hit={isHit(part.text)}
                        on:click={(e) => handleTokenClick(e, part.tok)}
                      >{part.text}</span>{:else}{part.text}{/if}{/each}</span>
                </div>
              {/each}
            </div>

            <!-- English column -->
            <div class="english-col">
              {#if block.english}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                <p>{@html highlightEng(block.english)}</p>
              {/if}
            </div>
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
