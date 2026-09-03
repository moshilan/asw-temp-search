import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  appendTagRecord,
  backfillDetailTags,
  backfillMissingDownloadUrls,
  cleanDownloadUrls,
  selectMissingDownloadItems,
  compactTagState,
  createSuccessRecord,
  loadTagState,
  parseTagVotes,
  parseDownloadUrls,
  resolveTagCategory,
  selectBackfillItems,
} from '../src/tag-backfill.js';
import { runContinuousDetailBackfill } from '../scripts/backfill-detail-tags.js';

const tagHtml = ({ yanqing = 0, danmei = 0, nansheng = 0, gl = 0 } = {}) => `
  <div class="tag-btn" data-tag="耽美"><span class="tag-count">${danmei}</span></div>
  <div class="tag-btn" data-tag="言情"><span class="tag-count">${yanqing}</span></div>
  <div class="tag-btn" data-tag="男生"><span class="tag-count">${nansheng}</span></div>
  <div class="tag-btn" data-tag="GL"><span class="tag-count">${gl}</span></div>`;
const items = [
  { hash: 'yanqing', category: '言情', name: '言情.txt' },
  { hash: 'danmei', category: '耽美', name: '耽美.txt' },
  { hash: 'nansheng', category: '男生', name: '男生.txt' },
];

test('tag parser extracts only the four relevant raw vote counts', () => {
  assert.deepEqual(parseTagVotes(tagHtml({ yanqing: 2, danmei: 3, nansheng: 4, gl: 5 })), { 言情: 2, 耽美: 3, 男生: 4, GL: 5 });
});

test('download parser keeps ordered HTTPS download links and ignores other anchors', () => {
  const html = `<a href="/down.php/first.txt">下载1</a><a href="https://example.com/read">阅读</a><a href="https://cdn.example.com/a.txt">下载2</a><a href="/down.php/first.txt">重复</a>`;
  assert.deepEqual(parseDownloadUrls(html, 'https://source.example/file.php?hash=x'), ['https://source.example/down.php/first.txt']);
});
test('download parser excludes announcements and applies category host priority', () => {
  const urls = ['https://www.asw227.com/gonggao.php?file=gonggao.txt', 'https://dm.downshu321.com/down.php/a.txt', 'https://dm.downshu123.com/down.php/a.txt', 'https://w.aishu995.com/down.php/a.txt', 'https://dm.downshu321.shop/read.php?file=file/a.txt'];
  assert.deepEqual(cleanDownloadUrls(urls, '耽美'), ['https://dm.downshu123.com/down.php/a.txt', 'https://dm.downshu321.com/down.php/a.txt', 'https://w.aishu995.com/down.php/a.txt']);
});
test('download-only selection includes only existing records missing URLs', () => {
  const records = { yanqing: { tagVotes: { 言情: 1 } }, danmei: { downloadUrls: ['https://cdn.example/d.txt'] } };
  assert.deepEqual(selectMissingDownloadItems(items, records, { limit: 10 }).map(item => item.hash), ['yanqing']);
});

test('download-only backfill preserves tag classification and resumes by hash', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'asw-downloads-'));
  try {
    const existing = { ...items[0], tagVotes: { 言情: 2 }, resolvedCategory: '言情', error: null };
    const state = { parserVersion: 'detail-tag-v1', records: { yanqing: existing } };
    const fetches = [];
    const summary = await backfillMissingDownloadUrls({ items, limit: 1, delayMs: 0,
      loadTagStateFn: async () => state,
      appendTagRecordFn: async record => { state.records[record.hash] = record; },
      compactTagStateFn: async next => { state.records = next.records; },
      fetchDownloadHtmlFn: async item => { fetches.push(item.hash); return '<a href="https://cdn.example/down.php/one.txt">下载</a>'; },
      now: () => '2026-08-30T00:00:00.000Z',
      clock: () => 0,
    });
    assert.deepEqual(summary, { selected: 1, cleaned: 0, alreadyValid: 0, succeeded: 1, failed: 0, totalUrls: 1, elapsedMs: 0, averageMs: 0 });
    assert.deepEqual(fetches, ['yanqing']);
    assert.deepEqual(state.records.yanqing.tagVotes, { 言情: 2 });
    assert.equal(state.records.yanqing.resolvedCategory, '言情');
    assert.deepEqual(state.records.yanqing.downloadUrls, ['https://cdn.example/down.php/one.txt']);
  } finally { await fs.rm(dataDir, { recursive: true, force: true }); }
});
test('tag resolution preserves the original category for no votes and ties', () => {
  assert.deepEqual(resolveTagCategory('言情', { 言情: 0, 耽美: 0, 男生: 0, GL: 0 }), { resolvedCategory: '言情', votes: { 言情: 0, 耽美: 0, 男生: 0 }, noRelevantTags: true, tied: false });
  assert.deepEqual(resolveTagCategory('男生', { 言情: 1, 耽美: 0, 男生: 1, GL: 0 }), { resolvedCategory: '男生', votes: { 言情: 1, 耽美: 0, 男生: 1 }, noRelevantTags: false, tied: true });
  assert.equal(resolveTagCategory('言情', { 言情: 1, 耽美: 1, 男生: 0, GL: 1 }).resolvedCategory, '耽美');
});

