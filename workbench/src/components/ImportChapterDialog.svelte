<script lang="ts">
  // "Import into chapter…" — fill a Book/Chapter container slot of a
  // document-spine free work (D8 structure tools). Unlike "New document…",
  // there is no title / language / unit choice: the work already exists, so
  // the target (work, book, chapter) and the segmentation scheme are fixed —
  // the user only supplies the text (pasted and/or from a file). The file is
  // segmented by buildDocumentChapterFile and written to the slot's b##c##.md.
  import { isTauri } from '../lib/runtime';
  import { splitIntoLineRows, splitIntoParagraphRows } from '../lib/import/segmentDetect';
  import { buildDocumentChapterFile, documentUnitForScheme } from '../lib/import/createFreeDocument';
  import type { SchemeId } from '../lib/citation/types';
  import { serializeChapterFile } from '../lib/chapterfile';
  import { libraryStorage, chapterFileName } from '../lib/library/storage';

  let {
    workId,
    book,
    chapter,
    scheme,
    bookLabel,
    chapterLabel,
    onClose,
    onImported,
  }: {
    workId: string;
    book: number;
    chapter: number;
    /** The work's document-spine scheme — fixes the segmentation unit. */
    scheme: SchemeId;
    bookLabel: string;
    chapterLabel: string;
    onClose: () => void;
    /** Called after the slot's file is written so App can refresh + open it. */
    onImported: () => void;
  } = $props();

  let text = $state('');
  let fileName = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let writing = $state(false);

  const asParagraphs = $derived(documentUnitForScheme(scheme) === 'paragraphs');
  const rowCount = $derived(
    asParagraphs ? splitIntoParagraphRows(text).length : splitIntoLineRows(text).lines.length,
  );
  const unitWord = $derived(asParagraphs ? 'paragraph' : 'line');
  const preview = $derived(
    text.trim().length === 0 ? null : `${rowCount} ${unitWord}${rowCount === 1 ? '' : 's'}`,
  );

  const importBlocked = $derived(
    writing ? 'Importing…' : rowCount === 0 ? 'Paste or choose some text first.' : null,
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

  async function runImport() {
    if (importBlocked) return;
    writing = true;
    errorMessage = null;
    try {
      const file = buildDocumentChapterFile({ workId, book, chapter, scheme, text });
      await libraryStorage().write(workId, chapterFileName(book, chapter), serializeChapterFile(file));
      onImported();
    } catch (err) {
      console.error('[import-chapter] import failed', err);
      errorMessage = err instanceof Error ? err.message : "The text couldn't be imported.";
      writing = false;
    }
  }
</script>

<div class="scrim" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Import into chapter">
    <header class="dialog-head">
      <h2>Import into {bookLabel} · {chapterLabel}</h2>
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

      <label class="field text-field">
        <span>Text</span>
        <textarea
          bind:value={text}
          rows="10"
          placeholder="Paste this chapter's original text here…"
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

      <p class="hint">
        Segments into {unitWord}s (this work's format){#if preview} — {preview}{/if}.
      </p>

      <div class="form-actions">
        <button class="secondary-btn" onclick={onClose}>Cancel</button>
        <button
          class="primary-btn"
          disabled={importBlocked !== null}
          title={importBlocked ?? undefined}
          onclick={runImport}
        >
          {writing ? 'Importing…' : 'Import'}
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
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-mid);
  }
  .field textarea {
    font-family: var(--font-english);
    font-size: 0.9rem;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    resize: vertical;
    line-height: 1.45;
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
  .hint {
    margin-top: var(--space-3);
    font-family: var(--font-ui);
    font-size: 0.78rem;
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
