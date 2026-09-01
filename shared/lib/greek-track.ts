/**
 * The shared Greek track: one column width for a whole work, equal to its
 * widest unwrapped Bekker line.
 *
 * Each chapter-block renders as its own CSS grid row, so sizing the Greek
 * column with `max-content` sized it to THAT block's longest line — and the
 * English column, with the marginal Bekker numbers riding on it, started at a
 * different x on every block. One measured width for the whole work fixes
 * that, and is the same number the greek-only view wants for its sections.
 *
 * Measured rather than computed: the widest line depends on the face, its
 * size, and which glyphs the work actually uses.
 *
 * It lives here, out of the component, because the defect worth locking down
 * is a sequencing one — measuring before the lines exist — and that is only
 * testable if the measurement can be called directly. jsdom reports 0 for
 * every rect, so a test mocks them; mounting the reader would test nothing.
 */

/** Widest `.greek-line` under `root`, rounded up, or 0 if there was nothing to
 *  measure. 0 means "no measurement happened" — a loading placeholder, or a
 *  view where the Greek column is display:none — and callers must treat it as
 *  "ask again later", never as a width. */
export function measureGreekTrack(root: HTMLElement | null): number {
  if (!root) return 0;
  const lines = root.querySelectorAll<HTMLElement>('.greek-line');
  if (!lines.length) return 0;

  // One synchronous pass with the column at its natural width. Adding the
  // class and reading a rect forces layout with the new styles applied, and
  // nothing between the add and the remove can yield, so it never paints.
  root.classList.add('measuring-greek');
  let max = 0;
  try {
    for (const line of lines) {
      const w = line.getBoundingClientRect().width;
      if (w > max) max = w;
    }
  } finally {
    // finally, not a plain call: a leaked class would leave the column pinned
    // to max-content with every line set nowrap, which is very visible.
    root.classList.remove('measuring-greek');
  }

  // Round up — a fractional track leaves a sub-pixel wrap on the widest line.
  return max > 0 ? Math.ceil(max) : 0;
}
