import { describe, expect, it } from 'vitest';
import type { DehyphenationResult } from '../dehyphenate';
import { splitFootnoteBlock, splitFrontmatter } from '../translation-file';
import {
  applyDeletionProposals,
  applyPageBreakJoins,
  beginTaggedPreClean,
  finishTaggedNormalization,
  lineModeMatters,
  looksHardWrapped,
  proposePageBreakJoins,
  rebuildPreCleanSource,
  scanDeletionProposals,
  splitPreCleanSource,
  type PreCleanLineMode,
} from '../import-preclean';

const unchanged = async (text: string): Promise<DehyphenationResult> => ({
  text,
  decisions: [],
  reviewCount: 0,
  ran: false,
});

async function preClean(raw: string, mode: PreCleanLineMode = 'wrapped', run = unchanged) {
  const started = await beginTaggedPreClean(raw, run);
  const body = finishTaggedNormalization(started, started.dehyphenation.text, mode);
  return { started, body, rebuilt: rebuildPreCleanSource(started.sections, body) };
}

// A machine-wrapped scan: lines cluster at the printed measure and most break
// mid-clause. This is the only shape N2 may touch.
const HARD_WRAPPED = [
  '{1.1} The first paragraph of this scan was set by a machine that',
  'wrapped every line at the printed measure, so the lines break in',
  'the middle of clauses rather than at the end of sentences.',
  '',
  'A second paragraph, wrapped the same way, continues past the end',
  'of its first line and only stops when the paragraph itself has',
  'run out of words.',
  '',
  '{1.2} A third paragraph opens a new chapter on its own tag line',
  'and wraps once more before it ends.',
].join('\n');

const HARD_WRAPPED_JOINED = [
  '{1.1} The first paragraph of this scan was set by a machine that wrapped every line at the printed measure, so the lines break in the middle of clauses rather than at the end of sentences.',
  'A second paragraph, wrapped the same way, continues past the end of its first line and only stops when the paragraph itself has run out of words.',
  '{1.2} A third paragraph opens a new chapter on its own tag line and wraps once more before it ends.',
].join('\n');

// An Apostle-shaped FINAL cut: one paragraph per physical line, note markers
// inline, and a blank line before the footnotes sentinel. Every single
// newline here IS a paragraph break.
const FINAL_CUT = [
  '---',
  'formatVersion: 1',
  'work: PA',
  'translator: Synthetic',
  'license: user-supplied',
  'language: en',
  'id: synthetic-en',
  'noTicks: 639a10 639a12',
  '---',
  '',
  '{1.1} The first paragraph of the synthetic cut occupies one physical line from its opening tag to its closing full stop, as a FINAL cut always does.[^1]',
  'A second paragraph, again a single line, carries its own marker and ends in punctuation of its own rather than in a machine wrap.[^2]',
  '{1.2} A third paragraph opens the next chapter, once more on one line, and once more closes on a full stop of its own.',
  'A fourth paragraph closes the sample, wandering on at the length one-line paragraphs reach before they end.',
  '',
  '<!-- footnotes scope=continuous -->',
  '[^1]: A synthetic note.',
  '[^2]: A second synthetic note,',
  '   continued on a wrapped definition line.',
].join('\n');

// Six short unpunctuated lines with a blank run between them — heading-like
// paragraphs, the shape the old content heuristic read as hard-wrapped and
// fused. Under a DECLARED mode it is whatever the importer says it is.
const SHORT_UNPUNCTUATED = [
  '{1.1} On the parts of animals',
  'A short heading-like paragraph',
  'Another short heading paragraph',
  '',
  '{1.2} A second division opens here',
  'A short paragraph line again',
  'Something else that stays short',
].join('\n');

// A real hard-wrapped scan whose first line overruns the printed measure —
// the shape the old gate refused outright, so its wraps went unjoined.
const WRAPPED_WITH_LONG_LINE = [
  '{1.1} This opening line of the scan runs a good deal past one hundred characters before it breaks, as a run-in heading will,',
  'and the rest of the page wraps at the printed measure, so the',
  'lines break in the middle of clauses rather than at the end of',
  'sentences,',
  '',
  'while a second paragraph wraps the same way and stops only when',
  'the paragraph itself has run out of words.',
].join('\n');

