import { fetchWithRetry } from './index-cache.js';
export const INDEX_MANIFEST_FILE = './data/manifest.json';
const normalizeKeyword = keyword => String(keyword).trim().toLocaleLowerCase('zh-CN');
const matches = (item, keyword) => String(item.name || '').toLocaleLowerCase('zh-CN').includes(keyword);
export const selectedCategories = (category, manifest) => category === '全部' ? Object.keys(manifest.categories) : manifest.categories[category] ? [category] : [];
const descriptors = (manifest, category) => selectedCategories(category, manifest).flatMap(name => manifest.categories[name].files.map(entry => ({ category: name, ...entry })));

export async function prepareStaticIndex(fetchFn, cache, { onProgress } = {}) {
  const cachedManifest = cache ? await cache.getManifest() : null;
  let manifest;
  try { manifest = await fetchWithRetry(fetchFn, INDEX_MANIFEST_FILE); }
  catch (error) { if (cachedManifest) return { manifest: cachedManifest, cache, stale: true, warning: `更新失败，使用本地缓存：${error.message}` }; throw new Error('无法加载索引清单'); }
  if (!cache || cachedManifest?.version === manifest.version) return { manifest, cache, stale: false };
  const chunks = descriptors(manifest, '全部');
  try {
    for (const [index, chunk] of chunks.entries()) {
      if (await cache.getChunk(chunk.sha256)) continue;
      onProgress?.({ current: index + 1, total: chunks.length, category: chunk.category, file: chunk.file });
      const text = await fetchWithRetry(fetchFn, `./data/${chunk.file}`, { asText: true });
      JSON.parse(text);
      await cache.saveChunk(chunk.sha256, text);
    }
    await cache.saveManifest(manifest);
    return { manifest, cache, stale: false };
  } catch (error) {
    if (cachedManifest) return { manifest: cachedManifest, cache, stale: true, warning: `更新失败，使用本地缓存：${error.message}` };
    throw new Error(`无法下载索引：${error.message}`);
  }
}

export async function searchPreparedIndex(fetchFn, prepared, keyword, category = '全部', { onProgress } = {}) {
  const q = normalizeKeyword(keyword); if (!q) return { items: [], totalItems: 0, chunksTotal: 0 };
  const chunks = descriptors(prepared.manifest, category); const found = [];
  for (const [index, chunk] of chunks.entries()) {
    onProgress?.({ current: index + 1, total: chunks.length, category: chunk.category, file: chunk.file });
    let text = prepared.cache ? await prepared.cache.getChunk(chunk.sha256) : null;
    if (!text) text = await fetchWithRetry(fetchFn, `./data/${chunk.file}`, { asText: true });
    for (const item of JSON.parse(text)) if (matches(item, q)) found.push(item);
  }
  return { items: found.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || '')), totalItems: selectedCategories(category, prepared.manifest).reduce((sum, name) => sum + prepared.manifest.categories[name].count, 0), chunksTotal: chunks.length };
}
export function searchLocal(items, keyword, category = '全部') { const q = normalizeKeyword(keyword); return q ? items.filter(item => (category === '全部' || item.category === category) && matches(item, q)).sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || '')) : []; }