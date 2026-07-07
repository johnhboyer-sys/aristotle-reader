// Read-side controller helpers for ReferencePanel.svelte (design doc D5 §4).
// PURE / DI: everything takes a ReferenceStorage (or a KV store for the
// per-work edition preference) so it tests under vitest's node environment.
// This module consumes the frozen src/lib/reference/** library; it never
// modifies it.

import type { ReferenceManifest } from '../reference/types';
import { parseManifest } from '../reference/manifest';
import { MANIFEST_FILE, parseReferenceChapterFile } from '../reference/storage';
import type { ReferenceStorage } from '../reference/storage';

export interface LoadedEditions {
  /** Manifests that parsed cleanly, sorted by slug (listEditions order). */
  editions: ReferenceManifest[];
  /** Slugs whose manifest was missing or unparsable — hidden from the picker
   * and surfaced as one plain sentence (D5 §8). */
  corruptSlugs: string[];
}

/** List a work's editions and parse each manifest; corrupt ones are set aside. */
export async function loadEditions(
  storage: ReferenceStorage,
  workId: string,
): Promise<LoadedEditions> {
  const slugs = await storage.listEditions(workId);
  const editions: ReferenceManifest[] = [];
  const corruptSlugs: string[] = [];
  for (const slug of slugs) {
    const raw = await storage.read(workId, slug, MANIFEST_FILE);
    const manifest = raw === null ? null : parseManifest(raw);
    if (manifest) editions.push(manifest);
    else corruptSlugs.push(slug);
  }
  return { editions, corruptSlugs };
}

/**
 * Which edition the panel should show: the remembered slug when it still
 * exists, otherwise the first edition, otherwise null (no editions at all).
 */
export function resolveActiveSlug(
  editions: readonly ReferenceManifest[],
  preferredSlug: string | null,
): string | null {
  if (preferredSlug && editions.some((e) => e.slug === preferredSlug)) return preferredSlug;
  return editions[0]?.slug ?? null;
}

// ── per-work "last picked edition" preference ──────────────────────────────
// Mirrors LexiconDrawer's localStorage persistence pattern (a plain key,
// guarded reads); injected as a minimal KV surface so it is testable without
// jsdom.

export interface KVStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function editionPrefKey(workId: string): string {
  return `workbench:reference:edition:${workId}`;
}

export function readEditionPref(store: KVStore | undefined, workId: string): string | null {
  if (!store) return null;
  try {
    return store.getItem(editionPrefKey(workId));
  } catch {
    return null;
  }
}

export function writeEditionPref(store: KVStore | undefined, workId: string, slug: string): void {
  if (!store) return;
  try {
    store.setItem(editionPrefKey(workId), slug);
  } catch {
    // best-effort persistence only
  }
}

// ── chapter body lookup ─────────────────────────────────────────────────────

/**
 * The stored body for (book, chapter) in an edition, or null when the chapter
 * was never imported / its file is missing or malformed. Callers map null to
 * "No reference translation for this chapter yet." (D5 §4/§8).
 */
export async function loadChapterBody(
  storage: ReferenceStorage,
  manifest: ReferenceManifest,
  book: number,
  chapter: number,
): Promise<string | null> {
  const entry = manifest.chapters.find((c) => c.book === book && c.chapter === chapter);
  if (!entry) return null;
  const raw = await storage.read(manifest.workId, manifest.slug, entry.file);
  if (raw === null) return null;
  const parsed = parseReferenceChapterFile(raw);
  return parsed ? parsed.body : null;
}
