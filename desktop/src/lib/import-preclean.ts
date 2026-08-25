import { dehyphenate, type DehyphenationResult } from './dehyphenate';
import { splitFootnoteBlock, splitFrontmatter } from './translation-file';
import { parseStrayHeadingNumeral, type StrayNumeralStyle } from './ocr-repair/skeleton';

const BLANK_RUN = /[ \t]*\r?\n(?:[ \t]*\r?\n)+[ \t]*/g;
const HYPHEN_SITE = /([A-Za-z]+)-\r?\n([A-Za-z]+)/g;
const CHAPTER_TAG_OPENS = /^\s*\{\d+\.\d+\}/u;

/**
 * How this file breaks its lines — DECLARED by the importer at the pre-clean
 * step, never inferred. `paragraph-per-line` is a FINAL cut: every single
 * newline is a paragraph boundary and N2 joins nothing. `wrapped` is a
 * printed measure: single newlines inside a blank-line-delimited block are
 * physical wraps and join, while the blank-line boundaries survive as the
 * paragraph newlines the rest of the importer reads.
 */
export type PreCleanLineMode = 'paragraph-per-line' | 'wrapped';

export interface PreCleanSections {
  prefix: string;
  body: string;
  /**
   * The blank space between the last body character and the footnotes
   * sentinel. Held out of the body so N4 can't collapse the blank line a
   * `<<notes>>` block sits behind, and so the rebuilt file can never glue the
   * last paragraph onto the sentinel.
   */
  gap: string;
  suffix: string;
}

export interface TaggedPreCleanStart {
  sections: PreCleanSections;
  dehyphenation: DehyphenationResult;
  /**
   * Ordinals of the newlines that stand for a blank-line paragraph boundary
   * in the collapsed body. In `wrapped` mode these are exactly the newlines
   * N2 may not join, which is how N4's paragraph information survives the
   * join instead of being flattened with the wraps.
   */
  paragraphBreaks: Set<number>;
  /**
   * Which line mode to PRESELECT on the declaration screen. A suggestion and
   * nothing more: it never activates N2 by itself.
   */
  suggestedMode: PreCleanLineMode;
}

export interface PageJoinProposal {
  index: number;
  boundaryOffset: number;
  paragraphBefore: number;
  paragraphAfter: number;
  before: string;
  after: string;
}

export type DeletionReason = 'folio' | 'stray-heading';

export interface DeletionProposal {
  index: number;
  paragraphIndex: number;
  text: string;
  before: string;
  after: string;
  reasons: DeletionReason[];
}

export interface DeletionScan {
  paragraphCount: number;
  proposals: DeletionProposal[];
  warnings: string[];
  folioCandidates: number;
  strayHeadingCandidates: number;
}

export interface StripCounts {
  folioParagraphs: number;
  strayHeadingNumerals: number;
}

/**
 * Split the upload on the same two fences used by parseTranslationFile.
 *
 * The footnote boundary is taken FROM `splitFootnoteBlock` — its own last-
 * sentinel choice and its own valid-tail rule — and only converted from a
 * line index to a byte offset here. A second sentinel regex living in this
 * file was the bug: it allowed `[ \t]*` after `-->` where the real parser
 * allows `\s*`, so a sentinel line ending in a non-breaking space was peeled
 * there and not here, and every note definition imported as body prose.
 */
export function splitPreCleanSource(raw: string): PreCleanSections {
  const { body: afterFrontmatter } = splitFrontmatter(raw);
  const prefix = raw.slice(0, raw.length - afterFrontmatter.length);
  const footnoteSplit = splitFootnoteBlock(afterFrontmatter);
  if (footnoteSplit.sentinelLine === undefined) {
    return { prefix, body: afterFrontmatter, gap: '', suffix: '' };
  }

  let sentinelOffset = 0;
  for (let line = 0; line < footnoteSplit.sentinelLine; line += 1) {
    sentinelOffset = afterFrontmatter.indexOf('\n', sentinelOffset) + 1;
  }
  const beforeSentinel = afterFrontmatter.slice(0, sentinelOffset);
  const gapStart = beforeSentinel.search(/(?:\r?\n[ \t]*)+$/u);
  return {
    prefix,
    body: gapStart < 0 ? beforeSentinel : beforeSentinel.slice(0, gapStart),
    gap: gapStart < 0 ? '' : beforeSentinel.slice(gapStart),
    suffix: afterFrontmatter.slice(sentinelOffset),
  };
}

