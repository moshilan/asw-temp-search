import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { backfillDetailTags, backfillMissingDownloadUrls } from '../src/tag-backfill.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function option(name, fallback) {
  const value = process.argv.find(argument => argument.startsWith(`--${name}=`));
  return value ? Number(value.slice(name.length + 3)) : fallback;
}

function mergeSummaries(total, next) {
  total.selected += next.selected;
  total.succeeded += next.succeeded;
  total.failed += next.failed;
  total.noRelevantTags += next.noRelevantTags || 0;
  total.corrected += next.corrected || 0;
  total.ties += next.ties || 0;
  total.downloadUrls += next.downloadUrls || 0;
  for (const [key, value] of Object.entries(next.transitions || {})) total.transitions[key] = (total.transitions[key] || 0) + value;
  total.elapsedMs += next.elapsedMs || 0;
  total.batches++;
  if (next.stoppedReason) total.stoppedReason = next.stoppedReason;
}

export async function runContinuousDetailBackfill({ items, batchSize = option('batch-size', 1000), maxTotal = option('max-total', 10000), delayMs = option('delay-ms', 800), retryFailed = process.argv.includes('--retry-failed'), maxConsecutiveFailures = option('max-consecutive-failures', 5), backfillFn = backfillDetailTags } = {}) {
  const total = { selected: 0, succeeded: 0, failed: 0, noRelevantTags: 0, corrected: 0, ties: 0, transitions: {}, downloadUrls: 0, batches: 0, stoppedReason: null, elapsedMs: 0, averageMs: 0, maxTotal };
  while (total.selected < maxTotal && !total.stoppedReason) {
    const limit = Math.min(batchSize, maxTotal - total.selected);
    const next = await backfillFn({ items, limit, delayMs, retryFailed, maxConsecutiveFailures });
    mergeSummaries(total, next);
    if (next.selected === 0) { total.stoppedReason = '没有新的未处理记录'; break; }
    if (next.selected < limit) { total.stoppedReason = '没有更多未处理记录'; break; }
  }
  if (!total.stoppedReason) total.stoppedReason = '达到本轮上限';
  total.averageMs = total.selected ? total.elapsedMs / total.selected : 0;
  return total;
}

export async function runDetailTagBackfill({ items, limit = option('limit', 1000), delayMs = option('delay-ms', 800), retryFailed = process.argv.includes('--retry-failed'), downloadOnly = process.argv.includes('--download-only') } = {}) {
  const sourceItems = items || JSON.parse(await fs.readFile(path.join(root, 'data', 'index.json'), 'utf8'));
  return downloadOnly ? backfillMissingDownloadUrls({ items: sourceItems, limit, delayMs }) : runContinuousDetailBackfill({ items: sourceItems, batchSize: limit, delayMs, retryFailed });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runDetailTagBackfill();
  console.log(JSON.stringify(result, null, 2));
}
