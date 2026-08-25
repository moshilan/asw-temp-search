import { loadIndexMeta, loadIndexes, searchLocal } from './search.js';

const q = document.querySelector('#q');
const form = document.querySelector('#searchForm');
const results = document.querySelector('#results');
const status = document.querySelector('#status');
const searchBtn = document.querySelector('#searchBtn');
let category = '全部';
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
      <div class="meta"><span>${escapeHtml(item.categoryLabel)}</span><span>${escapeHtml(item.size || '')}</span><span>${escapeHtml(item.uploadedAt || '')}</span></div>
    </a>`).join('');
}

async function search(keyword) {
  searchBtn.disabled = true;
  status.textContent = '正在加载索引并搜索…';
  results.innerHTML = '';
  try {
    const [items, meta] = await Promise.all([loadIndexes(fetch, category), metadata]);
    show(searchLocal(items, keyword, category), items.length, meta);
  } catch (error) {
    status.textContent = `失败：${error.message}`;
  } finally {
    searchBtn.disabled = false;
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
