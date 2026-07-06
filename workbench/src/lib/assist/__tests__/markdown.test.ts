import { describe, expect, it } from 'vitest';
import { renderMarkdown, escapeHtml } from '../markdown';

describe('escapeHtml', () => {
  it('escapes the HTML-significant characters', () => {
    expect(escapeHtml(`<b>&"'`)).toBe('&lt;b&gt;&amp;&quot;&#39;');
  });
});

describe('renderMarkdown — inline', () => {
  it('renders bold and italic', () => {
    expect(renderMarkdown('a **bold** and *italic* word')).toBe(
      '<p>a <strong>bold</strong> and <em>italic</em> word</p>',
    );
    expect(renderMarkdown('__b__ and _i_')).toBe('<p><strong>b</strong> and <em>i</em></p>');
  });

  it('renders inline code and does NOT emphasise inside it', () => {
    expect(renderMarkdown('the `**bold** in code` here')).toBe(
      '<p>the <code>**bold** in code</code> here</p>',
    );
  });

  it('does not clobber a bare number that matches a code index', () => {
    // one inline code (index 0) plus a bare " 0 " in prose — the prose 0 must survive.
    const html = renderMarkdown('use `x` in 0 of the cases');
    expect(html).toBe('<p>use <code>x</code> in 0 of the cases</p>');
  });

  it('escapes HTML in the source (no injection)', () => {
    expect(renderMarkdown('a <script>alert(1)</script> b')).toBe(
      '<p>a &lt;script&gt;alert(1)&lt;/script&gt; b</p>',
    );
  });

  it('renders safe links and drops javascript: schemes', () => {
    expect(renderMarkdown('[site](https://x.com)')).toBe(
      '<p><a href="https://x.com" target="_blank" rel="noreferrer">site</a></p>',
    );
    const danger = renderMarkdown('[x](javascript:alert(1))');
    expect(danger).not.toContain('href'); // scheme rejected → no anchor emitted
    expect(danger).not.toContain('javascript');
    expect(renderMarkdown('[x](vbscript:foo)')).toBe('<p>x</p>');
  });
});

describe('renderMarkdown — blocks', () => {
  it('renders headings as h3..h6', () => {
    expect(renderMarkdown('# Title')).toBe('<h3>Title</h3>');
    expect(renderMarkdown('#### Deep')).toBe('<h6>Deep</h6>');
  });

  it('renders unordered and ordered lists', () => {
    expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(renderMarkdown('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
  });

  it('separates paragraphs on blank lines and joins soft-wrapped lines', () => {
    expect(renderMarkdown('one\ntwo\n\nthree')).toBe('<p>one two</p>\n<p>three</p>');
  });

  it('renders a fenced code block verbatim (escaped, no inline)', () => {
    expect(renderMarkdown('```\n**not bold**\n<i>\n```')).toBe(
      '<pre><code>**not bold**\n&lt;i&gt;</code></pre>',
    );
  });

  it('renders blockquotes and horizontal rules', () => {
    expect(renderMarkdown('> quoted')).toBe('<blockquote>quoted</blockquote>');
    expect(renderMarkdown('---')).toBe('<hr />');
  });

  it('handles a realistic diagnosis with a heading, bold, and a list', () => {
    const md = ['# Diagnosis', '', '- **`ἆρα`** — interrogative particle', '- `ἐκλείπει` — 3sg'].join('\n');
    expect(renderMarkdown(md)).toBe(
      '<h3>Diagnosis</h3>\n<ul><li><strong><code>ἆρα</code></strong> — interrogative particle</li><li><code>ἐκλείπει</code> — 3sg</li></ul>',
    );
  });
});
