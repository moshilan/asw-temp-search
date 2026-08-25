# 小说临时搜索

用于原站搜索升级期间的轻量过渡工具，供少量手机用户使用。

## 正式使用方式

正式网页由GitHubPages提供。页面只读取仓库中的静态索引，在浏览器本地完成单个关键词包含搜索，不会在搜索时请求原站。

- 搜索对象：完整文件名。
- 匹配方式：去除首尾空格后包含匹配。
- 英文大小写不敏感，中文匹配逻辑不变。
- 分类：全部、言情、耽美、男生。
- 页面显示数据最后更新时间。
- 点击结果会打开原站`file.php?hash=...`详情页。

为兼顾手机浏览器，言情和耽美索引按每片4000条拆分。搜索会逐片下载和匹配，当前页面仅缓存少量最近分片；全部分类仍会覆盖三类数据。加载失败时会显示具体分片文件。

## 数据来源

- 耽美：https://www.asw227.com/
- 言情：https://www.asw7777.com/
- 男生：https://www.asw7777.com/searchns.php?kw=[男生]

请求列表页时会带`Accept-Language: zh-CN,zh;q=0.9,en;q=0.8`。不下载小说正文，不使用登录、Cookie或浏览器自动化。

## GitHubActions更新

`.github/workflows/update-pages.yml`每天按北京时间08:00、14:00、20:00运行，对应UTC的00:00、06:00、12:00。

每次运行会：

1. 从三分类第一页开始做增量抓取。
2. 遇到已收录hash后停止继续翻页。
3. 保留已有索引并更新`data/index.json`、`data/meta.json`。
4. 生成`public/data/manifest.json`、分类分片与更新时间文件。
5. 自动提交数据更新，并部署`public/`到GitHubPages。

单个分类抓取失败不会清空旧索引，其他分类仍会继续更新。Actions不进行历史全量初始化。

## 首次部署GitHubPages

1. 将本仓库推送到GitHub。
2. 在仓库Settings→Pages中将Source设为GitHubActions。
3. 在Actions页面手动运行一次更新工作流。
4. Pages部署完成后，使用GitHub提供的页面地址访问。

Actions需要仓库允许`GITHUB_TOKEN`具备读写权限，供它提交更新后的索引。

## 本地开发与初始化

要求Node.js20+。

```bash
npm test
npm start
```

本地Node服务仍保留，用于调试与手动增量抓取；正式Pages网页不依赖它。

首次建立历史索引仅在本地手动执行：

```bash
npm run init:all
npm run build:static-index
```

历史初始化顺序、低频、每页落盘且可中断续跑。日常更新使用：

```bash
npm run update:index
```

## 已知限制

GitHubPages只提供静态网页。最新数据取决于最近一次GitHubActions成功运行，不会在用户搜索时刷新。若原站页面结构、访问规则或中文语言要求改变，Actions更新可能失败，但现有静态索引仍可搜索。