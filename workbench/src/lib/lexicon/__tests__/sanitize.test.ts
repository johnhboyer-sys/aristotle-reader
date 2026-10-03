import { describe, expect, it } from 'vitest';
import { sanitizeEntryHtml } from '../sanitize';

// Real entries, verbatim from an installed Greek pack (LSJ) and from the
// pipeline's Lewis & Short output shape (stage5_lsj.py's _TAG_MAP).
const LSJ =
  '<b class="lsj-head">ἄα</b> <span class="lsj-greek">σύστημα ὕδατος,</span> <span class="lsj-author">Hsch.</span>, <span class="lsj-author">Phot.</span>, cf. <i class="lsj-title">Et.Gud.</i> <div class="lsj-sense" data-level="2"><b class="lsj-sense-n">II.</b>  v. ἄας.</div>';
const LS =
  '<b class="lsj-orth">ăbăcus</b>, <i class="lsj-itype">i</i>, <span class="lsj-gen">m.</span>, = ἄβαξ, <div class="lsj-sense" data-level="1"><b class="lsj-sense-n">I.</b> <span class="lsj-usg">Lit.</span>, a <i>sideboard</i> &lt;sic&gt; &amp; <span class="lsj-gramGrp">x</span></div>';

describe('sanitizeEntryHtml', () => {
  it('keeps real LSJ and Lewis & Short markup byte for byte', () => {
    expect(sanitizeEntryHtml(LSJ)).toBe(LSJ);
    expect(sanitizeEntryHtml(LS)).toBe(LS);
  });

  it('strips a script element', () => {
    const out = sanitizeEntryHtml('<b class="lsj-head">x</b><script>alert(1)</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out.startsWith('<b class="lsj-head">x</b>')).toBe(true);
  });

  it('strips event handlers from an allowed tag', () => {
    const out = sanitizeEntryHtml('<span class="lsj-greek" onclick="alert(1)">x</span><img src=x onerror="alert(1)">');
    expect(out).toBe('<span class="lsj-greek">x</span>');
    expect(out).not.toMatch(/onerror|onclick|<img/i);
  });

  it('strips links, javascript: URLs included', () => {
    const out = sanitizeEntryHtml('<a href="javascript:alert(1)">x</a><span style="background:url(javascript:alert(1))">y</span>');
    expect(out).toBe('x<span>y</span>');
    expect(out).not.toMatch(/javascript:|<a\b|style=/i);
  });

  it('cannot be fooled by a quoted > or an unterminated tag', () => {
    for (const evil of [
      '<span class="a>b" onmouseover="alert(1)">x</span>',
      '<span class=lsj-x onmouseover=alert(1)>x</span>',
      '<img src=x onerror=alert(1)',
      '<svg><script>alert(1)</script></svg>',
      '<!--<img src=x onerror=alert(1)>-->',
      '<div class="lsj-sense" data-level="1 onclick=alert(1)">x</div>',
      '<scr<script>ipt>alert(1)</script>',
    ]) {
      const out = sanitizeEntryHtml(evil);
      // Every tag left is one the sanitizer wrote itself.
      for (const tag of out.match(/<[^>]*>/g) ?? []) {
        expect(tag).toMatch(/^<\/?(div|span|b|i)( class="[A-Za-z0-9_ -]*")?( data-level="\d{1,2}")?>$/);
      }
      expect(out).not.toMatch(/<(img|svg|script)/i);
    }
  });

  it('closes what it opened and drops stray closers', () => {
    expect(sanitizeEntryHtml('<div class="lsj-sense"><b>x')).toBe('<div class="lsj-sense"><b>x</b></div>');
    expect(sanitizeEntryHtml('x</div></b>y')).toBe('xy');
  });

  it('escapes a stray < or & in text and keeps character references', () => {
    expect(sanitizeEntryHtml('a < b & c &amp; &#x27; &lt;')).toBe('a &lt; b &amp; c &amp; &#x27; &lt;');
  });
});

// Every real entry must come through unchanged — the allowlist is only right
// if it costs real entries nothing, and a cross-reference link in a real entry
// would fail here rather than be silently stripped. Reads an installed pack for
// each language, or the reader pipeline's built Lewis & Short shards; each
// source self-skips on a machine that lacks it.
interface NodeFs {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: string): string;
}
const fsSpecifier = 'node:fs';
const osSpecifier = 'node:os';
const { existsSync, readdirSync, readFileSync } = (await import(/* @vite-ignore */ fsSpecifier)) as unknown as NodeFs;
const { homedir } = (await import(/* @vite-ignore */ osSpecifier)) as unknown as { homedir(): string };
const PACKS = `${homedir()}/Library/Application Support/org.aristotlereader.workbench/packs`;
const REAL_SHARDS = [
  { name: 'installed LSJ pack', dir: `${PACKS}/grc/lsj`, min: 100_000 },
  { name: 'installed Lewis & Short pack', dir: `${PACKS}/lat/ls`, min: 40_000 },
  { name: 'built Lewis & Short shards', dir: `${homedir()}/Developer/classical-philosophy-reader/build/dist/ls`, min: 10_000 },
];

describe.each(REAL_SHARDS)('sanitizeEntryHtml on the $name', ({ dir, min }) => {
  it.skipIf(!existsSync(dir))('leaves every entry unchanged', () => {
    let checked = 0;
    const changed: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const shard = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as Record<string, { html: string }>;
      for (const [key, entry] of Object.entries(shard)) {
        checked++;
        if (sanitizeEntryHtml(entry.html) !== entry.html) changed.push(key);
      }
    }
    expect(checked).toBeGreaterThan(min);
    expect(changed.slice(0, 10)).toEqual([]);
  }, 120_000);
});
