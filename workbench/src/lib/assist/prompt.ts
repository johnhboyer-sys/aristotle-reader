/**
 * buildAssistPrompt — pure prompt construction (D4 §3c). No IO, no Tauri.
 *
 * The system prompt frames the task for a professional classicist context:
 * strict row-locked 1:1 line discipline, match the surrounding draft's
 * register/terminology, output ONLY the target line's English (no quotes,
 * no commentary, no Greek), never translate the context lines.
 *
 * The user prompt renders whatever context rows the caller passed in
 * `ctx.before` / `ctx.after` — the decision of *how many* rows to include,
 * and whether to include already-drafted English at all, is made by the
 * caller (the UI layer) at context-assembly time, per John's 2026-07-03
 * decision that surrounding draft English is included by default. This
 * module just renders `english` when it is non-null.
 *
 * Addresses (`row.address`, `ctx.target.address`) are opaque raw strings
 * from the row model's citation scheme — never parsed here, only displayed.
 */

import type { AssistContext, AssistContextRow } from './provider';

const UNTRANSLATED = '(untranslated)';

/** Render one context row as `[address] greek — english-or-(untranslated)`. */
function renderContextRow(row: AssistContextRow): string {
  const english = row.english === null ? UNTRANSLATED : row.english;
  return `[${row.address}] ${row.greek} — ${english}`;
}

/**
 * Shared context-rendering helper — the one source of truth for what
 * "context" means, reused by both the system/user prompt split
 * (`buildAssistPrompt`) and the flat clipboard payload
 * (`clipboardPayload.ts`).
 */
export function renderAssistContext(ctx: AssistContext): {
  citationLine: string;
  beforeLines: string[];
  targetLine: string;
  afterLines: string[];
} {
  const citationLine = `Work: ${ctx.work.title}, Book ${ctx.book.label}, Chapter ${ctx.chapter}  (${ctx.work.scheme} citation)`;
  const beforeLines = ctx.before.map(renderContextRow);
  const targetLine = `[${ctx.target.address}] ${ctx.target.greek}`;
  const afterLines = ctx.after.map(renderContextRow);
  return { citationLine, beforeLines, targetLine, afterLines };
}

export interface AssistPrompt {
  system: string;
  user: string;
}

const SYSTEM_PROMPT = [
  'You are helping a professional classicist translate a work from its',
  'original language into English. The translation is strictly line-locked:',
  'each source line gets exactly one English line, kept in 1:1',
  'correspondence even when English word order forces an awkward mid-clause',
  'break. Match the register, terminology, and style of the surrounding',
  'English shown below. Output ONLY the English translation for the single',
  'TARGET line. Do not add quotation marks, commentary, notes,',
  'alternatives, or the original-language text. Do not translate the',
  'context lines.',
].join(' ');

/** Pure: `AssistContext` in, `{ system, user }` strings out. */
export function buildAssistPrompt(ctx: AssistContext): AssistPrompt {
  const { citationLine, beforeLines, targetLine, afterLines } = renderAssistContext(ctx);

  const userParts: string[] = [citationLine, ''];

  if (beforeLines.length > 0) {
    userParts.push('Context (each line: [address] source — English draft, blank if untranslated):');
    userParts.push(...beforeLines);
    userParts.push('');
  }

  userParts.push('>>> TARGET line to translate:');
  userParts.push(targetLine);

  if (afterLines.length > 0) {
    userParts.push('');
    userParts.push('Continuing context:');
    userParts.push(...afterLines);
  }

  userParts.push('');
  userParts.push('Provide the English translation for the TARGET line only.');

  return { system: SYSTEM_PROMPT, user: userParts.join('\n') };
}
