import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const categories = { danmei: '耽美', yanqing: '言情', nansheng: '男生' };

export async function buildStaticIndex({ rootDir = root } = {}) {
  const input = JSON.parse(await fs.readFile(path.join(rootDir, 'data', 'index.json'), 'utf8'));
  const sourceMeta = JSON.parse(await fs.readFile(path.join(rootDir, 'data', 'meta.json'), 'utf8'));
  const output = path.join(rootDir, 'public', 'data');
  await fs.mkdir(output, { recursive: true });
  const counts = {};
  for (const [id, label] of Object.entries(categories)) {
    const items = input.filter(item => item.category === label);
    if (!items.length) throw new Error(`缺少${label}索引`);
    counts[label] = items.length;
    await fs.writeFile(path.join(output, `${id}.json`), JSON.stringify(items), 'utf8');
  }
  await fs.writeFile(path.join(output, 'meta.json'), JSON.stringify({
    totalItems: input.length,
    counts,
    lastUpdatedAt: sourceMeta.lastRefreshAt || sourceMeta.initializedAt || null,
  }), 'utf8');
  return { totalItems: input.length, counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(await buildStaticIndex());
}
