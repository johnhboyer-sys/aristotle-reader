/**
 * The allowlist a dictionary entry's HTML passes before the drawer renders it
 * with `{@html}`. A pack is a file the user picked, and "the user picked it"
 * is not evidence we built it, so its HTML is treated as hostile.
 *
 * The allowlist is what the pipeline's TEI → HTML conversion can emit
 * (classical-philosophy-reader's stage5_lsj.py, `_to_html`), for LSJ and Lewis
 * & Short alike: `div`, `span`, `b`, `i`, a `class`, and a numeric
 * `data-level` on a sense. No entry carries a link, an image or a style, so
 * none is allowed; there is no URL anywhere for a `javascript:` to ride in.
 * The tests check every entry of a real pack comes through unchanged.
 *
 * It works by rebuilding, not by deleting: every tag in the output is one this
 * function wrote from a name and attributes it accepted, and everything else
 * is escaped as text. Markup it does not accept is dropped, its text kept.
 * No DOM is involved, so nothing is parsed or fetched along the way.
 */

const ALLOWED_TAGS = new Set(['div', 'span', 'b', 'i']);
// Comments, doctypes and processing instructions, then tags; each may run to
// the end of the input unterminated, and is dropped whole either way.
const MARKUP = /<!--[\s\S]*?(?:-->|$)|<[!?][^>]*(?:>|$)|<\/?[A-Za-z][^>]*(?:>|$)/g;
const TAG = /^<(\/?)([A-Za-z][A-Za-z0-9]*)([^>]*)>?$/;
const ATTR = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*"([^"]*)"/g;
const CLASS_VALUE = /^[A-Za-z0-9_ -]*$/;
const LEVEL_VALUE = /^\d{1,2}$/;

/** Text as text: a bare `&`, `<` or `>` escaped; character references kept. */
function escapeText(text: string): string {
  return text
    .replace(/&(?![A-Za-z][A-Za-z0-9]*;|#\d+;|#x[0-9A-Fa-f]+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function openTag(name: string, attrs: string): string {
  let cls: string | null = null;
  let level: string | null = null;
  for (const [, attr, value] of attrs.matchAll(ATTR)) {
    const a = attr.toLowerCase();
    if (a === 'class' && CLASS_VALUE.test(value)) cls = value;
    else if (a === 'data-level' && LEVEL_VALUE.test(value)) level = value;
  }
  return `<${name}${cls !== null ? ` class="${cls}"` : ''}${level !== null ? ` data-level="${level}"` : ''}>`;
}

export function sanitizeEntryHtml(html: string): string {
  const out: string[] = [];
  const open: string[] = [];
  let last = 0;
  for (const m of html.matchAll(MARKUP)) {
    out.push(escapeText(html.slice(last, m.index)));
    last = m.index + m[0].length;
    const tag = TAG.exec(m[0]);
    if (!tag) continue;
    const name = tag[2].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) continue;
    if (tag[1]) {
      // Only the innermost open tag may close; a stray closer is dropped.
      if (open[open.length - 1] === name) out.push(`</${open.pop()}>`);
    } else {
      out.push(openTag(name, tag[3]));
      open.push(name);
    }
  }
  out.push(escapeText(html.slice(last)));
  while (open.length > 0) out.push(`</${open.pop()}>`);
  return out.join('');
}
