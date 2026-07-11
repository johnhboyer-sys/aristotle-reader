// Parse the witness's COMMENTARIES section (endnote bodies) into per-chapter,
// per-number note texts. Peripatetic Press prints endnotes as back-matter
// commentary — body superscripts are the markers, and this section holds the
// bodies the reader's endnote sidebar will show.
//
// Structure (verified on the real Apostle APo witness):
//   ## COMMENTARIES ON THE *POSTERIOR ANALYTICS*
//   <intro paragraphs — skipped (no book open)>
//   BOOK A                      (plain or #-prefixed, Greek-letter ordinal)
//   1                           (chapter numeral, bare or #-prefixed,
//                                sequence-windowed like the translation walk)
//   1. <note body ...>          (genie emits one paragraph per line; rare
//   2. <note body ...>           continuation lines append to the open note)
//   ---                         (page furniture, interleaved anywhere:
//   75 *Commentaries, Book A*    separators, bare page numbers, running
//   _Commentaries, Book A_       heads in several glyph dressings)
import { GREEK_LETTER_ORDINALS } from './skeleton';
import type { WitnessSectionSpan } from './witness-structure';

export interface WitnessCommentaryDiagnostic {
  tier: 2;
  /** Line offset WITHIN the commentary span. */
  line: number;
  kind:
    | 'commentary-chapter-conflict'
    | 'commentary-note-conflict'
    | 'commentary-orphan-text'
    | 'commentary-seat-failed'
    | 'commentary-note-1-inferred';
  expected?: number;
  got?: number;
  token?: string;
  reason?: string;
}

/** A commentary chapter whose heading the witness OCR lost — its notes
 * restart at "1." mid-stream and the monotonic filter would glom them onto
 * the previous chapter's tail note. The anchor marks the chapter's FIRST
 * note line (`SEAT-commentary-chapter <book>.<n> => <anchor>`). */
export interface CommentaryChapterSeat {
  book: number;
  chapter: number;
  anchor: string;
}

export interface WitnessCommentary {
  /** notes.get('2:3')?.get(5) = the body text of Book II ch. 3 note 5.
   * Note 0, when present, is an UNNUMBERED chapter preamble (Apostle opens
   * some chapters' commentary with an untagged paragraph) — it has no body
   * marker, so the endnote emission pass skips it. */
  notes: Map<`${number}:${number}`, Map<number, string>>;
  diagnostics: WitnessCommentaryDiagnostic[];
}

const CHAPTER_WINDOW = 3;
// Narrow: a wrong number accepted here HIJACKS the walk (the genuine
// intervening notes then read as continuations of the wrong body). One
// OCR-dropped number (+2) is the only skip the real corpus shows.
const NOTE_WINDOW = 2;

