// Phase-4A §4: emission unit tests.
//
// The golden three-page conversion runs on the synthetic Reeve-geometry
// fixture with two LOCAL patches (the originals stay untouched — the
// Phase-1 gutter pins in gutter-reeve.test.ts depend on their exact line
// indices):
//   1. Page 1's title "Opening Matters" is re-centered to align with its
//      "1.1" heading (the fixture as committed centers it 6 cols off — a
//      fixture artifact; real Reeve titles align within 2.0 cols, and
//      Phase 2's ±4 capture tolerance rightly rejects the artifact).
//   2. Page 2 gains a "Book Two" heading before "2.1" (the fixture jumps
//      from 1.1 to 2.1 with no book heading, which is not the geometry the
//      golden is about; the remaining 2.1→2.3 chapter gap is kept and
//      pinned as its honest audit flag).
//
// The golden string was MEASURED from the implementation and then verified
// by hand against the fixture feature by feature before pinning:
// chapter+column tag adjacency ({1.1} {1094a} Every), verso markers,
// paragraph joins across both page boundaries, the +4/+3 paragraph indents,
// the hyphen join (direc- + tion. → direction., lowercase ⇒ hyphen dropped),
// the glued footnote marker replacement (sciences,[^1]), the title map, and
// the trailing footnote block with its scope attribute.

import { describe, expect, it } from 'vitest';
import { convertLayoutExtraction } from '../index';
import { parseTranslationFile } from '../../translation-file';
import { reevePage1, reevePage2, reevePage3 } from './fixtures/reeve-geometry';

// --- fixture patches (local to this test; see header) -----------------------

const patchedPage1 = reevePage1.replace(
  ' '.repeat(29) + 'Opening Matters',
  ' '.repeat(35) + 'Opening Matters'
);

function patchBookTwo(page2: string): string {
  const lines = page2.split('\n');
  const idx = lines.findIndex((l) => l.trim() === '2.1');
  lines.splice(idx, 0, ' '.repeat(46) + 'Book Two', '');
  return lines.join('\n');
}

const threePages = [patchedPage1, patchBookTwo(reevePage2), reevePage3].join('\f');

// --- golden ------------------------------------------------------------------

