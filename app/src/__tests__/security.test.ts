import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../lib/html';
import { jsonLdSafe } from '../lib/jsonld';

describe('jsonLdSafe', () => {
  it('escapes script breakouts and line separators', () => {
    const out = jsonLdSafe({ x: '</script><img src=x onerror=alert(1)>', y: 'a\u2028b' });

    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003C/script\\u003E');
    expect(out).toContain('\\u2028');
  });
});

describe('sanitizeHtml', () => {
  it('preserves allowed markup while removing script and unsafe attributes', () => {
    const out = sanitizeHtml('<i>ok</i><script>alert(1)</script><a href="javascript:alert(1)" onclick="x">y</a>');

    expect(out).toContain('<i>ok</i>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert(1)');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('<a>y</a>');
  });

  // Two of Ostwald's footnotes ARE diagrams, so a small SVG subset reaches the
  // popup. What is allowed is shapes and labels; what is not is anything that
  // can fetch, embed, or retarget.
  it('keeps a figure SVG intact', () => {
    const svg = '<figure class="fn-figure"><svg viewBox="0 0 200 116" role="img" aria-label="Crossing lines">'
      + '<g stroke="currentColor" stroke-width="1.6"><path d="M48 30 152 90"></path></g>'
      + '<text x="40" y="24" font-style="italic">A</text></svg></figure>';

    // Attribute names come back lowercased; the HTML parser restores the
    // camelCase of the SVG attributes it knows (viewBox) as it adopts the
    // element into the SVG namespace, so the figure still renders.
    expect(sanitizeHtml(svg)).toBe(svg.replace('viewBox', 'viewbox'));
  });

  it('drops the SVG elements that can fetch, embed, or retarget', () => {
    const out = sanitizeHtml(
      '<svg viewBox="0 0 1 1">'
      + '<use href="http://evil.test/x#y"></use>'
      + '<image href="http://evil.test/x.png"></image>'
      + '<foreignObject><b>x</b></foreignObject>'
      + '<animate attributeName="href" to="javascript:alert(1)"></animate>'
      + '<path d="M0 0" onload="alert(1)" fill="url(http://evil.test/x)"></path>'
      + '</svg>',
    );

    expect(out).not.toContain('use');
    expect(out).not.toContain('image');
    expect(out).not.toContain('foreignObject');
    expect(out).not.toContain('animate');
    expect(out).not.toContain('href');
    expect(out).not.toContain('onload');
    expect(out).not.toContain('url(');
    expect(out).toContain('<svg viewbox="0 0 1 1">');
    expect(out).toContain('<path d="M0 0">');
  });
});
