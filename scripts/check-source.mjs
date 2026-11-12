import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const file of await readdir('src')) {
  if (!file.endsWith('.js')) continue;
  const result = spawnSync(process.execPath, ['--check', `src/${file}`], { encoding: 'utf8' });
  if (result.status) throw new Error(result.stderr);
  const source = await readFile(`src/${file}`, 'utf8');
  if (/\binnerHTML\b|\beval\s*\(|new\s+Function\b/.test(source)) throw new Error(`Unsafe API in ${file}`);
}
console.log('JavaScript syntax and prohibited source APIs: passed.');
