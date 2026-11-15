// Display head for a lexicon key: LSJ's head when the site's LSJ has the key;
// otherwise the key in Greek letters, never raw Beta Code (259 heads showed as
// Beta Code before 14 Nov). A Morpheus compound key ('dia/-o(ri/zw',
// 'a)na/,a)po/-u(/w') is first joined as Greek joins it, then looked up again.
import { betaToGreek } from '../../shared/lib/betacode.ts';

const VOWELS = 'aeiouhw';

// Join one preverb to what follows. The preverb loses its accent and, before
// a vowel, its final vowel (not peri, pro); ek becomes ex; before a rough
// breathing p t k become ph th ch; en and sun assimilate. The second part
// loses its breathing.
function joinPreverb(pre, rest) {
  let p = pre.replace(/[/\\=]/g, '');
  const rough = /^[aeiouhw]{1,2}\(/.test(rest);
  const r = rest.replace(/^([aeiouhw]{1,2})[()]/, '$1');
  const c = r[0];
  if (VOWELS.includes(c)) {
    if (p !== 'peri' && p !== 'pro' && VOWELS.includes(p.at(-1))) p = p.slice(0, -1);
    if (p === 'e)k') p = 'e)c';
    if (rough) p = p.replace(/p$/, 'f').replace(/t$/, 'q').replace(/k$/, 'x');
  }
  if (p === 'e)n' || p === 'sun') {
    if ('bpfmy'.includes(c)) p = p.slice(0, -1) + 'm';
    else if ('gkxc'.includes(c)) p = p.slice(0, -1) + 'g';
    else if (c === 'l' || c === 'r') p = p.slice(0, -1) + c;
    else if (c === 's' && p === 'sun') p = 'su';
  }
  return p + r;
}

// Compounds of eimi 'be' throw the accent back onto the preverb (ἔνειμι).
function joinCompound(key) {
  const bare = key.replace(/\d+$/, '');
  const cut = bare.lastIndexOf('-');
  const preverbs = bare.slice(0, cut).split(',');
  let rest = bare.slice(cut + 1);
  const eimi = rest === 'ei)mi/';
  if (eimi) rest = 'ei)mi';
  for (const p of preverbs.reverse()) rest = joinPreverb(p, rest);
  if (eimi) rest = rest.replace(/^([^aeiouhw]*[aeiouhw]\)?)/, '$1/');
  return rest;
}

// A few LSJ heads are themselves still Beta Code ('a)h/th'); convert those.
const greek = head => (/[a-z]/.test(head) ? betaToGreek(head) : head);

export function resolveHead(key, lemmaBeta, lookup) {
  if (!key) return betaToGreek(lemmaBeta);
  const hit = lookup(key);
  if (hit != null) return greek(hit);
  if (!key.includes('-')) return betaToGreek(key);
  const joined = joinCompound(key);
  const joinedHit = lookup(joined);
  return joinedHit != null ? greek(joinedHit) : betaToGreek(joined);
}
