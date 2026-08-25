export const INDEX_MANIFEST_FILE = './data/manifest.json';
const MAX_CACHED_CHUNKS = 4;
const manifestCache = new WeakMap();
const chunkCache = new WeakMap();

export function selectedCategories(category, manifest) {
  const categories = Object.keys(manifest.categories);
  return category === '全部' ? categories : categories.includes(category) ? [category] : [];
}

function normalizeKeyword(keyword) {
  return String(keyword).trim().toLocaleLowerCase('zh-CN');
}

function matches(item, keyword) {
  return String(item.name || '').toLocaleLowerCase('zh-CN').includes(keyword);
}

async function readJson(fetchFn, file, errorMessage) {
  let response;
  try {
    response = await fetchFn(file);
    if (!response.ok) throw new Error('bad response');
    return await response.json();
  } catch {
    throw new Error(errorMessage);
  }
}

export async function loadIndexManifest(fetchFn) {
  if (!manifestCache.has(fetchFn)) {
    const promise = readJson(fetchFn, INDEX_MANIFEST_FILE, '无法加载索引清单').catch(error => {
      manifestCache.delete(fetchFn);
      throw error;
    });
    manifestCache.set(fetchFn, promise);
  }
  return manifestCache.get(fetchFn);
}

async function loadChunk(fetchFn, category, file) {
  let cache = chunkCache.get(fetchFn);
  if (!cache) {
    cache = new Map();
    chunkCache.set(fetchFn, cache);
  }
  if (cache.has(file)) {
    const value = cache.get(file);
    cache.delete(file);
    cache.set(file, value);
    return value;
  }
  const items = await readJson(fetchFn, `./data/${file}`, `无法加载${category}分片${file}`);
  cache.set(file, items);
  if (cache.size > MAX_CACHED_CHUNKS) cache.delete(cache.keys().next().value);
  return items;
}

export async function searchStaticIndexes(fetchFn, keyword, category = '全部', { onProgress } = {}) {
  const q = normalizeKeyword(keyword);
  if (!q) return { items: [], totalItems: 0, chunksTotal: 0 };
  const manifest = await loadIndexManifest(fetchFn);
  const categories = selectedCategories(category, manifest);
  const chunks = categories.flatMap(name => manifest.categories[name].files.map(file => ({ category: name, file })));
  const matchesFound = [];

  for (const [index, chunk] of chunks.entries()) {
    onProgress?.({ current: index + 1, total: chunks.length, category: chunk.category, file: chunk.file });
    const items = await loadChunk(fetchFn, chunk.category, chunk.file);
    for (const item of items) if (matches(item, q)) matchesFound.push(item);
  }

  return {
    items: matchesFound.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || '')),
    totalItems: categories.reduce((total, name) => total + manifest.categories[name].count, 0),
    chunksTotal: chunks.length,
  };
}

export async function loadIndexMeta(fetchFn) {
  return readJson(fetchFn, './data/meta.json', '无法加载索引更新时间');
}

export function searchLocal(items, keyword, category = '全部') {
  const q = normalizeKeyword(keyword);
  if (!q) return [];
  return items
    .filter(item => (category === '全部' || item.category === category) && matches(item, q))
    .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
}