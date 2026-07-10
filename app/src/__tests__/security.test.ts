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
});
