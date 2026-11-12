// Prints the spec files for one CI shard. Playwright's own --shard splits by test
// count, which put every slow inference spec in one job (340 s against 83 s).
// Groups are balanced by measured duration; a spec that is not listed here still
// runs, in the last group, so adding a file can never silently skip it.
import { readdir } from 'node:fs/promises';

const GROUPS = [
  ['positive-inference', 'application', 'pause'],
  ['worker', 'muscles', 'visual', 'focus', 'peripheral'],
  ['systems', 'inspection', 'production', 'ui-controls', 'inspection-ui', 'mirror'],
];
const index = Number(process.argv[2]) - 1;
if (!Number.isInteger(index) || !GROUPS[index]) throw new Error(`Shard must be 1-${GROUPS.length}`);
const present = (await readdir('tests/e2e')).filter(file => file.endsWith('.spec.js')).map(file => file.slice(0, -'.spec.js'.length));
const listed = GROUPS.flat();
const missing = listed.filter(name => !present.includes(name));
if (missing.length) throw new Error(`Shard groups name specs that no longer exist: ${missing.join(', ')}`);
if (new Set(listed).size !== listed.length) throw new Error('A spec is listed in more than one shard group');
const unlisted = present.filter(name => !listed.includes(name));
const names = index === GROUPS.length - 1 ? [...GROUPS[index], ...unlisted] : GROUPS[index];
console.log(names.map(name => `tests/e2e/${name}.spec.js`).join(' '));
