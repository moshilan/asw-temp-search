const q = document.querySelector('#q');
const form = document.querySelector('#searchForm');
const results = document.querySelector('#results');
const status = document.querySelector('#status');
const searchBtn = document.querySelector('#searchBtn');
const refreshBtn = document.querySelector('#refreshBtn');
let category = '全部';

document.querySelector('#tabs').addEventListener('click', e => {
  const btn = e.target.closest('button[data-category]');
  if (!btn) return;
  category = btn.dataset.category;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x === btn));
  const keyword = q.value.trim();
  if (keyword) search(keyword, false);
});

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function show(data) {
  const refreshText = data.refresh?.errors?.length ? `；部分刷新失败：${data.refresh.errors.map(x => x.sourceId).join('、')}` : '';
  status.textContent = `找到 ${data.results.length} 条 · 索引 ${data.totalIndexed} 条${refreshText}`;
  if (!data.results.length) { results.innerHTML = '<div class="empty">没有找到包含该关键字的资源</div>'; return; }
  results.innerHTML = data.results.map(item => `
    <a class="card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      <div class="name">${escapeHtml(item.name)}</div>
      <div class="meta"><span>${escapeHtml(item.categoryLabel)}</span><span>${escapeHtml(item.size || '')}</span><span>${escapeHtml(item.uploadedAt || '')}</span></div>
    </a>`).join('');
}

async function search(keyword, shouldRefresh) {
  searchBtn.disabled = true;
  status.textContent = shouldRefresh ? '正在刷新最新资源并搜索…' : '正在按分类筛选…';
  results.innerHTML = '';
  try {
    const r = await fetch('/api/search', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({q: keyword, category, refresh: shouldRefresh}) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || '搜索失败');
    show(data);
  } catch (e) { status.textContent = `失败：${e.message}`; }
  finally { searchBtn.disabled = false; }
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const keyword = q.value.trim();
  if (!keyword) return;
  search(keyword, true);
});

refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  status.textContent = '正在刷新三类最新资源…';
  try {
    const r = await fetch('/api/refresh', {method:'POST'});
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || '刷新失败');
    const added = data.refresh.results.reduce((n,x)=>n+x.added,0);
    status.textContent = `刷新完成：新增 ${added} 条 · 索引 ${data.totalIndexed} 条`;
  } catch(e) { status.textContent = `刷新失败：${e.message}`; }
  finally { refreshBtn.disabled = false; }
});
