import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCategory, searchItems, mergeItems } from '../src/store.js';

const items = [
  {hash:'a', category:'耽美', name:'《漂亮的他》作者：浮云素 共同关键词.txt', uploadedAt:'08-25 01:00'},
  {hash:'b', category:'言情', name:'某本小说 作者：张三 共同关键词.txt', uploadedAt:'08-24 01:00'},
  {hash:'c', category:'男生', name:'男生小说 作者：王五 共同关键词.txt', uploadedAt:'08-23 01:00'}
];

test('single keyword matches any part of filename', () => {
  assert.equal(searchItems(items, '漂亮').length, 1);
  assert.equal(searchItems(items, '漂亮的他').length, 1);
  assert.equal(searchItems(items, '浮云素').length, 1);
  assert.equal(searchItems(items, '张三').length, 1);
  assert.equal(searchItems(items, '  浮云素  ').length, 1);
});

test('category filters return only their selected Chinese category', () => {
  assert.deepEqual(searchItems(items, '共同关键词').map(item => item.category).sort(), ['言情', '男生', '耽美'].sort());
  assert.deepEqual(searchItems(items, '共同关键词', '言情').map(item => item.category), ['言情']);
  assert.deepEqual(searchItems(items, '共同关键词', '耽美').map(item => item.category), ['耽美']);
  assert.deepEqual(searchItems(items, '共同关键词', '男生').map(item => item.category), ['男生']);
  assert.notEqual(searchItems(items, '共同关键词', '全部').length, searchItems(items, '共同关键词', '言情').length);
});

test('legacy category values normalize to Chinese labels', () => {
  assert.equal(normalizeCategory('yanqing'), '言情');
  assert.equal(normalizeCategory('danmei'), '耽美');
  assert.equal(normalizeCategory('nansheng'), '男生');
});

test('search returns no results for an absent keyword', () => {
  assert.equal(searchItems(items, '不存在').length, 0);
});

test('search does not silently truncate matching resources', () => {
  const many = Array.from({ length: 201 }, (_, index) => ({ hash: String(index), category: '言情', name: '共同关键词.txt' }));
  assert.equal(searchItems(many, '共同关键词').length, 201);
});

test('merge deduplicates by hash', () => {
  assert.equal(mergeItems(items, [{...items[0], name:'updated'}]).length, 3);
  assert.equal(mergeItems(items, [{...items[0], category:'言情', name:'updated'}]).length, 3);
});
