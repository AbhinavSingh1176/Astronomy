#!/usr/bin/env node
/* OWLT · tests/serve-gh.mjs — serves the site the way GitHub Pages does, for timing tests:
   text types (html, css, js, json, svg, xml, txt) gzip-compressed, binaries (.bin, images, fonts) as they are,
   10-minute cache headers.   node tests/serve-gh.mjs [port]   (default 8766) */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT = +process.argv[2] || 8766;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.bin': 'application/octet-stream', '.ico': 'image/x-icon' };
const ZIP = /^(text\/|application\/(javascript|json|xml|manifest)|image\/svg)/;
const cache = new Map();
http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, path.normalize(p)); if (!f.startsWith(ROOT)) throw Object.assign(new Error('outside'), { code: 'ENOENT' });
    const st = await stat(f), type = TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', gz = ZIP.test(type) && /gzip/.test(req.headers['accept-encoding'] || '');
    const key = f + (gz ? '.gz' : '') + st.mtimeMs; let body = cache.get(key);
    if (!body) { body = await readFile(f); if (gz) body = gzipSync(body, { level: 6 }); cache.set(key, body); }
    res.writeHead(200, { 'content-type': type, 'content-length': body.length, 'cache-control': 'max-age=600', ...(gz ? { 'content-encoding': 'gzip', vary: 'Accept-Encoding' } : {}) });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) { res.writeHead(e.code === 'ENOENT' || e.code === 'EISDIR' ? 404 : 500); res.end('not found'); }
}).listen(PORT, '127.0.0.1', () => console.log('serving ' + ROOT + ' like GitHub Pages on http://127.0.0.1:' + PORT));
