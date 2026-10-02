<script lang="ts">
  // The Export pane of the settings dialog. Everything here is a DEFAULT: the
  // compile dialog seeds its controls from these and the single-chapter export
  // reads them directly, but changing a control in the compile dialog affects
  // that one export only and is never written back here.
  //
  // Every setting persists on change (no Save button, matching AssistSettings).
  // The file-picking rows are Tauri-only — in the browser harness they simply
  // don't render, and the enum choices above them still work.
  import { loadSettings, updateSettings } from '../lib/settings';
  import type { BilingualLayout, BilingualOrder, CompileMode, ExportSettings, StampMode } from '../lib/settings';
  import { isTauri } from '../lib/runtime';

  /** `pandoc_version` / `pick_pandoc`'s answer (src-tauri/src/commands.rs). */
  interface PandocProbe {
    picked: string | null;
    version: string | null;
  }

  let loaded = $state(false);
  let stampMode = $state<StampMode>('every-5');
  let mode = $state<CompileMode>('english');
  /** 'auto' is the UNSET state, not a fourth layout: there is no single
   * default to show, because the compile dialog picks block for a Bekker work
   * and alternating for a document spine. Showing 'block' here claimed a
   * default the Summa never had, and saving from this pane would have pinned
   * it. Choosing 'auto' omits the key entirely (see persist). */
  let bilingualLayout = $state<BilingualLayout | 'auto'>('auto');
  let bilingualOrder = $state<BilingualOrder>('original-first');
  let referenceDocPath = $state<string | null>(null);
  let outputDir = $state<string | null>(null);
  /** The pandoc the user picked, as Rust recorded it; null = found automatically. */
  let pandocPath = $state<string | null>(null);
  /** Result of the last pandoc pick, shown next to the row. */
  let pandocNote = $state<string | null>(null);
  let checking = $state(false);

  $effect(() => {
    void (async () => {
      const settings = await loadSettings();
      const e = settings.export ?? {};
      stampMode = e.stampMode ?? 'every-5';
      mode = e.mode ?? 'english';
      bilingualLayout = e.bilingualLayout ?? 'auto';
      bilingualOrder = e.bilingualOrder ?? 'original-first';
      referenceDocPath = e.referenceDocPath ?? null;
      outputDir = e.outputDir ?? null;
      loaded = true;
      if (isTauri()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          pandocPath = ((await invoke('pandoc_version')) as PandocProbe).picked;
        } catch (err) {
          console.error('[export settings] pandoc check failed', err);
        }
      }
    })();
  });

  /** Persist the whole pane. Paths are omitted when unset, so an unset field
   * never lands in settings.json as an empty string (sanitizeExport drops
   * those anyway — this keeps the file tidy at the source). */
  async function persist() {
    if (!loaded) return; // never write before the first read has landed
    const patch: ExportSettings = { stampMode, mode, bilingualOrder };
    if (bilingualLayout !== 'auto') patch.bilingualLayout = bilingualLayout;
    if (referenceDocPath) patch.referenceDocPath = referenceDocPath;
    if (outputDir) patch.outputDir = outputDir;
    await updateSettings({ export: patch });
  }

  async function chooseReferenceDoc() {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const picked = await dialog.open({
      multiple: false,
      title: 'Choose a Word document to take styles from',
      filters: [{ name: 'Word document', extensions: ['docx'] }],
    });
    if (typeof picked !== 'string') return; // cancelled
    referenceDocPath = picked;
    await persist();
  }

  async function chooseOutputDir() {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const picked = await dialog.open({
      directory: true,
      multiple: false,
      title: 'Choose the folder to save exports in',
    });
    if (typeof picked !== 'string') return; // cancelled
    outputDir = picked;
    await persist();
  }

  /**
   * Pick a pandoc and check it on the spot by running `--version`, so a wrong
   * pick is caught here rather than at the end of an export. Rust opens the
   * file dialog and records the pick itself: the window can ask for a pick
   * but cannot make one (workbench-design/sandboxing-plan.md).
   */
  async function choosePandoc() {
    checking = true;
    pandocNote = null;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const probe = (await invoke('pick_pandoc')) as PandocProbe | null;
      if (!probe) return; // cancelled
      if (!probe.version) {
        pandocNote = "That program didn't run — nothing was changed.";
        return;
      }
      pandocPath = probe.picked;
      // First line of `pandoc --version` is "pandoc 3.x.y" — echoing it back
      // is the plainest confirmation that the right program was picked.
      pandocNote = probe.version || 'Ready.';
    } catch (err) {
      console.error('[export settings] pandoc pick failed', err);
      pandocNote = "That program couldn't be checked — nothing was changed.";
    } finally {
      checking = false;
    }
  }

  async function clearReferenceDoc() {
    referenceDocPath = null;
    await persist();
  }
  async function clearOutputDir() {
    outputDir = null;
    await persist();
  }
  async function clearPandocPath() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('forget_pandoc');
      pandocPath = null;
      pandocNote = null;
    } catch (err) {
      console.error('[export settings] could not forget the pandoc pick', err);
    }
  }
