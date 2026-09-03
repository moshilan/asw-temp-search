import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HEADERS } from './sources.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const SNAPSHOT_FILE = 'tag-classifications.json';
const JOURNAL_FILE = 'tag-classifications.journal.jsonl';
export const TAG_PARSER_VERSION = 'detail-tag-v1';
export const TAG_CATEGORIES = ['言情', '耽美', '男生', 'GL'];
const SOURCE_CATEGORIES = ['言情', '耽美', '男生'];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function emptyState() {
  return { parserVersion: TAG_PARSER_VERSION, records: {} };
}

function snapshotPath(dataDir) {
  return path.join(dataDir, SNAPSHOT_FILE);
}

function journalPath(dataDir) {
  return path.join(dataDir, JOURNAL_FILE);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function loadTagState({ dataDir = DATA_DIR } = {}) {
  const state = await readJson(snapshotPath(dataDir), emptyState());
  state.records ??= {};
  try {
    const journal = await fs.readFile(journalPath(dataDir), 'utf8');
    for (const [index, line] of journal.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        throw new Error(`标签侧表日志第${index + 1}行不是有效JSON`);
      }
      if (!record.hash) throw new Error(`标签侧表日志第${index + 1}行缺少hash`);
      state.records[record.hash] = record;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return state;
}

export async function appendTagRecord(record, { dataDir = DATA_DIR } = {}) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.appendFile(journalPath(dataDir), `${JSON.stringify(record)}\n`, 'utf8');
}

export async function compactTagState(state, { dataDir = DATA_DIR } = {}) {
  await fs.mkdir(dataDir, { recursive: true });
  const target = snapshotPath(dataDir);
  const temporary = `${target}.tmp`;
  const snapshot = { parserVersion: TAG_PARSER_VERSION, records: state.records };
  await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
  await fs.rename(temporary, target);
  await fs.writeFile(journalPath(dataDir), '', 'utf8');
}

export function parseTagVotes(html) {
  const votes = Object.fromEntries(TAG_CATEGORIES.map(tag => [tag, 0]));
  const buttons = [...html.matchAll(/<div\b[^>]*class="[^"]*\btag-btn\b[^"]*"[^>]*data-tag="([^"]+)"[^>]*>([\s\S]*?)<\/div>/gi)];
  if (!buttons.length) throw new Error('未找到标签投票结构');
  for (const [, tag, content] of buttons) {
    if (!(tag in votes)) continue;
    const count = content.match(/<span\b[^>]*class="[^"]*\btag-count\b[^"]*"[^>]*>\s*(\d+)\s*<\/span>/i);
    if (!count) throw new Error(`标签${tag}缺少票数`);
    votes[tag] = Number(count[1]);
  }
  return votes;
}

const DOWNLOAD_HOST_PRIORITY = {
  言情: ['yq.downshu123.com', 'yq.downshu321.com', 'nv.aishu995.com'],
  耽美: ['dm.downshu123.com', 'dm.downshu321.com', 'w.aishu995.com'],
  男生: ['yq.downshu123.com', 'yq.downshu321.com', 'nv.aishu995.com'],
};

export function cleanDownloadUrls(urls, category) {
  const valid = [];
  for (const href of Array.isArray(urls) ? urls : []) {
    let url;
    try { url = new URL(href); } catch { continue; }
    if (url.protocol !== 'https:' || !/\/down\.php\//i.test(url.pathname)) continue;
    if (!valid.includes(url.href)) valid.push(url.href);
  }
  const priority = DOWNLOAD_HOST_PRIORITY[category] || [];
  return valid.map((url, index) => ({ url, index, rank: priority.indexOf(new URL(url).hostname.toLowerCase()) })).sort((a, b) => (a.rank < 0 ? 999 : a.rank) - (b.rank < 0 ? 999 : b.rank) || a.index - b.index).map(item => item.url);
}

export function parseDownloadUrls(html, baseUrl, category) {
  const urls = [];
  for (const [, href] of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    try { urls.push(new URL(href, baseUrl).href); } catch { /* ignore malformed links */ }
  }
  return cleanDownloadUrls(urls, category);
}
export function resolveTagCategory(originalCategory, tagVotes) {
  const votes = {
    言情: tagVotes.言情,
    耽美: tagVotes.耽美 + tagVotes.GL,
    男生: tagVotes.男生,
  };
  const highest = Math.max(...Object.values(votes));
  const winners = highest === 0 ? [] : Object.entries(votes).filter(([, count]) => count === highest).map(([category]) => category);
  return {
    resolvedCategory: winners.length === 1 ? winners[0] : originalCategory,
    votes,
    noRelevantTags: winners.length === 0,
    tied: winners.length > 1,
  };
}

export function buildTagUrl(item) {
  const url = new URL('https://ns.aishu456.com/filepl.php');
  url.searchParams.set('name', item.name);
  url.searchParams.set('hash', `file/${item.hash}.txt`);
  return url.href;
}

export async function fetchTagHtml(item, { fetchFn = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchFn(buildTagUrl(item), { headers: DEFAULT_HEADERS, signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    if (html.includes('浏览器不支持') || html.includes('操作系统语言设置非中文')) {
      throw new Error('标签站点拒绝请求：中文Accept-Language未被接受');
    }
    return html;
  } finally {
    clearTimeout(timer);
  }
}

function attemptsFor(previous) {
  return (previous?.retry?.attempts || 0) + 1;
}

export function createSuccessRecord(item, tagVotes, { previous, checkedAt, downloadUrls = previous?.downloadUrls || [] } = {}) {
  const result = resolveTagCategory(item.category, tagVotes);
  return {
    hash: item.hash,
    originalCategory: item.category,
    tagVotes,
    resolvedCategory: result.resolvedCategory,
    checkedAt,
    parserVersion: TAG_PARSER_VERSION,
    error: null,
    retry: { status: 'completed', attempts: attemptsFor(previous), lastAttemptAt: checkedAt },
    classification: { noRelevantTags: result.noRelevantTags, tied: result.tied, votes: result.votes },
    downloadUrls: Array.isArray(downloadUrls) ? downloadUrls : [],
  };
}

export function createFailureRecord(item, error, { previous, checkedAt }) {
  return {
    hash: item.hash,
    originalCategory: item.category,
    tagVotes: previous?.tagVotes || null,
    resolvedCategory: null,
    checkedAt,
    parserVersion: TAG_PARSER_VERSION,
    error: error.message,
    retry: { status: 'pending', attempts: attemptsFor(previous), lastAttemptAt: checkedAt },
    downloadUrls: Array.isArray(previous?.downloadUrls) ? previous.downloadUrls : [],
  };
}

export function selectBackfillItems(items, records, { limit = 1000, retryFailed = false } = {}) {
  const groups = Object.fromEntries(SOURCE_CATEGORIES.map(category => [category, items.filter(item => item.category === category)]));
  const selected = [];
  let index = 0;
  while (selected.length < limit) {
    let remaining = false;
    for (const category of SOURCE_CATEGORIES) {
      const item = groups[category][index];
      if (!item) continue;
      remaining = true;
      const record = records[item.hash];
      const eligible = retryFailed ? record?.retry?.status === 'pending' : !record;
      if (eligible) {
        selected.push(item);
        if (selected.length === limit) break;
      }
    }
    if (!remaining) break;
    index++;
  }
  return selected;
}

function emptySummary(total) {
  return { selected: total, succeeded: 0, failed: 0, noRelevantTags: 0, corrected: 0, ties: 0, transitions: {}, downloadUrls: 0, stoppedReason: null, elapsedMs: 0, averageMs: 0 };
}

export const DOWNLOAD_PARSER_VERSION = 'download-v1';

export async function fetchDownloadHtml(item, { fetchFn = fetch } = {}) {
  if (!item?.url) throw new Error('资源缺少详情页URL');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchFn(item.url, { headers: DEFAULT_HEADERS, signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    if (html.includes('浏览器不支持') || html.includes('操作系统语言设置非中文')) throw new Error('详情站点拒绝请求：中文Accept-Language未被接受');
    return html;
  } finally { clearTimeout(timer); }
}

export function selectMissingDownloadItems(items, records, { limit = 1000 } = {}) {
  const selected = [];
  for (const item of items) {
    const record = records[item.hash];
    if (!record || (Array.isArray(record.downloadUrls) && record.downloadUrls.length)) continue;
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

export async function cleanExistingDownloadUrls({
  items,
  state,
  appendTagRecordFn = appendTagRecord,
  now = () => new Date().toISOString(),
} = {}) {
  const itemByHash = new Map(items.map(item => [item.hash, item]));
  let cleaned = 0;
  let alreadyValid = 0;
  for (const record of Object.values(state.records || {})) {
    const item = itemByHash.get(record.hash);
    if (!item || !Array.isArray(record.downloadUrls)) continue;
    const urls = cleanDownloadUrls(record.downloadUrls, record.originalCategory || item.category);
    if (JSON.stringify(urls) === JSON.stringify(record.downloadUrls)) { alreadyValid++; continue; }
    const checkedAt = now();
    const updated = { ...record, downloadUrls: urls, downloadCheckedAt: checkedAt, downloadParserVersion: DOWNLOAD_PARSER_VERSION, downloadError: null };
    state.records[record.hash] = updated;
    await appendTagRecordFn(updated);
    cleaned++;
  }
  return { cleaned, alreadyValid };
}
export async function backfillMissingDownloadUrls({
  items,
  limit = 1000,
  delayMs = 800,
  fetchDownloadHtmlFn = fetchDownloadHtml,
  loadTagStateFn = loadTagState,
  appendTagRecordFn = appendTagRecord,
  compactTagStateFn = compactTagState,
  now = () => new Date().toISOString(),
  clock = () => Date.now(),
} = {}) {
  const state = await loadTagStateFn();
  const cleaning = await cleanExistingDownloadUrls({ items, state, appendTagRecordFn, now });
  const selected = selectMissingDownloadItems(items, state.records, { limit });
  const summary = { selected: selected.length, cleaned: cleaning.cleaned, alreadyValid: cleaning.alreadyValid, succeeded: 0, failed: 0, totalUrls: 0, elapsedMs: 0, averageMs: 0 };
  const startedAt = clock();
  for (const item of selected) {
    const previous = state.records[item.hash];
    const checkedAt = now();
    try {
      const urls = parseDownloadUrls(await fetchDownloadHtmlFn(item), item.url, item.category);
      const record = { ...previous, downloadUrls: urls, downloadCheckedAt: checkedAt, downloadParserVersion: DOWNLOAD_PARSER_VERSION, downloadError: null, downloadRetry: { status: 'completed', attempts: (previous.downloadRetry?.attempts || 0) + 1, lastAttemptAt: checkedAt } };
      state.records[item.hash] = record;
      await appendTagRecordFn(record);
      summary.succeeded++;
      summary.totalUrls += urls.length;
    } catch (error) {
      const record = { ...previous, downloadUrls: Array.isArray(previous.downloadUrls) ? previous.downloadUrls : [], downloadCheckedAt: checkedAt, downloadParserVersion: DOWNLOAD_PARSER_VERSION, downloadError: error.message, downloadRetry: { status: 'pending', attempts: (previous.downloadRetry?.attempts || 0) + 1, lastAttemptAt: checkedAt } };
      state.records[item.hash] = record;
      await appendTagRecordFn(record);
      summary.failed++;
    }
    if (delayMs) await sleep(delayMs);
  }
  await compactTagStateFn(state);
  summary.elapsedMs = clock() - startedAt;
  summary.averageMs = selected.length ? summary.elapsedMs / selected.length : 0;
  return summary;
}
export async function backfillDetailTags({
  items,
  limit = 1000,
  delayMs = 800,
  retryFailed = false,
  maxConsecutiveFailures = 5,
  fetchTagHtmlFn = fetchTagHtml,
  loadTagStateFn = loadTagState,
  appendTagRecordFn = appendTagRecord,
  compactTagStateFn = compactTagState,
  now = () => new Date().toISOString(),
  clock = () => Date.now(),
} = {}) {
  const state = await loadTagStateFn();
  const selected = selectBackfillItems(items, state.records, { limit, retryFailed });
  const summary = emptySummary(selected.length);
  const startedAt = clock();
  let consecutiveFailures = 0;
  for (const item of selected) {
    const previous = state.records[item.hash];
    const checkedAt = now();
    try {
      const detailHtml = await fetchTagHtmlFn(item);
      const tagVotes = parseTagVotes(detailHtml);
      const downloadUrls = parseDownloadUrls(detailHtml, item.url, item.category);
      const record = createSuccessRecord(item, tagVotes, { previous, checkedAt, downloadUrls });
      state.records[item.hash] = record;
      await appendTagRecordFn(record);
      summary.succeeded++;
      if (record.downloadUrls.length) summary.downloadUrls++;
      consecutiveFailures = 0;
      if (record.classification.noRelevantTags) summary.noRelevantTags++;
      if (record.classification.tied) summary.ties++;
      if (record.resolvedCategory !== item.category) summary.corrected++;
      const transition = `${item.category}→${record.resolvedCategory}`;
      summary.transitions[transition] = (summary.transitions[transition] || 0) + 1;
    } catch (error) {
      const record = createFailureRecord(item, error, { previous, checkedAt });
      state.records[item.hash] = record;
      await appendTagRecordFn(record);
      summary.failed++;
      consecutiveFailures++;
      if (consecutiveFailures >= maxConsecutiveFailures) {
        summary.stoppedReason = `连续${maxConsecutiveFailures}条请求失败`;
        break;
      }
    }
    if (delayMs) await sleep(delayMs);
  }
  await compactTagStateFn(state);
  summary.elapsedMs = clock() - startedAt;
  summary.averageMs = selected.length ? summary.elapsedMs / selected.length : 0;
  return summary;
}
