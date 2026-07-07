/**
 * buildClipboardPayload — pure, flat paste-ready text for the clipboard
 * fallback (D4 §5a). Reuses `renderAssistContext` (prompt.ts) so there is
 * exactly one place that knows how to render an `AssistContext` as context
 * rows — this function just lays that out flat with one instruction line
 * up top, instead of a system/user split.
 */

import type { AssistContext } from './provider';
import { renderAssistContext } from './prompt';

/** Pure: `AssistContext` in, a self-contained pasteable string out. */
export function buildClipboardPayload(ctx: AssistContext): string {
  const { beforeLines, targetLine, afterLines } = renderAssistContext(ctx);

  const instruction =
    `Translate this single line of ${ctx.work.title} (${ctx.work.author}) into English, ` +
    'matching the style of the surrounding draft. Line-locked 1:1 (one English line per source line).';

  const parts: string[] = [instruction, ''];

  if (beforeLines.length > 0) {
    parts.push('Context:');
    parts.push(...beforeLines);
    parts.push('');
  }

  parts.push('TRANSLATE THIS LINE:');
  parts.push(targetLine);

  if (afterLines.length > 0) {
    parts.push('');
    parts.push(...afterLines);
  }

  return parts.join('\n');
}
