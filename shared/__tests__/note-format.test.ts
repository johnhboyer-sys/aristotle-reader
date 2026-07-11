import { describe, expect, it } from 'vitest';
import { escapeHtml, formatNoteHtml } from '../lib/note-format';

describe('formatNoteHtml', () => {
  it('escapes HTML before any formatting', () => {
    expect(formatNoteHtml('a <script>alert(1)</script> tag')).toBe(
      '<p>a &lt;script&gt;alert(1)&lt;/script&gt; tag</p>'
    );
  });

  it('renders *…* spans as <em> without crossing lines', () => {
    expect(formatNoteHtml('the term *knowledge* is emphasized')).toBe(
      '<p>the term <em>knowledge</em> is emphasized</p>'
    );
    expect(formatNoteHtml('a stray * asterisk * pair\nacross words')).toBe(
      '<p>a stray <em> asterisk </em> pair across words</p>'
    );
  });

  it('splits blank-line runs into paragraphs and collapses whitespace', () => {
    expect(formatNoteHtml('first  paragraph\n\nsecond   one')).toBe(
      '<p>first paragraph</p><p>second one</p>'
    );
  });

  it('escapeHtml covers the five sensitive characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
