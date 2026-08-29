import test from 'node:test';
import assert from 'node:assert/strict';
import { correctionFor, correctionSummary, onlyCorrected, voteSummary } from '../public/tag-inspection.js';

const items = [{ hash: 'changed' }, { hash: 'same' }, { hash: 'missing' }];
const records = {
  changed: { originalCategory: '男生', resolvedCategory: '耽美', tagVotes: { 言情: 0, 耽美: 6, GL: 2, 男生: 1 } },
  same: { originalCategory: '言情', resolvedCategory: '言情', tagVotes: { 言情: 1, 耽美: 0, GL: 0, 男生: 0 } },
};

test('inspection mode only returns records whose resolved category differs from the original category', () => {
  assert.deepEqual(onlyCorrected(items, records).map(item => item.hash), ['changed']);
  assert.equal(correctionFor(items[1], records), null);
  assert.equal(correctionFor(items[2], records), null);
});

test('inspection metadata displays the original category and all relevant raw votes', () => {
  assert.equal(correctionSummary(records.changed), '耽美（原：男生） · 标签纠正');
  assert.equal(voteSummary(records.changed), '耽美6 / GL2 / 男生1 / 言情0');
});
