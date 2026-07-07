// Copy-as-citation DOM→position resolution (build spec §10). Pulled out of
// ChapterEditor.svelte's copyCitation() so the endpoint math is unit
// testable without a real Selection/Range (this project's vitest runs with
// `environment: 'node'` — no jsdom). Everything here is duck-typed against
// the minimal DOM shape it needs (`nodeType`) rather than `instanceof Node`
// / `instanceof Element`, which don't exist as globals outside a
// browser/jsdom.
//
// Bug this exists to fix: some selections (e.g. triple-clicking a whole
// paragraph) put a Range endpoint on an ELEMENT node — offset 0 ("before my
// first child") or offset === childNodes.length ("after my last child") —
// rather than on a text node. Feeding that straight into
// EditorView.posAtDOM(node, offset) uses the default bias (-1, "prefer the
// position before this point"), which can resolve right back to an empty
// point at that same boundary. The englishSelected slice then comes out
// empty even though the whole cell is visibly selected, and the caller
// (buildCitationClipboardText) treats an all-empty result as "nothing to
// cite".
//
// Fix: an element-level endpoint never gets asked to resolve a fine-grained
// position at all — it stands for "this endpoint covers the whole cell from
// its edge", per the endpoint's role (a start endpoint means "from the top
// of the cell"; an end endpoint means "to the bottom of the cell"). Only
// text-node endpoints (the normal case: the user's caret genuinely landed
// inside a run of text) go through `posAtDOM`.

/** Minimal shape this module needs from a DOM Node — real Node/Element
 * instances satisfy it; tests can pass plain objects. */
export interface DomNodeLike {
  nodeType: number;
}

/** DOM's Node.ELEMENT_NODE, duplicated here so this module doesn't depend on
 * the global `Node` constructor (absent under `environment: 'node'`). */
export const ELEMENT_NODE = 1;

export function isElementNode(node: DomNodeLike): boolean {
  return node.nodeType === ELEMENT_NODE;
}

/**
 * Resolve one selection endpoint (container + offset) to a ProseMirror
 * position within a row's English doc.
 *
 * - Text-node endpoints (the common case): delegate to `posAtDOM`, clamped
 *   to the doc's bounds, exactly as before. Any thrown error (kept for
 *   parity with the previous inline try/catch) falls back to full-cell
 *   coverage at this endpoint's edge.
 * - Element endpoints: skip `posAtDOM` entirely — an element container
 *   means the selection boundary landed on a wrapper (e.g. a triple-clicked
 *   paragraph, or the cell div itself), not inside a specific run of text.
 *   Treat it as full coverage of the cell from this endpoint's edge: `0` for
 *   a start endpoint, `docSize` for an end endpoint.
 */
export function resolveEndpointPos(
  container: DomNodeLike,
  offset: number,
  docSize: number,
  edge: 'start' | 'end',
  posAtDOM: (node: DomNodeLike, offset: number) => number,
): number {
  const fullCellEdge = edge === 'start' ? 0 : docSize;

  if (isElementNode(container)) {
    return fullCellEdge;
  }

  try {
    return Math.max(0, Math.min(posAtDOM(container, offset), docSize));
  } catch {
    return fullCellEdge;
  }
}
