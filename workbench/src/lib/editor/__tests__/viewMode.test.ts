// viewMode store (D8 §5) — per-work view mode + interpolated granularity,
// ALWAYS clamped to viewPolicy (legalViews/defaultView). The store is a
// `.svelte.ts` rune module; these tests exercise the clamping + per-work
// persistence, stubbing localStorage (vitest runs in the node env, where it is
// otherwise undefined and every persistence path is a safe no-op).
// Each test uses distinct workIds: the store's in-memory map is a process
// singleton (clearing localStorage does not reset it), so isolation comes from
// per-test keys, not a reset hook — mirroring real usage where every work is
// independent.
import { describe, expect, it, vi } from 'vitest';

// A minimal in-memory localStorage installed on globalThis before importing
// the store, so its module-load `loadMap` and later `persistMap` round-trip.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

vi.stubGlobal('localStorage', new MemStorage());

// Imported AFTER the stub so the module reads/writes it.
const { currentViewMode, setViewMode, currentGranularity, setGranularity } = await import('../viewMode.svelte');
const { paragraphScheme } = await import('../../citation/schemes/paragraphScheme');
const { plainLineScheme } = await import('../../citation/schemes/plainLineScheme');
const { bekkerStandard } = await import('../../citation/schemes/bekkerStandard');

describe('currentViewMode — defaults from viewPolicy', () => {
  it('a paragraph document defaults to the paragraph view', () => {
    expect(currentViewMode('doc-a', paragraphScheme)).toBe('paragraph');
  });

  it('a plain-line document defaults to the grid view', () => {
    expect(currentViewMode('doc-b', plainLineScheme)).toBe('grid');
  });

  it('a bekker (corpus line) work defaults to the grid view', () => {
    expect(currentViewMode('meta', bekkerStandard)).toBe('grid');
  });
});

describe('setViewMode — clamped + persisted per work', () => {
  it('persists a legal choice for that work only', () => {
    setViewMode('doc-a', paragraphScheme, 'interpolated');
    expect(currentViewMode('doc-a', paragraphScheme)).toBe('interpolated');
    // A different work is unaffected (falls back to its scheme default).
    expect(currentViewMode('doc-c', paragraphScheme)).toBe('paragraph');
  });

  it('ignores an illegal mode for the scheme (paragraph docs have no grid view)', () => {
    // Fresh workId — the store's in-memory map is a process singleton, so a
    // work touched by an earlier test would carry its choice over.
    setViewMode('doc-illegal', paragraphScheme, 'grid'); // not in legalViews(paragraphScheme)
    expect(currentViewMode('doc-illegal', paragraphScheme)).toBe('paragraph'); // still the default
  });

  it('a stored value illegal for the READING scheme falls back to that scheme default', () => {
    // 'interpolated' is legal for a paragraph doc; store it, then read the
    // same work under a scheme where it is NOT legal — the getter re-validates
    // against the reading scheme on every call, so it clamps to that default.
    setViewMode('doc-d', paragraphScheme, 'interpolated');
    expect(currentViewMode('doc-d', paragraphScheme)).toBe('interpolated');
    // bekkerStandard permits ['grid','interpolated'] — 'interpolated' happens
    // to be legal there too, so use a scheme where it is not: a plain-line doc
    // permits ['grid','interpolated','paragraph'] (also legal). Instead assert
    // the clamp with a mode that IS illegal cross-scheme: store 'paragraph'
    // (legal for paragraphScheme) then read under bekkerStandard (grid-only-ish).
    setViewMode('doc-e', paragraphScheme, 'paragraph');
    expect(currentViewMode('doc-e', bekkerStandard)).toBe('grid'); // 'paragraph' not legal for bekker
  });

  it('a legal grid choice sticks for a line doc', () => {
    setViewMode('doc-b', plainLineScheme, 'paragraph');
    expect(currentViewMode('doc-b', plainLineScheme)).toBe('paragraph');
  });
});

describe('interpolated granularity (stubbed hidden this phase)', () => {
  it('defaults to the row unit', () => {
    expect(currentGranularity('doc-a')).toBe('unit');
  });

  it('persists a valid granularity per work', () => {
    setGranularity('gran-a', 'sentence');
    expect(currentGranularity('gran-a')).toBe('sentence');
    expect(currentGranularity('gran-b')).toBe('unit');
  });
});
