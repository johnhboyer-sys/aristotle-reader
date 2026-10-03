// Settings › About (B7): name, version, the MIT licence and the credits.
// Rendered with Svelte's server renderer, since tests run without a DOM.
import { render } from 'svelte/server';
import { beforeAll, describe, expect, it } from 'vitest';
import AboutSettings from '../AboutSettings.svelte';
import SettingsDialog from '../SettingsDialog.svelte';

let readText: (rel: string) => string;

beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
    readFileSync(path: string, encoding: 'utf-8'): string;
  };
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
    fileURLToPath(url: URL): string;
  };
  readText = (rel) => fs.readFileSync(nodeUrl.fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
});

/** The rendered HTML as text: tags dropped, entities undone, spaces collapsed. */
function text(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

describe('Settings › About', () => {
  const html = render(AboutSettings).body;

  it('shows the name and version from tauri.conf.json', () => {
    const conf = JSON.parse(readText('../../../src-tauri/tauri.conf.json'));
    expect(conf.productName).toBeTruthy();
    expect(text(html)).toContain(conf.productName);
    expect(text(html)).toContain(`Version ${conf.version}`);
    expect(text(html)).toContain('A translation workbench for Greek and Latin.');
  });

  it("shows the MIT licence, word for word as the repo's LICENSE", () => {
    const licence = readText('../../../../LICENSE');
    expect(licence).toMatch(/^MIT License/);
    expect(text(html)).toContain(licence.replace(/\s+/g, ' ').trim());
  });

  it('credits the dictionaries, with the CC BY-SA licence link and a note that we changed the data', () => {
    const t = text(html);
    expect(t).toContain('Liddell, Scott and Jones');
    expect(t).toContain('Lewis and Short');
    expect(t).toContain('Perseus Digital Library');
    expect(t).toContain('Creative Commons Attribution-ShareAlike 3.0 licence');
    expect(html).toContain('href="https://creativecommons.org/licenses/by-sa/3.0/us/"');
    expect(t).toContain('We changed the format of this data');
  });

  it('credits Morpheus, Whitaker, the fonts and pandoc', () => {
    const t = text(html);
    expect(t).toMatch(/Morpheus.*Diogenes/);
    expect(t).toContain("Whitaker's Words");
    expect(t).toContain('Permission is hereby freely given for any and all use of program and data.');
    expect(t).toMatch(/Cardo.*EB Garamond.*SIL Open Font License 1\.1/);
    expect(t).toMatch(/pandoc.*GNU General Public License, version 2 or later/);
  });

  it('opens the notices from a real button', () => {
    expect(html).toMatch(/<button[^>]*>Show third-party notices<\/button>/);
  });

  it('never mentions the TLG (John: keep it off credits and licence pages)', () => {
    const notices = readText('../../../src-tauri/resources/THIRD-PARTY-NOTICES');
    for (const page of [text(html), readText('../AboutSettings.svelte'), notices]) {
      expect(page).not.toMatch(/\bTLG\b|Thesaurus Linguae Graecae/i);
    }
  });

  it('Settings opens on About when asked, with About in the tab strip', () => {
    const dialog = render(SettingsDialog, { props: { works: [], onClose: () => {}, initialTab: 'about' } }).body;
    expect(dialog).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>\s*About\s*</);
    expect(text(dialog)).toContain('Show third-party notices');
    const general = render(SettingsDialog, { props: { works: [], onClose: () => {} } }).body;
    expect(text(general)).not.toContain('Show third-party notices');
  });
});
