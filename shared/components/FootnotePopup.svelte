<script context="module" lang="ts">
  // Reader creates the popup after the opening event. Capture that event before
  // mount, as well as later clicks that turn a hover note into an opened note.
  let activatedMarker: Element | null = null;
  function captureActivation(event: MouseEvent | KeyboardEvent) {
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    activatedMarker = event.target instanceof Element ? event.target.closest('.fn-marker') : null;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('click', captureActivation, true);
    window.addEventListener('keydown', captureActivation, true);
  }
  function takeActivation(marker: Element | null) {
    const activated = marker !== null && activatedMarker === marker;
    if (activated) activatedMarker = null;
    return activated;
  }
</script>

<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fetchFootnotes } from '../lib/data';
  import { sanitizeHtml } from '../lib/html';
  import { footnotePosition, footnoteInteraction, type FootnoteMode } from '../lib/footnote-position';

  export let work: string = 'EN';
  export let n: string;             // full label identity, e.g. "1", "2.3.1", "*"
  // §B4.3/4.4: which translation's footnote map `n` belongs to — set from the
  // marker's `data-fn-trans`. '' for legacy call sites that omit it (none in
  // this codebase after Phase 4B, but keeps the prop non-breaking).
  export let transId: string = '';
  export let anchor: { x: number; y: number };
  export let onClose: () => void;
  // Hover bridge: cancel/schedule the parent's close timer so the cursor can
  // move from the `[^N]` marker into the popup without it disappearing.
  export let onHoverIn: () => void = () => {};
  export let onHoverOut: () => void = () => {};
  // The site's B note (Reader passes b): "Ostwald’s note 4".
  export let b = false;
  export let label = '';

  let html = '';
  let loading = true;
  let error = '';
  let dialogEl: HTMLDivElement;
  let previousFocus: HTMLElement | null = null;
  let mounted = false;
  let markerEl: HTMLElement | null = null;
  let closedByScroll = false;
  let returnFocus = false;
  let mode: FootnoteMode = 'hover';

  // §Phase-3 B5 / Reader.svelte's fnDisplay: the printed number to show in
  // the header — a scoped label's ("2.3.1") trailing component, a star/
  // dagger glyph verbatim, or (continuous scope, the pre-Phase-4B norm) the
  // label itself unchanged. Duplicated in Reader.svelte rather than shared
  // because it's a two-line pure function and this component must stay
  // import-free of Reader's internals.
  function fnDisplay(label: string): string {
    if (label === '*' || label === '†') return label;
    const i = label.lastIndexOf('.');
    return i === -1 ? label : label.slice(i + 1);
  }
  $: display = fnDisplay(n);

  // Keep the popup inside the viewport (anchored below the marker).
  function clampedPos(x: number, y: number) {
    const W = b ? (window.innerWidth <= 700 ? 340 : 380) : 440, H = 360, vw = window.innerWidth, vh = window.innerHeight;
    return {
      left: Math.max(8, Math.min(x, vw - W - 16)) + 'px',
      top:  Math.min(y + 8, vh - H - 16) + 'px',
    };
  }

  $: pos = clampedPos(anchor.x, anchor.y);

  // Reader supplies a viewport point, not an element. Match the note identity
  // within this reader, then use that point to distinguish repeated markers.
  // Rebind when Reader switches notes without unmounting this component.
  $: if (mounted) bindMarker(n, transId, anchor);
  function bindMarker(note: string, trans: string, point: { x: number; y: number }) {
    const root = dialogEl?.closest('.b-rd, .reader') ?? document;
    const candidates = [...root.querySelectorAll<HTMLElement>('.fn-marker')]
      .filter(el => el.dataset.fn === note && (el.dataset.fnTrans ?? '') === trans);
    const previousMarker = markerEl;
    markerEl = candidates.reduce<HTMLElement | null>((best, el) => {
      const distance = (node: HTMLElement) => {
        const r = node.getBoundingClientRect();
        return Math.hypot(r.left - point.x, r.bottom - point.y);
      };
      return !best || distance(el) < distance(best) ? el : best;
    }, null);
    if (markerEl !== previousMarker) mode = 'hover';
    if (takeActivation(markerEl)) mode = footnoteInteraction(mode, 'activate');
    updatePosition();
  }

  function onActivate(event: MouseEvent | KeyboardEvent) {
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    if (takeActivation(markerEl)) {
      mode = footnoteInteraction(mode, 'activate');
    }
  }

  function onScroll(event: Event) {
    // Scrolling the note's own body must not dismiss it.
    if (event.target instanceof Node && dialogEl?.contains(event.target)) return;
    mode = footnoteInteraction(mode, 'scroll');
    if (mode === 'closed') {
      if (!closedByScroll) { closedByScroll = true; returnFocus = false; onClose(); }
    } else updatePosition();
  }

  function updatePosition() {
    // Keep legacy callers that have no marker on their original point anchor.
    if (!markerEl || closedByScroll) return;
    const next = markerEl.isConnected ? footnotePosition(
      markerEl.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight },
      {
        width: dialogEl?.offsetWidth || Math.min(b ? (window.innerWidth <= 700 ? 340 : 380) : 440, window.innerWidth - 24),
        height: dialogEl?.offsetHeight || 360,
      },
    ) : null;
    if (next) pos = next;
    else { closedByScroll = true; returnFocus = false; onClose(); }
  }

  // §B4.4: an imported translation's footnote text is resolved through a
  // window-level hook installed by desktop/src/lib/imports.ts's
  // installHooks() — this component (app/src) is SHARED with the static
  // site build, which has no imports.ts and must not import desktop code, so
  // the established pattern (mirroring __ARISTOTLE_BOOK_HOOK__ /
  // __ARISTOTLE_EXTRA_TRANSLATIONS__) is a lazily-read global instead of a
  // direct import. On the site build neither hook is ever installed, so
  // `isImportedTrans()` is always false and every call falls through to the
  // original `fetchFootnotes(work)` path unchanged — inert, byte-identical.
  //
  // `isImportedTrans` is a SEPARATE hook from the note lookup itself so a
  // registered import with no definition for this label ("footnote-note-
  // unmatched") shows "not found" instead of silently falling through to
  // fetchFootnotes(work) — which could otherwise return a DIFFERENT
  // translation's note text for the same work if the labels happen to
  // collide (continuous scope on both sides uses plain digits).
  function isImportedTrans(): boolean {
    if (!transId) return false;
    const hook = (globalThis as {
      __ARISTOTLE_IMPORT_HAS_TRANS__?: (work: string, id: string) => boolean;
    }).__ARISTOTLE_IMPORT_HAS_TRANS__;
    return hook ? hook(work, transId) : false;
  }

  // Reload when the marker changes. Reader reassigns `n`/`transId` in place when
  // you move between footnote markers without closing, so a one-shot load would
  // show the new "Note N" header over the previous note's body. Mirrors
  // EndnoteSidebar.resolve(); the request id discards a slow earlier fetch.
  let reqId = 0;
  $: loadNote(work, transId, n);
  function loadNote(workId: string, trans: string, label: string) {
    const my = ++reqId;
    loading = true;
    error = '';
    html = '';
    if (isImportedTrans()) {
      const hook = (globalThis as {
        __ARISTOTLE_IMPORT_FOOTNOTE_HOOK__?: (work: string, id: string, label: string) => string | null;
      }).__ARISTOTLE_IMPORT_FOOTNOTE_HOOK__;
      const note = hook ? hook(workId, trans, label) : null;
      html = note ?? '';
      if (!html) error = `Footnote ${fnDisplay(label)} not found.`;
      loading = false;
    } else {
      fetchFootnotes(workId)
        .then(map => { if (my === reqId) { html = map[label] ?? ''; if (!html) error = `Footnote ${fnDisplay(label)} not found.`; } })
        .catch(e => { if (my === reqId) error = String(e); })
        .finally(() => { if (my === reqId) loading = false; });
    }
  }

  function onKey(e: KeyboardEvent) {
    if (!b && e.key === 'Escape') dismiss();
  }
  // The site's B note: capture phase, so the note spends Escape before the
  // word panel's own window listener (registered first) sees it: one Escape,
  // one layer. The desktop app keeps onKey above.
  function onKeyB(e: KeyboardEvent) {
    onActivate(e);
    if (b && e.key === 'Escape') { e.preventDefault(); dismiss(); }
  }

  function dismiss() {
    returnFocus = true;
    onClose();
  }

  // Reader handles outside-click dismissal. Capture its intent before the
  // parent's window handler unmounts us; hover, scroll and navigation do not
  // request focus return.
  function onOutsidePointer(e: PointerEvent) {
    const target = e.target;
    if (target instanceof Element && !target.closest('.fn-marker, .footnote-popup')) returnFocus = true;
  }

  function focusableEls(): HTMLElement[] {
    return dialogEl
      ? Array.from(dialogEl.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
      : [];
  }

  function onDialogKey(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const els = focusableEls();
    if (els.length === 0) {
      e.preventDefault();
      dialogEl?.focus();
      return;
    }
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    mounted = true;
    const focusTimer = setTimeout(() => {
      // A word panel may have taken focus since this note mounted.
      if (!closedByScroll && document.activeElement === previousFocus) dialogEl?.focus({ preventScroll: true });
    }, 0);
    // Capture also sees scrolls in nested desktop reader containers.
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePosition);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
    if (dialogEl) observer?.observe(dialogEl);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updatePosition);
      observer?.disconnect();
    };
  });

  onDestroy(() => {
    const active = document.activeElement;
    if (returnFocus && !closedByScroll && previousFocus?.isConnected &&
        (active === document.body || active === previousFocus || (active && dialogEl?.contains(active)))) {
      previousFocus.focus({ preventScroll: true });
    }
  });
