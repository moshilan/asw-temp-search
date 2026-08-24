import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshAll } from './crawler.js';
import { loadItems, loadMeta, searchItems } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8' };
const json = (res, status, obj) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(obj)); };

async function readBody(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 20000) throw new Error('Request too large'); }
  return body ? JSON.parse(body) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'POST' && url.pathname === '/api/search') {
      const { q = '', category = 'all' } = await readBody(req);
      const refresh = await refreshAll({ maxPages: 20 });
      const items = await loadItems();
      const results = searchItems(items, String(q), String(category)).slice(0, 200);
      return json(res, 200, { results, refresh, meta: await loadMeta(), totalIndexed: items.length });
    }
    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      const refresh = await refreshAll({ maxPages: 20 });
      return json(res, 200, { refresh, meta: await loadMeta(), totalIndexed: (await loadItems()).length });
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return json(res, 200, { meta: await loadMeta(), totalIndexed: (await loadItems()).length });
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const file = path.normalize(path.join(PUBLIC, pathname));
    if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'Forbidden' });
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
      res.end(data);
    } catch (e) {
      if (e.code === 'ENOENT') return json(res, 404, { error: 'Not found' });
      throw e;
    }
  } catch (error) { json(res, 500, { error: error.message }); }
});

server.listen(PORT, HOST, () => console.log(`ASW 临时搜索已启动：http://localhost:${PORT}`));
