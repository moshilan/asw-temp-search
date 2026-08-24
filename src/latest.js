import { parseListPage } from './parser.js';
import { SOURCES, DEFAULT_HEADERS } from './sources.js';

export const MAX_LATEST_REQUESTS = 45;

export async function fetchLatestHtml(url, fetchFn = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchFn(url, { headers: DEFAULT_HEADERS, signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    if (html.includes('浏览器不支持') || html.includes('操作系统语言设置非中文')) {
      throw new Error('网站拒绝请求：中文 Accept-Language 未被接受');
    }
    return html;
  } finally {
    clearTimeout(timer);
  }
}

export async function collectLatest({ baselines, fetchHtmlFn = fetchLatestHtml, sources = Object.values(SOURCES), maxRequests = MAX_LATEST_REQUESTS } = {}) {
  const results = [];
  const errors = [];
  const pagesRead = {};
  let remaining = maxRequests;

  for (const source of sources) {
    const baselineHash = baselines?.[source.id]?.hash;
    if (!baselineHash) {
      errors.push({ sourceId: source.id, error: '缺少基线 hash' });
      continue;
    }
    let page = 1;
    let foundBaseline = false;
    pagesRead[source.id] = 0;
    try {
      while (remaining > 0) {
        const url = new URL(source.pagePath(page), source.origin).href;
        const parsed = parseListPage(await fetchHtmlFn(url), source);
        remaining--;
        pagesRead[source.id]++;
        for (const item of parsed.items) {
          if (item.hash === baselineHash) {
            foundBaseline = true;
            break;
          }
          results.push(item);
        }
        if (foundBaseline || !parsed.items.length || page >= parsed.totalPages) break;
        page++;
      }
      if (!foundBaseline && remaining === 0) errors.push({ sourceId: source.id, error: '已达到本次刷新请求上限' });
    } catch (error) {
      errors.push({ sourceId: source.id, error: error.message });
    }
  }
  return { results, errors, pagesRead, requestsUsed: maxRequests - remaining };
}
