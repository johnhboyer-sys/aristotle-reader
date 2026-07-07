/**
 * The d3 §10 acceptance suite. Every test degrades the REAL Ζ.17 chapter from
 * `.dev-corpus/metaphysics` (read at test time) and drives the full pipeline
 * parseImportFile → buildImportPlan. If `.dev-corpus` is absent (CI without
 * TLG) the whole suite SKIPS with a clear message instead of failing.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import {
  loadDevCorpus,
  realZ17,
  metaWork,
  mulberry32,
  noisyLine,
  importFileText,
  stubEnglish,
  type RealRow,
} from './fixtures';
import { parseImportFile } from '../parseImportFile';
import { buildImportPlan, buildChapterFile, type ImportPlan } from '../plan';
import { clearFeatureCache } from '../compareKey';
import { chapterRows } from '../../data/chapterRows';
import { parseChapterFile, serializeChapterFile } from '../../chapterfile/parse';
import type { WorkCorpus } from '../../data/corpusStore';
import type { WorkManifest } from '../../works/manifest';

// Top-level await (vitest supports it): resolve the corpus once so `describe`
// vs `describe.skip` is decided synchronously below.
const corpus = await loadDevCorpus();
const suite = corpus ? describe : describe.skip;
if (!corpus) {
  // eslint-disable-next-line no-console
  console.warn(
    'import/plan.test.ts SKIPPED: .dev-corpus/metaphysics not present (expected on CI without TLG).',
  );
}

suite('import plan — degraded Ζ.17 fixtures (d3 §10)', () => {
  let rows: RealRow[];
  let work: WorkManifest;
  let english: string[];

  beforeAll(() => {
    rows = realZ17(corpus as WorkCorpus);
    work = metaWork();
    english = stubEnglish(rows);
    clearFeatureCache();
  });

  /** Run the pipeline for a set of matched greek/english import lines. */
  async function plan(
    greek: string[],
    eng: string[],
    fm: { book?: number; chapter?: number; bekkerStart?: string } = { book: 7, chapter: 17 },
  ): Promise<ImportPlan> {
    const text = importFileText(greek, eng, { work: 'metaphysics', ...fm });
    const parsed = parseImportFile(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('parse failed');
    const p = await buildImportPlan(parsed.value, work, corpus);
    if (!p.ok) throw new Error(`plan failed: ${p.kind} — ${p.detail}`);
    return p;
  }

  // ── fixture 1: orthographic noise → 100% auto-accept, exact addresses ──────
  it('1. diacritic/σς/movable-nu noise → all matched, exact addresses', async () => {
    const rand = mulberry32(1);
    const greek = rows.map((r) => noisyLine(r.greek, rand));
    const p = await plan(greek, english);

    expect(p.rows).toHaveLength(rows.length);
    expect(p.rows.map((r) => r.address)).toEqual(rows.map((r) => r.address));
    expect(p.blocked).toBe(false);
    for (const r of p.rows) expect(r.state).toBe('matched');
    // Each row carries its English (Greek-driven placement is exact).
    expect(p.rows[0].proposedEnglish).toBe(english[0]);
    // Saved Greek is the SPINE Greek, not the noisy user Greek.
    expect(p.rows[0].spineGreek).toBe(rows[0].greek);
  });

  // ── fixture 2: merged line → split semantics, row count unchanged ──────────
  it('2. one merged import line → split, spine row count unchanged', async () => {
    // Merge the Greek of spine rows 10 & 11 into ONE import line; English too.
    const greek: string[] = [];
    const eng: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (i === 10) {
        greek.push(`${rows[10].greek} ${rows[11].greek}`);
        eng.push(`${english[10]} ${english[11]}`);
      } else if (i === 11) {
        continue; // folded into row 10
      } else {
        greek.push(rows[i].greek);
        eng.push(english[i]);
      }
    }
    const p = await plan(greek, eng);

    expect(p.rows).toHaveLength(rows.length); // spine row count preserved
    expect(p.rows.map((r) => r.address)).toEqual(rows.map((r) => r.address));
    // Row 10 = split head (English present), row 11 = split tail (empty).
    expect(p.rows[10].state).toBe('split');
    expect(p.rows[11].state).toBe('split');
    expect(p.rows[10].proposedEnglish).toContain(english[10]);
    expect(p.rows[11].proposedEnglish).toBe('');
    expect(p.blocked).toBe(false);
  });

  // ── fixture 3: split line → merged concatenation, no row invented ──────────
  it('3. one split import line → merged, no row invented', async () => {
    // Split spine row 20's Greek across TWO import lines (English split too).
    const greek: string[] = [];
    const eng: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (i === 20) {
        const words = rows[20].greek.split(' ');
        const mid = Math.ceil(words.length / 2);
        greek.push(words.slice(0, mid).join(' '));
        greek.push(words.slice(mid).join(' '));
        eng.push('first half English');
        eng.push('second half English');
      } else {
        greek.push(rows[i].greek);
        eng.push(english[i]);
      }
    }
    const p = await plan(greek, eng);

    expect(p.rows).toHaveLength(rows.length); // no row invented
    expect(p.rows.map((r) => r.address)).toEqual(rows.map((r) => r.address));
    expect(p.rows[20].state).toBe('merged');
    expect(p.rows[20].proposedEnglish).toBe('first half English second half English');
    expect(p.blocked).toBe(false);
  });

  // ── fixture 4: missing line → no-source row, monotonic around it ───────────
  it('4. one missing import line → no-source row, monotonicity intact', async () => {
    const greek: string[] = [];
    const eng: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (i === 15) continue; // omit spine row 15's line entirely
      greek.push(rows[i].greek);
      eng.push(english[i]);
    }
    const p = await plan(greek, eng);

    expect(p.rows).toHaveLength(rows.length);
    expect(p.rows.map((r) => r.address)).toEqual(rows.map((r) => r.address));
    expect(p.rows[15].state).toBe('no-source');
    expect(p.rows[15].proposedEnglish).toBe('');
    // Rows around it still carry their own English (monotonic).
    expect(p.rows[14].proposedEnglish).toBe(english[14]);
    expect(p.rows[16].proposedEnglish).toBe(english[16]);
    expect(p.blocked).toBe(false);
  });

  // ── fixture 5: alien line → orphan + plan.blocked ──────────────────────────
  it('5. an alien import line → orphan list, plan blocked (honesty gate)', async () => {
    const greek = rows.map((r) => r.greek);
    const eng = [...english];
    // Insert a translator's note to self at position 5 — matches no Greek line.
    greek.splice(5, 0, 'σημειωσαι τουτο αργοτερα ελεγξαι την μεταφρασιν');
    eng.splice(5, 0, 'NOTE TO SELF: check this rendering later');
    const p = await plan(greek, eng);

    expect(p.blocked).toBe(true);
    expect(p.orphans.length).toBeGreaterThanOrEqual(1);
    const orphan = p.orphans.find((o) => o.english.startsWith('NOTE TO SELF'));
    expect(orphan).toBeDefined();
    // Spine row count is still the real chapter length (orphan has no home).
    expect(p.rows).toHaveLength(rows.length);
  });

  // ── fixture 6: wrong bekker_start → content wins, discrepancy surfaced ─────
  it('6. wrong bekker_start → content wins, discrepancy surfaced', async () => {
    const greek = rows.map((r) => r.greek);
    // A plausible ref elsewhere in the work (Book 1's opening column).
    const p = await plan(greek, english, { book: 7, chapter: 17, bekkerStart: '980a25' });

    // Content still won: addresses are Ζ.17's real ones.
    expect(p.rows[0].address).toBe(rows[0].address);
    expect(p.discrepancy).toBeDefined();
    expect(p.discrepancy).toContain('980a25');
    expect(p.discrepancy).toContain(rows[0].address);
  });

  // ── fixture 7: English trailing "…Book 14" number tolerance ────────────────
  it('7. English with a converter-eaten trailing number lands intact-minus-14', async () => {
    const greek = rows.map((r) => r.greek);
    const eng = [...english];
    // The converter's TRAILING_MARKER regex ate a legitimate trailing number:
    // the English line lost its final "14". Placement is Greek-driven, so it
    // still lands on the right row (benign per d3 §2 corollary).
    eng[3] = 'and so the account runs through Book'; // "14" eaten
    const p = await plan(greek, eng);

    expect(p.rows[3].address).toBe(rows[3].address);
    expect(p.rows[3].proposedEnglish).toBe('and so the account runs through Book');
    expect(p.rows[3].state).toBe('matched');
  });

  // ── fixture 8: wrong declared chapter → failure sentence (b) shape ─────────
  it('8. wrong declared chapter → failure sentence (b) verbatim shape', async () => {
    const greek = rows.map((r) => r.greek);
    const text = importFileText(greek, english, {
      work: 'metaphysics',
      book: 7,
      chapter: 3, // WRONG — content is Ζ.17
    });
    const parsed = parseImportFile(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const p = await buildImportPlan(parsed.value, work, corpus);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.kind).toBe('wrong-location');
    expect(p.message).toMatch(
      /^This file is labeled Book 7, Chapter 3, but its text matches Book 7, Chapter 17 — import there instead, or cancel and fix the label\.$/,
    );
  });

  // ── gates ──────────────────────────────────────────────────────────────────
  it('ROW-COUNT INVARIANT: plan rows === chapterRows length', async () => {
    const greek = rows.map((r) => r.greek);
    const p = await plan(greek, english);
    const editorRows = chapterRows(work, corpus as WorkCorpus, 7, 17)!;
    expect(p.rows).toHaveLength(editorRows.rows.length);
    expect(p.rows.map((r) => r.address)).toEqual(editorRows.rows.map((r) => r.address.raw));
  });

  it('ROUND-TRIP: parse(serialize(buildChapterFile)) deep-equals', async () => {
    const greek = rows.map((r) => r.greek);
    const p = await plan(greek, english);
    const file = buildChapterFile(p);
    const serialized = serializeChapterFile(file);
    const reparsed = parseChapterFile(serialized, 'roundtrip');
    expect(reparsed).toEqual(file);
    // The saved Greek is the spine Greek and the row count matches the editor.
    expect(file.greekLines).toEqual(rows.map((r) => r.greek));
    expect(file.greekLines).toHaveLength(rows.length);
  });

  it('ADDRESS FIDELITY: buildChapterFile rowAddress === spine address', async () => {
    const greek = rows.map((r) => r.greek);
    const p = await plan(greek, english);
    const file = buildChapterFile(p);
    // span_start/end and every column_starts ref must match the spine window.
    expect(file.meta.spanStart).toBe(rows[0].address);
    expect(file.meta.spanEnd).toBe(rows[rows.length - 1].address);
    expect(file.meta.columnStarts![0].ref).toBe(rows[0].address);
  });

  it('DETERMINISM: two identical runs produce deep-equal plans', async () => {
    const rand1 = mulberry32(7);
    const greek1 = rows.map((r) => noisyLine(r.greek, rand1));
    const rand2 = mulberry32(7);
    const greek2 = rows.map((r) => noisyLine(r.greek, rand2));
    expect(greek1).toEqual(greek2); // PRNG determinism sanity
    const a = await plan(greek1, english);
    const b = await plan(greek2, english);
    expect(a.rows).toEqual(b.rows);
    expect(a.orphans).toEqual(b.orphans);
    expect(a.blocked).toBe(b.blocked);
  });

  it('PERFORMANCE: hinted 61-row chapter well under budget', async () => {
    const greek = rows.map((r) => r.greek);
    const t0 = performance.now();
    await plan(greek, english);
    const ms = performance.now() - t0;
    // Ζ.17 is 61 rows; the §10 soft budget is 350 rows < 100ms. Hard-fail 2×.
    expect(ms).toBeLessThan(200);
  });

  it('PERFORMANCE: whole-work UNHINTED sweep under the 3s budget (hard 6s)', async () => {
    const greek = rows.map((r) => r.greek);
    const text = importFileText(greek, english, { work: 'metaphysics' }); // no hint
    const parsed = parseImportFile(text);
    if (!parsed.ok) throw new Error('parse failed');
    const t0 = performance.now();
    const p = await buildImportPlan(parsed.value, work, corpus);
    const ms = performance.now() - t0;
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.book).toBe(7);
      expect(p.chapter).toBe(17);
    }
    expect(ms).toBeLessThan(6000); // soft 3000, hard-fail 2×
  });
});

// ── failure-mode sentences not driven by the Ζ.17 fixtures ────────────────────
describe('import plan — failures independent of the dev corpus', () => {
  it('(f) corpus absent → the exact §7 sentence', async () => {
    const work = metaWork();
    const text = `---\nwork: metaphysics\nbook: 7\nchapter: 17\n---\n[GREEK]\nα β γ\n[ENGLISH]\na b c\n`;
    const parsed = parseImportFile(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Inject a NULL corpus to force the absent path deterministically.
    const p = await buildImportPlan(parsed.value, work, null);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.kind).toBe('corpus-absent');
    expect(p.message).toBe(
      "The standard Greek text for this work isn't on this Mac yet, so lines can't be matched — add the work first, then import.",
    );
  });
});
