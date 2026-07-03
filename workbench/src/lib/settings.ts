/**
 * Tiny persisted settings.
 *
 *   Tauri:    $APPDATA/settings.json (plugin-fs)
 *   Browser:  localStorage["workbench:settings"] (dev harness)
 *
 * Holds only what onboarding + startup need: the TLG directory, an optional
 * Diogenes server-dir override, and the last-opened chapter. No settings UI
 * beyond that. All failures degrade to defaults quietly (console-logged).
 */

import { isTauri } from './runtime';

export interface LastOpened {
  workId: string;
  book: number;
  chapter: number;
}

/** CLI tools driven directly (each on the user's own subscription). */
export type AssistCliToolId = 'claude' | 'codex' | 'gemini';
/** API providers called with the user's own key (pay-per-use). Slice D. */
export type AssistApiProviderId = 'openai' | 'anthropic' | 'google';
/** Every value `AssistSettings.provider` may take. */
export type AssistProviderChoice = AssistCliToolId | 'custom' | AssistApiProviderId;

/** User-supplied custom command config (D7 §"Provider registry", `specForCustom`). */
export interface AssistCustomConfig {
  /** Absolute path to the custom binary. */
  binPath?: string;
  /** Fixed non-interactive flags. */
  args?: string[];
  /** How the composed prompt reaches the tool. */
  promptVia?: 'stdin' | 'arg';
}

/**
 * AI-assist settings (design doc D7 — multi-provider). Back-compatible with the
 * d4 single-claude shape (`cliPath`/`cliState`/`checkedAt`): `sanitize()`
 * migrates an old blob into `cliPaths.claude` + `provider: 'claude'`. Every
 * field is optional; an empty object means "detect + prefer Claude, else
 * clipboard" (the §12 invisibility floor).
 */
export interface AssistSettings {
  /** The user's explicit provider choice. Unset → detect (prefer claude). */
  provider?: AssistProviderChoice;
  /** Cached resolved absolute paths for the built-in CLI tools. */
  cliPaths?: Partial<Record<AssistCliToolId, string>>;
  /** Custom-command config (used when `provider === 'custom'`). */
  custom?: AssistCustomConfig;
  /** API keys, one per provider — plaintext (parity with all other settings). Slice D. */
  apiKeys?: Partial<Record<AssistApiProviderId, string>>;
  /** Optional per-provider model override. */
  models?: Record<string, string>;
  /** Send the surrounding draft English as prompt context (John: default ON). */
  includeDraft?: boolean;
}

export interface WorkbenchSettings {
  /** Directory containing the TLG texts (AUTHTAB.DIR etc.). */
  tlgDir?: string;
  /** Override for the Diogenes server directory (the one holding xml-export.pl). */
  diogenesPath?: string;
  lastOpened?: LastOpened;
  /**
   * User-chosen folder holding the library (chapter files), e.g. a synced
   * Drive/Dropbox folder shared with a collaborator (build spec §11). Unset
   * means the default `$APPDATA/library` location. Tauri only — the browser
   * dev harness never reads or writes this.
   */
  libraryRoot?: string;
  /**
   * Root for imported reference translations (design doc D5). Unset means the
   * default `$APPDATA/references`. NEVER derived from libraryRoot: reference
   * texts are private-study OCR of copyrighted works and must stay out of the
   * synced folder. Tauri only.
   */
  referenceRoot?: string;
  assist?: AssistSettings;
}

const LS_KEY = 'workbench:settings';
const FILE = 'settings.json';

const CLI_TOOL_IDS: readonly AssistCliToolId[] = ['claude', 'codex', 'gemini'];
const API_PROVIDER_IDS: readonly AssistApiProviderId[] = ['openai', 'anthropic', 'google'];
const PROVIDER_CHOICES: readonly AssistProviderChoice[] = [
  ...CLI_TOOL_IDS,
  'custom',
  ...API_PROVIDER_IDS,
];

/**
 * Sanitize + migrate the persisted `assist` blob. Defensive against every
 * field; also migrates the OLD d4 shape:
 *   { cliPath, cliState, checkedAt }  →  { cliPaths: { claude }, provider }
 * When an old `cliPath` string is present we map it to `cliPaths.claude` and
 * default `provider` to 'claude' (unless a valid new `provider` is already
 * set). The old `cliState`/`checkedAt` fields carried transient detection
 * state and are intentionally dropped — resolution re-runs and re-caches.
 * Returns undefined when nothing survives (so the empty object never persists).
 *
 * Exported for unit testing (settings.test.ts); production callers reach it
 * through `sanitize()` / `loadSettings()`.
 */
