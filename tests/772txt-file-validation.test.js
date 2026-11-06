import test from 'node:test';
import assert from 'node:assert/strict';
import { contentKind, sameSize } from '../scripts/772txt-file-validation.js';

test('772txt file sizes follow the source precision without accepting the known mismatch', () => {
  assert.equal(sameSize('1.23 MB', 1285223), true);
  assert.equal(sameSize('637 KB', 651961), true);
  assert.equal(sameSize('2.08 MB', 2186682), false);
  assert.equal(sameSize('2.09 MB', 2186682), true);
  assert.equal(sameSize('1.23 MB', 1230000), false);
});

test('772txt checks file bytes rather than trusting the TXT or ZIP extension', () => {
  const txt = 'https://example.test/file.txt';
  const zip = 'https://example.test/file.zip';
  assert.equal(contentKind(Buffer.from('第一章 测试'), txt), 'txt');
  assert.equal(contentKind(Buffer.from('<!doctype html><title>错误</title>'), txt), '');
  assert.equal(contentKind(Buffer.from([0x50, 0x4b, 0x03, 0x04]), txt), '');
  assert.equal(contentKind(Buffer.from([0x50, 0x4b, 0x03, 0x04]), zip), 'zip');
});