const GOLDEN_BODY =
  '{1.1} {1094a} Every work of methodical inquiry seems to gather around some settled aim, ' +
  'and the pattern recurs across every ordinary pursuit worth naming. A plain observer soon ' +
  'notices that ends differ sharply from one another, {5} activities of one kind stand apart ' +
  'from finished products of another, and the products, where they exist, are commonly judged ' +
  'the nobler pair. Since pursuits and skills multiply without any obvious natural limit, ' +
  'their aims multiply likewise, each skill answering to its proper end.\n\n' +
  '{10} But when several such pursuits fall under one broader capacity, the narrower ones ' +
  'serve the wider one much as a tool serves a craftsman, and this nesting of purposes repeats ' +
  'itself at every level examined. {15} choiceworthy ends belonging to the broader capacity ' +
  'outrank the ends that serve only the narrower pursuits nested beneath them in turn, for the ' +
  'lesser aim is always undertaken for the sake of the greater one. {20} else could be said ' +
  'were it not that the very same point recurs whenever one pursuit is found sheltering ' +
  'beneath a broader capacity, and the pattern holds regardless of which particular skills are ' +
  'named. {25} must now be traced back to whatever starting point the inquiry allows, since no ' +
  'argument of this kind can rest content with half a foundation. It would seem that the most ' +
  'authoritative capacity governs the rest, and every subordinate skill answers upward to this ' +
  'governing one, which settles what the other practical sciences,[^1] and further skills ' +
  '{1094b} to which point each subordinate skill must be content to remain, for the governing ' +
  'capacity alone surveys the whole shared undertaking, and every particular skill contributes ' +
  'some part toward that whole. {5} what serves the individual serves the larger community as ' +
  'well, though never in quite the same measure nor by quite the same road.\n\n' +
  '{2.1} An account of this kind must not claim more precision than its matter allows, for the ' +
  'subject itself resists an exactness foreign to its own nature. {10} nobler things admit of ' +
  'a wider variation than the plainer sciences do, and this variation is native to the subject ' +
  'rather than a defect in it. {15} much of what passes for disagreement here is simply this ' +
  'variation, showing itself under different names to different observers in turn. {20} ' +
  'outline and rough sketch are therefore the fitting standard to expect, and demanding more ' +
  'of it would only mistake the nature of the inquiry. {25} that much granted, an educated ' +
  'listener asks only for the degree of precision that the underlying subject itself is able ' +
  'to sustain. {1095a} while an unconditioned judge would ask for still more than that, the ' +
  'ordinary listener rightly asks for only what the matter allows. Of the actions belonging to ' +
  'ordinary life the accounts given here agree, and nothing said above needs to be qualified ' +
  'any further at this point.\n\n' +
  'Further, since attention naturally follows feeling rather than reason, {5} for such a ' +
  'listener nothing said here will prove of any real benefit, since the aim throughout has ' +
  'been action rather than bare knowledge alone. It makes no difference whether the listener ' +
  'is young in years or merely young in temperament, for the fault lies in a settled manner of ' +
  'living {10} accord with feeling rather than in any want of years as such, and so knowledge ' +
  'profits such a listener no more than it profits an unruly one. To a listener whose desires ' +
  'already follow a settled rational order, however, knowing these things brings a ' +
  'considerable practical benefit.\n\n' +
  '{2.3} Let the inquiry, then, resume from where the preceding account left off. {15} choice ' +
  'among the several ends discussed reaches, in the end, toward whatever stands at the very ' +
  'top of the things worth doing for their own sake.\n\n' +
  'About its ordinary name there is little disagreement among observers, for nearly everyone ' +
  'calls it by the same familiar word without dispute, {20} well enough agreed upon, though ' +
  'its precise nature remains contested, since plain observers and careful observers rarely ' +
  'answer in quite the same way. {25} of their own accord the listeners then ask after the ' +
  'ground of the claim the matter admits of no further clarification beyond what has been ' +
  'said, {30} We should therefore proceed carefully rather than rush toward a verdict, ' +
  'weighing each proposed account against what ordinary experience confirms. points where the ' +
  'plainest experience already settles the matter fairly firmly, one need not labor further ' +
  'over a question already closed direction. {1095b} For we must always begin from what is ' +
  'already known to us, even where what is known to us differs from what is known without ' +
  'qualification.';

const GOLDEN = `${GOLDEN_BODY}\n\n<!-- footnotes scope=continuous -->\n` +
  '[^*]: Synthetic translator note on this rendering.\n' +
  '[^1]: Synthetic gloss on the preceding remark.\n';

