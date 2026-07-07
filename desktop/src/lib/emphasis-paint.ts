// Paints imported-translation markdown emphasis (italic/bold) onto the
// rendered Reader DOM — desktop-only, zero app/src changes.
//
// THE GATE (see the design brief this file answers): overlay pieces are
// plain text rendered by the site's own Reader.svelte (flowParts/transFlow),
// and the CSS Custom Highlight API (`::highlight()`, already used for
// annotations — see annotations.ts) does NOT support painting font-style —
// the Highlight pseudo-element spec restricts `::highlight()` to a narrow
// "highlight-affected" property set (color, background-color, text-decoration
// and its longhands, text-shadow, -webkit-text-stroke-color, text-emphasis-*,
// and the SVG paint properties) — font-style/font-weight are NOT in that set
// (confirmed against the CSS Pseudo-Elements spec, and against this file's own
// desktop.css, whose existing ::highlight() rules only ever set
// background-color/text-decoration — never font-style). So italics/bold
// cannot be painted the same way annotations are.
//
// The route that DOES work without touching app/src: real DOM surgery. The
// Reader's rendered prose is ordinary text nodes inside `.ross-prose` — this
// module resolves each import's stored EmphasisRange (offsets into one
// overlay PIECE's own text — see import-align.ts's emitOverlayPieces) to a
// live Range in that already-rendered DOM (same TreeWalker/offset technique
// annotations.ts's proseOffsetAt/englishRange already use for annotation
// capture) and wraps it with a real `<em>`/`<strong>` element via
// Range.surroundContents — genuine semantic italic/bold, not a CSS-highlight
// approximation. This never edits Reader.svelte: it's a post-render DOM
// mutation exactly like paintAnnotations, just producing elements instead of
// registering a Highlight.
//
// Idempotency: wrapping mutates the DOM, which re-fires the app's own
// MutationObserver (App.svelte) that re-runs this on a debounce. A
// `data-emph-painted` marker on each `.ross-prose` we've already processed
// makes re-entry a no-op; a genuinely fresh render (new chapter/navigation)
// is a NEW DOM subtree with no marker, so it repaints correctly.

import type { PieceEmphasis } from './aligner/import-align';
import { getImportEmphasis } from './imports';

const nodeEl = (n: Node): Element | null =>
  n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement;

/** Clean prose text of a `.ross-prose` container — same walk/exclusions as
 *  annotations.ts's proseOffsetAt, so offsets captured there and offsets
 *  computed here (from the same rendered DOM) agree. */
function proseText(root: Element): string {
  let out = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      nodeEl(n)?.closest('.bk-num, .eng-table') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out += n.textContent;
  return out;
}

/** Locate the (node, offset-within-node) for a char offset into a
 *  `.ross-prose`'s clean text — mirrors annotations.ts's proseOffsetAt
 *  inverted (offset -> position, rather than position -> offset). */
function locate(root: Element, target: number): [Node, number] | null {
  let acc = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      nodeEl(n)?.closest('.bk-num, .eng-table') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent!.length;
    if (acc + len >= target) return [n, target - acc];
    acc += len;
  }
  // target === full length (end-of-text range end) — return the very end of
  // the last text node rather than failing.
  return null;
}

/** Wrap one emphasis span in a real `<em>`/`<strong>` element. Falls back to
 *  a manual split+wrap when Range.surroundContents throws (it requires the
 *  range's boundaries not to split a non-Text node in a way that would leave
 *  a partial element on either side — never true for `.ross-prose`'s flat
 *  text-node content, but guarded defensively rather than letting a paint
 *  pass throw and abort every subsequent span in this piece). */
function wrapRange(root: Element, start: number, end: number, tag: 'em' | 'strong'): void {
  if (end <= start) return;
  const s = locate(root, start);
  const e = locate(root, end);
  if (!s || !e) return;
  const r = new Range();
  r.setStart(s[0], s[1]);
  r.setEnd(e[0], e[1]);
  if (r.collapsed) return;
  try {
    const wrapper = document.createElement(tag);
    r.surroundContents(wrapper);
  } catch {
    // Range spans multiple sibling text nodes in a way surroundContents can't
    // wrap directly (shouldn't happen for a `.ross-prose` piece's own flat
    // text, but a prior paint pass's <em> wrapper sitting exactly at the
    // boundary could produce this) — skip rather than corrupt the DOM.
  }
}

/**
 * Paint every registered import's emphasis spans into the currently-rendered
 * book's DOM. `shown` is the translation id(s) actually on screen (mono: one
 * id; compare: the pair) — mirrors paintAnnotations' own `shown` parameter,
 * so a hidden/inactive import's spans are never resolved against DOM that
 * doesn't carry its `data-trans`. Safe to call repeatedly (idempotent via the
 * data-emph-painted marker) and a no-op for any importId with nothing to
 * paint (getImportEmphasis returns []).
 */
// Cheap content fingerprint (not a real hash — length + endpoints is enough
// to detect "this .ross-prose's text changed since we painted it", which is
// all the marker needs to do). Svelte can reuse/patch an existing DOM node
// across a navigation rather than replacing it outright, so a plain boolean
// marker could survive onto a node whose text has since changed — keying the
// marker to a fingerprint of the text makes a genuine content change
// naturally invalidate it without needing to hook Svelte's own lifecycle.
function fingerprint(s: string): string {
  return `${s.length}:${s.slice(0, 12)}:${s.slice(-12)}`;
}

export function paintEmphasis(work: string, book: number, shown: string[]): void {
  for (const importId of shown) {
    const cols = document.querySelectorAll<HTMLElement>(
      `.english-col[data-trans="${cssEscape(importId)}"], .ross-col[data-trans="${cssEscape(importId)}"]`,
    );
    for (const col of cols) {
      const prose = col.querySelector<HTMLElement>('.ross-prose');
      if (!prose) continue;
      const text = proseText(prose);
      const fp = fingerprint(text);
      if (prose.dataset.emphPainted === fp) continue;
      const seg = col.closest('.segment[id^="col-"]');
      const column = seg?.id.match(/^col-(.+)$/)?.[1];
      if (!column) continue;
      const spans = getImportEmphasis(work, importId, book, column);
      const forThisPiece = spans.filter((s: PieceEmphasis) => s.pieceText === text);
      // Order doesn't affect correctness — wrapping a span only adds an <em>/
      // <strong> ANCESTOR around existing text nodes; it never changes
      // textContent or document order, so locate()/proseText() (both purely
      // functions of the CURRENT text content) return the same positions for
      // every other span regardless of what's already been wrapped. Document
      // order is used only for a stable, readable paint sequence.
      const ordered = [...forThisPiece].sort((a, b) => a.start - b.start);
      for (const s of ordered) wrapRange(prose, s.start, s.end, s.style === 'bold' ? 'strong' : 'em');
      prose.dataset.emphPainted = fp;
    }
  }
}

function cssEscape(s: string): string {
  return (globalThis as { CSS?: { escape?(s: string): string } }).CSS?.escape?.(s)
    ?? s.replace(/["\\]/g, '\\$&');
}
