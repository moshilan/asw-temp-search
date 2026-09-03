# ASW 小说资源搜索工具 — 项目迁移/交接文档

项目：`20260825-asw-temp-search`
本地目录：`C:\db\data\codex\20260825-asw-temp-search`
GitHub：`https://github.com/moshilan/asw-temp-search.git`
Pages：`https://moshilan.github.io/asw-temp-search/`

## 1. 项目目标
极简、免费、手机可用的小说资源搜索工具，替代原站临时不可用/不好用的搜索。
原则：Android/iPhone 可用；纯静态部署；不托管正文；不做账号、推荐、AI、模糊搜索；搜索结果指向原站详情或真实下载地址。

## 2. 数据源
- 耽美：`https://www.asw227.com/`，分页 `index.php?page=N`
- 言情：`https://www.asw7777.com/`，分页 `index.php?page=N`
- 男生：`https://www.asw7777.com/searchns.php?kw=[男生]`

请求需中文语言头：
`Accept-Language: zh-CN,zh;q=0.9,en;q=0.8`

列表页可直接取得：hash、完整文件名、大小、上传时间；无需为基础索引逐条打开详情页。

## 3. 搜索规则
- 单搜索框，完整文件名包含匹配
- 去除首尾空格
- 英文大小写不敏感
- 分类：全部 / 言情 / 耽美 / 男生
- 不做多关键词、分词、拼音、AI、模糊纠错、推荐
- 结果显示完整文件名、分类、大小、上传时间、直接下载（有直链时）、详情

## 4. 正式架构
`GitHub Actions 定时增量更新 → 构建静态索引 → GitHub Pages`

不依赖公网 Node、Worker 或用户电脑常驻。
本地 Node 仅用于调试/维护。

定时：北京时间 08:00 / 14:00 / 20:00，对应 UTC 00:00 / 06:00 / 12:00。
工作流支持 `workflow_dispatch`。

## 5. 静态索引与 IndexedDB
旧方案让手机一次加载 8 万多条，曾出现 `failed to fetch` 和长时间卡住，已废弃。

现方案：
- 索引按分类分片；曾验证耽美 12 片、言情 9 片、男生 1 片
- 单片约 1.18MB 以内
- `manifest.json` 记录版本、分片、条数、字节数、内容指纹
- 浏览器用 IndexedDB 持久保存原始 JSON 文本
- 首次下载全部分片
- 同版本再次打开只请求 manifest
- 版本变化只下载指纹变化分片
- 新增记录追加到分类末尾，分片边界稳定
- 请求失败有重试与旧缓存回退

## 6. 日期
原站时间只有 `MM-DD HH:mm`，曾导致跨年排序错误。
已修正：
- 构建时补全年份
- 显示 `YYYY-MM-DD HH:mm`，无时分则只显示日期
- 按完整日期倒序，年份参与比较

## 7. 分类/标签
重要结论：原站“言情 / 耽美 / 男生”不是严格互斥的同层分类。
更像：早期女生向言情/耽美，后加男生板块；男生与言情可交叉，耽美相对更纯。

因此：
- 不做三选一自动重分类
- 永久保留原始板块
- 标签仅做辅助判断/疑似错区
- 重点识别“原板块为言情/男生，但耽美+GL 信号明显”的疑似耽美错区

标签来源：
- 详情页 `iframe#tagIframe`
- iframe 指向 `ns.aishu456.com/filepl.php`
- `div.tag-btn[data-tag]`
- `span.tag-count` 为票数
- 常见标签：耽美、言情、男生、其他、无CP、BG、GL、GB

侧表：`data/tag-classifications.json`
按 hash 保存原分类、四类票数、检查时间、解析版本、错误/重试状态、downloadUrls 等。

历史 1000 条真实验证：
- 成功 1000
- 无相关标签 495
- 并列 24
旧“三选一”算法的 173 条纠正结论已不再作为最终分类依据。

前端已有“查看疑似错区”入口：
- 可空关键词浏览
- 首批约 75 条，可继续加载
- 不影响正常搜索

## 8. 直接下载
真实下载地址要求：
- HTTPS
- 路径匹配 `/down.php/`

典型域名：
耽美：
- `dm.downshu123.com`
- `dm.downshu321.com`
- `w.aishu995.com`

言情：
- `yq.downshu123.com`
- `yq.downshu321.com`
- `nv.aishu995.com`

男生：实测可用言情下载域名。

必须排除：
- `gonggao.php`
- `read.php`
- HTML 公告/阅读页

曾出现 bug：错误把公告地址放在 `downloadUrls[0]`，手机点击后跳公告页，已修复。

`downloadUrls` 为字符串数组，前端：
- 有直链：显示“直接下载”和“详情”
- 无直链：只显示“详情”
- 直接下载使用普通 `<a href>`，不 fetch TXT

最近明确状态：
- 1000 条侧表记录
- 992 条有真实 downloadUrls
- 8 条无直链/待重试
- 最近明确静态索引总数约 84,761
- 有真实 downloadUrls：992

另有“只看可直接下载”入口：
- 可空关键词浏览
- 可与分类筛选组合
- 首批约 75 条
- 与“查看疑似错区”互斥

## 9. 下载乱码
Android 可能出现正文乱码：
- 原 TXT 编码不统一，实测 UTF-8 / GB18030 / UTF-16LE
- 多数无可靠 BOM，Content-Type 不声明 charset
- 某些阅读器误判编码
- 不是下载损坏

iPhone 可能出现文件名乱码：
- 下载服务器只用 `filename=...`
- 中文文件名编码不规范
- 没有标准 `filename*`
- Safari/Android 兼容差异

结论：不为乱码引入代理、Worker、后端或转码。

