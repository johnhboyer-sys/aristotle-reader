<script lang="ts">
  // Single-chapter → Word export (build spec §8). Tauri-only: the whole
  // control is invisible in the browser harness — export needs the shell
  // plugin for pandoc and a native save dialog. Every failure is one plain
  // sentence; stderr goes to the console only.
  import { isTauri } from '../lib/runtime';
  import { libraryStorage, chapterFileName } from '../lib/library/storage';
  import { parseChapterFile } from '../lib/chapterfile';
  import { chapterToPandocMarkdown } from '../lib/export';
  import {
    defaultSavePath,
    exportSettings,
    resolveExportPandoc,
    resolveReferenceDoc,
  } from '../lib/export/tauriExport';
  import type { WorkManifest } from '../lib/works/manifest';
  import CompileDialog from './CompileDialog.svelte';

  let {
    work,
    book,
    chapter,
  }: { work: WorkManifest | null; book: number; chapter: number } = $props();

  let status = $state<string | null>(null);
  let busy = $state(false);
  let compileOpen = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function note(msg: string) {
    status = msg;
    clearTimeout(timer);
    timer = setTimeout(() => (status = null), 5000);
  }

  async function exportChapter() {
    if (!work || book < 1 || chapter < 1 || busy) return;
    busy = true;
    try {
      const raw = await libraryStorage().read(work.id, chapterFileName(book, chapter));
      if (!raw) {
        note('Nothing to export yet.');
        return;
      }
      const parsed = parseChapterFile(raw);

      // Export defaults come from Settings › Export; each fallback below is the
      // literal this component used before those settings existed.
      const prefs = await exportSettings();

      const pandoc = await resolveExportPandoc(prefs.pandocPath);
      if ('message' in pandoc) {
        note(pandoc.message);
        return;
      }

      const dialog = await import('@tauri-apps/plugin-dialog');
      const label = work.books[book - 1]?.label ?? String(book);
      const docxPath = await dialog.save({
        defaultPath: await defaultSavePath(`${work.title} ${label}.${chapter}.docx`, prefs.outputDir),
        filters: [{ name: 'Word document', extensions: ['docx'] }],
      });
      if (!docxPath) return; // user cancelled — not a failure

      const markdown = chapterToPandocMarkdown(parsed, work, { stampMode: prefs.stampMode ?? 'every-5' });
      const pathApi = await import('@tauri-apps/api/path');
      const fs = await import('@tauri-apps/plugin-fs');
      const appData = await pathApi.appDataDir();
      await fs.mkdir(appData, { recursive: true }).catch(() => {});
      const mdPath = await pathApi.join(appData, 'export-intermediate.md');
      await fs.writeTextFile(mdPath, markdown);

      // No bundled fallback here: single-chapter export has never applied the
      // house reference doc, and an unset setting must not start doing so.
      const referenceDocPath = await resolveReferenceDoc(prefs.referenceDocPath, false);
      const run = await pandoc.run({ markdownPath: mdPath, docxPath, referenceDocPath });
      if (run.code !== 0) {
        console.error('[export] pandoc failed:', run.stderr);
        note("The Word document couldn't be created.");
        return;
      }

      note('Exported.');
      const opener = await import('@tauri-apps/plugin-opener');
      void opener.revealItemInDir(docxPath).catch(() => {});
    } catch (err) {
      console.error('[export]', err);
      note("The Word document couldn't be created.");
    } finally {
      busy = false;
    }
  }
</script>

{#if isTauri()}
  <span class="tb-divider" aria-hidden="true"></span>
  <span class="export-wrap">
    <button
      class="icon-btn"
      onclick={exportChapter}
      disabled={busy || !work}
      title="Export chapter as Word document…"
      aria-label="Export chapter as Word document"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3v10m0 0l-4-4m4 4l4-4" />
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
    </button>
    <button
      class="icon-btn"
      onclick={() => (compileOpen = true)}
      disabled={!work}
      title="Export whole work as Word document…"
      aria-label="Export whole work as Word document"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
        <path d="M14 4v5h5" />
        <path d="M8 13h8M8 16.5h8" />
      </svg>
    </button>
    {#if status}
      <span class="export-status" role="status">{status}</span>
    {/if}
  </span>
  {#if compileOpen && work}
    <CompileDialog {work} onClose={() => (compileOpen = false)} />
  {/if}
{/if}

<style>
  .export-wrap {
    position: relative;
    display: inline-flex;
  }
  .tb-divider {
    flex: none;
    align-self: center;
    width: 1px;
    height: 1.1rem;
    background: var(--border);
    margin: 0 var(--space-2);
  }
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.9rem;
    height: 1.9rem;
    flex: none;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-mid);
    cursor: pointer;
  }
  .icon-btn:hover:not(:disabled) {
    color: var(--text);
    background: var(--ui-hover);
  }
  .icon-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  /* Same skin as the editor's transient status pill (editor.css) — one
     consistent notice style across the app. */
  .export-status {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 30;
    white-space: nowrap;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-mid);
    background: var(--popup-bg);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.35rem 0.8rem;
    box-shadow: var(--popup-shadow);
  }
</style>