export function sanitizeAssist(raw: unknown): AssistSettings | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const a = raw as Record<string, unknown>;
  const out: AssistSettings = {};

  // ── new fields ──
  if (typeof a.provider === 'string' && (PROVIDER_CHOICES as readonly string[]).includes(a.provider)) {
    out.provider = a.provider as AssistProviderChoice;
  }

  if (typeof a.cliPaths === 'object' && a.cliPaths !== null) {
    const src = a.cliPaths as Record<string, unknown>;
    const cliPaths: Partial<Record<AssistCliToolId, string>> = {};
    for (const id of CLI_TOOL_IDS) {
      if (typeof src[id] === 'string') cliPaths[id] = src[id] as string;
    }
    if (Object.keys(cliPaths).length > 0) out.cliPaths = cliPaths;
  }

  if (typeof a.custom === 'object' && a.custom !== null) {
    const c = a.custom as Record<string, unknown>;
    const custom: AssistCustomConfig = {};
    if (typeof c.binPath === 'string') custom.binPath = c.binPath;
    if (Array.isArray(c.args) && c.args.every((x) => typeof x === 'string')) {
      custom.args = c.args as string[];
    }
    if (c.promptVia === 'stdin' || c.promptVia === 'arg') custom.promptVia = c.promptVia;
    if (Object.keys(custom).length > 0) out.custom = custom;
  }

  if (typeof a.apiKeys === 'object' && a.apiKeys !== null) {
    const src = a.apiKeys as Record<string, unknown>;
    const apiKeys: Partial<Record<AssistApiProviderId, string>> = {};
    for (const id of API_PROVIDER_IDS) {
      if (typeof src[id] === 'string') apiKeys[id] = src[id] as string;
    }
    if (Object.keys(apiKeys).length > 0) out.apiKeys = apiKeys;
  }

  if (typeof a.models === 'object' && a.models !== null) {
    const src = a.models as Record<string, unknown>;
    const models: Record<string, string> = {};
    for (const [k, val] of Object.entries(src)) {
      if (typeof val === 'string') models[k] = val;
    }
    if (Object.keys(models).length > 0) out.models = models;
  }

  if (typeof a.includeDraft === 'boolean') out.includeDraft = a.includeDraft;

  // ── migration from the old { cliPath, cliState, checkedAt } shape ──
  if (typeof a.cliPath === 'string' && a.cliPath.length > 0) {
    if (!out.cliPaths) out.cliPaths = {};
    if (out.cliPaths.claude === undefined) out.cliPaths.claude = a.cliPath;
    if (out.provider === undefined) out.provider = 'claude';
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/** Exported for unit testing (settings.test.ts) — the full-blob sanitizer. */
export function sanitize(value: unknown): WorkbenchSettings {
  if (typeof value !== 'object' || value === null) return {};
  const v = value as Record<string, unknown>;
  const out: WorkbenchSettings = {};
  if (typeof v.tlgDir === 'string') out.tlgDir = v.tlgDir;
  if (typeof v.diogenesPath === 'string') out.diogenesPath = v.diogenesPath;
  if (typeof v.libraryRoot === 'string') out.libraryRoot = v.libraryRoot;
  if (typeof v.referenceRoot === 'string') out.referenceRoot = v.referenceRoot;
  const assist = sanitizeAssist(v.assist);
  if (assist) out.assist = assist;
  const lo = v.lastOpened as Record<string, unknown> | undefined;
  if (
    typeof lo === 'object' &&
    lo !== null &&
    typeof lo.workId === 'string' &&
    typeof lo.book === 'number' &&
    typeof lo.chapter === 'number'
  ) {
    out.lastOpened = { workId: lo.workId, book: lo.book, chapter: lo.chapter };
  }
  return out;
}

async function readRaw(): Promise<string | null> {
  if (isTauri()) {
    const fs = await import('@tauri-apps/plugin-fs');
    try {
      if (!(await fs.exists(FILE, { baseDir: fs.BaseDirectory.AppData }))) return null;
      return await fs.readTextFile(FILE, { baseDir: fs.BaseDirectory.AppData });
    } catch (err) {
      console.warn('settings: read failed', err);
      return null;
    }
  }
  return localStorage.getItem(LS_KEY);
}

async function writeRaw(text: string): Promise<void> {
  if (isTauri()) {
    const fs = await import('@tauri-apps/plugin-fs');
    try {
      await fs.mkdir('', { baseDir: fs.BaseDirectory.AppData, recursive: true });
      await fs.writeTextFile(FILE, text, { baseDir: fs.BaseDirectory.AppData });
    } catch (err) {
      console.warn('settings: write failed', err);
    }
    return;
  }
  localStorage.setItem(LS_KEY, text);
}

let cached: WorkbenchSettings | null = null;

export async function loadSettings(): Promise<WorkbenchSettings> {
  if (cached) return cached;
  const raw = await readRaw();
  if (raw === null) {
    cached = {};
    return cached;
  }
  try {
    cached = sanitize(JSON.parse(raw));
  } catch (err) {
    console.warn('settings: unparsable settings file — starting fresh', err);
    cached = {};
  }
  return cached;
}

/** Merge a patch into the persisted settings (undefined values are dropped). */
export async function updateSettings(
  patch: Partial<WorkbenchSettings>,
): Promise<WorkbenchSettings> {
  const current = await loadSettings();
  const next: WorkbenchSettings = { ...current };
  for (const key of [
    'tlgDir',
    'diogenesPath',
    'lastOpened',
    'libraryRoot',
    'referenceRoot',
    'assist',
  ] as const) {
    if (key in patch) {
      const value = patch[key];
      if (value === undefined) delete (next as Record<string, unknown>)[key];
      else (next as Record<string, unknown>)[key] = value;
    }
  }
  cached = next;
  await writeRaw(JSON.stringify(next, null, 1));
  return next;
}
