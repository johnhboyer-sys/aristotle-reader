/**
 * markdown.ts — a tiny, dependency-free, XSS-safe Markdown → HTML renderer for
 * AI-assist output (the Translation Check / AI reference sidebar and the Ask
 * panel answers). The app is self-contained under a strict CSP, so we can't
 * pull in a Markdown library; this covers the subset the CLIs actually emit:
 * headings, bold/italic, inline + fenced code, ordered/unordered lists,
 * blockquotes, horizontal rules, links, and blank-line paragraphs.
 *
 * SECURITY: the input is HTML-escaped FIRST, so nothing in the model's text
 * can inject markup — the only tags in the output are the ones this file adds.
 * The result is safe to drop into `{@html …}`. Link hrefs are additionally
 * scheme-checked (http/https/mailto/relative only) so a `javascript:` URL can't
 * ride in.
 */

/** Escape the HTML-significant characters. Run on ALL model text first. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only these schemes are allowed in a rendered link href. */
function safeHref(rawEscaped: string): string | null {
  // rawEscaped is already HTML-escaped; decode &amp; for the scheme probe but
  // keep the escaped form for output.
  const probe = rawEscaped.replace(/&amp;/g, '&').trim().toLowerCase();
  if (
    probe.startsWith('http://') ||
    probe.startsWith('https://') ||
    probe.startsWith('mailto:') ||
    probe.startsWith('/') ||
    probe.startsWith('#')
  ) {
    return rawEscaped.trim();
  }
  return null;
}

// Sentinel delimiter for pulled-out inline code: a NUL control char that cannot
// occur in real prose (and is fully consumed before output), so restoring the
// sentinels can't clobber a coincidental " 3 " in the text. Built via
// fromCharCode so there is no literal control char in this source file.
const SENT = String.fromCharCode(0);
const SENT_RE = new RegExp(`${SENT}(\\d+)${SENT}`, 'g');

/**
 * Inline formatting on a single already-HTML-escaped string: inline code,
 * links, bold, then italic. Inline code is pulled out to sentinels first so its
 * contents aren't touched by the emphasis passes, then restored.
 */
function renderInline(escaped: string): string {
  const codes: string[] = [];
  let text = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `${SENT}${codes.length - 1}${SENT}`;
  });

  // Links: [label](href) — label gets inline emphasis; href is scheme-checked.
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const safe = safeHref(href);
    const inner = emphasis(label);
    return safe ? `<a href="${safe}" target="_blank" rel="noreferrer">${inner}</a>` : `${inner}`;
  });

  text = emphasis(text);

  // Restore inline-code sentinels.
  text = text.replace(SENT_RE, (_m, i: string) => codes[Number(i)] ?? '');
  return text;
}

/** Bold (`**`/`__`) then italic (`*`/`_`) on escaped text. */
function emphasis(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const BLOCKQUOTE = /^\s*>\s?(.*)$/;

/**
 * Render a Markdown string to safe HTML. Block-level line scan; inline
 * formatting is applied per block (never to code content).
 */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length === 0) return;
    // Single newlines inside a paragraph collapse to spaces (CommonMark).
    const joined = buf.join(' ').trim();
    if (joined) out.push(`<p>${renderInline(escapeHtml(joined))}</p>`);
    buf.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block: ``` … ``` (contents escaped, never inline-processed).
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume the closing fence (or EOF)
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    // Blank line: paragraph boundary.
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Horizontal rule.
    if (HR.test(line)) {
      out.push('<hr />');
      i++;
      continue;
    }

    // Heading (# … ######) → h3..h6 (h1/h2 reserved for app chrome).
    const h = line.match(HEADING);
    if (h) {
      const level = Math.min(6, h[1].length + 2);
      out.push(`<h${level}>${renderInline(escapeHtml(h[2].trim()))}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote: consecutive `>` lines.
    if (BLOCKQUOTE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && BLOCKQUOTE.test(lines[i])) {
        buf.push(lines[i].match(BLOCKQUOTE)![1]);
        i++;
      }
      out.push(`<blockquote>${renderInline(escapeHtml(buf.join(' ').trim()))}</blockquote>`);
      continue;
    }

    // Lists: a run of bullet or ordered items (whichever the run starts with).
    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line) && !BULLET.test(line);
      const re = ordered ? ORDERED : BULLET;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(`<li>${renderInline(escapeHtml(lines[i].match(re)![1].trim()))}</li>`);
        i++;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    // Otherwise: gather a paragraph (until a blank line or a block starter).
    const buf: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !HR.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !BLOCKQUOTE.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !ORDERED.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    flushParagraph(buf);
  }

  return out.join('\n');
}
