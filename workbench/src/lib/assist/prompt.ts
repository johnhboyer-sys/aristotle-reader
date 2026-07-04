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

/**
 * `translate` mode — the first-pass translation that FILLS the manuscript's
 * English cell. Strict row-locked 1:1 line discipline; output ONLY the target
 * line's English.
 */
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

/**
 * `reference` mode — a natural, faithful, COMPLETE English translation of the
 * TARGET line, shown to the translator FOR REFERENCE in a floating popup. It
 * never enters the manuscript, so it is NOT forced into 1:1 line-lock: render
 * the target's full sense in fluent English. Still output only the
 * translation — no preamble, commentary, alternatives, or original-language
 * text — and never translate the context lines.
 */
const REFERENCE_SYSTEM_PROMPT = [
  'You are helping a professional classicist by providing a reference',
  'translation. Produce a natural, faithful, complete English translation of',
  'the single TARGET line, rendering its full sense in fluent English. This',
  'is for the translator’s reference only and is NOT inserted into the',
  'manuscript, so it is not line-locked: you need not preserve 1:1 line',
  'correspondence. Use the surrounding lines only as context for meaning.',
  'Output ONLY the English translation for the TARGET line. Do not add',
  'quotation marks, commentary, notes, alternatives, or the',
  'original-language text. Do not translate the context lines.',
].join(' ');

/**
 * `check` mode — the AI acts SOLELY as a linguist diagnosing the translator's
 * existing English against the Greek: accuracy, morphology, syntax, lexical
 * fidelity, omissions/additions — never interpretation, philosophy, literary
 * judgement, or its own translation. The target's own English IS sent (it is
 * what's under review) and several lines of Greek+English context surround it.
 * Output goes to a floating popup, not the cell.
 */
const CHECK_SYSTEM_PROMPT = [
  'You are a linguist checking a translation for fidelity to its source',
  'text. Examine ONLY the TARGET line: judge whether the translator’s',
  'English accurately and completely renders the Greek — morphology, case,',
  'tense, voice, mood, agreement, syntax, word order, lexical choice, and any',
  'omissions or additions. Cite the specific Greek word(s) at issue. Use the',
  'surrounding lines only as grammatical and referential context; do not',
  'assess them. Report ONLY concrete linguistic observations, concisely. Do',
  'NOT offer interpretation, philosophical or literary judgement, stylistic',
  'preference, paraphrase, or your own translation. If the English faithfully',
  'renders the Greek, say so briefly.',
].join(' ');

/**
 * `ask` mode — a general, helpful CLASSICIST-ASSISTANT answering the
 * translator's own free-form question about the TARGET line. Unlike `check`
 * (a strict linguist confined to fidelity diagnosis), this mode is open: it may
 * discuss grammar, lexicon, syntax, and meaning as the question asks, and may
 * comment on the translator's own English when that is what they ask about.
 * Grounded in the Greek and the surrounding context; concise and specific,
 * citing Greek words where relevant. Output goes to a docked panel, not the
 * cell.
 */
const ASK_SYSTEM_PROMPT = [
  'You are a knowledgeable classicist assisting a translator with a question',
  'about a single TARGET line of the source text. Answer the translator’s',
  'question directly, grounding your answer in the Greek of the TARGET line',
  'and using the surrounding lines as context for meaning and reference. You',
  'may discuss grammar, morphology, syntax, lexicon, and meaning as the',
  'question requires, and you may comment on the translator’s own English when',
  'they ask about it. Be concise and specific; cite the relevant Greek word(s)',
  'where it helps. Answer only what is asked — no unsolicited full translation',
  'unless the question calls for one, and no preamble.',
].join(' ');

/** The mode-specific final instruction line appended to the user prompt. */
const TRANSLATE_INSTRUCTION = 'Provide the English translation for the TARGET line only.';
const REFERENCE_INSTRUCTION =
  'Provide a natural, complete English reference translation of the TARGET line only.';
const CHECK_INSTRUCTION =
  'As a linguist, diagnose the TARGET line’s English against its Greek. List only linguistic issues, citing the Greek word(s); if it is accurate, say so briefly.';
const ASK_INSTRUCTION = 'Answer the translator’s question about the TARGET line.';

/** Pure: `AssistContext` in, `{ system, user }` strings out. Branches on
 * `ctx.mode` (absent = 'translate'); the user-prompt body is shared, only the
 * system prompt + final instruction line differ. */
export function buildAssistPrompt(ctx: AssistContext): AssistPrompt {
  const mode = ctx.mode ?? 'translate';
  const { citationLine, beforeLines, targetLine, afterLines } = renderAssistContext(ctx);

  const userParts: string[] = [citationLine, ''];

  // Check + ask modes: name the text explicitly so the assistant knows exactly
  // what it is discussing (John: "obviously tell it the reference").
  if ((mode === 'check' || mode === 'ask') && ctx.work.author.trim().length > 0) {
    userParts.push(`Text under review: ${ctx.work.author}, ${ctx.work.title}.`, '');
  }

  if (beforeLines.length > 0) {
    userParts.push('Context (each line: [address] source — English draft, blank if untranslated):');
    userParts.push(...beforeLines);
    userParts.push('');
  }

  if (mode === 'check') {
    userParts.push('>>> TARGET line to check:');
    userParts.push(targetLine);
    const english =
      ctx.target.english == null || ctx.target.english.trim().length === 0
        ? '(no English yet)'
        : ctx.target.english;
    userParts.push(`Translator’s English under review: ${english}`);
  } else if (mode === 'ask') {
    userParts.push('>>> TARGET line:');
    userParts.push(targetLine);
    const english =
      ctx.target.english == null || ctx.target.english.trim().length === 0
        ? '(none yet)'
        : ctx.target.english;
    userParts.push(`Translator’s English (if any): ${english}`);
    const question =
      ctx.question == null || ctx.question.trim().length === 0 ? '(no question given)' : ctx.question.trim();
    userParts.push(`The translator asks: ${question}`);
  } else {
    userParts.push('>>> TARGET line to translate:');
    userParts.push(targetLine);
  }

  if (afterLines.length > 0) {
    userParts.push('');
    userParts.push('Continuing context:');
    userParts.push(...afterLines);
  }

  userParts.push('');
  userParts.push(
    mode === 'check'
      ? CHECK_INSTRUCTION
      : mode === 'ask'
        ? ASK_INSTRUCTION
        : mode === 'reference'
          ? REFERENCE_INSTRUCTION
          : TRANSLATE_INSTRUCTION,
  );

  const system =
    mode === 'check'
      ? CHECK_SYSTEM_PROMPT
      : mode === 'ask'
        ? ASK_SYSTEM_PROMPT
        : mode === 'reference'
          ? REFERENCE_SYSTEM_PROMPT
          : SYSTEM_PROMPT;
  return { system, user: userParts.join('\n') };
}
