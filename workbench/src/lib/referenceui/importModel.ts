// Assignment-table state + write plan for ReferenceImportDialog.svelte
// (design doc D5 §5). PURE / DI: the dialog renders these rows and calls
// writeAssignedBlocks with a ReferenceStorage; nothing here touches Tauri or
// the DOM. Consumes the frozen src/lib/reference/** library.

import type { ProposedBlock } from '../reference/assign';
import { normalizeReferenceText } from '../reference/normalize';
import {
  createManifest,
  referenceChapterFileName,
  serializeManifest,
  upsertChapter,
} from '../reference/manifest';
import { MANIFEST_FILE, serializeReferenceChapterFile } from '../reference/storage';
import type { ReferenceStorage } from '../reference/storage';
import type { ReferenceChapter, ReferenceManifest } from '../reference/types';

/** One editable row of the assignment table. book/chapter null = unassigned. */
export interface AssignmentRow {
  text: string;
  book: number | null;
  chapter: number | null;
}

/** An AssignmentRow the user has fully assigned. */
export interface AssignedRow {
  text: string;
  book: number;
  chapter: number;
}

/** Seed the editable table from the proposeSplits pre-pass. */
export function rowsFromBlocks(blocks: readonly ProposedBlock[]): AssignmentRow[] {
  return blocks.map((b) => ({ text: b.text, book: b.book, chapter: b.chapter }));
}

/** Rows that will actually be written (both book and chapter chosen). */
export function assignedRows(rows: readonly AssignmentRow[]): AssignedRow[] {
  return rows.filter(
    (r): r is AssignmentRow & AssignedRow => r.book !== null && r.chapter !== null,
  );
}

export function unassignedCount(rows: readonly AssignmentRow[]): number {
  return rows.length - assignedRows(rows).length;
}

/**
 * The visible drop-count sentence (D5 §5/§8), or null when everything is
 * assigned. "2 sections weren't assigned to a chapter, so they won't be
 * imported."
 */
export function unassignedSentence(rows: readonly AssignmentRow[]): string | null {
  const n = unassignedCount(rows);
  if (n === 0) return null;
  if (n === 1) return "1 section wasn't assigned to a chapter, so it won't be imported.";
  return `${n} sections weren't assigned to a chapter, so they won't be imported.`;
}

/** Import-button gate: enabled + null, or disabled + a one-line reason. */
export function importGate(rows: readonly AssignmentRow[]): {
  enabled: boolean;
  reason: string | null;
} {
  const assigned = assignedRows(rows);
  if (assigned.length === 0) {
    return { enabled: false, reason: 'Assign at least one section to a chapter.' };
  }
  const seen = new Set<string>();
  for (const r of assigned) {
    const key = `${r.book}:${r.chapter}`;
    if (seen.has(key)) {
      return {
        enabled: false,
        reason: `Two sections are assigned to book ${r.book}, chapter ${r.chapter} — change one of them.`,
      };
    }
    seen.add(key);
  }
  return { enabled: true, reason: null };
}

/**
 * Assigned rows that would overwrite a chapter already present in the
 * edition's manifest — each needs the explicit Replace/Cancel confirm
 * (ImportDialog's duplicate-guard idiom). Empty when the edition is new.
 */
export function duplicateTargets(
  rows: readonly AssignmentRow[],
  manifest: ReferenceManifest | null,
): ReferenceChapter[] {
  if (!manifest) return [];
  return manifest.chapters.filter((c) =>
    assignedRows(rows).some((r) => r.book === c.book && r.chapter === c.chapter),
  );
}

/** "Replace the Ross text already imported for book 7, chapter 17?" (D5 §8). */
export function replaceQuestion(displayName: string, book: number, chapter: number): string {
  return `Replace the ${displayName} text already imported for book ${book}, chapter ${chapter}?`;
}

export interface WriteAssignedOptions {
  workId: string;
  slug: string;
  displayName: string;
  /** The edition's current manifest, or null to create a new edition. */
  existingManifest: ReferenceManifest | null;
  rows: readonly AssignmentRow[];
  /** ISO timestamp for manifest bookkeeping (injected for determinism). */
  now: string;
}

export interface WriteAssignedResult {
  /** Chapter entries written, in write order. */
  written: ReferenceChapter[];
  manifest: ReferenceManifest;
}

/**
 * The §5 write step: for each assigned row, normalize the text
 * (normalizeReferenceText — the stored body is the `rawKept` form, verbatim
 * aside from line-ending/soft-hyphen shaping, per reference/storage.ts's
 * contract), write `chapter-<b2>-<c2>.md`, upsert the manifest entry; then
 * persist the manifest once. Unassigned rows are dropped (the dialog shows
 * the drop-count sentence before this runs).
 */
export async function writeAssignedBlocks(
  storage: ReferenceStorage,
  options: WriteAssignedOptions,
): Promise<WriteAssignedResult> {
  const { workId, slug, displayName, rows, now } = options;
  let manifest =
    options.existingManifest ?? createManifest(workId, slug, displayName, now);
  const written: ReferenceChapter[] = [];
  for (const row of assignedRows(rows)) {
    const body = normalizeReferenceText(row.text).rawKept;
    const file = referenceChapterFileName(row.book, row.chapter);
    const content = serializeReferenceChapterFile(
      { work: workId, book: row.book, chapter: row.chapter, edition: slug },
      body,
    );
    await storage.write(workId, slug, file, content);
    const entry: ReferenceChapter = { book: row.book, chapter: row.chapter, file };
    manifest = upsertChapter(manifest, entry, now);
    written.push(entry);
  }
  await storage.write(workId, slug, MANIFEST_FILE, serializeManifest(manifest));
  return { written, manifest };
}
