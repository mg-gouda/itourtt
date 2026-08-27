#!/usr/bin/env node
/** Merge a partial description map (JSON on stdin) into docs/map/descriptions.json. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'docs/map/descriptions.json');

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const incoming = JSON.parse(chunks.join(''));
const existing = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};

const known = new Set(fs.readFileSync(path.join(ROOT, 'docs/map/_undescribed.txt'), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('!')));
const before = Object.keys(existing).length;
// Unknown keys are REJECTED, not written. Writing them was what created stale
// prose that lingered until someone noticed the stale report.
const unknown = [];
for (const [k, v] of Object.entries(incoming)) {
  if (!known.has(k) && !existing[k]) { unknown.push(k); continue; }
  existing[k] = v;
}
const sorted = Object.fromEntries(Object.keys(existing).sort().map((k) => [k, existing[k]]));
fs.writeFileSync(FILE, JSON.stringify(sorted, null, 2) + '\n');
console.log(`descriptions: ${before} -> ${Object.keys(sorted).length} (+${Object.keys(sorted).length - before})`);
if (unknown.length) {
  console.log(`! ${unknown.length} key(s) matched no known symbol and were SKIPPED (fix the key, or regenerate first):`);
  unknown.forEach((k) => console.log(`  ${k}`));
}
