import { loadIndexes, mergeByHash, searchLocal } from './search.js';

const q = document.querySelector('#q');
const form = document.querySelector('#searchForm');
const results = document.querySelector('#results');
const status = document.querySelector('#status');
const searchBtn = document.querySelector('#searchBtn');
const refreshBtn = document.querySelector('#refreshBtn');
let category = '全部';
let latestItems = [];

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function refreshLatest() {
  const response = await fetch('/api/latest');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '刷新失败');
  latestItems = data.results || [];
  return data;
}

function show(found, total, refresh) {
  const refreshText = refresh?.errors?.length ? `；部分刷新失败：${refresh.errors.map(x => x.sourceId).join('、')}` : '';
  status.textContent = `找到 ${found.length} 条 · 已加载 ${total} 条${refreshText}`;
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

async function search(keyword, shouldRefresh) {
  searchBtn.disabled = true;
  status.textContent = shouldRefresh ? '正在加载索引、刷新最新资源并搜索…' : '正在按分类筛选…';
  results.innerHTML = '';
  try {
    const base = await loadIndexes(fetch, category);
    let refresh = null;
    if (shouldRefresh) {
      try {
        refresh = await refreshLatest();
      } catch (error) {
        refresh = { errors: [{ sourceId: 'latest', error: error.message }] };
      }
    }
    const all = mergeByHash(base, latestItems);
    show(searchLocal(all, keyword, category), all.length, refresh);
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
  if (keyword) search(keyword, false);
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const keyword = q.value.trim();
  if (keyword) search(keyword, true);
});

refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  status.textContent = '正在刷新三类最新资源…';
  try {
    const data = await refreshLatest();
    status.textContent = `刷新完成：新增 ${latestItems.length} 条${data.errors?.length ? '；部分分类刷新失败' : ''}`;
  } catch (error) {
    status.textContent = `刷新失败：${error.message}`;
  } finally {
    refreshBtn.disabled = false;
  }
});
