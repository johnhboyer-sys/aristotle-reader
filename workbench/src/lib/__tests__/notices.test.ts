// THIRD-PARTY-NOTICES must name every crate in Cargo.lock and every npm
// package the app ships. The check reads the lockfiles, not `cargo metadata`
// or node_modules (which scripts/gen-notices.mjs reads), so it does not
// compare the generator with itself. Regenerate with `npm run notices`.
import { beforeAll, describe, expect, it } from 'vitest';

interface Pkg {
  kind: 'crate' | 'npm';
  name: string;
  version: string;
}
interface Coverage {
  BUNDLED_DEV_PACKAGES: string[];
  cratesFromCargoLock(text: string): Pkg[];
  npmFromPackageLock(lock: unknown): Pkg[];
  missingFromNotices(notices: string, pkgs: Pkg[]): Pkg[];
}

let cov: Coverage;
let readText: (rel: string) => string;

beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
    readFileSync(path: string, encoding: 'utf-8'): string;
  };
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
    fileURLToPath(url: URL): string;
  };
  readText = (rel) => fs.readFileSync(nodeUrl.fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
  cov = (await import(/* @vite-ignore */ '../../../scripts/' + 'notices-coverage.mjs')) as Coverage;
});

const LOCK = `
[[package]]
name = "serde"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "translation-workbench"
version = "0.1.0"
`;

describe('notices check', () => {
  it('reports a crate that is missing from the notices', () => {
    const crates = cov.cratesFromCargoLock(LOCK);
    expect(crates).toEqual([{ kind: 'crate', name: 'serde', version: '1.0.0' }]);
    const notices = '=== crate: other 2.0.0 ===\n';
    expect(cov.missingFromNotices(notices, crates)).toEqual(crates);
  });

  it('reports an npm package that is missing, and passes one that is there', () => {
    const lock = {
      packages: {
        '': { name: 'translation-workbench' },
        'node_modules/js-yaml': { version: '4.3.0' },
        'node_modules/argparse': { version: '2.0.1' },
        'node_modules/vitest': { version: '4.0.0', dev: true },
        'node_modules/svelte': { version: '5.0.0', dev: true },
        'node_modules/clsx': { version: '2.0.0', dev: true },
        'node_modules/esm-env': { version: '1.0.0', dev: true },
        'node_modules/vite': { version: '6.0.0', dev: true },
      },
    };
    const pkgs = cov.npmFromPackageLock(lock);
    // vitest is dev and not bundled; svelte and the rest are dev but bundled.
    expect(pkgs.map((p) => p.name)).toEqual(['js-yaml', 'argparse', 'svelte', 'clsx', 'esm-env', 'vite']);
    const notices = ['js-yaml 4.3.0', 'svelte 5.0.0', 'clsx 2.0.0', 'esm-env 1.0.0', 'vite 6.0.0']
      .map((p) => `=== npm: ${p} ===`)
      .join('\n');
    expect(cov.missingFromNotices(notices, pkgs)).toEqual([{ kind: 'npm', name: 'argparse', version: '2.0.1' }]);
  });

  it('a different version of a package does not count', () => {
    const crates = cov.cratesFromCargoLock(LOCK);
    expect(cov.missingFromNotices('=== crate: serde 1.0.1 ===\n', crates)).toEqual(crates);
  });

  it('says so when it examined no packages', () => {
    expect(() => cov.missingFromNotices('=== crate: serde 1.0.0 ===\n', [])).toThrow(/no packages/);
    expect(() => cov.cratesFromCargoLock('')).toThrow(/no crates/);
    expect(() => cov.npmFromPackageLock({ packages: {} })).toThrow(/no npm packages/);
  });

  it('says so when the notices name no packages', () => {
    expect(() => cov.missingFromNotices('', cov.cratesFromCargoLock(LOCK))).toThrow(/names no packages/);
  });

  it('throws when a bundled dev package is not in the lockfile', () => {
    const lock = { packages: { 'node_modules/js-yaml': { version: '4.3.0' } } };
    expect(() => cov.npmFromPackageLock(lock)).toThrow(/svelte/);
  });
});

describe('THIRD-PARTY-NOTICES (the real file)', () => {
  it('names every crate in Cargo.lock and every npm package the app ships', () => {
    const crates = cov.cratesFromCargoLock(readText('../../../src-tauri/Cargo.lock'));
    const npm = cov.npmFromPackageLock(JSON.parse(readText('../../../package-lock.json')));
    // Guards against a parser that quietly finds nothing.
    expect(crates.length).toBeGreaterThan(400);
    expect(npm.length).toBeGreaterThan(20);
    const notices = readText('../../../src-tauri/resources/THIRD-PARTY-NOTICES');
    const missing = cov.missingFromNotices(notices, [...crates, ...npm]);
    expect(missing.map((p) => `${p.kind} ${p.name} ${p.version}`), 'run `npm run notices`').toEqual([]);
  });

  it('carries the font licence and the MPL source statement', () => {
    const notices = readText('../../../src-tauri/resources/THIRD-PARTY-NOTICES');
    expect(notices).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(notices).toContain('David J. Perry');
    expect(notices).toContain('EB Garamond');
    expect(notices).toMatch(/Mozilla Public License[\s\S]*source code for cssparser/);
  });

  it('carries the GPL text for the pandoc reference document', () => {
    const notices = readText('../../../src-tauri/resources/THIRD-PARTY-NOTICES');
    expect(notices).toContain('GNU GENERAL PUBLIC LICENSE\nVersion 2, June 1991');
  });

  it('fills every standard text with a copyright holder (Grok review)', () => {
    const notices = readText('../../../src-tauri/resources/THIRD-PARTY-NOTICES');
    expect(notices).not.toMatch(/^Copyright \(c\) </m);
    // objc2-foundation names no authors and ships no licence file.
    expect(notices).toContain('Copyright (c) the objc2-foundation authors');
  });

  it('finds licence files below a package root (Grok review)', () => {
    const notices = readText('../../../src-tauri/resources/THIRD-PARTY-NOTICES');
    expect(notices).toMatch(/=== crate: regex-syntax [^\n]*\n(?:[^=\n][^\n]*\n)*Licence texts: [^\n]*src\/unicode_tables\/LICENSE-UNICODE/);
    expect(notices).not.toMatch(/Licence texts: [^\n]*\.rs\b/);
  });
});
