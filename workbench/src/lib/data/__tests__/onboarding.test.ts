import { describe, expect, it } from 'vitest';
import { copyBundledResourceIfPresent, copySharedLsjIfMissing } from '../onboarding';
import type { FsModule } from '../onboarding';

// SYNTHETIC fixture only — a fake in-memory filesystem, no TLG-derived text.
//
// Exercises the two pure-ish resource-copy helpers used by onboardWork's
// "bundled resource → app data" steps, without touching Tauri or the real
// filesystem: path mapping (source resource path -> destination app-data
// path) and the lsj/ idempotence guard (never re-copy once present).

const BaseDirectory = { Resource: 'Resource', AppData: 'AppData' } as const;

/** A tiny fake matching the subset of @tauri-apps/plugin-fs this module uses. */
function makeFakeFs(opts: {
  resourceFiles?: Record<string, string>;
  appDataFiles?: Record<string, string>;
  resourceDirs?: Record<string, string[]>; // dir path -> file names
}) {
  const resourceFiles = new Map(Object.entries(opts.resourceFiles ?? {}));
  const appDataFiles = new Map(Object.entries(opts.appDataFiles ?? {}));
  const appDataDirs = new Set<string>();
  const resourceDirs = new Map(Object.entries(opts.resourceDirs ?? {}));

  const fs = {
    BaseDirectory,
    async exists(path: string, o: { baseDir: string }) {
      if (o.baseDir === BaseDirectory.Resource) {
        return resourceFiles.has(path) || resourceDirs.has(path);
      }
      return appDataFiles.has(path) || appDataDirs.has(path);
    },
    async readTextFile(path: string, o: { baseDir: string }) {
      const store = o.baseDir === BaseDirectory.Resource ? resourceFiles : appDataFiles;
      const v = store.get(path);
      if (v === undefined) throw new Error(`not found: ${path}`);
      return v;
    },
    async writeTextFile(path: string, contents: string, o: { baseDir: string }) {
      const store = o.baseDir === BaseDirectory.Resource ? resourceFiles : appDataFiles;
      store.set(path, contents);
    },
    async mkdir(path: string, o: { baseDir: string; recursive?: boolean }) {
      if (o.baseDir === BaseDirectory.AppData) appDataDirs.add(path);
    },
    async readDir(path: string, o: { baseDir: string }) {
      const names = o.baseDir === BaseDirectory.Resource ? resourceDirs.get(path) ?? [] : [];
      return names.map((name) => ({ name, isFile: true, isDirectory: false, isSymlink: false }));
    },
    async copyFile(
      from: string,
      to: string,
      o: { fromPathBaseDir: string; toPathBaseDir: string },
    ) {
      const src = o.fromPathBaseDir === BaseDirectory.Resource ? resourceFiles : appDataFiles;
      const dst = o.toPathBaseDir === BaseDirectory.Resource ? resourceFiles : appDataFiles;
      const v = src.get(from);
      if (v === undefined) throw new Error(`copyFile: source not found: ${from}`);
      dst.set(to, v);
    },
  };

  return { fs: fs as unknown as FsModule, resourceFiles, appDataFiles, appDataDirs, resourceDirs };
}