describe('emit: golden three-page Reeve-geometry conversion', () => {
  const result = convertLayoutExtraction(threePages);

  it('converts ok and emits exactly the golden tagged output', () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tagged).toBe(GOLDEN);
  });

  it('captures the title map verbatim, keyed b.c', () => {
    if (!result.ok) return;
    expect(result.titles).toEqual({
      '1.1': 'Opening Matters',
      '2.1': 'A Further Distinction',
      '2.3': 'A Further Question',
    });
  });

  it('reports the measured emission facts', () => {
    if (!result.ok) return;
    expect(result.report).toEqual({
      pages: 3,
      ticsEmitted: 20,
      ticsSuppressed: [],
      droppedLines: [],
      collapsedPages: [],
      divisions: { books: 2, chapters: 3, titled: 3 },
      footnotes: { scope: 'continuous', notes: 2, markers: 1, unmatched: [] },
      displayBlocks: [],
      dehyphenation: { joined: 1, kept: 0 },
      seams: [],
      flags: {
        'footnote-star-worklevel': 1,
        // The fixture has no 2.2 — the sequence audit's honest gap flag.
        'chapter-sequence:gap-or-repeat:1->3': 1,
      },
    });
  });

  it('round-trips through parseTranslationFile: tags anchor the right words, footnotes populate', () => {
    if (!result.ok) return;
    const p = parseTranslationFile(result.tagged);
    expect(p.warnings).toEqual([]);
    expect(p.density).toBe('five-line-or-column');

    // Adjacency: {1.1} and {1094a} both land on "Every" at offset 0.
    const chapterTag = p.tags[0];
    const columnTag = p.tags[1];
    expect(chapterTag).toMatchObject({ kind: 'chapter', book: 1, chapter: 1, offset: 0 });
    expect(columnTag).toMatchObject({ kind: 'column', citation: '1094a1', offset: 0 });
    expect(p.text.slice(0, 5)).toBe('Every');

    // Every emitted tag's offset lands on its anchor word.
    const anchorOf = (citation: string) => {
      const t = p.tags.find((x) => x.citation === citation)!;
      return p.text.slice(t.offset).split(/\s+/)[0].replace(/[.,;:]+$/, '');
    };
    expect(anchorOf('1094a5')).toBe('activities');
    expect(anchorOf('1094a10')).toBe('But');
    expect(anchorOf('1094b1')).toBe('to');
    expect(anchorOf('1095a25')).toBe('of');
    expect(anchorOf('1095b1')).toBe('For'); // past the hyphen join

    // Footnote marker glued after "sciences,"; both definitions present.
    expect(p.footnoteMarkers).toHaveLength(1);
    expect(p.text.slice(p.footnoteMarkers[0].offset - 9, p.footnoteMarkers[0].offset)).toBe('sciences,');
    expect(p.footnotes).toEqual({
      '*': 'Synthetic translator note on this rendering.',
      '1': 'Synthetic gloss on the preceding remark.',
    });
    expect(p.footnoteScope).toBe('continuous');

    // No newline anywhere but the paragraph breaks (the file's trailing
    // newline survives the block split as a final '\n' — allowed).
    expect(p.text.replace(/\n$/, '').split('\n').every((para) => para.trim().length > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §3.5 display blocks — the Categories-4 table case, split across a page
// boundary, with a tic on a table row.
// ---------------------------------------------------------------------------

function rectoTic(prefix: string, tic: string): string {
  return prefix.padEnd(60, ' ') + tic;
}

const catPageA = [
  'Categories (Cat.) .4–.5',
  '',
  'Of things said without any combination, each signifies either substance or',
  'quantity or qualification or a relative or where or when or being in a',
  'position or having or doing or being affected. To give a rough idea, examples',
  '',
  'Substance       human, horse',
  'Quantity        two feet long, three feet long',
  rectoTic('Where           in the Lyceum, in the marketplace', '2a1'),
].join('\n');

const catPageB = [
  'Categories (Cat.) .4–.5',
  '',
  'When            yesterday, last year',
  'Being in a position     is lying, is sitting',
  '',
  'None of the above is said just by itself in any affirmation, but by the',
  'combination of these with one another an affirmation is produced.',
].join('\n');

describe('emit §3.5: display blocks (Categories-style table, page-break split, tic on a row)', () => {
  const result = convertLayoutExtraction([catPageA, catPageB].join('\f'));

  it('emits each table row as its own paragraph, multi-space collapsed, tic tag kept', () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paragraphs = result.tagged.trimEnd().split('\n\n');
    expect(paragraphs).toEqual([
      'Of things said without any combination, each signifies either substance or ' +
        'quantity or qualification or a relative or where or when or being in a ' +
        'position or having or doing or being affected. To give a rough idea, examples',
      'Substance human, horse',
      'Quantity two feet long, three feet long',
      '{2a} Where in the Lyceum, in the marketplace',
      'When yesterday, last year',
      'Being in a position is lying, is sitting',
      'None of the above is said just by itself in any affirmation, but by the ' +
        'combination of these with one another an affirmation is produced.',
    ]);
  });

  it('records both page-parts of the block and flags the display-anchored tic', () => {
    if (!result.ok) return;
    expect(result.report.displayBlocks).toEqual([
      { page: 0, lines: [6, 8] },
      { page: 1, lines: [2, 3] },
    ]);
    expect(result.report.flags['display-block-anchor']).toBe(1);
    expect(result.report.ticsEmitted).toBe(1);
  });

  it('the short-page column tag {2a} round-trips under the extended grammar', () => {
    if (!result.ok) return;
    const p = parseTranslationFile(result.tagged);
    const tag = p.tags.find((t) => t.kind === 'column')!;
    expect(tag.citation).toBe('2a1');
    expect(p.text.slice(tag.offset, tag.offset + 5)).toBe('Where');
  });
});

// ---------------------------------------------------------------------------
// §2 refusal — no printed gutter markers anywhere.
// ---------------------------------------------------------------------------

describe('emit refusal: no gutter markers → clean structured refusal', () => {
  const prosePage = [
    'Some Plain Prose',
    '',
    'This is a page of ordinary prose with no printed apparatus at all in it.',
    'It flows along and gives the scanner nothing to promote or to bind to.',
  ].join('\n');

  it('refuses with the Phase-1 §12 message and honest scan stats', () => {
    const result = convertLayoutExtraction([prosePage, prosePage, ''].join('\f'));
    expect(result.ok).toBe(false);
    if (result.ok || !('refused' in result)) return;
    expect(result.refused).toBe(true);
    expect(result.reason).toBe(
      'No printed Bekker gutter markers detected; not a Bekker-numbered edition, or ' +
        'the extraction lost the gutter.'
    );
    expect(result.scanned).toEqual({ pages: 3, nonEmptyPages: 2 });
  });
});

// ---------------------------------------------------------------------------
// §3.6 collapsed pages — ConvertNeedsChoice, then the page-level-only fallback.
// ---------------------------------------------------------------------------

describe('emit §3.6: collapsed page → needsChoice; pageLevelOnly → full-forms only', () => {
  const collapsedPage = [
    'A Header Line',
    '',
    rectoTic96('First line of body prose here continuing along the measure', '1094a1'),
    rectoTic96('second line of body prose continuing along more of it', '5'),
    rectoTic96('third line of body prose continuing further onward', '10'),
    rectoTic96('fourth line of body prose continuing beyond that point', '15'),
    'a closing body line with no tic on it at all to finish the page',
  ].join('\n');

  function rectoTic96(prefix: string, tic: string): string {
    return prefix.padEnd(96, ' ') + tic;
  }

  it('without pageLevelOnly: ConvertNeedsChoice, no partial output', () => {
    const result = convertLayoutExtraction(collapsedPage);
    expect(result.ok).toBe(false);
    if (result.ok || !('needsChoice' in result)) return;
    expect(result.needsChoice).toBe(true);
    expect(result.collapsedPages).toEqual([0]);
  });

  it('with pageLevelOnly: body emitted, full-form tag kept, bare tics suppressed and counted', () => {
    const result = convertLayoutExtraction(collapsedPage, { pageLevelOnly: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tagged).toBe(
      '{1094a} First line of body prose here continuing along the measure ' +
        'second line of body prose continuing along more of it ' +
        'third line of body prose continuing further onward ' +
        'fourth line of body prose continuing beyond that point ' +
        'a closing body line with no tic on it at all to finish the page\n'
    );
    expect(result.report.collapsedPages).toEqual([0]);
    expect(result.report.ticsEmitted).toBe(1);
    expect(result.report.ticsSuppressed).toEqual([{ flag: 'position-unresolved', count: 3 }]);
    expect(result.report.flags['page-collapsed']).toBe(1);
    expect(result.report.flags['position-unresolved:collapsed']).toBe(3);
  });
});
