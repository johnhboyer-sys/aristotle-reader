import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BookData, FlowTurn, GreekLine, Segment } from '../lib/data';
import { turnTranslationTexts } from '../lib/english-hit';
import {
  PAIR_ENGLISH_WORDS,
  PAIR_GREEK_LINES,
  pairEnglishText,
  pairEnglishWindow,
  pairGreekWindow,
  pairGreekText,
  pairUnits,
  referenceJoinHolds,
  unitAtEnglish,
  unitAtGreek,
  unitEnglish,
  unitPieces,
} from '../lib/paired-hit';
import { WORKS, searchableTranslations } from '../lib/works';

const LAMB = { id: 'rackham', slot: 'english' as const };
const JOWETT = { id: 'ross', slot: 'overlay' as const };

// A line of one-letter words: "α β γ" has tokens at offsets 0, 2, 4.
const line = (n: number, text: string): GreekLine => ({
  n, text, tokens: text.split(' ').map((t, i) => ({ t, o: i * 2, k: t })),
});
const seg = (column: string, english: string, ...greek: GreekLine[]): Segment => ({
  id: `1:${column}`, column, greek, english: { text: english, notes: [], markers: [] },
});
const turn = (t: Partial<FlowTurn>): FlowTurn => ({ s: null, d: null, g: null, e: null, p: false, ...t });

// Three sections, five turns:
//   T0  70a line 1          "One two three."
//   T1  70a line 2 → 70b η  "Four five | six seven eight"   (one turn, two sections)
//   T2  70b θ → 70c λ       a row of two stacked speeches, no English of its own
//   T3  no Greek            an English-only residual, in 70c
//   T4  70c μ               "Last."
function book(): BookData {
  return {
    book: 1,
    segments: [
      seg('70a', 'One two three. Four five', line(1, 'α β γ'), line(2, 'δ ε')),
      seg('70b', 'six seven eight Nine ten. Eleven', line(1, 'ζ η θ'), line(2, 'ι κ')),
      seg('70c', 'twelve thirteen Residual words here Last.', line(1, 'λ μ')),
    ],
    turnFlow: {
      leadE: null,
      turns: [
        turn({ s: 'EN', g: { c: '70a', n: 1, o: 0 }, e: 'One two three.', es: [{ o: 0, c: '70a' }], p: true,
          alt: { ross: { e: 'Uno dos.' } } }),
        turn({ s: 'Socrates', g: { c: '70a', n: 2, o: 0 }, e: 'Four five six seven eight', es: [{ o: 10, c: '70b' }], p: true,
          alt: { ross: { e: 'Cuatro cinco seis', es: [{ o: 13, c: '70b' }] } } }),
        turn({ g: { c: '70b', n: 1, o: 4 }, e: '', sub: [
          { s: 'Socrates', d: 'Soc.', e: 'Nine ten.' },
          { s: 'EN', d: 'Men.', e: 'Eleven twelve thirteen', es: [{ o: 7, c: '70c' }] },
        ] }),
        turn({ s: 'EN', e: 'Residual words here' }),
        turn({ s: 'Socrates', g: { c: '70c', n: 1, o: 2 }, e: 'Last.', p: true }),
      ],
    },
  };
}

