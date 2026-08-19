// HTML sanitizer for corpus-sourced markup rendered via {@html}/set:html.
//
// The reader injects pre-rendered HTML from the corpus in several places — LSJ
// dictionary entries, built-in footnotes, endnotes. That HTML comes from the
// build pipeline, not from user input, so this is a supply-chain/defense-in-
// depth boundary rather than a live XSS sink: it guarantees that even a stray
// tag or a compromised data file can only ever emit an allowlisted subset of
// inline markup, never script, event handlers, or javascript: URLs.
//
// Lives in shared/ so both the Astro site and the shared reader components
// (WordPopup, FootnotePopup, EndnoteSidebar) apply the SAME rules. app/src/lib/
// html.ts re-exports this so existing app imports keep working.

// Ostwald prints two diagrams inside his notes (the equal-lines construction at
// 1132b and the diagonal pairing at 1133a): the figure IS the note, so it has
// to survive into the popup. Only shape and label elements are allowed, and the
// dangerous parts of SVG are deliberately absent — `use`/`image`/`foreignObject`
// (they fetch or embed foreign content), `animate`/`set` (they can retarget
// another element's attributes), `style` and `script`. Nothing left in the set
// takes a URL, and every `on*` attribute is dropped below, so no allowlisted
// figure can fetch or execute anything.
const SVG_TAGS = new Set(['svg', 'g', 'path', 'text', 'figure', 'figcaption']);

// `div` carries the ONLY structure LSJ entries have: stage5 emits every sense
// as <div class="lsj-sense" data-level="N">, nesting sub-senses inside their
// parent. Dropping the tag (as this allowlist did until 2026-08-19) collapsed
// LSJ's A → I → 1 → a hierarchy into one undifferentiated paragraph — the
// "wall of text" the stylesheet's .lsj-sense rules were written for and never
// got to match. A div is inert: no URL, no script, no event surface.
const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'br',
  'div',
  'em',
  'i',
  'li',
  'ol',
  'p',
  'span',
  'strong',
  'sub',
  'sup',
  'ul',
  ...SVG_TAGS,
]);

const VOID_TAGS = new Set(['br']);

// Attribute names arrive lowercased; the HTML parser restores the camelCase of
// known SVG attributes (viewBox) when it adopts them into the SVG namespace.
const SVG_ATTRS = new Set([
  'viewbox', 'd', 'x', 'y', 'width', 'height', 'role', 'fill', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-dasharray', 'font-size',
  'font-style', 'text-anchor',
]);
// Geometry, path data (letters + numbers), and keyword colours — never a URL,
// a quote, or a bracket, so a value can neither escape the attribute nor smuggle
// url(...) into a presentation attribute.
const SVG_VALUE = /^[\w\s.,#%-]*$/;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  // Strip whitespace and control characters (\p{Cc} = C0 0x00-0x1F and DEL/C1
  // 0x7F-0x9F) before scheme-matching, so "java\tscript:" or a leading control
  // char can't slip a dangerous scheme past the prefix check.
  const normalized = trimmed.replace(/[\s\p{Cc}]+/gu, '').toLowerCase();
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('vbscript:')
  ) {
    return null;
  }
  return trimmed;
}

function sanitizeAttrs(raw: string, tag: string): string {
  const attrs: string[] = [];
  const attrRe = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(raw))) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (name.startsWith('on')) continue;

    if (name === 'class' && /^[\w -]+$/.test(value)) {
      attrs.push(`class="${escapeAttr(value)}"`);
    } else if (name === 'href' && tag === 'a') {
      const href = safeHref(value);
      if (href) attrs.push(`href="${escapeAttr(href)}"`);
    } else if (name === 'data-level' && /^\d{1,2}$/.test(value)) {
      // Sense depth, the hook the hierarchy styling indents from. Digits only:
      // the value reaches CSS as an attribute selector, never as markup.
      attrs.push(`data-level="${value}"`);
    } else if (name === 'title' || name === 'aria-label') {
      attrs.push(`${name}="${escapeAttr(value)}"`);
    } else if (name === 'style' && tag === 'span' && /^\s*font-variant\s*:\s*small-caps\s*;?\s*$/i.test(value)) {
      attrs.push('style="font-variant: small-caps"');
    } else if (SVG_TAGS.has(tag) && SVG_ATTRS.has(name) && SVG_VALUE.test(value)) {
      attrs.push(`${name}="${escapeAttr(value)}"`);
    }
  }
  return attrs.length ? ` ${attrs.join(' ')}` : '';
}

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*([a-z][\w:-]*)([^>]*)>/gi, (full, rawTag, rawAttrs) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      const closing = /^<\s*\//.test(full);
      if (closing) return VOID_TAGS.has(tag) ? '' : `</${tag}>`;
      return `<${tag}${sanitizeAttrs(rawAttrs ?? '', tag)}>`;
    });
}

