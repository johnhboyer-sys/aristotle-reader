<script lang="ts">
  // Floating "AI reference" popup (right-click Greek → AI reference). Unlike
  // the transient AssistPopover (which is anchored under a row and inserts its
  // suggestion into the cell), this panel is:
  //   - independent of the English cell — its text NEVER enters the manuscript;
  //   - free-floating: position: fixed at (x, y), draggable by its header;
  //   - persistent: it stays open until the user closes it, and multiple can
  //     be open at once (ChapterEditor keeps an array).
  // Three body states: thinking / text / error. Footer: Copy (writes the text
  // to the clipboard via the passed-in onCopy) + Close (onClose, which also
  // aborts the in-flight request in the parent).
  type RefState =
    | { kind: 'thinking' }
    | { kind: 'text'; text: string }
    | { kind: 'error'; text: string };

  let {
    x,
    y,
    title = 'AI reference',
    body,
    onClose,
    onCopy,
  }: {
    x: number;
    y: number;
    title?: string;
    body: RefState;
    onClose: () => void;
    onCopy: () => void;
  } = $props();

  // The panel sits at (x + dx, y + dy): props give the initial spot, the drag
  // accumulates an offset. Modelling the drag as a delta (not an absolute
  // position seeded from the props) keeps the props reactive and avoids
  // capturing their initial value into local $state.
  let dx = $state(0);
  let dy = $state(0);
  const left = $derived(x + dx);
  const top = $derived(y + dy);

  // Pointer-drag on the header. We capture the pointer so the drag keeps
  // tracking even if the cursor briefly leaves the header, and record where the
  // grab started so the panel doesn't jump to the cursor on the first move.
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startDx = 0;
  let startDy = 0;

  function onHeaderPointerDown(e: PointerEvent) {
    // Left button only; ignore clicks that originate on the close affordance.
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startDx = dx;
    startDy = dy;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onHeaderPointerMove(e: PointerEvent) {
    if (!dragging) return;
    dx = startDx + (e.clientX - startX);
    dy = startDy + (e.clientY - startY);
  }

  function onHeaderPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // capture may already be gone — ignore.
    }
  }

  const copyable = $derived(body.kind === 'text');
</script>

<div class="ref-popup" role="dialog" aria-label={title} style="left: {left}px; top: {top}px">
  <header
    class="ref-head"
    role="toolbar"
    tabindex="-1"
    aria-label="Drag to move"
    onpointerdown={onHeaderPointerDown}
    onpointermove={onHeaderPointerMove}
    onpointerup={onHeaderPointerUp}
    onpointercancel={onHeaderPointerUp}
  >
    <span class="ref-title">{title}</span>
    <button class="ref-x" type="button" aria-label="Close" onpointerdown={(e) => e.stopPropagation()} onclick={onClose}
      >×</button
    >
  </header>

  <div class="ref-body">
    {#if body.kind === 'thinking'}
      <span class="ref-note">Thinking…</span>
    {:else if body.kind === 'text'}
      <p class="ref-text">{body.text}</p>
    {:else}
      <span class="ref-note">{body.text}</span>
    {/if}
  </div>

  <footer class="ref-actions">
    <button class="ref-btn" type="button" disabled={!copyable} onclick={onCopy}>Copy</button>
    <button class="ref-btn" type="button" onclick={onClose}>Close</button>
  </footer>
</div>

<style>
  /* Free-floating panel — same quiet popover chrome as .assist-popover /
     .ctx-menu, but positioned (fixed) at an arbitrary (x, y) and above the
     editor. */
  .ref-popup {
    position: fixed;
    z-index: 80;
    display: flex;
    flex-direction: column;
    min-width: 22rem;
    max-width: 30rem;
    background: var(--popup-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--popup-shadow);
    overflow: hidden;
  }

  .ref-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 0.3rem 0.3rem 0.3rem 0.6rem;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  .ref-head:active {
    cursor: grabbing;
  }
  .ref-title {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--text-mid);
  }
  .ref-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.4rem;
    height: 1.4rem;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-mid);
    font-size: 1.05rem;
    line-height: 1;
    cursor: pointer;
  }
  .ref-x:hover {
    background: var(--ui-hover);
    color: var(--text);
  }

  .ref-body {
    padding: var(--space-3);
    max-height: 22rem;
    overflow-y: auto;
  }
  .ref-note {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-mid);
  }
  .ref-text {
    font-family: var(--font-work);
    font-size: var(--work-fs);
    line-height: var(--work-lh);
    color: var(--text);
    margin: 0;
    white-space: pre-wrap;
  }

  .ref-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: 0.4rem var(--space-3) var(--space-3);
  }
  .ref-btn {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    padding: 0.2rem 0.55rem;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: transparent;
    color: var(--text-mid);
    cursor: pointer;
    white-space: nowrap;
  }
  .ref-btn:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--text-light);
  }
  .ref-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
