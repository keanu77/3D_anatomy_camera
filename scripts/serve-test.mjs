// Deliberately small production-artifact server that applies Pages/Netlify _headers.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist');
const port = Number(process.env.TEST_PORT || 4174);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const rules = [];
let current;
for (const line of (await readFile(resolve(root, '_headers'), 'utf8')).split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) { current = { pattern: line.trim(), headers: {} }; rules.push(current); }
  else if (current) { const colon = line.indexOf(':'); if (colon > 0) current.headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim(); }
}
await stat(resolve(root, 'index.html'));
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    const file = resolve(root, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
    if (!file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
    for (const rule of rules) {
      const pattern = new RegExp('^' + rule.pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      if (pattern.test(pathname)) for (const [name, value] of Object.entries(rule.headers)) res.setHeader(name, value);
    }
    const body = await readFile(file);
    if (!res.hasHeader('Content-Type')) res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.setHeader('Content-Length', body.length);
    res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Production test server http://127.0.0.1:${port}`));
