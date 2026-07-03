// `nspell` ships no type declarations; we use only the default export as a
// callable that returns a checker with `.correct(word)`. Minimal ambient shim.
declare module 'nspell' {
  interface Nspell {
    correct(word: string): boolean;
    suggest(word: string): string[];
  }
  const nspell: (aff: string, dic: string) => Nspell;
  export default nspell;
}
