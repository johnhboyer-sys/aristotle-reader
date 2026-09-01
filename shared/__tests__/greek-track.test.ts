import { measureGreekTrack } from '../lib/greek-track';

// jsdom/happy-dom report 0 for every rect, so the widths are mocked. That is
// the point of measuring through a function rather than a mounted reader:
// what needs locking down is WHEN the measurement is taken, not the browser's
// own layout arithmetic.
function reader(lineWidths: number[]): HTMLElement {
  const body = document.createElement('div');
  body.className = 'reader-body';
  for (const w of lineWidths) {
    const line = document.createElement('div');
    line.className = 'greek-line';
    line.getBoundingClientRect = () => ({ width: w, height: 20 }) as DOMRect;
    body.appendChild(line);
  }
  document.body.appendChild(body);
  return body;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('measureGreekTrack', () => {
  it('takes the widest line, rounded up', () => {
    expect(measureGreekTrack(reader([400, 566.2, 512]))).toBe(567);
  });

  it('measures again once the lines arrive', () => {
    // The defect this locks: the desktop app mounts with no book data, so the
    // first pass has no .reader-body at all and measures nothing. The track
    // was previously treated as taken anyway, so the real segments were never
    // measured and every block fell back to its own width — the bug the whole
    // mechanism exists to remove, still present on a cold load.
    expect(measureGreekTrack(null)).toBe(0);
    expect(measureGreekTrack(reader([432, 567]))).toBe(567);
  });

  it('reports nothing measurable rather than a width of zero', () => {
    // A rendered body with no Greek lines is view-english, where the column is
    // display:none. 0 must mean "ask again", never "the column is 0 wide" — a
    // consumer that took it as a width would collapse the grid track.
    expect(measureGreekTrack(reader([]))).toBe(0);
    // Lines that are present but hidden measure 0 too, and mean the same.
    expect(measureGreekTrack(reader([0, 0]))).toBe(0);
  });

  it('leaves no measuring class behind, even when a rect throws', () => {
    // The class pins the column to max-content and sets every line nowrap. If
    // it leaked, the reader would be visibly stuck in the measuring state.
    const body = reader([300]);
    const line = body.querySelector<HTMLElement>('.greek-line')!;
    line.getBoundingClientRect = () => { throw new Error('layout blew up'); };
    expect(() => measureGreekTrack(body)).toThrow('layout blew up');
    expect(body.classList.contains('measuring-greek')).toBe(false);
  });

  it('has the class applied while it measures, and not after', () => {
    const seen: boolean[] = [];
    const body = document.createElement('div');
    body.className = 'reader-body';
    const line = document.createElement('div');
    line.className = 'greek-line';
    line.getBoundingClientRect = () => {
      seen.push(body.classList.contains('measuring-greek'));
      return ({ width: 500, height: 20 }) as DOMRect;
    };
    body.appendChild(line);
    document.body.appendChild(body);

    measureGreekTrack(body);
    expect(seen).toEqual([true]);
    expect(body.classList.contains('measuring-greek')).toBe(false);
  });
});
