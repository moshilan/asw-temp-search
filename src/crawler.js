import { SOURCES, DEFAULT_HEADERS } from './sources.js';
import { parseListPage } from './parser.js';
import { loadItems, loadMeta, mergeItems, saveItems, saveMeta } from './store.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers: DEFAULT_HEADERS, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.includes('浏览器不支持') || text.includes('操作系统语言设置非中文')) {
      throw new Error('网站拒绝请求：中文 Accept-Language 未被接受');
    }
    return text;
  } finally { clearTimeout(timer); }
}

export async function refreshSource(sourceId, {
  maxPages = 20,
  fetchHtmlFn = fetchHtml,
  loadItemsFn = loadItems,
  loadMetaFn = loadMeta,
  saveItemsFn = saveItems,
  saveMetaFn = saveMeta,
  now = () => new Date().toISOString(),
} = {}) {
  const source = SOURCES[sourceId];
  if (!source) throw new Error(`Unknown source: ${sourceId}`);
  const existing = await loadItemsFn();
  const known = new Set(existing.map(x => x.hash));
  const incoming = [];
  let pagesRead = 0;
  let hitKnown = false;
  let totalPages = null;

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(source.pagePath(page), source.origin).href;
    const parsed = parseListPage(await fetchHtmlFn(url), source);
    pagesRead++;
    totalPages ??= parsed.totalPages;
    if (!parsed.items.length) break;
    for (const item of parsed.items) {
      if (known.has(item.hash)) { hitKnown = true; continue; }
      incoming.push(item);
    }
    if (hitKnown) break;
    if (page >= parsed.totalPages) break;
    await sleep(350);
  }

  const merged = mergeItems(existing, incoming);
  await saveItemsFn(merged);
  const meta = await loadMetaFn();
  meta.lastRefreshAt = now();
  meta.sources[sourceId] = { lastRefreshAt: meta.lastRefreshAt, pagesRead, added: incoming.length, totalPages };
  await saveMetaFn(meta);
  return { sourceId, pagesRead, added: incoming.length, totalPages };
}

export async function refreshAll({ sourceIds = Object.keys(SOURCES), ...options } = {}) {
  const results = [];
  const errors = [];
  for (const sourceId of sourceIds) {
    try { results.push(await refreshSource(sourceId, options)); }
    catch (error) { errors.push({ sourceId, error: error.message }); }
  }
  return { results, errors };
}

export async function initializeAll({
  delayMs = 700,
  sources = Object.values(SOURCES),
  fetchHtmlFn = fetchHtml,
  loadItemsFn = loadItems,
  loadMetaFn = loadMeta,
  saveItemsFn = saveItems,
  saveMetaFn = saveMeta,
  now = () => new Date().toISOString(),
} = {}) {
  let all = await loadItemsFn();
  const meta = await loadMetaFn();
  meta.initialization ??= { sources: {} };
  const summary = [];
  for (const source of sources) {
    const progress = meta.initialization.sources[source.id];
    if (progress?.completed) {
      summary.push({ sourceId: source.id, pages: progress.totalPages, items: 0, skipped: true });
      continue;
    }

    let page = progress?.nextPage || 1;
    let pages = progress?.totalPages || null;
    let added = 0;
    while (!pages || page <= pages) {
      const html = await fetchHtmlFn(new URL(source.pagePath(page), source.origin).href);
      const parsed = parseListPage(html, source);
      pages ??= parsed.totalPages || 1;
      const before = all.length;
      all = mergeItems(all, parsed.items);
      added += all.length - before;
      await saveItemsFn(all);

      meta.initialization.sources[source.id] = { nextPage: page + 1, totalPages: pages, completed: false, updatedAt: now() };
      await saveMetaFn(meta);
      page++;
      if (page <= pages && delayMs) await sleep(delayMs);
    }

    meta.initialization.sources[source.id] = { nextPage: pages + 1, totalPages: pages, completed: true, updatedAt: now() };
    await saveMetaFn(meta);
    summary.push({ sourceId: source.id, pages, items: added, skipped: false });
  }
  meta.lastRefreshAt = now();
  meta.initializedAt = meta.lastRefreshAt;
  await saveMetaFn(meta);
  return summary;
}
