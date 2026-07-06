<script lang="ts">
  // "New document…" dialog — the corpus-free import flow (workbench-design/
  // d8-view-modes.md §6). Title + optional language + pasted text AND/OR a
  // picked text file; the lines-vs-paragraphs unit radio is preselected by
  // detectUnit and follows the text live until the user overrides it (the
  // override then wins — d8 §3). Creation is pure (import/createFreeDocument);
  // this dialog only reads the file, writes the chapter file via the library
  // storage layer, registers the work, and hands the new work id to App.
  import { isTauri } from '../lib/runtime';
  import { detectUnit, splitIntoLineRows, splitIntoParagraphRows } from '../lib/import/segmentDetect';
  import { createFreeDocument } from '../lib/import/createFreeDocument';
  import type { FreeDocumentUnit } from '../lib/import/createFreeDocument';
  import { serializeChapterFile } from '../lib/chapterfile';
  import { libraryStorage, chapterFileName } from '../lib/library/storage';
  import { registerFreeWork } from '../lib/works/freeWorks';

  let {
    existingIds,
    onClose,
    onCreated,
  }: {
    /** Every work id already in use (built-ins + free works) for slug uniqueness. */
    existingIds: string[];
    onClose: () => void;
    /** Called with the freshly created work's id so App can register + open it. */
    onCreated: (workId: string) => void;
  } = $props();

  let title = $state('');
  let language = $state('');
  let text = $state('');
  let fileName = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let writing = $state(false);

  // Unit: auto-detected from the text until the user picks one explicitly.
  let unitOverride = $state<FreeDocumentUnit | null>(null);
  const detectedUnit = $derived(detectUnit(text));
  const unit = $derived(unitOverride ?? detectedUnit);

  // Small live preview: what the chosen unit would segment the text into.
  const paragraphCount = $derived(splitIntoParagraphRows(text).length);
  const lineCount = $derived(splitIntoLineRows(text).lines.length);
  const rowCount = $derived(unit === 'paragraphs' ? paragraphCount : lineCount);
  const preview = $derived(
    text.trim().length === 0
      ? null
      : `${paragraphCount} paragraph${paragraphCount === 1 ? '' : 's'} / ${lineCount} line${lineCount === 1 ? '' : 's'} detected`,
  );

  const createBlocked = $derived(
    writing ? 'Creating…' : title.trim().length === 0 ? 'Give the document a title.' : rowCount === 0 ? 'Paste or choose some text first.' : null,
  );

  async function pickFile() {
    if (!isTauri()) return;
    errorMessage = null;
    const dialog = await import('@tauri-apps/plugin-dialog');
    const path = await dialog.open({
      multiple: false,
      title: 'Choose a text file',
      filters: [{ name: 'Text', extensions: ['md', 'txt'] }],
    });
    if (typeof path !== 'string') return; // cancelled
    const fs = await import('@tauri-apps/plugin-fs');
    text = await fs.readTextFile(path);
    fileName = path.split('/').pop() ?? path;
  }

  async function create() {
    if (createBlocked) return;
    writing = true;
    errorMessage = null;
    try {
      const { work, file } = createFreeDocument(
        { title, language, unit, text },
        existingIds,
      );
      const content = serializeChapterFile(file);
      await libraryStorage().write(work.id, chapterFileName(1, 1), content);
      await registerFreeWork(work);
      onCreated(work.id);
    } catch (err) {
      console.error('[new-document] create failed', err);
      errorMessage = err instanceof Error ? err.message : "The document couldn't be created.";
      writing = false;
    }
  }
</script>

<div class="scrim" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-label="New document">
    <header class="dialog-head">
      <h2>New document</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <div class="dialog-body">
      {#if errorMessage}
        <p class="line error">{errorMessage}</p>
      {/if}

      <div class="form-grid">
        <label class="field">
          <span>Title</span>
          <input type="text" bind:value={title} placeholder="My translation project" />
        </label>
        <label class="field">
          <span>Language (optional)</span>
          <input type="text" bind:value={language} placeholder="Greek, German, …" />
        </label>
      </div>

      <label class="field text-field">
        <span>Text</span>
        <textarea
          bind:value={text}
          rows="10"
          placeholder="Paste the original text here…"
        ></textarea>
      </label>

      {#if isTauri()}
        <div class="file-row">
          <button class="secondary-btn" onclick={pickFile}>Choose a text file…</button>
          {#if fileName}
            <span class="file-name">{fileName}</span>
          {/if}
        </div>
      {/if}

      <fieldset class="unit-fieldset">
        <legend>Segment into</legend>
        <label class="radio">
          <input
            type="radio"
            name="unit"
            value="paragraphs"
            checked={unit === 'paragraphs'}
            onchange={() => (unitOverride = 'paragraphs')}
          />
          Paragraphs
        </label>
        <label class="radio">
          <input
            type="radio"
            name="unit"
            value="lines"
            checked={unit === 'lines'}
            onchange={() => (unitOverride = 'lines')}
          />
          Lines
        </label>
        {#if preview}
          <span class="preview">{preview}</span>
        {/if}
      </fieldset>

      <div class="form-actions">
        <button class="secondary-btn" onclick={onClose}>Cancel</button>
        <button
          class="primary-btn"
          disabled={createBlocked !== null}
          title={createBlocked ?? undefined}
          onclick={create}
        >
          {writing ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 40;
  }

  .dialog {
    width: 520px;
    max-width: calc(100vw - 2 * var(--space-4));
    background: var(--col-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--popup-shadow);
  }

  .dialog-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .dialog-head h2 {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-mid);
  }

  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-mid);
    cursor: pointer;
  }
  .close-btn:hover {
    color: var(--text);
    background: var(--ui-hover);
  }

  .dialog-body {
    padding: var(--space-4);
    max-height: calc(100vh - 2 * var(--space-4) - 3rem);
    overflow-y: auto;
  }

  .line {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text-mid);
  }
  .error {
    color: var(--error);
    margin-bottom: var(--space-3);
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-mid);
  }
  .field input,
  .field textarea {
    font-family: var(--font-english);
    font-size: 0.9rem;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
  }
  .field textarea {
    resize: vertical;
    line-height: 1.45;
  }
  .text-field {
    margin-top: var(--space-3);
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .file-name {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-light);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .unit-fieldset {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .unit-fieldset legend {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--text-light);
    padding: 0 var(--space-1);
  }
  .radio {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-ui);
    font-size: 0.84rem;
    color: var(--text);
    cursor: pointer;
  }
  .preview {
    margin-left: auto;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    color: var(--text-light);
    font-variant-numeric: tabular-nums;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
  .primary-btn {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--on-accent);
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
  }
  .primary-btn:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .primary-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .secondary-btn {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--text-mid);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
  }
  .secondary-btn:hover {
    color: var(--text);
    background: var(--ui-hover);
  }
</style>
