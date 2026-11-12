import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

const base = new URL(process.argv[2] || 'https://3danatomycamara.sportsmedicine.tw/');
if (base.protocol !== 'https:') throw new Error('Deployment verification requires HTTPS');
const expected = JSON.parse(await readFile('dist/version.json', 'utf8'));
if (expected.commit === 'local') throw new Error('Build with BUILD_SHA before verifying a release');
const get = async path => {
  let error;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000), headers: { 'Cache-Control': 'no-cache' } });
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      return response;
    } catch (caught) { error = caught; }
  }
  throw error;
};
const version = await (await get(`version.json?verify=${expected.commit}`)).json();
if (version.commit !== expected.commit) throw new Error(`Deployed commit ${version.commit} does not match ${expected.commit}`);
const home = await get('');
const policy = home.headers.get('content-security-policy') || '';
for (const directive of ["default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "connect-src 'self'", "frame-ancestors 'none'", "object-src 'none'"]) {
  if (!policy.includes(directive)) throw new Error(`Missing CSP directive: ${directive}`);
}
for (const [key, value] of Object.entries({ 'permissions-policy': 'camera=(self)', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' })) {
  if (!home.headers.get(key)?.includes(value)) throw new Error(`Missing expected ${key}`);
}
const files = [];
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.name !== '_headers') files.push(file);
  }
}
await walk('dist');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let index = 0, checked = 0, bytes = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (index < files.length) {
    const file = files[index++], path = relative('dist', file).split(sep).join('/');
    const response = await get(path);
    const local = await readFile(file), remote = Buffer.from(await response.arrayBuffer());
    if (path.startsWith('assets/') && !response.headers.get('cache-control')?.includes('immutable')) throw new Error(`Hashed asset is not immutable: ${path}`);
    if (/^anatomy\/.*\.bin$/.test(path) && !/^(br|gzip|zstd)$/.test(response.headers.get('content-encoding') || '')) throw new Error(`Geometry buffer is served uncompressed: ${path}`);
    if (sha(local) !== sha(remote)) throw new Error(`Published bytes differ: ${path}`);
    checked++; bytes += remote.length;
  }
}));
console.log(JSON.stringify({ url: base.href, commit: version.commit, securityHeaders: 'passed', deliveryHeaders: 'passed', matchingAssets: checked, bytes }, null, 2));
