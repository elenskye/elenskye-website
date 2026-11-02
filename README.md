# Elen Skye Website

Elen Skye 的双语个人网站，以「漫游」连接写作、项目、画作与个人经历。技术栈为 Astro、Pagefind、GitHub 与 Vercel，内容在站主的本地应用 Pomelo（「呦呦漫游」）里编辑和发布；中文使用根路径，英文镜像位于 `/en`。

正式网站：<https://elenskye.com>；`www.elenskye.com` 永久重定向到根域名。**v1 已全部完成并部署**；当前状态、长期边界与 v2 队列见 `ROADMAP.md`。

## 目录

| 路径 | 用途 |
| --- | --- |
| `src/components/` | 页头、页脚、Wander 墙、筛选、搜索与 Gallery |
| `src/content/` | About、Career、Now、Wander 双语内容 |
| `src/data/` | 站点文案、分类、社交入口、资源登记（`assets/`）与 `/love-shuyu/` 时间线数据 |
| `src/layouts/`、`src/pages/` | 公共布局、双语路由、RSS、404 与 sitemap |
| `src/lib/` | 内容、资源、Gallery、搜索与 RSS 逻辑 |
| `src/scripts/` | 页面端脚本：Wander 墙、文末落款与 `/love-shuyu/` 各模块 |
| `src/styles/` | 字体、Vermilion 主题、排版与响应式样式 |
| `public/assets/` | 资源库：内容用到的全部图片（`images/`）和文档（`documents/`，含简历），每个都已登记 |
| `src/vendor/vermilion/` | 从 visual-assets 按 tag 同步来的 Vermilion 图形与动效（默认分享图、状态插图、分类图形、文末落款等），不手改，见 `DESIGN.md` 第 10 节 |
| `public/` 其余 | 网站自己的图标、搜索脚本，及 `/love-shuyu/` 的文件 |
| `design/brand/` | Logo 与主屏图标的源文件，不发布 |
| `scripts/` | QA、资源审计、删除预览与 `/love-shuyu/` 照片压缩 |

`/love-shuyu/` 是 Phase 18 的隐藏页（仅中文、无站内入口、`noindex`），构成如下：

| 路径 | 用途 |
| --- | --- |
| `src/pages/love-shuyu.astro` | 页面结构、独立样式与站主填写区 |
| `src/scripts/love-shuyu/band.ts` | 银河带曲线定义，全页唯一空间真相源 |
| `src/scripts/love-shuyu/galaxy.ts` | 粒子生成、着色器、开场聚拢、屏幕空间遮罩与星门穿越 |
| `src/scripts/love-shuyu/lantern3d.ts` | Three.js 八面纸灯：八个纸面、十二根竹骨、侧流苏与内部灯光 |
| `src/scripts/love-shuyu/timeline.ts` | 曲线投影驱动的 11 个节点、展开层与竖屏让位滚动 |
| `src/scripts/love-shuyu/lyrics.ts` | 第一幕 Yozai 歌词：桌面多轨／移动单轨、随机字号、无偏避让与晕染轮换 |
| `src/scripts/love-shuyu/postcard.ts` | 主页面 ↔ 祝福页的两段转场（星门穿梭 / 信纸分解） |
| `src/scripts/love-shuyu/dissolve.ts` | 回主页面时信纸碎成粒子、卷成暗中心银河隧道，镜头穿梭后交棒给银河开场聚拢 |
| `src/scripts/love-shuyu/wish.ts` | 祝福页自身的两幕：纸灯、拉灯换幕、信纸分页与折角翻页 |
| `src/scripts/love-shuyu/audio.ts` | 背景音乐交叉淡入淡出、自动播放兜底，以及拉灯／翻页交互音效 |
| `src/scripts/love-shuyu/countdown.ts` | 倒计时与生日态判定 |
| `src/scripts/love-shuyu/index.ts`、`dom.ts` | 编排、滚动与公共工具 |
| `src/data/love-shuyu-timeline.ts` | 11 个节点的日期、地点、正文与照片路径 |
| `src/data/love-shuyu-lyrics.ts` | 站主提供的长段／短句原文与译文，不在动效脚本中改写 |
| `public/love-shuyu/photos/` | 节点照片；`_incoming/` 为未压缩原图，已 gitignore |
| `public/love-shuyu/memories/` | 双轨照片流的 42 张专用 JPEG 副本；与节点照片完全分开 |
| `public/love-shuyu/audio/` | `sky.m4a`、`wish.m4a` 两首背景音乐及 CC0 的 `pull-chain.m4a`、`page-turn.m4a` 交互音效；`_incoming/` 为已 gitignore 的源文件区 |
| `public/love-shuyu/fonts/` | OFL 1.1 的悠哉字体（歌词与信纸）及 Kaushan Script（生日艺术字）；各平台使用同一自托管资源 |
| `public/love-shuyu/favicon.svg`、`app-icon-180.svg` | 该页专用图标源文件：深空底 + 暖金实心四芒星，不与主站 favicon 混用 |
| `public/love-shuyu/favicon-32.png`、`favicon-192.png`、`apple-touch-icon.png` | 上面两个 SVG 的光栅化位图；手机只认位图，改图标要一起重生成 |
| `src/scripts/love-shuyu/viewport.ts` | 实测手机浏览器工具栏遮挡，写进 `--chrome-bottom` |
| `public/love-shuyu/THIRD-PARTY.md` | Phase 18 自托管字体、webfont 包与交互音效的来源、作者及许可证登记 |