describe('pairUnits', () => {
  const b = book();
  const [a70, b70, c70] = b.segments;
  const index = pairUnits(b, [LAMB, JOWETT]);

  it('cuts a unit for each turn in each section it has Greek in', () => {
    expect(index.units.map(u => `${u.turn}:${u.section}`)).toEqual(['0:70a', '1:70a', '1:70b', '2:70b', '2:70c', '4:70c']);
  });

  it("finds a Greek word's unit at a turn's first and last token", () => {
    const first = unitAtGreek(index, a70, 0);   // α
    const last = unitAtGreek(index, a70, 2);    // γ
    expect(last).toBe(first);
    expect(first.english.rackham).toBe('One two three.');
    // δ opens the next turn.
    expect(unitAtGreek(index, a70, 3).english.rackham).toBe('Four five');
  });

  it('cuts one turn at a section break: its Greek and its English each side', () => {
    const before = unitAtGreek(index, a70, 4);  // ε, the turn's last word in 70a
    const after = unitAtGreek(index, b70, 0);   // ζ, the same turn in 70b
    expect(before).not.toBe(after);
    expect(before.turn).toBe(after.turn);
    expect([before.section, before.english.rackham]).toEqual(['70a', 'Four five']);
    expect([after.section, after.english.rackham]).toEqual(['70b', 'six seven eight']);
    // The Greek stops where the next turn's pin falls, mid-line.
    expect(after.greek).toEqual([{ n: 1, from: 0, to: 4, text: 'ζ η' }]);
    expect(unitAtGreek(index, b70, 2).greek.map(s => s.text)).toEqual(['θ', 'ι κ']);
  });

  it('treats each stacked speech of a row as a turn of that row', () => {
    const row = unitAtGreek(index, b70, 2);     // θ
    expect(row.english.rackham).toBe('Nine ten. Eleven');
    // 70b reads: six seven eight | Nine ten. | Eleven
    expect(unitAtEnglish(index, b70, LAMB, 2)).toBe(unitAtGreek(index, b70, 0));
    expect(unitAtEnglish(index, b70, LAMB, 3)).toBe(row);
    expect(unitAtEnglish(index, b70, LAMB, 5)).toBe(row);
    // The second speech runs on into 70c, where the row's Greek is λ.
    expect(unitAtEnglish(index, c70, LAMB, 0).greek.map(s => s.text)).toEqual(['λ']);
  });

  it('gives an English-only residual to the nearest turn with Greek, never a unit of its own', () => {
    expect(index.units.some(u => u.turn === 3)).toBe(false);
    // 70c reads: twelve thirteen | Residual words here | Last.
    const residual = unitAtEnglish(index, c70, LAMB, 2);
    expect([residual.turn, residual.section]).toEqual([2, '70c']);
    expect(residual.english.rackham).toBe('twelve thirteen Residual words here');
    expect(unitAtEnglish(index, c70, LAMB, 5).greek.map(s => s.text)).toEqual(['μ']);
    for (const s of b.segments) {
      s.greek.flatMap(l => l.tokens).forEach((_, pos) => expect(unitAtGreek(index, s, pos).greek.length).toBeGreaterThan(0));
    }
  });

  it("places a turn-aligned translation's word in the section its words fall in", () => {
    // The index files both turns' Ross under 70a, where their Greek starts.
    expect(turnTranslationTexts(b, 'ross').get(a70.id)).toEqual(['Uno dos.', 'Cuatro cinco seis']);
    expect(unitAtEnglish(index, a70, JOWETT, 1)).toBe(unitAtGreek(index, a70, 0));   // dos
    expect(unitAtEnglish(index, a70, JOWETT, 3)).toBe(unitAtGreek(index, a70, 3));   // cinco
    const seis = unitAtEnglish(index, a70, JOWETT, 4);
    expect(seis).toBe(unitAtGreek(index, b70, 0));
    expect([seis.section, seis.english.ross]).toEqual(['70b', 'seis']);
  });

  it("cuts a segment's texts so each piece lies in one unit, the words unchanged", () => {
    const of = (s: Segment, t: typeof LAMB | typeof JOWETT) =>
      unitPieces(index, s, t)!.map(p => [p.text.trim(), `${p.unit.turn}:${p.unit.section}`]);
    expect(of(b70, LAMB)).toEqual([['six seven eight', '1:70b'], ['Nine ten.', '2:70b'], ['Eleven', '2:70b']]);
    // A turn-aligned text is cut where its sections begin.
    expect(of(a70, JOWETT)).toEqual([['Uno dos.', '0:70a'], ['Cuatro cinco', '1:70a'], ['seis', '1:70b']]);
    // A cut that would split a word is not made: the positions must still count.
    const split = book();
    split.turnFlow!.turns[1].alt!.ross.es = [{ o: 15, c: '70b' }];   // inside "seis"
    const ix = pairUnits(split, [LAMB, JOWETT]);
    expect(unitPieces(ix, split.segments[0], JOWETT)!.map(p => p.text)).toEqual(['Uno dos.', 'Cuatro cinco seis']);
    expect(unitAtEnglish(ix, split.segments[0], JOWETT, 4).section).toBe('70a');
  });

  it('leaves a section-cut overlay to the section: the index counted those pieces, not the turns', () => {
    const cut = book();
    cut.segments[0].overlays = { ross: [{ chapter: '1', cont: false, text: 'gamma delta' }] };
    const ix = pairUnits(cut, [LAMB, JOWETT]);
    expect(unitPieces(ix, cut.segments[0], JOWETT)).toBeUndefined();
    expect(unitAtEnglish(ix, cut.segments[0], JOWETT, 1).turn).toBe(-1);
    // The next section has none, and is still read off the turns.
    expect(unitPieces(ix, cut.segments[1], LAMB)).toHaveLength(3);
  });

  it('holds the reference join where the slices are the section, word for word', () => {
    for (const s of b.segments) expect(referenceJoinHolds(index, s, LAMB)).toBe(true);
  });

  it('falls back to the whole section where the slices do not join to its text', () => {
    const broken = book();
    broken.segments[1].english!.text += ' and a word no turn holds';
    const ix = pairUnits(broken, [LAMB, JOWETT]);
    const s = broken.segments[1];
    expect(referenceJoinHolds(ix, s, LAMB)).toBe(false);
    const unit = unitAtEnglish(ix, s, LAMB, 3);
    expect(unit.turn).toBe(-1);
    expect(unit.greek.map(g => g.text)).toEqual(['ζ η θ', 'ι κ']);
    expect(unit.english.rackham).toBe(s.english!.text);
    // The sections either side still join, and a Greek hit keeps its turn.
    expect(referenceJoinHolds(ix, broken.segments[0], LAMB)).toBe(true);
    expect(unitAtEnglish(ix, broken.segments[0], LAMB, 0).turn).toBe(0);
    expect(unitAtGreek(ix, s, 2).turn).toBe(2);
  });

  it('pairs a narrated work by its paragraph rows', () => {
    const para: BookData = {
      book: 1,
      segments: [
        seg('327a', 'I went down yesterday. Glaucon came', line(1, 'α β γ'), line(2, 'δ ε')),
        seg('327b', 'with me to pray.', line(1, 'ζ η')),
      ],
      turnFlow: {
        kind: 'para', leadE: null,
        turns: [
          turn({ g: { c: '327a', n: 1, o: 0 }, e: 'I went down yesterday.' }),
          turn({ g: { c: '327a', n: 2, o: 0 }, e: 'Glaucon came with me to pray.', es: [{ o: 13, c: '327b' }] }),
        ],
      },
    };
    const ix = pairUnits(para, [LAMB]);
    expect(unitAtGreek(ix, para.segments[0], 1).english.rackham).toBe('I went down yesterday.');
    expect(unitAtGreek(ix, para.segments[0], 4).english.rackham).toBe('Glaucon came');
    const pray = unitAtEnglish(ix, para.segments[1], LAMB, 3);
    expect(pray.greek.map(g => g.text)).toEqual(['ζ η']);
    expect(pray.english.rackham).toBe('with me to pray.');
  });

  it('pairs by section where a book has no turn flow', () => {
    const flat = { ...book(), turnFlow: undefined };
    const ix = pairUnits(flat, [LAMB]);
    expect(ix.units.map(u => [u.turn, u.section])).toEqual([[-1, '70a'], [-1, '70b'], [-1, '70c']]);
    const unit = unitAtGreek(ix, flat.segments[1], 4);
    expect(unit.english.rackham).toBe('six seven eight Nine ten. Eleven');
    expect(unitAtEnglish(ix, flat.segments[1], LAMB, 0)).toBe(unit);
  });

  it('lends a unit with Greek but no English its nearest neighbour in the section, when asked', () => {
    const spill = book();
    // The turn's English now ends as 70b opens, so its Greek there has none.
    spill.turnFlow!.turns[1].es = [{ o: 25, c: '70b' }];
    const ix = pairUnits(spill, [LAMB]);
    const bare = unitAtGreek(ix, spill.segments[1], 0);
    expect(unitEnglish(ix, bare, 'rackham')).toBe('');
    expect(unitEnglish(ix, bare, 'rackham', true)).toBe('Nine ten. Eleven');
    expect(unitEnglish(ix, bare, 'ross', true)).toBe('');
  });
});

