// Export harness — end to end proof that exports produce a REAL .docx with
// NATIVE Word footnote objects (not fake in-page endnote-style hyperlinks —
// see workbench/src/lib/export/pandoc.ts's header for why that distinction
// is the entire point).
//
// PART A — single-chapter export:
// 1. Bundles workbench/src/lib/export/index.ts for Node via esbuild (same
//    pattern as scripts/parity-corpus.mjs).
// 2. Builds a REALISTIC chapter file in memory: Metaphysics book 7 chapter 17
//    (Ζ.17, Bekker 1041a6–1041b3 to include a real a->b column transition —
//    the same span shape as src/dev/fixture-meta-z17.ts) with 8 English rows
//    exercising every inline construct: bold, italic, underline, a
//    {grc:...} span, two footnotes with rich (multi-construct) bodies, and
//    backslash escapes.
// 3. Transforms it to Pandoc Markdown, writes the .md to the scratchpad.
// 4. Runs real pandoc (pandoc -f markdown -t docx).
// 5. Unzips the resulting .docx (it's a zip) and verifies:
//    (a) word/footnotes.xml exists and contains both footnote bodies as
//        real <w:footnote> entries (excluding the separator/continuation
//        stock entries pandoc always emits),
//    (b) word/document.xml contains <w:footnoteReference w:id=...> at the
//        expected count, and there is NO hyperlink-styled pseudo-endnote
//        (no <w:hyperlink> anchoring to an internal bookmark for the
//        footnote ids) — this is the fake-footnote failure mode from
//        Scrivener that this whole feature exists to prevent,
//    (c) underline survives as <w:u ...> somewhere in styles.xml or a run's
//        rPr,
//    (d) the Greek span text is present intact (NFC) in document.xml.
//
// PART B (below, "whole-work compile") — a synthetic 3-chapter, 2-book work
// compiled end to end through the SAME pandoc invocation shape, verifying:
// headings present for both books/all chapters, native footnotes numbered
// CONTINUOUSLY across chapter boundaries (not restarting), the reference.docx
// styling (font + page geometry) actually lands in the OUTPUT docx, and
// (bilingual mode) Greek blocks present alongside English.
//
// Prints a PASS/FAIL table and exits nonzero on any failure.
//
// Usage: node scripts/export-harness.mjs
// Env overrides: EXPORT_HARNESS_SCRATCH, EXPORT_HARNESS_PANDOC_BIN

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(here, '..');
const pandocBin = process.env.EXPORT_HARNESS_PANDOC_BIN ?? 'pandoc';
const scratchDir =
  process.env.EXPORT_HARNESS_SCRATCH ??
  path.join(tmpdir(), 'workbench-export-harness');

mkdirSync(scratchDir, { recursive: true });

const results = [];
function record(label, ok, detail) {
  results.push({ label, ok, detail: detail ?? '' });
}
function fail(label, detail) {
  record(label, false, detail);
}
function pass(label, detail) {
  record(label, true, detail);
}

function printTable() {
  const w = Math.max(...results.map((r) => r.label.length), 'CHECK'.length);
  console.log('');
  console.log(`${'CHECK'.padEnd(w)}  STATUS  DETAIL`);
  console.log(`${'-'.repeat(w)}  ------  ------`);
  for (const r of results) {
    console.log(`${r.label.padEnd(w)}  ${r.ok ? 'PASS' : 'FAIL'.padEnd(6)}  ${r.detail}`);
  }
  console.log('');
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`${failed.length} of ${results.length} checks FAILED.`);
  } else {
    console.log(`All ${results.length} checks PASSED.`);
  }
}

