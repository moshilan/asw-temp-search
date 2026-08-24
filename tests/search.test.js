import test from 'node:test';
import assert from 'node:assert/strict';
import { searchItems, mergeItems } from '../src/store.js';

const items = [
  {hash:'a', category:'danmei', name:'《漂亮的他》作者：浮云素.txt', uploadedAt:'08-25 01:00'},
  {hash:'b', category:'yanqing', name:'某本小说 作者：张三.txt', uploadedAt:'08-24 01:00'},
  {hash:'c', category:'nansheng', name:'男生小说 作者：王五.txt', uploadedAt:'08-23 01:00'}
];

test('single keyword matches any part of filename', () => {
  assert.equal(searchItems(items, '漂亮').length, 1);
  assert.equal(searchItems(items, '漂亮的他').length, 1);
  assert.equal(searchItems(items, '浮云素').length, 1);
  assert.equal(searchItems(items, '张三').length, 1);
  assert.equal(searchItems(items, '  浮云素  ').length, 1);
});

test('category filter works', () => {
  assert.equal(searchItems(items, '作者').length, 3);
  assert.equal(searchItems(items, '小说', 'danmei').length, 0);
  assert.equal(searchItems(items, '小说', 'yanqing').length, 1);
  assert.equal(searchItems(items, '小说', 'nansheng').length, 1);
});

test('search returns no results for an absent keyword', () => {
  assert.equal(searchItems(items, '不存在').length, 0);
});

test('merge deduplicates by hash', () => {
  assert.equal(mergeItems(items, [{...items[0], name:'updated'}]).length, 3);
  assert.equal(mergeItems(items, [{...items[0], category:'yanqing', name:'updated'}]).length, 3);
});
