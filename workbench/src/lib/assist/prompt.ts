/**
 * buildAssistPrompt — pure prompt construction (D4 §3c). No IO, no Tauri.
 *
 * The system prompt frames the task for a professional classicist context:
 * strict row-locked 1:1 unit discipline, match the surrounding draft's
 * register/terminology, output ONLY the target unit's English (no quotes,
 * no commentary, no source text), never translate the context rows.
 *
 * The user prompt renders whatever context rows the caller passed in
 * `ctx.before` / `ctx.after` — the decision of *how many* rows to include,
 * and whether to include already-drafted English at all, is made by the
 * caller (the UI layer) at context-assembly time, per John's 2026-07-03
 * decision that surrounding draft English is included by default. This
 * module just renders `english` when it is non-null.
 *
 * UNIT-AWARE WORDING (D8 §7): every prompt string is parametrized on
 * `ctx.unit` ('line' | 'paragraph' | 'sentence', absent = 'line') and on the
 * work's source-language label. The `'line'` + Greek renderings are BYTE
 * IDENTICAL to the shipped D4/D7 strings — the golden tests in
 * `__tests__/prompt.test.ts` pin them, so corpus works see zero prompt
 * drift. `'sentence'` targets additionally render `ctx.enclosing` (the
 * paragraph the sentence belongs to) as reading context.
 *
 * Addresses (`row.address`, `ctx.target.address`) are opaque raw strings
 * from the row model's citation scheme — never parsed here, only displayed.
 */

import type { AssistContext, AssistContextRow, AssistUnit } from './provider';

const UNTRANSLATED = '(untranslated)';

/** Render one context row as `[address] greek — english-or-(untranslated)`. */
function renderContextRow(row: AssistContextRow): string {
  const english = row.english === null ? UNTRANSLATED : row.english;
  return `[${row.address}] ${row.greek} — ${english}`;
}

/** The unit the prompt speaks in; absent = 'line' (back-compat). */
export function unitOf(ctx: AssistContext): AssistUnit {
  return ctx.unit ?? 'line';
}

/** The noun for CONTEXT rows: sentence-unit targets sit among whole
 * paragraphs (the ±window rows are paragraphs), so their context noun is
 * 'paragraph'; line and paragraph units match their own unit. */
export function contextNounOf(unit: AssistUnit): 'line' | 'paragraph' {
  return unit === 'line' ? 'line' : 'paragraph';
}

/**
 * The human source-language label the prompts may name, or null when the
 * language is unknown (prompts then speak of "the source text").
 * Absent `work.language` (every pre-D8 caller) derives from
 * `originalLanguage` — corpus works keep the shipped "Greek" wording.
 */
export function languageLabelOf(work: AssistContext['work']): string | null {
  if (work.language === undefined) {
    return work.originalLanguage === 'latin' ? 'Latin' : 'Greek';
  }
  const label = (work.language ?? '').trim();
  return label.length > 0 ? label : null;
}

/** "classicist" only when the source language IS classical (or unknown-but-
 * corpus never reaches here with anything else); other/unknown languages get
 * the neutral persona so a German document isn't framed as classics. */
function isClassical(label: string | null): boolean {
  return label !== null && ['greek', 'latin'].includes(label.toLowerCase());
}

/**
 * Shared context-rendering helper — the one source of truth for what
 * "context" means, reused by both the system/user prompt split
 * (`buildAssistPrompt`) and the flat clipboard payload
 * (`clipboardPayload.ts`).
 *
 * `enclosingLine` is non-null only for sentence-unit targets that carry
 * `ctx.enclosing` (the paragraph the target sentence belongs to); the two
 * consumers lay it out with their own labels.
 */
export function renderAssistContext(ctx: AssistContext): {
  citationLine: string;
  beforeLines: string[];
  targetLine: string;
  afterLines: string[];
  enclosingLine: string | null;
} {
  // Bookless works (free documents, Busse-style paragraph works) have an
  // empty book label — "Book , Chapter 1" is noise, so the locus drops out.
  const bookLabel = ctx.book.label.trim();
  const citationLine =
    bookLabel.length > 0
      ? `Work: ${ctx.work.title}, Book ${ctx.book.label}, Chapter ${ctx.chapter}  (${ctx.work.scheme} citation)`
      : `Work: ${ctx.work.title}  (${ctx.work.scheme} citation)`;
  const beforeLines = ctx.before.map(renderContextRow);
  const targetLine = `[${ctx.target.address}] ${ctx.target.greek}`;
  const afterLines = ctx.after.map(renderContextRow);
  const enclosingLine =
    unitOf(ctx) === 'sentence' && ctx.enclosing
      ? `[${ctx.enclosing.address}] ${ctx.enclosing.greek}`
      : null;
  return { citationLine, beforeLines, targetLine, afterLines, enclosingLine };
}

