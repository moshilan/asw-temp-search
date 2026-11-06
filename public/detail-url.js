const mirrors = new Map([
  ['asw227.com', 'dm.downshu123.com'],
  ['asw7777.com', 'yq.downshu123.com'],
]);
const mirrorHosts = new Set(mirrors.values());

export function resolveDetailUrl({ hash, detailUrl, url }) {
  if (!/^[a-f0-9]{32}$/i.test(hash)) return '';
  let fallback = '';
  for (const value of [detailUrl, url]) {
    let parsed;
    try { parsed = new URL(value); } catch { continue; }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
    if (parsed.pathname !== '/file.php' || parsed.searchParams.get('hash')?.toLowerCase() !== hash.toLowerCase()) continue;

    // The URL records the file's source. The display category can differ for cross-listed files.
    const host = parsed.hostname.replace(/^www\./, '');
    if (mirrorHosts.has(host)) return `https://${host}/file.php?hash=${hash.toLowerCase()}`;
    const mirror = mirrors.get(host);
    fallback ||= mirror ? `https://${mirror}/file.php?hash=${hash.toLowerCase()}` : parsed.href;
  }
  return fallback;
}
