// Endnote emission (config `endnotes: { source: 'witness-commentary' }`).
//
// Peripatetic Press prints ENDNOTES: body superscripts whose bodies live in a
// back-matter COMMENTARIES section that stage 1 slices off. The frozen
// converter, however, understands page-bottom footnote blocks (§6 of
// ocr-target-format.md) and pairs them to glued body markers first-to-first
// by printed number, inferring per-chapter scope from the restarts. So this
// pass does the one thing the converter can't: for each page, it finds the
// glued digit markers, looks their bodies up in the parsed witness commentary
// (witness-commentary.ts), and appends a note block in exactly the input
// format the converter already reads — zero converter changes.
//
// Conservative by construction: only markers with a matching commentary note
// for their (chapter, number) emit a note; everything else surfaces as a
// tier-2 flag (a body marker with no note, a chapter whose notes outnumber
// its markers). Preambles (note 0) have no marker and are never emitted.
import type { CorpusConfig } from './corpus-config';
import { makeChangeId, type ChangeRecord } from './changelist';
import { isEnumParenMatch, MARKER_RE } from '../pdf-import/footnotes';
import type { WitnessCommentary } from './witness-commentary';

export interface EndnoteEmission {
  text: string;
  changes: ChangeRecord[];
  /** notes emitted across all pages */
  notesEmitted: number;
  /** distinct body markers that found no commentary note */
  markersUnmatched: number;
}

const BOOK_WORDS: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10,
};

// Wrap a note body into layout lines at the body margin. Internal whitespace
// collapses to single spaces first — a ≥4-space run inside a note line would
// read as a preserved display block (ocr-target-format §4).
function wrapNote(n: number, body: string, margin: number, width: number): string[] {
  const words = body.replace(/\s+/gu, ' ').trim().split(' ');
  const indent = ' '.repeat(margin);
  const lines: string[] = [];
  let line = `${indent}${n}. `;
  let empty = true;
  for (const word of words) {
    if (!empty && line.length + 1 + word.length > width) {
      lines.push(line);
      line = indent;
      empty = true;
    }
    line += (empty ? '' : ' ') + word;
    empty = false;
  }
  if (!empty) lines.push(line);
  return lines;
}

// Light typography cleanup for note bodies coming from the genie witness:
// TeX overlines (Apostle's negated-term notation) become combining macrons,
// sup markers inside note text become plain digits, stray TeX dollar residue
// drops. Emphasis asterisks pass through — the reader renders them.
export function cleanNoteBody(raw: string): string {
  return raw
    .replace(/\$\\overline\{\\text\{([^}]*)\}\}\$/gu, (_, s: string) => [...s].map((c) => `${c}̄`).join(''))
    .replace(/<sup>\s*(\d+)\s*<\/sup>/giu, '$1')
    .replace(/\$\s*\^\{?(\d+)\}?\s*\$/gu, '$1')
    .replace(/\$([^$]*)\$/gu, '$1')
    .replace(/\\([.()[\]])/gu, '$1')
    .replace(/&nbsp;/gu, ' ');
}