describe('N2 activation is declared, not detected', () => {
  it('keeps a short unpunctuated tagged file byte-identical in paragraph-per-line mode', async () => {
    const { body, rebuilt } = await preClean(SHORT_UNPUNCTUATED, 'paragraph-per-line');
    // N4 still collapses the blank run — that is the app's paragraph shape —
    // but not one paragraph is fused into another.
    expect(body.split('\n')).toEqual([
      '{1.1} On the parts of animals',
      'A short heading-like paragraph',
      'Another short heading paragraph',
      '{1.2} A second division opens here',
      'A short paragraph line again',
      'Something else that stays short',
    ]);
    expect(rebuilt).toBe(body);
  });

  it('joins the same file in wrapped mode, because the importer said so', async () => {
    const { body } = await preClean(SHORT_UNPUNCTUATED, 'wrapped');
    expect(body.split('\n')).toEqual([
      '{1.1} On the parts of animals A short heading-like paragraph Another short heading paragraph',
      '{1.2} A second division opens here A short paragraph line again Something else that stays short',
    ]);
  });

  it('joins a wrap-shaped file even when one line exceeds a hundred characters', async () => {
    const { body } = await preClean(WRAPPED_WITH_LONG_LINE, 'wrapped');
    expect(body.split('\n')).toEqual([
      '{1.1} This opening line of the scan runs a good deal past one hundred characters before it breaks, as a run-in heading will, and the rest of the page wraps at the printed measure, so the lines break in the middle of clauses rather than at the end of sentences,',
      'while a second paragraph wraps the same way and stops only when the paragraph itself has run out of words.',
    ]);
  });

  it('re-emits every blank-line paragraph boundary after joining', async () => {
    const { started, body } = await preClean(HARD_WRAPPED, 'wrapped');
    // Three source paragraphs, three blank-run boundaries collapsed to two
    // newlines, and both survive the join as paragraph newlines.
    expect(started.paragraphBreaks.size).toBe(2);
    expect(body).toBe(HARD_WRAPPED_JOINED);
    expect(body.split('\n')).toHaveLength(3);
  });

  it('round-trips a FINAL cut byte-identically in paragraph-per-line mode', async () => {
    const { started, body, rebuilt } = await preClean(FINAL_CUT, 'paragraph-per-line');
    expect(rebuilt).toBe(FINAL_CUT);
    expect(body.split('\n')).toHaveLength(5);          // leading blank + four paragraphs
    expect(proposePageBreakJoins(body)).toEqual([]);
    expect(scanDeletionProposals(body).proposals).toEqual([]);
    expect(started.sections.gap).toBe('\n\n');
  });

  it('never joins a line that opens with a chapter tag, even in wrapped mode', async () => {
    const raw = [
      '{1.1} A first paragraph in this hard-wrapped scan breaks its',
      'lines at the printed measure and not at the sentence, so the',
      'wrap lands mid-clause,',
      '{1.2} a chapter tag on the line after, which must never be',
      'swallowed by the wrapped line above it, whatever the letters',
      'on either side of the break happen to be,',
      '',
      'A closing paragraph, wrapped the same way, so the scan reads',
      'as hard-wrapped throughout.',
    ].join('\n');
    const { body } = await preClean(raw, 'wrapped');
    expect(body.split('\n')).toEqual([
      '{1.1} A first paragraph in this hard-wrapped scan breaks its lines at the printed measure and not at the sentence, so the wrap lands mid-clause,',
      '{1.2} a chapter tag on the line after, which must never be swallowed by the wrapped line above it, whatever the letters on either side of the break happen to be,',
      'A closing paragraph, wrapped the same way, so the scan reads as hard-wrapped throughout.',
    ]);
  });

  it('asks nothing when the two modes produce the same bytes', async () => {
    const oneParagraph = await beginTaggedPreClean('{1.1} A single unbroken paragraph.', unchanged);
    expect(lineModeMatters(oneParagraph, oneParagraph.dehyphenation.text)).toBe(false);
    const wrapped = await beginTaggedPreClean(HARD_WRAPPED, unchanged);
    expect(lineModeMatters(wrapped, wrapped.dehyphenation.text)).toBe(true);
  });
});

