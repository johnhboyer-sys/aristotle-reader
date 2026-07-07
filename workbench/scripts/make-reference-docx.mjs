// make-reference-docx.mjs — generates workbench/src-tauri/resources/reference.docx,
// pandoc's own default reference.docx patched for two things (build spec §8 /
// TODO.md's "Export cosmetics" carried-forward item):
//
//   (a) an explicit body-text run font, so the manuscript looks right on any
//       machine instead of falling back to Word/theme defaults ("Aptos" on
//       recent Word, "Calibri" on older versions — neither has full polytonic
//       Greek coverage, and neither matches the app's own manuscript font).
//   (b) explicit page geometry (US Letter, 1" margins) — pandoc's default
//       reference.docx has NO <w:pgSz>/<w:pgMar> at all, so the output page
//       size silently follows Word's locale default (Letter in the US,
//       commonly A4 elsewhere) rather than being pinned.
//
// FONT CHOICE: "Cambria". The app's own CSS manuscript font is EB Garamond
// (workbench/src/styles/tokens.css --font-english), which is what a body-text
// font choice would naturally mirror — but EB Garamond is a webfont bundled
// via @fontsource for the Vite app; it is NOT installed as a system font on
// an arbitrary user's machine, and pandoc's docx writer only *references* a
// font by name in styles.xml (it does not embed font files). A reference-doc
// font Word can't resolve locally falls back silently to Word's own default,
// defeating the point. Cambria ships with Word on both macOS and Windows and
// has full Unicode polytonic Greek coverage (verified against the app's own
// Greek content requirements: it is one of the two immediately-available
// options considered — "New Athena Unicode" (excellent Greek coverage, but a
// specialist classicist font almost never pre-installed) vs. Cambria (near-
// universal Word install base, good-enough Greek coverage, a serif that
// reads as "manuscript" rather than "UI") — Cambria wins on the one property
// that actually matters for a shipped reference doc: it renders correctly on
// a reader's machine without asking them to install anything. Greek-specific
// runs in the doc still carry `[lang=el-GR]` (see pandocMarkdown.ts's
// `wrap()`) so Word's own font-substitution-by-script can still kick in if a
// user's Word substitutes a better Greek face for that language tag; Cambria
// is the FALLBACK every run gets, not a hard override.
//
// The script is re-runnable (regenerates the resource file from scratch each
// time — no incremental patching of a previously-patched file) and the
// output is committed-safe: it contains no corpus content, only Pandoc's
// stock example paragraphs (headings/lists/tables used to define styles),
// which is exactly what ships in Pandoc itself.
//
// Usage: node scripts/make-reference-docx.mjs
// Env override: MAKE_REFERENCE_DOCX_PANDOC_BIN

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(here, '..');
const pandocBin = process.env.MAKE_REFERENCE_DOCX_PANDOC_BIN ?? 'pandoc';

const outDir = path.join(workbenchRoot, 'src-tauri', 'resources');
const outPath = path.join(outDir, 'reference.docx');

// The manuscript body-text font. See header comment for why Cambria (not EB
// Garamond, the app's own CSS font, which isn't a system-installed font).
export const REFERENCE_BODY_FONT = 'Cambria';

// US Letter, 1" margins, in twips (1440 twips = 1 inch). 12240x15840 is the
// standard OOXML US Letter page size.
export const PAGE_WIDTH_TWIPS = 12240;
export const PAGE_HEIGHT_TWIPS = 15840;
export const MARGIN_TWIPS = 1440;

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

/**
 * Patch docDefaults' rFonts to use REFERENCE_BODY_FONT for ascii/hAnsi (Latin
 * text). eastAsia/cs are left alone (theme fallback) per the spec's
 * instruction — this is a Latin/Greek manuscript, not CJK/complex-script
 * content, so touching those categories has no benefit and only risks
 * clobbering Word's own script-specific substitution behavior.
 */
