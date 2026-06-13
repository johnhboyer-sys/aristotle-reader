<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchBook, type Segment, type GreekLine, type Token } from '../lib/data';
  import WordPopup from './WordPopup.svelte';

  export let bookNum: number = 1;

  let segments: Segment[] = [];
  let loading = true;
  let error = '';

  // A segment renders as one or more blocks split at chapter boundaries.
  // `chapter` is non-null on the block that begins a new chapter (heading shown).
  interface Block { chapter: string | null; lines: GreekLine[]; english: string; }

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
    if (!starts.length) return [{ chapter: null, lines: greek, english: text }];

    const lineIdx = (beforeLine: number) => {
      const i = greek.findIndex(l => l.n >= beforeLine);
      return i === -1 ? greek.length : i;
    };
    const blocks: Block[] = [];
    const firstIdx = lineIdx(starts[0].beforeLine);
    // Lines/English before the first chapter start continue the previous chapter.
    if (firstIdx > 0 || starts[0].engOffset > 0) {
      blocks.push({ chapter: null, lines: greek.slice(0, firstIdx), english: text.slice(0, starts[0].engOffset) });
    }
    for (let i = 0; i < starts.length; i++) {
      const from = lineIdx(starts[i].beforeLine);
      const to = i + 1 < starts.length ? lineIdx(starts[i + 1].beforeLine) : greek.length;
      const engTo = i + 1 < starts.length ? starts[i + 1].engOffset : text.length;
      blocks.push({ chapter: starts[i].chapter, lines: greek.slice(from, to), english: text.slice(starts[i].engOffset, engTo) });
    }
    return blocks;
  }

  // Active popup state
  let popup: { token: Token; anchor: { x: number; y: number } } | null = null;

  onMount(async () => {
    try {
      const data = await fetchBook(bookNum);
      segments = data.segments;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
      // After Svelte renders the segments, scroll to the URL hash if present
      // (browser already tried when the page loaded but the elements didn't exist yet)
      const hash = window.location.hash.slice(1);
      if (hash) {
        // Use a microtask delay so Svelte finishes its DOM updates first
        setTimeout(() => {
          document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 0);
      }
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
            </div>
          {/if}
          <div class="seg-row">
            <!-- Greek column -->
            <div class="greek-col">
              {#each block.lines as line}
                <div class="greek-line">
                  <span class="line-num">{showLineNum(line.n)}</span>
                  <span class="line-text">{#each lineParts(line) as part}{#if part.tok}<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions --><span
                        class="tok"
                        class:active={popup?.token === part.tok}
                        on:click={(e) => handleTokenClick(e, part.tok)}
                      >{part.text}</span>{:else}{part.text}{/if}{/each}</span>
                </div>
              {/each}
            </div>

            <!-- English column -->
            <div class="english-col">
              {#if block.english}
                <p>{block.english}</p>
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