describe('the hard-wrap heuristic preselects and nothing else', () => {
  it('suggests wrapped for a machine-wrapped scan and paragraph-per-line for a FINAL cut', async () => {
    expect((await beginTaggedPreClean(HARD_WRAPPED, unchanged)).suggestedMode).toBe('wrapped');
    expect((await beginTaggedPreClean(FINAL_CUT, unchanged)).suggestedMode).toBe('paragraph-per-line');
  });

  it('still suggests wrapped when one line overruns the printed measure', () => {
    expect(looksHardWrapped(WRAPPED_WITH_LONG_LINE)).toBe(true);
  });

  it('counts an ellipsis and a Greek ano teleia as printed sentence ends', () => {
    const greekParagraphs = [
      'Περὶ τῶν μερῶν τῶν ζῴων λεκτέον…',
      'Ἀρετή τε καὶ κακία περὶ ταῦτά ἐστιν·',
      'Λόγος καὶ διάνοια καὶ τὰ τοιαῦτα…',
      'Ψυχῆς δὲ πέρι λεκτέον ὕστερον·',
      'Φύσις καὶ τέχνη διαφέρουσιν…',
      'Οὐσία καὶ συμβεβηκὸς οὐ ταὐτόν·',
    ].join('\n');
    expect(looksHardWrapped(greekParagraphs)).toBe(false);
  });
});