describe('what a pair prints', () => {
  it('cuts the English at the word cap and drops footnote markers', () => {
    const long = Array.from({ length: PAIR_ENGLISH_WORDS + 1 }, (_, i) => `w${i}`).join(' ');
    const cut = pairEnglishText(long);
    expect(cut.split(' ')).toHaveLength(PAIR_ENGLISH_WORDS + 1);
    expect(cut.endsWith(`w${PAIR_ENGLISH_WORDS - 1} …`)).toBe(true);
    expect(pairEnglishText('Virtue[^1] is\n knowledge.')).toBe('Virtue is knowledge.');
  });

  it('cuts the Greek at the line cap', () => {
    const lines = Array.from({ length: PAIR_GREEK_LINES + 1 }, (_, i) => line(i + 1, `α${i} β`));
    const ix = pairUnits({ segments: [seg('17a', 'x', ...lines)] }, [LAMB]);
    expect(pairGreekText(ix.units[0])).toBe('α0 β α1 β α2 β …');
    const short = pairUnits({ segments: [seg('17a', 'x', lines[0])] }, [LAMB]);
    expect(pairGreekText(short.units[0])).toBe('α0 β');
  });
});

// The join check over real books. Off by default (the books are build output,
// not in the repo): PAIR_JOIN_DIST=<path to build/dist> npx vitest run paired-hit
describe.skipIf(!process.env.PAIR_JOIN_DIST)('the reference join, over every built book', () => {
  it('reports each work', () => {
    const dist = process.env.PAIR_JOIN_DIST!;
    const report: string[] = [];
    for (const work of WORKS) {
      const ref = searchableTranslations(work).find(t => t.slot === 'english');
      let files: string[] = [];
      try { files = readdirSync(join(dist, work.id)).filter(f => /^book-\d+\.json$/.test(f)).sort(); } catch { /* not built */ }
      if (!ref || !files.length) { report.push(`${work.id}: not checked`); continue; }
      let sections = 0;
      const fails: string[] = [];
      let flow = true;
      for (const f of files) {
        const data = JSON.parse(readFileSync(join(dist, work.id, f), 'utf8')) as BookData;
        flow &&= !!data.turnFlow?.turns.length;
        const ix = pairUnits(data, searchableTranslations(work));
        for (const s of data.segments) {
          sections++;
          if (!referenceJoinHolds(ix, s, ref)) fails.push(`${data.book}:${s.column}`);
        }
      }
      report.push(`${work.id}: ${sections - fails.length}/${sections} sections join`
        + (flow ? '' : ' (no turn flow in some book)')
        + (fails.length ? ` — whole-section fallback at ${fails.join(', ')}` : ''));
    }
    console.log(report.join('\n'));
    expect(report.length).toBe(WORKS.length);
  });
});