export function emitEndnoteBlocks(
  text: string,
  commentary: WitnessCommentary,
  config: CorpusConfig
): EndnoteEmission {
  void config;
  const counts = new Map<string, number>();
  const nextId = (page: number, line?: number, col?: number): string => {
    const key = `${page}:${line ?? ''}:${col ?? ''}`;
    const seq = (counts.get(key) ?? 0) + 1;
    counts.set(key, seq);
    return makeChangeId(page, line, col, seq);
  };
  const changes: ChangeRecord[] = [];
  let notesEmitted = 0;
  let markersUnmatched = 0;
  let book = 0;
  let chapter = 0;
  const seen = new Set<string>(); // `${book}:${chapter}:${n}` markers already emitted anywhere

  const pages = text.split('\f').map((page) => page.split('\n'));
  for (let p = 0; p < pages.length; p += 1) {
    const lines = pages[p];
    // Markers grouped per chapter in first-seen order. The block later emits
    // every commentary note in each chapter's [min..max] marker RANGE, not
    // just the markers found: parseNoteBlock treats a non-sequential note
    // number as a continuation of the open note, so ONE garbled marker's gap
    // would chain every following note into the previous note's body.
    const chapterGroups: { book: number; chapter: number; ns: Set<number> }[] = [];
    const head = lines.findIndex((l) => l.trim() !== '');
    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i];
      const bare = raw.trim();
      if (bare === '' || i === head) continue;
      const bookMatch = /^BOOK\s+(\S+)$/u.exec(bare);
      if (bookMatch) {
        book = BOOK_WORDS[bookMatch[1].toUpperCase()] ?? book;
        chapter = 0;
        continue;
      }
      const chapterMatch = /^CHAPTER\s+(\d+)$/u.exec(bare);
      if (chapterMatch) {
        chapter = Number(chapterMatch[1]);
        continue;
      }
      if (book === 0 || chapter === 0) continue;
      // Blank a leading gutter tick so its digits can't read as a marker.
      const body = raw.replace(/^(\s*)(\d{1,4}[ab]?\d{0,2})(?=\s)/u, (m, ws: string, tick: string) => ws + ' '.repeat(tick.length));
      for (const m of body.matchAll(MARKER_RE)) {
        if (!/^\d+$/u.test(m[1])) continue; // star/dagger markers are not endnotes
        if (isEnumParenMatch(body, m.index, m[1])) continue; // "(1)" prose enums
        const n = Number(m[1]);
        const key = `${book}:${chapter}:${n}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const note = commentary.notes.get(`${book}:${chapter}`)?.get(n);
        if (note === undefined) {
          markersUnmatched += 1;
          changes.push({
            id: nextId(p, i, m.index),
            stage: 6,
            tier: 2,
            rule: 'flag',
            page: p,
            line: i,
            col: m.index,
            evidence: { kind: 'endnote-missing-note', book, chapter, marker: n },
          });
          continue;
        }
        let group = chapterGroups.at(-1);
        if (!group || group.book !== book || group.chapter !== chapter) {
          group = { book, chapter, ns: new Set() };
          chapterGroups.push(group);
        }
        group.ns.add(n);
      }
    }
    const pageNotes: { n: number; body: string }[] = [];
    // Gaps only fill between CONSECUTIVE found markers, and only short ones —
    // trusting the blanket [min..max] range would let one garbled-but-valid
    // marker ("999") drag a whole chapter's future notes onto this page AND
    // poison `seen` so their real pages get nothing (review finding).
    const MAX_GAP_FILL = 3;
    for (const group of chapterGroups) {
      const perChapter = commentary.notes.get(`${group.book}:${group.chapter}`);
      if (!perChapter) continue;
      const found = [...group.ns].sort((a, b) => a - b);
      const emit = (n: number, filled: boolean) => {
        const note = perChapter.get(n);
        if (note === undefined) return; // note 0 preambles never fill either
        if (filled) {
          const key = `${group.book}:${group.chapter}:${n}`;
          if (seen.has(key)) return;
          seen.add(key);
          changes.push({
            id: nextId(p, undefined, undefined),
            stage: 6,
            tier: 2,
            rule: 'flag',
            page: p,
            evidence: { kind: 'endnote-gap-filled', book: group.book, chapter: group.chapter, marker: n },
          });
        }
        pageNotes.push({ n, body: cleanNoteBody(note) });
      };
      for (let i = 0; i < found.length; i += 1) {
        emit(found[i], false);
        const next = found[i + 1];
        if (next !== undefined && next - found[i] - 1 > 0 && next - found[i] - 1 <= MAX_GAP_FILL) {
          for (let n = found[i] + 1; n < next; n += 1) emit(n, true);
        }
      }
    }
    if (pageNotes.length === 0) continue;
    // Body left margin: modal indent of this page's non-blank body lines.
    const indents = lines
      .filter((l, i) => l.trim() !== '' && i !== head)
      .map((l) => l.length - l.trimStart().length)
      .filter((n) => n > 0);
    const margin = indents.length ? indents.sort((a, b) => a - b)[Math.floor(indents.length / 2)] : 11;
    const width = Math.max(...lines.map((l) => l.trimEnd().length), 80);
    // Drop trailing blank lines, then a single blank line separates the last
    // body line from the block (§6).
    let end = lines.length;
    while (end > 0 && lines[end - 1].trim() === '') end -= 1;
    // The explicit `<<notes>>` divider makes the block bounds ground truth —
    // commentary-length notes occupy most of a page and would fail the
    // converter's 60%-extent heuristic (70/74 Apostle pages, measured).
    // Endnote numbering restarts per chapter in this house style; declaring
    // it spares the converter's scope inference from reconstruction
    // artifacts (marker-less gap-filled notes score as phantom crossings).
    const block: string[] = ['', '<<notes scope=per-chapter render=endnote>>'];
    for (const note of pageNotes) {
      block.push(...wrapNote(note.n, note.body, margin, width));
      notesEmitted += 1;
    }
    pages[p] = [...lines.slice(0, end), ...block];
    changes.push({
      id: nextId(p),
      stage: 6,
      tier: 1,
      rule: 'endnote-block',
      page: p,
      evidence: { kind: 'endnote-block', notes: pageNotes.length },
    });
  }

  return { text: pages.map((page) => page.join('\n')).join('\f'), changes, notesEmitted, markersUnmatched };
}
