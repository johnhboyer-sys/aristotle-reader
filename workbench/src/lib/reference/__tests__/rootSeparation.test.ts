// Regression test for design doc D5's hard rule: "the default [referenceRoot]
// is never derived from libraryRoot" (S1a). settings.ts stores both fields as
// plain optional strings with independent defaults (undefined = the module's
// own hardcoded default path), so there is no runtime "derive" computation to
// unit-test directly — instead this test pins the two literal default path
// segments apart, so a future edit that makes one default from the other
// (e.g. `references/${libraryRoot}` or reusing the same constant) trips it.
//
// Uses the same dynamic node:fs/node:url import trick as
// citation/__tests__/schemeIdIsolation.test.ts and
// assist/__tests__/isolation.test.ts (this project has no @types/node, so a
// static `import 'node:fs'` fails `tsc --noEmit` even though vitest's node
// environment provides it at runtime).
import { beforeAll, describe, expect, it } from 'vitest';
import type { WorkbenchSettings } from '../../settings';

type FS = { readFileSync(path: string, encoding: 'utf-8'): string };
type URLMod = { fileURLToPath(url: URL): string };

let fs: FS;
let settingsPath: string;
let libraryStoragePath: string;
let referenceStoragePath: string;

beforeAll(async () => {
  fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as FS;
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as URLMod;
  // this file: src/lib/reference/__tests__/rootSeparation.test.ts
  settingsPath = nodeUrl.fileURLToPath(new URL('../../settings.ts', import.meta.url));
  libraryStoragePath = nodeUrl.fileURLToPath(new URL('../../library/storage.ts', import.meta.url));
  referenceStoragePath = nodeUrl.fileURLToPath(new URL('../storage.ts', import.meta.url));
});

describe('referenceRoot default is independent of libraryRoot', () => {
  it('settings.ts declares referenceRoot and libraryRoot as separate optional fields', () => {
    const settingsSrc = fs.readFileSync(settingsPath, 'utf-8');
    // Both fields exist...
    expect(settingsSrc).toMatch(/referenceRoot\?:\s*string/);
    expect(settingsSrc).toMatch(/libraryRoot\?:\s*string/);
    // ...and neither is defined in terms of the other anywhere in the file
    // (e.g. no `referenceRoot = libraryRoot` / `referenceRoot ?? libraryRoot`).
    expect(settingsSrc).not.toMatch(/referenceRoot[^\n]*libraryRoot/);
    expect(settingsSrc).not.toMatch(/libraryRoot[^\n]*referenceRoot/);
  });

  it('an unset referenceRoot and an unset libraryRoot are both simply undefined (no fallback to each other)', () => {
    const settings: WorkbenchSettings = {};
    expect(settings.referenceRoot).toBeUndefined();
    expect(settings.libraryRoot).toBeUndefined();
  });

  it('setting only libraryRoot leaves referenceRoot untouched', () => {
    const settings: WorkbenchSettings = { libraryRoot: '/Users/john/Drive/library' };
    expect(settings.referenceRoot).toBeUndefined();
  });

  it('the hardcoded default path segment for references differs from the library one', () => {
    const librarySrc = fs.readFileSync(libraryStoragePath, 'utf-8');
    const referenceSrc = fs.readFileSync(referenceStoragePath, 'utf-8');
    // library/storage.ts's Phase-1 default is `library/<workId>/<file>` under AppData.
    expect(librarySrc).toMatch(/`library\/\$\{workId\}/);
    // reference/storage.ts's default is `references/<workId>/<slug>` under AppData —
    // a different literal segment, not `library/` reused or nested.
    expect(referenceSrc).toMatch(/`references\/\$\{workId\}/);
    expect(referenceSrc).not.toMatch(/`library\/\$\{workId\}/);
  });
});
