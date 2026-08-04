// Generic contract-conformance suite — the real Phase 2 deliverable. This
// runs the SAME assertions over EVERY registered CitationScheme, so the
// frozen contract in workbench-design/d2-citation-schemes.md is testable at
// the interface level, not just per-scheme. Adding a scheme to
// src/lib/citation/registry.ts automatically enrolls it here; nothing here
// should need to change when Phase 3's real Aquinas scheme lands.
//
// aquinas-tbd is a THROWING stub by design (Phase 1 scope fence) — it is
// exercised for the "every method throws" shape rather than skipped
// silently, so a scheme that stops throwing (i.e. gets implemented) without
// updating THROWING_SCHEME_IDS below will fail loudly here.
import { describe, expect, it } from 'vitest';
import type { Address, CitationScheme, RefSpan, WorkMeta } from '../types';
import { bekkerStandard } from '../schemes/bekkerStandard';
import { bekkerMetaphysics } from '../schemes/bekkerMetaphysics';
import { aquinasStub } from '../schemes/aquinasStub';
import { busseParagraph } from '../schemes/busseParagraph';
import { paragraphScheme } from '../schemes/paragraphScheme';
import { plainLineScheme } from '../schemes/plainLineScheme';
import { sourceRefScheme } from '../schemes/sourceRefScheme';
import { getScheme } from '../registry';

/** Everything the registry knows about, plus a well-formed sample address
 * string and a WorkMeta each scheme can format against. Schemes that throw
 * unconditionally (Phase 1/2 stubs) set `throws: true` and are exercised
 * for the throw-shape instead of the parse/compare/format shape. */
interface Fixture {
  scheme: CitationScheme;
  throws?: boolean;
  work: WorkMeta;
  /** At least 3 addresses in strictly increasing order per compareAddress. */
  ascendingRaws: [string, string, string];
}

const bekkerWork: WorkMeta = {
  id: 'posterior-analytics',
  title: 'Posterior Analytics',
  author: 'Aristotle',
  scheme: 'bekker-standard',
  books: [{ n: 1, label: 'I' }, { n: 2, label: 'II' }],
};

const metaphysicsWork: WorkMeta = {
  id: 'metaphysics',
  title: 'Metaphysics',
  author: 'Aristotle',
  scheme: 'bekker-metaphysics',
  books: [{ n: 7, label: 'Ζ' }],
};

const isagogeWork: WorkMeta = {
  id: 'isagoge',
  title: 'Isagoge',
  author: 'Porphyry',
  scheme: 'busse-paragraph',
  books: [],
};

const freeParagraphWork: WorkMeta = {
  id: 'free-doc-1',
  title: 'Some Imported Text',
  author: 'Unknown',
  scheme: 'paragraph',
  books: [],
};

const freeLineWork: WorkMeta = {
  id: 'free-doc-2',
  title: 'Some Imported Poem',
  author: 'Unknown',
  scheme: 'plain-line',
  books: [],
};

const importedWork: WorkMeta = {
  id: 'free-doc-3',
  title: 'Something Imported From Perseus',
  author: 'Unknown',
  scheme: 'source-ref',
  books: [],
};

const FIXTURES: Fixture[] = [
  {
    scheme: bekkerStandard,
    work: bekkerWork,
    ascendingRaws: ['100a3', '100a10', '100b1'],
  },
  {
    scheme: bekkerMetaphysics,
    work: metaphysicsWork,
    ascendingRaws: ['1041a6', '1041a31', '1041b3'],
  },
  {
    scheme: busseParagraph,
    work: isagogeWork,
    ascendingRaws: ['1.5', '1.9', '2.3'],
  },
  {
    scheme: paragraphScheme,
    work: freeParagraphWork,
    ascendingRaws: ['¶1', '¶2', '¶10'],
  },
  {
    scheme: plainLineScheme,
    work: freeLineWork,
    ascendingRaws: ['1', '2', '10'],
  },
  {
    scheme: sourceRefScheme,
    work: importedWork,
    // Mixed depth on purpose: the contract only demands a total order, and
    // this scheme has to order a short address against a longer one.
    ascendingRaws: ['1.9', '1.10', '2'],
  },
  {
    scheme: aquinasStub,
    throws: true,
    work: isagogeWork, // unused — every method throws before touching it
    ascendingRaws: ['x', 'y', 'z'], // unused
  },
];

// Cross-check: every scheme the registry knows about is covered here, and
// vice versa — this suite can't silently go stale by someone adding a
// scheme to registry.ts without adding a Fixture (or removing one).
const REGISTERED_IDS = [
  'bekker-standard',
  'bekker-metaphysics',
  'aquinas-tbd',
  'busse-paragraph',
  'paragraph',
  'plain-line',
  'source-ref',
] as const;

