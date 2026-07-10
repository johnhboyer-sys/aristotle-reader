// Single source of truth for the Nicomachean Ethics glossary — Ostwald's
// "Glossary of Technical Terms". Parses the Markdown in ../glossary/EN.md into
// anchored entries, used by:
//   - the standalone glossary page (pages/EN/glossary.astro), which gives every
//     entry an `id` so it has its own URL (e.g. /EN/glossary#hexis), and
//   - the footnote renderer (lib/data.ts), which turns Ostwald's "see Glossary,
//     <term>" cross-references into links to those entries.
// Both sides slug terms through the same `fold`, so anchors and links can't drift.
import rawMd from '../glossary/EN.md?raw';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export interface GlossaryEntry {
  slug: string;     // URL fragment + element id, e.g. 'hexis'
  terms: string[];  // headword term(s), e.g. ['akōn', 'akousion']
  html: string;     // rendered entry HTML (emphasis + small-caps spans)
}

// Fold a Greek transliteration to an ASCII slug: drop diacritics (macrons,
// breves), lowercase, strip anything that isn't a letter/digit. Ostwald cites
// some terms with macrons (*technē*) and some without (*techne*); folding both
// makes the cross-reference match macron-insensitive.
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// The glossary uses single-asterisk emphasis only (no bold); small-caps are
// already inline <span> HTML and pass straight through.
function emph(s: string): string {
  return s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function parse() {
  const entries: GlossaryEntry[] = [];
  let title = 'Glossary of Technical Terms';
  let note = '';
  for (const raw of rawMd.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('# ')) {
      title = line.replace(/^#\s+/, '').replace(/\s*\[\^\d+\]\s*$/, '');
      continue;
    }
    if (line.startsWith('## ')) continue; // "## Footnotes"
    const fn = line.match(/^\[\^\d+\]:\s*(.*)$/);
    if (fn) { note = emph(fn[1]); continue; }
    if (line.startsWith('*')) {
      const head = line.match(/^\*([^*]+)\*/);
      if (!head) continue;
      const terms = head[1].split(',').map((s) => s.trim()).filter(Boolean);
      entries.push({ slug: fold(terms[0]), terms, html: emph(line) });
    }
  }
  return { title, note, entries };
}

const PARSED = parse();
export const GLOSSARY_TITLE = PARSED.title;
export const GLOSSARY_NOTE = PARSED.note;
export const GLOSSARY_ENTRIES = PARSED.entries;

// foldedTerm -> entry slug, covering every headword term so a cross-reference to
// the second term of a two-term entry (e.g. *akousion* → akōn, akousion) resolves.
const ALIAS = new Map<string, string>();
for (const e of GLOSSARY_ENTRIES) for (const term of e.terms) ALIAS.set(fold(term), e.slug);

export function glossarySlug(term: string): string | null {
  return ALIAS.get(fold(term)) ?? null;
}

export const glossaryHref = (slug: string) => `${BASE}/EN/glossary#${slug}`;

// Turn Ostwald's glossary cross-references in a footnote into links. Only act on
// footnotes that mention "Glossary"; within those, link each individual word
// that is a glossary headword — every occurrence, and even inside a grouped
// emphasis such as *hexis, diathesis* (only *hexis* links). Work titles and
// Greek words with no entry (e.g. *Politics*, *diathesis*) are left as-is.
const WORD = /\p{L}[\p{L}\p{M}'’-]*/gu;
export function linkifyGlossaryRefs(html: string): string {
  if (!/glossary/i.test(html)) return html;
  return html.replace(/<em>([^<]+)<\/em>/g, (_m, inner: string) => {
    const linked = inner.replace(WORD, (w) => {
      const slug = glossarySlug(w);
      return slug ? `<a class="gloss-ref" href="${glossaryHref(slug)}">${w}</a>` : w;
    });
    return `<em>${linked}</em>`;
  });
}
