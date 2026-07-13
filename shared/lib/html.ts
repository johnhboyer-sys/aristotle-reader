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

const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'br',
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
]);

const VOID_TAGS = new Set(['br']);

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
    } else if (name === 'title' || name === 'aria-label') {
      attrs.push(`${name}="${escapeAttr(value)}"`);
    } else if (name === 'style' && tag === 'span' && /^\s*font-variant\s*:\s*small-caps\s*;?\s*$/i.test(value)) {
      attrs.push('style="font-variant: small-caps"');
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
