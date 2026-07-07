<script lang="ts">
  // AI-assist settings (design doc D7 §"Settings UI", Slice C). Opt-in panel:
  // someone who never opens it and has no CLI still gets the silent clipboard
  // fallback (§12 invisibility). Shows a provider picker (the built-in CLIs
  // with a Detect action, a custom command, and the API providers), a
  // custom-command form, API-key fields (each labeled pay-per-use, off by
  // default), and the includeDraft toggle. Every field persists through
  // updateSettings; the picker + custom form are exercisable in the browser
  // dev harness (localhost:1421) — only Detect needs Tauri.
  import { loadSettings, updateSettings } from '../lib/settings';
  import type { AssistSettings, AssistProviderChoice } from '../lib/settings';
  import { isTauri } from '../lib/runtime';
  import { CLI_TOOLS } from '../lib/assist/tools';
  import {
    providerOptions,
    detectLabel,
    CLI_TOOL_IDS,
    type DetectState,
  } from '../lib/editor/assistSettingsOptions';

  const options = providerOptions();

  let loaded = $state(false);
  let provider = $state<AssistProviderChoice | ''>('');
  let includeDraft = $state(true);

  // custom command
  let customBinPath = $state('');
  let customArgs = $state(''); // space-separated in the UI, split on save
  let customPromptVia = $state<'stdin' | 'arg'>('stdin');

  // api keys
  let apiKeys = $state<{ openai: string; anthropic: string; google: string }>({
    openai: '',
    anthropic: '',
    google: '',
  });

  // detection state per built-in tool
  let detect = $state<Record<string, { state: DetectState; path?: string }>>({
    claude: { state: 'unknown' },
    codex: { state: 'unknown' },
    gemini: { state: 'unknown' },
  });

  $effect(() => {
    void (async () => {
      const s = (await loadSettings()).assist ?? {};
      provider = s.provider ?? '';
      includeDraft = s.includeDraft ?? true;
      customBinPath = s.custom?.binPath ?? '';
      customArgs = (s.custom?.args ?? []).join(' ');
      customPromptVia = s.custom?.promptVia ?? 'stdin';
      apiKeys = {
        openai: s.apiKeys?.openai ?? '',
        anthropic: s.apiKeys?.anthropic ?? '',
        google: s.apiKeys?.google ?? '',
      };
      // seed cached detection paths so a previously-found tool shows Found
      for (const id of CLI_TOOL_IDS) {
        const cached = s.cliPaths?.[id];
        if (cached) detect[id] = { state: 'found', path: cached };
      }
      loaded = true;
    })();
  });

  /** Merge the current UI state into an AssistSettings patch and persist it. */
  async function persist() {
    const patch: AssistSettings = {};
    if (provider) patch.provider = provider;
    if (customBinPath || customArgs || customPromptVia !== 'stdin') {
      patch.custom = {
        ...(customBinPath ? { binPath: customBinPath } : {}),
        ...(customArgs.trim() ? { args: customArgs.trim().split(/\s+/) } : {}),
        promptVia: customPromptVia,
      };
    }
    const keys: Partial<Record<'openai' | 'anthropic' | 'google', string>> = {};
    if (apiKeys.openai) keys.openai = apiKeys.openai;
    if (apiKeys.anthropic) keys.anthropic = apiKeys.anthropic;
    if (apiKeys.google) keys.google = apiKeys.google;
    if (Object.keys(keys).length > 0) patch.apiKeys = keys;
    patch.includeDraft = includeDraft;
    // preserve cached cliPaths from whatever the last load/detect produced
    const prev = (await loadSettings()).assist ?? {};
    if (prev.cliPaths) patch.cliPaths = prev.cliPaths;
    if (prev.models) patch.models = prev.models;
    await updateSettings({ assist: patch });
  }

  function choose(id: AssistProviderChoice) {
    provider = id;
    void persist();
  }

  /** Run assist_which per built-in spec; cache any resolved path (Tauri only). */
  async function runDetect() {
    if (!isTauri()) return;
    const [{ invoke }, path] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/path'),
    ]);
    const home = (await path.homeDir()).replace(/\/+$/, '');
    const found: Partial<Record<string, string>> = {};
    for (const id of CLI_TOOL_IDS) {
      detect[id] = { state: 'checking' };
      const spec = CLI_TOOLS[id];
      try {
        const resolved = await invoke<string | null>('assist_which', {
          candidates: spec.candidatePaths(home),
          binName: spec.binName,
        });
        if (resolved) {
          detect[id] = { state: 'found', path: resolved };
          found[id] = resolved;
        } else {
          detect[id] = { state: 'not-found' };
        }
      } catch (err) {
        console.error('[assist] detect failed for', id, err);
        detect[id] = { state: 'not-found' };
      }
    }
    // cache resolved paths so resolveTauriAssistProvider reuses them
    if (Object.keys(found).length > 0) {
      const prev = (await loadSettings()).assist ?? {};
      await updateSettings({ assist: { ...prev, cliPaths: { ...prev.cliPaths, ...found } } });
    }
  }
</script>