</script>

<svelte:window on:click|capture={onActivate} on:keydown={onKey} on:keydown|capture={onKeyB} on:pointerdown|capture={onOutsidePointer} />

{#if b}
<div
  class="b-note footnote-popup"
  bind:this={dialogEl}
  style="left:{pos.left};top:{pos.top}"
  role="dialog"
  aria-label="{label} {display}"
  aria-modal="true"
  tabindex="-1"
  on:mouseenter={onHoverIn}
  on:mouseleave={onHoverOut}
  on:focus={onHoverIn}
  on:blur={onHoverOut}
  on:keydown={onDialogKey}
>
  <p class="b-note-k">{label} {display}</p>
  {#if error}
    <p class="b-err">Note not available</p>
  {:else if !loading}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <div class="footnote-text">{@html sanitizeHtml(html)}</div>
  {/if}
  <button type="button" class="b-x" on:click={dismiss} aria-label="Close"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></button>
</div>
{:else}
<div
  class="popup footnote-popup"
  bind:this={dialogEl}
  style="left:{pos.left};top:{pos.top}"
  role="dialog"
  aria-label="Footnote {display}"
  aria-modal="true"
  tabindex="-1"
  on:mouseenter={onHoverIn}
  on:mouseleave={onHoverOut}
  on:focus={onHoverIn}
  on:blur={onHoverOut}
  on:keydown={onDialogKey}
>
  <div class="popup-header">
    <span class="footnote-num">Note {display}</span>
    <button class="popup-close" on:click={dismiss} aria-label="Close">✕</button>
  </div>

  <div class="popup-body">
    {#if loading}
      <div class="popup-loading">Loading…</div>
    {:else if error}
      <div class="popup-loading">{error}</div>
    {:else}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <div class="footnote-text">{@html sanitizeHtml(html)}</div>
    {/if}
  </div>
</div>
{/if}
