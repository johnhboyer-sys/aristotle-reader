<script lang="ts">
  // One TipTap (ProseMirror) EditorView. The component boundary exists so a
  // mount-on-focus/static-HTML variant can be swapped in later without
  // restructuring (design doc D1 §"Model") — everything the view needs comes
  // through the controller.
  //
  // AI-assist (design doc D4): this component also hosts the row's suggest
  // affordance — a quiet glyph that is invisible at rest (§12: the
  // collaborator should never notice it; CSS shows it only while the focused
  // row is hovered) — and the popover anchored under the row. The editor
  // itself is touched by assist through exactly ONE command:
  // `insertSuggestion` below.
  import { onMount } from 'svelte';
  import type { RowViewHost } from './ChapterEditor.svelte';
  import AssistPopover from '../../components/AssistPopover.svelte';

  let { index, host }: { index: number; host: RowViewHost } = $props();

  let el: HTMLDivElement;

  /** The assist popover state for THIS row (null = assist isn't targeting it). */
  const assist = $derived(host.assistStateFor(index));

  /**
   * THE one public command the assist layer may use to touch the editor
   * (design doc D4's hard constraint): a normal ProseMirror transaction on
   * this row's view, dispatched through the exact same pipeline as typing
   * (app-level undo stack, dirty tracking, commit-on-idle). Empty row → the
   * text becomes the row's content; selection → replaced; otherwise →
   * inserted at the caret. Plain text, default marks.
   */
  export function insertSuggestion(text: string): void {
    host.insertSuggestion(index, text);
  }

  function onInsert() {
    if (assist?.kind === 'suggestion') insertSuggestion(assist.text);
    host.dismissAssist();
  }

  onMount(() => {
    host.createView(index, el);
    return () => host.destroyView(index);
  });
</script>

<div class="row-editor" bind:this={el}></div>

<button
  class="assist-glyph"
  type="button"
  tabindex="-1"
  aria-label="Suggest a translation (⌘↩)"
  title="Suggest a translation (⌘↩)"
  onmousedown={(e) => e.preventDefault()}
  onclick={() => host.requestAssist(index)}
>✦</button>

{#if assist}
  <AssistPopover state={assist} {onInsert} onDismiss={() => host.dismissAssist()} />
{/if}
