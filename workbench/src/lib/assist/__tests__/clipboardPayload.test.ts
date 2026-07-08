import { describe, expect, it } from 'vitest';
import { buildClipboardPayload } from '../clipboardPayload';
import { GOLDEN_CONTEXT, NO_CONTEXT } from './fixtures';

describe('buildClipboardPayload', () => {
  it('golden: flat, self-contained, one instruction line up top', () => {
    const payload = buildClipboardPayload(GOLDEN_CONTEXT);
    expect(payload).toMatchInlineSnapshot(`
      "Translate this single line of Metaphysics (Aristotle) into English, matching the style of the surrounding draft. Line-locked 1:1 (one English line per source line).

      Context:
      [1041a4] πάλιν ἐπανέλθωμεν. — (untranslated)
      [1041a5] διὰ τί ὕλη τὶς τόδε τὶ ἐστιν; — why is this matter this thing?

      TRANSLATE THIS LINE:
      [1041a6] τὸ γὰρ τί ἦν εἶναι τοῦτό ἐστιν.

      [1041a7] πρῶτον οὖν εἴπωμεν. — (untranslated)
      [1041a8] ἔστω δὴ σαφὲς τοῦτο. — let this then be clear."
    `);
  });

  it('interleaved untranslated rows render the literal "(untranslated)" token', () => {
    const payload = buildClipboardPayload(GOLDEN_CONTEXT);
    expect(payload).toContain('[1041a4] πάλιν ἐπανέλθωμεν. — (untranslated)');
  });

  it('the target line never appears as a draft ("— ...") context row', () => {
    const payload = buildClipboardPayload(GOLDEN_CONTEXT);
    const occurrences = payload.split(GOLDEN_CONTEXT.target.greek).length - 1;
    expect(occurrences).toBe(1);
    expect(payload).toContain(`TRANSLATE THIS LINE:\n[${GOLDEN_CONTEXT.target.address}] ${GOLDEN_CONTEXT.target.greek}`);
  });

  it('reuses renderAssistContext (prompt.ts) — same context rows as buildAssistPrompt', () => {
    const payload = buildClipboardPayload(GOLDEN_CONTEXT);
    expect(payload).toContain('[1041a5] διὰ τί ὕλη τὶς τόδε τὶ ἐστιν; — why is this matter this thing?');
    expect(payload).toContain('[1041a8] ἔστω δὴ σαφὲς τοῦτο. — let this then be clear.');
  });

  it('no context rows: omits the "Context:" header, still includes the target', () => {
    const payload = buildClipboardPayload(NO_CONTEXT);
    expect(payload).not.toContain('Context:');
    expect(payload).toContain('TRANSLATE THIS LINE:');
  });

  it('empty-target-row renders its (empty) Greek without throwing', () => {
    const ctx = { ...GOLDEN_CONTEXT, target: { address: '1041a6', greek: '' } };
    expect(() => buildClipboardPayload(ctx)).not.toThrow();
    expect(buildClipboardPayload(ctx)).toContain('TRANSLATE THIS LINE:\n[1041a6] ');
  });
});

// ── D8 §7 Phase E2: unit-aware payloads ─────────────────────────────────────

describe('buildClipboardPayload — units', () => {
  const FREE_WORK = {
    title: 'Vom Kriege',
    author: '',
    originalLanguage: 'greek' as const,
    language: 'German',
    scheme: 'paragraph',
  };

  it("golden: 'paragraph' unit — paragraph instruction + TRANSLATE THIS PARAGRAPH header, no empty author parens", () => {
    const payload = buildClipboardPayload({
      ...GOLDEN_CONTEXT,
      unit: 'paragraph',
      work: FREE_WORK,
      before: [],
      after: [],
      target: { address: '¶2', greek: 'Der Krieg ist eine bloße Fortsetzung der Politik.' },
    });
    expect(payload).toBe(
      [
        'Translate this single paragraph of Vom Kriege into English, matching the style of the surrounding draft. Paragraph-locked 1:1 (one English paragraph per source paragraph).',
        '',
        'TRANSLATE THIS PARAGRAPH:',
        '[¶2] Der Krieg ist eine bloße Fortsetzung der Politik.',
      ].join('\n'),
    );
  });

  it("'sentence' unit renders the enclosing paragraph before the TRANSLATE THIS SENTENCE header", () => {
    const payload = buildClipboardPayload({
      ...GOLDEN_CONTEXT,
      unit: 'sentence',
      work: FREE_WORK,
      before: [],
      after: [],
      target: { address: '¶2', greek: 'Der Krieg ist eine Fortsetzung.' },
      enclosing: { address: '¶2', greek: 'Der Krieg ist eine Fortsetzung. Er ist ein Instrument.' },
    });
    expect(payload).toBe(
      [
        'Translate this single sentence of Vom Kriege into English, matching the style of the surrounding draft. Sentence-locked 1:1 (one English sentence per source sentence).',
        '',
        'It is part of this paragraph:',
        '[¶2] Der Krieg ist eine Fortsetzung. Er ist ein Instrument.',
        '',
        'TRANSLATE THIS SENTENCE:',
        '[¶2] Der Krieg ist eine Fortsetzung.',
      ].join('\n'),
    );
  });

  it('the line-unit payload keeps the author parens when an author exists (shipped golden above pins it)', () => {
    const payload = buildClipboardPayload(GOLDEN_CONTEXT);
    expect(payload).toContain('of Metaphysics (Aristotle) into English');
  });
});
