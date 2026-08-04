/**
 * AUTHTAB.DIR — the author index every TLG/PHI disc carries at its root.
 *
 * This is what makes "import any author" possible without a table of authors
 * baked into the app: the disc says who is on it. Parsed here rather than in
 * Rust because it is a plain byte scan with no OS surface, so it stays
 * testable in vitest against the real discs.
 *
 * The format, verified byte-by-byte against a 1999 TLG disc (1,823 authors)
 * and a 1991 PHI disc (371):
 *
 *   - Records are terminated by 0xFF. Runs of 0xFF are separators too, so
 *     empty records are simply skipped.
 *   - The first record is a header ("TLG Greek Data Bank", "Latin Texts")
 *     and carries no author id, so it falls out naturally.
 *   - A record is `<ID> <display name>`, where ID is three letters and four
 *     digits (TLG0086, LAT0474) and names the disc file: TLG0086.TXT.
 *   - `&` toggles a typographic run and `&<digit>` selects a font; both are
 *     display directives, not part of the name.
 *   - 0x83 marks a language, and the byte AFTER it is the code — 'l' Latin,
 *     'g' Greek, 'h' Hebrew, 'c' Coptic. TLG omits it (the whole disc is
 *     Greek); PHI sets it per author, because that disc is mostly Latin but
 *     carries Greek, Hebrew and Coptic too.
 *
 * Anything that doesn't match the record shape is skipped rather than
 * refused: these discs are decades old, pressed by different people, and one
 * odd record must not cost the user the other 1,822.
 */

/** One author as the disc lists them. */
export interface DiscAuthor {
  /** Disc id, e.g. "TLG0086" — also the stem of its .TXT/.IDT files. */
  id: string;
  /** Display name, markup stripped, e.g. "Aristoteles Phil.". */
  name: string;
  /** Original language when the disc declares one per author (PHI does, TLG doesn't). */
  language?: OriginalLanguage;
}

export type OriginalLanguage = 'greek' | 'latin' | 'hebrew' | 'coptic';

const LANGUAGE_MARKER = 0x83;

const LANGUAGES: Record<string, OriginalLanguage> = {
  g: 'greek',
  l: 'latin',
  h: 'hebrew',
  c: 'coptic',
};

/** `<3 letters><4 digits> <name>` — the shape of an author record. */
const RECORD_RE = /^([A-Z]{3}\d{4})\s+(.*)$/;

const RECORD_TERMINATOR = 0xff;

/**
 * Parse a whole AUTHTAB.DIR. Returns the authors in disc order (which is
 * alphabetical by name on both discs, so callers can present it as-is).
 */
export function parseAuthtab(bytes: Uint8Array): DiscAuthor[] {
  const out: DiscAuthor[] = [];
  for (const record of splitRecords(bytes)) {
    const parsed = parseRecord(record);
    if (parsed) out.push(parsed);
  }
  return out;
}

function splitRecords(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== RECORD_TERMINATOR) continue;
    if (i > start) out.push(bytes.subarray(start, i));
    start = i + 1;
  }
  if (start < bytes.length) out.push(bytes.subarray(start));
  return out;
}

function parseRecord(record: Uint8Array): DiscAuthor | null {
  let language: OriginalLanguage | undefined;
  const printable: number[] = [];
  for (let i = 0; i < record.length; i++) {
    const b = record[i];
    if (b === LANGUAGE_MARKER) {
      // The code byte belongs to the marker, not to the name.
      const code = record[i + 1];
      if (code !== undefined) {
        language = LANGUAGES[String.fromCharCode(code)];
        i++;
      }
      continue;
    }
    // Everything outside printable ASCII is a control or format byte.
    if (b >= 0x20 && b < 0x7f) printable.push(b);
  }

  const text = String.fromCharCode(...printable).trim();
  const m = RECORD_RE.exec(text);
  if (!m) return null;

  const name = stripMarkup(m[2]);
  if (name.length === 0) return null;

  return { id: m[1], name, ...(language ? { language } : {}) };
}

/** Drop the `&`/`&<digit>` typographic directives and collapse the gaps they leave. */
function stripMarkup(raw: string): string {
  return raw.replace(/&\d*/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Which corpus a disc is, from its author ids — this is the `-c` argument
 * Diogenes' exporter takes. TLG ids start "TLG"; the PHI Latin disc uses
 * LAT (plus a handful of CIV/COP/etc. oddments), so anything that isn't TLG
 * is the PHI side.
 */
export function corpusForAuthorId(id: string): 'tlg' | 'phi' {
  return id.startsWith('TLG') ? 'tlg' : 'phi';
}

/**
 * The four-digit author number Diogenes wants for `-n` ("0086" from
 * "TLG0086"). Returns null for an id that isn't in the disc's shape.
 */
export function authorNumber(id: string): string | null {
  const m = /^[A-Z]{3}(\d{4})$/.exec(id);
  return m ? m[1] : null;
}

/** Case-insensitive substring match over the author name and id, so the
 * picker can filter 1,800 authors as the user types. */
export function filterAuthors(authors: DiscAuthor[], query: string): DiscAuthor[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return authors;
  return authors.filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q));
}
