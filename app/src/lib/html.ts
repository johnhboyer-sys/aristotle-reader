// The HTML sanitizer now lives in shared/ so the Astro site and the shared
// reader components (WordPopup, FootnotePopup, EndnoteSidebar) enforce ONE set
// of rules. Re-exported here so existing `../lib/html` imports keep working.
export { sanitizeHtml } from '@shared/lib/html';
