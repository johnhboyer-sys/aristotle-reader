// Copy as citation (build spec §10) — pure assembly tests. Row range,
// English/Greek extraction and the exact clipboard string, using the real
// bekker-metaphysics scheme so scheme.formatCitation's range collapsing
// (a→b transitions) is exercised for real, not re-implemented here.
//
// Also guards the OPPOSITE requirement (explicit user constraint): citation
// copy is opt-in per invocation (toolbar button / ⌘⇧C only) and must NEVER
// change what plain Cmd-C / context-menu copy produces — the default onCopy
// handler stays plain text joined by newlines, with no citation code path.
import { beforeAll, describe, expect, it } from 'vitest';
import { parseRow } from '../serialize';
import { buildCitationClipboardText, type CitationRowInput } from '../copyCitation';
import { getScheme } from '../../citation/registry';
import type { Address, WorkMeta } from '../../citation/types';

const scheme = getScheme('bekker-metaphysics');

const WORK: WorkMeta = {
  id: 'metaphysics',
  title: 'Metaphysics',
  author: 'Aristotle',
  scheme: 'bekker-metaphysics',
  books: [
    { n: 1, label: 'Α' },
    { n: 2, label: 'α' },
    { n: 3, label: 'Β' },
    { n: 4, label: 'Γ' },
    { n: 5, label: 'Δ' },
    { n: 6, label: 'Ε' },
    { n: 7, label: 'Ζ' },
  ],
};

const addr = (raw: string): Address => ({ scheme: 'bekker-metaphysics', raw });

function row(raw: string, greek: string, english: string, englishSelected: string | null = null): CitationRowInput {
  return {
    address: addr(raw),
    greek,
    englishDoc: parseRow(english),
    englishSelected,
  };
}

describe('buildCitationClipboardText', () => {
  it('single-row point reference, caret-only (full row English)', () => {
    const result = buildCitationClipboardText({
      rows: [row('1041a6', 'Τί δὲ χρὴ λέγειν', 'What we must say')],
      scheme,
      work: WORK,
      book: 7,
      chapter: 17,
    });
    expect(result).toEqual({
      kind: 'copied',
      text: 'What we must say. (*Metaphysics* Ζ.17, 1041a6: Τί δὲ χρὴ λέγειν)',
    });
  });

  it('multi-row range crossing an a→b column transition collapses via the shared formatter', () => {
    const result = buildCitationClipboardText({
      rows: [
        row('1041a31', 'πρῶτον μὲν οὖν', 'First then'),
        row('1041b1', 'δεῖ διορίσαι', 'we must distinguish'),
        row('1041b5', 'περὶ αὐτῆς', 'concerning it'),
      ],
      scheme,
      work: WORK,
      book: 7,
      chapter: 17,
    });
    expect(result.kind).toBe('copied');
    if (result.kind !== 'copied') throw new Error('unreachable');
    // formatBekkerRange same-page a→b: "1041a31–b5" (no re-implementation here).
    expect(result.text).toBe(
      'First then we must distinguish concerning it. (*Metaphysics* Ζ.17, 1041a31–b5: πρῶτον μὲν οὖν δεῖ διορίσαι περὶ αὐτῆς)',
    );
  });

  it('caret-only full-row case: no selection reached English, uses full row text of every touched row', () => {
    const result = buildCitationClipboardText({
      rows: [row('1041a6', 'greek one', 'english one'), row('1041a7', 'greek two', 'english two')],
      scheme,
      work: WORK,
      book: 7,
      chapter: 17,
    });
    expect(result).toEqual({
      kind: 'copied',
      text: 'english one english two. (*Metaphysics* Ζ.17, 1041a6–7: greek one greek two)',
    });
  });

  it('strips markup and footnote markers — English is plain text only', () => {
    const marked = row(
      '1041a6',
      'greek spine',
      '**bold** *it* ++ul++ {grc:τὸ τί} {^3:anchored phrase}{^3:} plain',
    );
    const result = buildCitationClipboardText({
      rows: [marked],
      scheme,
      work: WORK,
      book: 7,
      chapter: 17,
    });
    expect(result.kind).toBe('copied');
    if (result.kind !== 'copied') throw new Error('unreachable');
    // The English segment (before the citation's own markdown-italic title)
    // must carry NO **, *, ++, {grc:...}, {^id:...} markup and no <sup>
    // marker artifact — extracted from the PM doc's plain text, not from
    // serialize.ts output.
    const englishSegment = result.text.split('. (')[0];
    expect(englishSegment).not.toMatch(/[*+{}^]/);
    expect(result.text).toBe(
      'bold it ul τὸ τί anchored phrase plain. (*Metaphysics* Ζ.17, 1041a6: greek spine)',
    );
  });

  it('uses englishSelected text when the selection touched an English cell, joined across rows', () => {
    const result = buildCitationClipboardText({
      rows: [
        row('1041a6', 'greek one full', 'english one full', 'one sel'),
        row('1041a7', 'greek two full', 'english two full', 'two sel'),
      ],
      scheme,
      work: WORK,
      book: 7,
      chapter: 17,
    });
    expect(result).toEqual({
      kind: 'copied',
      text: 'one sel two sel. (*Metaphysics* Ζ.17, 1041a6–7: greek one full greek two full)',
    });
  });

  it('skips rows whose English is empty without doubling spaces', () => {
    const result = buildCitationClipboardText({
      rows: [
        row('1041a6', 'greek one', ''),
        row('1041a7', 'greek two', 'only this row has text'),
        row('1041a8', 'greek three', ''),
      ],
      scheme,
      work: WORK,
      book: 7,
      chapter: 17,
    });
    expect(result).toEqual({
      kind: 'copied',
      text: 'only this row has text. (*Metaphysics* Ζ.17, 1041a6–8: greek one greek two greek three)',
    });
  });

  it('all-English-empty case: nothing is copied', () => {
    const result = buildCitationClipboardText({
      rows: [row('1041a6', 'greek one', ''), row('1041a7', 'greek two', '')],
      scheme,
      work: WORK,
      book: 7,
      chapter: 17,
    });
    expect(result).toEqual({ kind: 'empty' });
  });

  it('all-English-empty with a non-null but blank englishSelected also yields empty', () => {
    const result = buildCitationClipboardText({
      rows: [row('1041a6', 'greek one', '', '   '), row('1041a7', 'greek two', '', '')],
      scheme,
      work: WORK,
      book: 7,
      chapter: 17,
    });
    expect(result).toEqual({ kind: 'empty' });
  });

  it('never truncates a long Greek span across many rows', () => {
    const rows: CitationRowInput[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(row(`1041a${i + 6}`, `line-${i}-word-word-word`, i === 0 ? 'anchor english' : ''));
    }
    const result = buildCitationClipboardText({ rows, scheme, work: WORK, book: 7, chapter: 17 });
    expect(result.kind).toBe('copied');
    if (result.kind !== 'copied') throw new Error('unreachable');
    for (let i = 0; i < 12; i++) {
      expect(result.text).toContain(`line-${i}-word-word-word`);
    }
  });

  it('different-page range uses the full-ref-both-ends form', () => {
    const result = buildCitationClipboardText({
      rows: [row('1041b25', 'greek a', 'english a'), row('1042a5', 'greek b', 'english b')],
      scheme,
      work: WORK,
      book: 7,
      chapter: 17,
    });
    expect(result).toEqual({
      kind: 'copied',
      text: 'english a english b. (*Metaphysics* Ζ.17, 1041b25–1042a5: greek a greek b)',
    });
  });
});

