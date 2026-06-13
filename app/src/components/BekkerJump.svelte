<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fetchColumns, parseBekker, resolveBekker, type ColumnRef } from '../lib/data';

  let open = false;
  let value = '';
  let error = '';
  let columns: Record<string, ColumnRef[]> | null = null;
  let inputEl: HTMLInputElement | undefined;

  // Preload the column index so the first lookup is instant.
  onMount(() => { fetchColumns().then(c => (columns = c)).catch(() => {}); });

  async function openBox() {
    open = true;
    error = '';
    await tick();
    inputEl?.focus();
  }

  function closeBox() {
    open = false;
    error = '';
    value = '';
  }

  async function go() {
    error = '';
    const ref = parseBekker(value);
    if (!ref) {
      error = 'Enter a Bekker citation, e.g. 1097a15';
      return;
    }
    const cols = columns ?? (await fetchColumns().catch(() => null));
    if (!cols) { error = 'Could not load the index — try again'; return; }
    const book = resolveBekker(cols, ref.column, ref.line);
    if (book == null) {
      error = `${ref.column} is not in the Nicomachean Ethics`;
      return;
    }
    // Same-tab navigation; the reader snaps to the nearest line if exact is absent.
    window.location.href = `/book/${book}?loc=${ref.column}:${ref.line}`;
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
    <label class="bekker-label" for="bekker-input">Bekker line</label>
    <input
      id="bekker-input"
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
