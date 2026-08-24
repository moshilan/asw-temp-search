import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'index.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');
export const CATEGORIES = ['全部', '言情', '耽美', '男生'];

const categoryAliases = {
  all: '全部',
  yanqing: '言情',
  danmei: '耽美',
  nansheng: '男生',
};

export function normalizeCategory(category) {
  return categoryAliases[category] || category;
}

function normalizeItem(item) {
  const category = normalizeCategory(item.categoryLabel || item.category);
  return { ...item, category, categoryLabel: category };
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}

export async function loadItems() {
  const items = await readJson(DATA_FILE, []);
  const normalized = items.map(normalizeItem);
  if (items.some((item, index) => item.category !== normalized[index].category || item.categoryLabel !== normalized[index].categoryLabel)) {
    await saveItems(normalized);
  }
  return normalized;
}
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
  const map = new Map(existing.map(item => [item.hash, normalizeItem(item)]));
  for (const item of incoming) {
    const normalized = normalizeItem(item);
    map.set(normalized.hash, normalized);
  }
  return [...map.values()];
}

export function searchItems(items, keyword, category = '全部') {
  const q = keyword.trim().toLocaleLowerCase('zh-CN');
  const selectedCategory = normalizeCategory(category);
  if (!q) return [];
  return items
    .map(normalizeItem)
    .filter(item => (selectedCategory === '全部' || item.category === selectedCategory) && item.name.toLocaleLowerCase('zh-CN').includes(q))
    .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
}