describe('tagged import pre-clean input bounds and ordering', () => {
  it('keeps the frontmatter fence byte-identical while cleaning only the body', async () => {
    const prefix = '---\nsource: "line-\nwrapped metadata"\n---\n';
    const { started, body, rebuilt } = await preClean(prefix + HARD_WRAPPED);

    expect(started.sections.prefix).toBe(prefix);
    expect(rebuilt).toBe(prefix + HARD_WRAPPED_JOINED);
    expect(body).toBe(HARD_WRAPPED_JOINED);
  });

  it('keeps the footnote-definition fence byte-identical while cleaning only the body', async () => {
    const suffix = '<!-- footnotes scope=continuous -->\n[^1]: Note text\n   stays wrapped.';
    const { started, body, rebuilt } = await preClean(`${HARD_WRAPPED}\n\n${suffix}`);

    expect(started.sections.suffix).toBe(suffix);
    expect(rebuilt).toBe(`${HARD_WRAPPED_JOINED}\n\n${suffix}`);
    expect(body).toBe(HARD_WRAPPED_JOINED);
  });

  it('rebuilds a footnoted file so the block still splits with an identical map', async () => {
    const raw = `${HARD_WRAPPED}\n\n<!-- footnotes scope=continuous -->\n[^1]: First note.\n[^2]: Second note.`;
    const { rebuilt } = await preClean(raw);
    const before = splitFootnoteBlock(splitFrontmatter(raw).body);
    const after = splitFootnoteBlock(splitFrontmatter(rebuilt).body);

    expect(Object.keys(before.footnotes)).toHaveLength(2);
    expect(after.footnotes).toEqual(before.footnotes);
    expect(after.body).not.toContain('<!-- footnotes');
  });

  it('peels a sentinel line whose tail is a non-ASCII space, exactly as the parser does', async () => {
    // `splitFootnoteBlock` accepts `\s*` after `-->`; a second, stricter
    // regex here accepted only spaces and tabs, so this file split one way
    // for the parser and another for the pre-cleaner, and every note
    // definition was pre-cleaned as body prose.
    const suffix = '<!-- footnotes scope=continuous -->\u00a0\n[^1]: A note.\n[^2]: 12';
    const raw = `${HARD_WRAPPED}\n\n${suffix}`;
    const sections = splitPreCleanSource(raw);

    expect(sections.suffix).toBe(suffix);
    expect(sections.body).toBe(HARD_WRAPPED);
    expect(sections.gap).toBe('\n\n');

    const { body, rebuilt } = await preClean(raw, 'wrapped');
    expect(body).toBe(HARD_WRAPPED_JOINED);
    // The bare `12` inside a note definition is exactly the shape S2 deletes.
    expect(scanDeletionProposals(body).proposals).toEqual([]);
    expect(Object.keys(splitFootnoteBlock(rebuilt).footnotes)).toEqual(['1', '2']);
  });

  it('leaves a sentinel-shaped line in the body when the parser refuses the split', () => {
    // splitFootnoteBlock abandons a split whose tail is not definitions; the
    // pre-cleaner must inherit that verdict rather than take its own.
    const raw = 'Body prose.\n\n<!-- footnotes -->\nOrdinary prose, not a definition.';
    expect(splitPreCleanSource(raw)).toEqual({ prefix: '', body: raw, gap: '', suffix: '' });
  });

  it('starts the footnotes sentinel on its own line even with no blank run to reuse', () => {
    const glued = rebuildPreCleanSource(
      { prefix: '', body: '', gap: '', suffix: '<!-- footnotes -->\n[^1]: Note.' },
      'A last paragraph with no trailing newline.',
    );
    expect(glued).toBe('A last paragraph with no trailing newline.\n<!-- footnotes -->\n[^1]: Note.');
    expect(Object.keys(splitFootnoteBlock(glued).footnotes)).toEqual(['1']);
  });

  it('runs blank collapse before hyphenation, then soft-wrap joining', async () => {
    const seen: string[] = [];
    const joinHyphen = async (text: string): Promise<DehyphenationResult> => {
      seen.push(text);
      return { text: text.replace('com-\nplete', 'complete'), decisions: [], reviewCount: 0, ran: true };
    };
    const { body } = await preClean('{1.1} A com-\n\nplete thought.', 'wrapped', joinHyphen);

    expect(seen).toEqual(['{1.1} A com-\nplete thought.']);
    expect(body).toBe('{1.1} A complete thought.');
  });

  it('pre-cleans a book-sized hard-wrapped body in well under a second', async () => {
    // ~740KB with ~12,000 line-end hyphen sites — the shape that took 16s
    // when every site rescanned the body from offset 0 for its line ordinal.
    const lines: string[] = [];
    for (let i = 0; i < 12_000; i += 1) {
      lines.push(`Line ${i} of the synthetic scan ends in a hyphen-`);
      lines.push('ated word, and then runs on to the printed measure.');
      if (i % 5 === 4) lines.push('');
    }
    const raw = lines.join('\n');
    expect(raw.length).toBeGreaterThan(700_000);
    const joinHyphens = async (text: string): Promise<DehyphenationResult> => ({
      text: text.replace(/([A-Za-z]+)-\r?\n([A-Za-z]+)/g, '$1$2'),
      decisions: [],
      reviewCount: 0,
      ran: true,
    });

    const startedAt = performance.now();
    const started = await beginTaggedPreClean(raw, joinHyphens);
    const body = finishTaggedNormalization(started, started.dehyphenation.text, 'wrapped');
    proposePageBreakJoins(body);
    scanDeletionProposals(body);
    const elapsed = performance.now() - startedAt;

    expect(body).toContain('hyphenated word');
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('N1 page-break sentence proposals', () => {
  it('proposes lowercase, comma, closing-punctuation, and polytonic Greek boundaries', () => {
    const boundaries = [
      'word\nlower',
      'clause,\nlower',
      'dash—\nlower',
      'dash–\nlower',
      'quote”\nlower',
      'quote\'\nlower',
      'aside)\nlower',
      'quote»\nlower',
      'λόγος\nἀρετή',
      // NFD: the line ends in a combining acute, not in the letter carrying
      // it. macOS hands over decomposed Greek as a matter of course.
      `${'ἀρετή'.normalize('NFD')}\n${'καὶ'.normalize('NFD')}`,
      `${'ἀρετή'.normalize('NFC')}\n${'καὶ'.normalize('NFC')}`,
    ];
    for (const text of boundaries) {
      expect(proposePageBreakJoins(text), text).toHaveLength(1);
    }
  });

  it('does not propose after terminal punctuation or a digit, or before uppercase text', () => {
    for (const text of ['word.\nlower', 'word?\nlower', 'word!\nlower', 'word2\nlower', 'word\nLower']) {
      expect(proposePageBreakJoins(text), text).toHaveLength(0);
    }
  });

  it('does not propose in protected display, list, parenthetical, Bekker, or tag contexts', () => {
    const protectedCases = [
      '```\nword\nlower\n```',
      '- word\nlower',
      'word\n* lower',
      'word\n(see 639a for this)',
      'word\n639a12 lower',
      'word\n{1.2} lower',
      'table    cell\nlower',
    ];
    for (const text of protectedCases) {
      expect(proposePageBreakJoins(text), text).toHaveLength(0);
    }
  });

  it('applies only the joins accepted by review', () => {
    const text = 'word\nlower.\nclause,\nmore';
    const proposals = proposePageBreakJoins(text);
    expect(applyPageBreakJoins(text, proposals, new Set([proposals[1].index])))
      .toBe('word\nlower.\nclause, more');
  });
});

describe('S2 and S3 proposed deletions', () => {
  it('proposes a folio run whose values step evenly at uneven paragraph gaps', () => {
    const body = [
      'Opening paragraph.',
      'More prose.',
      'Still more prose.',
      '101',
      'A paragraph after the folio.',
      'Another paragraph.',
      'A third paragraph.',
      '102',
      'Prose again.',
      'Prose once more.',
      '103',
      'Closing paragraph.',
    ].join('\n');
    const scan = scanDeletionProposals(body);

    expect(scan.folioCandidates).toBe(3);
    expect(scan.proposals.map(item => item.text)).toEqual(['101', '102', '103']);
    expect(scan.warnings).toEqual([]);
  });

  it('reports a bare number off the run and never proposes dropping it', () => {
    const lone = scanDeletionProposals('Opening.\n83\nClosing.');
    expect(lone.folioCandidates).toBe(0);
    expect(lone.proposals).toEqual([]);
    expect(lone.warnings).toEqual([
      'Bare numeral “83” at paragraph 2 did not form a cadence run and was kept.',
    ]);

    // A number that breaks the cadence ends the run: the numerals still in
    // cadence are proposed, and everything off it is reported, never dropped.
    const strayInsideRun = scanDeletionProposals(
      ['Opening.', '10', 'Prose.', '83', 'Prose.', '11', 'Prose.', '12', 'Prose.', '13', 'Closing.'].join('\n'),
    );
    expect(strayInsideRun.proposals.map(item => item.text)).toEqual(['11', '12', '13']);
    expect(strayInsideRun.warnings).toEqual([
      'Bare numeral “10” at paragraph 2 did not form a cadence run and was kept.',
      'Bare numeral “83” at paragraph 4 did not form a cadence run and was kept.',
    ]);
  });

  it('needs three in cadence: two consecutive numbers are a coincidence', () => {
    const pair = scanDeletionProposals(['Opening.', '5', 'Prose.', '6', 'Closing.'].join('\n'));
    expect(pair.proposals).toEqual([]);
    expect(pair.warnings).toEqual([
      'Bare numeral “5” at paragraph 2 did not form a cadence run and was kept.',
      'Bare numeral “6” at paragraph 4 did not form a cadence run and was kept.',
    ]);
  });

  it('refuses to start a run on a section number under a first-chapter tag', () => {
    const numberedSections = [
      '{1.1} The chapter opens.',
      '1',
      'The first numbered section.',
      '2',
      'The second numbered section.',
      '3',
      'The third numbered section.',
    ].join('\n');
    const scan = scanDeletionProposals(numberedSections);
    expect(scan.folioCandidates).toBe(0);
    // `1` beside `{1.1}` is still S3's business — a division head mis-read as
    // a paragraph — but 2 and 3 are proposed for nothing and merely reported.
    expect(scan.proposals.map(item => item.text)).toEqual(['1']);
    expect(scan.warnings).toEqual([
      'Bare numeral “2” at paragraph 4 did not form a cadence run and was kept.',
      'Bare numeral “3” at paragraph 6 did not form a cadence run and was kept.',
    ]);

    // The same cadence deeper in the file, where no first-chapter tag sits
    // above it, is an ordinary folio run.
    const folios = [
      '{1.4} A chapter further in.',
      '1',
      'Prose.',
      '2',
      'Prose.',
      '3',
      'Prose.',
    ].join('\n');
    expect(scanDeletionProposals(folios).proposals.map(item => item.text)).toEqual(['1', '2', '3']);
  });

  it('proposes every maximal run, not only the longest', () => {
    const twoRuns = [
      'Prose.', '10', 'Prose.', '11', 'Prose.', '12', 'Prose.', '13',
      'A long stretch of prose with no printed numbers in it at all.',
      'More prose.', 'More prose still.',
      'Prose.', '20', 'Prose.', '21', 'Prose.', '22',
    ].join('\n');
    const scan = scanDeletionProposals(twoRuns);
    expect(scan.proposals.map(item => item.text)).toEqual(['10', '11', '12', '13', '20', '21', '22']);
    expect(scan.warnings).toEqual([]);
  });

  it('proposes either numeral branch when it matches the adjacent tag and flags contradiction', () => {
    expect(scanDeletionProposals('I I\n{1.2} Roman chapter.').strayHeadingCandidates).toBe(1);
    expect(scanDeletionProposals('I I\n{1.11} Arabic chapter.').strayHeadingCandidates).toBe(1);

    const contradiction = scanDeletionProposals('I I\n{1.4} Different chapter.');
    expect(contradiction.strayHeadingCandidates).toBe(0);
    expect(contradiction.warnings).toEqual([
      'Stray heading numeral “I I” contradicts chapter tag {1.4} and was kept.',
    ]);
  });

  it('does not report a proposed folio as a numeral it kept', () => {
    const scan = scanDeletionProposals(
      ['{1.1} Opening.', '10', 'Middle.', '12', 'More.', '14', 'Closing.'].join('\n'),
    );
    expect(scan.proposals.map(item => item.text)).toEqual(['10', '12', '14']);
    expect(scan.warnings).toEqual([]);
  });

  it('keeps a whole-line numeral out of an N2 join so S2 can still see it', async () => {
    const raw = [
      '{1.1} The first paragraph of this scan was set by a machine that',
      'wrapped every line at the printed measure, so the lines break in',
      'the middle of clauses rather than at the end of sentences,',
      '101',
      'and the prose continues on the next printed page with more of',
      'the same wrapped lines running to the measure,',
      '',
      'A second paragraph, wrapped the same way, continues past the end',
      'of its first line and stops when the paragraph runs out,',
      '102',
      'and then goes on again after the folio number the printed book',
      'carried at that point in its run,',
      '',
      'A third paragraph, wrapped once more, so the folio cadence has',
      'three printed numbers to be read off,',
      '103',
      'and a closing line after it.',
    ].join('\n');
    const { body } = await preClean(raw, 'wrapped');
    expect(body).toContain('\n101\n');
    expect(scanDeletionProposals(body).proposals.map(item => item.text)).toEqual(['101', '102', '103']);
  });

  it('never reads an ordinary word as a numeral', () => {
    for (const word of ['loss', 'solo', 'cross', 'lorries', 'Sirs', 'is']) {
      const scan = scanDeletionProposals(`${word}\n{1.5} Chapter five.`);
      expect(scan.warnings, word).toEqual([]);
      expect(scan.proposals, word).toEqual([]);
    }
  });

  it('counts the paragraphs a review has to weigh the proposals against', () => {
    const scan = scanDeletionProposals('Opening.\n10\nMiddle.\n12\nMore.\n14\nClosing.');
    expect(scan.paragraphCount).toBe(7);
    expect(scan.proposals).toHaveLength(3);
  });

  it('does not mutate proposed deletions until an accepted set is supplied', () => {
    const text = 'Opening.\n10\nMiddle.\n12\nMore.\n14\nClosing.';
    const scan = scanDeletionProposals(text);
    expect(applyDeletionProposals(text, scan.proposals, new Set()).text).toBe(text);
    expect(applyDeletionProposals(text, scan.proposals, new Set([0, 1, 2]))).toEqual({
      text: 'Opening.\nMiddle.\nMore.\nClosing.',
      counts: { folioParagraphs: 3, strayHeadingNumerals: 0 },
    });
  });
});
