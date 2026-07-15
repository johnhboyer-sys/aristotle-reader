<script lang="ts">
  // Recursive renderer for decoded import-preview English (previewRender.ts):
  // plain text as-is, `{grc:…}` in the Greek font, a footnote anchor as its
  // phrase followed by a superscript id. Recurses into the footnote phrase so a
  // nested `{^id:{grc:…}}` renders as Greek + a superscript. No {@html} — every
  // segment is real markup, so the user's imported text can't inject HTML.
  import type { PreviewSeg } from '../lib/import/previewRender';
  import Self from './PreviewText.svelte';

  let { segs }: { segs: PreviewSeg[] } = $props();
</script>

{#each segs as seg, i (i)}{#if seg.kind === 'text'}{seg.text}{:else if seg.kind === 'grc'}<span lang="grc" class="preview-grc">{seg.text}</span>{:else}<span class="preview-fn"><Self segs={seg.phrase} /><sup class="preview-fn-mark">{seg.id}</sup></span>{/if}{/each}
