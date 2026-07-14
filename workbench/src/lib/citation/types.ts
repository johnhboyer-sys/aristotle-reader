/**
 * Citation-scheme contract — the FROZEN interface from workbench-design/d2-citation-schemes.md.
 *
 * General code (editor, library, export, autosave) programs against this interface and never
 * branches on a scheme id. Addresses are opaque raw strings outside src/lib/citation/: never
 * inspect `raw`, never compare raws with `<` (Bekker raws are not string-sortable), never
 * parse them outside the owning scheme.
 */

export type SchemeId =
  | 'bekker-standard'
  | 'bekker-metaphysics'
  | 'aquinas-tbd'
  | 'busse-paragraph'
  | 'paragraph'
  | 'plain-line';

/** Opaque scheme-owned address, e.g. "1041a6". Only the owning scheme parses/compares it. */
export interface Address {
  scheme: SchemeId;
  raw: string;
}

export interface RefSpan {
  scheme: SchemeId;
  /** 1-based index into the work's book list. */
  book?: number;
  chapter?: number;
  start: Address;
  /** Equal to `start` for a point reference. */
  end: Address;
}

export interface GutterSpec {
  /** What one editor row IS. Phase 1 renders only 'bekker-line'. */
  rowUnit: 'bekker-line' | 'paragraph' | 'sentence' | 'plain-line';
  gutterMode: 'address' | 'structural';
}

export interface WorkMeta {
  id: string;
  title: string;
  author: string;
  scheme: SchemeId;
  originalLanguage?: 'greek' | 'latin';
  /** Labels are explicit in the work manifest (build spec §3). */
  books: { n: number; label: string }[];
}

export interface CitationScheme {
  id: SchemeId;
  /** Parse a canonical address string; throws on malformed input. */
  parseAddress(raw: string): Address;
  /** Total order over addresses of this scheme (page → column → line for Bekker). */
  compareAddress(a: Address, b: Address): number;
  /** Book label for a 1-based index; reads manifest labels, scheme supplies the fallback. */
  bookLabel(bookIndex: number, work: WorkMeta): string;
  /** THE range formatter (en dash, collapse rules) — every display site goes through this. */
  formatRange(span: RefSpan): string;
  /** Full citation, e.g. "*Metaphysics* Ζ.17, 1041a6–b3". */
  formatCitation(span: RefSpan, work: WorkMeta): string;
  gutter: GutterSpec;
  /**
   * Who owns row count for a work under this scheme (D8 amendment, see
   * workbench-design/d8-view-modes.md §1).
   *
   * - 'corpus': an external corpus spine owns row count (Bekker line grid,
   *   Busse paragraph grid). Rows can't be created/destroyed by the user;
   *   D6 merge-refusal semantics apply.
   * - 'document': the document itself is the spine — there is no external
   *   row source, so the user may create/destroy rows (paragraph split and
   *   merge are row-level operations under this arm).
   */
  spineSource: 'corpus' | 'document';
}
