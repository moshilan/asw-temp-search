import test from 'node:test';
import assert from 'node:assert/strict';
import { onlySuspected, sortSuspected, suggestedCategory, voteSummary } from '../public/suspected-misclassification.js';

const items = [
  { hash: 'changed-low', uploadedAt: '2026-08-29 10:00' },
  { hash: 'unchanged', uploadedAt: '2026-08-29 11:00' },
  { hash: 'changed-high', uploadedAt: '2026-08-28 10:00' },
];
const records = {
  'changed-low': { originalCategory: '男生', resolvedCategory: '耽美', tagVotes: { 言情: 0, 耽美: 1, GL: 0, 男生: 0 } },
  unchanged: { originalCategory: '言情', resolvedCategory: '言情', tagVotes: { 言情: 1, 耽美: 0, GL: 0, 男生: 0 } },
  'changed-high': { originalCategory: '言情', resolvedCategory: '耽美', tagVotes: { 言情: 0, 耽美: 3, GL: 2, 男生: 1 } },
};

test('suspected mode only includes records whose suggestion differs from the original category', () => {
  assert.deepEqual(onlySuspected(items, records).map(item => item.hash), ['changed-low', 'changed-high']);
});

test('suspected mode sorts by danmei plus GL votes and displays raw votes', () => {
  const ordered = sortSuspected(onlySuspected(items, records), records);
  assert.deepEqual(ordered.map(item => item.hash), ['changed-high', 'changed-low']);
  assert.equal(suggestedCategory(records['changed-high']), '耽美');
  assert.equal(voteSummary(records['changed-high']), '言情0 / 耽美3 / GL2 / 男生1');
});