## 10. 明确不做
- 原站去广告
- 站内试读
- 完整阅读器
- 网页记忆/强制下载目录
- Service Worker 复杂离线方案
- 公网 Node / Worker

试读放弃原因：下载域名无 CORS、Range 不支持、TXT 编码不统一。

## 11. 历史详情 backfill
目标：逐步补标签票数、疑似错区辅助信息、downloadUrls。

已有能力：
- 断点续跑
- 已处理 hash 跳过
- 失败记录
- `--retry-failed`
- `--download-only`
- 顺序单请求
- 每条成功立即落盘

示例：
`node scripts/backfill-detail-tags.js --limit=1000 --delay-ms=700`
另有 `npm run backfill:detail`

性能：
- 1000 条约 35 分钟
- 平均每条约 2 秒
- 全量约 48～49 小时
因此建议每批约 1000 条，不提高并发，不一次暴跑。

最近一次明确执行：
- 只重试了 8 条缺失 downloadUrls
- 8 条仍为 `fetch failed`
- 尚未开始新的下一批 1000 条
- 累计详情处理仍约 1000 条
- 992 条有真实下载直链

下一步：跳过已处理 1000 条，不再优先卡那 8 条失败项，从新的未处理历史记录继续下一批约 1000 条。

## 12. Git / Pages
远端：`https://github.com/moshilan/asw-temp-search.git`
分支：`master`
Pages：`https://moshilan.github.io/asw-temp-search/`

重要历史 checkpoint：
- `7deaf6f...` 独立仓库初始化
- `46e619c...` Cloudflare 适配阶段（后放弃）
- `29ac82b...` 纯静态 GitHub Pages
- `34d689c...` 索引分片
- `62c6e36...` IndexedDB 持久缓存
- `78ae5e3...` 日期跨年修复
- `6d3de62...` 标签侧表 1000 条验证
- `68c613d...` 直接下载 + 详情
- `9f053e7...` 1000 条补 downloadUrls
- `9e4cb19...` 只看可直接下载
- `6a5beef...` 修复公告链接误判，992 条真实直链
- `4a35dd2...` 最近一次明确报告的 push checkpoint

如与当前仓库冲突，以 `origin/master` 为准。

注意：
- 普通 push 不一定立即部署 Pages；当前主要依赖 schedule / workflow_dispatch
- Actions 会自动提交索引更新，本地 push 可能被拒绝
- 正确处理：fetch → rebase → 保留远端最新数据和本地功能修改 → 正常 push
- 禁止 force push

## 13. Windows owner / Git 权限
曾出现：
`fatal: detected dubious ownership in repository`

原因：
- `.git` 或部分目录 owner 被改成 `CodexSandboxOffline`
- 当前 Windows 用户为 `lz`

验证过在 `C:\db\data\codex\_owner-test` 中新建目录、文件、子目录和 `git init`，owner 均正常为 `lz`，因此正常新建项目不会天然变成 `CodexSandboxOffline`。

曾检测到异常 owner：
- `20260824-personal-market-board`
- `20260825-asw-temp-search`
- `20260829-novel-file-manager`
- `20260830-codex-chatgpt-bridge`

ASW 曾明确 `.git` owner 异常并导致 Git 失败。
不要长期用 `safe.directory` 掩盖；优先修正 owner。

## 14. Codex helper / 线程经验
曾出现：
`helper_unknown_error: setup refresh had errors`

隔离测试最终暴露 ASW 的真实 Git owner 问题。
经验：某项目 helper 失败但新目录正常时，先检查 Git owner / `.git` owner / ACL。

曾出现额外 Codex 窗口，提示“由 ChatGPT 从另一项任务发送”。
目前结论：
- 未发现 Windows 启动项、计划任务、服务或 bridge 后台进程
- 更可能是源 Codex 线程执行了线程派发/创建能力
- 与本轮指令曾写“helper 失败可重新连接或新开同项目 Codex 会话后验证”有关

以后：
- helper 失败时停止并报告
- 不得自行新建、派发、恢复、切换或向其他 Codex 会话发送任务，除非用户本轮明确授权

## 15. 项目管理约定
- 本项目不做专题拆分，不需要每条指令写【窗口】
- Codex 指令默认精简、一次发送
- 不重复已有背景
- 只保留本轮新增目标、必要约束、关键验收
- 项目根目录没有必须存在项目级 `AGENTS.md` 的要求；父级规则已覆盖时不应因此停工

## 16. 当前下一步
1. 确认 ASW 仓库 owner / Git 状态已恢复正常。
2. 继续新的历史详情 backfill 1000 条。
3. 每批完成后重建静态索引、`npm test`、commit、push。
4. 继续观察疑似错区准确率、downloadUrls 覆盖率和下载镜像可用性。
5. 暂不增加新架构或后端。

## 17. 迁移用法
新 ChatGPT 窗口可粘贴：

> 请接手项目 `20260825-asw-temp-search`。以下为项目迁移/交接文档，请以此为当前事实基线；如与 Git 仓库最新状态冲突，以 `origin/master` 和当前项目文件为准。继续前先读 README、WORKLOG 和适用 AGENTS.md，不重复设计已定案架构。

新 Codex 窗口可粘贴：

> 继续 `C:\db\data\codex\20260825-asw-temp-search`。先读取适用 AGENTS.md、README.md、WORKLOG.md 和项目迁移文档；以 Git 当前状态为准，只处理本轮明确任务。

## 18. 一句话定案
这是一个 GitHub Pages + GitHub Actions 的纯静态手机小说资源搜索工具；浏览器用 IndexedDB 持久缓存分片索引；原站列表页提供元数据，详情页补标签和真实 `/down.php/` 下载直链；不做代理、试读、去广告、下载目录控制；历史详情按约 1000 条一批断点补全。