test('pending selection round-robins categories and only retries recorded failures', () => {
  const expanded = [...items, { hash: 'yanqing-2', category: '言情', name: '言情2.txt' }];
  assert.deepEqual(selectBackfillItems(expanded, {}, { limit: 3 }).map(item => item.hash), ['yanqing', 'danmei', 'nansheng']);
  const records = { yanqing: { retry: { status: 'completed' } }, danmei: { retry: { status: 'pending' } } };
  assert.deepEqual(selectBackfillItems(expanded, records, { limit: 3, retryFailed: true }).map(item => item.hash), ['danmei']);
});

test('journal saves each completed item, resumes by hash, and records failures for retry', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'asw-tags-'));
  try {
    let fetches = 0;
    const first = await backfillDetailTags({
      items,
      limit: 3,
      delayMs: 0,
      loadTagStateFn: () => loadTagState({ dataDir }),
      appendTagRecordFn: record => appendTagRecord(record, { dataDir }),
      compactTagStateFn: state => compactTagState(state, { dataDir }),
      fetchTagHtmlFn: async item => {
        fetches++;
        if (item.hash === 'danmei') throw new Error('temporary network failure');
        return item.hash === 'yanqing' ? `${tagHtml({ yanqing: 0, danmei: 2, gl: 1 })}<a href="https://cdn.example/down.php/yanqing.txt">下载</a>` : tagHtml();
      },
      now: () => '2026-08-29T00:00:00.000Z',
    });
    assert.deepEqual({ selected: first.selected, succeeded: first.succeeded, failed: first.failed, corrected: first.corrected, noRelevantTags: first.noRelevantTags }, { selected: 3, succeeded: 2, failed: 1, corrected: 1, noRelevantTags: 1 });
    assert.equal(fetches, 3);
    const saved = await loadTagState({ dataDir });
    assert.equal(saved.records.yanqing.resolvedCategory, '耽美');
    assert.deepEqual(saved.records.yanqing.downloadUrls, ['https://cdn.example/down.php/yanqing.txt']);
    assert.equal(saved.records.danmei.retry.status, 'pending');

    const second = await backfillDetailTags({
      items,
      limit: 3,
      delayMs: 0,
      retryFailed: true,
      loadTagStateFn: () => loadTagState({ dataDir }),
      appendTagRecordFn: record => appendTagRecord(record, { dataDir }),
      compactTagStateFn: state => compactTagState(state, { dataDir }),
      fetchTagHtmlFn: async () => tagHtml({ danmei: 1 }),
      now: () => '2026-08-29T00:01:00.000Z',
    });
    assert.deepEqual({ selected: second.selected, succeeded: second.succeeded, failed: second.failed }, { selected: 1, succeeded: 1, failed: 0 });
    const retried = await loadTagState({ dataDir });
    assert.equal(retried.records.danmei.retry.attempts, 2);
    assert.equal(retried.records.danmei.retry.status, 'completed');
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('continuous detail backfill advances in batches and stops at the configured total', async () => {
  const calls = [];
  const result = await runContinuousDetailBackfill({ items, batchSize: 2, maxTotal: 5, delayMs: 0,
    backfillFn: async ({ limit }) => { calls.push(limit); return { selected: limit, succeeded: limit, failed: 0, noRelevantTags: 0, corrected: 0, ties: 0, transitions: {}, downloadUrls: limit, elapsedMs: limit }; } });
  assert.deepEqual(calls, [2, 2, 1]);
  assert.equal(result.selected, 5);
  assert.equal(result.downloadUrls, 5);
  assert.equal(result.stoppedReason, '达到本轮上限');
});

test('detail backfill stops after consecutive request failures while preserving records', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'asw-stop-'));
  try {
    const result = await backfillDetailTags({ items, limit: 3, delayMs: 0, maxConsecutiveFailures: 2,
      loadTagStateFn: () => loadTagState({ dataDir }),
      appendTagRecordFn: record => appendTagRecord(record, { dataDir }),
      compactTagStateFn: state => compactTagState(state, { dataDir }),
      fetchTagHtmlFn: async () => { throw new Error('rate limited'); },
      now: () => '2026-09-04T00:00:00.000Z',
    });
    assert.equal(result.selected, 3);
    assert.equal(result.failed, 2);
    assert.equal(result.stoppedReason, '连续2条请求失败');
    const saved = await loadTagState({ dataDir });
    assert.equal(Object.keys(saved.records).length, 2);
  } finally { await fs.rm(dataDir, { recursive: true, force: true }); }
});

test('a journal entry is recoverable before snapshot compaction', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'asw-tags-'));
  try {
    const record = createSuccessRecord(items[0], { 言情: 1, 耽美: 0, 男生: 0, GL: 0 }, { checkedAt: '2026-08-29T00:00:00.000Z' });
    await appendTagRecord(record, { dataDir });
    const restored = await loadTagState({ dataDir });
    assert.equal(restored.records.yanqing.resolvedCategory, '言情');
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
