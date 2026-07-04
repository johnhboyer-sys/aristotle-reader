import { describe, expect, it } from 'vitest';
import { buildAssistPrompt, renderAssistContext } from '../prompt';
import { GOLDEN_CONTEXT, NO_CONTEXT } from './fixtures';

describe('buildAssistPrompt', () => {
  it('golden: system prompt states the row-locked 1:1 discipline and output-only-English rule', () => {
    const { system } = buildAssistPrompt(GOLDEN_CONTEXT);
    expect(system).toMatchInlineSnapshot(
      `"You are helping a professional classicist translate a work from its original language into English. The translation is strictly line-locked: each source line gets exactly one English line, kept in 1:1 correspondence even when English word order forces an awkward mid-clause break. Match the register, terminology, and style of the surrounding English shown below. Output ONLY the English translation for the single TARGET line. Do not add quotation marks, commentary, notes, alternatives, or the original-language text. Do not translate the context lines."`,
    );
  });

  it('golden: user prompt renders citation, context rows, bracketed target, and trailing instruction', () => {
    const { user } = buildAssistPrompt(GOLDEN_CONTEXT);
    expect(user).toMatchInlineSnapshot(`
      "Work: Metaphysics, Book Ζ, Chapter 17  (bekker-metaphysics citation)

      Context (each line: [address] source — English draft, blank if untranslated):
      [1041a4] πάλιν ἐπανέλθωμεν. — (untranslated)
      [1041a5] διὰ τί ὕλη τὶς τόδε τὶ ἐστιν; — why is this matter this thing?

      >>> TARGET line to translate:
      [1041a6] τὸ γὰρ τί ἦν εἶναι τοῦτό ἐστιν.

      Continuing context:
      [1041a7] πρῶτον οὖν εἴπωμεν. — (untranslated)
      [1041a8] ἔστω δὴ σαφὲς τοῦτο. — let this then be clear.

      Provide the English translation for the TARGET line only."
    `);
  });

  it('interleaved untranslated rows render the literal "(untranslated)" token, never an empty field', () => {
    const { user } = buildAssistPrompt(GOLDEN_CONTEXT);
    expect(user).toContain('[1041a4] πάλιν ἐπανέλθωμεν. — (untranslated)');
    expect(user).toContain('[1041a7] πρῶτον οὖν εἴπωμεν. — (untranslated)');
  });

  it('the target line never appears in the "english draft" position of a context row', () => {
    const { user } = buildAssistPrompt(GOLDEN_CONTEXT);
    // The target's Greek must appear exactly once, inside the bracketed
    // TARGET section, and never as the greek/english pair of a context row.
    const occurrences = user.split(GOLDEN_CONTEXT.target.greek).length - 1;
    expect(occurrences).toBe(1);
    expect(user).toContain(`>>> TARGET line to translate:\n[${GOLDEN_CONTEXT.target.address}] ${GOLDEN_CONTEXT.target.greek}`);
  });

  it('Greek in the rendered prompt is Unicode, not Beta Code (no ASCII transliteration markers)', () => {
    const { user } = buildAssistPrompt(GOLDEN_CONTEXT);
    // Beta Code uses bare ASCII with markers like *, /, =, \ attached to letters;
    // spot-check that the actual Greek glyphs made it through untransformed.
    expect(user).toContain('τὸ γὰρ τί ἦν εἶναι');
    expect(user).toContain('ἐπανέλθωμεν');
  });

  it('empty-target-row: an unfilled target still renders its Greek only (no english field on target)', () => {
    const ctx = { ...GOLDEN_CONTEXT, target: { address: '1041a6', greek: '' } };
    const { user } = buildAssistPrompt(ctx);
    expect(user).toContain('>>> TARGET line to translate:\n[1041a6] ');
  });

  it('no context rows: omits the "Context" and "Continuing context" headers entirely', () => {
    const { user } = buildAssistPrompt(NO_CONTEXT);
    expect(user).not.toContain('Context (each line');
    expect(user).not.toContain('Continuing context');
    expect(user).toContain('>>> TARGET line to translate:');
  });

  it('renders whatever before/after arrays it is given, without trimming or re-selecting a window', () => {
    const wide = {
      ...GOLDEN_CONTEXT,
      before: Array.from({ length: 10 }, (_, i) => ({
        address: `100${i}a1`,
        greek: `λόγος ${i}`,
        english: null,
      })),
    };
    const { user } = buildAssistPrompt(wide);
    for (let i = 0; i < 10; i++) {
      expect(user).toContain(`λόγος ${i}`);
    }
  });
});

