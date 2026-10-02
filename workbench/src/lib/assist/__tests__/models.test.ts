import { beforeAll, describe, expect, it } from 'vitest';
import { PROVIDER_MODELS, cliModel, pickerOptions, pickerProvider, pickerValue, withModel } from '../models';

let jobsRs = '';

beforeAll(async () => {
  // Computed specifier: no @types/node in this project (the same trick as
  // copyCitation.test.ts).
  const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
    readFileSync(path: string, encoding: 'utf-8'): string;
  };
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
    fileURLToPath(url: URL): string;
  };
  jobsRs = fs.readFileSync(nodeUrl.fileURLToPath(new URL('../../../../src-tauri/src/jobs.rs', import.meta.url)), 'utf-8');
});

/** The model ids in one arm of `AssistTool::models` in jobs.rs. */
function rustModels(arm: 'Claude' | 'Codex'): string[] {
  const fn = jobsRs.slice(jobsRs.indexOf('pub fn models(self)'));
  const m = fn.match(new RegExp(`Self::${arm} => &\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`no ${arm} arm found in AssistTool::models`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe('model lists', () => {
  it('the CLI lists are exactly the ones Rust accepts', () => {
    const claude = rustModels('Claude');
    const codex = rustModels('Codex');
    // The parse found something: an empty list would compare equal to nothing.
    expect(claude.length).toBeGreaterThan(0);
    expect(codex.length).toBeGreaterThan(0);
    expect(PROVIDER_MODELS.claude!.map((m) => m.id)).toEqual(claude);
    expect(PROVIDER_MODELS.codex!.map((m) => m.id)).toEqual(codex);
  });

  it('offers no picker where no list is known', () => {
    for (const p of ['custom', 'openai', 'google', 'gemini'] as const) expect(PROVIDER_MODELS[p]).toBeUndefined();
  });
});

describe('cliModel', () => {
  it('passes a listed model', () => {
    expect(cliModel('claude', { claude: 'opus' })).toBe('opus');
    expect(cliModel('codex', { codex: 'gpt-6-luna' })).toBe('gpt-6-luna');
  });

  it('drops a model Rust would refuse, so the request still runs on the default', () => {
    expect(cliModel('claude', { claude: '--yolo' })).toBeUndefined();
    expect(cliModel('codex', { codex: 'sonnet' })).toBeUndefined();
    expect(cliModel('claude', { codex: 'gpt-6-luna' })).toBeUndefined();
    expect(cliModel('custom', { custom: 'anything' })).toBeUndefined();
    expect(cliModel('claude', undefined)).toBeUndefined();
  });
});

describe('the picker', () => {
  it('shows Claude Code when no provider is chosen (auto-detect prefers it)', () => {
    expect(pickerProvider(undefined)).toBe('claude');
    expect(pickerProvider({ provider: 'codex' })).toBe('codex');
  });

  it('shows the saved model, or the default when it is not on the list', () => {
    expect(pickerValue({ provider: 'codex', models: { codex: 'gpt-5.5' } })).toBe('gpt-5.5');
    expect(pickerValue({ provider: 'codex', models: { codex: '--yolo' } })).toBe('');
    expect(pickerValue({ models: { claude: 'haiku' } })).toBe('haiku');
    expect(pickerValue({})).toBe('');
  });

  it('shows an API model it does not list, since the API provider uses it', () => {
    // ApiProvider sends any saved id, so the picker must not claim Default.
    const assist = { provider: 'anthropic' as const, models: { anthropic: 'claude-3' } };
    expect(pickerValue(assist)).toBe('claude-3');
    const options = pickerOptions(assist)!;
    expect(options.map((o) => o.id)).toEqual([...PROVIDER_MODELS.anthropic!.map((m) => m.id), 'claude-3']);
    // A CLI never runs an unlisted model (Rust refuses it), so no extra entry.
    expect(pickerOptions({ provider: 'codex', models: { codex: '--yolo' } })).toEqual(PROVIDER_MODELS.codex);
    expect(pickerOptions({ provider: 'openai' })).toBeUndefined();
  });

  it('remembers a pick per provider and keeps everything else', () => {
    const before = { provider: 'codex' as const, includeDraft: false, models: { claude: 'opus' } };
    const after = withModel(before, 'codex', 'gpt-6-luna');
    expect(after).toEqual({ provider: 'codex', includeDraft: false, models: { claude: 'opus', codex: 'gpt-6-luna' } });
    expect(before.models).toEqual({ claude: 'opus' }); // not mutated
  });

  it('choosing the default forgets the provider’s model', () => {
    expect(withModel({ models: { claude: 'opus', codex: 'gpt-5.5' } }, 'claude', '')).toEqual({
      models: { codex: 'gpt-5.5' },
    });
    expect(withModel({ models: { claude: 'opus' } }, 'claude', '')).toEqual({});
  });
});
