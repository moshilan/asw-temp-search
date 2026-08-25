const decodeEntities = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ');
const stripTags = s => decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
export function normalizeUploadedAt(value, reference = new Date()) {
  reference = reference instanceof Date ? reference : new Date(reference);
  const match = String(value || '').replace(/^🕒\s*/, '').match(/(?:(\d{4})-)?(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) return '';
  let [, year, month, day, hour, minute] = match; let resolvedYear = Number(year || reference.getFullYear());
  if (!year && (Number(month) > reference.getMonth() + 1 || (Number(month) === reference.getMonth() + 1 && Number(day) > reference.getDate()))) resolvedYear--;
  return `${resolvedYear}-${month}-${day}${hour ? ` ${hour}:${minute}` : ''}`;
}
export function parseListPage(html, source, { now = new Date() } = {}) {
  const items = []; const cardRe = /<a\s+href=["']([^"']*file\.php\?hash=([a-f0-9]{32})[^"']*)["'][^>]*class=["'][^"']*file-card-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = cardRe.exec(html))) { const [, href, hash, body] = m; const name = stripTags((body.match(/<div\s+class=["']file-name["'][^>]*>([\s\S]*?)<\/div>/i) || [, ''])[1]); if (!name) continue; const details = [...body.matchAll(/<span\s+class=["']detail-item["'][^>]*>([\s\S]*?)<\/span>/gi)].map(x => stripTags(x[1])); const size = details.find(x => /(?:KB|MB|GB)\b/i.test(x))?.replace(/^📦\s*/, '') || ''; const uploadedAt = normalizeUploadedAt(details.find(x => /\b\d{2}-\d{2}(?:\s+\d{2}:\d{2})?\b/.test(x)), now); items.push({ hash, name, category: source.label, categoryLabel: source.label, size, uploadedAt, url: new URL(href.replace(/^\.\//, '/'), source.origin).href }); }
  const pageInfo = stripTags((html.match(/<div\s+class=["']page-info["'][^>]*>([\s\S]*?)<\/div>/i) || [, ''])[1]); const totalPagesMatch = pageInfo.match(/共\s*(\d+)\s*页/); const totalFilesMatch = pageInfo.match(/共\s*(\d+)\s*个文件/); return { items, totalPages: totalPagesMatch ? Number(totalPagesMatch[1]) : 1, totalFiles: totalFilesMatch ? Number(totalFilesMatch[1]) : null, pageInfo };
}