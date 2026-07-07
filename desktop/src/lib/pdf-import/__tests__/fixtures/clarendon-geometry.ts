// Synthetic four-page fixture (recto, verso, recto, verso) in the Clarendon
// keyworded-heading style (spelled-out "BOOK TWO", Roman "CHAPTER I".."IV"),
// mirroring reeve-geometry.ts's construction but exercising a DIFFERENT
// corner of the spec: no titles (body prose sits directly under each
// heading, flush at the page's own body-left margin — never centered), and
// footnotes numbered PER-CHAPTER (reset to 1 at every chapter, not
// work-wide) — this is the gold case for Phase 3's scope-autodetection
// state machine choosing 'per-chapter' over 'continuous'/'per-book', and
// for the resulting scoped labels ([^2.1.1], [^2.2.1], ...) round-tripping
// through emission and parseTranslationFile.
//
// All prose is neutral synthetic filler; digits appear only at the
// deliberate tic/heading/footnote/folio positions below.
//
// Page 1 (recto): BOOK TWO / CHAPTER I. Body flush at col 0; gutter tics
//   right-aligned at col 90. Footnotes 1-2 (chapter I's own).
// Page 2 (verso): CHAPTER II (book inherited — no restated digit, keyworded
//   form). Body indent col 10; gutter tics flush left, padded to col 10.
//   Carries the "roll": a full-form tic ADVANCES THE COLUMN (676a -> 676b)
//   mid-page, with no drop/off-cadence flag (a clean column turn). Footnotes
//   1-2 reset for chapter II.
// Page 3 (recto): CHAPTER III. Carries a second roll (676b -> 677a, a
//   Bekker PAGE turn). Footnotes 1-2 reset for chapter III.
// Page 4 (verso): CHAPTER IV. A single footnote (1), still triggering the
//   discriminating reset transition from chapter III's note 2.
//
// Four chapters (not the spec's illustrative three) is a deliberate,
// necessary extension — logged in implementation-notes.md: the scope state
// machine only counts a transition as DISCRIMINATING when it crosses a
// division boundary, and needs >=3 such observations (SCOPE_DECIDE_N) before
// it will actually LOCK a verdict. Three chapters give only two
// chapter-boundary crossings — never enough to lock 'per-chapter' at all
// (the report would silently fall back to 'continuous', defeating the whole
// point of this fixture). The fourth chapter's single footnote supplies the
// third crossing that actually settles the verdict.

const RECTO_TIC_COL = 90;
const VERSO_BODY_COL = 10;

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
// Page 1 (recto) — BOOK TWO / CHAPTER I, footnotes 1-2.
// ---------------------------------------------------------------------------

const page1Lines: string[] = [
  centered(14, 'A Certain Synthetic Clarendon Text'),
  '',
  centered(30, 'BOOK TWO'),
  '',
  centered(30, 'CHAPTER I'),
  '',
  rectoTicLine('Of temperance and its excess let us speak in turn, for it too concerns', '676a1'),
  'itself with bodily pleasures and how a person stands toward them in,1',
  rectoTicLine('practice. Some pleasures belong to the soul alone and others belong', '5'),
  'to the body, and it is the bodily sort that most concern us here,2',
  rectoTicLine('in this further discussion, since license and its opposite are judged', '10'),
  'mainly by how a person handles food, drink, and the pleasures of touch.',
  '',
  '',
  '1. A synthetic gloss for chapter one, note one.',
  '2. A synthetic gloss for chapter one, note two, continuing here.',
  '',
  centered(44, '201'),
  '',
];

export const clarendonPage1: string = page1Lines.join('\n');

// ---------------------------------------------------------------------------
// Page 2 (verso) — CHAPTER II (book inherited), the column roll 676a->676b.
// ---------------------------------------------------------------------------

const page2Lines: string[] = [
  centered(9, '676a–b') + centered(50, '') + 'A Certain Synthetic Clarendon Text (ASC) 2.1–2.2',
  '',
  centered(31, 'CHAPTER II'),
  '',
  versoFillerLine('Next let us turn to the pleasures that concern the body more narrowly,'),
  versoTicLine('15', 'and how a settled disposition toward them differs from a mere episode,1'),
  versoFillerLine('since habit and nature together shape how far a person yields to them.'),
  versoTicLine('676b1', 'A further distinction concerns whether the excess is chiefly a fault of'),
  versoFillerLine('appetite or rather of judgment, for the two seldom fail in quite the same,2'),
  versoTicLine('5', 'way, and the difference matters for how correction ought to proceed.'),
  '',
  '',
  centered(10, '1. A synthetic gloss for chapter two, note one.'),
  centered(10, '2. A synthetic gloss for chapter two, note two, continuing here.'),
  '',
  centered(9, '202'),
  '',
];

export const clarendonPage2: string = page2Lines.join('\n');

// ---------------------------------------------------------------------------
// Page 3 (recto) — CHAPTER III, the page-turn roll 676b->677a.
// ---------------------------------------------------------------------------

const page3Lines: string[] = [
  'A Certain Synthetic Clarendon Text (ASC) 2.2–2.3' + centered(28, '') + '676b–677a',
  '',
  centered(30, 'CHAPTER III'),
  '',
  'Let us now consider the pleasures of touch more narrowly, since these',
  rectoTicLine('are the ones in which license is most commonly said to be found, for', '10'),
  'the other senses contribute little to the excess we are discussing,1',
  rectoTicLine('here, and a person who yields to them readily earns the name license,', '15'),
  'while one who resists them earns a name nearer to insensibility,2',
  rectoTicLine('though few persons truly fall so far toward that further extreme.', '677a1'),
  '',
  '',
  '1. A synthetic gloss for chapter three, note one.',
  '2. A synthetic gloss for chapter three, note two, continuing here.',
  '',
  centered(44, '203'),
  '',
];

export const clarendonPage3: string = page3Lines.join('\n');

// ---------------------------------------------------------------------------
// Page 4 (verso) — CHAPTER IV, a single footnote (the third discriminating
// reset that actually locks the 'per-chapter' verdict).
// ---------------------------------------------------------------------------

const page4Lines: string[] = [
  centered(9, '677a–b') + centered(50, '') + 'A Certain Synthetic Clarendon Text (ASC) 2.3–2.4',
  '',
  centered(31, 'CHAPTER IV'),
  '',
  versoFillerLine('Finally we should say something briefly about the remaining pleasures,'),
  versoTicLine('5', 'those that belong to hearing, sight, and smell rather than to touch,1'),
  versoFillerLine('for these too admit of a similar excess, though a much rarer one.'),
  '',
  '',
  centered(10, '1. A synthetic gloss for chapter four, note one.'),
  '',
  centered(9, '204'),
  '',
];

export const clarendonPage4: string = page4Lines.join('\n');

// All four physical pages, form-feed separated, ready for `splitPages` /
// `convertLayoutExtraction`.
export const clarendonFourPages: string = [clarendonPage1, clarendonPage2, clarendonPage3, clarendonPage4].join('\f');
