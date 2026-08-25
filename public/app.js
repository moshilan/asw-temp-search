import { loadIndexMeta, searchStaticIndexes } from './search.js';

const q = document.querySelector('#q');
const form = document.querySelector('#searchForm');
const results = document.querySelector('#results');
const status = document.querySelector('#status');
const searchBtn = document.querySelector('#searchBtn');
let category = '全部';
let searchVersion = 0;
const metadata = loadIndexMeta(fetch).catch(() => null);

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const formatUpdatedAt = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未知';

function show(found, total, meta) {
  status.textContent = `找到 ${found.length} 条 · 索引 ${total} 条 · 数据更新于 ${formatUpdatedAt(meta?.lastUpdatedAt)}`;
  if (!found.length) {
    results.innerHTML = '<div class="empty">没有找到包含该关键字的资源</div>';
    return;
  }
  results.innerHTML = found.map(item => `
    <a class="card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      <div class="name">${escapeHtml(item.name)}</div>
      <div class="meta"><span>${escapeHtml(item.categoryLabel || item.category || '')}</span><span>${escapeHtml(item.size || '')}</span><span>${escapeHtml(item.uploadedAt || '')}</span></div>
    </a>`).join('');
}

async function search(keyword) {
  const version = ++searchVersion;
  searchBtn.disabled = true;
  status.textContent = '正在读取索引清单…';
  results.innerHTML = '';
  try {
    const [result, meta] = await Promise.all([
      searchStaticIndexes(fetch, keyword, category, {
        onProgress: progress => {
          if (version === searchVersion) status.textContent = `正在搜索 ${progress.current}/${progress.total}…`;
        },
      }),
      metadata,
    ]);
    if (version === searchVersion) show(result.items, result.totalItems, meta);
  } catch (error) {
    if (version === searchVersion) status.textContent = `失败：${error.message}`;
  } finally {
    if (version === searchVersion) searchBtn.disabled = false;
  }
}

document.querySelector('#tabs').addEventListener('click', event => {
  const btn = event.target.closest('button[data-category]');
  if (!btn) return;
  category = btn.dataset.category;
  document.querySelectorAll('#tabs button').forEach(item => item.classList.toggle('active', item === btn));
  const keyword = q.value.trim();
  if (keyword) search(keyword);
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const keyword = q.value.trim();
  if (keyword) search(keyword);
});

metadata.then(meta => {
  if (meta) status.textContent = `数据更新于 ${formatUpdatedAt(meta.lastUpdatedAt)} · 索引 ${meta.totalItems} 条`;
});