import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { refreshAll } from '../src/crawler.js';
import { buildStaticIndex } from './build-static-index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function updateIndex({ refreshAllFn = refreshAll, buildStaticIndexFn = buildStaticIndex } = {}) {
  const refresh = await refreshAllFn();
  const index = await buildStaticIndexFn({ rootDir: root });
  return { refresh, index };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await updateIndex();
  console.table(result.refresh.results);
  if (result.refresh.errors.length) console.warn('部分分类刷新失败：', result.refresh.errors);
  console.log(`静态索引已更新：${result.index.totalItems}条`);
}
