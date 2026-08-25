import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeUploadedAt } from '../src/parser.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STATIC_CHUNK_SIZE = 4000;
const categories = [{ id: 'danmei', label: '耽美', chunked: true }, { id: 'yanqing', label: '言情', chunked: true }, { id: 'nansheng', label: '男生', chunked: false }];
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const chunkItems = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
async function removePreviousChunks(output) {
  const files = await fs.readdir(output);
  await Promise.all(files.filter(file => /^(?:danmei|yanqing)(?:-\d+)?\.json$/.test(file)).map(file => fs.unlink(path.join(output, file))));
}
export async function buildStaticIndex({ rootDir = root } = {}) {
  const input = JSON.parse(await fs.readFile(path.join(rootDir, 'data', 'index.json'), 'utf8'));
  const sourceMeta = JSON.parse(await fs.readFile(path.join(rootDir, 'data', 'meta.json'), 'utf8'));
  const output = path.join(rootDir, 'public', 'data');
  await fs.mkdir(output, { recursive: true });
  await removePreviousChunks(output);
  const counts = {}; const manifestCategories = {}; let maxChunkItems = 0;
  for (const { id, label, chunked } of categories) {
    const items = input.filter(item => item.category === label).map(item => ({ ...item, uploadedAt: normalizeUploadedAt(item.uploadedAt, sourceMeta.lastRefreshAt) }));
    if (!items.length) throw new Error(`缺少${label}索引`);
    counts[label] = items.length;
    const files = [];
    for (const [index, chunk] of (chunked ? chunkItems(items, STATIC_CHUNK_SIZE) : [items]).entries()) {
      const file = chunked ? `${id}-${String(index + 1).padStart(3, '0')}.json` : `${id}.json`;
      const text = JSON.stringify(chunk);
      await fs.writeFile(path.join(output, file), text, 'utf8');
      files.push({ file, count: chunk.length, sha256: digest(text) });
      maxChunkItems = Math.max(maxChunkItems, chunk.length);
    }
    manifestCategories[label] = { count: items.length, files };
  }
  const version = digest(JSON.stringify({ chunkSize: STATIC_CHUNK_SIZE, categories: manifestCategories }));
  const manifest = { version, chunkSize: STATIC_CHUNK_SIZE, totalItems: input.length, counts, lastUpdatedAt: sourceMeta.lastRefreshAt || sourceMeta.initializedAt || null, categories: manifestCategories };
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  await fs.writeFile(path.join(output, 'meta.json'), JSON.stringify({ totalItems: input.length, counts, lastUpdatedAt: manifest.lastUpdatedAt, manifest: 'manifest.json', indexVersion: version }), 'utf8');
  return { totalItems: input.length, counts, manifest, maxChunkItems };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(await buildStaticIndex());