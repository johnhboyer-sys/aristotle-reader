import type { BookData, OverlayPiece } from './data';
import type { Work } from './works';

export interface ResumePassage { greek: string; english: string | null; chapter: string | null; }
const greekStop = /[.··;]/g;
const englishStop = /[.?!](?=\s|$)/g;

// Work with raw offsets first: removing note marks before slicing would move them.
function sentence(text: string, offset: number, atStart: boolean, greek: boolean): string {
  const stop = greek ? greekStop : englishStop;
  const starts = [0];
  for (const m of text.matchAll(stop)) {
    let next = m.index! + 1;
    while (/\s/.test(text[next] || '') && next < text.length) next++;
    starts.push(next);
  }
  const start = atStart ? offset : starts.find(n => n >= offset);
  if (start === undefined) return '';
  const tail = text.slice(start).trimStart();
  const end = [...tail.matchAll(stop)][0];
  let result = tail.slice(0, end ? end.index! + 1 : undefined)
    .replace(/\[\^[^\]]*\]|\[\[(?:s|fig)\d+\]\]/g, '').replace(/\s+/g, ' ').trim();
  if (result.length > 220) {
    const cut = result.slice(0, 220).search(/\s+\S*$/);
    result = result.slice(0, cut > 0 ? cut : 219).trimEnd() + '…';
  }
  return result;
}
function lineOffset(text: string, ticks: { n: number; offset: number }[] | undefined, line: number, lastLine: number): number {
  const marks = [...(ticks || [])].sort((a,b) => a.n-b.n);
  if (!marks.length) return 0;
  const low = [...marks].reverse().find(t => t.n <= line) || marks[0];
  const high = marks.find(t => t.n > line) || { n: Math.max(lastLine + 1, low.n + 1), offset: text.length };
  return Math.max(0, Math.ceil(low.offset + Math.max(0, line - low.n) / (high.n - low.n) * (high.offset - low.offset)));
}

/** The same segment slots as the reader, without fetching or touching storage. */
export function resumePassage(data: BookData | null | undefined, work: Pick<Work, 'translations' | 'defaultTranslation'>, cite: string | null): ResumePassage | null {
  try {
    const ref = cite?.match(/^(\d+[ab])(\d+)([a-z])?$/);
    if (!ref || !Array.isArray(data?.segments)) return null;
    const index = data.segments.findIndex(s => s.column === ref[1]);
    const seg = data.segments[index];
    if (!seg || !Array.isArray(seg.greek)) return null;
    const line = Number(ref[2]);
    const li = seg.greek.findIndex(l => l.n === line && (l.sub ?? '') === (ref[3] ?? ''));
    if (li < 0) return null;
    const chapter = seg.chapterStarts?.find(c => c.beforeLine === line);
    // Include earlier text to distinguish a line that starts a sentence from
    // one that continues it. Include later columns for sentences crossing them.
    const lines = data.segments.flatMap(s => s.greek);
    const savedLine = data.segments.slice(0,index).reduce((n,s) => n + s.greek.length, 0) + li;
    const offset = lines.slice(0, savedLine).reduce((n,l) => n + l.text.length + 1, 0);
    const word = chapter ? seg.greek[li].tokens?.[chapter.wordIndex]?.o ?? [...seg.greek[li].text.matchAll(/\S+/g)][chapter.wordIndex]?.index ?? 0 : 0;
    const greek = sentence(lines.map(l => l.text).join(' '), offset + word, !!chapter, true);
    if (!greek) return null;
    const translation = work.translations.find(t => t.id === work.defaultTranslation)
      ?? work.translations.find(t => t.slot === 'english');
    let english: string | null = null;
    if (translation && !translation.private) {
      let text = '', start = 0;
      if (translation.slot === 'english' && seg.english) {
        text = seg.english.text;
        start = chapter?.engOffset ?? lineOffset(text, seg.english.bekker, line, seg.greek.at(-1)?.n || line);
        const before = data.segments.slice(0,index).map(s => s.english?.text || '').join(' ');
        if (before) { start += before.length + 1; text = before + ' ' + text; }
        text += ' ' + data.segments.slice(index + 1).map(s => s.english?.text || '').join(' ');
      } else {
        const piecesOf = (s: typeof seg): OverlayPiece[] => translation.slot === 'secondary' ? s.secondary ?? s.ross ?? []
          : translation.slot === 'third' ? s.third ?? [] : s.overlays?.[translation.id] ?? [];
        const pieces = piecesOf(seg);
        const piece = chapter ? pieces.find(p => p.chapter === chapter.chapter && !p.cont)
          : [...pieces].reverse().find(p => (p.bekker?.[0]?.n ?? 1) <= line);
        if (piece) {
          text = piece.text;
          start = chapter ? 0 : lineOffset(text, piece.bekker, line, seg.greek.at(-1)?.n || line);
          const before = data.segments.slice(0,index).flatMap(piecesOf).filter(p => p.chapter === piece.chapter).map(p => p.text).join(' ');
          if (before) { start += before.length + 1; text = before + ' ' + text; }
          text += ' ' + data.segments.slice(index + 1).flatMap(piecesOf).filter(p => p.chapter === piece.chapter).map(p => p.text).join(' ');
        }
      }
      english = sentence(text, start, !!chapter, false) || null;
    }
    return { greek, english, chapter: chapter?.chapter ?? null };
  } catch { return null; }
}
