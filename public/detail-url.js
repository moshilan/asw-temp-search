const mirrors = new Map([
  ['asw227.com', 'dm.downshu123.com'],
  ['asw7777.com', 'yq.downshu123.com'],
]);
const mirrorHosts = new Set(mirrors.values());

export function resolveDetailUrl({ hash, detailUrl, url, source, sourceId }) {
  if (source === '772txt') {
    if (typeof sourceId !== 'string' || !/^[1-9]\d*$/.test(sourceId)) return '';
    try {
      const parsed = new URL(url);
      const path = /^\/txt-xx\/(?:15|(?:nsxs|nsbook)\/[a-z0-9]+)\/txt-(\d+)\.htm$/.exec(parsed.pathname);
      if (['http://772txt.com', 'https://772txt.com'].includes(parsed.origin) &&
          !parsed.username && !parsed.password && !parsed.search && !parsed.hash && path?.[1] === sourceId) return parsed.href;
    } catch { /* Malformed source URL. */ }
    return '';
  }
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
