/**
 * buildClipboardPayload — pure, flat paste-ready text for the clipboard
 * fallback (D4 §5a). Reuses `renderAssistContext` (prompt.ts) so there is
 * exactly one place that knows how to render an `AssistContext` as context
 * rows — this function just lays that out flat with one instruction line
 * up top, instead of a system/user split.
 *
 * Unit-aware (D8 §7): the instruction and the TRANSLATE header speak the
 * target's unit ('line' | 'paragraph' | 'sentence'); the 'line' rendering is
 * the shipped D4 string byte-identical (golden-tested). Sentence targets
 * carry their enclosing paragraph as reading context.
 */

import type { AssistContext } from './provider';
import { renderAssistContext, unitOf } from './prompt';

/** Pure: `AssistContext` in, a self-contained pasteable string out. */
export function buildClipboardPayload(ctx: AssistContext): string {
  const { beforeLines, targetLine, afterLines, enclosingLine } = renderAssistContext(ctx);
  const unit = unitOf(ctx);

  // Free works may have no author — "(…)" after the title would be noise.
  const author = ctx.work.author.trim();
  const of = author.length > 0 ? `${ctx.work.title} (${ctx.work.author})` : ctx.work.title;
  const capUnit = unit.charAt(0).toUpperCase() + unit.slice(1);
  const instruction =
    `Translate this single ${unit} of ${of} into English, ` +
    `matching the style of the surrounding draft. ${capUnit}-locked 1:1 (one English ${unit} per source ${unit}).`;

  const parts: string[] = [instruction, ''];

  if (beforeLines.length > 0) {
    parts.push('Context:');
    parts.push(...beforeLines);
    parts.push('');
  }

  if (enclosingLine !== null) {
    parts.push('It is part of this paragraph:');
    parts.push(enclosingLine);
    parts.push('');
  }

  parts.push(`TRANSLATE THIS ${unit.toUpperCase()}:`);
  parts.push(targetLine);

  if (afterLines.length > 0) {
    parts.push('');
    parts.push(...afterLines);
  }

  return parts.join('\n');
}
