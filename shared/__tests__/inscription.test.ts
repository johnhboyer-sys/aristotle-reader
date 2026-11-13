import { describe, expect, it } from 'vitest';
import { inscriptionCaps, inscriptionLetters } from '../lib/inscription';

describe('inscription lettering', () => {
  it('drops accents and breathings and writes titles in capitals', () => {
    expect(inscriptionCaps('Πολιτεία')).toBe('ΠΟΛΙΤΕΙΑ');
    expect(inscriptionCaps('Ἀπολογία Σωκράτους')).toBe('ΑΠΟΛΟΓΙΑ ΣΩΚΡΑΤΟΥΣ');
    expect(inscriptionCaps('Ἱππίας μείζων')).toBe('ΙΠΠΙΑΣ ΜΕΙΖΩΝ');
  });

  it('writes the iota subscript as a full iota', () => {
    expect(inscriptionCaps('τῇ θεῷ')).toBe('ΤΗΙ ΘΕΩΙ');
    expect(inscriptionCaps('ἐκείνῃ τῇ ἡμέρᾳ ᾗ')).toBe('ΕΚΕΙΝΗΙ ΤΗΙ ΗΜΕΡΑΙ ΗΙ');
  });

  it('keeps only the letters for a grid', () => {
    expect(inscriptionLetters('Κατέβην χθὲς εἰς Πειραιᾶ μετὰ Γλαύκωνος'))
      .toBe('ΚΑΤΕΒΗΝΧΘΕΣΕΙΣΠΕΙΡΑΙΑΜΕΤΑΓΛΑΥΚΩΝΟΣ');
    expect(inscriptionLetters('Αὐτός, ὦ Φαίδων, [τῶν πολιτῶν] δ’ οὖν;'))
      .toBe('ΑΥΤΟΣΩΦΑΙΔΩΝΤΩΝΠΟΛΙΤΩΝΔΟΥΝ');
  });
});
