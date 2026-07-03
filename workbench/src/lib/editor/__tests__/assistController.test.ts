// AI-assist UI slice (design doc D4): context assembly (±6 clamping, draft
// extraction, target exclusion), the ONE insert transaction, the request
// controller (one in-flight, stale results never render, CLI-error →
// clipboard fallback) and the Tauri provider-resolution flow — all pure or
// DI'd, so everything runs headless under the node environment with
// FakeProvider. DOM-only behavior (glyph visibility, popover anchoring,
// Esc) is pinned by source-scan tests at the bottom (copyCitation.test.ts
// precedent) and verified live in the browser harness.
import { beforeAll, describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from '@tiptap/pm/state';

import {
  ASSIST_CONTEXT_WINDOW,
  AssistController,
  buildAssistContext,
  buildInsertTransaction,
  plainRowText,
  resolveTauriAssistProvider,
  sanitizeSuggestion,
} from '../assistController';
import type { AssistContextArgs, AssistUiState, TauriAssistDeps } from '../assistController';
import { parseRow } from '../serialize';
import { rowSchema } from '../schema';
import { FakeProvider, fakeClipboard, fakeSuggestion } from '../../assist/fakeProvider';
import {
  COPY_FAILED_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  NOT_FOUND_MESSAGE,
  UNAUTH_MESSAGE,
} from '../../assist/messages';
import type { AssistContext } from '../../assist/provider';
import type { AssistSuggestResponse, InvokeFn } from '../../assist/cliProvider';
import type { WorkbenchSettings } from '../../settings';

// ── shared fixtures ─────────────────────────────────────────────────────────

const WORK: AssistContext['work'] = {
  title: 'Metaphysics',
  author: 'Aristotle',
  originalLanguage: 'greek',
  scheme: 'bekker-metaphysics',
};
const BOOK = { index: 7, label: 'Ζ' };

/** 30 rows; even rows carry a draft, odd rows are untranslated. */
function contextArgs(
  targetIndex: number,
  overrides: Partial<AssistContextArgs> = {},
): { args: AssistContextArgs; draftCalls: number[] } {
  const draftCalls: number[] = [];
  const args: AssistContextArgs = {
    rowCount: 30,
    rowAt: (i) => ({ address: `1041a${i + 1}`, greek: `γραμμή ${i}` }),
    draftAt: (i) => {
      draftCalls.push(i);
      return i % 2 === 0 ? `draft ${i}` : null;
    },
    targetIndex,
    work: WORK,
    book: BOOK,
    chapter: 17,
    ...overrides,
  };
  return { args, draftCalls };
}

function smallCtx(): AssistContext {
  return buildAssistContext(contextArgs(10).args);
}

// ── plainRowText ────────────────────────────────────────────────────────────

describe('plainRowText', () => {
  it('strips markup and footnote markers to plain text', () => {
    const doc = parseRow('**bold** *it* {grc:τὸ τί} {^3:anchored}{^3:} tail');
    expect(plainRowText(doc)).toBe('bold it τὸ τί anchored tail');
  });

  it('empty row → null (renders as (untranslated))', () => {
    expect(plainRowText(parseRow(''))).toBeNull();
  });

  it('whitespace-only row → null', () => {
    expect(plainRowText(parseRow('   '))).toBeNull();
  });
});

// ── buildAssistContext ──────────────────────────────────────────────────────

describe('buildAssistContext', () => {
  it('mid-chapter target: exactly ±6 rows, before oldest→newest, after nearest-first', () => {
    const ctx = buildAssistContext(contextArgs(10).args);
    expect(ASSIST_CONTEXT_WINDOW).toBe(6);
    expect(ctx.before.map((r) => r.address)).toEqual([
      '1041a5',
      '1041a6',
      '1041a7',
      '1041a8',
      '1041a9',
      '1041a10',
    ]);
    expect(ctx.after.map((r) => r.address)).toEqual([
      '1041a12',
      '1041a13',
      '1041a14',
      '1041a15',
      '1041a16',
      '1041a17',
    ]);
    expect(ctx.target).toEqual({ address: '1041a11', greek: 'γραμμή 10' });
  });

  it('clamps at the chapter start', () => {
    const ctx = buildAssistContext(contextArgs(2).args);
    expect(ctx.before.map((r) => r.address)).toEqual(['1041a1', '1041a2']);
    expect(ctx.after).toHaveLength(6);
  });

  it('first row: no before context at all', () => {
    expect(buildAssistContext(contextArgs(0).args).before).toEqual([]);
  });

  it('clamps at the chapter end', () => {
    const ctx = buildAssistContext(contextArgs(27).args);
    expect(ctx.after.map((r) => r.address)).toEqual(['1041a29', '1041a30']);
    expect(buildAssistContext(contextArgs(29).args).after).toEqual([]);
  });

  it('drafted rows carry their English; untranslated rows are null', () => {
    const ctx = buildAssistContext(contextArgs(10).args);
    // before rows are indices 4..9: even → draft, odd → null.
    expect(ctx.before.map((r) => r.english)).toEqual([
      'draft 4',
      null,
      'draft 6',
      null,
      'draft 8',
      null,
    ]);
  });

  it('NEVER reads the target row draft (structural exclusion)', () => {
    const { args, draftCalls } = contextArgs(10);
    const ctx = buildAssistContext(args);
    expect(draftCalls).not.toContain(10);
    expect(draftCalls).toHaveLength(12); // exactly the 12 context rows
    expect('english' in ctx.target).toBe(false);
  });

  it('includeDraft: false renders every context row untranslated without reading drafts', () => {
    const { args, draftCalls } = contextArgs(10, { includeDraft: false });
    const ctx = buildAssistContext(args);
    expect(draftCalls).toEqual([]);
    expect(ctx.before.every((r) => r.english === null)).toBe(true);
    expect(ctx.after.every((r) => r.english === null)).toBe(true);
  });

  it('passes work/book/chapter through untouched', () => {
    const ctx = buildAssistContext(contextArgs(10).args);
    expect(ctx.work).toEqual(WORK);
    expect(ctx.book).toEqual(BOOK);
    expect(ctx.chapter).toBe(17);
  });
});

// ── sanitizeSuggestion + buildInsertTransaction ─────────────────────────────

describe('sanitizeSuggestion', () => {
  it('collapses newlines and runs of whitespace to single spaces, trims', () => {
    expect(sanitizeSuggestion('  one\ntwo\r\n  three  ')).toBe('one two three');
  });
});

describe('buildInsertTransaction', () => {
  function stateOf(markup: string, anchor?: number, head?: number): EditorState {
    const doc = parseRow(markup);
    const state = EditorState.create({ doc });
    if (anchor === undefined) return state;
    return state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, anchor, head ?? anchor)),
    );
  }

  it('empty row: the text becomes the row content, caret at its end', () => {
    const state = stateOf('');
    const tr = buildInsertTransaction(state, 'And what substance is')!;
    const next = state.apply(tr);
    expect(next.doc.textContent).toBe('And what substance is');
    expect(next.selection.head).toBe('And what substance is'.length);
    expect(tr.getMeta('noCoalesce')).toBe(true);
  });

  it('selection: replaced by the suggestion', () => {
    const state = stateOf('hello world', 6, 11);
    const next = state.apply(buildInsertTransaction(state, 'earth')!);
    expect(next.doc.textContent).toBe('hello earth');
    expect(next.selection.head).toBe(11);
  });

  it('caret, no selection: inserted at the caret', () => {
    const state = stateOf('ab', 1);
    const next = state.apply(buildInsertTransaction(state, 'X')!);
    expect(next.doc.textContent).toBe('aXb');
    expect(next.selection.head).toBe(2);
  });

  it('goes through as one undoable unit (noCoalesce meta on every shape)', () => {
    const state = stateOf('ab', 1);
    expect(buildInsertTransaction(state, 'X')!.getMeta('noCoalesce')).toBe(true);
  });

  it('inserts with DEFAULT marks even when Greek-mode stored marks are active', () => {
    const base = stateOf('');
    const state = base.apply(base.tr.setStoredMarks([rowSchema.marks.greek.create()]));
    const next = state.apply(buildInsertTransaction(state, 'plain english')!);
    next.doc.descendants((node) => {
      if (node.isText) expect(node.marks).toHaveLength(0);
      return true;
    });
  });

  it('inserting inside a marked run does not inherit the mark', () => {
    const state = stateOf('**bold**', 2);
    const next = state.apply(buildInsertTransaction(state, 'X')!);
    let sawPlainX = false;
    next.doc.descendants((node) => {
      if (node.isText && node.text === 'X') {
        expect(node.marks).toHaveLength(0);
        sawPlainX = true;
      }
      return true;
    });
    expect(sawPlainX).toBe(true);
  });

  it('multi-line model output collapses to one Bekker line (\\n unrepresentable)', () => {
    const state = stateOf('');
    const next = state.apply(buildInsertTransaction(state, 'line one\nline two\n')!);
    expect(next.doc.textContent).toBe('line one line two');
  });

  it('empty or whitespace-only suggestion → null (nothing to dispatch)', () => {
    expect(buildInsertTransaction(stateOf(''), '')).toBeNull();
    expect(buildInsertTransaction(stateOf(''), ' \n ')).toBeNull();
  });
});

