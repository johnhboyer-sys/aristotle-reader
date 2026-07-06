// Synthetic three-page fixture (recto, verso, recto) mirroring the layout
// geometry of the C. D. C. Reeve Nicomachean Ethics 1094a-1095b extraction
// (Oxford World's Classics / Hackett-style `pdftotext -layout` output). Only
// STRUCTURE is mirrored — column positions, header shape, division/footnote/
// folio placement, the hyphenation break, the paragraph indent, and the
// glued-footnote-marker decoy. All prose is neutral synthetic filler (no
// digits anywhere except the deliberate tic/heading/footnote/folio markers
// below); the tic lines begin with the exact anchor words this fixture's
// test asserts against.
//
// Page 1 (recto): body flush at col 0; gutter tics right-aligned at col 96.
// Page 2 (verso): body indent col 11; gutter tics flush left at col 0,
//   padded out to col 11. Its header is the "header-trap" case — it BEGINS
//   with a Bekker range ("1094a-1095a") at col 9, which a content-based
//   scanner might mistake for a tic; position-based header stripping (this
//   is always line index 0) must reject it regardless.
// Page 3 (recto): same geometry as page 1; carries the hyphenation-skip
//   case (previous line ends "direc-", the tic line begins with the
//   fragment "tion." which must be skipped in favor of the real anchor).
//
// Page 1 opens the work: 1094a1 is the very first full-form tic ever seen,
// so the fixture's DocContext must start fresh (createDocContext()).

const RECTO_TIC_COL = 96;
const VERSO_BODY_COL = 11;

function rectoTicLine(prefix: string, tic: string): string {
  return prefix.padEnd(RECTO_TIC_COL, ' ') + tic;
}

function versoTicLine(tic: string, text: string): string {
  return tic.padEnd(VERSO_BODY_COL, ' ') + text;
}

function versoFillerLine(text: string): string {
  return ' '.repeat(VERSO_BODY_COL) + text;
}

function centered(col: number, text: string): string {
  return ' '.repeat(col) + text;
}

// ---------------------------------------------------------------------------
// Page 1 (recto) — opens the work at 1094a1.
// ---------------------------------------------------------------------------

const page1Lines: string[] = [
  centered(12, 'A Certain Synthetic Work*'),
  '',
  '',
  '',
  centered(30, 'Book One'),
  '',
  centered(41, '1.1'),
  centered(29, 'Opening Matters'),
  '',
  rectoTicLine(
    'Every work of methodical inquiry seems to gather around some settled',
    '1094a1'
  ),
  'aim, and the pattern recurs across every ordinary pursuit worth naming.',
  'A plain observer soon notices that ends differ sharply from one another,',
  rectoTicLine(
    'activities of one kind stand apart from finished products of another,',
    '5'
  ),
  'and the products, where they exist, are commonly judged the nobler pair.',
  'Since pursuits and skills multiply without any obvious natural limit,',
  'their aims multiply likewise, each skill answering to its proper end.',
  rectoTicLine(
    '    But when several such pursuits fall under one broader capacity,',
    '10'
  ),
  'the narrower ones serve the wider one much as a tool serves a craftsman,',
  'and this nesting of purposes repeats itself at every level examined.',
  rectoTicLine(
    'choiceworthy ends belonging to the broader capacity outrank the ends',
    '15'
  ),
  'that serve only the narrower pursuits nested beneath them in turn,',
  'for the lesser aim is always undertaken for the sake of the greater one.',
  rectoTicLine(
    'else could be said were it not that the very same point recurs',
    '20'
  ),
  'whenever one pursuit is found sheltering beneath a broader capacity,',
  'and the pattern holds regardless of which particular skills are named.',
  '',
  '',
  '',
  '* Synthetic translator note on this rendering.',
  '',
  centered(44, '501'),
  '',
];

export const reevePage1: string = page1Lines.join('\n');

// ---------------------------------------------------------------------------
// Page 2 (verso) — header-trap + glued-footnote decoy + mid-page division.
// ---------------------------------------------------------------------------

const page2Lines: string[] = [
  centered(9, '1094a–1095a') + centered(50, '') + 'A Certain Synthetic Work (ASW) 2.1–2.2',
  '',
  versoTicLine(
    '25',
    'must now be traced back to whatever starting point the inquiry allows,'
  ),
  versoFillerLine('since no argument of this kind can rest content with half a foundation.'),
  versoFillerLine('It would seem that the most authoritative capacity governs the rest,'),
  versoFillerLine('and every subordinate skill answers upward to this governing one,'),
  versoFillerLine('which settles what the other practical sciences,1 and further skills'),
  versoTicLine('1094b1', 'to which point each subordinate skill must be content to remain,'),
  versoFillerLine('for the governing capacity alone surveys the whole shared undertaking,'),
  versoFillerLine('and every particular skill contributes some part toward that whole.'),
  versoTicLine('5', 'what serves the individual serves the larger community as well,'),
  versoFillerLine('though never in quite the same measure nor by quite the same road.'),
  '',
  '',
  centered(50, '2.1'),
  centered(43, 'A Further Distinction'),
  '',
  versoFillerLine('An account of this kind must not claim more precision than its matter allows,'),
  versoFillerLine('for the subject itself resists an exactness foreign to its own nature.'),
  versoTicLine('10', 'nobler things admit of a wider variation than the plainer sciences do,'),
  versoFillerLine('and this variation is native to the subject rather than a defect in it.'),
  versoTicLine('15', 'much of what passes for disagreement here is simply this variation,'),
  versoFillerLine('showing itself under different names to different observers in turn.'),
  versoTicLine('20', 'outline and rough sketch are therefore the fitting standard to expect,'),
  versoFillerLine('and demanding more of it would only mistake the nature of the inquiry.'),
  versoTicLine('25', 'that much granted, an educated listener asks only for the degree of'),
  versoFillerLine('precision that the underlying subject itself is able to sustain.'),
  versoTicLine('1095a1', 'while an unconditioned judge would ask for still more than that,'),
  versoFillerLine('the ordinary listener rightly asks for only what the matter allows.'),
  '',
  '',
  centered(11, '1. Synthetic gloss on the preceding remark.'),
  '',
  centered(9, '502'),
  '',
];

