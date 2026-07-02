// Drive-folder sync — pure logic (build spec §11). Two people share the
// chapter library through an ordinary synced folder (iCloud Drive, Google
// Drive, Dropbox, or similar). No sync-service API, no OAuth, no network
// code — the app only has to behave well when the folder underneath it
// changes. This module is deliberately Svelte-free so it can be unit tested
// without mounting anything; ChapterEditor.svelte and LibraryRail.svelte call
// into it.
//
// Three separable jobs:
//   1. Change detection (hasChanged / contentHash) — did the on-disk chapter
//      file move since we loaded/saved it? mtime first (cheap), content hash
//      only to rule out a false positive from a sync client re-touching a
//      file's timestamp without changing its bytes (Drive clients do this on
//      re-index; a hash-confirmed "same content" must NOT prompt anything).
//   2. The reload decision matrix (decideReload) — given clean/dirty editor
//      state and changed/unchanged file state, what should happen.
//   3. Filename pattern recognition — conflicted copies (surfaced, read-only,
//      never auto-merged) and iCloud's not-yet-downloaded placeholder stubs
//      (surfaced, greyed out, excluded from opening/compiling).

/** FNV-1a — small, synchronous, dependency-free; good enough to distinguish
 * "same bytes" from "different bytes" for false-positive-mtime confirmation.
 * Not a cryptographic hash and not meant to be one. */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface FileSnapshot {
  mtime: number | null;
  /** Content hash at the moment this snapshot was taken (load or last save). */
  hash: string;
}

/**
 * True when the on-disk file looks different from `known` (the snapshot
 * taken at load/last-save time). mtime is the cheap first check; if mtime
 * differs (or is unknown on either side) we still confirm with a hash before
 * calling it a real change, because sync clients routinely touch mtimes
 * without touching bytes (re-index, metadata-only sync passes, clock skew
 * from a collaborator's machine). Identical hash → never reports a change,
 * regardless of what mtime says.
 */
export function hasChanged(known: FileSnapshot, currentMtime: number | null, currentContent: string): boolean {
  if (currentMtime !== null && known.mtime !== null && currentMtime === known.mtime) return false;
  return contentHash(currentContent) !== known.hash;
}

export function snapshotOf(mtime: number | null, content: string): FileSnapshot {
  return { mtime, hash: contentHash(content) };
}

// ── the reload decision matrix ──────────────────────────────────────────────

export type ReloadDecision =
  | { kind: 'none' } // unchanged on disk — nothing to do
  | { kind: 'reload-seamless' } // changed on disk, no local edits — just reload
  | { kind: 'ask' }; // changed on disk AND local edits exist — user must choose

/**
 * clean/dirty × changed/unchanged, per the build spec:
 *   unchanged                → none              (nothing to do, regardless of dirty)
 *   changed, editor clean    → reload-seamless    ("Updated from the shared folder.")
 *   changed, editor dirty    → ask                (Keep mine / Load theirs)
 */
export function decideReload(fileChanged: boolean, editorDirty: boolean): ReloadDecision {
  if (!fileChanged) return { kind: 'none' };
  return editorDirty ? { kind: 'ask' } : { kind: 'reload-seamless' };
}

// ── filename pattern recognition ────────────────────────────────────────────
//
// Kept data-driven (a plain array of regexes) so a pattern can be added
// without touching call sites. Verified against real service behavior before
// writing (not guessed):
//
//   Google Drive / Dropbox desktop clients write verbose "conflicted copy"
//   suffixes when two offline edits collide, e.g.
//     "Name (1).md"                                  (Drive, Finder-style)
//     "Name (conflicted copy 2026-07-02).md"          (Drive)
//     "Name (John's conflicted copy 2026-07-02).md"   (Dropbox)
//
//   iCloud Drive's conflict behavior is DIFFERENT and less discoverable: per
//   Apple's own docs (Technical Note TN2336; iCloud User Guide "if document
//   versions conflict"), when two offline devices edit the same file and
//   both come back online, iCloud Drive silently keeps ONE bounced copy per
//   collision using a bare numeric suffix — "Name.md" and "Name 2.md" — with
//   NO "conflicted copy" wording at all, and for many plain-text edits it
//   resolves the conflict internally (keeps the newer save, no extra file
//   ever appears) rather than always surfacing both versions. That numeric
//   suffix is too generic to pattern-match against arbitrary filenames
//   (it would collide with legitimate names), so it is only matched against
//   THIS app's own chapter-file convention (bBBcCC.md) — see
//   iCloudConflictPatterns below — where "b07c17 2.md" is unambiguous.
//   Because iCloud sync can silently keep just the newer file with no
//   visible trace of the collision, reload-on-focus + the turn-taking
//   convention (not conflict surfacing) is the primary safety net there.

const CHAPTER_STEM = /^b(\d{2})c(\d{2})$/; // matches chapterFileName's own shape

export interface ConflictMatch {
  /** The clean chapter file this conflicted copy corresponds to, if determinable. */
  originalFile: string | null;
}