export interface AssistPrompt {
  system: string;
  user: string;
}

/**
 * `translate` mode — the first-pass translation that FILLS the manuscript's
 * English cell. Strict row-locked 1:1 unit discipline; output ONLY the target
 * unit's English. The 'line' rendering is the shipped D4 string, byte-exact.
 */
function translateSystemPrompt(unit: AssistUnit, lang: string | null): string {
  const c = contextNounOf(unit);
  const persona = isClassical(lang) ? 'classicist' : 'translator';
  // The mid-clause-break concession is a LINE fact (1:1 line lock forces
  // breaks mid-clause); paragraph/sentence locks don't.
  const lockTail =
    unit === 'line' ? ' even when English word order forces an awkward mid-clause break' : '';
  return [
    `You are helping a professional ${persona} translate a work from its`,
    `original language into English. The translation is strictly ${unit}-locked:`,
    `each source ${unit} gets exactly one English ${unit}, kept in 1:1`,
    `correspondence${lockTail}. Match the register, terminology, and style of the surrounding`,
    'English shown below. Output ONLY the English translation for the single',
    `TARGET ${unit}. Do not add quotation marks, commentary, notes,`,
    'alternatives, or the original-language text. Do not translate the',
    `context ${c}s.`,
  ].join(' ');
}

/**
 * `reference` mode — a natural, faithful, COMPLETE English translation of the
 * TARGET unit, shown to the translator FOR REFERENCE in the docked panel. It
 * never enters the manuscript, so it is NOT forced into the 1:1 unit lock:
 * render the target's full sense in fluent English. Still output only the
 * translation — no preamble, commentary, alternatives, or original-language
 * text — and never translate the context rows.
 */
function referenceSystemPrompt(unit: AssistUnit, lang: string | null): string {
  const c = contextNounOf(unit);
  const persona = isClassical(lang) ? 'classicist' : 'translator';
  return [
    `You are helping a professional ${persona} by providing a reference`,
    'translation. Produce a natural, faithful, complete English translation of',
    `the single TARGET ${unit}, rendering its full sense in fluent English. This`,
    'is for the translator’s reference only and is NOT inserted into the',
    `manuscript, so it is not ${unit}-locked: you need not preserve 1:1 ${unit}`,
    `correspondence. Use the surrounding ${c}s only as context for meaning.`,
    `Output ONLY the English translation for the TARGET ${unit}. Do not add`,
    'quotation marks, commentary, notes, alternatives, or the',
    `original-language text. Do not translate the context ${c}s.`,
  ].join(' ');
}

/**
 * `check` mode — the AI acts SOLELY as a linguist diagnosing the translator's
 * existing English against the source: accuracy, morphology, syntax, lexical
 * fidelity, omissions/additions — never interpretation, philosophy, literary
 * judgement, or its own translation. The target's own English IS sent (it is
 * what's under review) and several rows of source+English context surround it.
 * Output goes to the docked panel, not the cell. A known language is named
 * ("the Greek", "the German"); an unknown one becomes "the source text".
 */
function checkSystemPrompt(unit: AssistUnit, lang: string | null): string {
  const c = contextNounOf(unit);
  const langText = lang ?? 'source text';
  const langWord = lang ?? 'source';
  return [
    'You are a linguist checking a translation for fidelity to its source',
    `text. Examine ONLY the TARGET ${unit}: judge whether the translator’s`,
    `English accurately and completely renders the ${langText} — morphology, case,`,
    'tense, voice, mood, agreement, syntax, word order, lexical choice, and any',
    `omissions or additions. Cite the specific ${langWord} word(s) at issue. Use the`,
    `surrounding ${c}s only as grammatical and referential context; do not`,
    'assess them. Report ONLY concrete linguistic observations, concisely. Do',
    'NOT offer interpretation, philosophical or literary judgement, stylistic',
    'preference, paraphrase, or your own translation. If the English faithfully',
    `renders the ${langText}, say so briefly.`,
  ].join(' ');
}

/**
 * `ask` mode — a general, helpful assistant answering the translator's own
 * free-form question about the TARGET unit. Unlike `check` (a strict linguist
 * confined to fidelity diagnosis), this mode is open: it may discuss grammar,
 * lexicon, syntax, and meaning as the question asks, and may comment on the
 * translator's own English when that is what they ask about. Grounded in the
 * source text and the surrounding context; concise and specific, citing
 * source words where relevant. Output goes to a docked panel, not the cell.
 */