// ── 1. bundle export/index.ts for Node ──────────────────────────────────────
const bundleDir = mkdtempSync(path.join(tmpdir(), 'export-harness-'));
const bundlePath = path.join(bundleDir, 'export.mjs');
await build({
  entryPoints: [path.join(workbenchRoot, 'src/lib/export/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
  logLevel: 'silent',
  // export/index.ts pulls in citation/registry.ts -> js-yaml is not needed
  // transitively here (chapterfile/manifest parsing isn't exercised — the
  // harness builds ChapterFile/WorkMeta literals directly), but leave
  // external empty so esbuild bundles whatever IS actually reached.
});
const exportLib = await import(pathToFileURL(bundlePath).href);
const {
  exportChapterToDocx,
  exportWorkToDocx,
  chapterToPandocMarkdown,
  pandocAvailable,
  PANDOC_UNAVAILABLE_MESSAGE,
} = exportLib;

// ── 2. realistic chapter file in memory ─────────────────────────────────────
// Metaphysics Ζ.17, 1041a6–1041b3: 8 rows spanning the real a->b Bekker
// column transition (same chapter/column boundary as src/dev/fixture-meta-z17.ts,
// truncated to 8 rows: 1041a6..1041a12 (7 rows) + 1041b1 (1 row) = 8 rows).
const GREEK = [
  'Τί δὲ χρὴ λέγειν καὶ ὁποῖόν τι τὴν οὐσίαν, πάλιν',
  'ἄλλην οἷον ἀρχὴν ποιησάμενοι λέγωμεν· ἴσως γὰρ ἐκ τούτων',
  'ἔσται δῆλον καὶ περὶ ἐκείνης τῆς οὐσίας ἥτις ἐστὶ κεχωρισμένη',
  'τῶν αἰσθητῶν οὐσιῶν. ἐπεὶ οὖν ἡ οὐσία ἀρχὴ καὶ',
  'αἰτία τις ἐστίν, ἐντεῦθεν μετιτέον. ζητεῖται δὲ τὸ διὰ τί',
  'ἀεὶ οὕτως, διὰ τί ἄλλο ἄλλῳ τινὶ ὑπάρχει. τὸ γὰρ ζητεῖν',
  'διὰ τί ὁ μουσικὸς ἄνθρωπος μουσικὸς ἄνθρωπός ἐστιν,',
  'οἷον ἄνθρωπος τί ἐστι ζητεῖται διὰ τὸ ἁπλῶς λέγεσθαι',
];

const ENGLISH = [
  // row 0 (1041a6): plain prose, no stamp (heading carries the opening ref)
  'We must again say what, and what sort of thing, **substance** is, starting',
  // row 1 (1041a7): italic
  'from *another* beginning as it were; for perhaps from this',
  // row 2 (1041a8): underline
  'it will be ++clear also about that substance which is separate++',
  // row 3 (1041a9): backslash escapes — literal asterisks and a literal brace
  'from sensible substances \\*not italicized\\* and \\{not a span\\}',
  // row 4 (1041a10, multiple of 5 -> gets a stamp): a footnote with a rich body
  'from things sensible; since then substance is a {^1:first principle} and',
  // row 5 (1041a11): a Greek span inline
  'a cause, {grc:τὸ τί ἦν εἶναι} is what we are looking for, in a sense',
  // row 6 (1041a12): second footnote, plain
  'why the musical man is a {^2:musical man}, we must ask',
  // row 7 (1041b1, column transition -> bare "[1041b]" stamp): plain, closes the chapter
  'a man is asked what he is because it is said simply',
];

const chapterFile = {
  meta: {
    schemaVersion: 1,
    work: 'metaphysics',
    book: 7,
    chapter: 17,
    citationScheme: 'bekker-metaphysics',
    spanStart: '1041a6',
    spanEnd: '1041b1',
  },
  greekLines: GREEK,
  englishLines: ENGLISH,
  footnotes: [
    {
      id: 1,
      body: 'Ross renders this **ἀρχή** as *first principle*; cf. ++Bonitz++ s.v. {grc:ἀρχή}.',
    },
    {
      id: 2,
      body: 'The stock example throughout this chapter; a literal escape test: \\*ὁ μουσικός\\* is not italicized here.',
    },
  ],
};

const workMeta = {
  id: 'metaphysics',
  title: 'Metaphysics',
  author: 'Aristotle',
  scheme: 'bekker-metaphysics',
  books: [
    { n: 1, label: 'Α' }, { n: 2, label: 'α' }, { n: 3, label: 'Β' }, { n: 4, label: 'Γ' },
    { n: 5, label: 'Δ' }, { n: 6, label: 'Ε' }, { n: 7, label: 'Ζ' }, { n: 8, label: 'Η' },
    { n: 9, label: 'Θ' }, { n: 10, label: 'Ι' }, { n: 11, label: 'Κ' }, { n: 12, label: 'Λ' },
    { n: 13, label: 'Μ' }, { n: 14, label: 'Ν' },
  ],
};

// ── pandoc availability ──────────────────────────────────────────────────
const available = await pandocAvailable(pandocBin);
if (!available) {
  fail('pandoc available on PATH', PANDOC_UNAVAILABLE_MESSAGE);
  printTable();
  process.exit(1);
}
pass('pandoc available on PATH', `binary: ${pandocBin}`);

// ── 3+4. transform + run pandoc via the real entry point ───────────────────
const markdownPath = path.join(scratchDir, 'export-harness-meta-z17.md');
const docxPath = path.join(scratchDir, 'export-harness-meta-z17.docx');

const writeFile = async (p, contents) => writeFileSync(p, contents, 'utf8');

const result = await exportChapterToDocx(chapterFile, workMeta, {
  markdownPath,
  docxPath,
  writeFile,
  pandocBin,
});

if (!result.ok) {
  fail('pandoc conversion succeeded (exit 0)', result.message ?? '(no message)');
  printTable();
  process.exit(1);
}
pass('pandoc conversion succeeded (exit 0)', `.md -> .docx`);

if (!existsSync(markdownPath)) {
  fail('intermediate .md written to scratchpad', markdownPath);
} else {
  pass('intermediate .md written to scratchpad', markdownPath);
}
if (!existsSync(docxPath)) {
  fail('.docx written to scratchpad', docxPath);
  printTable();
  process.exit(1);
}
pass('.docx written to scratchpad', docxPath);

// ── 5. unzip and verify the docx internals ──────────────────────────────────
function unzipEntry(zipPath, entryName) {
  try {
    return execFileSync('unzip', ['-p', zipPath, entryName], { encoding: 'utf8' });
  } catch (err) {
    return null;
  }
}
function zipEntryNames(zipPath) {
  const out = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

const entries = zipEntryNames(docxPath);
pass('.docx is a valid zip archive', `${entries.length} entries`);

// (a) word/footnotes.xml exists and contains both footnote bodies as real
// <w:footnote> entries (excluding pandoc's stock separator/continuation
// entries, which carry type="separator" / type="continuationSeparator").
const footnotesXmlName = entries.find((e) => e === 'word/footnotes.xml');
if (!footnotesXmlName) {
  fail('word/footnotes.xml exists', `entries were: ${entries.join(', ')}`);
} else {
  pass('word/footnotes.xml exists', footnotesXmlName);
}
const footnotesXml = footnotesXmlName ? unzipEntry(docxPath, 'word/footnotes.xml') : null;

if (footnotesXml) {
  const footnoteEntryRe = /<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/g;
  const realFootnotes = [];
  let m;
  while ((m = footnoteEntryRe.exec(footnotesXml))) {
    const attrs = m[1];
    if (/type="(separator|continuationSeparator)"/.test(attrs)) continue; // stock entries
    realFootnotes.push({ attrs, body: m[2] });
  }
  if (realFootnotes.length !== 2) {
    fail('word/footnotes.xml has exactly 2 real <w:footnote> entries', `found ${realFootnotes.length}`);
  } else {
    pass('word/footnotes.xml has exactly 2 real <w:footnote> entries', `ids: ${realFootnotes.map((f) => (f.attrs.match(/w:id="(-?\d+)"/) ?? [])[1]).join(', ')}`);
  }
  const bodyText = realFootnotes.map((f) => f.body).join('\n');
  const hasFirstBody = /ἀρχή/.test(bodyText) && /first principle/.test(bodyText);
  const hasSecondBody = /musical/i.test(bodyText) || /ὁ μουσικός/.test(bodyText);
  if (!hasFirstBody) fail('footnote 1 body text present', 'expected "first principle" / ἀρχή');
  else pass('footnote 1 body text present', 'found "first principle" and ἀρχή');
  if (!hasSecondBody) fail('footnote 2 body text present', 'expected the musical-man note text');
  else pass('footnote 2 body text present', 'found the musical-man note text');
} else {
  fail('footnote body text present', 'word/footnotes.xml missing/unreadable');
}

// (b) word/document.xml: <w:footnoteReference w:id=...> at expected count,
// and NO hyperlink-styled pseudo-endnote for the footnote ids.
const documentXml = unzipEntry(docxPath, 'word/document.xml');
if (!documentXml) {
  fail('word/document.xml readable', 'unzip failed');
} else {
  pass('word/document.xml readable', `${documentXml.length} bytes`);

  const refMatches = [...documentXml.matchAll(/<w:footnoteReference\b[^>]*w:id="(-?\d+)"[^>]*\/?>/g)];
  if (refMatches.length !== 2) {
    fail('document.xml has 2 <w:footnoteReference> runs', `found ${refMatches.length}`);
  } else {
    pass('document.xml has 2 <w:footnoteReference> runs', `ids: ${refMatches.map((mm) => mm[1]).join(', ')}`);
  }

  // The Scrivener failure mode this whole feature guards against: fake
  // footnotes rendered as in-page hyperlink anchors (<w:hyperlink w:anchor="...">)
  // instead of real footnote objects. Assert there are none.
  const hyperlinkAnchors = [...documentXml.matchAll(/<w:hyperlink\b[^>]*w:anchor="([^"]*)"/g)].map((mm) => mm[1]);
  if (hyperlinkAnchors.length > 0) {
    fail('no hyperlink-styled pseudo-endnotes in document.xml', `found anchors: ${hyperlinkAnchors.join(', ')}`);
  } else {
    pass('no hyperlink-styled pseudo-endnotes in document.xml', 'zero <w:hyperlink w:anchor=...> elements');
  }

  // (c) underline survives as <w:u ...> (styles.xml defines the Underline
  // char style pandoc references, and/or a direct run property).
  const stylesXml = unzipEntry(docxPath, 'word/styles.xml') ?? '';
  const hasUnderline = /<w:u\b/.test(documentXml) || /<w:u\b/.test(stylesXml);
  if (!hasUnderline) {
    fail('underline survives as <w:u> (styles.xml or run props)', 'no <w:u element found in document.xml or styles.xml');
  } else {
    pass('underline survives as <w:u> (styles.xml or run props)', /<w:u\b/.test(documentXml) ? 'found in document.xml' : 'found in styles.xml');
  }

  // (d) Greek span text present intact (NFC).
  const greekPhrase = 'τὸ τί ἦν εἶναι';
  const nfcMatches = documentXml.normalize('NFC').includes(greekPhrase.normalize('NFC'));
  if (!nfcMatches) {
    fail('Greek span text intact (NFC) in document.xml', `expected to find "${greekPhrase}"`);
  } else {
    pass('Greek span text intact (NFC) in document.xml', `found "${greekPhrase}"`);
  }

  // Bekker stamps sanity: the multiple-of-5 stamp and the column-transition
  // stamp should both appear as plain bracketed text (default stampMode
  // 'every-5').
  const hasMultipleOf5Stamp = documentXml.includes('1041a10');
  const hasColumnStamp = documentXml.includes('1041b');
  if (!hasMultipleOf5Stamp) fail('every-5 stamp [1041a10] present', 'not found in document.xml');
  else pass('every-5 stamp [1041a10] present', 'found');
  if (!hasColumnStamp) fail('column-transition stamp [1041b] present', 'not found in document.xml');
  else pass('column-transition stamp [1041b] present', 'found');
}

// ── 6. column_starts: exact multi-transition stamping, end to end ───────────
// A chapter spanning THREE column transitions (1041a -> 1041b -> 1042a ->
// 1042b) with frontmatter-style columnStarts meta. Impossible for the
// single-transition span heuristic (kept for old files, verified below to
// still throw its diagnostic) — exact via column_starts. 6 rows: 1041a33 |
// 1041b1, 1041b2 | 1042a1, 1042a2 | 1042b1. Default stampMode 'every-5'
// stamps each transition with the bare column ref.
const multiChapter = {
  meta: {
    schemaVersion: 1,
    work: 'metaphysics',
    book: 7,
    chapter: 17,
    citationScheme: 'bekker-metaphysics',
    spanStart: '1041a33',
    spanEnd: '1042b1',
    columnStarts: [
      { ref: '1041a33', rowIndex: 1 },
      { ref: '1041b1', rowIndex: 2 },
      { ref: '1042a1', rowIndex: 4 },
      { ref: '1042b1', rowIndex: 6 },
    ],
  },
  greekLines: ['γ1', 'γ2', 'γ3', 'γ4', 'γ5', 'γ6'],
  englishLines: [
    'closing the first column,',
    'opening column b with plain prose,',
    'continuing b,',
    'rolling to the next page,',
    'continuing the new page,',
    'and ending on its b column.',
  ],
  footnotes: [],
};

// Fallback still guards old files: the SAME span without column_starts must
// throw the clear multi-transition diagnostic rather than mis-stamp.
try {
  chapterToPandocMarkdown({ ...multiChapter, meta: { ...multiChapter.meta, columnStarts: undefined } }, workMeta);
  fail('multi-transition WITHOUT column_starts throws the diagnostic', 'no error was thrown');
} catch (err) {
  if (/more than one Bekker column transition/.test(String(err?.message))) {
    pass('multi-transition WITHOUT column_starts throws the diagnostic', 'clear error preserved');
  } else {
    fail('multi-transition WITHOUT column_starts throws the diagnostic', `unexpected error: ${err?.message}`);
  }
}

const multiMarkdownPath = path.join(scratchDir, 'export-harness-meta-z17-multicol.md');
const multiDocxPath = path.join(scratchDir, 'export-harness-meta-z17-multicol.docx');
const multiResult = await exportChapterToDocx(multiChapter, workMeta, {
  markdownPath: multiMarkdownPath,
  docxPath: multiDocxPath,
  writeFile,
  pandocBin,
});
if (!multiResult.ok) {
  fail('multi-transition (column_starts) pandoc conversion succeeded', multiResult.message ?? '(no message)');
} else {
  pass('multi-transition (column_starts) pandoc conversion succeeded', '.md -> .docx');
  // Exact bracketed stamps in the intermediate markdown (byte-precise), bare
  // column refs in the docx (pandoc may split bracketed text across runs).
  const multiMd = readFileSync(multiMarkdownPath, 'utf8');
  const multiDocXml = unzipEntry(multiDocxPath, 'word/document.xml') ?? '';
  for (const column of ['1041b', '1042a', '1042b']) {
    if (multiMd.includes(`[${column}] `)) {
      pass(`column_starts transition stamp [${column}] in markdown`, 'exact bracketed stamp found');
    } else {
      fail(`column_starts transition stamp [${column}] in markdown`, `no "[${column}] " in ${multiMarkdownPath}`);
    }
    if (multiDocXml.includes(column)) {
      pass(`column ref ${column} present in document.xml`, 'found');
    } else {
      fail(`column ref ${column} present in document.xml`, 'not found');
    }
  }
}

// ── PART B: whole-work compile export, end to end ───────────────────────────
//
// A synthetic 2-book, 3-chapter work (Α.1, Α.2, Ζ.5 — deliberately
// out-of-manifest-order in the input array, to prove compile sorts into
// manifest order). Each chapter's [ENGLISH] uses LOCAL footnote id "1" (the
// realistic authoring pattern — footnote ids are chapter-local by design, see
// workbench-design/d1-row-lock-editor.md) so the harness proves namespacing
// prevents collisions and Word still numbers them 1, 2, 3 continuously.
// Chapter Ζ.5 spans a real a->b column transition so the compiled doc's
// running Bekker refs are exercised across a boundary INSIDE a chapter too,
// not just across chapters.

const workMetaCompile = {
  id: 'metaphysics',
  title: 'Metaphysics',
  author: 'Aristotle',
  scheme: 'bekker-metaphysics',
  books: [
    { n: 1, label: 'Α' }, { n: 2, label: 'α' }, { n: 3, label: 'Β' }, { n: 4, label: 'Γ' },
    { n: 5, label: 'Δ' }, { n: 6, label: 'Ε' }, { n: 7, label: 'Ζ' }, { n: 8, label: 'Η' },
    { n: 9, label: 'Θ' }, { n: 10, label: 'Ι' }, { n: 11, label: 'Κ' }, { n: 12, label: 'Λ' },
    { n: 13, label: 'Μ' }, { n: 14, label: 'Ν' },
  ],
};

const compileChapterA1 = {
  meta: {
    schemaVersion: 1,
    work: 'metaphysics',
    book: 1,
    chapter: 1,
    citationScheme: 'bekker-metaphysics',
    spanStart: '980a21',
    spanEnd: '980a25',
  },
  greekLines: ['πάντες ἄνθρωποι', 'τοῦ εἰδέναι', 'ὀρέγονται φύσει.', 'σημεῖον δ᾽ ἡ', 'τῶν αἰσθήσεων ἀγάπησις·'],
  englishLines: [
    'All men by nature desire {^1:to know}.',
    'An indication of this',
    'is the delight we take',
    'in our senses; for even',
    'apart from their usefulness they are loved for themselves.',
  ],
  footnotes: [{ id: 1, body: 'The famous opening line — cf. **Ross** ad loc.' }],
};

const compileChapterA2 = {
  meta: {
    schemaVersion: 1,
    work: 'metaphysics',
    book: 1,
    chapter: 2,
    citationScheme: 'bekker-metaphysics',
    spanStart: '982a30',
    spanEnd: '982a33',
  },
  greekLines: ['διὰ γὰρ τὸ θαυμάζειν', 'οἱ ἄνθρωποι καὶ νῦν', 'καὶ τὸ πρῶτον ἤρξαντο', 'φιλοσοφεῖν.'],
  englishLines: [
    'For it is owing to their {^1:wonder} that men',
    'both now begin and at first began',
    'to philosophize; they wondered',
    'originally at the obvious difficulties.',
  ],
  footnotes: [{ id: 1, body: 'θαυμάζειν — a second chapter, a second local id "1"; must not collide with Α.1\'s.' }],
};

const compileChapterZ5 = {
  meta: {
    schemaVersion: 1,
    work: 'metaphysics',
    book: 7,
    chapter: 5,
    citationScheme: 'bekker-metaphysics',
    spanStart: '1041a30',
    spanEnd: '1041b3',
    columnStarts: [
      { ref: '1041a30', rowIndex: 1 },
      { ref: '1041b1', rowIndex: 5 },
    ],
  },
  // 4 rows in column a (1041a30..33), 3 rows in column b (1041b1..3) = 7 rows.
  greekLines: ['γα1', 'γα2', 'γα3', 'γα4', 'γβ1', 'γβ2', 'γβ3'],
  englishLines: [
    'closing out column a of book Zeta,',
    'still in column a,',
    'still in column a,',
    'the last row of column a,',
    'now the {^1:first row} of column b,',
    'continuing column b,',
    'and the last row of book Zeta chapter five.',
  ],
  footnotes: [{ id: 1, body: 'A THIRD chapter, a THIRD local id "1" — the running-refs-across-chapters case.' }],
};

// Given deliberately OUT of manifest order, to prove compile sorts.
const compileChapters = [compileChapterZ5, compileChapterA2, compileChapterA1];

const compileMdPath = path.join(scratchDir, 'export-harness-compile-work.md');
const compileDocxPath = path.join(scratchDir, 'export-harness-compile-work.docx');
const referenceDocPath = path.join(workbenchRoot, 'src-tauri', 'resources', 'reference.docx');

if (!existsSync(referenceDocPath)) {
  fail('reference.docx resource exists (run scripts/make-reference-docx.mjs first)', referenceDocPath);
} else {
  pass('reference.docx resource exists', referenceDocPath);
}

const compileResult = await exportWorkToDocx(compileChapters, workMetaCompile, {
  markdownPath: compileMdPath,
  docxPath: compileDocxPath,
  referenceDocPath: existsSync(referenceDocPath) ? referenceDocPath : undefined,
  writeFile,
  pandocBin,
});

if (!compileResult.ok) {
  fail('whole-work compile: pandoc conversion succeeded (exit 0)', compileResult.message ?? '(no message)');
  printTable();
  process.exit(1);
}
pass('whole-work compile: pandoc conversion succeeded (exit 0)', `${compileResult.included.length} chapters compiled`);

// Manifest-order + gap report sanity (Α before Ζ; no gaps flagged since Α.1,
// Α.2 are contiguous and Ζ.5 is the only Ζ chapter present — so Ζ IS flagged
// as incomplete only in the sense that it's a single-chapter "run", which
// buildGapReport does not flag as a gap; the other 12 books are absent
// entirely, which SHOULD be flagged).
if (compileResult.included.length === 3 &&
    compileResult.included[0].book === 1 && compileResult.included[0].chapter === 1 &&
    compileResult.included[1].book === 1 && compileResult.included[1].chapter === 2 &&
    compileResult.included[2].book === 7 && compileResult.included[2].chapter === 5) {
  pass('whole-work compile: chapters sorted into manifest order', 'Α.1, Α.2, Ζ.5');
} else {
  fail('whole-work compile: chapters sorted into manifest order', JSON.stringify(compileResult.included));
}
if (compileResult.gapReport.hasGaps && compileResult.gapReport.lines.some((l) => l.includes('missing entirely'))) {
  pass('whole-work compile: gap report flags the 12 untouched books', compileResult.gapReport.summary.slice(0, 80) + '…');
} else {
  fail('whole-work compile: gap report flags the 12 untouched books', compileResult.gapReport.summary);
}

const compileMd = readFileSync(compileMdPath, 'utf8');
if (compileMd.includes('# Α') && compileMd.includes('# Ζ')) {
  pass('whole-work compile: book headings present for both books', 'found "# Α" and "# Ζ"');
} else {
  fail('whole-work compile: book headings present for both books', 'missing one or both book headings');
}
if (compileMd.includes('## Chapter 1') && compileMd.includes('## Chapter 2') && compileMd.includes('## Chapter 5')) {
  pass('whole-work compile: chapter headings present for all 3 chapters', 'found');
} else {
  fail('whole-work compile: chapter headings present for all 3 chapters', 'missing one or more');
}

const compileEntries = zipEntryNames(compileDocxPath);
const compileDocumentXml = unzipEntry(compileDocxPath, 'word/document.xml') ?? '';
const compileFootnotesXml = unzipEntry(compileDocxPath, 'word/footnotes.xml') ?? '';
const compileStylesXml = unzipEntry(compileDocxPath, 'word/styles.xml') ?? '';

// Native footnotes present, 3 of them (one per chapter), sequentially
// referenced in document.xml (order = manifest reading order).
const compileFootnoteRefs = [...compileDocumentXml.matchAll(/<w:footnoteReference\b[^>]*w:id="(-?\d+)"[^>]*\/?>/g)].map(
  (m) => m[1],
);
if (compileFootnoteRefs.length === 3) {
  pass('whole-work compile: 3 native footnote references in document.xml', `ids: ${compileFootnoteRefs.join(', ')}`);
} else {
  fail('whole-work compile: 3 native footnote references in document.xml', `found ${compileFootnoteRefs.length}`);
}

const compileFootnoteEntryRe = /<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/g;
const compileRealFootnotes = [];
{
  let m;
  while ((m = compileFootnoteEntryRe.exec(compileFootnotesXml))) {
    if (/type="(separator|continuationSeparator)"/.test(m[1])) continue;
    compileRealFootnotes.push(m[2]);
  }
}
if (compileRealFootnotes.length === 3) {
  pass('whole-work compile: word/footnotes.xml has exactly 3 real <w:footnote> entries', 'found 3');
} else {
  fail('whole-work compile: word/footnotes.xml has exactly 3 real <w:footnote> entries', `found ${compileRealFootnotes.length}`);
}

// Continuity: pandoc's docx writer assigns w:id values in the order
// footnotes are encountered in the source; Word itself renders the VISIBLE
// number by simple document-order sequence within one section (no
// numRestart boundary exists mid-document — see make-reference-docx.mjs's
// header for why <w:sectPr> in this doc has none). We can't literally
// screenshot Word's rendered numeral here, but we CAN assert the structural
// precondition for that continuity: exactly one <w:sectPr> in the whole
// document (a single section — no section break was introduced that would
// trigger eachSect numRestart), and that the reference count strictly
// increases through the document in source order (pandoc always allocates
// footnote w:ids in ascending encounter order).
const compileSectPrCount = (compileDocumentXml.match(/<w:sectPr\b/g) ?? []).length;
if (compileSectPrCount === 1) {
  pass('whole-work compile: exactly one section (no per-chapter section breaks)', 'a single <w:sectPr> — footnote numbering cannot restart mid-document');
} else {
  fail('whole-work compile: exactly one section (no per-chapter section breaks)', `found ${compileSectPrCount} <w:sectPr> elements`);
}
const refIdsAscending = compileFootnoteRefs.every((id, i) => i === 0 || Number(id) > Number(compileFootnoteRefs[i - 1]));
if (refIdsAscending) {
  pass('whole-work compile: footnote reference ids increase monotonically in document order', compileFootnoteRefs.join(' < '));
} else {
  fail('whole-work compile: footnote reference ids increase monotonically in document order', compileFootnoteRefs.join(', '));
}
// No accidental id collision: the 3 footnoteReference w:id values must be
// distinct (this is the concrete, checkable form of "namespacing prevented
// the collision" — pandoc would otherwise have reused an id and Word would
// still render distinct footnotes, but a collision at the SOURCE level, if
// namespacing had been skipped, produces a pandoc WARNING on stderr; assert
// pandoc's run for this compile produced none).
const distinctRefIds = new Set(compileFootnoteRefs).size === compileFootnoteRefs.length;
if (distinctRefIds) {
  pass('whole-work compile: footnote reference ids are distinct (no id collisions)', compileFootnoteRefs.join(', '));
} else {
  fail('whole-work compile: footnote reference ids are distinct (no id collisions)', compileFootnoteRefs.join(', '));
}
if (!/duplicate note reference/i.test(compileResult.run?.stderr ?? '')) {
  pass('whole-work compile: pandoc emitted no "duplicate note reference" warning', 'stderr clean of that warning');
} else {
  fail('whole-work compile: pandoc emitted no "duplicate note reference" warning', compileResult.run.stderr);
}

// Bekker stamps across the intra-chapter column transition AND across the
// chapter boundary (Ζ.5's own 1041a->1041b transition).
if (compileDocumentXml.includes('1041b')) {
  pass('whole-work compile: intra-chapter column-transition stamp [1041b] present', 'found');
} else {
  fail('whole-work compile: intra-chapter column-transition stamp [1041b] present', 'not found');
}

// reference.docx styling actually applied to the OUTPUT docx: font +
// page geometry, checked in the compiled doc's own styles.xml/document.xml
// (not the reference file itself — proving --reference-doc really took).
if (existsSync(referenceDocPath)) {
  const hasCambriaFont = /w:ascii="Cambria"/.test(compileStylesXml) || /w:ascii="Cambria"/.test(compileDocumentXml);
  if (hasCambriaFont) {
    pass('whole-work compile: reference.docx font (Cambria) applied in output styles.xml', 'found w:ascii="Cambria"');
  } else {
    fail('whole-work compile: reference.docx font (Cambria) applied in output styles.xml', 'w:ascii="Cambria" not found');
  }
  const hasPageSize = /<w:pgSz\b[^>]*w:w="12240"[^>]*w:h="15840"/.test(compileDocumentXml) ||
    /<w:pgSz\b[^>]*w:h="15840"[^>]*w:w="12240"/.test(compileDocumentXml);
  if (hasPageSize) {
    pass('whole-work compile: reference.docx page geometry (US Letter) applied in output document.xml', 'found 12240x15840 twips');
  } else {
    fail('whole-work compile: reference.docx page geometry (US Letter) applied in output document.xml', 'US Letter pgSz not found');
  }
  const hasMargins = /<w:pgMar\b[^>]*w:top="1440"/.test(compileDocumentXml);
  if (hasMargins) {
    pass('whole-work compile: reference.docx 1" margins applied in output document.xml', 'found w:top="1440"');
  } else {
    fail('whole-work compile: reference.docx 1" margins applied in output document.xml', 'w:top="1440" not found');
  }
}

// ── bilingual mode: Greek blocks present, stacked before English, per chapter ──
const compileBilingualMdPath = path.join(scratchDir, 'export-harness-compile-work-bilingual.md');
const compileBilingualDocxPath = path.join(scratchDir, 'export-harness-compile-work-bilingual.docx');
const bilingualResult = await exportWorkToDocx(compileChapters, workMetaCompile, {
  markdownPath: compileBilingualMdPath,
  docxPath: compileBilingualDocxPath,
  referenceDocPath: existsSync(referenceDocPath) ? referenceDocPath : undefined,
  writeFile,
  pandocBin,
  mode: 'bilingual',
});
if (!bilingualResult.ok) {
  fail('whole-work compile (bilingual): pandoc conversion succeeded (exit 0)', bilingualResult.message ?? '(no message)');
} else {
  pass('whole-work compile (bilingual): pandoc conversion succeeded (exit 0)', 'ok');
  const bilingualDocXml = unzipEntry(compileBilingualDocxPath, 'word/document.xml') ?? '';
  const hasGreek = /πάντες ἄνθρωποι/.test(bilingualDocXml.normalize('NFC'));
  if (hasGreek) {
    pass('whole-work compile (bilingual): Greek block text present in document.xml', 'found "πάντες ἄνθρωποι"');
  } else {
    fail('whole-work compile (bilingual): Greek block text present in document.xml', 'not found');
  }
  const hasEnglish = /desire/.test(bilingualDocXml);
  if (hasEnglish) {
    pass('whole-work compile (bilingual): English block text present in document.xml', 'found "desire"');
  } else {
    fail('whole-work compile (bilingual): English block text present in document.xml', 'not found');
  }
}

printTable();
const anyFailed = results.some((r) => !r.ok);
process.exit(anyFailed ? 1 : 0);
