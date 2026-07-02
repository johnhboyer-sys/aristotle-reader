<script lang="ts">
  // One TipTap (ProseMirror) EditorView. The component boundary exists so a
  // mount-on-focus/static-HTML variant can be swapped in later without
  // restructuring (design doc D1 §"Model") — everything the view needs comes
  // through the controller.
  import { onMount } from 'svelte';
  import type { RowViewHost } from './ChapterEditor.svelte';

  let { index, host }: { index: number; host: RowViewHost } = $props();

  let el: HTMLDivElement;

  onMount(() => {
    host.createView(index, el);
    return () => host.destroyView(index);
  });
</script>

<div class="row-editor" bind:this={el}></div>
