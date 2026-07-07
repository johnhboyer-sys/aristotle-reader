// pdf-import/index.ts
//
// pdftotext -layout → tagged translation-file converter; feeds
// parseTranslationFile unchanged.
//
// convertLayoutExtraction is the one entry point: it threads the Phase-1/2/3
// state machines (DocContext / DivisionState / FootnoteState) across the
// pages in order — scanPage → classifyDivisions → extractFootnotes per page —
// then hands the per-page bundles to emitDocument (emit.ts, Phase 4A).
//
// Refusal: zero promoted tics document-wide → ConvertRefusal with the
// Phase-1 §12 message (not a Bekker-numbered edition, or the extraction lost
// the gutter). Collapsed pages: without opts.pageLevelOnly the converter
// returns ConvertNeedsChoice (no partial output) so the caller can offer
// re-extraction or page-level-only anchoring; with it, collapsed pages emit
// only their full-form tics (bare tics there are position-unresolved and
// counted as suppressed).
//
// Multi-work input does not abort: book-sequence restarts surface in
// report.seams so the UI can warn "this file appears to contain more than
// one work — slice per work before import" (§3.7). NOTE the caller contract
// established in Phase 1–3 still holds for real imports: one work per
// conversion. Across a seam, chapter keys ("1.1"), footnote labels, and the
// running Bekker context all restart and would collide/flag.

import { splitPages } from './pages';
import { createDocContext, scanPage, buildRefusal } from './gutter';
import { classifyDivisions, createDivisionState } from './divisions';
import { extractFootnotes, createFootnoteState } from './footnotes';
import { emitDocument, type ConvertOptions, type ConvertResult, type PageBundle } from './emit';

export * from './pages';
export * from './line-shape';
export * from './gutter';
export * from './divisions';
export * from './footnotes';
export * from './emit';

// Phase 4B (ImportDialog's accept-stage pre-check): a form-feed byte is
// pdftotext's page-break marker and never appears in a hand-authored or
// already-tagged translation file — its presence is what tells the dialog to
// route an upload through convertLayoutExtraction before the metadata form,
// instead of the existing direct-parse path. A small pure exported function
// so this detection rule is unit-testable without a DOM/Svelte harness.
export function isLayoutExtraction(text: string): boolean {
  return text.includes('\f');
}

export function convertLayoutExtraction(raw: string, opts: ConvertOptions = {}): ConvertResult {
  const pages = splitPages(raw);
  const ctx = createDocContext();
  const divisionState = createDivisionState();
  const footnoteState = createFootnoteState();

  const bundles: PageBundle[] = [];
  const collapsedPages: number[] = [];
  for (const page of pages) {
    const scan = scanPage(page, ctx);
    const divisions = classifyDivisions(page, scan, divisionState);
    const footnotes = extractFootnotes(page, scan, divisions, footnoteState);
    bundles.push({ page, scan, divisions, footnotes });
    if (scan.collapsed) collapsedPages.push(page.index);
  }

  if (!ctx.anyTicSeen) {
    const nonEmptyPages = pages.filter((p) => p.lines.some((l) => l.trim().length > 0)).length;
    const refusal = buildRefusal(ctx, { pages: pages.length, nonEmptyPages });
    return { ok: false, refused: true, reason: refusal.note, scanned: refusal.scanned };
  }

  if (collapsedPages.length > 0 && !opts.pageLevelOnly) {
    // ≥1 collapsed page and no fallback chosen: no partial output — the
    // caller re-invokes with pageLevelOnly:true or tells the user to
    // re-extract (§3.6; the UI choice itself lands in Phase 4B).
    return { ok: false, needsChoice: true, collapsedPages };
  }

  const result = emitDocument(bundles, divisionState, footnoteState, collapsedPages);

  // Markers were seen but none survived the honesty audits and no divisions
  // were found: emitting a tag-less body would only defer the failure to a
  // less specific error downstream. Refuse with the real story instead.
  if (result.ok && result.report.ticsEmitted === 0 && result.report.divisions.chapters === 0) {
    return {
      ok: false,
      refused: true,
      reason:
        'Bekker-like numbers were found but none survived the reliability audits ' +
        '(see suppressed counts), and no book/chapter structure was detected — ' +
        'nothing reliable to import. The extraction is likely damaged; re-extract ' +
        'the PDF with pdftotext -layout.',
      scanned: {
        pages: pages.length,
        nonEmptyPages: pages.filter((p) => p.lines.some((l) => l.trim().length > 0)).length,
      },
    };
  }
  return result;
}
