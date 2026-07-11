// Endnote body -> safe HTML. Import note text is PLAIN text (unlike built-in
// footnotes.json, which ships pre-rendered HTML), so everything is escaped
// first and only then lightly formatted: *…* emphasis spans become <em>, and
// blank-line-ish breaks become paragraphs. No other markup is interpreted.
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/gu, (ch) => ESCAPES[ch]);
}

export function formatNoteHtml(raw: string): string {
  const paragraphs = raw
    .split(/\n{2,}|\n(?=\s*$)/u)
    .map((p) => p.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
  const formatted = paragraphs.map((p) => {
    let html = escapeHtml(p);
    // *word* / _word_ emphasis — same-line, non-greedy, no nesting (the
    // genie witness uses both dressings).
    html = html.replace(/\*([^*\n]+)\*/gu, '<em>$1</em>');
    html = html.replace(/(?<![\w])_([^_\n]+)_(?![\w])/gu, '<em>$1</em>');
    return `<p>${html}</p>`;
  });
  return formatted.join('');
}
