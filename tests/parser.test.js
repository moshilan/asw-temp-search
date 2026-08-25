import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseListPage, normalizeUploadedAt } from '../src/parser.js';
import { SOURCES } from '../src/sources.js';

const fixture = name => fs.readFile(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');

for (const [name, source] of [['danmei',SOURCES.danmei],['yanqing',SOURCES.yanqing],['nansheng',SOURCES.nansheng]]) {
  test(`parse ${name}`, async () => {
    const parsed = parseListPage(await fixture(name), source);
    assert.equal(parsed.items.length, 100);
    assert.ok(parsed.items.every(x => /^[a-f0-9]{32}$/.test(x.hash)));
    assert.ok(parsed.items.every(x => x.name && x.url.startsWith(source.origin)));
    assert.ok(parsed.items.every(x => x.category === source.label && x.categoryLabel === source.label));
    assert.ok(parsed.totalPages >= 1);
  });
}

test('known pagination totals', async () => {
  assert.equal(parseListPage(await fixture('danmei'), SOURCES.danmei).totalPages, 475);
  assert.equal(parseListPage(await fixture('yanqing'), SOURCES.yanqing).totalPages, 348);
  const ns = parseListPage(await fixture('nansheng'), SOURCES.nansheng);
  assert.equal(ns.totalPages, 15);
  assert.equal(ns.totalFiles, 1440);
});

test('uploaded dates include a year and retain optional time', () => {
  assert.equal(parseListPage('', SOURCES.yanqing, { now: new Date('2026-01-02T00:00:00Z') }).items.length, 0);
  assert.equal(normalizeUploadedAt('12-31 23:59', new Date('2026-01-02')), '2025-12-31 23:59');
  assert.equal(normalizeUploadedAt('01-02', new Date('2026-01-02')), '2026-01-02');
});