describe('copyBundledResourceIfPresent', () => {
  it('copies resource contents to the app-data path when the resource exists', async () => {
    const { fs, appDataFiles } = makeFakeFs({
      resourceFiles: { 'corpus/metaphysics/analyses.json': '{"lemma":"data"}' },
    });

    await copyBundledResourceIfPresent(
      fs,
      'corpus/metaphysics/analyses.json',
      'corpus/metaphysics/analyses.json',
    );

    expect(appDataFiles.get('corpus/metaphysics/analyses.json')).toBe('{"lemma":"data"}');
  });

  it('supports differing resource and app-data path mappings', async () => {
    const { fs, appDataFiles } = makeFakeFs({
      resourceFiles: { 'corpus/apo/analyses.json': '{"x":1}' },
    });

    await copyBundledResourceIfPresent(
      fs,
      'corpus/apo/analyses.json',
      'corpus/posterior-analytics/analyses.json',
    );

    expect(appDataFiles.get('corpus/posterior-analytics/analyses.json')).toBe('{"x":1}');
    expect(appDataFiles.has('corpus/apo/analyses.json')).toBe(false);
  });

  it('is a silent no-op when the resource does not exist', async () => {
    const { fs, appDataFiles } = makeFakeFs({});

    await copyBundledResourceIfPresent(
      fs,
      'corpus/unsupported-work/analyses.json',
      'corpus/unsupported-work/analyses.json',
    );

    expect(appDataFiles.size).toBe(0);
  });

  it('does not throw when readTextFile fails after exists() returns true', async () => {
    const { fs } = makeFakeFs({ resourceFiles: {} });
    // Force an inconsistent state: exists() true, read throws.
    (fs as unknown as { exists: () => Promise<boolean> }).exists = async () => true;

    await expect(
      copyBundledResourceIfPresent(fs, 'corpus/x/analyses.json', 'corpus/x/analyses.json'),
    ).resolves.toBeUndefined();
  });
});

describe('copySharedLsjIfMissing', () => {
  it('copies every shard from resources into app data when app data has none yet', async () => {
    const { fs, appDataFiles, appDataDirs } = makeFakeFs({
      resourceDirs: { 'corpus/lsj': ['a.json', 'b.json'] },
      resourceFiles: {
        'corpus/lsj/a.json': '{"a":1}',
        'corpus/lsj/b.json': '{"b":2}',
      },
    });

    await copySharedLsjIfMissing(fs);

    expect(appDataDirs.has('corpus/lsj')).toBe(true);
    expect(appDataFiles.get('corpus/lsj/a.json')).toBe('{"a":1}');
    expect(appDataFiles.get('corpus/lsj/b.json')).toBe('{"b":2}');
  });

  it('idempotence guard: skips entirely once corpus/lsj already exists in app data', async () => {
    const { fs, appDataFiles } = makeFakeFs({
      resourceDirs: { 'corpus/lsj': ['a.json'] },
      resourceFiles: { 'corpus/lsj/a.json': '{"a":1}' },
      appDataFiles: { 'corpus/lsj/stale.json': 'PRE-SEEDED' },
    });
    // Mark corpus/lsj as already present in app data (pre-seeded install).
    const appData = fs as unknown as { exists: (p: string, o: { baseDir: string }) => Promise<boolean> };
    const original = appData.exists.bind(fs);
    appData.exists = async (p, o) => (p === 'corpus/lsj' && o.baseDir === 'AppData' ? true : original(p, o));

    await copySharedLsjIfMissing(fs);

    // Untouched: the pre-seeded marker file is still the only app-data file,
    // and the fresh shard from resources was never copied in.
    expect(appDataFiles.has('corpus/lsj/a.json')).toBe(false);
    expect(appDataFiles.get('corpus/lsj/stale.json')).toBe('PRE-SEEDED');
  });

  it('is a silent no-op when no lsj resource directory is bundled', async () => {
    const { fs, appDataFiles, appDataDirs } = makeFakeFs({});

    await copySharedLsjIfMissing(fs);

    expect(appDataFiles.size).toBe(0);
    expect(appDataDirs.size).toBe(0);
  });

  it('skips non-file entries in the resource directory listing', async () => {
    const { fs, appDataFiles } = makeFakeFs({
      resourceDirs: { 'corpus/lsj': ['a.json'] },
      resourceFiles: { 'corpus/lsj/a.json': '{"a":1}' },
    });
    const original = fs.readDir.bind(fs) as unknown as (
      path: string,
      o: { baseDir: string },
    ) => Promise<{ name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }[]>;
    (fs as unknown as { readDir: unknown }).readDir = async (path: string, o: { baseDir: string }) => {
      const entries = await original(path, o);
      return [...entries, { name: 'subdir', isFile: false, isDirectory: true, isSymlink: false }];
    };

    await copySharedLsjIfMissing(fs);

    expect(appDataFiles.has('corpus/lsj/a.json')).toBe(true);
    expect(appDataFiles.has('corpus/lsj/subdir')).toBe(false);
  });
});
