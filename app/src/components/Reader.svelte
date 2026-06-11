<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchBook, type Segment, type Token } from '../lib/data';
  import WordPopup from './WordPopup.svelte';

  export let bookNum: number = 1;

  let segments: Segment[] = [];
  let loading = true;
  let error = '';

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
      <div class="segment">
        <div class="seg-ref">
          {seg.column}
        </div>

        <!-- Greek column -->
        <div class="greek-col">
          {#each seg.greek as line}
            <div class="greek-line">
              <span class="line-num">{showLineNum(line.n)}</span>
              <span class="line-text">
                {#each line.tokens as tok}
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <span
                    class="tok"
                    class:active={popup?.token === tok}
                    on:click={(e) => handleTokenClick(e, tok)}
                  >{tok.t}</span>
                {/each}
              </span>
            </div>
          {/each}
        </div>

        <!-- English column -->
        <div class="english-col">
          {#if seg.english}
            <p>{seg.english.text}</p>
          {/if}
        </div>
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
