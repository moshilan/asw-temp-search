import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDetailUrl } from '../public/detail-url.js';

const hash = '254bc1a6e0481ba6d080963d1dfa6319';
const detail = host => `https://${host}/file.php?hash=${hash}`;

test('legacy links follow the recorded source host for all three categories', () => {
  for (const [category, source, mirror] of [
    ['耽美', 'www.asw227.com', 'dm.downshu123.com'],
    ['言情', 'www.asw7777.com', 'yq.downshu123.com'],
    ['男生', 'www.asw7777.com', 'yq.downshu123.com'],
  ]) {
    const item = Object.freeze({ hash, category, url: detail(source), downloadUrls: Object.freeze([]) });
    assert.equal(resolveDetailUrl(item), detail(mirror));
    assert.equal(item.url, detail(source));
    assert.deepEqual(item.downloadUrls, []);
  }
});

test('cross-listed links follow the stored URL independently of category', () => {
  const item = { hash, category: '男生', sourceCategories: ['耽美', '男生'] };
  assert.equal(resolveDetailUrl({ ...item, url: detail('asw227.com') }), detail('dm.downshu123.com'));
  assert.equal(resolveDetailUrl({
    ...item, detailUrl: detail('www.asw227.com'), url: detail('yq.downshu123.com'),
  }), detail('yq.downshu123.com'));
});

test('detail resolution skips mismatched hashes and non-detail URLs', () => {
  const url = detail('yq.downshu123.com');
  for (const detailUrl of [
    detail('www.asw227.com').replace(hash, '0'.repeat(32)),
    `https://dm.downshu123.com/down.php/${hash}.txt`,
    'javascript:alert(1)',
  ]) assert.equal(resolveDetailUrl({ hash, detailUrl, url }), url);
  assert.equal(resolveDetailUrl({ hash, url: 'https://www.asw7777.com/' }), '');
});
