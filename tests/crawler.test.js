import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeAll, refreshAll, refreshSource } from '../src/crawler.js';
import { SOURCES } from '../src/sources.js';

const item = (hash, name = '测试小说 作者：测试') => `<a href="/file.php?hash=${hash}" class="file-card-link"><div class="file-name">${name}.txt</div><span class="detail-item">📦 1.00 MB</span><span class="detail-item">🕒 08-25 10:00</span></a>`;
const page = (items, totalPages = 2) => `<div class="page-info">共 ${totalPages} 页 共 200 个文件</div>${items.join('')}`;
const hash = n => n.toString(16).padStart(32, '0');

function memory(items = [], meta = { lastRefreshAt: null, sources: {} }) {
  const state = { items, meta, savedItems: 0, savedMeta: 0 };
  return {
    state,
    loadItemsFn: async () => state.items,
    loadMetaFn: async () => state.meta,
    saveItemsFn: async value => { state.items = value; state.savedItems++; },
    saveMetaFn: async value => { state.meta = structuredClone(value); state.savedMeta++; },
  };
}

test('incremental refresh continues while a page is all new and stops at a known hash', async () => {
  const db = memory([{ hash: hash(3), category: '耽美', name: '旧资源' }]);
  const requested = [];
  const fetchHtmlFn = async url => {
    requested.push(url);
    return url.includes('page=2') ? page([item(hash(3)), item(hash(4))]) : page([item(hash(1)), item(hash(2))]);
  };
  const result = await refreshSource('danmei', { ...db, fetchHtmlFn, maxPages: 5, now: () => '2026-08-25T00:00:00.000Z' });
  assert.equal(result.pagesRead, 2);
  assert.equal(result.added, 3);
  assert.equal(requested.length, 2);
  assert.equal(new Set(db.state.items.map(x => x.hash)).size, 4);
});

test('a failed category does not clear the existing index or block another category', async () => {
  const db = memory([{ hash: hash(9), category: '耽美', name: '已有资源' }]);
  const result = await refreshAll({
    ...db,
    sourceIds: ['danmei', 'yanqing'],
    maxPages: 1,
    fetchHtmlFn: async url => {
      if (url.includes('asw7777')) throw new Error('network unavailable');
      return page([item(hash(1))], 1);
    },
  });
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.errors, [{ sourceId: 'yanqing', error: 'network unavailable' }]);
  assert.deepEqual(db.state.items.map(x => x.hash).sort(), [hash(1), hash(9)].sort());
});

test('a welcome page is reported as failure without updating index or source metadata', async () => {
  const items = [{ hash: hash(9), category: '言情', name: '已有资源' }];
  const meta = { lastRefreshAt: '2026-09-03T16:08:12.243Z', sources: { yanqing: { totalPages: 357, added: 24 } } };
  const db = memory(items, structuredClone(meta));
  const result = await refreshAll({
    ...db,
    sourceIds: ['yanqing'],
    fetchHtmlFn: async () => '<html><title>Welcome</title><body></body></html>',
  });
  assert.deepEqual(result.results, []);
  assert.deepEqual(result.errors, [{ sourceId: 'yanqing', error: '言情第1页不是有效列表，缺少资源或分页信息' }]);
  assert.deepEqual(db.state, { items, meta, savedItems: 0, savedMeta: 0 });
});

test('missing pagination on a later page fails without committing a partial refresh', async () => {
  const db = memory();
  await assert.rejects(refreshSource('yanqing', {
    ...db,
    fetchHtmlFn: async url => url.includes('page=2') ? item(hash(2)) : page([item(hash(1))]),
  }), /言情第2页不是有效列表/);
  assert.equal(db.state.savedItems, 0);
  assert.equal(db.state.savedMeta, 0);
});

test('a valid one-page list with only known hashes still reports zero additions successfully', async () => {
  const db = memory([{ hash: hash(1), category: '言情', name: '已有资源' }]);
  const result = await refreshSource('yanqing', { ...db, fetchHtmlFn: async () => page([item(hash(1))], 1) });
  assert.equal(result.added, 0);
  assert.equal(db.state.meta.sources.yanqing.totalPages, 1);
  assert.equal(db.state.savedMeta, 1);
});

test('initialization resumes from its saved next page and saves each fetched page', async () => {
  const db = memory(
    [{ hash: hash(1), category: '耽美', name: '第一页资源' }],
    { lastRefreshAt: null, sources: {}, initialization: { sources: { danmei: { nextPage: 2, totalPages: 2, completed: false } } } },
  );
  const requested = [];
  const summary = await initializeAll({
    ...db,
    sources: [SOURCES.danmei],
    delayMs: 0,
    fetchHtmlFn: async url => { requested.push(url); return page([item(hash(2))], 2); },
    now: () => '2026-08-25T00:00:00.000Z',
  });
  assert.equal(requested.length, 1);
  assert.match(requested[0], /page=2/);
  assert.equal(db.state.savedItems, 1);
  assert.equal(db.state.meta.initialization.sources.danmei.completed, true);
  assert.deepEqual(summary, [{ sourceId: 'danmei', pages: 2, items: 1, skipped: false }]);
});
