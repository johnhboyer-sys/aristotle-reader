<script lang="ts">
  // "Import a text…" — bring in any author from a TLG/PHI disc or from Perseus,
  // keeping the citations the source printed (src/lib/import/createSourceImport.ts).
  //
  // Three routes in one dialog because they end in the same place: rows with
  // addresses. They differ only in where the TEI comes from, and in what they
  // need installed — the disc route needs Diogenes to read the disc, the two
  // Perseus routes need nothing. The dialog says so rather than letting a user
  // discover it from a failure.
  import { pickDiscDir, readDiscAuthors, readAuthorWorks, importFromDisc } from '../lib/import/discImport';
  import type { DiscAuthor } from '../lib/corpus/authtab';
  import type { DiscWork } from '../lib/corpus/idtWorks';
  import type { LineMode } from '../lib/corpus/discExport';
  import { filterAuthors } from '../lib/corpus/authtab';
  import { fetchPerseusTei, importPerseusTei, parseCtsUrn, languageFor } from '../lib/import/perseusSource';
  import type { SourceImport } from '../lib/import/createSourceImport';
  import { serializeChapterFile } from '../lib/chapterfile';
  import { libraryStorage, chapterFileName } from '../lib/library/storage';
  import { registerFreeWork } from '../lib/works/freeWorks';
  import { loadSettings, updateSettings } from '../lib/settings';

  let {
    existingIds,
    onClose,
    onCreated,
  }: {
    existingIds: string[];
    onClose: () => void;
    onCreated: (workId: string) => void;
  } = $props();

  type Route = 'disc' | 'file' | 'link';

  let route = $state<Route>('disc');
  let errorMessage = $state<string | null>(null);
  /** Set while a slow step runs; also the text shown on the button. */
  let busy = $state<string | null>(null);

  // ── disc route ────────────────────────────────────────────────────────────
  let discDir = $state<string | null>(null);
  let authors = $state<DiscAuthor[]>([]);
  let authorQuery = $state('');
  let selectedAuthor = $state<DiscAuthor | null>(null);
  let works = $state<DiscWork[]>([]);
  let selectedWork = $state<DiscWork | null>(null);
  // Verse by default: it is the only mode that keeps the edition's line
  // numbers, and it is what the corpus pipeline has always run.
  let lineMode = $state<LineMode>('lines');

  // Cap what's rendered: a TLG disc lists ~1,800 authors and drawing them all
  // makes every keystroke in the filter box janky.
  const AUTHOR_LIMIT = 200;
  const matchingAuthors = $derived(filterAuthors(authors, authorQuery));
  const shownAuthors = $derived(matchingAuthors.slice(0, AUTHOR_LIMIT));
  const hiddenAuthorCount = $derived(matchingAuthors.length - shownAuthors.length);

  // ── perseus routes ────────────────────────────────────────────────────────
  let fileXml = $state<string | null>(null);
  let fileName = $state<string | null>(null);
  let link = $state('');
  const linkUrn = $derived(link.trim().length === 0 ? null : parseCtsUrn(link));

  $effect(() => {
    void (async () => {
      const settings = await loadSettings();
      const saved = settings.tlgDir ?? settings.phiDir;
      if (saved && discDir === null) await useDisc(saved, false);
    })();
  });

  async function chooseDisc() {
    const picked = await pickDiscDir();
    if (picked === null) return;
    await useDisc(picked, true);
  }

  /** Read a disc folder's author list. `remember` saves it for next time. */
  async function useDisc(dir: string, remember: boolean) {
    errorMessage = null;
    busy = 'Reading the disc…';
    try {
      const list = await readDiscAuthors(dir);
      authors = list;
      discDir = dir;
      selectedAuthor = null;
      works = [];
      selectedWork = null;
      if (remember) {
        // Which disc this is decides which setting it lands in — Diogenes
        // reads them through different environment variables.
        const isPhi = list.length > 0 && !list[0].id.startsWith('TLG');
        await updateSettings(isPhi ? { phiDir: dir } : { tlgDir: dir });
      }
    } catch (err) {
      console.error('[import] reading disc failed', err);
      errorMessage = err instanceof Error ? err.message : 'That folder could not be read.';
    } finally {
      busy = null;
    }
  }

  async function chooseAuthor(author: DiscAuthor) {
    if (discDir === null) return;
    selectedAuthor = author;
    selectedWork = null;
    works = [];
    errorMessage = null;
    try {
      works = await readAuthorWorks(discDir, author);
    } catch (err) {
      console.error('[import] reading works failed', err);
      errorMessage = err instanceof Error ? err.message : 'That author’s works could not be read.';
    }
  }

  async function pickTeiFile() {
    errorMessage = null;
    const dialog = await import('@tauri-apps/plugin-dialog');
    const path = await dialog.open({
      multiple: false,
      title: 'Choose a TEI file',
      filters: [{ name: 'TEI XML', extensions: ['xml'] }],
    });
    if (typeof path !== 'string') return;
    const fs = await import('@tauri-apps/plugin-fs');
    fileXml = await fs.readTextFile(path);
    fileName = path.split(/[\\/]/).pop() ?? path;
  }

  const blocked = $derived(
    busy
      ? busy
      : route === 'disc'
        ? discDir === null
          ? 'Choose your TLG or PHI folder first.'
          : selectedWork === null
            ? 'Choose a work.'
            : null
        : route === 'file'
          ? fileXml === null
            ? 'Choose a TEI file first.'
            : null
          : link.trim().length === 0
            ? 'Paste a Scaife address or CTS urn.'
            : linkUrn === null
              ? 'That doesn’t look like a Perseus address.'
              : null,
  );

  async function build(): Promise<SourceImport> {
    if (route === 'disc') {
      // Diogenes cannot export one work, so the first import of an author
      // exports all of them. Say so instead of looking frozen.
      busy = `Reading ${selectedAuthor?.name ?? 'the author'} from the disc — this can take a few minutes the first time…`;
      return importFromDisc({ discDir: discDir!, author: selectedAuthor!, work: selectedWork!, lineMode });
    }
    if (route === 'file') {
      busy = 'Reading the file…';
      return importPerseusTei(fileXml!, { existingIds });
    }
    busy = 'Fetching from Perseus…';
    const xml = await fetchPerseusTei(link);
    return importPerseusTei(xml, {
      ...(linkUrn ? { language: languageFor(linkUrn) } : {}),
      existingIds,
    });
  }

  async function importNow() {
    if (blocked) return;
    errorMessage = null;
    try {
      const { work, file } = await build();
      busy = 'Saving…';
      await libraryStorage().write(work.id, chapterFileName(1, 1), serializeChapterFile(file));
      await registerFreeWork(work);
      onCreated(work.id);
    } catch (err) {
      console.error('[import] failed', err);
      errorMessage = err instanceof Error ? err.message : 'That text could not be imported.';
    } finally {
      busy = null;
    }
  }
