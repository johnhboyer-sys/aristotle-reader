// Read-time view derivation for a reference chapter (design doc D5 S6). PURE:
// takes already-normalized chapter display text and derives paragraph
// structure + stable positional ids. Nothing is stored — ids are recomputed
// identically on every call for the same input, so a future 'aligned' mode
// (see types.ts's ReferenceView union) can start consuming the same
// {id, text}[] shape with no migration.

import type { ReferenceParagraph, ReferenceView } from './types';

/**
 * Split display text into paragraphs on blank lines and assign stable
 * positional ids (`p0`, `p1`, …). Deterministic: the same `chapterText`
 * always yields the same ids in the same order.
 */
export function referenceForSelection(chapterText: string): ReferenceView {
  const paragraphs: ReferenceParagraph[] = chapterText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((text, index) => ({ id: `p${index}`, text }));

  return { mode: 'chapter', paragraphs };
}
