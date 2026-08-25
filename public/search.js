export const INDEX_FILES = {
  言情: './data/yanqing.json',
  耽美: './data/danmei.json',
  男生: './data/nansheng.json',
};

export function selectedCategories(category) {
  return category === '全部' ? Object.keys(INDEX_FILES) : [category];
}

export async function loadIndexes(fetchFn, category) {
  const categories = selectedCategories(category);
  const loaded = await Promise.all(categories.map(async name => {
    const response = await fetchFn(INDEX_FILES[name]);
    if (!response.ok) throw new Error(`无法加载${name}索引`);
    return response.json();
  }));
  return loaded.flat();
}

export async function loadIndexMeta(fetchFn) {
  const response = await fetchFn('./data/meta.json');
  if (!response.ok) throw new Error('无法加载索引更新时间');
  return response.json();
}

export function searchLocal(items, keyword, category = '全部') {
  const q = String(keyword).trim().toLocaleLowerCase('zh-CN');
  if (!q) return [];
  return items
    .filter(item => (category === '全部' || item.category === category) && item.name.toLocaleLowerCase('zh-CN').includes(q))
    .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
}
