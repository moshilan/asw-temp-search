import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLatestHtml } from '../src/latest.js';
import { parseListPage } from '../src/parser.js';
import { SOURCES } from '../src/sources.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = JSON.parse(await fs.readFile(path.join(root, 'data', 'index.json'), 'utf8'));
const output = path.join(root, 'public', 'data');
const categories = { danmei: '耽美', yanqing: '言情', nansheng: '男生' };

async function newestKnownHash(id, items) {
  const source = SOURCES[id];
  const known = new Set(items.map(item => item.hash));
  const html = await fetchLatestHtml(new URL(source.pagePath(1), source.origin).href);
  const latest = parseListPage(html, source).items.find(item => known.has(item.hash));
  if (!latest) throw new Error(`${source.label}首页未找到已收录资源，无法建立安全基线`);
  return latest.hash;
}

await fs.mkdir(output, { recursive: true });
const baseline = { sources: {}, totalItems: input.length };
for (const [id, label] of Object.entries(categories)) {
  const items = input.filter(item => item.category === label);
  if (!items.length) throw new Error(`缺少${label}索引`);
  await fs.writeFile(path.join(output, `${id}.json`), JSON.stringify(items), 'utf8');
  baseline.sources[id] = { hash: await newestKnownHash(id, items), count: items.length };
}
await fs.writeFile(path.join(output, 'baseline.json'), JSON.stringify(baseline), 'utf8');
