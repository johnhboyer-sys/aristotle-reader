// Lexicon heads never show as Beta Code (John, 14 Nov). A Morpheus compound key
// is joined as Greek joins it. The expected heads below are the 26 manifest
// compounds whose joined form LSJ (Diogenes grc.lsj.xml, 116,728 keys) lists,
// written from LSJ's own key.
import { describe, expect, it } from 'vitest';
import { resolveHead } from '../../scripts/lemma-head.mjs';

const none = () => null;

const LSJ_CONFIRMED: Record<string, string> = {
  'dia/-o(ri/zw': 'διορίζω', 'e)n-u(pa/rxw': 'ἐνυπάρχω', 'e)n-ei)mi/': 'ἔνειμι', 'su/n-ei)=don': 'συνεῖδον',
  'e)n-perilamba/nw': 'ἐμπεριλαμβάνω', 'e)n-a)polamba/nw': 'ἐναπολαμβάνω', 'su/n-le/gw1': 'συλλέγω',
  'e)k-u(grai/nw': 'ἐξυγραίνω', 'e)k-i)kma/zw': 'ἐξικμάζω', 'a)po/-a(/llomai': 'ἀφάλλομαι',
  'e)n-xeire/w': 'ἐγχειρέω', 'su/n-e)kkri/nw': 'συνεκκρίνω', 'a)na/-i)/sxw': 'ἀνίσχω',
  'su/n-a)pe/rxomai': 'συναπέρχομαι', 'a)na/,a)po/-u(/w': 'ἀναφύω', 'a)po/-e)rw=': 'ἀπερῶ',
  'para/-e)mfai/nw': 'παρεμφαίνω', 'su/n-katafe/rw': 'συγκαταφέρω', 'su/n-a)polau/w': 'συναπολαύω',
  'e)n-i)sxu/w': 'ἐνισχύω', 'e)pi/-a)naka/mptw': 'ἐπανακάμπτω', 'kata/-e(/zomai': 'καθέζομαι',
  'u(pe/r-ei)=don': 'ὑπερεῖδον', 'e)n-perie/xw': 'ἐμπεριέχω', 'su/n-lei/bw': 'συλλείβω',
  'kata/-a)lei/fw': 'καταλείφω',
};

describe('resolveHead', () => {
  it("returns LSJ's head when it has the key", () => {
    expect(resolveHead('lo/gos', 'lo/gos', k => (k === 'lo/gos' ? 'λόγος' : null))).toBe('λόγος');
  });

  it('looks a compound up again once joined', () => {
    expect(resolveHead('dia/-o(ri/zw', 'dia/-o(ri/zw', k => (k === 'diori/zw' ? 'διορίζω' : null))).toBe('διορίζω');
  });

  it.each(Object.entries(LSJ_CONFIRMED))('joins %s as %s', (key, head) => {
    expect(resolveHead(key, key, none)).toBe(head);
  });

  it('converts a key LSJ lacks', () => {
    expect(resolveHead('*gai=a', '*gai=a', none)).toBe('Γαῖα');
    expect(resolveHead('ma/lista', 'ma/lista', none)).toBe('μάλιστα');
    expect(resolveHead('e)k-pi/mprhmi', 'e)k-pi/mprhmi', none)).toBe('ἐκπίμπρημι');
    expect(resolveHead('su/n-ka/ptw', 'su/n-ka/ptw', none)).toBe('συγκάπτω');
  });

  // Grok's review of ef4ac017e9 (Smyth 72, 80, 95, 101): shapes not in today's data.
  it.each([
    ['a)mfi/-e(/nnumi', 'ἀμφιέννυμι'],   // amphi keeps its iota
    ['e)n-r(a/ptw', 'ἐνράπτω'],          // en keeps nu before rho
    ['su/n-zeu/gnumi', 'συζεύγνυμι'],    // sun > su before zeta
    ['su/n-site/w', 'συσσιτέω'],          // sun > sus before sigma + vowel
    ['su/n-skeua/zw', 'συσκευάζω'],      // sun > su before sigma + consonant
    ['a)na/-r(e/w', 'ἀναρρέω'],           // rho doubles after a vowel
    ['su/n-r(e/w', 'συρρέω'],
    ['peri/-ei)mi/', 'περίειμι'],          // eimi compounds: recessive
    ['u(pe/r-ei)mi/', 'ὑπέρειμι'],
    ['pa/r-ei)mi/', 'πάρειμι'],
    ['e)n-a)po/-ei)mi/', 'ἐνάπειμι'],
    ['-u(/w', 'ὕω'],                        // no preverb: breathing stays
  ])('joins %s as %s', (key, head) => {
    expect(resolveHead(key, key, none)).toBe(head);
  });

  it('converts an LSJ head that is itself Beta Code', () => {
    expect(resolveHead('a)h/th', 'a)h/th', k => (k === 'a)h/th' ? 'a)h/th' : null))).toBe('ἀήτη');
  });

  it('converts lemmaBeta when the key is empty', () => {
    expect(resolveHead('', '*gai=a', () => 'not used')).toBe('Γαῖα');
  });
});
