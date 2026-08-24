import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'index.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}

export async function loadItems() { return readJson(DATA_FILE, []); }
export async function loadMeta() { return readJson(META_FILE, { lastRefreshAt: null, sources: {} }); }

export async function saveItems(items) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
}

export async function saveMeta(meta) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
}

export function mergeItems(existing, incoming) {
  const map = new Map(existing.map(item => [item.hash, item]));
  for (const item of incoming) map.set(item.hash, item);
  return [...map.values()];
}

export function searchItems(items, keyword, category = 'all') {
  const q = keyword.trim().toLocaleLowerCase('zh-CN');
  if (!q) return [];
  return items
    .filter(item => (category === 'all' || item.category === category) && item.name.toLocaleLowerCase('zh-CN').includes(q))
    .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
}
