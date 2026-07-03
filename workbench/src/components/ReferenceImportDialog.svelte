<script module lang="ts">
  /** Book/chapter lists for the assignment dropdowns — App passes the same
   * shape it builds for the rail (manifest books + corpus chapter numbers). */
  export interface ReferenceImportBook {
    n: number;
    label: string;
    chapters: number[];
  }
</script>

<script lang="ts">
  // "Import reference…" dialog (design doc D5 §5). Steps:
  //   edition → source (paste or native .txt/.md picker) → assignment table
  //   → (Replace/Cancel duplicate guard) → write.
  // The assignment pre-pass (proposeSplits) only pre-fills the editable
  // table; the user confirms every row. Unassigned sections are dropped with
  // a visible count sentence — never silently. Every failure mode is one
  // plain sentence. All write logic lives in lib/referenceui/importModel.ts
  // (pure, tested); this component is the skin, following ImportDialog.
  import { isTauri } from '../lib/runtime';
  import type { WorkManifest } from '../lib/works/manifest';
  import { referenceStorage } from '../lib/reference/storage';
  import { proposeSplits } from '../lib/reference/assign';
  import { deriveSlug } from '../lib/reference/manifest';
  import type { ReferenceManifest } from '../lib/reference/types';
  import { loadEditions } from '../lib/referenceui/editions';
  import {
    duplicateTargets,
    importGate,
    replaceQuestion,
    rowsFromBlocks,
    unassignedSentence,
    writeAssignedBlocks,
    type AssignmentRow,
  } from '../lib/referenceui/importModel';

  let {
    work,
    books,
    onClose,
    onImported,
  }: {
    /** The work this reference belongs to (the rail button's work). */
    work: WorkManifest;
    books: ReferenceImportBook[];
    onClose: () => void;
    /** Called after a successful write with the chapters just imported, so
     * the host can refresh an open ReferencePanel. */
    onImported: (written: Array<{ book: number; chapter: number }>, slug: string) => void;
  } = $props();

  type Phase = 'edition' | 'source' | 'assign' | 'duplicate' | 'writing' | 'done';
  let phase = $state<Phase>('edition');
  let errorMessage = $state<string | null>(null);

  // ── edition step ────────────────────────────────────────────────────────
  const NEW_EDITION = '__new__';
  let existingEditions = $state<ReferenceManifest[]>([]);
  let editionsLoaded = $state(false);
  let editionChoice = $state<string>(NEW_EDITION);
  let newDisplayName = $state('');

  $effect(() => {
    void (async () => {
      const result = await loadEditions(referenceStorage(), work.id);
      existingEditions = result.editions;
      if (result.editions.length > 0) editionChoice = result.editions[0].slug;
      editionsLoaded = true;
    })();
  });

  const chosenExisting = $derived(
    editionChoice === NEW_EDITION
      ? null
      : (existingEditions.find((e) => e.slug === editionChoice) ?? null),
  );
  /** Slug auto-derived from the display name, collision-guarded (D5 §5.1). */
  const newSlug = $derived(
    deriveSlug(newDisplayName || 'edition', existingEditions.map((e) => e.slug)),
  );
  const editionReady = $derived(
    editionChoice !== NEW_EDITION || newDisplayName.trim().length > 0,
  );
  const editionDisplayName = $derived(
    chosenExisting ? chosenExisting.displayName : newDisplayName.trim(),
  );
  const editionSlug = $derived(chosenExisting ? chosenExisting.slug : newSlug);

  // ── source step ─────────────────────────────────────────────────────────
  const devHarness = !isTauri() && import.meta.env.DEV;
  let sourceText = $state('');

  async function pickSourceFile() {
    if (!isTauri()) return;
    errorMessage = null;
    const dialog = await import('@tauri-apps/plugin-dialog');
    const path = await dialog.open({
      multiple: false,
      title: 'Choose a reference translation file',
      filters: [{ name: 'Text', extensions: ['md', 'txt'] }],
    });
    if (typeof path !== 'string') return; // cancelled
    const fs = await import('@tauri-apps/plugin-fs');
    let raw: string;
    try {
      raw = await fs.readTextFile(path);
    } catch {
      errorMessage = "This file couldn't be read.";
      return;
    }
    if (raw.trim().length === 0) {
      errorMessage = 'This file was empty — there was nothing to import.';
      return;
    }
    sourceText = raw;
  }

  // ── assignment step ─────────────────────────────────────────────────────
  let rows = $state<AssignmentRow[]>([]);

  function toAssignment() {
    errorMessage = null;
    rows = rowsFromBlocks(proposeSplits(sourceText));
    phase = 'assign';
  }

  function chaptersForBook(book: number | null): number[] {
    if (book === null) return [];
    return books.find((b) => b.n === book)?.chapters ?? [];
  }

  function setRowBook(index: number, value: string) {
    const book = value === '' ? null : Number(value);
    const prev = rows[index];
    const chapters = chaptersForBook(book);
    rows[index] = {
      ...prev,
      book,
      // Keep the chapter only if it exists in the newly chosen book.
      chapter: prev.chapter !== null && chapters.includes(prev.chapter) ? prev.chapter : null,
    };
  }

  function setRowChapter(index: number, value: string) {
    rows[index] = { ...rows[index], chapter: value === '' ? null : Number(value) };
  }

  function snippet(text: string): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
  }

  const gate = $derived(importGate(rows));
  const dropSentence = $derived(unassignedSentence(rows));
  const duplicates = $derived(duplicateTargets(rows, chosenExisting));

  // ── duplicate guard + write ─────────────────────────────────────────────
  function confirmImport() {
    if (!gate.enabled) return;
    if (duplicates.length > 0) {
      phase = 'duplicate';
      return;
    }
    void writeNow();
  }

  let successMessage = $state('');

  async function writeNow() {
    phase = 'writing';
    errorMessage = null;
    try {
      const result = await writeAssignedBlocks(referenceStorage(), {
        workId: work.id,
        slug: editionSlug,
        displayName: editionDisplayName,
        existingManifest: chosenExisting,
        rows,
        now: new Date().toISOString(),
      });
      const n = result.written.length;
      successMessage =
        n === 1
          ? `Imported 1 chapter into ${editionDisplayName}.`
          : `Imported ${n} chapters into ${editionDisplayName}.`;
      phase = 'done';
      onImported(
        result.written.map(({ book, chapter }) => ({ book, chapter })),
        editionSlug,
      );
    } catch (err) {
      console.error('[reference import] write failed', err);
      errorMessage = "This reference couldn't be saved.";
      phase = 'assign';
    }
  }
