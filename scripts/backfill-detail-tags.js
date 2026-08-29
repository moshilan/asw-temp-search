import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { backfillDetailTags } from '../src/tag-backfill.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function option(name, fallback) {
  const value = process.argv.find(argument => argument.startsWith(`--${name}=`));
  return value ? Number(value.slice(name.length + 3)) : fallback;
}

export async function runDetailTagBackfill({ items, limit = option('limit', 1000), delayMs = option('delay-ms', 800), retryFailed = process.argv.includes('--retry-failed') } = {}) {
  const sourceItems = items || JSON.parse(await fs.readFile(path.join(root, 'data', 'index.json'), 'utf8'));
  return backfillDetailTags({ items: sourceItems, limit, delayMs, retryFailed });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runDetailTagBackfill();
  console.log(JSON.stringify(result, null, 2));
}
