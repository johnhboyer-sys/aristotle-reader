// Regression coverage for the element-endpoint copy-as-citation bug: some
// selections (triple-clicking a whole paragraph, or a selection edge that
// simply lands on the cell wrapper div rather than inside a text node) put a
// Range endpoint on an ELEMENT node rather than a text node. Handing that
// straight to EditorView.posAtDOM used to be able to resolve back to an
// empty point at the same boundary, which made buildCitationClipboardText
// see "nothing selected" and the user got a false-negative "Nothing to
// cite" even though rows were visibly selected.
//
// This project's vitest runs with `environment: 'node'` (no jsdom, no
// global `Node`/`Element`), so these tests build plain objects satisfying
// `DomNodeLike` (just `{ nodeType }`) rather than real DOM nodes — mirroring
// how copyCitation.test.ts keeps its module DOM-free and directly testable.
import { describe, expect, it } from 'vitest';
import { ELEMENT_NODE, isElementNode, resolveEndpointPos, type DomNodeLike } from '../citationSelection';

const TEXT_NODE = 3;
const textNode: DomNodeLike = { nodeType: TEXT_NODE };
const elementNode: DomNodeLike = { nodeType: ELEMENT_NODE };

describe('isElementNode', () => {
  it('is true for an element-shaped node', () => {
    expect(isElementNode(elementNode)).toBe(true);
  });

  it('is false for a text-shaped node', () => {
    expect(isElementNode(textNode)).toBe(false);
  });
});

describe('resolveEndpointPos — text-node endpoints (unchanged behavior)', () => {
  it('start endpoint delegates to posAtDOM, clamped to doc size', () => {
    const pos = resolveEndpointPos(textNode, 3, 10, 'start', () => 4);
    expect(pos).toBe(4);
  });

  it('end endpoint delegates to posAtDOM, clamped to doc size', () => {
    const pos = resolveEndpointPos(textNode, 3, 10, 'end', () => 7);
    expect(pos).toBe(7);
  });

  it('clamps a posAtDOM result above doc size down to size', () => {
    const pos = resolveEndpointPos(textNode, 0, 10, 'end', () => 999);
    expect(pos).toBe(10);
  });

  it('clamps a negative posAtDOM result up to 0', () => {
    const pos = resolveEndpointPos(textNode, 0, 10, 'start', () => -5);
    expect(pos).toBe(0);
  });

  it('a thrown posAtDOM falls back to full-cell coverage at this edge (start -> 0)', () => {
    const pos = resolveEndpointPos(
      textNode,
      0,
      10,
      'start',
      () => {
        throw new Error('DOM position not inside the editor');
      },
    );
    expect(pos).toBe(0);
  });

  it('a thrown posAtDOM falls back to full-cell coverage at this edge (end -> docSize)', () => {
    const pos = resolveEndpointPos(
      textNode,
      0,
      10,
      'end',
      () => {
        throw new Error('DOM position not inside the editor');
      },
    );
    expect(pos).toBe(10);
  });
});

describe('resolveEndpointPos — element endpoints (the bug fix)', () => {
  it('a start endpoint on an element resolves to the top of the cell (0), never calling posAtDOM', () => {
    let called = false;
    const pos = resolveEndpointPos(elementNode, 0, 42, 'start', () => {
      called = true;
      return 20; // if this were used, the test below would catch the wrong value too
    });
    expect(pos).toBe(0);
    expect(called).toBe(false);
  });

  it('an end endpoint on an element resolves to the bottom of the cell (docSize), never calling posAtDOM', () => {
    let called = false;
    const pos = resolveEndpointPos(elementNode, 3, 42, 'end', () => {
      called = true;
      return 5;
    });
    expect(pos).toBe(42);
    expect(called).toBe(false);
  });

  it('an element endpoint at offset 0 still resolves per its edge role, not always to 0', () => {
    // Triple-click end landing on the wrapper div at offset 0 (e.g. an
    // otherwise-empty trailing element) must still mean "end of cell", not
    // regress to "start of cell" just because the offset happens to be 0.
    const pos = resolveEndpointPos(elementNode, 0, 15, 'end', () => 0);
    expect(pos).toBe(15);
  });

  it('a large offset on an element endpoint (after the last child) still resolves per its edge role', () => {
    const pos = resolveEndpointPos(elementNode, 4, 15, 'start', () => 0);
    expect(pos).toBe(0);
  });
});

describe('end-to-end shape: full-cell coverage yields non-empty englishSelected text', () => {
  // Mirrors how ChapterEditor.copyCitation() consumes resolveEndpointPos:
  // from/to feed doc.textBetween(from, to, ...). Before the fix, an element
  // endpoint could produce from === to (an empty slice) even though the
  // whole cell was visibly selected; confirm the fixed from/to pair spans
  // the whole doc instead.
  it('both endpoints on elements (triple-click-the-whole-cell shape) span the full doc size', () => {
    const docSize = 27;
    const from = resolveEndpointPos(elementNode, 0, docSize, 'start', () => {
      throw new Error('should not be called for an element endpoint');
    });
    const to = resolveEndpointPos(elementNode, 1, docSize, 'end', () => {
      throw new Error('should not be called for an element endpoint');
    });
    expect(from).toBe(0);
    expect(to).toBe(docSize);
    expect(to).toBeGreaterThan(from);
  });
});