</script>

<fieldset class="settings-group">
  <legend>Bekker line numbers</legend>
  <label class="settings-radio">
    <input type="radio" name="export-stamp" value="every-line" bind:group={stampMode} onchange={persist} />
    On every line
  </label>
  <label class="settings-radio">
    <input type="radio" name="export-stamp" value="every-5" bind:group={stampMode} onchange={persist} />
    Every fifth line
  </label>
  <label class="settings-radio">
    <input type="radio" name="export-stamp" value="columns" bind:group={stampMode} onchange={persist} />
    At each column start only
  </label>
</fieldset>

<fieldset class="settings-group">
  <legend>Whole-work export</legend>
  <label class="settings-radio">
    <input type="radio" name="export-mode" value="english" bind:group={mode} onchange={persist} />
    Translation only
  </label>
  <label class="settings-radio">
    <input type="radio" name="export-mode" value="bilingual" bind:group={mode} onchange={persist} />
    Original and translation
  </label>
</fieldset>

<fieldset class="settings-group">
  <legend>Bilingual layout</legend>
  <label class="settings-radio">
    <input type="radio" name="export-layout" value="auto" bind:group={bilingualLayout} onchange={persist} />
    Whatever suits each work
  </label>
  <label class="settings-radio">
    <input type="radio" name="export-layout" value="block" bind:group={bilingualLayout} onchange={persist} />
    One language after the other
  </label>
  <label class="settings-radio">
    <input type="radio" name="export-layout" value="alternating" bind:group={bilingualLayout} onchange={persist} />
    Alternating paragraphs
  </label>
  <label class="settings-radio">
    <input type="radio" name="export-layout" value="table" bind:group={bilingualLayout} onchange={persist} />
    Side by side (two-column table)
  </label>
  <p class="settings-hint">
    Leave this on “Whatever suits each work” and every work exports the way it always has —
    one language after the other for a numbered text, alternating paragraphs for a document.
    Any other choice applies to every work. You can still change the layout for a single export
    in the export window.
  </p>
  <p class="settings-hint">
    Side by side keeps each paragraph level with its translation. It is a Word table, so the two
    columns stay locked together — at the cost of being fiddlier to edit afterwards.
  </p>
</fieldset>

<fieldset class="settings-group">
  <legend>Which language leads</legend>
  <label class="settings-radio">
    <input type="radio" name="export-order" value="original-first" bind:group={bilingualOrder} onchange={persist} />
    Original first
  </label>
  <label class="settings-radio">
    <input type="radio" name="export-order" value="translation-first" bind:group={bilingualOrder} onchange={persist} />
    Translation first
  </label>
</fieldset>

{#if isTauri()}
  <div class="settings-block">
    <p class="settings-block-title">Word styles</p>
    {#if referenceDocPath}
      <p class="settings-line path">{referenceDocPath}</p>
    {:else}
      <p class="settings-line muted">The app's own reference document.</p>
    {/if}
    <div class="settings-actions">
      <button class="settings-secondary" onclick={chooseReferenceDoc}>Choose document…</button>
      {#if referenceDocPath}
        <button class="settings-text-btn" onclick={clearReferenceDoc}>Use the app's styles</button>
      {/if}
    </div>
    <p class="settings-hint">
      Exports take their fonts, headings, and footnote styling from this document.
    </p>
  </div>

  <div class="settings-block">
    <p class="settings-block-title">Save exports in</p>
    {#if outputDir}
      <p class="settings-line path">{outputDir}</p>
    {:else}
      <p class="settings-line muted">Wherever the save dialog last was.</p>
    {/if}
    <div class="settings-actions">
      <button class="settings-secondary" onclick={chooseOutputDir}>Choose folder…</button>
      {#if outputDir}
        <button class="settings-text-btn" onclick={clearOutputDir}>Don't set a folder</button>
      {/if}
    </div>
  </div>

  <div class="settings-block">
    <p class="settings-block-title">Pandoc</p>
    {#if pandocPath}
      <p class="settings-line path">{pandocPath}</p>
    {:else}
      <p class="settings-line muted">Found automatically on this computer.</p>
    {/if}
    <div class="settings-actions">
      <button class="settings-secondary" onclick={choosePandoc} disabled={checking}>
        {checking ? 'Checking…' : 'Choose program…'}
      </button>
      {#if pandocPath}
        <button class="settings-text-btn" onclick={clearPandocPath}>Find it automatically</button>
      {/if}
    </div>
    {#if pandocNote}
      <p class="settings-line">{pandocNote}</p>
    {/if}
    <p class="settings-hint">
      Only needed when the wrong Pandoc gets picked up, or yours is somewhere unusual.
    </p>
  </div>
{/if}
