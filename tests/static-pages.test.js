import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { updateIndex } from '../scripts/update-index.js';
import { buildStaticIndex, STATIC_CHUNK_SIZE } from '../scripts/build-static-index.js';
import { INDEX_MANIFEST_FILE, loadIndexMeta, searchLocal, searchStaticIndexes } from '../public/search.js';

const root = new URL('../', import.meta.url);
const data = new URL('../public/data/', import.meta.url);

async function readManifestGroups(manifest) {
  return Promise.all(Object.values(manifest.categories).flatMap(({ files }) => files.map(file => fs.readFile(new URL(file, data), 'utf8').then(JSON.parse))));
}

test('static indexes preserve the complete local index as bounded category chunks', async () => {
  const [source, meta, manifest] = await Promise.all([
    fs.readFile(new URL('data/index.json', root), 'utf8').then(JSON.parse),
    fs.readFile(new URL('meta.json', data), 'utf8').then(JSON.parse),
    fs.readFile(new URL('manifest.json', data), 'utf8').then(JSON.parse),
  ]);
  const groups = await readManifestGroups(manifest);
  assert.equal(groups.flat().length, source.length);
  assert.equal(meta.totalItems, source.length);
  assert.equal(manifest.chunkSize, STATIC_CHUNK_SIZE);
  assert.ok(Math.max(...groups.map(group => group.length)) <= STATIC_CHUNK_SIZE);
  assert.deepEqual(meta.counts, Object.fromEntries(Object.entries(manifest.categories).map(([category, value]) => [category, value.count])));
  await assert.rejects(fs.access(new URL('danmei.json', data)));
  await assert.rejects(fs.access(new URL('yanqing.json', data)));
});

test('static builder writes category chunks, manifest and removes legacy large files', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'asw-static-'));
  try {
    await fs.mkdir(path.join(temp, 'data'), { recursive: true });
    const items = [
      ...Array.from({ length: STATIC_CHUNK_SIZE + 1 }, (_, index) => ({ hash: `d${index}`, category: '耽美', name: `D${index}` })),
      { hash: 'y', category: '言情', name: 'Y' },
      { hash: 'n', category: '男生', name: 'N' },
    ];
    await fs.writeFile(path.join(temp, 'data', 'index.json'), JSON.stringify(items));
    await fs.writeFile(path.join(temp, 'data', 'meta.json'), JSON.stringify({ lastRefreshAt: '2026-08-25T00:00:00.000Z' }));
    await fs.mkdir(path.join(temp, 'public', 'data'), { recursive: true });
    await fs.writeFile(path.join(temp, 'public', 'data', 'danmei.json'), 'legacy');
    const result = await buildStaticIndex({ rootDir: temp });
    assert.equal(result.manifest.categories.耽美.files.length, 2);
    assert.deepEqual(result.manifest.categories.男生.files, ['nansheng.json']);
    await assert.rejects(fs.access(path.join(temp, 'public', 'data', 'danmei.json')));
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('static search fetches chunks sequentially, filters categories and reuses a bounded cache', async () => {
  const manifest = {
    categories: {
      言情: { count: 2, files: ['yanqing-001.json', 'yanqing-002.json'] },
      耽美: { count: 1, files: ['danmei-001.json'] },
      男生: { count: 1, files: ['nansheng.json'] },
    },
  };
  const fixtures = {
    [INDEX_MANIFEST_FILE]: manifest,
    './data/yanqing-001.json': [{ hash: 'y1', category: '言情', name: 'Needle Y1' }],
    './data/yanqing-002.json': [{ hash: 'y2', category: '言情', name: 'other' }],
    './data/danmei-001.json': [{ hash: 'd', category: '耽美', name: 'needle D' }],
    './data/nansheng.json': [{ hash: 'n', category: '男生', name: 'needle N' }],
  };
  const requested = [];
  let active = 0;
  let maxActive = 0;
  const fetchFn = async file => {
    requested.push(file);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    active -= 1;
    return { ok: Object.hasOwn(fixtures, file), json: async () => fixtures[file] };
  };
  const progress = [];
  const result = await searchStaticIndexes(fetchFn, 'NEEDLE', '全部', { onProgress: item => progress.push(item.current) });
  assert.equal(maxActive, 1);
  assert.deepEqual(progress, [1, 2, 3, 4]);
  assert.deepEqual(result.items.map(item => item.category).sort(), ['言情', '男生', '耽美'].sort());
  assert.equal(result.totalItems, 4);
  const requestedBeforeReuse = requested.length;
  await searchStaticIndexes(fetchFn, 'needle', '言情');
  assert.equal(requested.length, requestedBeforeReuse);
  const categoryFetch = async file => ({ ok: true, json: async () => fixtures[file] });
  const yanqing = await searchStaticIndexes(categoryFetch, 'needle', '言情');
  assert.deepEqual(yanqing.items.map(item => item.category), ['言情']);
});

test('static search names the failed chunk', async () => {
  const fetchFn = async file => file === INDEX_MANIFEST_FILE
    ? { ok: true, json: async () => ({ categories: { 言情: { count: 1, files: ['yanqing-001.json'] } } }) }
    : { ok: false, json: async () => null };
  await assert.rejects(() => searchStaticIndexes(fetchFn, 'needle', '言情'), /无法加载言情分片yanqing-001\.json/);
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