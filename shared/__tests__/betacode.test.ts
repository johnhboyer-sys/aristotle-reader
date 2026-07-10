import { describe, expect, it } from 'vitest';
import { betaToGreek } from '../lib/betacode';

describe('betaToGreek', () => {
  it.each([
    ['plain letters', 'logos', 'λογος'],
    ['acute accent', 'lo/gos', 'λόγος'],
    ['grave accent', 'a\\nqrwpos', 'ὰνθρωπος'],
    ['circumflex', 'a=ra', 'ἆρα'.replace('ἆ', 'ᾶ')],
    ['smooth breathing', 'a)reth/', 'ἀρετή'],
    ['rough breathing', 'a(/gios', 'ἅγιος'],
    ['iota subscript', 'a)/|dhs', 'ᾄδης'],
    ['diaeresis', 'i+sxu/s', 'ϊσχύς'],
    ['final sigma before punctuation', 'logos, logos.', 'λογος, λογος.'],
    ['medial sigma', 'swma', 'σωμα'],
    ['capital marker', '*aristote/lhs', 'Αριστοτέλης'],
    ['capital with breathing', '*)/anqrwpos', 'Ἄνθρωπος'],
    ['capital lemma example', '*eu)rw/phs', 'Εὐρώπης'],
    ['drops trailing homograph digit', 'le/gw1', 'λέγω'],
    ['passes punctuation through', 'peri\\ yuxh=s', 'περὶ ψυχῆς'],
    ['leaves ! prefix while converting following Beta Code', '!*)agaqo/s', '!Ἀγαθός'],
  ])('%s', (_label, input, expected) => {
    expect(betaToGreek(input)).toBe(expected);
  });

  it('leaves strings without Beta Code letters untouched', () => {
    expect(betaToGreek('λόγος 123 !?')).toBe('λόγος 123 !?');
  });
});
