import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STATIC_CHUNK_SIZE = 4000;
const categories = [
  { id: 'danmei', label: '耽美', chunked: true },
  { id: 'yanqing', label: '言情', chunked: true },
  { id: 'nansheng', label: '男生', chunked: false },
];

function chunkItems(items, size) {
  const chunks = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

async function removePreviousChunks(output) {
  const files = await fs.readdir(output);
  await Promise.all(files
    .filter(file => /^(?:danmei|yanqing)(?:-\d+)?\.json$/.test(file))
    .map(file => fs.unlink(path.join(output, file))));
}

export async function buildStaticIndex({ rootDir = root } = {}) {
  const input = JSON.parse(await fs.readFile(path.join(rootDir, 'data', 'index.json'), 'utf8'));
  const sourceMeta = JSON.parse(await fs.readFile(path.join(rootDir, 'data', 'meta.json'), 'utf8'));
  const output = path.join(rootDir, 'public', 'data');
  await fs.mkdir(output, { recursive: true });
  await removePreviousChunks(output);

  const counts = {};
  const manifest = { version: 1, chunkSize: STATIC_CHUNK_SIZE, categories: {} };
  let maxChunkItems = 0;

  for (const { id, label, chunked } of categories) {
    const items = input.filter(item => item.category === label);
    if (!items.length) throw new Error(`缺少${label}索引`);
    counts[label] = items.length;
    const chunks = chunked ? chunkItems(items, STATIC_CHUNK_SIZE) : [items];
    const files = [];

    for (const [index, chunk] of chunks.entries()) {
      const file = chunked ? `${id}-${String(index + 1).padStart(3, '0')}.json` : `${id}.json`;
      await fs.writeFile(path.join(output, file), JSON.stringify(chunk), 'utf8');
      files.push(file);
      maxChunkItems = Math.max(maxChunkItems, chunk.length);
    }
    manifest.categories[label] = { count: items.length, files };
  }

  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  await fs.writeFile(path.join(output, 'meta.json'), JSON.stringify({
    totalItems: input.length,
    counts,
    lastUpdatedAt: sourceMeta.lastRefreshAt || sourceMeta.initializedAt || null,
    manifest: 'manifest.json',
  }), 'utf8');
  return { totalItems: input.length, counts, manifest, maxChunkItems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(await buildStaticIndex());
}