export function patchStylesXml(stylesXml, font = REFERENCE_BODY_FONT) {
  const defaultsMatch = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
  if (!defaultsMatch) {
    throw new Error('make-reference-docx: <w:docDefaults> not found in styles.xml — pandoc reference.docx shape changed?');
  }
  const rFontsMatch = defaultsMatch[0].match(/<w:rFonts\b[^/]*\/>/);
  if (!rFontsMatch) {
    throw new Error('make-reference-docx: <w:rFonts .../> not found inside <w:docDefaults> — pandoc reference.docx shape changed?');
  }
  const patchedRFonts = `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsiaTheme="minorEastAsia" w:cstheme="minorBidi" />`;
  const patchedDefaults = defaultsMatch[0].replace(rFontsMatch[0], patchedRFonts);
  return stylesXml.replace(defaultsMatch[0], patchedDefaults);
}

/**
 * Add explicit pgSz/pgMar to the (single) sectPr in document.xml. Pandoc's
 * default reference.docx has a bare `<w:sectPr><w:footnotePr>...` with no
 * page-geometry children at all — insert pgSz/pgMar as the first children of
 * that sectPr, before footnotePr (OOXML sectPr child order is fixed by
 * schema: pgSz/pgMar must precede footnotePr).
 */
export function patchDocumentXml(documentXml) {
  const sectPrOpenMatch = documentXml.match(/<w:sectPr(\s[^>]*)?>/);
  if (!sectPrOpenMatch) {
    throw new Error('make-reference-docx: <w:sectPr> not found in document.xml — pandoc reference.docx shape changed?');
  }
  const insertion =
    `<w:pgSz w:w="${PAGE_WIDTH_TWIPS}" w:h="${PAGE_HEIGHT_TWIPS}" />` +
    `<w:pgMar w:top="${MARGIN_TWIPS}" w:right="${MARGIN_TWIPS}" w:bottom="${MARGIN_TWIPS}" w:left="${MARGIN_TWIPS}" w:header="720" w:footer="720" w:gutter="0" />`;
  const insertAt = sectPrOpenMatch.index + sectPrOpenMatch[0].length;
  return documentXml.slice(0, insertAt) + insertion + documentXml.slice(insertAt);
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const workDir = mkdtempSync(path.join(tmpdir(), 'make-reference-docx-'));
  try {
    const basePath = path.join(workDir, 'base-reference.docx');
    const base = execFileSync(pandocBin, ['--print-default-data-file', 'reference.docx'], {
      maxBuffer: 1024 * 1024 * 64,
    });
    writeFileSync(basePath, base);

    const unzipDir = path.join(workDir, 'unzipped');
    mkdirSync(unzipDir, { recursive: true });
    run('unzip', ['-o', '-q', basePath, '-d', unzipDir]);

    const stylesPath = path.join(unzipDir, 'word', 'styles.xml');
    const documentPath = path.join(unzipDir, 'word', 'document.xml');
    const styles = readFileSync(stylesPath, 'utf8');
    const document = readFileSync(documentPath, 'utf8');

    writeFileSync(stylesPath, patchStylesXml(styles), 'utf8');
    writeFileSync(documentPath, patchDocumentXml(document), 'utf8');

    // Re-zip in place (must update the existing archive so the OOXML
    // [Content_Types].xml / _rels entries at the zip root stay intact; a
    // fresh `zip -r` from the unzipped tree produces an equivalent valid
    // OOXML zip since every original entry was extracted and is being
    // re-added — pandoc/Word do not care about zip entry order for docx).
    rmSync(outPath, { force: true });
    run('zip', ['-q', '-r', '-X', outPath, '.'], { cwd: unzipDir });

    console.log(`Wrote ${path.relative(workbenchRoot, outPath)} (font: ${REFERENCE_BODY_FONT}, page: US Letter, margins: 1")`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('make-reference-docx failed:', err);
  process.exit(1);
});