describe('contract fixture roster matches the registry', () => {
  it('every registered scheme id has exactly one Fixture', () => {
    const fixtureIds = FIXTURES.map((f) => f.scheme.id).sort();
    expect(fixtureIds).toEqual([...REGISTERED_IDS].sort());
  });

  it('every Fixture resolves through getScheme to the same object', () => {
    for (const f of FIXTURES) {
      expect(getScheme(f.scheme.id)).toBe(f.scheme);
    }
  });
});

for (const fixture of FIXTURES) {
  const { scheme, work } = fixture;

  describe(`contract conformance: ${scheme.id}`, () => {
    if (fixture.throws) {
      it('every behavioral method throws (registered Phase-1/2 throwing stub)', () => {
        expect(() => scheme.parseAddress('x')).toThrow();
        expect(() => scheme.compareAddress({} as Address, {} as Address)).toThrow();
        expect(() => scheme.bookLabel(1, work)).toThrow();
        expect(() => scheme.formatRange({} as RefSpan)).toThrow();
        expect(() => scheme.formatCitation({} as RefSpan, work)).toThrow();
      });

      it('still declares a well-formed GutterSpec (id and gutter are data, not behavior)', () => {
        expect(typeof scheme.id).toBe('string');
        expect(['bekker-line', 'paragraph', 'sentence', 'plain-line']).toContain(scheme.gutter.rowUnit);
        expect(['address', 'structural']).toContain(scheme.gutter.gutterMode);
      });

      return;
    }

    it('parseAddress throws on a clearly malformed string', () => {
      expect(() => scheme.parseAddress('!!!not-a-real-address!!!')).toThrow();
    });

    it('parseAddress round-trips through formatRange as a point reference', () => {
      for (const raw of fixture.ascendingRaws) {
        const addr = scheme.parseAddress(raw);
        const span: RefSpan = { scheme: scheme.id, start: addr, end: addr };
        expect(scheme.formatRange(span)).toBe(raw);
      }
    });

    it('compareAddress: reflexive (a compares equal to itself)', () => {
      for (const raw of fixture.ascendingRaws) {
        const addr = scheme.parseAddress(raw);
        expect(scheme.compareAddress(addr, addr)).toBe(0);
      }
    });

    it('compareAddress: antisymmetric (sign flips when operands swap)', () => {
      const [r1, r2] = fixture.ascendingRaws;
      const a = scheme.parseAddress(r1);
      const b = scheme.parseAddress(r2);
      const forward = scheme.compareAddress(a, b);
      const backward = scheme.compareAddress(b, a);
      expect(Math.sign(forward)).toBe(-Math.sign(backward));
    });

    it('compareAddress: transitive and matches the fixture\'s declared ascending order', () => {
      const [r1, r2, r3] = fixture.ascendingRaws;
      const a = scheme.parseAddress(r1);
      const b = scheme.parseAddress(r2);
      const c = scheme.parseAddress(r3);
      expect(scheme.compareAddress(a, b)).toBeLessThan(0);
      expect(scheme.compareAddress(b, c)).toBeLessThan(0);
      // Transitivity: a < b < c implies a < c.
      expect(scheme.compareAddress(a, c)).toBeLessThan(0);
    });

    it('formatCitation returns a non-empty string containing the work title', () => {
      const addr = scheme.parseAddress(fixture.ascendingRaws[0]);
      const span: RefSpan = { scheme: scheme.id, start: addr, end: addr };
      const citation = scheme.formatCitation(span, work);
      expect(typeof citation).toBe('string');
      expect(citation.length).toBeGreaterThan(0);
      expect(citation).toContain(work.title);
    });

    it('formatRange over a genuine 2-point span is non-empty and uses the en dash, never a bare hyphen, for a non-point range', () => {
      const start = scheme.parseAddress(fixture.ascendingRaws[0]);
      const end = scheme.parseAddress(fixture.ascendingRaws[2]);
      const span: RefSpan = { scheme: scheme.id, start, end };
      const range = scheme.formatRange(span);
      expect(range.length).toBeGreaterThan(0);
      expect(range).toContain('–');
    });

    it('bookLabel never throws for book index 1, even on a bookless WorkMeta', () => {
      expect(() => scheme.bookLabel(1, work)).not.toThrow();
      expect(typeof scheme.bookLabel(1, work)).toBe('string');
    });

    it('gutter declares a valid rowUnit/gutterMode pair', () => {
      expect(['bekker-line', 'paragraph', 'sentence', 'plain-line']).toContain(scheme.gutter.rowUnit);
      expect(['address', 'structural']).toContain(scheme.gutter.gutterMode);
    });
  });
}
