import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const manifest = JSON.parse(await readFile('public/models/checksums.json', 'utf8'));
await mkdir('public/models', { recursive: true });
for (const item of manifest.models) {
  const file = join('public/models', item.file);
  const valid = bytes => bytes.length === item.bytes && createHash('sha256').update(bytes).digest('hex') === item.sha256;
  try { if (valid(await readFile(file))) { console.log(`${item.file}: verified cached file`); continue; } } catch {}
  let bytes;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(item.url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (!valid(bytes)) throw new Error(`Checksum mismatch: ${item.file}`);
      break;
    } catch (error) { if (attempt === 2) throw error; }
  }
  await writeFile(`${file}.tmp`, bytes);
  await rename(`${file}.tmp`, file);
  console.log(`${item.file}: downloaded and verified`);
}
