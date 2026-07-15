// Decode the importer's canonical inline markup for the import-preview display
// (John 2026-07-14): the preview English carries `{grc:…}` (inline Greek) and
// `{^id:phrase}` footnote anchors — possibly nested `{^id:{grc:…}}` — which look
// like raw braces in a plain <textarea>. This turns them into display segments
// so the preview can show readable text (Greek in its own font, a footnote as
// `phrase` + a superscript id) instead of the markup. Pure and node-testable;
// the raw string stays the source of truth for editing/import.

export type PreviewSeg =
  | { kind: 'text'; text: string }
  | { kind: 'grc'; text: string }
  | { kind: 'fn'; id: string; phrase: PreviewSeg[] };

/** Index of the `}` that closes the `{` at `open`, honouring nesting; -1 if
 * unbalanced (the token is then treated as literal text). */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/**
 * Parse canonical inline markup into display segments. `{grc:X}` → a grc
 * segment; `{^id:phrase}` → a footnote segment whose phrase is parsed
 * recursively (so `{^1:{grc:…}}` renders as Greek + a superscript). Anything
 * that isn't a well-formed token — a lone `{`, an unbalanced brace, `{foo:…}` —
 * passes through as literal text, so the decoder never eats real prose.
 */
export function parsePreviewEnglish(input: string): PreviewSeg[] {
  const out: PreviewSeg[] = [];
  let buf = '';
  const flush = () => {
    if (buf.length > 0) {
      out.push({ kind: 'text', text: buf });
      buf = '';
    }
  };

  let i = 0;
  while (i < input.length) {
    if (input[i] === '{') {
      const isGrc = input.startsWith('{grc:', i);
      const fn = isGrc ? null : /^\{\^([^:{}]+):/.exec(input.slice(i));
      if (isGrc || fn) {
        const close = matchBrace(input, i);
        if (close !== -1) {
          const headLen = isGrc ? '{grc:'.length : fn![0].length;
          const inner = input.slice(i + headLen, close);
          flush();
          if (isGrc) out.push({ kind: 'grc', text: inner });
          else out.push({ kind: 'fn', id: fn![1], phrase: parsePreviewEnglish(inner) });
          i = close + 1;
          continue;
        }
      }
    }
    buf += input[i];
    i++;
  }
  flush();
  return out;
}
