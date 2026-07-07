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
