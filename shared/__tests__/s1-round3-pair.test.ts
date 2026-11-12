import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { pairUnits, unitAtGreek, unitAtEnglish } from '../lib/paired-hit';
import { englishWords } from '../lib/search';
import { decodeSearchUrl } from '../lib/search-url';
const dataPresent = existsSync('../build/dist/EN/book-01.json');
it.skipIf(!dataPresent)('pairs real Bekker hits by tick span (needs the built corpus)', () => {
 const book = JSON.parse(readFileSync('../build/dist/EN/book-01.json', 'utf8'));
 const seg = book.segments.find((s: any) => s.column === '1095b');
 const ix = pairUnits(book, [{ id: 'rackham', slot: 'english' }]);
 const pos = seg.greek.filter((l: any) => l.n < 29).reduce((n: number,l: any) => n+l.tokens.length,0);
 const unit = unitAtGreek(ix, seg, pos);
 const ticks = seg.english.bekker;
 const start = ticks.findLastIndex((t: any) => t.n <= 29);
 expect(unit.english.rackham).toBe(seg.english.text.slice(ticks[start].offset,ticks[start+1]?.offset).trim());
 expect(unit.greek[0].n).toBe(25);
 const word = englishWords(seg.english.text).findIndex(w => w.word === 'virtue');
 expect(unitAtEnglish(ix,seg,{id:'rackham',slot:'english'},word)).toBe(unit);
});

it.skipIf(!dataPresent)('maps retired turn proximity to words (needs the built corpus)', () => { expect(decodeSearchUrl('?c=f:a&c=f:b&cu=turn', ['EN']).combo?.unit).toBe('words'); });
