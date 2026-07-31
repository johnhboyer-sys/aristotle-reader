<script lang="ts">
  // The Lexicon pane: install, review, and remove lexicon packs.
  //
  // The app ships with no dictionary at all — that is what keeps the download
  // small. A pack is one language's COMPLETE dictionary plus its COMPLETE word
  // parsing, so lookup works for any author, not only the works that came with
  // the app. Nothing here needs Diogenes: a pack carries its own data.
  import { isTauri } from '../lib/runtime';
  import {
    formatPackSize,
    installPack,
    listPacks,
    removePack,
    type LexiconLanguage,
    type LexiconPack,
  } from '../lib/lexicon/packs';
  import { invalidateMorphology } from '../lib/lexicon/morphology';
  import { invalidateLexiconCaches } from '../lib/lexicon/provider';

  /** What a pack for each language provides, shown whether or not it's installed. */
  const CATALOGUE: { language: LexiconLanguage; label: string; dictionary: string; blurb: string }[] = [
    {
      language: 'grc',
      label: 'Greek',
      dictionary: 'Liddell & Scott',
      blurb: 'All 116,728 entries, and every Greek word form Morpheus knows.',
    },
    {
      language: 'lat',
      label: 'Latin',
      dictionary: 'Lewis & Short',
      blurb: 'All 51,674 entries, and every Latin word form Morpheus knows.',
    },
  ];

  let packs = $state<LexiconPack[]>([]);
  let loading = $state(true);
  let busy = $state<LexiconLanguage | 'install' | null>(null);
  let note = $state<string | null>(null);
  /** Which pack the user is being asked to confirm removal of. */
  let confirmingRemoval = $state<LexiconPack | null>(null);

  function installed(language: LexiconLanguage): LexiconPack | undefined {
    return packs.find((p) => p.language === language);
  }

  async function refresh() {
    packs = await listPacks();
    loading = false;
  }

  $effect(() => {
    void refresh();
  });

  /** Every cache that could still answer from a pack that just changed. */
  function dropCaches() {
    invalidateMorphology();
    invalidateLexiconCaches();
  }

  async function chooseAndInstall() {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const picked = await dialog.open({
      multiple: false,
      title: 'Choose a lexicon pack',
      filters: [{ name: 'Lexicon pack', extensions: ['zip'] }],
    });
    if (typeof picked !== 'string') return; // cancelled

    busy = 'install';
    note = 'Installing… this takes a moment for a large pack.';
    try {
      const result = await installPack(picked);
      if (!result.ok) {
        note = result.message ?? "The pack couldn't be installed.";
        return;
      }
      dropCaches();
      await refresh();
      note = result.pack ? `${result.pack.name} installed.` : 'Pack installed.';
    } finally {
      busy = null;
    }
  }

  async function confirmRemove(pack: LexiconPack) {
    busy = pack.language;
    note = null;
    confirmingRemoval = null;
    try {
      const ok = await removePack(pack.language);
      dropCaches();
      await refresh();
      note = ok ? `${pack.name} removed.` : "That pack couldn't be removed.";
    } finally {
      busy = null;
    }
  }
</script>

{#if !isTauri()}
  <p class="settings-line muted">Lexicon packs are installed in the app, not this dev harness.</p>
{:else}
  <p class="settings-line">
    The app ships without dictionaries so the download stays small. Install a pack for each language
    you work in — each one covers any author, not just the works that came with the app.
  </p>

  {#if loading}
    <p class="settings-line muted">Checking…</p>
  {:else}
    {#each CATALOGUE as item (item.language)}
      {@const pack = installed(item.language)}
      <div class="settings-block">
        <p class="settings-block-title">{item.label}</p>

        {#if pack}
          <p class="settings-line">
            <strong>{pack.dictionary}</strong> — {pack.entries.toLocaleString()} entries, with word
            parsing. {formatPackSize(pack.bytes)} on disk.
          </p>
          {#if confirmingRemoval?.language === pack.language}
            <p class="settings-line">
              Remove this pack? Word lookup for {item.label} stops working until you install it
              again. Nothing else is affected.
            </p>
            <div class="settings-actions">
              <button class="settings-secondary" onclick={() => (confirmingRemoval = null)}>Keep it</button>
              <button class="settings-primary" onclick={() => confirmRemove(pack)}>Remove</button>
            </div>
          {:else}
            <div class="settings-actions">
              <button
                class="settings-text-btn"
                onclick={() => (confirmingRemoval = pack)}
                disabled={busy !== null}
              >
                {busy === item.language ? 'Removing…' : 'Remove this pack'}
              </button>
            </div>
          {/if}
          {#if pack.source}
            <p class="settings-hint">{pack.source}</p>
          {/if}
        {:else}
          <p class="settings-line muted">Not installed — {item.label} words can't be looked up yet.</p>
          <p class="settings-hint">{item.dictionary}. {item.blurb}</p>
        {/if}
      </div>
    {/each}

    <div class="settings-block">
      <div class="settings-actions">
        <button class="settings-secondary" onclick={chooseAndInstall} disabled={busy !== null}>
          {busy === 'install' ? 'Installing…' : 'Install a pack…'}
        </button>
      </div>
      {#if note}
        <p class="settings-line">{note}</p>
      {/if}
      <p class="settings-hint">
        Installing a pack again replaces the copy already there, so it is also how you update one.
      </p>
    </div>
  {/if}
{/if}