// ── AssistController orchestration ──────────────────────────────────────────

describe('AssistController', () => {
  function harness(opts: {
    providers: (FakeProvider | (() => Promise<never>))[];
    copyOk?: boolean;
  }) {
    const states: AssistUiState[] = [];
    const copies: AssistContext[] = [];
    let call = 0;
    const ctl = new AssistController({
      getProvider: () => {
        const p = opts.providers[Math.min(call++, opts.providers.length - 1)];
        return typeof p === 'function' ? p() : Promise.resolve(p);
      },
      copyPayload: async (ctx) => {
        copies.push(ctx);
        return opts.copyOk ?? true;
      },
      onState: (s) => states.push(s),
    });
    return { ctl, states, copies };
  }

  it('suggestion path: thinking → sanitized suggestion; no clipboard involved', async () => {
    const { ctl, states, copies } = harness({ providers: [fakeSuggestion('  hello\nworld ')] });
    await ctl.request(smallCtx());
    expect(states).toEqual([
      { kind: 'thinking' },
      { kind: 'suggestion', text: 'hello world' },
    ]);
    expect(copies).toHaveLength(0);
  });

  it('CLI error → ALSO copies the payload, shows the vetted CLI sentence', async () => {
    const provider = new FakeProvider({ id: 'cli', result: { kind: 'error', message: UNAUTH_MESSAGE } });
    const { ctl, states, copies } = harness({ providers: [provider] });
    const ctx = smallCtx();
    await ctl.request(ctx);
    expect(copies).toEqual([ctx]); // the d4 rule: worst case leaves the payload on the clipboard
    expect(states.at(-1)).toEqual({ kind: 'message', text: UNAUTH_MESSAGE });
  });

  it('CLI error whose fallback copy ALSO fails → COPY_FAILED sentence', async () => {
    const provider = new FakeProvider({ id: 'cli', result: { kind: 'error', message: GENERIC_ERROR_MESSAGE } });
    const { ctl, states } = harness({ providers: [provider], copyOk: false });
    await ctl.request(smallCtx());
    expect(states.at(-1)).toEqual({ kind: 'message', text: COPY_FAILED_MESSAGE });
  });

  it('CLI returning empty text is the error path (copy fallback + generic sentence)', async () => {
    const provider = new FakeProvider({ id: 'cli', result: { kind: 'suggestion', text: '  \n ' } });
    const { ctl, states, copies } = harness({ providers: [provider] });
    await ctl.request(smallCtx());
    expect(copies).toHaveLength(1);
    expect(states.at(-1)).toEqual({ kind: 'message', text: GENERIC_ERROR_MESSAGE });
  });

  it('clipboard provider result: message only, no second copy', async () => {
    const { ctl, states, copies } = harness({ providers: [fakeClipboard(NOT_FOUND_MESSAGE)] });
    await ctl.request(smallCtx());
    expect(states.at(-1)).toEqual({ kind: 'message', text: NOT_FOUND_MESSAGE });
    expect(copies).toHaveLength(0);
  });

  it('non-CLI provider error: message shown, clipboard fallback NOT run again', async () => {
    const provider = new FakeProvider({
      id: 'clipboard',
      result: { kind: 'error', message: COPY_FAILED_MESSAGE },
    });
    const { ctl, states, copies } = harness({ providers: [provider] });
    await ctl.request(smallCtx());
    expect(states.at(-1)).toEqual({ kind: 'message', text: COPY_FAILED_MESSAGE });
    expect(copies).toHaveLength(0);
  });

  it('a new request aborts the prior; the stale result NEVER renders', async () => {
    const slow = fakeSuggestion('first (stale)', 50);
    const fast = fakeSuggestion('second', 0);
    const { ctl, states } = harness({ providers: [slow, fast] });
    const p1 = ctl.request(smallCtx());
    const p2 = ctl.request(smallCtx());
    await Promise.all([p1, p2]);
    await new Promise((r) => setTimeout(r, 80)); // let the slow timer window pass
    expect(states.filter((s) => s.kind === 'suggestion')).toEqual([
      { kind: 'suggestion', text: 'second' },
    ]);
    expect(states).toHaveLength(3); // thinking, thinking, suggestion
  });

  it('cancel during Thinking…: no state ever emitted for that request', async () => {
    const { ctl, states } = harness({ providers: [fakeSuggestion('too late', 50)] });
    const p = ctl.request(smallCtx());
    ctl.cancel();
    await p;
    expect(states).toEqual([{ kind: 'thinking' }]); // dismissal itself is the caller's UI state
  });

  it('getProvider throwing still leaves the payload on the clipboard (generic sentence)', async () => {
    const { ctl, states, copies } = harness({
      providers: [() => Promise.reject(new Error('resolver exploded'))],
    });
    await ctl.request(smallCtx());
    expect(copies).toHaveLength(1);
    expect(states.at(-1)).toEqual({ kind: 'message', text: GENERIC_ERROR_MESSAGE });
  });
});

