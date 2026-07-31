// Live check of the morphology reader against real Morpheus data, in BOTH
// languages. The byte-offset index maths is the one part of word parsing that
// unit fixtures cannot honestly prove, and getting it wrong is silent — a
// merged start/end index resolves NOTHING while looking perfectly healthy.
// This drives the SHIPPING parsePrefixIndex / blockRange / parseAnalysesField
// with node:fs standing in for plugin-fs.
//
// It reads Diogenes' copies of the files. A lexicon pack ships byte-identical
// copies of exactly these two files per language (scripts/build_lexicon_pack.py
// copies them verbatim), so this is the same data the app reads at runtime —
// Diogenes is just the stable path to find it at on the packager's machine.
//
// Self-skipping: without those files there is nothing to check, and that is a
// normal machine, not a failure.
//
// node:fs is reached through a local structural shim rather than @types/node:
// this package's tsconfig is frontend-only by design (see pandoc.ts's header
// for the same treatment), and this deliverable is not the place to add a
// toolchain dependency.
import { describe, expect, it } from 'vitest';
import { parsePrefixIndex, blockRange, parseAnalysesField } from '../morphology';
import { latinLookupVariants, toLatinKey, isCapitalizedSurface } from '../latinKey';
import { latinBaseKey } from '../provider';

interface NodeFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: string): string;
  openSync(path: string, flags: string): number;
  readSync(fd: number, buffer: Uint8Array, offset: number, length: number, position: number): number;
  closeSync(fd: number): void;
}
// The specifier goes through a variable so TypeScript resolves it as a dynamic
// import rather than a typed module — the same move pandoc.ts makes.
const fsSpecifier = 'node:fs';
const { existsSync, readFileSync, openSync, readSync, closeSync } = (await import(
  /* @vite-ignore */ fsSpecifier
)) as unknown as NodeFs;

const DATA = '/Applications/Diogenes.app/Contents/dependencies/data';

/** One language's reader, built the same way the app builds it. */
function reader(stem: string) {
  const idt = `${DATA}/${stem}-analyses.idt`;
  const txt = `${DATA}/${stem}-analyses.txt`;
  if (!existsSync(idt) || !existsSync(txt)) return null;
  const index = parsePrefixIndex(readFileSync(idt, 'utf8'));
  if (!index) return null;

  const blocks = new Map<string, Map<string, string>>();
  const readBlock = (prefix: string) => {
    const cached = blocks.get(prefix);
    if (cached) return cached;
    const { start, end } = blockRange(prefix, index);
    const buf = new Uint8Array(end - start);
    const fd = openSync(txt, 'r');
    const got = readSync(fd, buf, 0, end - start, start);
    closeSync(fd);
    const lines = new TextDecoder('utf-8').decode(buf.subarray(0, got)).split('\n');
    const table = new Map<string, string>();
    for (let i = 0; i < lines.length - 1; i++) {
      const tab = lines[i].indexOf('\t');
      if (tab > 0) table.set(lines[i].slice(0, tab), lines[i].slice(tab + 1));
    }
    blocks.set(prefix, table);
    return table;
  };
  const prefixFor = (key: string) => {
    for (let len = Math.min(3, key.length); len >= 1; len--) {
      const c = key.slice(0, len);
      if (index.starts.has(c)) return c;
    }
    return null;
  };
  const byVariants = (variants: string[]) => {
    for (const v of variants) {
      const p = prefixFor(v);
      if (!p) continue;
      const raw = readBlock(p).get(v);
      if (raw) {
        const a = parseAnalysesField(raw);
        if (a.length) return a;
      }
    }
    return [];
  };
  return { index, byVariants };
}

const latin = reader('latin');
const greek = reader('greek');

function lookup(surface: string) {
  return latin!.byVariants(latinLookupVariants(toLatinKey(surface), isCapitalizedSurface(surface)));
}

describe.skipIf(!latin)('Latin morphology against real Morpheus data', () => {
  it('parses the index into two distinct hashes', () => {
    const index = latin!.index;
    expect(index.starts.size).toBeGreaterThan(3000);
    expect(index.ends.size).toBeGreaterThan(3000);
    // The bug this pins: merged hashes gave 'vir' an END offset as its start.
    expect(index.starts.get('vir')).toBeLessThan(index.ends.get('vir')!);
  });

  it('resolves ordinary inflected forms', () => {
    expect(lookup('virtutem').map((a) => `${a.lemma}|${a.parse}`)).toContain('virtus|fem acc sg');
    expect(lookup('amicitiae').map((a) => a.lemma)).toContain('amicitia');
    expect(lookup('deorum').map((a) => a.lemma)).toContain('deus');
  });

  it('returns every reading of an ambiguous form', () => {
    const lemmas = lookup('esse').map((a) => a.lemma);
    expect(lemmas).toContain('sum#1');
    expect(lemmas).toContain('edo#1');
  });

  it('resolves a capitalized proper name through the capital-key fallback', () => {
    expect(lookup('Ciceronem').map((a) => a.lemma)).toContain('Cicero');
    expect(lookup('Athenis').length).toBeGreaterThan(0);
  });

  it('resolves an enclitic through the split fallback, whole form first', () => {
    // Diogenes marks homonyms (populus#1 the people, populus#2 the poplar);
    // latinBaseKey is what reduces them to the dictionary's headword.
    expect(lookup('populusque').map((a) => latinBaseKey(a.lemma))).toContain('populus');
    // "quisque" is its own lemma — it must NOT come back as "quis".
    expect(lookup('quisque').map((a) => a.lemma)).toContain('quisque');
  });

  it('a word Morpheus does not know is an empty result, not a throw', () => {
    expect(lookup('zzzznotaword')).toEqual([]);
  });
});

// Greek uses the SAME reader — the whole point of generalizing it from the
// Latin-only first cut. Keys here are Beta Code, so the variant chain is the
// provider's (capital marker, grave→acute, enclitic accent), not Latin's.
describe.skipIf(!greek)('Greek morphology against real Morpheus data', () => {
  const g = (beta: string) => greek!.byVariants([beta]);

  it('parses the Greek index into two distinct hashes', () => {
    expect(greek!.index.starts.size).toBeGreaterThan(1000);
    expect(greek!.index.ends.size).toBeGreaterThan(1000);
  });

  it('resolves ordinary inflected forms, with their glosses', () => {
    const logos = g('lo/gos');
    expect(logos.map((a) => a.lemma)).toContain('lo/gos');
    expect(logos[0].parse).toBe('masc nom sg');
    // Greek carries a real gloss where Latin's slot is always blank.
    expect(logos[0].gloss).toContain('computation');

    expect(g('a)nqrw/pou').map((a) => `${a.lemma}|${a.parse}`)).toContain('a)/nqrwpos|masc gen sg');
  });

  it('resolves a verb form to its lemma', () => {
    expect(g('ei)=nai').map((a) => a.lemma)).toContain('ei)mi/');
    expect(g('e)/stin').map((a) => a.lemma)).toContain('ei)mi/');
  });

  it('resolves a capital-marked proper name', () => {
    expect(g('*)aristote/lhs').length).toBeGreaterThan(0);
  });

  it('a form Morpheus does not know is an empty result', () => {
    expect(g('zzzznotagreekword')).toEqual([]);
  });
});
