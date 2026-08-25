import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildStaticIndex, STATIC_CHUNK_SIZE } from '../scripts/build-static-index.js';
import { createMemoryIndexCache } from '../public/index-cache.js';
import { INDEX_MANIFEST_FILE, prepareStaticIndex, searchLocal, searchPreparedIndex } from '../public/search.js';
const root = new URL('../', import.meta.url), data = new URL('../public/data/', import.meta.url);
const response = value => ({ ok: true, status: 200, json: async () => JSON.parse(value), text: async () => value });

test('static manifest covers the complete local index with stable chunk fingerprints', async () => {
 const [source, manifest] = await Promise.all([fs.readFile(new URL('data/index.json', root),'utf8').then(JSON.parse),fs.readFile(new URL('manifest.json',data),'utf8').then(JSON.parse)]);
 const entries = Object.values(manifest.categories).flatMap(value => value.files);
 assert.equal(entries.reduce((sum, entry) => sum + entry.count, 0), source.length);
 assert.ok(entries.every(entry => /^[a-f0-9]{64}$/.test(entry.sha256)));
 assert.ok(Math.max(...entries.map(entry => entry.count)) <= STATIC_CHUNK_SIZE);
});

test('first synchronization writes cache and same version only requests manifest', async () => {
 const manifest = { version:'v1', totalItems:2, categories:{言情:{count:2,files:[{file:'yanqing-001.json',count:2,sha256:'a'}]}}};
 const files = {[INDEX_MANIFEST_FILE]:JSON.stringify(manifest),'./data/yanqing-001.json':JSON.stringify([{category:'言情',name:'Harry'},{category:'言情',name:'中文'}])};
 const calls=[]; const fetchFn=async file=>{calls.push(file); return response(files[file]);}; const cache=createMemoryIndexCache();
 const first=await prepareStaticIndex(fetchFn,cache); assert.equal(await cache.getChunk('a'),files['./data/yanqing-001.json']); assert.equal(calls.length,2);
 const result=await searchPreparedIndex(fetchFn,first,'harry','言情'); assert.equal(result.items.length,1);
 calls.length=0; await prepareStaticIndex(fetchFn,cache); assert.deepEqual(calls,[INDEX_MANIFEST_FILE]);
});

test('only changed chunks update and old version remains usable after a failed update', async () => {
 const old={version:'old',totalItems:1,categories:{言情:{count:1,files:[{file:'a.json',count:1,sha256:'old-a'}]}}}; const next={version:'next',totalItems:2,categories:{言情:{count:2,files:[{file:'a.json',count:1,sha256:'old-a'},{file:'b.json',count:1,sha256:'new-b'}]}}};
 const cache=createMemoryIndexCache(); await cache.saveManifest(old); await cache.saveChunk('old-a',JSON.stringify([{category:'言情',name:'旧书'}]));
 const files={[INDEX_MANIFEST_FILE]:JSON.stringify(next),'./data/b.json':JSON.stringify([{category:'言情',name:'新书'}])}; const calls=[]; const updated=await prepareStaticIndex(async file=>{calls.push(file);return response(files[file]);},cache); assert.deepEqual(calls,[INDEX_MANIFEST_FILE,'./data/b.json']); assert.equal(updated.manifest.version,'next');
 const stale=await prepareStaticIndex(async file=>file===INDEX_MANIFEST_FILE?response(JSON.stringify(old)):{ok:false,status:500,text:async()=>''},cache); assert.equal(stale.manifest.version,'old');
});

test('search remains Chinese contains matching and English case-insensitive', () => { const items=[{category:'言情',name:'Harry与中文'},{category:'男生',name:'中文'}]; assert.equal(searchLocal(items,'harry','言情').length,1); assert.equal(searchLocal(items,'中文','全部').length,2); });