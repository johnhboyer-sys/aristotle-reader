import {expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const current = readFileSync(resolve(import.meta.dirname, '../../../shared/components/Search.svelte'), 'utf8');
// Frozen from stage 3 (e5494dadad), which was HEAD when search work began.
// Hashes keep the check valid after committing stage 4 and in shallow checkouts.
// doSearch: stage 3 plus main's Beta Code accent fix (PR #194, ec0bf17610),
// and nothing else; checked at the merge.
const baseline = {
  "main": "9c501ff9895aaa226782ccbf6f963aa9007a26e8d0150beeac5b279e54450939",
  "style": "82266d494a045aca78396e936abbc64ba798b3b766ccf9ec9542095efb8a5349",
  "showResults": "67291214a27294f5e75c2d8afe738d9d6ca36321092611520b56c878f708061c",
  "currentSearch": "f65ee1c2690f2eb61630b9dbce01075538e1162b7fc7cf36c1d7b582aa2ebffc",
  "doSearch": "cf4574fbbcfc8f2430ac7711ea3417280624833956f9e795078a52bfb9312a74"
};
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
it('keeps the stage 3 desktop main and scoped styles byte for byte', () => {
  const start=current.indexOf('<main class="search-page">');
  expect(current.slice(0,start).trimEnd().endsWith('{:else}')).toBe(true);
  expect(hash(current.slice(start,current.indexOf('</main>',start)+'</main>'.length))).toBe(baseline.main);
  expect(hash(current.slice(current.indexOf('<style>')))).toBe(baseline.style);
});
it('keeps the stage 3 search, query snapshot and result layout behind B-only entry guards', () => {
  const script=current.slice(current.indexOf('>')+1,current.indexOf('</script>'));
  const ast=ts.createSourceFile('Search.ts',script,ts.ScriptTarget.Latest,true);
  for(const [name,guard] of [
    ['showResults','    if (b) return showBResults(results);\n'],
    ['currentSearch','    if (b) return currentBSearch();\n'],
    ['doSearch','    if (b) return doBSearch(e, opts);\n'],
  ] as const) {
    const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)!;
    const body=node.getText(ast);
    expect(body).toContain(guard);
    expect(hash(body.replace(guard,''))).toBe(baseline[name]);
  }
});