describe('period handling — no doubled terminal punctuation', () => {
  function textOf(english: string): string {
    const result = buildCitationClipboardText({
      rows: [row('1005b35', 'τὸ ὂν ᾗ ὄν', '', english)],
      scheme,
      work: WORK,
      book: 4,
      chapter: 4,
    });
    if (result.kind !== 'copied') throw new Error('expected a copied result');
    return result.text;
  }

  it('English already ending in "." gets no extra period', () => {
    expect(textOf('There is a science which studies being qua being.')).toBe(
      'There is a science which studies being qua being. (*Metaphysics* Γ.4, 1005b35: τὸ ὂν ᾗ ὄν)',
    );
  });

  it('English ending in "?" gets no extra period', () => {
    expect(textOf('is there a science of being qua being?')).toBe(
      'is there a science of being qua being? (*Metaphysics* Γ.4, 1005b35: τὸ ὂν ᾗ ὄν)',
    );
  });

  it('English ending in period + closing quote gets no extra period', () => {
    expect(textOf('he calls it "first philosophy."')).toBe(
      'he calls it "first philosophy." (*Metaphysics* Γ.4, 1005b35: τὸ ὂν ᾗ ὄν)',
    );
  });

  it('English ending mid-sentence DOES get the period', () => {
    expect(textOf('a science which studies being qua being')).toBe(
      'a science which studies being qua being. (*Metaphysics* Γ.4, 1005b35: τὸ ὂν ᾗ ὄν)',
    );
  });
});