function askSystemPrompt(unit: AssistUnit, lang: string | null): string {
  const c = contextNounOf(unit);
  const persona = isClassical(lang) ? 'classicist' : 'linguist';
  const langText = lang ?? 'source text';
  const langWord = lang ?? 'source';
  return [
    `You are a knowledgeable ${persona} assisting a translator with a question`,
    `about a single TARGET ${unit} of the source text. Answer the translator’s`,
    `question directly, grounding your answer in the ${langText} of the TARGET ${unit}`,
    `and using the surrounding ${c}s as context for meaning and reference. You`,
    'may discuss grammar, morphology, syntax, lexicon, and meaning as the',
    'question requires, and you may comment on the translator’s own English when',
    `they ask about it. Be concise and specific; cite the relevant ${langWord} word(s)`,
    'where it helps. Answer only what is asked — no unsolicited full translation',
    'unless the question calls for one, and no preamble.',
  ].join(' ');
}

/** The mode-specific final instruction line appended to the user prompt. */
function instructionFor(mode: string, unit: AssistUnit, lang: string | null): string {
  const langText = lang ?? 'source text';
  const langWord = lang ?? 'source';
  switch (mode) {
    case 'check':
      return `As a linguist, diagnose the TARGET ${unit}’s English against its ${langText}. List only linguistic issues, citing the ${langWord} word(s); if it is accurate, say so briefly.`;
    case 'ask':
      return `Answer the translator’s question about the TARGET ${unit}.`;
    case 'reference':
      return `Provide a natural, complete English reference translation of the TARGET ${unit} only.`;
    default:
      return `Provide the English translation for the TARGET ${unit} only.`;
  }
}

/** Pure: `AssistContext` in, `{ system, user }` strings out. Branches on
 * `ctx.mode` (absent = 'translate') and `ctx.unit` (absent = 'line'); the
 * user-prompt body is shared, only the system prompt + final instruction
 * line differ per mode. */
export function buildAssistPrompt(ctx: AssistContext): AssistPrompt {
  const mode = ctx.mode ?? 'translate';
  const unit = unitOf(ctx);
  const lang = languageLabelOf(ctx.work);
  const c = contextNounOf(unit);
  const { citationLine, beforeLines, targetLine, afterLines, enclosingLine } =
    renderAssistContext(ctx);

  const userParts: string[] = [citationLine, ''];

  // Check + ask modes: name the text explicitly so the assistant knows exactly
  // what it is discussing (John: "obviously tell it the reference").
  if ((mode === 'check' || mode === 'ask') && ctx.work.author.trim().length > 0) {
    userParts.push(`Text under review: ${ctx.work.author}, ${ctx.work.title}.`, '');
  }

  if (beforeLines.length > 0) {
    userParts.push(`Context (each ${c}: [address] source — English draft, blank if untranslated):`);
    userParts.push(...beforeLines);
    userParts.push('');
  }

  // Sentence-unit targets: the paragraph the sentence belongs to, as reading
  // context (source only — the row's own draft is never sent this way).
  if (enclosingLine !== null) {
    userParts.push(`The TARGET ${unit} is part of this paragraph:`);
    userParts.push(enclosingLine);
    userParts.push('');
  }

  if (mode === 'check') {
    userParts.push(`>>> TARGET ${unit} to check:`);
    userParts.push(targetLine);
    const english =
      ctx.target.english == null || ctx.target.english.trim().length === 0
        ? '(no English yet)'
        : ctx.target.english;
    userParts.push(`Translator’s English under review: ${english}`);
  } else if (mode === 'ask') {
    userParts.push(`>>> TARGET ${unit}:`);
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
    userParts.push(`>>> TARGET ${unit} to translate:`);
    userParts.push(targetLine);
  }

  if (afterLines.length > 0) {
    userParts.push('');
    userParts.push('Continuing context:');
    userParts.push(...afterLines);
  }

  userParts.push('');
  userParts.push(instructionFor(mode, unit, lang));

  const system =
    mode === 'check'
      ? checkSystemPrompt(unit, lang)
      : mode === 'ask'
        ? askSystemPrompt(unit, lang)
        : mode === 'reference'
          ? referenceSystemPrompt(unit, lang)
          : translateSystemPrompt(unit, lang);
  return { system, user: userParts.join('\n') };
}
