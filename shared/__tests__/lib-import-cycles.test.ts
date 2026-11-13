// No import cycle behind the modules app/scripts/check-redesign.mjs loads.
// Its loader follows each module's imports with no cycle guard, so one cycle
// (citation.ts -> data.ts -> citation.ts, Nov 2026) crashed every site gate
// with "Maximum call stack size exceeded". The graph here is built the way
// that loader builds it: transpile, then follow every remaining `from '...'`
// (type-only imports vanish in the transpile, as they do there), with
// `@shared/` read as shared/.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), '../lib');
const SHARED = resolve(LIB, '..');
const APP_LIB = resolve(SHARED, '../app/src/lib');
// The gate's four entries (check-redesign.mjs), and the citation pair.
const ENTRIES = [
  join(APP_LIB, 'lemma-view.ts'),
  join(LIB, 'search-url.ts'),
  join(LIB, 'search.ts'),
  join(LIB, 'glossary.ts'),
  join(LIB, 'citation.ts'),
  join(LIB, 'data.ts'),
];

function edges(file: string): string[] {
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
  }).outputText;
  return [...js.matchAll(/from ['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    .filter((s) => s.startsWith('.') || s.startsWith('@shared/'))
    .map((s) => (s.startsWith('@shared/') ? join(SHARED, s.slice(8)) : resolve(dirname(file), s)))
    .filter((p) => !p.endsWith('?raw'))
    .map((p) => (p.endsWith('.ts') ? p : p + '.ts'));
}

function findCycle(start: string, next: (f: string) => string[] = edges): string[] | null {
  const path: string[] = [];
  const done = new Set<string>();
  const walk = (f: string): string[] | null => {
    const at = path.indexOf(f);
    if (at >= 0) return [...path.slice(at), f];
    if (done.has(f)) return null;
    path.push(f);
    for (const g of next(f)) {
      const c = walk(g);
      if (c) return c;
    }
    path.pop();
    done.add(f);
    return null;
  };
  return walk(start);
}

describe('import graph behind the redesign gate', () => {
  it('examines real modules with real imports', () => {
    for (const f of ENTRIES) expect(existsSync(f), f).toBe(true);
    expect(edges(join(LIB, 'data.ts')).length).toBeGreaterThan(0);
    expect(edges(join(APP_LIB, 'lemma-view.ts')).some((p) => p.startsWith(LIB))).toBe(true);
  });

  it('finds a cycle when there is one', () => {
    const g: Record<string, string[]> = { a: ['b'], b: ['c'], c: ['b'], d: ['a'] };
    expect(findCycle('d', (f) => g[f])).toEqual(['b', 'c', 'b']);
    expect(findCycle('c', (f) => (f === 'c' ? [] : g[f]))).toBeNull();
  });

  it.each(ENTRIES.map((f) => [relative(SHARED, f), f]))('%s reaches no cycle', (_, f) => {
    const cycle = findCycle(f);
    expect(cycle?.map((p) => relative(SHARED, p)).join(' -> ') ?? null).toBeNull();
  });
});
