// Servidor estatico minimo (sin dependencias) para QA visual de la demo.
// Uso: node serve-demo.mjs [puerto]  (default 8931)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const PORT = Number(process.argv[2] || 8931);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (p === '' || p.endsWith('/')) p += 'demo.html';
    const file = resolve(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`demo server on http://127.0.0.1:${PORT}/demo/demo.html`));
