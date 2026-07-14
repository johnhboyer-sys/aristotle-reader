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

  it("'ask' mode: a general classicist-assistant system prompt, NOT the strict 'check' linguist", () => {
    const { system } = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'ask', question: 'What case is τοῦτό?' });
    expect(system).toContain('classicist');
    // The open assistant answers the question; it is NOT the fidelity-only
    // linguist and does NOT forbid interpretation.
    expect(system).not.toContain('strictly line-locked');
    expect(system).not.toMatch(/checking a translation for fidelity/i);
    expect(system).not.toMatch(/do not offer interpretation/i);
    expect(system).toMatch(/answer the translator’s question/i);
  });

  it("'ask' mode: includes the question, the target English, names the reference, and its own instruction", () => {
    const ctx = {
      ...GOLDEN_CONTEXT,
      mode: 'ask' as const,
      question: 'Why is τοῦτό nominative here?',
      target: { ...GOLDEN_CONTEXT.target, english: 'For the essence of a thing is this.' },
    };
    const { user } = buildAssistPrompt(ctx);
    expect(user).toContain('The translator asks: Why is τοῦτό nominative here?');
    expect(user).toContain('Translator’s English (if any): For the essence of a thing is this.');
    // "obviously tell it the reference" — author + work are named for ask too.
    expect(user).toContain(`Text under review: ${GOLDEN_CONTEXT.work.author}, ${GOLDEN_CONTEXT.work.title}.`);
    expect(user.trimEnd()).toMatch(/Answer the translator’s question about the TARGET line\.$/);
    // The target line itself is rendered (Greek), and NOT under the 'to check' header.
    expect(user).toContain('>>> TARGET line:');
    expect(user).toContain('[1041a6] τὸ γὰρ τί ἦν εἶναι τοῦτό ἐστιν.');
  });

  it("'ask' mode: a target with no English yet renders (none yet), not omitted", () => {
    const { user } = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'ask', question: 'Parse the verb.' });
    expect(user).toContain('Translator’s English (if any): (none yet)');
  });

  it("'ask' mode: an absent question is handled without throwing and marked in the prompt", () => {
    const ctx = { ...GOLDEN_CONTEXT, mode: 'ask' as const };
    const { user } = buildAssistPrompt(ctx);
    expect(user).toContain('The translator asks: (no question given)');
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

// ── D8 §7 Phase E2: unit-aware + language-aware wordings ────────────────────

/** A German paragraph-doc free work: bookless, authorless, verbatim label. */
const GERMAN_WORK = {
  title: 'Vom Kriege',
  author: '',
  originalLanguage: 'greek' as const, // legacy field; `language` wins
  language: 'German',
  scheme: 'paragraph',
};

const PARAGRAPH_CONTEXT = {
  ...GOLDEN_CONTEXT,
  unit: 'paragraph' as const,
  work: GERMAN_WORK,
  book: { index: 1, label: '' },
  chapter: 1,
  target: { address: '¶2', greek: 'Der Krieg ist eine bloße Fortsetzung der Politik mit anderen Mitteln.' },
  before: [{ address: '¶1', greek: 'Wir denken die einzelnen Elemente unseres Gegenstandes.', english: 'We shall consider the single elements of our subject.' }],
  after: [{ address: '¶3', greek: 'Der Krieg ist also ein Akt der Gewalt.', english: null }],
};

const SENTENCE_CONTEXT = {
  ...PARAGRAPH_CONTEXT,
  unit: 'sentence' as const,
  target: { address: '¶2', greek: 'Der Krieg ist eine bloße Fortsetzung der Politik.' },
  enclosing: { address: '¶2', greek: 'Der Krieg ist eine bloße Fortsetzung der Politik. Er ist ein wahres politisches Instrument.' },
};

describe('buildAssistPrompt — unit wordings (golden)', () => {
  it("golden: 'paragraph' translate system prompt is paragraph-locked, translator persona for a non-classical language", () => {
    const { system } = buildAssistPrompt(PARAGRAPH_CONTEXT);
    expect(system).toBe(
      'You are helping a professional translator translate a work from its original language into English. The translation is strictly paragraph-locked: each source paragraph gets exactly one English paragraph, kept in 1:1 correspondence. Match the register, terminology, and style of the surrounding English shown below. Output ONLY the English translation for the single TARGET paragraph. Do not add quotation marks, commentary, notes, alternatives, or the original-language text. Do not translate the context paragraphs.',
    );
  });

  it("golden: 'paragraph' user prompt — bookless citation, paragraph context header, TARGET paragraph blocks", () => {
    const { user } = buildAssistPrompt(PARAGRAPH_CONTEXT);
    expect(user).toBe(
      [
        'Work: Vom Kriege  (paragraph citation)',
        '',
        'Context (each paragraph: [address] source — English draft, blank if untranslated):',
        '[¶1] Wir denken die einzelnen Elemente unseres Gegenstandes. — We shall consider the single elements of our subject.',
        '',
        '>>> TARGET paragraph to translate:',
        '[¶2] Der Krieg ist eine bloße Fortsetzung der Politik mit anderen Mitteln.',
        '',
        'Continuing context:',
        '[¶3] Der Krieg ist also ein Akt der Gewalt. — (untranslated)',
        '',
        'Provide the English translation for the TARGET paragraph only.',
      ].join('\n'),
    );
  });

  it("golden: 'sentence' user prompt renders the enclosing paragraph between context and target", () => {
    const { user } = buildAssistPrompt(SENTENCE_CONTEXT);
    expect(user).toBe(
      [
        'Work: Vom Kriege  (paragraph citation)',
        '',
        'Context (each paragraph: [address] source — English draft, blank if untranslated):',
        '[¶1] Wir denken die einzelnen Elemente unseres Gegenstandes. — We shall consider the single elements of our subject.',
        '',
        'The TARGET sentence is part of this paragraph:',
        '[¶2] Der Krieg ist eine bloße Fortsetzung der Politik. Er ist ein wahres politisches Instrument.',
        '',
        '>>> TARGET sentence to translate:',
        '[¶2] Der Krieg ist eine bloße Fortsetzung der Politik.',
        '',
        'Continuing context:',
        '[¶3] Der Krieg ist also ein Akt der Gewalt. — (untranslated)',
        '',
        'Provide the English translation for the TARGET sentence only.',
      ].join('\n'),
    );
  });

  it("'sentence' translate system prompt is sentence-locked with paragraph context nouns", () => {
    const { system } = buildAssistPrompt(SENTENCE_CONTEXT);
    expect(system).toContain('strictly sentence-locked');
    expect(system).toContain('each source sentence gets exactly one English sentence');
    expect(system).toContain('TARGET sentence');
    expect(system).toContain('Do not translate the context paragraphs.');
    // The mid-clause-break concession is line-lock-specific.
    expect(system).not.toContain('mid-clause');
  });

  it("an `enclosing` without unit 'sentence' is ignored (line/paragraph targets never render it)", () => {
    const { user } = buildAssistPrompt({ ...PARAGRAPH_CONTEXT, enclosing: SENTENCE_CONTEXT.enclosing });
    expect(user).not.toContain('is part of this paragraph');
  });

  it("'reference' mode speaks the unit too (not paragraph-locked; TARGET paragraph instruction)", () => {
    const { system, user } = buildAssistPrompt({ ...PARAGRAPH_CONTEXT, mode: 'reference' });
    expect(system).toContain('not paragraph-locked');
    expect(system).toContain('you need not preserve 1:1 paragraph correspondence');
    expect(user.trimEnd().endsWith('Provide a natural, complete English reference translation of the TARGET paragraph only.')).toBe(true);
  });
});

describe('buildAssistPrompt — source-language wording (golden)', () => {
  it("golden: 'check' names the free work's verbatim language (German), not Greek", () => {
    const { system, user } = buildAssistPrompt({ ...PARAGRAPH_CONTEXT, mode: 'check' });
    expect(system).toBe(
      'You are a linguist checking a translation for fidelity to its source text. Examine ONLY the TARGET paragraph: judge whether the translator’s English accurately and completely renders the German — morphology, case, tense, voice, mood, agreement, syntax, word order, lexical choice, and any omissions or additions. Cite the specific German word(s) at issue. Use the surrounding paragraphs only as grammatical and referential context; do not assess them. Report ONLY concrete linguistic observations, concisely. Do NOT offer interpretation, philosophical or literary judgement, stylistic preference, paraphrase, or your own translation. If the English faithfully renders the German, say so briefly.',
    );
    expect(user).toContain('>>> TARGET paragraph to check:');
    expect(user.trimEnd()).toMatch(/diagnose the TARGET paragraph’s English against its German\./);
    expect(user).not.toContain('Greek');
  });

  it("an UNKNOWN language (null) drops the language claim: 'the source text' / 'source word(s)'", () => {
    const ctx = { ...PARAGRAPH_CONTEXT, mode: 'check' as const, work: { ...GERMAN_WORK, language: null } };
    const { system, user } = buildAssistPrompt(ctx);
    expect(system).toContain('renders the source text');
    expect(system).toContain('Cite the specific source word(s) at issue');
    expect(system).not.toContain('Greek');
    expect(user).toContain('against its source text');
    expect(user).not.toContain('Greek');
  });

  it("a blank language string behaves like unknown", () => {
    const ctx = { ...PARAGRAPH_CONTEXT, work: { ...GERMAN_WORK, language: '   ' }, mode: 'ask' as const, question: 'Parse it.' };
    const { system } = buildAssistPrompt(ctx);
    expect(system).toContain('grounding your answer in the source text');
    expect(system).not.toContain('Greek');
  });

  it("'ask' persona: classicist for Greek/Latin, linguist otherwise; language named where known", () => {
    const german = buildAssistPrompt({ ...PARAGRAPH_CONTEXT, mode: 'ask', question: 'Case of Politik?' });
    expect(german.system).toContain('You are a knowledgeable linguist');
    expect(german.system).toContain('grounding your answer in the German of the TARGET paragraph');
    expect(german.system).toContain('cite the relevant German word(s)');
    const greek = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'ask', question: 'Case?' });
    expect(greek.system).toContain('You are a knowledgeable classicist');
  });

  it("a free work whose language IS 'Greek' keeps the classicist wording (verbatim label)", () => {
    const ctx = { ...GOLDEN_CONTEXT, work: { ...GOLDEN_CONTEXT.work, author: '', language: 'Greek' } };
    const { system } = buildAssistPrompt({ ...ctx, mode: 'check' });
    expect(system).toContain('renders the Greek');
    const t = buildAssistPrompt(ctx);
    expect(t.system).toContain('professional classicist');
  });

  it('corpus works (no language field) are BYTE-IDENTICAL to the shipped wording in every mode', () => {
    // GOLDEN_CONTEXT carries no `language`; the derived label is 'Greek'.
    // The inline-snapshot goldens above pin translate; spot-pin check + ask.
    const check = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'check' });
    expect(check.system).toContain('renders the Greek — morphology');
    expect(check.system).toContain('Cite the specific Greek word(s) at issue');
    const ask = buildAssistPrompt({ ...GOLDEN_CONTEXT, mode: 'ask', question: 'q' });
    expect(ask.system).toContain('knowledgeable classicist');
    expect(ask.system).toContain('in the Greek of the TARGET line');
  });
});

describe('renderAssistContext — bookless citation + enclosing', () => {
  it('an empty book label drops the "Book …, Chapter …" locus (free/bookless works)', () => {
    const rendered = renderAssistContext(PARAGRAPH_CONTEXT);
    expect(rendered.citationLine).toBe('Work: Vom Kriege  (paragraph citation)');
  });

  it('a labelled book keeps the shipped citation line verbatim', () => {
    const rendered = renderAssistContext(GOLDEN_CONTEXT);
    expect(rendered.citationLine).toBe('Work: Metaphysics, Book Ζ, Chapter 17  (bekker-metaphysics citation)');
  });

  it("enclosingLine is set ONLY for sentence-unit contexts that carry `enclosing`", () => {
    expect(renderAssistContext(SENTENCE_CONTEXT).enclosingLine).toBe(
      '[¶2] Der Krieg ist eine bloße Fortsetzung der Politik. Er ist ein wahres politisches Instrument.',
    );
    expect(renderAssistContext(PARAGRAPH_CONTEXT).enclosingLine).toBeNull();
    expect(renderAssistContext(GOLDEN_CONTEXT).enclosingLine).toBeNull();
  });
});
