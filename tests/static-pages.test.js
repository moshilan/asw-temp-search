import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { updateIndex } from '../scripts/update-index.js';
import { INDEX_FILES, loadIndexMeta, loadIndexes, searchLocal } from '../public/search.js';

const root = new URL('../', import.meta.url);
const data = new URL('../public/data/', import.meta.url);

test('static indexes preserve the complete local index', async () => {
  const ids = ['danmei', 'yanqing', 'nansheng'];
  const [source, meta, ...groups] = await Promise.all([
    fs.readFile(new URL('data/index.json', root), 'utf8').then(JSON.parse),
    fs.readFile(new URL('meta.json', data), 'utf8').then(JSON.parse),
    ...ids.map(id => fs.readFile(new URL(`${id}.json`, data), 'utf8').then(JSON.parse)),
  ]);
  assert.equal(groups.flat().length, source.length);
  assert.equal(meta.totalItems, source.length);
  assert.deepEqual(meta.counts, Object.fromEntries([['耽美', groups[0].length], ['言情', groups[1].length], ['男生', groups[2].length]]));
});

test('static category loading only requests selected files and all loads all categories', async () => {
  const fixtures = Object.fromEntries(Object.entries(INDEX_FILES).map(([category, file]) => [file, [{ hash: category, category, name: category }]]));
  const requested = [];
  const fetchFn = async file => ({ ok: true, json: async () => { requested.push(file); return fixtures[file]; } });
  assert.deepEqual(await loadIndexes(fetchFn, '言情'), fixtures['./data/yanqing.json']);
  assert.deepEqual(requested, ['./data/yanqing.json']);
  requested.length = 0;
  assert.equal((await loadIndexes(fetchFn, '全部')).length, 3);
  assert.deepEqual(requested.sort(), Object.values(INDEX_FILES).sort());
});

test('browser search is static-only and keeps category and English case-insensitive matching', async () => {
  const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const items = [
    { hash: 'a', category: '言情', name: 'Harry Potter.txt' },
    { hash: 'b', category: '耽美', name: '共同关键词.txt' },
    { hash: 'c', category: '男生', name: '共同关键词.txt' },
  ];
  assert.doesNotMatch(app, /\/api\//);
  assert.equal(searchLocal(items, 'harry', '言情').length, 1);
  assert.equal(searchLocal(items, 'HARRY', '言情').length, 1);
  assert.deepEqual(searchLocal(items, '共同关键词', '全部').map(item => item.category).sort(), ['男生', '耽美']);
  assert.deepEqual(searchLocal(items, '共同关键词', '男生').map(item => item.category), ['男生']);
});

test('static metadata loads without an API request', async () => {
  const meta = await loadIndexMeta(async file => ({ ok: file === './data/meta.json', json: async () => ({ totalItems: 1, lastUpdatedAt: '2026-08-25T00:00:00.000Z' }) }));
  assert.equal(meta.totalItems, 1);
});

test('GitHub Actions update script refreshes then rebuilds static files', async () => {
  const calls = [];
  const result = await updateIndex({
    refreshAllFn: async () => { calls.push('refresh'); return { results: [{ sourceId: 'danmei', added: 1 }], errors: [] }; },
    buildStaticIndexFn: async options => { calls.push(['build', options.rootDir]); return { totalItems: 82789, counts: {} }; },
  });
  assert.deepEqual(calls[0], 'refresh');
  assert.equal(calls[1][0], 'build');
  assert.equal(result.index.totalItems, 82789);
});
