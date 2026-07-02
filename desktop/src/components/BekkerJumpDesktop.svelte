<script lang="ts">
  // Desktop variant of the site's BekkerJump: identical parse/resolve logic
  // (reused from data.ts), but navigation is a callback into the shell — a
  // desktop window has no URL routing to navigate with.
  import { onMount, tick } from 'svelte';
  import { fetchColumns, parseBekker, resolveBekker, type ColumnRef } from '../../../app/src/lib/data';
  import { getWork } from '../../../app/src/lib/works';

  export let work: string;
  export let onJump: (book: number, column: string, line: number) => void;

  $: workMeta = getWork(work);

  let open = false;
  let value = '';
  let error = '';
  let columns: Record<string, ColumnRef[]> | null = null;
  let inputEl: HTMLInputElement | undefined;

  onMount(() => { preload(); });
  $: if (work) preload();
  function preload() {
    columns = null;
    fetchColumns(work).then(c => (columns = c)).catch(() => {});
  }

  async function openBox() {
    open = true; error = '';
    await tick();
    inputEl?.focus();
  }
  function closeBox() { open = false; error = ''; value = ''; }

  async function go() {
    error = '';
    const ref = parseBekker(value);
    if (!ref) { error = 'Enter a Bekker citation, e.g. 1097a15'; return; }
    const cols = columns ?? (await fetchColumns(work).catch(() => null));
    if (!cols) { error = 'Could not load the index — try again'; return; }
    const book = resolveBekker(cols, ref.column, ref.line);
    if (book == null) { error = `${ref.column} is not in the ${workMeta?.title ?? 'text'}`; return; }
    closeBox();
    onJump(book, ref.column, ref.line);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); closeBox(); }
  }
</script>

{#if !open}
  <button class="bekker-toggle" on:click={openBox} title="Look up a Bekker citation">
    Go to Bekker line
  </button>
{:else}
  <form class="bekker-jump" on:submit|preventDefault={go} role="search">
    <input
      type="text"
      bind:this={inputEl}
      bind:value
      on:keydown={onKey}
      on:input={() => (error = '')}
      placeholder="e.g. 1097a15"
      aria-label="Jump to a Bekker citation"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
    />
    <button type="submit">Go</button>
    <button type="button" class="bekker-close" on:click={closeBox} aria-label="Close">✕</button>
    {#if error}<span class="bekker-err" role="alert">{error}</span>{/if}
  </form>
{/if}
