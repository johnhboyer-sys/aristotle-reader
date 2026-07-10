<script lang="ts">
  import { WORKS, WORK_ORDER, workPath } from '@shared/lib/works';
  const SORTED_WORKS = [...WORKS].sort((a, b) =>
    (WORK_ORDER.get(a.id) ?? 999) - (WORK_ORDER.get(b.id) ?? 999)
  );
  // Aristotle's own works vs. the ancient commentators/introductions on him
  // (Porphyry, …). Split so the dropdown can group them with a visible break.
  const ARISTOTLE = SORTED_WORKS.filter(w => w.author === 'Aristotle');
  const COMMENTARIES = SORTED_WORKS.filter(w => w.author !== 'Aristotle');
  // The closed select shows the chosen option's text, so carry the author into
  // the label for non-Aristotle works ("Isagoge (Porphyry)").
  const optLabel = (w: { title: string; author: string }) =>
    w.author === 'Aristotle' ? w.title : `${w.title} (${w.author})`;

  // The work currently open in the reader. Switching navigates to that work,
  // resuming the last book (and Bekker position) read there if known.
  export let work: string = 'EN';
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  function go(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    if (id === work) return;
    let book = '1';
    let loc = '';
    try {
      book = localStorage.getItem(`reader-book-${id}`) || '1';
      loc = localStorage.getItem(`reader-loc-${id}`) || '';
    } catch {}
    window.location.href = `${base}${workPath(id, Number(book))}${loc ? `#${loc}` : ''}`;
  }
</script>

<select class="work-switcher" value={work} on:change={go} aria-label="Choose a work">
  {#if COMMENTARIES.length}
    <optgroup label="Aristotle">
      {#each ARISTOTLE as w}
        <option value={w.id}>{optLabel(w)}</option>
      {/each}
    </optgroup>
    <optgroup label="Commentaries">
      {#each COMMENTARIES as w}
        <option value={w.id}>{optLabel(w)}</option>
      {/each}
    </optgroup>
  {:else}
    {#each ARISTOTLE as w}
      <option value={w.id}>{optLabel(w)}</option>
    {/each}
  {/if}
</select>