function plain(raw: string): string {
  return raw
    .replace(/<[^>]+>/gu, '')
    .replace(/[*_~`#]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

// Page furniture the scan interleaves anywhere: separators, running heads
// (with or without a leading folio number), bare folio numbers. A bare
// numeral is only a folio when it fails the chapter-sequence window, so
// that check lives in the walk, not here.
function isFurniture(line: string): boolean {
  const text = plain(line);
  if (text === '' || text === '---') return true;
  return /^(?:\d{1,4}\s+)?Commentaries, Book [A-Z]$/u.test(text);
}

export function parseWitnessCommentary(span: WitnessSectionSpan, seats?: CommentaryChapterSeat[]): WitnessCommentary {
  const lines = span.text.split(/\n/u);
  const notes: WitnessCommentary['notes'] = new Map();
  const diagnostics: WitnessCommentaryDiagnostic[] = [];

  // Pre-locate each seat's anchor line (unique, or the seat is refused).
  const seatAt = new Map<number, CommentaryChapterSeat>();
  for (const seat of seats ?? []) {
    const hits: number[] = [];
    for (let i = 0; i < lines.length; i += 1) if (lines[i].includes(seat.anchor)) hits.push(i);
    if (hits.length !== 1) {
      diagnostics.push({ tier: 2, line: hits[1] ?? 0, kind: 'commentary-seat-failed', token: seat.anchor, reason: hits.length === 0 ? 'anchor-unmatched' : 'anchor-ambiguous' });
      continue;
    }
    seatAt.set(hits[0], seat);
  }

  let book = 0;
  let chapter = 0;
  let lastNote = 0;
  let openKey: `${number}:${number}` | null = null;
  let openNote = 0;
  // Unnumbered text between a chapter heading and its first numbered note:
  // if the first note arrives as "2.", the buffer is note 1 with an eaten
  // numeral; if it arrives as "1.", the buffer is a chapter preamble
  // (stored as note 0). Both are real Apostle cases (I.22 / II.7).
  let pendingOrphans: { line: number; text: string }[] = [];
  const flushOrphans = (firstNote: number | null) => {
    if (pendingOrphans.length === 0 || chapter === 0) { pendingOrphans = []; return; }
    const key: `${number}:${number}` = `${book}:${chapter}`;
    const body = pendingOrphans.map((o) => o.text).join('\n');
    const perChapter = notes.get(key) ?? new Map<number, string>();
    if (firstNote === 2 && !perChapter.has(1)) {
      perChapter.set(1, body);
      diagnostics.push({ tier: 2, line: pendingOrphans[0].line, kind: 'commentary-note-1-inferred', token: body.slice(0, 60) });
    } else if (firstNote !== null) {
      perChapter.set(0, body);
    } else {
      for (const o of pendingOrphans) diagnostics.push({ tier: 2, line: o.line, kind: 'commentary-orphan-text', token: o.text.slice(0, 60) });
    }
    notes.set(key, perChapter);
    pendingOrphans = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    // A seat forces the chapter transition the lost heading would have made;
    // the anchor line itself is the chapter's first note, so processing
    // falls through to the note walk below.
    const seat = seatAt.get(i);
    if (seat) {
      if (seat.book !== book || seat.chapter <= chapter) {
        diagnostics.push({ tier: 2, line: i, kind: 'commentary-seat-failed', token: seat.anchor, reason: `seat-out-of-order-at-${book}:${chapter}` });
      } else {
        flushOrphans(null);
        chapter = seat.chapter;
        lastNote = 0;
        openKey = null;
      }
    }
    if (isFurniture(raw)) continue;
    const text = plain(raw);

    const bookMatch = /^BOOK\s+(\S+)$/iu.exec(text);
    if (bookMatch) {
      const value = GREEK_LETTER_ORDINALS[bookMatch[1].toUpperCase()];
      if (value === book + 1) {
        flushOrphans(null);
        book = value;
        chapter = 0;
        lastNote = 0;
        openKey = null;
      } else {
        diagnostics.push({ tier: 2, line: i, kind: 'commentary-chapter-conflict', expected: book + 1, got: value, token: text });
      }
      continue;
    }

    // Chapter numeral — bare digits (markup/hashes already stripped by
    // plain()). Out-of-window numerals are folio numbers, silently skipped.
    if (book > 0 && /^\d{1,3}$/u.test(text)) {
      const value = Number(text);
      if (value > chapter && value <= chapter + CHAPTER_WINDOW) {
        if (value !== chapter + 1) {
          diagnostics.push({ tier: 2, line: i, kind: 'commentary-chapter-conflict', expected: chapter + 1, got: value, token: text });
        }
        flushOrphans(null);
        chapter = value;
        lastNote = 0;
        openKey = null;
      }
      continue;
    }

    if (book === 0 || chapter === 0) continue; // section intro

    // Genie escapes the ordinal dot on most pages ("1\. Perhaps …").
    const noteMatch = /^(\d{1,3})\\?\.\s+(.*)$/u.exec(raw.trim());
    if (noteMatch) {
      const n = Number(noteMatch[1]);
      // Monotonic with a small window: tolerates an OCR-dropped note number,
      // rejects enumerations restarting inside a note body.
      if (n > lastNote && n <= lastNote + NOTE_WINDOW) {
        if (n !== lastNote + 1) {
          diagnostics.push({ tier: 2, line: i, kind: 'commentary-note-conflict', expected: lastNote + 1, got: n });
        }
        if (lastNote === 0) flushOrphans(n);
        const key: `${number}:${number}` = `${book}:${chapter}`;
        const perChapter = notes.get(key) ?? new Map<number, string>();
        perChapter.set(n, noteMatch[2].trim());
        notes.set(key, perChapter);
        lastNote = n;
        openKey = key;
        openNote = n;
        continue;
      }
      // fall through: an out-of-window "N." line is note-body continuation
      // (e.g. a quoted enumeration) if a note is open
    }

    if (openKey !== null) {
      const perChapter = notes.get(openKey)!;
      perChapter.set(openNote, `${perChapter.get(openNote)}\n${raw.trim()}`);
    } else {
      pendingOrphans.push({ line: i, text: raw.trim() });
    }
  }
  flushOrphans(null);

  return { notes, diagnostics };
}
