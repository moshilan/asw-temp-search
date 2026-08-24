import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { collectLatest, fetchLatestHtml, MAX_LATEST_REQUESTS } from '../src/latest.js';
import { SOURCES } from '../src/sources.js';
import { INDEX_FILES, loadIndexes, mergeByHash, searchLocal } from '../public/search.js';

const root = new URL('../public/data/', import.meta.url);
const hash = n => n.toString(16).padStart(32, '0');
const card = (value, name) => `<a href="/file.php?hash=${value}" class="file-card-link"><div class="file-name">${name}</div><span class="detail-item">📦 1.00 MB</span><span class="detail-item">🕒 08-25 10:00</span></a>`;
const page = cards => `<div class="page-info">共 2 页</div>${cards.join('')}`;

test('split static indexes preserve all initialized resources', async () => {
  const ids = ['danmei', 'yanqing', 'nansheng'];
  const groups = await Promise.all(ids.map(async id => JSON.parse(await fs.readFile(new URL(`${id}.json`, root), 'utf8'))));
  const baseline = JSON.parse(await fs.readFile(new URL('baseline.json', root), 'utf8'));
  assert.deepEqual(groups.map(group => group.length), [46604, 34745, 1440]);
  assert.equal(groups.flat().length, 82789);
  assert.equal(baseline.totalItems, 82789);
  assert.ok(groups[0].some(item => item.hash === baseline.sources.danmei.hash));
  assert.ok(groups[1].some(item => item.hash === baseline.sources.yanqing.hash));
  assert.ok(groups[2].some(item => item.hash === baseline.sources.nansheng.hash));
});

test('category loading requests only the selected index and all requests all three', async () => {
  const fixtures = Object.fromEntries(Object.entries(INDEX_FILES).map(([category, file]) => [file, [{ hash: category, category, name: category }] ]));
  const requested = [];
  const fetchFn = async file => ({ ok: true, json: async () => { requested.push(file); return fixtures[file]; } });
  assert.deepEqual(await loadIndexes(fetchFn, '言情'), fixtures['/data/yanqing.json']);
  assert.deepEqual(requested, ['/data/yanqing.json']);
  requested.length = 0;
  assert.equal((await loadIndexes(fetchFn, '全部')).length, 3);
  assert.deepEqual(requested.sort(), Object.values(INDEX_FILES).sort());
});

test('all category merge and temporary latest resources remain searchable', () => {
  const base = [
    { hash: 'a', category: '言情', name: 'Alpha.txt', uploadedAt: '08-23 01:00' },
    { hash: 'b', category: '耽美', name: '共同关键词.txt', uploadedAt: '08-24 01:00' },
    { hash: 'c', category: '男生', name: '共同关键词.txt', uploadedAt: '08-25 01:00' },
  ];
  const merged = mergeByHash(base, [{ hash: 'd', category: '言情', name: 'New Harry Book.txt', uploadedAt: '08-25 02:00' }]);
  assert.equal(merged.length, 4);
  assert.deepEqual(searchLocal(merged, '共同关键词', '全部').map(item => item.category).sort(), ['男生', '耽美']);
  assert.equal(searchLocal(merged, 'harry', '言情').length, 1);
  assert.equal(searchLocal(merged, 'HARRY', '言情').length, 1);
});

test('latest collection stops when it encounters the baseline hash', async () => {
  const source = SOURCES.danmei;
  const baseline = hash(2);
  const calls = [];
  const result = await collectLatest({
    baselines: { danmei: { hash: baseline } },
    sources: [source],
    fetchHtmlFn: async url => {
      calls.push(url);
      return page([card(hash(1), '新资源.txt'), card(baseline, '基线资源.txt')]);
    },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(result.results.map(item => item.hash), [hash(1)]);
  assert.equal(result.pagesRead.danmei, 1);
  assert.equal(result.requestsUsed, 1);
  assert.ok(MAX_LATEST_REQUESTS < 50);
});



test('latest fetch sends the required Chinese Accept-Language header', async () => {
  let options;
  await fetchLatestHtml('https://example.test/', async (_url, value) => {
    options = value;
    return { ok: true, text: async () => '<html></html>' };
  });
  assert.equal(options.headers['Accept-Language'], 'zh-CN,zh;q=0.9,en;q=0.8');
});
