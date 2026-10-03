<script lang="ts">
  // The export choices both export windows offer: translation only or
  // bilingual, and for bilingual the layout and order. The parent owns the
  // values; a change here is for the one export, never written to Settings.
  import type { BilingualLayout, BilingualOrder, CompileMode } from '../lib/export';

  let {
    mode = $bindable(),
    bilingualLayout = $bindable(),
    bilingualOrder = $bindable(),
    disabled = false,
    name,
  }: {
    mode: CompileMode;
    bilingualLayout: BilingualLayout;
    bilingualOrder: BilingualOrder;
    disabled?: boolean;
    /** Radio-group prefix, so two windows never share a group. */
    name: string;
  } = $props();
</script>

<fieldset class="mode-choice">
  <legend>Format</legend>
  <label class="mode-option">
    <input type="radio" name="{name}-mode" value="english" {disabled} bind:group={mode} />
    English only
  </label>
  <label class="mode-option">
    <input type="radio" name="{name}-mode" value="bilingual" {disabled} bind:group={mode} />
    <!-- Not "Greek and English": a document work's source may be
         Latin, German, or anything the user imported. -->
    Bilingual
  </label>
</fieldset>

{#if mode === 'bilingual'}
  <fieldset class="mode-choice">
    <legend>Layout</legend>
    <label class="mode-option">
      <input type="radio" name="{name}-layout" value="block" {disabled} bind:group={bilingualLayout} />
      One language after the other
    </label>
    <label class="mode-option">
      <input type="radio" name="{name}-layout" value="alternating" {disabled} bind:group={bilingualLayout} />
      Alternating paragraphs
    </label>
    <label class="mode-option">
      <input type="radio" name="{name}-layout" value="table" {disabled} bind:group={bilingualLayout} />
      Side by side (two-column table)
    </label>
  </fieldset>

  <fieldset class="mode-choice">
    <legend>Order</legend>
    <label class="mode-option">
      <input type="radio" name="{name}-order" value="original-first" {disabled} bind:group={bilingualOrder} />
      Original first
    </label>
    <label class="mode-option">
      <input type="radio" name="{name}-order" value="translation-first" {disabled} bind:group={bilingualOrder} />
      Translation first
    </label>
  </fieldset>
{/if}

<style>
  .mode-choice {
    margin-top: var(--space-4);
    border: none;
    padding: 0;
  }
  .mode-choice legend {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-mid);
    margin-bottom: var(--space-2);
  }
  .mode-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-english);
    font-size: 0.9rem;
    color: var(--text);
    padding: var(--space-1) 0;
    cursor: pointer;
  }
</style>
