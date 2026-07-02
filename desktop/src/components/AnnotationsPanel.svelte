<script lang="ts">
  // The Annotations panel — the right rail's resting tab: every highlight and
  // note for the current work, filterable (All / Highlights / Notes). One
  // data type underneath; the filter is presentation only.
  //
  // Layer rule: greek/both annotations always show at full strength; an
  // annotation made on a different translation's wording is DIMMED (visible,
  // labelled), never silently hidden — a highlight on Ostwald's phrasing must
  // not masquerade as a highlight on Rackham's.
  import {
    annotationLabel, deleteAnnotation, updateAnnotation, type Annotation,
  } from '../lib/annotations';

  export let work: string;
  export let activeTranslation: string;
  export let annotations: Annotation[] = [];
  export let onChanged: () => void;         // persist happened → repaint/reload
  export let onJump: (a: Annotation) => void;
  export let onClose: () => void;

  type Filter = 'all' | 'highlights' | 'notes';
  let filter: Filter = 'all';
  let editing: string | null = null;
  let editText = '';

  $: shown = annotations.filter(a =>
    filter === 'all' ? true : filter === 'notes' ? a.body !== '' : a.body === '');

  const dimmed = (a: Annotation): boolean =>
    a.layer.startsWith('translation:') && a.layer !== `translation:${activeTranslation}`;

  function startEdit(a: Annotation) {
    editing = a.id;
    editText = a.body;
  }
  async function saveEdit(a: Annotation) {
    await updateAnnotation(work, a.id, editText.trim());
    editing = null;
    onChanged();
  }
  async function remove(a: Annotation) {
    await deleteAnnotation(work, a.id);
    onChanged();
  }
</script>

<aside class="ann-panel" aria-label="Annotations">
  <div class="ann-head">
    <span class="ann-title">Annotations</span>
    <span class="ann-spacer"></span>
    <button class="ann-close" on:click={onClose} aria-label="Close annotations">✕</button>
  </div>
  <div class="ann-filter" role="radiogroup" aria-label="Filter annotations">
    {#each [['all', 'All'], ['highlights', 'Highlights'], ['notes', 'Notes']] as [v, l]}
      <button class:on={filter === v} on:click={() => (filter = v)}>{l}</button>
    {/each}
  </div>

  {#if shown.length === 0}
    <p class="ann-empty">
      {annotations.length === 0
        ? 'Nothing here yet — select text in the reader to highlight it or attach a note.'
        : 'No entries match this filter.'}
    </p>
  {:else}
    <ul class="ann-list">
      {#each shown as a (a.id)}
        <li class:dim={dimmed(a)}>
          <button class="ann-cite" on:click={() => onJump(a)} title="Jump to this passage">
            {annotationLabel(a)}
          </button>
          {#if dimmed(a)}
            <span class="ann-layer">on {a.target.kind === 'english' ? a.target.translation : a.layer}</span>
          {/if}
          <blockquote class="ann-quote">{a.exact.length > 160 ? a.exact.slice(0, 160) + '…' : a.exact}</blockquote>
          {#if editing === a.id}
            <!-- svelte-ignore a11y_autofocus -->
            <textarea class="ann-edit" bind:value={editText} rows="3" autofocus></textarea>
            <div class="ann-row">
              <button class="ann-act" on:click={() => saveEdit(a)}>Save</button>
              <button class="ann-act quiet" on:click={() => (editing = null)}>Cancel</button>
            </div>
          {:else}
            {#if a.body}
              <p class="ann-body">{a.body}</p>
            {/if}
            <div class="ann-row">
              <button class="ann-act" on:click={() => startEdit(a)}>{a.body ? 'Edit note' : 'Add note'}</button>
              <button class="ann-act quiet" on:click={() => remove(a)}>Delete</button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .ann-panel {
    position: sticky; top: 0;
    width: 300px; flex: none;
    height: 100vh; overflow-y: auto;
    background: var(--page-bg);
    border-left: 1px solid var(--border);
    font-family: var(--font-ui);
    padding: 0.75rem 0.9rem 2rem;
    box-sizing: border-box;
  }
  .ann-head { display: flex; align-items: center; margin-bottom: 0.6rem; }
  .ann-title { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.03em; color: var(--text-mid); }
  .ann-spacer { flex: 1; }
  .ann-close {
    width: 26px; height: 26px; border: 1px solid var(--border); border-radius: 6px;
    background: transparent; color: var(--text-mid); cursor: pointer;
  }
  .ann-close:hover { color: var(--text); }

  .ann-filter { display: flex; gap: 0.3rem; margin-bottom: 0.8rem; }
  .ann-filter button {
    font: inherit; font-size: 0.74rem; font-weight: 600;
    color: var(--text-mid); background: transparent; cursor: pointer;
    border: 1px solid var(--border); border-radius: 999px; padding: 0.18rem 0.7rem;
  }
  .ann-filter button.on { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }

  .ann-empty { font-size: 0.82rem; color: var(--text-mid); line-height: 1.55; }

  .ann-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.9rem; }
  .ann-list li { border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 0.7rem; }
  .ann-list li.dim { opacity: 0.55; }
  .ann-cite {
    font: inherit; font-size: 0.78rem; font-weight: 700; font-variant-numeric: tabular-nums;
    color: var(--accent); background: none; border: none; padding: 0; cursor: pointer;
  }
  .ann-cite:hover { text-decoration: underline; }
  .ann-layer { font-size: 0.7rem; color: var(--text-light); margin-left: 0.4rem; }
  .ann-quote {
    margin: 0.35rem 0; padding: 0 0 0 0.6rem; border-left: 2px solid var(--border);
    font-family: var(--font-english); font-size: 0.85rem; line-height: 1.5; color: var(--text-mid);
  }
  .ann-body { font-size: 0.83rem; line-height: 1.5; margin: 0.35rem 0; color: var(--text); }
  .ann-edit {
    width: 100%; box-sizing: border-box; font: inherit; font-size: 0.83rem;
    color: var(--text); background: var(--col-bg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.5rem;
  }
  .ann-edit:focus { outline: none; border-color: var(--accent); }
  .ann-row { display: flex; gap: 0.5rem; margin-top: 0.35rem; }
  .ann-act {
    font: inherit; font-size: 0.74rem; font-weight: 600; cursor: pointer;
    color: var(--accent); background: none; border: none; padding: 0;
  }
  .ann-act.quiet { color: var(--text-light); }
  .ann-act:hover { text-decoration: underline; }
</style>
