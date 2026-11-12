import { readdir, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const root = resolve('dist');
async function list(path) {
  const out = [];
  for (const item of await readdir(path, { withFileTypes: true })) {
    const file = resolve(path, item.name);
    if (item.isDirectory()) out.push(...await list(file));
    else if (item.isFile()) out.push({ path: relative(root, file).split(sep).join('/'), bytes: (await stat(file)).size });
    else throw new Error(`Unexpected nonregular deployment asset: ${file}`);
  }
  return out;
}
const files = await list(root);
const total = files.reduce((sum, f) => sum + f.bytes, 0);
const wasm = files.filter((f) => f.path.startsWith('mediapipe/wasm/')).reduce((sum, f) => sum + f.bytes, 0);
const withoutWasm = total - wasm;
if (total > 50_000_000) throw new Error(`Deployment exceeds reviewed 50 MB budget: ${total}`);
if (withoutWasm > 30_000_000) throw new Error(`Non-WASM deployment exceeds reviewed 30 MB budget: ${withoutWasm}`);
if (files.some((f) => /(^|\/)(original|tools|tests|node_modules)\//.test(f.path))) throw new Error('Development-only files leaked into deployment');
console.log(JSON.stringify({ files: files.length, totalBytes: total, wasmBytes: wasm, withoutWasmBytes: withoutWasm, budgets: { total: 50_000_000, withoutWasm: 30_000_000 } }, null, 2));
