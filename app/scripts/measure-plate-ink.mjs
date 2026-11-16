// Measure each desk plate's ink box and store it in src/data/plates.json as
// `ink: [left, top, right, bottom]`, in the plate's own pixels (1280×914).
// Work pages and the home page crop a plate to this box, so a drawing on white
// paper fills its column and a scene that fills its frame shows whole.
//
// A pixel is ink when it is darker than 200 of 255. A row or column counts
// when it holds at least three such pixels, so a speck does not widen the box.
// Run from app/: node scripts/measure-plate-ink.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const file = new URL('../src/data/plates.json', import.meta.url);
const plates = JSON.parse(readFileSync(file, 'utf8'));
const check = process.argv.includes('--check');
// The 404 shows the whole desk image, without an ink-box crop. Its box is
// the supplied credit record, not the threshold crop used by home/work pages.
const ids = Object.keys(plates).filter(id => id !== '404');
if (!ids.length) throw new Error('examined=0 plates');

let changed = 0;
for (const id of ids) {
  const { data, info } = await sharp(new URL(`../public/plates/desk/${id}.jpg`, import.meta.url).pathname)
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const cols = new Uint32Array(width);
  const rows = new Uint32Array(height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[y * width + x] < 200) { cols[x]++; rows[y]++; }
  const first = a => a.findIndex(n => n >= 3);
  const last = a => a.length - [...a].reverse().findIndex(n => n >= 3);
  if (first(cols) < 0 || first(rows) < 0) throw new Error(`${id}: no ink found in ${width}×${height}`);
  const ink = [first(cols), first(rows), last(cols), last(rows)];
  if (JSON.stringify(plates[id].ink) !== JSON.stringify(ink)) changed++;
  if (check && JSON.stringify(plates[id].ink) !== JSON.stringify(ink)) throw new Error(`${id}: stored ink ${JSON.stringify(plates[id].ink)} but measured ${JSON.stringify(ink)}`);
  // `ink` sits straight after `place`.
  plates[id] = Object.fromEntries(Object.entries(plates[id]).filter(([k]) => k !== 'ink').flatMap(([k, v]) => k === 'place' ? [[k, v], ['ink', ink]] : [[k, v]]));
  if (!plates[id].ink) throw new Error(`${id}: no place field to put ink after`);
}
// One line per ink box, so a re-measure reads as one changed line per plate.
if (!check) writeFileSync(file, `${JSON.stringify(plates, null, 2).replace(/"ink": \[\s+(\d+),\s+(\d+),\s+(\d+),\s+(\d+)\s+\]/g, '"ink": [$1, $2, $3, $4]')}\n`);
console.log(`examined=${ids.length} plates; ${check ? 'all match' : `${changed} ink boxes written`}`);
