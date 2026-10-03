<script lang="ts">
  // Settings › About: the app's name, version and licence, credits for the
  // data and fonts it ships, and the full third-party notices
  // (src-tauri/resources/THIRD-PARTY-NOTICES, made by
  // scripts/gen-notices.mjs). The macOS app menu's About item opens this pane
  // too (src-tauri/src/lib.rs). Type is larger than the other panes': one
  // user reads with low vision.
  import { tick } from 'svelte';
  import { APP_NAME, APP_VERSION } from '../lib/about/appInfo';
  import { isTauri } from '../lib/runtime';

  // The repo's LICENSE, word for word (aboutSettings.test.ts holds them equal).
  const MIT_LICENCE = `MIT License

Copyright (c) 2026 John Boyer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
  // Shown as paragraphs, so the text reflows to the pane's width.
  const MIT_PARAGRAPHS = MIT_LICENCE.split('\n\n').map((p) => p.replace(/\n/g, ' '));

  // The only two web pages this pane opens. capabilities/default.json lets
  // the window open these and nothing else.
  const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/3.0/us/';
  const PERSEUS = 'https://www.perseus.tufts.edu/';

  let view = $state<'about' | 'notices'>('about');
  let notices = $state<string | null>(null);
  let noticesError = $state(false);
  let noticesHeading = $state<HTMLHeadingElement>();
  let showButton = $state<HTMLButtonElement>();

  // In the app a link opens in the web browser; the window itself never leaves the app.
  async function openLink(e: MouseEvent, url: string) {
    if (!isTauri()) return;
    e.preventDefault();
    try {
      const opener = await import('@tauri-apps/plugin-opener');
      await opener.openUrl(url);
    } catch (err) {
      console.error('[about] could not open', url, err);
    }
  }

  async function showNotices() {
    view = 'notices';
    await tick();
    noticesHeading?.focus();
    if (notices !== null || !isTauri()) return;
    noticesError = false;
    try {
      const pathApi = await import('@tauri-apps/api/path');
      const fs = await import('@tauri-apps/plugin-fs');
      notices = await fs.readTextFile(await pathApi.resolveResource('resources/THIRD-PARTY-NOTICES'));
    } catch (err) {
      console.error('[about] could not read the notices', err);
      noticesError = true;
    }
  }

  async function backToAbout() {
    view = 'about';
    await tick();
    showButton?.focus();
  }
</script>

<div class="about">
  {#if view === 'about'}
    <h3 class="app-name">{APP_NAME}</h3>
    <p class="app-version">Version {APP_VERSION}</p>
    <p>A translation workbench for Greek and Latin.</p>

    <h4>Licence</h4>
    <p>{APP_NAME} is free software under the MIT licence:</p>
    <div class="licence">
      {#each MIT_PARAGRAPHS as para, i (i)}
        <p>{para}</p>
      {/each}
    </div>

    <h4>Credits</h4>
    <p>
      <strong>Greek and Latin dictionaries.</strong> The Greek lexicon of Liddell, Scott and Jones and the
      Latin dictionary of Lewis and Short come from the
      <a href={PERSEUS} target="_blank" rel="noopener noreferrer" onclick={(e) => openLink(e, PERSEUS)}
        >Perseus Digital Library</a
      >
      at Tufts University, by way of Diogenes. They are shared under the
      <a href={CC_BY_SA} target="_blank" rel="noopener noreferrer" onclick={(e) => openLink(e, CC_BY_SA)}
        >Creative Commons Attribution-ShareAlike 3.0 licence</a
      >. We changed the format of this data so the app can search it, and we share our changed data under the
      same licence.
    </p>
    <p>
      <strong>Word analyses.</strong> The analyses of Greek and Latin word forms come from Morpheus, the Perseus
      Project's word parser, as shipped with Diogenes by Peter Heslin.
    </p>
    <p>
      <strong>Whitaker's Words.</strong> The Latin word list is by William Whitaker: “Permission is hereby
      freely given for any and all use of program and data.”
    </p>
    <p>
      <strong>Fonts.</strong> Cardo, by David J. Perry, and EB Garamond, by the EB Garamond Project Authors,
      under the SIL Open Font License 1.1.
    </p>
    <p>
      <strong>Word export.</strong> The Word export template starts from pandoc's default reference document,
      by John MacFarlane, under the GNU General Public License, version 2 or later. We changed its font and
      page size.
    </p>

    <h4>Other software</h4>
    <p>
      {APP_NAME} is built on open-source software, among it Tauri, Svelte, Tiptap and ProseMirror. The notices
      list every package with its licence.
    </p>
    <button class="about-btn" bind:this={showButton} onclick={showNotices}>Show third-party notices</button>
  {:else}
    <h3 class="app-name" tabindex="-1" bind:this={noticesHeading}>Third-party notices</h3>
    <button class="about-btn" onclick={backToAbout}>Back to About</button>
    {#if !isTauri()}
      <p>The notices open in the app, not in this browser preview.</p>
    {:else if noticesError}
      <p role="alert">The notices file could not be opened.</p>
    {:else if notices === null}
      <p>Opening the notices…</p>
    {:else}
      <pre class="licence notices">{notices}</pre>
    {/if}
  {/if}
</div>

<style>
  .about {
    font-family: var(--font-english);
    font-size: 1.05rem;
    line-height: 1.55;
    color: var(--text);
  }
  .about p {
    margin: 0 0 var(--space-3);
  }
  .app-name {
    font-family: var(--font-ui);
    font-size: 1.35rem;
    font-weight: 700;
    margin: 0 0 var(--space-1);
  }
  .app-version {
    font-family: var(--font-ui);
    color: var(--text-mid);
  }
  h4 {
    font-family: var(--font-ui);
    font-size: 1.05rem;
    font-weight: 700;
    margin: var(--space-5) 0 var(--space-2);
  }
  a {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .licence {
    font-family: var(--font-ui);
    font-size: 0.95rem;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-3);
    margin: 0 0 var(--space-3);
  }
  .licence p:last-child {
    margin-bottom: 0;
  }
  .notices {
    margin-top: var(--space-3);
  }
  .about-btn {
    font-family: var(--font-ui);
    font-size: 1rem;
    font-weight: 500;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-2) var(--space-4);
    min-height: 2.5rem;
    cursor: pointer;
  }
  .about-btn:hover {
    background: var(--ui-hover);
  }
  .about-btn:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