// ── resolveTauriAssistProvider ──────────────────────────────────────────────

describe('resolveTauriAssistProvider', () => {
  function tauriDeps(overrides: Partial<TauriAssistDeps> = {}) {
    const calls = {
      updates: [] as Partial<WorkbenchSettings>[],
      exists: [] as string[],
      clipboard: [] as string[],
      suggests: [] as { claudePath: string }[],
    };
    const deps: TauriAssistDeps = {
      loadSettings: async () => ({}),
      updateSettings: async (patch) => {
        calls.updates.push(patch);
        return {};
      },
      exists: async (p) => {
        calls.exists.push(p);
        return false;
      },
      home: async () => '/Users/j/', // trailing slash on purpose
      invokeSuggest: (async (_cmd, args) => {
        calls.suggests.push({ claudePath: args.claudePath });
        return { ok: true, text: 'ok' } as AssistSuggestResponse;
      }) as InvokeFn,
      invokeResolve: async () => null,
      writeClipboard: async (t) => {
        calls.clipboard.push(t);
      },
      ...overrides,
    };
    return { deps, calls };
  }

  const signal = () => new AbortController().signal;

  it('cached cliPath that still exists → CliProvider on that path, settings untouched', async () => {
    const { deps, calls } = tauriDeps({
      loadSettings: async () => ({ assist: { cliPath: '/opt/claude', cliState: 'ok' } }),
      exists: async (p) => p === '/opt/claude',
    });
    const provider = await resolveTauriAssistProvider(deps);
    expect(provider.id).toBe('cli');
    await provider.suggest(smallCtx(), signal());
    expect(calls.suggests).toEqual([{ claudePath: '/opt/claude' }]);
    expect(calls.updates).toEqual([]);
  });

  it('cached path that stopped existing → ladder re-resolves and re-caches', async () => {
    const { deps, calls } = tauriDeps({
      loadSettings: async () => ({ assist: { cliPath: '/gone/claude', cliState: 'ok' } }),
      exists: async (p) => p === '/Users/j/.claude/local/claude',
    });
    const provider = await resolveTauriAssistProvider(deps);
    expect(provider.id).toBe('cli');
    await provider.suggest(smallCtx(), signal());
    // trailing slash on $HOME must not double up
    expect(calls.suggests).toEqual([{ claudePath: '/Users/j/.claude/local/claude' }]);
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].assist).toMatchObject({
      cliPath: '/Users/j/.claude/local/claude',
      cliState: 'ok',
    });
  });

  it('nothing found anywhere → caches not-found, returns the clipboard floor', async () => {
    const { deps, calls } = tauriDeps();
    const provider = await resolveTauriAssistProvider(deps);
    expect(provider.id).toBe('clipboard');
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].assist).toMatchObject({ cliState: 'not-found' });
    expect(calls.updates[0].assist?.cliPath).toBeUndefined();
    const result = await provider.suggest(smallCtx(), signal());
    expect(result).toEqual({ kind: 'clipboard', message: NOT_FOUND_MESSAGE });
    expect(calls.clipboard).toHaveLength(1);
    expect(calls.clipboard[0]).toContain('γραμμή 10'); // the target line rode along
  });

  it('the Rust login-shell rung (invokeResolve) is honored when the fixed ladder misses', async () => {
    const { deps, calls } = tauriDeps({
      invokeResolve: async () => '/weird/place/claude',
      exists: async (p) => p === '/weird/place/claude',
    });
    const provider = await resolveTauriAssistProvider(deps);
    expect(provider.id).toBe('cli');
    await provider.suggest(smallCtx(), signal());
    expect(calls.suggests).toEqual([{ claudePath: '/weird/place/claude' }]);
  });
});

