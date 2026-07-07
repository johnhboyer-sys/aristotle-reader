// Data model for reference-translation editions (design doc D5). PURE — no
// filesystem, no Tauri. See reference/storage.ts for the copyright/location
// invariant this data model is stored under.

/** One assigned chapter within a reference edition's manifest. */
export interface ReferenceChapter {
  book: number;
  chapter: number;
  /** Filename only (not a path), e.g. `chapter-07-17.md`. */
  file: string;
}

/** `manifest.json` — one per imported edition (e.g. Ross, Bostock). */
export interface ReferenceManifest {
  schemaVersion: 1;
  workId: string;
  slug: string;
  displayName: string;
  /** ISO 8601 timestamp of the most recent import/update. */
  importedAt: string;
  chapters: ReferenceChapter[];
}

/** A single paragraph as rendered/consumed by the panel or a future aligner. */
export interface ReferenceParagraph {
  /** Stable positional id derived at read time (`p0`, `p1`, …). Not stored. */
  id: string;
  text: string;
}

/**
 * The read-time view the panel (or a future aligner) consumes. Shaped as a
 * union so an 'aligned' mode — segments matched against a Bekker viewRange —
 * can be added later (design doc D5 §6) without changing 'chapter' or
 * requiring a data migration. Only 'chapter' exists in this slice.
 */
export type ReferenceView =
  | { mode: 'chapter'; paragraphs: ReferenceParagraph[] }
  | { mode: 'aligned'; segments: ReferenceParagraph[] };