describe('paired context windows', () => {
  const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
  const section = seg('1a', text, ...Array.from({ length: 10 }, (_, i) => line(i + 1, 'α β γ')));
  section.english!.bekker = [{ n: 1, offset: 0, real: true }, { n: 9, offset: text.indexOf('word160 '), real: true }];
  const unit = pairUnits({ segments: [section] }, [LAMB]).units[0];
  it('centres on exact ticks and interpolates between them', () => {
    const window = pairEnglishWindow(section, LAMB, { ...unit, english: { rackham: text } }, 5, 10);
    expect(window).toBe('… '+Array.from({ length: 30 }, (_, i) => `word${i+70}`).join(' ')+' …');
    expect(pairEnglishWindow(section, LAMB, { ...unit, english: { rackham: text } }, 9, 10)).toContain('word160');
  });
  it('uses the supplied hit and caps long snippets at 80 whole words', () => {
    const window = pairEnglishWindow(section, LAMB, { ...unit, english: { rackham: text } }, 1, 100, text.indexOf('word100 '));
    expect(window).toBe('… '+Array.from({ length: 80 }, (_, i) => `word${i+60}`).join(' ')+' …');
  });
  it('uses one or three Greek lines around the estimated line', () => {
    expect(pairGreekWindow(section, unit, 5, '1').greek.map(l => l.n)).toEqual([5]);
    expect(pairGreekWindow(section, unit, 5, '3').greek.map(l => l.n)).toEqual([4,5,6]);
    expect(pairGreekWindow(section, unit, 5, 's')).toBe(unit);
  });
});
