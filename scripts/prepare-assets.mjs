import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { buildTime } from './build-time.mjs';

// A clean checkout must build independently. Existing pinned files are verified
// from cache; missing/corrupt files are fetched and checksum-checked atomically.
await import('./fetch-models.mjs');

await mkdir('public/mediapipe/wasm', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe/wasm', { recursive: true });
await mkdir('LICENSES', { recursive: true });
await cp('node_modules/three/LICENSE', 'LICENSES/three-MIT.txt');
await cp('node_modules/@mediapipe/tasks-vision/README.md', 'LICENSES/MediaPipe-package-README.md');
const manifest = JSON.parse(await readFile('public/models/checksums.json', 'utf8'));
for (const item of manifest.models) {
  const bytes = await readFile(join('public/models', item.file));
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error(`Checksum mismatch: ${item.file}`);
}
await mkdir('public/licenses', { recursive: true });
await cp('LICENSES', 'public/licenses', { recursive: true });
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile('public/version.json', JSON.stringify({ version, commit: process.env.BUILD_SHA || 'local', builtAt: buildTime().toISOString() }) + '\n');
console.log('Self-hosted WASM copied; model checksums verified.');