export function rebuildPreCleanSource(sections: PreCleanSections, body: string): string {
  if (!sections.suffix) return sections.prefix + body + sections.gap;
  // The sentinel must start its own line whatever the body ended up as: a
  // sentinel glued mid-line is invisible to splitFootnoteBlock, and every
  // note definition then imports as body prose.
  const gap = sections.gap || (body.endsWith('\n') ? '' : '\n');
  return sections.prefix + body + gap + sections.suffix;
}

export function hasChapterTag(body: string): boolean {
  return /\{\d+\.\d+\}/u.test(body);
}

// N4. `paragraphBreaks` records ONLY the newlines that stand in for a blank
// run: those are the boundaries the file itself declared, and they are what
// N2 must not join. A file with no blank run has declared no boundary, so the
// set is empty — in `paragraph-per-line` mode nothing joins anyway, and in
// `wrapped` mode the whole block is one paragraph, which is what the user said.
function collapseBlankRuns(body: string): { text: string; paragraphBreaks: Set<number> } {
  const blankRuns = [...body.matchAll(BLANK_RUN)];
  if (blankRuns.length === 0) return { text: body, paragraphBreaks: new Set<number>() };

  let text = '';
  let last = 0;
  const paragraphBreaks = new Set<number>();
  let newlineOrdinal = 0;
  for (const match of blankRuns) {
    const untouched = body.slice(last, match.index!);
    text += untouched;
    newlineOrdinal += (untouched.match(/\n/g) ?? []).length;
    paragraphBreaks.add(newlineOrdinal);
    text += '\n';
    newlineOrdinal += 1;
    last = match.index! + match[0].length;
  }
  text += body.slice(last);
  return { text, paragraphBreaks };
}

function remapBreaksAfterHyphenation(
  before: string,
  after: string,
  paragraphBreaks: Set<number>,
): Set<number> {
  // One left-to-right pass: matchAll yields non-overlapping sites in order, so
  // the newline counter only ever moves forward. (Counting from offset 0 per
  // site is quadratic — 16s on a 790KB body with 12k sites.)
  const removed = new Set<number>();
  let cursor = 0;
  let ordinal = 0;
  for (const match of before.matchAll(HYPHEN_SITE)) {
    const newlineOffset = match.index! + match[0].indexOf('\n');
    while (cursor < newlineOffset) {
      if (before.charCodeAt(cursor) === 10) ordinal += 1;
      cursor += 1;
    }
    removed.add(ordinal);
  }

  const remapped = new Set<number>();
  let survivingOrdinal = 0;
  const originalNewlineCount = (before.match(/\n/g) ?? []).length;
  for (let index = 0; index < originalNewlineCount; index += 1) {
    if (removed.has(index)) continue;
    if (paragraphBreaks.has(index)) remapped.add(survivingOrdinal);
    survivingOrdinal += 1;
  }

  // A failed or substituted dehyphenator may not follow the standard
  // one-newline-per-site transform. In that case, keep all remaining line
  // breaks as paragraph boundaries rather than risk a silent soft-wrap join.
  if (survivingOrdinal !== (after.match(/\n/g) ?? []).length) {
    return new Set(Array.from({ length: (after.match(/\n/g) ?? []).length }, (_, i) => i));
  }
  return remapped;
}

export async function beginTaggedPreClean(
  raw: string,
  runDehyphenate: (text: string) => Promise<DehyphenationResult> = dehyphenate,
): Promise<TaggedPreCleanStart> {
  const sections = splitPreCleanSource(raw);
  const collapsed = collapseBlankRuns(sections.body);
  const dehyphenation = await runDehyphenate(collapsed.text);
  return {
    sections,
    dehyphenation,
    paragraphBreaks: remapBreaksAfterHyphenation(
      collapsed.text,
      dehyphenation.text,
      collapsed.paragraphBreaks,
    ),
    suggestedMode: looksHardWrapped(sections.body) ? 'wrapped' : 'paragraph-per-line',
  };
}