</script>

<div class="scrim" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Import reference translation">
    <header class="dialog-head">
      <h2>Import reference</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <div class="dialog-body" class:wide={phase === 'assign'}>
      {#if errorMessage}
        <p class="line error">{errorMessage}</p>
      {/if}

      {#if phase === 'edition'}
        <p class="line">Which edition of {work.title} is this?</p>
        {#if editionsLoaded}
          <div class="edition-list">
            {#each existingEditions as edition (edition.slug)}
              <label class="choice">
                <input type="radio" name="edition" value={edition.slug} bind:group={editionChoice} />
                <span>{edition.displayName}</span>
              </label>
            {/each}
            <label class="choice">
              <input type="radio" name="edition" value={NEW_EDITION} bind:group={editionChoice} />
              <span>New edition…</span>
            </label>
          </div>
          {#if editionChoice === NEW_EDITION}
            <label class="field">
              <span>Edition name</span>
              <input type="text" bind:value={newDisplayName} placeholder="Ross (Oxford, 1924)" />
            </label>
            {#if newDisplayName.trim()}
              <p class="line note">Saved as “{newSlug}”.</p>
            {/if}
          {/if}
          <div class="form-actions">
            <button class="secondary-btn" onclick={onClose}>Cancel</button>
            <button class="primary-btn" disabled={!editionReady} onclick={() => (phase = 'source')}>
              Continue
            </button>
          </div>
        {/if}
      {:else if phase === 'source'}
        <p class="line">Paste the translation text, or choose a plain-text or Markdown file.</p>
        <textarea
          class="paste-box"
          bind:value={sourceText}
          rows="10"
          placeholder="Paste the reference translation here…"
        ></textarea>
        {#if isTauri()}
          <button class="pick-btn" onclick={pickSourceFile}>Choose a .txt / .md file…</button>
        {:else if !devHarness}
          <p class="line note">Choosing a file is only available in the desktop app.</p>
        {/if}
        <div class="form-actions">
          <button class="secondary-btn" onclick={() => (phase = 'edition')}>Back</button>
          <button class="primary-btn" disabled={sourceText.trim().length === 0} onclick={toAssignment}>
            Continue
          </button>
        </div>
      {:else if phase === 'assign'}
        <p class="line">
          Say which chapter each section belongs to. Detected headings have been filled in — check
          them.
        </p>
        <div class="table-wrap">
          <table class="assign-table">
            <thead>
              <tr>
                <th class="col-text">Section</th>
                <th class="col-book">Book</th>
                <th class="col-chapter">Chapter</th>
              </tr>
            </thead>
            <tbody>
              {#each rows as row, i (i)}
                <tr class:unassigned={row.book === null || row.chapter === null}>
                  <td class="col-text">{snippet(row.text)}</td>
                  <td class="col-book">
                    <select
                      aria-label="Book for section {i + 1}"
                      value={row.book === null ? '' : String(row.book)}
                      onchange={(e) => setRowBook(i, (e.currentTarget as HTMLSelectElement).value)}
                    >
                      <option value="">—</option>
                      {#each books as b (b.n)}
                        <option value={String(b.n)}>{b.label}</option>
                      {/each}
                    </select>
                  </td>
                  <td class="col-chapter">
                    <select
                      aria-label="Chapter for section {i + 1}"
                      value={row.chapter === null ? '' : String(row.chapter)}
                      disabled={row.book === null}
                      onchange={(e) => setRowChapter(i, (e.currentTarget as HTMLSelectElement).value)}
                    >
                      <option value="">—</option>
                      {#each chaptersForBook(row.book) as c (c)}
                        <option value={String(c)}>{c}</option>
                      {/each}
                    </select>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if dropSentence}
          <p class="line note">{dropSentence}</p>
        {/if}
        <div class="form-actions">
          {#if gate.reason}
            <span class="gate-reason">{gate.reason}</span>
          {/if}
          <span class="spacer"></span>
          <button class="secondary-btn" onclick={() => (phase = 'source')}>Back</button>
          <button class="primary-btn" disabled={!gate.enabled} onclick={confirmImport}>Import</button>
        </div>
      {:else if phase === 'duplicate'}
        {#each duplicates as dup (`${dup.book}:${dup.chapter}`)}
          <p class="line">{replaceQuestion(editionDisplayName, dup.book, dup.chapter)}</p>
        {/each}
        <div class="form-actions">
          <button class="secondary-btn" onclick={() => (phase = 'assign')}>Cancel</button>
          <button class="primary-btn" onclick={() => void writeNow()}>Replace</button>
        </div>
      {:else if phase === 'writing'}
        <p class="line">Saving…</p>
      {:else if phase === 'done'}
        <p class="line">{successMessage}</p>
        <div class="form-actions">
          <button class="primary-btn" onclick={onClose}>Done</button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Same scrim/dialog skin as ImportDialog.svelte. */
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
    width: 440px;
    max-width: calc(100vw - 2 * var(--space-4));
    max-height: calc(100vh - 2 * var(--space-4));
    display: flex;
    flex-direction: column;
    background: var(--col-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--popup-shadow);
  }
  .dialog:has(.dialog-body.wide) {
    width: min(760px, calc(100vw - 2 * var(--space-4)));
  }

  .dialog-head {
    flex: none;
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
    overflow-y: auto;
    min-height: 0;
  }
  .dialog-body.wide {
    flex: 1;
  }

  .line {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text-mid);
  }
  .line + .line {
    margin-top: var(--space-2);
  }
  .line.error {
    color: var(--error);
    margin-bottom: var(--space-2);
  }
  .line.note {
    margin-top: var(--space-2);
    font-style: italic;
    color: var(--text-light);
  }

  .edition-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  .choice {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-english);
    font-size: 0.92rem;
    color: var(--text);
    cursor: pointer;
  }
  .choice input {
    accent-color: var(--accent);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-3);
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-mid);
  }
  .field input {
    font-family: var(--font-english);
    font-size: 0.9rem;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
  }

  .paste-box {
    width: 100%;
    margin-top: var(--space-3);
    resize: vertical;
    font-family: var(--font-english);
    font-size: 0.88rem;
    line-height: 1.45;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
  }

  .pick-btn {
    margin-top: var(--space-2);
    font-family: var(--font-english);
    font-size: 0.9rem;
    text-align: left;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
  }
  .pick-btn:hover {
    border-color: var(--accent-light);
    background: color-mix(in srgb, var(--accent) 5%, var(--input-bg));
  }

  .form-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
  .gate-reason {
    font-family: var(--font-english);
    font-size: 0.8rem;
    font-style: italic;
    color: var(--text-mid);
  }
  .spacer {
    flex: 1;
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

  /* ── assignment table ──────────────────────────────────────────────── */
  .table-wrap {
    margin-top: var(--space-3);
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .assign-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-ui);
    font-size: 0.82rem;
  }
  .assign-table thead th {
    text-align: left;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-light);
    padding: var(--space-2);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--col-bg);
  }
  .assign-table tbody tr {
    border-bottom: 1px solid var(--border);
  }
  .assign-table tbody tr:last-child {
    border-bottom: none;
  }
  .assign-table tbody tr.unassigned {
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .assign-table td {
    padding: var(--space-2);
    vertical-align: top;
  }
  .col-text {
    font-family: var(--font-english);
    font-size: 0.85rem;
    color: var(--text);
  }
  .col-book,
  .col-chapter {
    white-space: nowrap;
    width: 7rem;
  }
  .assign-table select {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 0.2rem 0.35rem;
    max-width: 100%;
  }
  .assign-table select:disabled {
    opacity: 0.5;
  }
</style>