const CONFLICT_PATTERNS: { name: string; re: RegExp }[] = [
  // Google Drive: "Name (1).md", "Name (2).md" …
  { name: 'drive-numbered', re: /^(.*) \((\d+)\)\.md$/ },
  // Google Drive: "Name (conflicted copy 2026-07-02).md"
  { name: 'drive-conflicted-copy', re: /^(.*) \(conflicted copy[^)]*\)\.md$/i },
  // Dropbox: "Name (John's conflicted copy 2026-07-02).md"
  { name: 'dropbox-conflicted-copy', re: /^(.*) \([^()]*conflicted copy[^()]*\)\.md$/i },
  // iCloud Drive: bare numeric suffix, matched only against our own
  // bBBcCC.md stem so it can't false-positive on an unrelated filename.
  { name: 'icloud-numbered', re: /^(b\d{2}c\d{2}) (\d+)\.md$/ },
];

/** True when `file` looks like a conflicted-copy artifact of a sync service. */
export function isConflictedCopy(file: string): boolean {
  return CONFLICT_PATTERNS.some((p) => p.re.test(file));
}

/**
 * Best-effort recovery of the clean filename a conflicted copy shadows, for
 * display ("conflicted copy of b07c17.md"). Null when it can't be derived
 * (still surfaced as conflicted — just without that extra context).
 */
export function conflictOriginalFile(file: string): string | null {
  for (const p of CONFLICT_PATTERNS) {
    const m = p.re.exec(file);
    if (!m) continue;
    const stem = m[1];
    if (p.name === 'icloud-numbered') return `${stem}.md`;
    if (CHAPTER_STEM.test(stem.replace(/\.md$/, ''))) return `${stem}.md`;
    return stem.endsWith('.md') ? stem : `${stem}.md`;
  }
  return null;
}

// ── iCloud "not yet downloaded" placeholder stubs ───────────────────────────
//
// With "Optimize Mac Storage" on, a file iCloud hasn't materialized locally
// yet shows up in a directory listing as a placeholder stub named
// `.<Name>.icloud` (dot-prefixed, .icloud suffix) instead of the real file.
// It re-appears as the real file once iCloud finishes downloading it — no
// action needed beyond re-listing (done on window focus, same as everything
// else in this module).

const ICLOUD_PLACEHOLDER = /^\.(.+)\.icloud$/;

/** True when `file` is an iCloud "not downloaded yet" placeholder stub. */
export function isCloudPlaceholder(file: string): boolean {
  return ICLOUD_PLACEHOLDER.test(file);
}

/** The real filename a placeholder stub stands in for, or null if not a stub. */
export function placeholderRealName(file: string): string | null {
  const m = ICLOUD_PLACEHOLDER.exec(file);
  return m ? m[1] : null;
}

// ── library-listing classification (what LibraryRail renders) ──────────────

export type LibraryFileKind = 'normal' | 'conflicted' | 'placeholder';

export interface ClassifiedFile {
  file: string;
  kind: LibraryFileKind;
  /** Set when kind === 'conflicted' and derivable. */
  originalFile: string | null;
}

/** Classify one filename from a work's directory listing. */
export function classifyLibraryFile(file: string): ClassifiedFile {
  if (isCloudPlaceholder(file)) return { file, kind: 'placeholder', originalFile: null };
  if (isConflictedCopy(file)) return { file, kind: 'conflicted', originalFile: conflictOriginalFile(file) };
  return { file, kind: 'normal', originalFile: null };
}

/** Classify a whole directory listing (storage.list() output). */
export function classifyLibraryFiles(files: string[]): ClassifiedFile[] {
  return files.map(classifyLibraryFile);
}

/**
 * Per-chapter status derived from a work's directory listing, keyed by the
 * clean chapter file name (chapterFileName's output, e.g. "b07c17.md") —
 * what LibraryRail needs to grey out a not-yet-downloaded chapter and to
 * list conflicted-copy siblings alongside the chapter they shadow.
 */
export interface ChapterLibraryStatus {
  /** True when the clean file itself is (currently) only an iCloud stub. */
  isPlaceholder: boolean;
  /** Conflicted-copy filenames that shadow this chapter, if any. */
  conflicts: string[];
}

/**
 * Build a lookup of chapterFileName → status from a work's raw directory
 * listing (storage.list() output — untouched by classification order).
 */
export function chapterLibraryStatuses(files: string[]): Map<string, ChapterLibraryStatus> {
  const statuses = new Map<string, ChapterLibraryStatus>();
  const get = (name: string): ChapterLibraryStatus => {
    let s = statuses.get(name);
    if (!s) {
      s = { isPlaceholder: false, conflicts: [] };
      statuses.set(name, s);
    }
    return s;
  };
  for (const file of files) {
    const classified = classifyLibraryFile(file);
    if (classified.kind === 'placeholder') {
      const real = placeholderRealName(file);
      if (real) get(real).isPlaceholder = true;
    } else if (classified.kind === 'conflicted') {
      if (classified.originalFile) get(classified.originalFile).conflicts.push(file);
      else get(file).conflicts.push(file); // no derivable original — self-key so it still surfaces
    }
  }
  return statuses;
}