describe('per-row English fallback — Greek-cell selections keep every row', () => {
  it('Greek-only selection: every touched row contributes its FULL English', () => {
    // Repro shape from live verification: selection from row 0's Greek cell
    // to row 2's Greek cell. No row has an English endpoint, so ALL rows are
    // englishSelected: null and must fall back to full English — the bug
    // dropped the endpoint rows and kept only the interior one.
    const result = buildCitationClipboardText({
      rows: [
        row('1005b35', 'greek one', 'english one'),
        row('1006a1', 'greek two', 'english two'),
        row('1006a2', 'greek three', 'english three'),
      ],
      scheme,
      work: WORK,
      book: 4,
      chapter: 4,
    });
    expect(result).toEqual({
      kind: 'copied',
      text: 'english one english two english three. (*Metaphysics* Γ.4, 1005b35–1006a2: greek one greek two greek three)',
    });
  });

  it('mixed selection: English-endpoint row uses its selected text, the rest full English', () => {
    // Selection starts inside row 0's English cell, ends inside row 2's
    // Greek cell: row 0 contributes its selected tail; rows 1–2 have no
    // English endpoint (null) and contribute their full English.
    const result = buildCitationClipboardText({
      rows: [
        row('1005b35', 'greek one', 'english one full', 'one tail'),
        row('1006a1', 'greek two', 'english two full'),
        row('1006a2', 'greek three', 'english three full'),
      ],
      scheme,
      work: WORK,
      book: 4,
      chapter: 4,
    });
    expect(result).toEqual({
      kind: 'copied',
      text: 'one tail english two full english three full. (*Metaphysics* Γ.4, 1005b35–1006a2: greek one greek two greek three)',
    });
  });

  it('a row whose selected English is empty is skipped, not replaced by its full text', () => {
    // Selection ends at the very start of row 1's English cell: the user
    // deliberately stopped before it — its empty selection contributes
    // nothing (and does NOT fall back to the full row).
    const result = buildCitationClipboardText({
      rows: [
        row('1005b35', 'greek one', '', 'selected text'),
        row('1006a1', 'greek two', 'english two full', ''),
      ],
      scheme,
      work: WORK,
      book: 4,
      chapter: 4,
    });
    expect(result).toEqual({
      kind: 'copied',
      text: 'selected text. (*Metaphysics* Γ.4, 1005b35–1006a1: greek one greek two)',
    });
  });
});

describe('default copy path stays citation-free (plain Cmd-C unchanged)', () => {
  // Source-level guard: the onCopy handler in ChapterEditor.svelte is the
  // default cross-row copy path (plain Cmd-C / context-menu copy). Citation
  // copy fires ONLY from the explicit command (toolbar / ⌘⇧C); if citation
  // code ever leaks into onCopy — or its plain-text contract changes — this
  // test fails.
  //
  // Computed specifier: this project has no @types/node (see the same trick
  // in lexicon/__tests__/greekToBeta.test.ts), so static `import 'node:fs'`
  // fails `tsc --noEmit` even though vitest's node environment provides it.
  let componentSource = '';
  let onCopyStart = -1;
  let onCopyEnd = -1;
  let onCopyBody = '';

  beforeAll(async () => {
    const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
      readFileSync(path: string, encoding: 'utf-8'): string;
    };
    const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
      fileURLToPath(url: URL): string;
    };
    componentSource = fs.readFileSync(
      nodeUrl.fileURLToPath(new URL('../ChapterEditor.svelte', import.meta.url)),
      'utf-8',
    );
    onCopyStart = componentSource.indexOf('function onCopy(');
    onCopyEnd = componentSource.indexOf('function onCut(');
    onCopyBody = componentSource.slice(onCopyStart, onCopyEnd);
  });

  it('the default onCopy handler is still wired and intact', () => {
    expect(onCopyStart).toBeGreaterThan(-1);
    expect(onCopyEnd).toBeGreaterThan(onCopyStart);
    // Template still routes the native copy event to the default handler.
    expect(componentSource).toContain('oncopy={onCopy}');
  });

  it('onCopy keeps the plain-text contract: rows joined by newlines, text/plain only', () => {
    expect(onCopyBody).toContain("parts.join('\\n')");
    expect(onCopyBody).toContain("setData('text/plain'");
  });

  it('onCopy contains no citation code path', () => {
    expect(onCopyBody).not.toMatch(/citation/i);
    expect(onCopyBody).not.toContain('formatCitation');
    expect(onCopyBody).not.toContain('buildCitationClipboardText');
    expect(onCopyBody).not.toContain('getScheme');
  });

  it('default-path extraction semantics: markup strips to plain text, rows join with \\n, no citation formatting', () => {
    // Pins the exact extraction call the onCopy handler uses:
    // doc.textBetween(from, to, undefined, '') per row, joined by '\n'.
    const docs = [
      parseRow('**First** row with {grc:τὸ τί} greek'),
      parseRow('second row {^3:with a footnote}{^3:} anchor'),
    ];
    const copied = docs.map((d) => d.textBetween(0, d.content.size, undefined, '')).join('\n');
    expect(copied).toBe('First row with τὸ τί greek\nsecond row with a footnote anchor');
    // No citation artifacts in the default path's output.
    expect(copied).not.toContain('(*');
    expect(copied).not.toContain('Metaphysics');
  });
});
