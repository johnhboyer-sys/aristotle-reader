import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The dictionary entry's address is a build parameter, PUBLIC_GRAMMATA_LOOKUP,
// read in two places: the word popup and the site's lemma page. Vite puts the
// value in at build time, so what can be checked here is that both read the
// one parameter with the one default. (A module of its own was tried: it
// became a bundle of its own and renamed a script on every page.)
const READ = "import.meta.env.PUBLIC_GRAMMATA_LOOKUP || 'https://grammata.pages.dev/t8/lookup.js'";
const users = ['../components/WordPopup.svelte', '../../app/src/components/LemmaPage.astro'];
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('PUBLIC_GRAMMATA_LOOKUP build-time address', () => {
  it.each(users)('%s reads the parameter, with the address the readers have always used as its default', (user) => {
    const text = read(user);
    expect(text.split(READ).length - 1, user).toBe(1);
    // and names the address nowhere else, so no second copy can drift
    expect(text.split('grammata.pages.dev/t8').length - 1, user).toBe(1);
    expect(text, user).toMatch(/import\(\/\* @vite-ignore \*\/ GRAMMATA_LOOKUP\)/);
  });
});
