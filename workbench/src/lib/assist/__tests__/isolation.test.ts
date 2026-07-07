// D4 §4c / §6 hard constraint, made executable: `src/lib/assist/` must never
// import from `editor/model`, `library/storage`, or `chapterfile`. Assist's
// ONLY reach into the editor is the (editor-owned) public
// `insertSuggestion(text)` command — a suggestion enters the document
// through a normal ProseMirror transaction, never through assist code
// touching the model or files directly.
//
// This is a source-level grep test, not a type check — nothing in the type
// system stops an accidental `import ... from '../editor/model'` from
// compiling. Uses the same dynamic node:fs/node:path/node:url import trick
// as citation/__tests__/schemeIdIsolation.test.ts (this project has no
// @types/node, so a static `import 'node:fs'` fails `tsc --noEmit` even
// though vitest's node environment provides it at runtime).
import { beforeAll, describe, expect, it } from 'vitest';

type FS = {
  readFileSync(path: string, encoding: 'utf-8'): string;
  readdirSync(path: string, opts: { withFileTypes: true }): { name: string; isDirectory(): boolean; isFile(): boolean }[];
};
type PathMod = { join(...parts: string[]): string; relative(from: string, to: string): string };
type URLMod = { fileURLToPath(url: URL): string };

let fs: FS;
let pathMod: PathMod;
let assistRoot: string;

// Forbidden import targets (module-path fragments). Matched against the
// literal text inside `from '...'` / `import('...')` so this catches both
// relative (`../editor/model`) and any future alias forms.
const FORBIDDEN_FRAGMENTS = ['editor/model', 'library/storage', 'chapterfile'];

function listTsFiles(fsMod: FS, path: PathMod, dir: string): string[] {
  const out: string[] = [];
  for (const entry of fsMod.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFiles(fsMod, path, full));
    } else if (entry.isFile() && full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

beforeAll(async () => {
  fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as FS;
  pathMod = (await import(/* @vite-ignore */ 'node' + ':path')) as unknown as PathMod;
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as URLMod;
  assistRoot = nodeUrl.fileURLToPath(new URL('..', import.meta.url)); // src/lib/assist/
});

describe('assist source isolation (D4 hard constraint)', () => {
  it('no file under src/lib/assist/ imports from editor/model, library/storage, or chapterfile', () => {
    const files = listTsFiles(fs, pathMod, assistRoot);
    expect(files.length).toBeGreaterThan(0); // sanity: the scan actually found files

    const violations: string[] = [];
    const importLineRe = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

    for (const file of files) {
      const rel = pathMod.relative(assistRoot, file).replace(/\\/g, '/');
      // This file's own comments discuss the forbidden fragments as prose
      // (documenting the rule), not as real imports — same self-exclusion
      // pattern as citation/__tests__/schemeIdIsolation.test.ts.
      if (rel === '__tests__/isolation.test.ts') continue;
      const source = fs.readFileSync(file, 'utf-8');
      let match: RegExpExecArray | null;
      while ((match = importLineRe.exec(source)) !== null) {
        const specifier = match[1];
        for (const fragment of FORBIDDEN_FRAGMENTS) {
          if (specifier.includes(fragment)) {
            violations.push(`${rel}: imports "${specifier}" (forbidden fragment "${fragment}")`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('sanity: the isolation test itself does not silently scan zero files (guards against a broken root)', () => {
    const files = listTsFiles(fs, pathMod, assistRoot);
    const names = files.map((f) => pathMod.relative(assistRoot, f).replace(/\\/g, '/'));
    expect(names).toEqual(expect.arrayContaining(['provider.ts', 'prompt.ts', 'parse.ts']));
  });
});