describe('buildAssistPrompt — modes', () => {
  it("absent mode defaults to 'translate' (back-compat): same system prompt as an explicit 'translate'", () => {
    const withoutMode = buildAssistPrompt(GOLDEN_CONTEXT);
    const explicitTranslate = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'translate' });
    expect(withoutMode.system).toBe(explicitTranslate.system);
    expect(withoutMode.user).toBe(explicitTranslate.user);
  });

  it("'translate' mode: line-locked system prompt + the TARGET-line-only instruction", () => {
    const { system, user } = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'translate' });
    expect(system).toContain('strictly line-locked');
    expect(system).toContain('1:1');
    expect(system).toContain('Output ONLY the English translation for the single');
    expect(user.trimEnd().endsWith('Provide the English translation for the TARGET line only.')).toBe(true);
  });

  it("'reference' mode: a natural/complete system prompt that is explicitly NOT line-locked", () => {
    const { system } = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'reference' });
    expect(system).toContain('natural, faithful, complete English translation');
    expect(system).toContain('not line-locked');
    expect(system).toContain('reference');
    // It must NOT carry the translate mode's strict 1:1 line-lock framing
    // (it may, and does, say it need NOT preserve 1:1 line correspondence).
    expect(system).not.toContain('strictly line-locked');
  });

  it("'reference' mode: its own final instruction line (a reference translation, not a fill)", () => {
    const { user } = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'reference' });
    expect(
      user
        .trimEnd()
        .endsWith('Provide a natural, complete English reference translation of the TARGET line only.'),
    ).toBe(true);
    expect(user).not.toContain('Provide the English translation for the TARGET line only.');
  });

  it('the user-prompt BODY (citation + context rows + bracketed target) is identical across modes', () => {
    const translate = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'translate' });
    const reference = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'reference' });
    // Everything up to the final instruction line is shared; only the last
    // line differs. Strip the trailing instruction and compare the bodies.
    const body = (u: string) => u.slice(0, u.lastIndexOf('\n'));
    expect(body(reference.user)).toBe(body(translate.user));
    expect(reference.user).toContain('>>> TARGET line to translate:');
    expect(reference.user).toContain('[1041a6] τὸ γὰρ τί ἦν εἶναι τοῦτό ἐστιν.');
  });

  it("'check' mode: acts SOLELY as a linguist, no interpretation, its own instruction", () => {
    const { system, user } = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'check' });
    expect(system).toContain('linguist');
    expect(system).toContain('fidelity');
    expect(system).toMatch(/do not offer interpretation/i);
    expect(system).toMatch(/philosophical or literary judgement/i);
    expect(system).not.toContain('strictly line-locked');
    expect(user.trimEnd()).toMatch(/As a linguist, diagnose the TARGET line’s English against its Greek/);
    expect(user).toContain('>>> TARGET line to check:');
  });

  it("'check' mode: sends the target's OWN English (the translation under review) + names the reference", () => {
    const ctx = {
      ...GOLDEN_CONTEXT,
      mode: 'check' as const,
      target: { ...GOLDEN_CONTEXT.target, english: 'For the essence of a thing is this.' },
    };
    const { user } = buildAssistPrompt(ctx);
    expect(user).toContain('Translator’s English under review: For the essence of a thing is this.');
    // "obviously tell it the reference" — author + work are named for check.
    expect(user).toContain(`Text under review: ${GOLDEN_CONTEXT.work.author}, ${GOLDEN_CONTEXT.work.title}.`);
  });

  it("'check' mode: a target with no English yet is marked, not omitted", () => {
    const { user } = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'check' });
    expect(user).toContain('Translator’s English under review: (no English yet)');
  });
});

describe('renderAssistContext', () => {
  it('is the single shared rendering helper used by both prompt.ts and clipboardPayload.ts', () => {
    const rendered = renderAssistContext(GOLDEN_CONTEXT);
    expect(rendered.beforeLines).toHaveLength(2);
    expect(rendered.afterLines).toHaveLength(2);
    expect(rendered.targetLine).toBe('[1041a6] τὸ γὰρ τί ἦν εἶναι τοῦτό ἐστιν.');
    expect(rendered.citationLine).toBe('Work: Metaphysics, Book Ζ, Chapter 17  (bekker-metaphysics citation)');
  });
});
