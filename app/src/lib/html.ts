// The HTML sanitizer now lives in shared/ so the Astro site and the shared
// reader components (WordPopup, FootnotePopup, EndnoteSidebar) enforce ONE set
// of rules. Re-exported here so existing `../lib/html` imports keep working.
// Only the sanitizer is used from the site since 2026-09-03: the /lemma pages
// mount grammata's T8 entry at runtime instead of rendering the LSJ shards.
export { sanitizeHtml } from '@shared/lib/html';
