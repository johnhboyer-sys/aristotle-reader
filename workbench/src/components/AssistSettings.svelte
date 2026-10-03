<script lang="ts">
  // AI-assist settings (design doc D7 §"Settings UI", Slice C). Opt-in panel:
  // someone who never opens it and has no CLI still gets the silent clipboard
  // fallback (§12 invisibility). Shows a provider picker (the built-in CLIs
  // with a Detect action, a custom command, and the API providers), a
  // custom-command form, API-key fields (each labeled pay-per-use, off by
  // default), and the includeDraft toggle. Every field persists through
  // updateSettings; the picker is exercisable in the browser dev harness
  // (localhost:1421) — Detect and the custom command need Tauri.
  //
  // The window never names a program for Rust to run. Detect asks Rust which
  // CLIs it finds; the custom command is set by Rust, which opens the file
  // picker and a native confirmation itself (workbench-design/
  // sandboxing-plan.md). settings.custom mirrors the approved command for
  // display only.
  import { loadSettings, updateSettings } from '../lib/settings';
  import type { AssistSettings, AssistProviderChoice } from '../lib/settings';
  import { isTauri } from '../lib/runtime';
  import { ASSIST_CONTEXT_WINDOW } from '../lib/editor/assistController';
  import type { AssistDetection } from '../lib/editor/assistController';
  import { CONSENT_LABELS, revokeConsent, type ConsentProviderId } from '../lib/assist/consent';
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
  // Providers the user has allowed to receive text (asked before the first send).
  let consented = $state<ConsentProviderId[]>([]);

  // custom command: the arguments and prompt channel to approve next, and
  // the command Rust holds approved (null = none)
  let customArgs = $state(''); // space-separated in the UI, split on approval
  let customPromptVia = $state<'stdin' | 'arg'>('stdin');
  let approved = $state<AssistDetection['custom']>(null);
  /** False until Rust has said which command it holds; until then a save
   * keeps the mirror already in settings rather than erasing it. */
  let approvedKnown = $state(false);
  let customNote = $state<string | null>(null);

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
  });

  $effect(() => {
    void (async () => {
      const s = (await loadSettings()).assist ?? {};
      provider = s.provider ?? '';
      includeDraft = s.includeDraft ?? true;
      consented = (s.consented ?? []).filter((id): id is ConsentProviderId => id !== 'gemini');
      customArgs = (s.custom?.args ?? []).join(' ');
      customPromptVia = s.custom?.promptVia ?? 'stdin';
      apiKeys = {
        openai: s.apiKeys?.openai ?? '',
        anthropic: s.apiKeys?.anthropic ?? '',
        google: s.apiKeys?.google ?? '',
      };
      loaded = true;
      if (isTauri()) void runDetect();
    })();
  });

  /** Merge the current UI state into an AssistSettings patch and persist it. */
  async function persist() {
    const patch: AssistSettings = {};
    if (provider) patch.provider = provider;
    const prev = (await loadSettings()).assist ?? {};
    if (!approvedKnown) {
      if (prev.custom) patch.custom = prev.custom;
    } else if (approved) {
      patch.custom = { binPath: approved.program, args: approved.args, promptVia: approved.prompt_via };
    }
    const keys: Partial<Record<'openai' | 'anthropic' | 'google', string>> = {};
    if (apiKeys.openai) keys.openai = apiKeys.openai;
    if (apiKeys.anthropic) keys.anthropic = apiKeys.anthropic;
    if (apiKeys.google) keys.google = apiKeys.google;
    if (Object.keys(keys).length > 0) patch.apiKeys = keys;
    patch.includeDraft = includeDraft;
    if (prev.models) patch.models = prev.models;
    // Consent is written by the prompt, so the file is newer than this pane.
    if (prev.consented) patch.consented = prev.consented;
    await updateSettings({ assist: patch });
  }

  function choose(id: AssistProviderChoice | '') {
    provider = id;
    void persist();
  }

  /** Take back one provider's consent: its next send asks again. */
  async function takeBack(id: ConsentProviderId) {
    const cur = (await loadSettings()).assist;
    const next = revokeConsent(cur, id);
    await updateSettings({ assist: next });
    consented = (next.consented ?? []).filter((c): c is ConsentProviderId => c !== 'gemini');
  }

  /** Ask Rust which CLIs it finds, and which custom command it holds (Tauri only). */
  async function runDetect() {
    if (!isTauri()) return;
    for (const id of CLI_TOOL_IDS) detect[id] = { state: 'checking' };
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const found = (await invoke('assist_detect')) as AssistDetection;
      for (const id of CLI_TOOL_IDS) {
        const path = found[id];
        detect[id] = path ? { state: 'found', path } : { state: 'not-found' };
      }
      approved = found.custom;
      approvedKnown = true;
    } catch (err) {
      console.error('[assist] detect failed', err);
      for (const id of CLI_TOOL_IDS) detect[id] = { state: 'not-found' };
    }
  }

  /** Rust opens the file picker, then a native "Allow …?" confirmation
   * showing the whole command; only an allowed command is recorded. */
  async function setCustom() {
    customNote = null;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const args = customArgs.trim() ? customArgs.trim().split(/\s+/) : [];
      const result = (await invoke('assist_set_custom', { args, promptVia: customPromptVia })) as AssistDetection['custom'];
      if (!result) return; // cancelled at the picker or the confirmation
      approved = result;
      approvedKnown = true;
      await takeBack('custom'); // a new program is a new recipient: ask again
      await persist();
    } catch (err) {
      console.error('[assist] could not set the custom command', err);
      // Rust says why: not a program, or arguments the confirmation can't show.
      customNote = `Nothing was changed: ${String(err)}.`;
    }
  }

  async function forgetCustom() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('assist_forget_custom');
      approved = null;
      approvedKnown = true;
      await takeBack('custom');
      await persist();
    } catch (err) {
      console.error('[assist] could not remove the custom command', err);
      customNote = "The command couldn't be removed.";
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

    <label class="opt" class:selected={provider === ''}>
      <input
        type="radio"
        name="assist-provider"
        value=""
        checked={provider === ''}
        onchange={() => choose('')}
      />
      <span class="opt-label">Copy to clipboard only</span>
      <span class="opt-status">Sends nothing</span>
    </label>

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
          {#if approved}
            <p class="line path">{[approved.program, ...approved.args].join(' ')}</p>
            <p class="line muted small">
              Prompt sent {approved.prompt_via === 'arg' ? 'as the last argument' : 'on stdin'}.
            </p>
          {:else}
            <p class="line muted">No command chosen yet.</p>
          {/if}
          <label class="field">
            <span class="field-label">Arguments (space-separated)</span>
            <input
              class="text-input"
              type="text"
              placeholder="--flag value"
              bind:value={customArgs}
            />
          </label>
          <fieldset class="field">
            <span class="field-label">Send the prompt via</span>
            <div class="seg">
              <label class="seg-opt" class:on={customPromptVia === 'stdin'}>
                <input type="radio" name="promptVia" value="stdin" bind:group={customPromptVia} />
                stdin
              </label>
              <label class="seg-opt" class:on={customPromptVia === 'arg'}>
                <input type="radio" name="promptVia" value="arg" bind:group={customPromptVia} />
                argument
              </label>
            </div>
          </fieldset>
          {#if isTauri()}
            <div class="actions">
              <button class="text-btn" onclick={setCustom}>Choose program…</button>
              {#if approved}
                <button class="text-btn" onclick={forgetCustom}>Remove</button>
              {/if}
            </div>
            <p class="line muted small">
              You'll be asked to allow the command, with these arguments, before it is saved.
            </p>
          {/if}
          {#if customNote}
            <p class="line">{customNote}</p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- API keys -->
    <div class="group">
      <span class="group-title">Use an API key</span>
      <p class="line muted small">Pay-per-use — billed to your key. Off unless you fill one in.</p>
      <p class="line muted small">
        Experimental: these haven't been tried with a real key yet, and keys are stored unencrypted in
        the app's settings file.
      </p>
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
          {#if opt.experimental}
            <span class="tag">Experimental</span>
          {/if}
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

    <!-- What leaves the machine, and who has been allowed to receive it -->
    <div class="group">
      <span class="group-title">What leaves this Mac</span>
      <p class="line small">
        The app sends text only when you ask the AI (⌘↩, Translate, Check, Reference or Ask), and only
        to the AI you picked here. It asks you once for each AI before the first send. It sends the
        work's title, where the line falls, the source line, up to {ASSIST_CONTEXT_WINDOW} rows on either
        side, and, if the box above is on, your draft English for those rows. Check and Ask also send
        the author, your English for the line and the draft around it, even with the box off, and Ask
        sends your question. Nothing else leaves this Mac: the app goes online only to fetch a text from
        Perseus or FREED when you import one, and it sends no usage data.
      </p>
      {#if consented.length > 0}
        <span class="field-label">Allowed to receive text</span>
        {#each consented as id (id)}
          <div class="allowed">
            <span class="line small">{CONSENT_LABELS[id]}</span>
            <button class="text-btn" onclick={() => takeBack(id)}>Take back</button>
          </div>
        {/each}
      {/if}
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
  .line.path {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    gap: var(--space-2);
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
  .tag {
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--text-mid);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 var(--space-1);
  }

  .allowed {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
