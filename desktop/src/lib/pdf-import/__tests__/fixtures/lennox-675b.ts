import { createDocContext, type DocContext } from '../../gutter';

// Gold fixture: a synthetic recto page reconstructed to match the Lennox
// "Parts of Animals" III.14 pdftotext -layout output around the Bekker
// column transition 675b -> 676a.
//
// Layout rules baked into this fixture:
//  - Header line: Clarendon running heads print the page's opening Bekker
//    PAGE (not a range) at the outer margin — on a recto that is the right
//    edge, i.e. the same x-band as the gutter tics. The fixture places
//    "675b" at the tic column on line 0: the worst-case header trap. It
//    must be stripped positionally (a header full-form implies line 1, so
//    it can never be a 4/5 cadence step from the previous tic) and yield
//    no tic.
//  - Body lines start at column 0.
//  - Gutter tics are right-aligned so their first digit sits at column 78
//    (0-based index into the line string).
//  - 5-line cadence: a tic line every 5th body line, 4 filler lines between.
//  - The filler line just before the tic-15 line ends "ani-" (continued by
//    "mals..." on the tic-15 line, i.e. "animals" split across the break).
//  - The filler line just before the tic-35 line ends "al-" (continued by
//    "ready..." i.e. "already" split across the break).
//  - 676a is the first tic of the next column, so it appears in full form
//    rather than as a bare line number.

const TIC_COLUMN = 78;

function ticLine(prefix: string, tic: string): string {
  return prefix.padEnd(TIC_COLUMN, ' ') + tic;
}

const lines: string[] = [
  ticLine('Parts of Animals III.14', '675b'),
  '',
  'the digestive residue passes through a series of',
  'compartments before reaching the final passage',
  'where waste accumulates prior to expulsion from',
  'the body through a dedicated opening at the rear.',
  ticLine('up of their nourishment. In all those', '5'),
  'animals with a long and coiled intestine the',
  'residue is worked upon repeatedly so that useful',
  'matter is extracted before what remains is passed',
  'onward toward the final stretch of the tract.',
  ticLine('some this part, called the rectum', '10'),
  'is broader than the coil preceding it, since',
  'the residue gathered there must be stored for',
  'some time before being expelled from the body',
  'in creatures we would call larger land ani-',
  ticLine('mals and in those needing greater', '15'),
  'storage capacity the rectum is proportionately',
  'wider still, so as to hold more of the residue',
  'without discomfort to the animal carrying it',
  'through the ordinary business of its life.',
  ticLine('a narrower space and, once the residue', '20'),
  'has been compacted there, it is voided at',
  "intervals that suit the animal's manner of life",
  'and the coarseness of the food it habitually',
  'takes in during the course of a single day.',
  ticLine('are not straight. For an open space', '25'),
  'of that kind would let the residue escape',
  'too soon, before it had yielded up what use',
  "remained in it for the animal's nourishment",
  'and for the maintenance of its bodily heat.',
  ticLine('nourishment, it is necessarily fresh', '30'),
  'when it first enters this final passage, and',
  'only gradually does it dry and harden as',
  'moisture is drawn from it by the surrounding',
  'parts, a process evident enough once one has al-',
  ticLine('ready useless residue. And while', '35'),
  'some creatures retain it longer than others',
  'the general pattern holds across every kind',
  'of animal that possesses a rectum of this sort',
  'and disposes of its residue in this manner.',
  ticLine('obvious in those that are larger', '676a'),
];

export const lennox675bPage: string = lines.join('\n');

/**
 * The primer DocContext this page opens under: mid-column at 675b, with the
 * last printed tic having been 675b1 on the (unmodeled) previous physical
 * page — so the 5->675b5 cadence step is the legitimate "first interval is
 * 4" case, not a dropped line.
 */
export function lennox675bPrimerContext(): DocContext {
  const ctx = createDocContext();
  ctx.page = 675;
  ctx.col = 'b';
  ctx.lastTic = { page: 675, col: 'b', line: 1, physPage: -1 };
  ctx.anyTicSeen = true;
  return ctx;
}

export interface ExpectedTic {
  raw: string;
  column: string;
  line: number;
  anchorWord: string;
}

export const lennox675bExpected: ExpectedTic[] = [
  { raw: '5', column: '675b', line: 5, anchorWord: 'up' },
  { raw: '10', column: '675b', line: 10, anchorWord: 'some' },
  { raw: '15', column: '675b', line: 15, anchorWord: 'and' },
  { raw: '20', column: '675b', line: 20, anchorWord: 'a' },
  { raw: '25', column: '675b', line: 25, anchorWord: 'are' },
  { raw: '30', column: '675b', line: 30, anchorWord: 'nourishment' },
  { raw: '35', column: '675b', line: 35, anchorWord: 'useless' },
  { raw: '676a', column: '676a', line: 1, anchorWord: 'obvious' },
];
