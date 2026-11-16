// Display head for a lexicon key: LSJ's head when the site's LSJ has the key;
// otherwise the key in Greek letters, never raw Beta Code (259 heads showed as
// Beta Code before 14 Nov). A Morpheus compound key ('dia/-o(ri/zw',
// 'a)na/,a)po/-u(/w') is first joined as Greek joins it, then looked up again.
import { betaToGreek } from '../../shared/lib/betacode.ts';

const VOWELS = 'aeiouhw';
const isVowel = c => VOWELS.includes(c);

// Join one preverb to what follows (Smyth 72, 80, 95, 101). The preverb loses
// its accent and, before a vowel, its final vowel (not peri, pro, amphi); ek
// becomes ex; before a rough breathing p t k become ph th ch; en and sun
// assimilate; an initial rho doubles after a vowel. The second part loses its
// breathing.
function joinPreverb(pre, rest) {
  let p = pre.replace(/[/\\=]/g, '');
  if (!p) return rest;
  const rough = /^[aeiouhw]{1,2}\(/.test(rest);
  let r = rest.replace(/^([aeiouhw]{1,2})[()]/, '$1').replace(/^r[()]/, 'r');
  const c = r[0];
  if (isVowel(c)) {
    if (!['peri', 'pro', 'a)mfi'].includes(p) && isVowel(p.at(-1))) p = p.slice(0, -1);
    if (p === 'e)k') p = 'e)c';
    if (rough) p = p.replace(/p$/, 'f').replace(/t$/, 'q').replace(/k$/, 'x');
  } else if (c === 'r' && isVowel(p.at(-1))) {
    r = 'r' + r;
  }
  if (p === 'e)n' || p === 'sun') {
    if ('bpfmy'.includes(c)) p = p.slice(0, -1) + 'm';
    else if ('gkxc'.includes(c)) p = p.slice(0, -1) + 'g';
    else if (c === 'l') p = p.slice(0, -1) + 'l';
    else if (p === 'sun' && c === 'r') p = 'sur';
    else if (p === 'sun' && c === 'z') p = 'su';
    else if (p === 'sun' && c === 's') p = isVowel(r[1]) ? 'sus' : 'su';
  }
  return p + r;
}

// Compounds of eimi 'be' take a recessive accent: the acute goes on the
// antepenult (περίειμι, ἐνάπειμι), or the first syllable of a shorter word.
const DIPHTHONG = /^(ai|ei|oi|ui|au|eu|ou|hu)/;
function recessive(beta) {
  const nuclei = [];
  for (let i = 0; i < beta.length;) {
    if (!isVowel(beta[i])) { i++; continue; }
    const len = DIPHTHONG.test(beta.slice(i, i + 2)) ? 2 : 1;
    let end = i + len;
    while (end < beta.length && ')('.includes(beta[end])) end++;
    nuclei.push(end);
    i = end;
  }
  const at = nuclei[Math.max(0, nuclei.length - 3)];
  return beta.slice(0, at) + '/' + beta.slice(at);
}

function joinCompound(key) {
  const bare = key.replace(/\d+$/, '');
  const cut = bare.lastIndexOf('-');
  const preverbs = bare.slice(0, cut).split(/[,-]/);
  let rest = bare.slice(cut + 1);
  const eimi = rest === 'ei)mi/';
  if (eimi) rest = 'ei)mi';
  for (const p of preverbs.reverse()) rest = joinPreverb(p, rest);
  return eimi && rest !== 'ei)mi' ? recessive(rest) : eimi ? 'ei)mi/' : rest;
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