// ── wiring source scans (copyCitation.test.ts precedent) ───────────────────
// DOM behavior (glyph visibility, popover anchoring, Esc, focus handling)
// can't run headless; these pin the load-bearing wiring so it can't silently
// disappear. Live verification happens in the browser harness.

describe('assist wiring stays intact (source scan)', () => {
  let chapterSource = '';
  let rowSource = '';
  let popoverSource = '';
  let keymapSource = '';

  beforeAll(async () => {
    // Computed specifier: no @types/node in this project (see the same trick
    // in copyCitation.test.ts).
    const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
      readFileSync(path: string, encoding: 'utf-8'): string;
    };
    const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
      fileURLToPath(url: URL): string;
    };
    const read = (rel: string) =>
      fs.readFileSync(nodeUrl.fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
    chapterSource = read('../ChapterEditor.svelte');
    rowSource = read('../RowEditor.svelte');
    popoverSource = read('../../../components/AssistPopover.svelte');
    keymapSource = read('../plugins/rowKeymap.ts');
  });

  it('⌘⏎ is bound in rowKeymap to requestAssist (not the old advance)', () => {
    const start = keymapSource.indexOf("'Mod-Enter'");
    expect(start).toBeGreaterThan(-1);
    const binding = keymapSource.slice(start, keymapSource.indexOf('},', start));
    expect(binding).toContain('ctx.requestAssist()');
    expect(binding).not.toContain('advance');
  });

  it('ChapterEditor wires requestAssist into every cell context and the host (keyed row+segment, D6)', () => {
    expect(chapterSource).toContain('requestAssist: () => invokeAssist(row, segment)');
    expect(chapterSource).toContain('assistStateFor: (row, segment) =>');
    expect(chapterSource).toContain('insertSuggestion: (row, segment, text) => insertSuggestionIntoRow(row, segment, text)');
  });

  it('the insert path is the row view dispatch — never a direct model write', () => {
    const start = chapterSource.indexOf('function insertSuggestionIntoRow(');
    expect(start).toBeGreaterThan(-1);
    const body = chapterSource.slice(start, chapterSource.indexOf('\n  }', start));
    expect(body).toContain('buildInsertTransaction(view.state, text)');
    expect(body).toContain('view.dispatch(tr)');
    expect(body).not.toContain('model.rows');
    expect(body).not.toContain('.english =');
  });

  it('Esc dismisses the popover from the editor root', () => {
    const start = chapterSource.indexOf('function onRootKeydown(');
    const body = chapterSource.slice(start, chapterSource.indexOf('\n  }', start));
    expect(body).toContain("'Escape'");
    expect(body).toContain('dismissAssist()');
  });

  it('the dev fake hookup is DEV-gated so production builds strip it', () => {
    const start = chapterSource.indexOf('async function devFakeAssistProvider(');
    expect(start).toBeGreaterThan(-1);
    const body = chapterSource.slice(start, start + 400);
    expect(body).toContain('import.meta.env.DEV');
    expect(body).toContain('isTauri()');
  });

  it('RowEditor exposes the ONE public assist command and the quiet affordance', () => {
    expect(rowSource).toContain('export function insertSuggestion(text: string)');
    expect(rowSource).toContain('host.insertSuggestion(row, segment, text)');
    expect(rowSource).toContain('host.requestAssist(row, segment)');
    expect(rowSource).toContain('AssistPopover');
    expect(rowSource).toContain('assist-glyph');
  });

  it('AssistPopover renders exactly the three states with Insert/Dismiss/Cancel', () => {
    expect(popoverSource).toContain('Thinking…');
    expect(popoverSource).toContain('>Insert<');
    expect(popoverSource).toContain('>Dismiss<');
    expect(popoverSource).toContain('>Cancel<');
    // Messages come from state.text alone — no hand-written sentences here.
    expect(popoverSource).not.toMatch(/copied|clipboard|sign-in/i);
  });
});