</script>

<div class="scrim" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Import a text">
    <header class="dialog-head">
      <h2>Import a text</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <div class="dialog-body">
      <div class="routes" role="tablist" aria-label="Where the text comes from">
        <button role="tab" aria-selected={route === 'disc'} class:active={route === 'disc'} onclick={() => (route = 'disc')}>
          TLG or PHI disc
        </button>
        <button role="tab" aria-selected={route === 'file'} class:active={route === 'file'} onclick={() => (route = 'file')}>
          A file
        </button>
        <button role="tab" aria-selected={route === 'link'} class:active={route === 'link'} onclick={() => (route = 'link')}>
          Perseus
        </button>
      </div>

      {#if route === 'disc'}
        <p class="note">
          Reading a TLG or PHI disc needs Diogenes installed — it does the work of decoding the disc.
          The other two ways of importing need nothing.
        </p>

        <div class="row">
          <button class="secondary-btn" onclick={chooseDisc}>Choose your TLG or PHI folder…</button>
          {#if discDir}
            <span class="path">{discDir}</span>
          {/if}
        </div>

        {#if authors.length > 0}
          <label class="field">
            <span>Author</span>
            <input type="text" bind:value={authorQuery} placeholder="Type to narrow {authors.length} authors" />
          </label>

          <ul class="picker">
            {#each shownAuthors as author (author.id)}
              <li>
                <button class:selected={selectedAuthor?.id === author.id} onclick={() => chooseAuthor(author)}>
                  {author.name}
                </button>
              </li>
            {/each}
          </ul>
          {#if hiddenAuthorCount > 0}
            <p class="hint">…and {hiddenAuthorCount} more — keep typing to narrow the list.</p>
          {/if}
        {/if}

        {#if works.length > 0}
          <ul class="picker">
            {#each works as work (work.number)}
              <li>
                <button class:selected={selectedWork?.number === work.number} onclick={() => (selectedWork = work)}>
                  {work.title}
                  <span class="levels">{work.levelNames.join(' · ')}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else if selectedAuthor}
          <p class="hint">That author has no works listed on this disc.</p>
        {/if}

        {#if selectedWork}
          <label class="field">
            <span>Rows</span>
            <select bind:value={lineMode}>
              <option value="lines">One printed line each, numbered — 402a.1, 402a.2</option>
              <option value="prose">One section each, lines run together — 402a</option>
              <option value="auto">Whatever Diogenes judges right for this work</option>
            </select>
          </label>
          <p class="hint">
            Numbered lines are what a citation like <em>De anima</em> 402a.7 refers to. Running them
            together reads better but loses the numbers, and Diogenes' own judgment calls most of
            Aristotle prose.
          </p>
        {/if}
      {:else if route === 'file'}
        <p class="note">
          A TEI file you downloaded — from Perseus, the First1KGreek project, or anywhere else that
          publishes TEI. The citations come from the file.
        </p>
        <div class="row">
          <button class="secondary-btn" onclick={pickTeiFile}>Choose a TEI file…</button>
          {#if fileName}
            <span class="path">{fileName}</span>
          {/if}
        </div>
      {:else}
        <p class="note">
          Paste an address from Scaife, or a CTS urn. The whole work is imported, so a passage
          reference on the end is ignored.
        </p>
        <label class="field">
          <span>Address</span>
          <input type="text" bind:value={link} placeholder="urn:cts:greekLit:tlg0059.tlg030.perseus-grc2" />
        </label>
        {#if linkUrn}
          <p class="hint">{linkUrn.group}.{linkUrn.work}{linkUrn.version ? `.${linkUrn.version}` : ''} — {languageFor(linkUrn) ?? 'unknown language'}</p>
        {/if}
      {/if}

      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}
    </div>

    <footer class="dialog-foot">
      {#if blocked && !busy}
        <span class="hint">{blocked}</span>
      {/if}
      <button class="primary-btn" disabled={blocked !== null} onclick={importNow}>
        {busy ? 'Working…' : 'Import'}
      </button>
    </footer>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: var(--scrim, rgba(0, 0, 0, 0.35));
    display: grid;
    place-items: center;
    z-index: 50;
  }

  .dialog {
    width: min(38rem, calc(100vw - 2rem));
    height: 34rem;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: var(--radius-2, 8px);
    box-shadow: var(--shadow-3, 0 12px 40px rgba(0, 0, 0, 0.3));
  }

  .dialog-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--rule);
  }

  .dialog-head h2 {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .close-btn {
    background: none;
    border: 0;
    color: var(--ink-3);
    cursor: pointer;
    padding: var(--space-1);
  }

  .dialog-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .routes {
    display: flex;
    gap: var(--space-1);
    border-bottom: 1px solid var(--rule);
  }

  .routes button {
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: var(--space-2) var(--space-3);
    color: var(--ink-2);
    cursor: pointer;
    font: inherit;
  }

  .routes button.active {
    color: var(--ink-1);
    border-bottom-color: var(--accent, currentColor);
  }

  .note {
    margin: 0;
    color: var(--ink-2);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .path {
    color: var(--ink-3);
    font-size: 0.8rem;
    word-break: break-all;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field span {
    font-size: 0.8rem;
    color: var(--ink-2);
  }

  .field input {
    font: inherit;
    padding: var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-1, 4px);
    background: var(--surface-2, transparent);
    color: var(--ink-1);
  }

  .picker {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 11rem;
    overflow-y: auto;
    border: 1px solid var(--rule);
    border-radius: var(--radius-1, 4px);
  }

  .picker button {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    padding: var(--space-2) var(--space-3);
    color: var(--ink-1);
    cursor: pointer;
    font: inherit;
  }

  .picker button.selected {
    background: var(--surface-3, rgba(127, 127, 127, 0.16));
  }

  .levels {
    color: var(--ink-3);
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .hint {
    margin: 0;
    color: var(--ink-3);
    font-size: 0.8rem;
  }

  .error {
    margin: 0;
    color: var(--danger, #b3261e);
    font-size: 0.9rem;
  }

  .dialog-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--rule);
  }

  .primary-btn {
    font: inherit;
    padding: var(--space-2) var(--space-4);
    border: 0;
    border-radius: var(--radius-1, 4px);
    background: var(--accent, #6b4423);
    color: var(--on-accent, #fff);
    cursor: pointer;
  }

  .primary-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .secondary-btn {
    font: inherit;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-1, 4px);
    background: none;
    color: var(--ink-1);
    cursor: pointer;
  }
</style>