// LSJ shard HTML carries site-root-relative citation hrefs (the pipeline
// cannot know the deploy base); every renderer must prefix them. The pattern
// matches sanitizeHtml's own serialization (class before href, as stage5
// emits) — the word-popup round-trip test locks that. Idempotent: an
// already-prefixed href is left alone, and an empty or bare-slash base is a
// no-op rather than a protocol-relative "//" corruption.
export function prefixLsjCitationHrefs(html: string, base: string): string {
  if (!base || base === '/') return html;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(
    new RegExp(`(<a class="lsj-bibl" href=")(?!${escaped}/)/`, 'g'),
    `$1${base}/`,
  );
}

// ── LSJ sense outline ───────────────────────────────────────────────────────
// A long LSJ entry (λόγος, ἔχω, γίγνομαι) runs to hundreds of lines of prose.
// Indentation alone does not make it navigable: the reader still has to scroll
// the whole thing to learn how many top-level senses there are. This lifts the
// level-1 senses out as a jump list — number, a snippet of the sense's own
// leading prose, and an anchor id stamped into the markup to jump to.
//
// It runs on ALREADY-SANITIZED html (the ids are minted here, so `id` never has
// to be allowlisted in the sanitizer) and matches sanitizeHtml's serialization.
// Both lookaheads, so it holds whichever order the attributes come in.
export interface LsjSenseRef {
  /** The sense number as LSJ prints it ("A", "B", …), without its full stop. */
  n: string;
  /** Anchor id stamped onto the sense div. */
  id: string;
  /** Truncated first words of the sense, for the jump list. */
  label: string;
}

const TOP_SENSE_OPEN =
  /<div(?=[^>]*\bclass="lsj-sense")(?=[^>]*\bdata-level="1")([^>]*)>/g;
const SENSE_N = /^\s*<b class="lsj-sense-n">([\s\S]*?)<\/b>/;
const LABEL_MAX = 56;

function plainText(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // &amp; last, so "&amp;lt;" cannot be unescaped twice into a tag.
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    // Dropping a tag leaves a space where the markup was, and LSJ sets its
    // punctuation OUTSIDE the italic run (<i>relation</i>, ) — without this the
    // label reads "relation , correspondence , proportion".
    .replace(/\s+([,;:.!?)\]])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .trim();
}

function truncateLabel(text: string): string {
  const trimmed = text.replace(/^[\s,;:.·—–-]+/, '').replace(/[\s,;:.·—–-]+$/, '');
  if (trimmed.length <= LABEL_MAX) return trimmed;
  const cut = trimmed.slice(0, LABEL_MAX);
  const space = cut.lastIndexOf(' ');
  return `${(space > LABEL_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')}…`;
}

export function outlineLsjSenses(
  html: string,
  idPrefix = 'lsj-sense',
): { html: string; senses: LsjSenseRef[] } {
  const senses: LsjSenseRef[] = [];
  const used = new Set<string>();
  let out = '';
  let cursor = 0;
  let match: RegExpExecArray | null;
  TOP_SENSE_OPEN.lastIndex = 0;
  while ((match = TOP_SENSE_OPEN.exec(html))) {
    const bodyStart = match.index + match[0].length;
    // The sense's OWN prose stops where its first sub-sense begins; a div is
    // the only block LSJ markup emits, so the next `<div` is that boundary
    // (or, in a flat entry, the next sibling sense — the same cut).
    const nextDiv = html.indexOf('<div', bodyStart);
    const body = html.slice(bodyStart, nextDiv === -1 ? undefined : nextDiv);
    const nMatch = SENSE_N.exec(body);
    const n = nMatch ? plainText(nMatch[1]).replace(/\.$/, '') : '';
    const label = truncateLabel(plainText(body.slice(nMatch ? nMatch[0].length : 0)));

    const slug = n.replace(/[^A-Za-z0-9]+/g, '').toLowerCase() || String(senses.length + 1);
    let id = `${idPrefix}-${slug}`;
    for (let dup = 2; used.has(id); dup += 1) id = `${idPrefix}-${slug}-${dup}`;
    used.add(id);
    senses.push({ n, id, label });

    out += html.slice(cursor, match.index);
    out += `<div id="${id}"${match[1]}>`;
    cursor = bodyStart;
  }
  return { html: out + html.slice(cursor), senses };
}
