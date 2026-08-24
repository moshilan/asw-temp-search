export const SOURCES = {
  danmei: {
    id: 'danmei',
    label: '耽美',
    origin: 'https://www.asw227.com',
    firstPage: '/',
    pagePath: page => page <= 1 ? '/' : `/index.php?page=${page}`,
  },
  yanqing: {
    id: 'yanqing',
    label: '言情',
    origin: 'https://www.asw7777.com',
    firstPage: '/',
    pagePath: page => page <= 1 ? '/' : `/index.php?page=${page}`,
  },
  nansheng: {
    id: 'nansheng',
    label: '男生',
    origin: 'https://www.asw7777.com',
    firstPage: '/searchns.php?kw=%5B%E7%94%B7%E7%94%9F%5D',
    pagePath: page => `/searchns.php?kw=%5B%E7%94%B7%E7%94%9F%5D&page=${page}`,
  },
};

export const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};