export const reevePage2: string = page2Lines.join('\n');

// ---------------------------------------------------------------------------
// Page 3 (recto) — hyphenation-skip case + roll to 1095b1.
// ---------------------------------------------------------------------------

const page3Lines: string[] = [
  'A Certain Synthetic Work (ASW) 2.2–2.3' + centered(46, '') + '1095a–b',
  '',
  'Of the actions belonging to ordinary life the accounts given here agree,',
  'and nothing said above needs to be qualified any further at this point.',
  '   Further, since attention naturally follows feeling rather than reason,',
  rectoTicLine(
    'for such a listener nothing said here will prove of any real benefit,',
    '5'
  ),
  'since the aim throughout has been action rather than bare knowledge alone.',
  'It makes no difference whether the listener is young in years or merely',
  'young in temperament, for the fault lies in a settled manner of living',
  rectoTicLine(
    'accord with feeling rather than in any want of years as such, and so',
    '10'
  ),
  'knowledge profits such a listener no more than it profits an unruly one.',
  'To a listener whose desires already follow a settled rational order,',
  'however, knowing these things brings a considerable practical benefit.',
  '',
  '',
  centered(50, '2.3'),
  centered(44, 'A Further Question'),
  '',
  'Let the inquiry, then, resume from where the preceding account left off.',
  rectoTicLine(
    'choice among the several ends discussed reaches, in the end, toward',
    '15'
  ),
  'whatever stands at the very top of the things worth doing for their own sake.',
  '   About its ordinary name there is little disagreement among observers,',
  'for nearly everyone calls it by the same familiar word without dispute,',
  rectoTicLine(
    'well enough agreed upon, though its precise nature remains contested,',
    '20'
  ),
  'since plain observers and careful observers rarely answer in quite the same way.',
  rectoTicLine(
    'Suppose the question is put instead to someone already persuaded that',
    '25'
  ),
  'the matter admits of no further clarification beyond what has been said,',
  rectoTicLine(
    'We should therefore proceed carefully rather than rush toward a verdict,',
    '30'
  ),
  'weighing each proposed account against what ordinary experience confirms.',
  'points where the plainest experience already settles the matter fairly',
  'firmly, one need not labor further over a question already closed direc-',
  rectoTicLine('tion. For we must always begin from what is already known to us,', '1095b1'),
  'even where what is known to us differs from what is known without qualification.',
  '',
  '',
  centered(44, '503'),
  '',
];

export const reevePage3: string = page3Lines.join('\n');

// All three physical pages, form-feed separated, ready for `splitPages`.
export const reeveThreePages: string = [reevePage1, reevePage2, reevePage3].join('\f');

export interface ExpectedReeveTic {
  raw: string;
  column: string;
  line: number;
  anchorWord: string;
}

export const reevePage1Expected: ExpectedReeveTic[] = [
  { raw: '1094a1', column: '1094a', line: 1, anchorWord: 'Every' },
  { raw: '5', column: '1094a', line: 5, anchorWord: 'activities' },
  { raw: '10', column: '1094a', line: 10, anchorWord: 'But' },
  { raw: '15', column: '1094a', line: 15, anchorWord: 'choiceworthy' },
  { raw: '20', column: '1094a', line: 20, anchorWord: 'else' },
];

export const reevePage2Expected: ExpectedReeveTic[] = [
  { raw: '25', column: '1094a', line: 25, anchorWord: 'must' },
  { raw: '1094b1', column: '1094b', line: 1, anchorWord: 'to' },
  { raw: '5', column: '1094b', line: 5, anchorWord: 'what' },
  { raw: '10', column: '1094b', line: 10, anchorWord: 'nobler' },
  { raw: '15', column: '1094b', line: 15, anchorWord: 'much' },
  { raw: '20', column: '1094b', line: 20, anchorWord: 'outline' },
  { raw: '25', column: '1094b', line: 25, anchorWord: 'that' },
  { raw: '1095a1', column: '1095a', line: 1, anchorWord: 'while' },
];

export const reevePage3Expected: ExpectedReeveTic[] = [
  { raw: '5', column: '1095a', line: 5, anchorWord: 'for' },
  { raw: '10', column: '1095a', line: 10, anchorWord: 'accord' },
  { raw: '15', column: '1095a', line: 15, anchorWord: 'choice' },
  { raw: '20', column: '1095a', line: 20, anchorWord: 'well' },
  { raw: '25', column: '1095a', line: 25, anchorWord: 'Suppose' },
  { raw: '30', column: '1095a', line: 30, anchorWord: 'We' },
  { raw: '1095b1', column: '1095b', line: 1, anchorWord: 'For' },
];