<section class="assist-settings" aria-label="AI-assist settings">
  {#if !loaded}
    <p class="line muted">Loading…</p>
  {:else}
    <p class="intro">
      Pick the AI you already have. Nothing here is required — with no choice, the app just copies the
      line and its context to your clipboard.
    </p>

    <!-- Built-in CLIs -->
    <div class="group">
      <div class="group-head">
        <span class="group-title">Your own CLI</span>
        {#if isTauri()}
          <button class="text-btn" onclick={runDetect}>Detect</button>
        {/if}
      </div>
      {#each options.filter((o) => o.group === 'cli') as opt (opt.id)}
        <label class="opt" class:selected={provider === opt.id}>
          <input
            type="radio"
            name="assist-provider"
            value={opt.id}
            checked={provider === opt.id}
            onchange={() => choose(opt.id)}
          />
          <span class="opt-label">{opt.label}</span>
          <span class="opt-status" class:found={detect[opt.id]?.state === 'found'}>
            {detectLabel(detect[opt.id]?.state ?? 'unknown', detect[opt.id]?.path)}
          </span>
        </label>
      {/each}
    </div>

    <!-- Custom command -->
    <div class="group">
      <span class="group-title">Custom command</span>
      <label class="opt" class:selected={provider === 'custom'}>
        <input
          type="radio"
          name="assist-provider"
          value="custom"
          checked={provider === 'custom'}
          onchange={() => choose('custom')}
        />
        <span class="opt-label">Custom command</span>
      </label>
      {#if provider === 'custom'}
        <div class="custom-form">
          <label class="field">
            <span class="field-label">Path to the command</span>
            <input
              class="text-input"
              type="text"
              placeholder="/usr/local/bin/my-ai"
              bind:value={customBinPath}
              onblur={persist}
            />
          </label>
          <label class="field">
            <span class="field-label">Arguments (space-separated)</span>
            <input
              class="text-input"
              type="text"
              placeholder="--flag value"
              bind:value={customArgs}
              onblur={persist}
            />
          </label>
          <fieldset class="field">
            <span class="field-label">Send the prompt via</span>
            <div class="seg">
              <label class="seg-opt" class:on={customPromptVia === 'stdin'}>
                <input type="radio" name="promptVia" value="stdin" bind:group={customPromptVia} onchange={persist} />
                stdin
              </label>
              <label class="seg-opt" class:on={customPromptVia === 'arg'}>
                <input type="radio" name="promptVia" value="arg" bind:group={customPromptVia} onchange={persist} />
                argument
              </label>
            </div>
          </fieldset>
        </div>
      {/if}
    </div>

    <!-- API keys -->
    <div class="group">
      <span class="group-title">Use an API key</span>
      <p class="line muted small">Pay-per-use — billed to your key. Off unless you fill one in.</p>
      {#each options.filter((o) => o.group === 'api') as opt (opt.id)}
        <label class="opt" class:selected={provider === opt.id}>
          <input
            type="radio"
            name="assist-provider"
            value={opt.id}
            checked={provider === opt.id}
            onchange={() => choose(opt.id)}
          />
          <span class="opt-label">{opt.label}</span>
        </label>
        <label class="field key-field">
          <span class="field-label">{opt.label} key <em>— pay-per-use, billed to your key</em></span>
          <input
            class="text-input"
            type="password"
            autocomplete="off"
            placeholder="Leave empty to keep this off"
            bind:value={apiKeys[opt.id as 'openai' | 'anthropic' | 'google']}
            onblur={persist}
          />
        </label>
      {/each}
    </div>

    <!-- includeDraft -->
    <div class="group">
      <label class="check">
        <input type="checkbox" bind:checked={includeDraft} onchange={persist} />
        <span>Include my surrounding draft translation as context</span>
      </label>
    </div>
  {/if}
</section>

<style>
  .assist-settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .intro {
    font-family: var(--font-english);
    font-size: 0.88rem;
    line-height: 1.5;
    color: var(--text-mid);
    text-wrap: pretty;
    margin: 0;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .group-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .group-title {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-light);
  }

  .line {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text);
    margin: 0;
  }
  .line.muted {
    color: var(--text-light);
  }
  .line.small {
    font-size: 0.8rem;
  }

  /* Radio option rows — concentric: outer 8px, matches inner controls */
  .opt {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--input-bg);
    cursor: pointer;
    transition-property: border-color, background-color;
    transition-duration: 0.12s;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
  }
  .opt:hover {
    background: var(--ui-hover);
  }
  .opt:active {
    scale: 0.99;
  }
  .opt.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--input-bg));
  }
  .opt input[type='radio'] {
    accent-color: var(--accent);
    width: 15px;
    height: 15px;
  }
  .opt-label {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    color: var(--text);
    flex: 1;
  }
  .opt-status {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--text-light);
    max-width: 55%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .opt-status.found {
    color: var(--accent);
  }

  .custom-form,
  .key-field {
    margin-top: var(--space-1);
    padding: var(--space-3);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    border: none;
    margin: 0;
    padding: 0;
  }
  .field-label {
    font-family: var(--font-ui);
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-mid);
  }
  .field-label em {
    font-style: italic;
    font-weight: 400;
    color: var(--text-light);
  }

  .text-input {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--text);
    background: var(--col-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-2);
    width: 100%;
    box-sizing: border-box;
    transition-property: border-color;
    transition-duration: 0.12s;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
  }
  .text-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .seg {
    display: inline-flex;
    gap: var(--space-1);
  }
  .seg-opt {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-ui);
    font-size: 0.82rem;
    color: var(--text-mid);
    padding: var(--space-1) var(--space-2);
    border-radius: 6px;
    cursor: pointer;
  }
  .seg-opt.on {
    color: var(--text);
  }
  .seg-opt input {
    accent-color: var(--accent);
  }

  .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-ui);
    font-size: 0.88rem;
    color: var(--text);
    cursor: pointer;
  }
  .check input {
    accent-color: var(--accent);
    width: 15px;
    height: 15px;
  }

  .text-btn {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--accent);
    background: transparent;
    border: none;
    padding: var(--space-1) var(--space-2);
    border-radius: 6px;
    cursor: pointer;
    transition-property: background-color, scale;
    transition-duration: 0.12s;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
  }
  .text-btn:hover {
    background: var(--ui-hover);
  }
  .text-btn:active {
    scale: 0.96;
  }
</style>
