/** Keep an English em dash with the word before it. */
export function noBreakBeforeDash(s: string): string {
  return s.replace(/[\s\u2060]*—/g, '\u2060—');
}

// Tags and entities stay byte-for-byte intact. Tags do not reset quote context.
function english(s: string, html: boolean): string {
  const units = html
    ? s.match(/<!--[\s\S]*?-->|<(?:(?:"[^"]*"|'[^']*'|[^'">])*)>|&(?:#\d+|#x[\da-f]+|[a-z][\da-z]*);|[^]/gi) ?? []
    : [...s];
  const out: { text: string; tag: boolean }[] = [];
  let previous = '';
  for (const unit of units) {
    if (html && unit.startsWith('<') && unit.length > 1) {
      out.push({ text: unit, tag: true });
      continue;
    }
    if (html && unit.startsWith('&') && unit.length > 1) {
      out.push({ text: unit, tag: false });
      previous = unit === '&nbsp;' ? ' ' : unit === '&ldquo;' || unit === '&lsquo;' ? '“' : 'x';
      continue;
    }
    let text = unit;
    if (unit === '—') {
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].tag) continue;
        if (!/^[\s\u2060]$/.test(out[i].text)) break;
        out.splice(i, 1);
      }
      text = '\u2060—';
    } else if (unit === '"' || unit === "'") {
      const opening = !previous || /[\s([—“‘]/.test(previous);
      text = unit === '"' ? (opening ? '“' : '”') : (opening ? '‘' : '’');
    }
    out.push({ text, tag: false });
    previous = text.slice(-1);
  }
  return out.map(x => x.text).join('');
}

export function curlyEnglish(s: string): string { return english(s, false); }
export function curlyEnglishHtml(html: string): string { return english(html, true); }

/** Normalize elision marks without changing the koronis or modifier apostrophe. */
export function greekElision(s: string): string {
  return s.replace(/['\u2018\u2019\u201b\u2032\uff07]/g, '’');
}