## 内容在哪里改

| 要改的东西 | 去哪里 |
| --- | --- |
| Wander 作品、Now 与当下状态、About、Career 与简历、资源库、Wander 分类词表、外部链接 | Pomelo →「呦呦漫游」 |
| 站点文案、导航 | `src/data/site.ts` |
| `/love-shuyu/` 的信、称谓、按钮文案 | `src/pages/love-shuyu.astro` 顶部的 `copy` 常量 |
| `/love-shuyu/` 的 11 个时间线节点 | `src/data/love-shuyu-timeline.ts`（`place` / `body` / `alt` 都是必填，漏写会在 `tsc` 报错） |
| `/love-shuyu/` 的歌词 | `src/data/love-shuyu-lyrics.ts` |
| `/love-shuyu/` 的三个时间常量 | `src/pages/love-shuyu.astro` 顶部，全部按北京时间 |

改完 `/love-shuyu/` 的文本后，分页、折角、横线对齐都会自动重算，不需要手动调任何数字。

## 本地开发

要求 Node.js 22 + npm 10；使用 nvm 时先运行 `nvm use`，版本由根目录 `.nvmrc` 固定。

| 命令 | 用途 |
| --- | --- |
| `npm ci` | 按 lockfile 安装依赖 |
| `npm run dev` | 启动 `http://127.0.0.1:4328/` |
| `npm run build` | 静态生产构建与 Pagefind 索引 |
| `npm run preview` | 预览构建产物。**视觉验收走这里，不是 `npm run dev`**：dev 不压缩 CSS，压缩器改写简写导致的问题只在构建产物里出现 |
| `npm run qa` | 阶段收尾、发布候选或部署前的完整检查 |
| `npm run qa:workspace` | 检查内容文件命名 |
| `npm run audit:assets` | 检查文件体积、重复，以及资源库的每个文件都登记了 |
| `npm run qa:refs` | 检查内容只引用资源库里的文件，且文件都在 |
| `npm run assets:delete-preview` | 只读预览资源引用，不执行删除 |
| `node scripts/love-shuyu-photos.mjs` | 压缩 `/love-shuyu/` 时间线照片到 1.5 MB 内 |
| `node scripts/love-memory-photos.mjs /绝对路径/love-memory` | 用 Quick Look 解码 HDR／HEIC，按原比例生成 1280px、JPEG Q76 的照片流副本并逐张检查 |

长期规则见 `AGENTS.md`；状态、边界与待办见 `ROADMAP.md`；视觉规范与「不要这样做」见 `DESIGN.md`；阶段结果见 `CHANGELOG.md`。

## 发布

- 日常发布在 Pomelo 里点「发布」：先跑 `npm run qa`，过了再把全部改动（内容和代码）提交并推到 `main`，Vercel 自动上线（构建命令同样是 `npm run qa`，不过就不替换线上版本）。手动发布与回滚见 `DEPLOY.md`。
- 不在 Vercel 手工上传 `dist/` 或直接改线上文件。
- `/love-shuyu/` 会随构建上线，知道 URL 即可打开（无站内入口、`noindex, nofollow`、不进 sitemap / RSS / Pagefind）。