function protectedLines(text: string): boolean[] {
  const lines = text.split('\n');
  const protectedLine = Array(lines.length).fill(false) as boolean[];
  let fenced = false;
  let htmlDisplay = false;
  for (let i = 0; i < lines.length; i += 1) {
    const trim = lines[i].trim();
    const fence = /^(?:```|~~~)/u.test(trim);
    const htmlOpen = /^<(?:pre|table|figure|blockquote)\b/iu.test(trim);
    const htmlClose = /^<\/(?:pre|table|figure|blockquote)>/iu.test(trim);
    const displayShape = /^(?: {4}|\t|>\s?|\|)/u.test(lines[i])
      || /\S {4,}\S/u.test(lines[i]);
    const list = /^(?:[-*•]|\d+\.)\s+/u.test(trim);
    // A whole-line numeral is a folio, a stray division head, or a printed
    // page number — the exact shapes S2/S3 exist to find. Joining it into the
    // wrapped line above it deletes the evidence before S2 ever runs, and the
    // import then reports zero of everything. It is a line, not prose.
    const bareNumeral = /^\d{1,4}$/u.test(trim) || isNumeralShaped(trim);
    protectedLine[i] = fenced || htmlDisplay || fence || htmlOpen || htmlClose
      || displayShape || list || bareNumeral;
    if (fence) fenced = !fenced;
    if (htmlOpen && !htmlClose) htmlDisplay = true;
    if (htmlClose) htmlDisplay = false;
  }
  return protectedLine;
}

// PRESELECTION ONLY. This heuristic used to gate N2 and was wrong in both
// directions — it read a short-lined FINAL cut as hard-wrapped and refused a
// real scan over one long line. It now picks nothing but which button the
// declaration screen highlights; the user's answer is what activates N2.
const HARD_WRAP_MIN_LINES = 6;
const HARD_WRAP_MAX_MEASURE = 100;
/** A line counts as "at the measure" from this fraction of the measure. */
const HARD_WRAP_AT_MEASURE = 0.6;
/** …and this fraction of lines must sit there. */
const HARD_WRAP_CLUSTER_SHARE = 0.6;
const HARD_WRAP_MID_SENTENCE_SHARE = 0.5;
// A printed sentence can also close on an ellipsis or a Greek ano teleia;
// without them a Greek FINAL cut read as mid-sentence on every line.
const LINE_END_TERMINAL = /[.!?:;·…”"’')\]]$/u;

export function looksHardWrapped(text: string): boolean {
  const lines = text.split('\n')
    .map(line => line.replace(/[ \t\r]+$/u, ''))
    .filter(line => line.length > 0);
  if (lines.length < HARD_WRAP_MIN_LINES) return false;
  // The measure is the widest line AFTER dropping the top decile: a scan is
  // still hard-wrapped when one line overruns the measure, and taking the
  // plain maximum let a single long line disqualify the whole file.
  const widths = lines.map(line => line.length).sort((a, b) => a - b);
  const measure = widths[Math.max(0, widths.length - Math.ceil(widths.length * 0.1) - 1)];
  if (measure > HARD_WRAP_MAX_MEASURE) return false;
  const clustered = lines.filter(line => line.length >= measure * HARD_WRAP_AT_MEASURE).length;
  const midSentence = lines.filter(line => !LINE_END_TERMINAL.test(line)).length;
  return clustered / lines.length >= HARD_WRAP_CLUSTER_SHARE
    && midSentence / lines.length >= HARD_WRAP_MID_SENTENCE_SHARE;
}

/**
 * N2: join physical line wraps, preserving declared paragraph boundaries and
 * display/numeral lines. Callers reach this only in `wrapped` mode — the
 * decision to join is the importer's, never this function's.
 */
export function joinSoftWraps(text: string, paragraphBreaks: Set<number>): string {
  const lines = text.split('\n');
  const protectedLine = protectedLines(text);
  const out: string[] = [];
  let current = lines[0];
  for (let i = 1; i < lines.length; i += 1) {
    const keep = paragraphBreaks.has(i - 1)
      || protectedLine[i - 1]
      || protectedLine[i]
      // A chapter tag opens a division, never the tail of a wrapped line.
      || CHAPTER_TAG_OPENS.test(lines[i]);
    if (keep) {
      out.push(current);
      current = lines[i];
      continue;
    }
    const left = current.replace(/[ \t\r]+$/u, '');
    const right = lines[i].replace(/^[ \t]+/u, '');
    current = left && right ? `${left} ${right}` : left + right;
  }
  out.push(current);
  return out.join('\n');
}

/**
 * Apply the DECLARED line mode. `paragraph-per-line` is the identity: every
 * newline the file has is a paragraph the user says is real, and the body
 * comes back byte-identical.
 */
export function finishTaggedNormalization(
  start: TaggedPreCleanStart,
  resolvedBody: string,
  mode: PreCleanLineMode,
): string {
  return mode === 'wrapped' ? joinSoftWraps(resolvedBody, start.paragraphBreaks) : resolvedBody;
}

/**
 * Whether the two line modes would produce different bytes. When they would
 * not, there is nothing for the importer to declare and the question is not
 * worth a screen — asking it anyway would be furniture.
 */
export function lineModeMatters(start: TaggedPreCleanStart, resolvedBody: string): boolean {
  return finishTaggedNormalization(start, resolvedBody, 'wrapped') !== resolvedBody;
}

interface Paragraph {
  index: number;
  start: number;
  end: number;
  text: string;
  display: boolean;
  list: boolean;
}

function paragraphs(text: string): Paragraph[] {
  const lines = text.split('\n');
  const displayLines = protectedLines(text);
  let offset = 0;
  return lines.map((line, index) => {
    const start = offset;
    const end = start + line.length;
    offset = end + 1;
    return {
      index,
      start,
      end,
      text: line,
      display: displayLines[index],
      list: /^(?:[-*•]|\d+\.)\s+/u.test(line.trim()),
    };
  });
}

function contextEnd(text: string): string {
  return text.trim().replace(/\s+/gu, ' ').slice(-100);
}

function contextStart(text: string): string {
  return text.trim().replace(/\s+/gu, ' ').slice(0, 100);
}

function crossesChapterTag(before: string, after: string): boolean {
  return /\{\d+\.\d+\}\s*$/u.test(before) || /^\s*\{\d+\.\d+\}/u.test(after);
}

/** N1: find review-only sentence joins. This function never mutates text. */
export function proposePageBreakJoins(text: string): PageJoinProposal[] {
  const ps = paragraphs(text);
  const proposals: PageJoinProposal[] = [];
  for (let i = 0; i + 1 < ps.length; i += 1) {
    const before = ps[i].text.trimEnd();
    const after = ps[i + 1].text.trimStart();
    if (!before || !after) continue;
    if (ps[i].display || ps[i + 1].display || ps[i].list || ps[i + 1].list) continue;
    if (/^\(/u.test(after) || /^\d{1,4}[ab](?:\d{1,2})?(?:\s|$)/u.test(after)) continue;
    if (crossesChapterTag(before, after)) continue;
    // Match the tail as a base character followed by any combining marks:
    // macOS hands over NFD Greek, where `ἀρετή` ends in U+0301, not in the
    // letter. Testing `before.at(-1)` alone saw the mark and proposed nothing.
    const following = after[0];
    if (!/[\p{Ll},—–"'‘’“”)»]\p{M}*$/u.test(before) || !/\p{Ll}/u.test(following)) continue;
    proposals.push({
      index: proposals.length,
      boundaryOffset: ps[i].end,
      paragraphBefore: ps[i].index,
      paragraphAfter: ps[i + 1].index,
      before: contextEnd(before),
      after: contextStart(after),
    });
  }
  return proposals;
}

export function applyPageBreakJoins(
  text: string,
  proposals: PageJoinProposal[],
  accepted: Set<number>,
): string {
  if (accepted.size === 0) return text;
  const offsets = proposals
    .filter(proposal => accepted.has(proposal.index))
    .map(proposal => proposal.boundaryOffset)
    .sort((a, b) => a - b);
  const parts: string[] = [];
  let cursor = 0;
  for (const offset of offsets) {
    if (offset < cursor) continue;
    parts.push(text.slice(cursor, offset).replace(/[ \t\r]+$/u, ''), ' ');
    cursor = offset + 1;
  }
  parts.push(text.slice(cursor));
  return parts.join('');
}

function adjacentChapter(paragraphsInBody: Paragraph[], index: number): { key: string; chapter: number } | null {
  const candidates = [paragraphsInBody[index + 1]?.text, paragraphsInBody[index - 1]?.text];
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const text = candidates[candidateIndex];
    if (!text) continue;
    const matches = [...text.matchAll(/\{(\d+)\.(\d+)\}/g)];
    if (matches.length > 0) {
      const match = candidateIndex === 0 ? matches[0] : matches[matches.length - 1];
      return { key: `${match[1]}.${match[2]}`, chapter: Number(match[2]) };
    }
  }
  return null;
}

// Glyph-confusion characters an OCR pass substitutes for digits or Roman
// letters. On their own they spell ordinary words ('loss', 'solo'), so a
// numeral has to carry at least one unambiguous numeral character and may
// not be mostly confusion glyphs.
const NUMERAL_CHARS = /^[0-9IVXLCl|rOoSsZz]+$/u;
const UNAMBIGUOUS_NUMERAL = /[0-9IVXLC]/gu;
const NUMERAL_MAX_LENGTH = 6;

function isNumeralShaped(text: string): boolean {
  const compact = text.replace(/\s+/gu, '');
  if (compact.length === 0 || compact.length > NUMERAL_MAX_LENGTH) return false;
  if (!NUMERAL_CHARS.test(compact)) return false;
  const unambiguous = (compact.match(UNAMBIGUOUS_NUMERAL) ?? []).length;
  if (unambiguous === 0) return false;
  return compact.length - unambiguous <= unambiguous;
}

interface BareNumeral {
  paragraphIndex: number;
  value: number;
  text: string;
}

/** Does the nearest non-blank paragraph above this one open a book's chapter 1? */
function followsFirstChapterTag(paragraphsInBody: Paragraph[], paragraphIndex: number): boolean {
  for (let i = paragraphIndex - 1; i >= 0; i -= 1) {
    const text = paragraphsInBody[i].text.trim();
    if (!text) continue;
    return /\{\d+\.1\}/u.test(text);
  }
  return false;
}

// Folio cadence (S2): the values must climb by a constant step at
// monotonically increasing positions, spaced evenly enough that they read as
// one per printed page. Real folios sit 3, 4, 3 paragraphs apart — demanding
// that the paragraph gap EQUAL the value step never matched anything.
// The run is read off ADJACENT bare numerals: a number that breaks the
// cadence ends the run and is reported rather than dropped, which is the safe
// direction when the alternative is deleting a quantity that belongs to the
// prose.
const FOLIO_GAP_TOLERANCE = 2;
/** A page number advances by one, or by two where only one side is printed. */
const FOLIO_MAX_STEP = 2;
/**
 * Two numbers in step are a coincidence — a pair of consecutive years, two
 * numbered sections, two Bekker-shaped quantities. Three in cadence is the
 * shortest run that argues for a printed page number.
 */
const FOLIO_MIN_RUN = 3;
/** Below this, a run start is presumed a section number, not a page number. */
const FOLIO_SECTION_NUMBER_MAX = 3;

/** How far a run extends from `start`, or null if it never reaches cadence. */
function runFrom(items: BareNumeral[], start: number): number | null {
  let step: number | null = null;
  let minGap = Infinity;
  let maxGap = 0;
  let end = start;
  for (let next = start + 1; next < items.length; next += 1) {
    const valueStep = items[next].value - items[next - 1].value;
    const gap = items[next].paragraphIndex - items[next - 1].paragraphIndex;
    if (gap <= 0) break;
    if (step === null) {
      if (valueStep <= 0 || valueStep > FOLIO_MAX_STEP) break;
      step = valueStep;
    } else if (valueStep !== step) break;
    minGap = Math.min(minGap, gap);
    maxGap = Math.max(maxGap, gap);
    if (maxGap > minGap * FOLIO_GAP_TOLERANCE) break;
    end = next;
  }
  return end > start ? end : null;
}

/**
 * EVERY maximal cadence run, not just the longest. A scan whose folios break
 * and resume prints two runs, and reporting the second as "kept" left the
 * importer to delete those paragraphs by hand — the one job R5 exists to do.
 */
function folioRuns(items: BareNumeral[], canStart: (item: BareNumeral) => boolean): BareNumeral[][] {
  const runs: BareNumeral[][] = [];
  let start = 0;
  while (start <= items.length - FOLIO_MIN_RUN) {
    const end = canStart(items[start]) ? runFrom(items, start) : null;
    if (end !== null && end - start + 1 >= FOLIO_MIN_RUN) {
      runs.push(items.slice(start, end + 1));
      start = end + 1;
    } else {
      start += 1;
    }
  }
  return runs;
}

/** S2/S3 discovery. Every returned proposal remains untouched until review. */
export function scanDeletionProposals(
  text: string,
  strayNumeralStyle?: StrayNumeralStyle,
): DeletionScan {
  const ps = paragraphs(text);
  const warnings: string[] = [];
  const reasonsByParagraph = new Map<number, Set<DeletionReason>>();
  const bareNumbers: BareNumeral[] = ps.flatMap(paragraph => {
    const trim = paragraph.text.trim();
    return /^\d{1,4}$/u.test(trim)
      ? [{ paragraphIndex: paragraph.index, value: Number(trim), text: trim }]
      : [];
  });

  // A chapter that opens `{b.1}` and is followed by `1`, `2`, `3` is numbering
  // its sections, not its pages. Refuse to START a run there; a genuine folio
  // run reaching that low would have begun earlier in the file.
  const canStart = (item: BareNumeral): boolean =>
    item.value > FOLIO_SECTION_NUMBER_MAX || !followsFirstChapterTag(ps, item.paragraphIndex);

  const inRun = new Set<number>();
  for (const run of folioRuns(bareNumbers, canStart)) {
    for (const item of run) {
      inRun.add(item.paragraphIndex);
      reasonsByParagraph.set(item.paragraphIndex, new Set(['folio']));
    }
  }

  for (const paragraph of ps) {
    const trim = paragraph.text.trim();
    if (!isNumeralShaped(trim)) continue;
    const adjacent = adjacentChapter(ps, paragraph.index);
    if (!adjacent) continue;
    if (parseStrayHeadingNumeral(trim, adjacent.chapter, strayNumeralStyle) !== null) {
      const reasons = reasonsByParagraph.get(paragraph.index) ?? new Set<DeletionReason>();
      reasons.add('stray-heading');
      reasonsByParagraph.set(paragraph.index, reasons);
    } else if (!inRun.has(paragraph.index)) {
      // A folio already proposed for deletion is not "kept", and saying so
      // would file a false warning against the import record.
      warnings.push(
        `Stray heading numeral “${trim}” contradicts chapter tag {${adjacent.key}} and was kept.`,
      );
    }
  }

  for (const item of bareNumbers) {
    if (inRun.has(item.paragraphIndex)) continue;
    if (reasonsByParagraph.get(item.paragraphIndex)?.has('stray-heading')) continue;
    warnings.push(
      `Bare numeral “${item.text}” at paragraph ${item.paragraphIndex + 1} did not form a cadence run and was kept.`,
    );
  }

  const proposals = [...reasonsByParagraph.entries()]
    .sort(([a], [b]) => a - b)
    .map(([paragraphIndex, reasons], index) => ({
      index,
      paragraphIndex,
      text: ps[paragraphIndex].text.trim(),
      before: paragraphIndex > 0 ? contextEnd(ps[paragraphIndex - 1].text) : '',
      after: paragraphIndex + 1 < ps.length ? contextStart(ps[paragraphIndex + 1].text) : '',
      reasons: [...reasons],
    }));

  return {
    paragraphCount: ps.filter(paragraph => paragraph.text.trim().length > 0).length,
    proposals,
    warnings,
    folioCandidates: proposals.filter(item => item.reasons.includes('folio')).length,
    strayHeadingCandidates: proposals.filter(item => item.reasons.includes('stray-heading')).length,
  };
}

export function applyDeletionProposals(
  text: string,
  proposals: DeletionProposal[],
  accepted: Set<number>,
): { text: string; counts: StripCounts } {
  const acceptedItems = proposals.filter(item => accepted.has(item.index));
  if (acceptedItems.length === 0) {
    return { text, counts: { folioParagraphs: 0, strayHeadingNumerals: 0 } };
  }
  const removed = new Set(acceptedItems.map(item => item.paragraphIndex));
  return {
    text: text.split('\n').filter((_paragraph, index) => !removed.has(index)).join('\n'),
    counts: {
      folioParagraphs: acceptedItems.filter(item => item.reasons.includes('folio')).length,
      strayHeadingNumerals: acceptedItems.filter(item => item.reasons.includes('stray-heading')).length,
    },
  };
}
