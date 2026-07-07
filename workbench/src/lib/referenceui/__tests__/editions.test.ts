import { describe, expect, it } from 'vitest';
import { MANIFEST_FILE, MemReferenceStorage, serializeReferenceChapterFile } from '../../reference/storage';
import { createManifest, referenceChapterFileName, serializeManifest, upsertChapter } from '../../reference/manifest';
import type { ReferenceManifest } from '../../reference/types';
import {
  editionPrefKey,
  loadChapterBody,
  loadEditions,
  readEditionPref,
  resolveActiveSlug,
  writeEditionPref,
  type KVStore,
} from '../editions';

const NOW = '2026-07-03T00:00:00.000Z';

async function seedEdition(
  storage: MemReferenceStorage,
  workId: string,
  slug: string,
  displayName: string,
  chapters: Array<{ book: number; chapter: number; body: string }> = [],
): Promise<ReferenceManifest> {
  let manifest = createManifest(workId, slug, displayName, NOW);
  for (const { book, chapter, body } of chapters) {
    const file = referenceChapterFileName(book, chapter);
    await storage.write(
      workId,
      slug,
      file,
      serializeReferenceChapterFile({ work: workId, book, chapter, edition: slug }, body),
    );
    manifest = upsertChapter(manifest, { book, chapter, file }, NOW);
  }
  await storage.write(workId, slug, MANIFEST_FILE, serializeManifest(manifest));
  return manifest;
}

describe('loadEditions', () => {
  it('returns parsed manifests for every edition of a work', async () => {
    const storage = new MemReferenceStorage();
    await seedEdition(storage, 'metaphysics', 'bostock', 'Bostock (1994)');
    await seedEdition(storage, 'metaphysics', 'ross', 'Ross (Oxford, 1924)');
    const { editions, corruptSlugs } = await loadEditions(storage, 'metaphysics');
    expect(editions.map((e) => e.slug)).toEqual(['bostock', 'ross']);
    expect(editions.map((e) => e.displayName)).toEqual(['Bostock (1994)', 'Ross (Oxford, 1924)']);
    expect(corruptSlugs).toEqual([]);
  });

  it('is empty for a work with no imports', async () => {
    const storage = new MemReferenceStorage();
    const { editions, corruptSlugs } = await loadEditions(storage, 'metaphysics');
    expect(editions).toEqual([]);
    expect(corruptSlugs).toEqual([]);
  });

  it('sets aside editions whose manifest is unparsable or missing', async () => {
    const storage = new MemReferenceStorage();
    await seedEdition(storage, 'metaphysics', 'ross', 'Ross (Oxford, 1924)');
    await storage.write('metaphysics', 'broken', MANIFEST_FILE, 'not json {');
    await storage.write('metaphysics', 'headless', 'chapter-07-17.md', 'body without a manifest');
    const { editions, corruptSlugs } = await loadEditions(storage, 'metaphysics');
    expect(editions.map((e) => e.slug)).toEqual(['ross']);
    expect(corruptSlugs).toEqual(['broken', 'headless']);
  });

  it('does not leak editions across works', async () => {
    const storage = new MemReferenceStorage();
    await seedEdition(storage, 'metaphysics', 'ross', 'Ross');
    await seedEdition(storage, 'posterior-analytics', 'mure', 'Mure');
    const { editions } = await loadEditions(storage, 'posterior-analytics');
    expect(editions.map((e) => e.slug)).toEqual(['mure']);
  });
});

describe('resolveActiveSlug', () => {
  const editions = [
    createManifest('metaphysics', 'bostock', 'Bostock', NOW),
    createManifest('metaphysics', 'ross', 'Ross', NOW),
  ];

  it('prefers the remembered slug when it still exists', () => {
    expect(resolveActiveSlug(editions, 'ross')).toBe('ross');
  });

  it('falls back to the first edition when the remembered slug is gone', () => {
    expect(resolveActiveSlug(editions, 'jaeger')).toBe('bostock');
  });

  it('falls back to the first edition when nothing is remembered', () => {
    expect(resolveActiveSlug(editions, null)).toBe('bostock');
  });

  it('returns null when the work has no editions', () => {
    expect(resolveActiveSlug([], 'ross')).toBeNull();
  });
});

describe('edition preference persistence (per work)', () => {
  function fakeKV(): KVStore & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
    };
  }

  it('round-trips a slug keyed by work', () => {
    const kv = fakeKV();
    writeEditionPref(kv, 'metaphysics', 'ross');
    writeEditionPref(kv, 'posterior-analytics', 'mure');
    expect(readEditionPref(kv, 'metaphysics')).toBe('ross');
    expect(readEditionPref(kv, 'posterior-analytics')).toBe('mure');
    expect(kv.map.has(editionPrefKey('metaphysics'))).toBe(true);
  });

  it('reads null when nothing was stored or no store exists', () => {
    expect(readEditionPref(fakeKV(), 'metaphysics')).toBeNull();
    expect(readEditionPref(undefined, 'metaphysics')).toBeNull();
  });

  it('swallows storage errors (best-effort persistence)', () => {
    const throwing: KVStore = {
      getItem: () => {
        throw new Error('quota');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => writeEditionPref(throwing, 'metaphysics', 'ross')).not.toThrow();
    expect(readEditionPref(throwing, 'metaphysics')).toBeNull();
  });
});

describe('loadChapterBody', () => {
  it('returns the stored body for an imported chapter', async () => {
    const storage = new MemReferenceStorage();
    const manifest = await seedEdition(storage, 'metaphysics', 'ross', 'Ross', [
      { book: 7, chapter: 17, body: 'We have to inquire what substance is.\n\nSecond paragraph.' },
    ]);
    const body = await loadChapterBody(storage, manifest, 7, 17);
    expect(body).toBe('We have to inquire what substance is.\n\nSecond paragraph.');
  });

  it('returns null for a chapter the edition never imported', async () => {
    const storage = new MemReferenceStorage();
    const manifest = await seedEdition(storage, 'metaphysics', 'ross', 'Ross', [
      { book: 7, chapter: 17, body: 'Z.17.' },
    ]);
    expect(await loadChapterBody(storage, manifest, 7, 16)).toBeNull();
  });

  it('returns null when the manifest entry points at a missing file', async () => {
    const storage = new MemReferenceStorage();
    const manifest = await seedEdition(storage, 'metaphysics', 'ross', 'Ross', [
      { book: 7, chapter: 17, body: 'Z.17.' },
    ]);
    await storage.remove('metaphysics', 'ross', referenceChapterFileName(7, 17));
    expect(await loadChapterBody(storage, manifest, 7, 17)).toBeNull();
  });

  it('returns null when the chapter file is malformed', async () => {
    const storage = new MemReferenceStorage();
    const manifest = await seedEdition(storage, 'metaphysics', 'ross', 'Ross', [
      { book: 7, chapter: 17, body: 'Z.17.' },
    ]);
    await storage.write('metaphysics', 'ross', referenceChapterFileName(7, 17), 'no front-matter');
    expect(await loadChapterBody(storage, manifest, 7, 17)).toBeNull();
  });
});
