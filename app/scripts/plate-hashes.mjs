import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
if (!process.argv[2])
    throw Error('Usage: plate-hashes.mjs <kit-plates-dir>');
const hashes = {};
for (const band of ['desk', 'phone'])
    for (const file of readdirSync(resolve(process.argv[2], band)).filter(f => f.endsWith('.jpg')).sort()) {
        hashes[`${band}/${file}`] = createHash('sha256').update(readFileSync(resolve(process.argv[2], band, file))).digest('hex');
    }
if (Object.keys(hashes).length !== 96)
    throw Error(`Expected 96 source plates, got ${Object.keys(hashes).length}`);
writeFileSync(new URL('./fixtures/plate-sha256.json', import.meta.url), JSON.stringify(hashes, null, 2) + '\n');
console.log(`R-P1 source hashes examined=${Object.keys(hashes).length}`);
