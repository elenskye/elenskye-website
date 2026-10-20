# AGENTS.md

## 开工前

- 先读本文件与 `ROADMAP.md`；涉及视觉时再完整阅读 `DESIGN.md`。
- **Agent 只审查网页内容完整性和规范性，不允许审查或建议具体内容。**
- **方案获批不等于开工许可。** 站主认可方案文档、或工具层返回「计划已批准」，都只代表方向通过；开始写实现代码必须另有站主的显式开工指令。收到「进入 Plan 阶段」一类指令时，只做调研、提问与文档，不碰实现代码。
- 保留无关改动与站主手写内容；commit 与 push 由站主进行。
- 严守当前任务和 `ROADMAP.md` 的权限边界；已确认的内容、例外与停点不重复询问或自行改变。
- 已完成阶段不重新审计；新会话从 `ROADMAP.md` 的「v2 开发队列」或站主点名的具体项开始。
- 文档使用中文；仓库为 private repo，不对外公开。

## 内容由 Pomelo 编辑

- 网站没有内容后台。内容在站主的本地应用 Pomelo（「呦呦漫游」，`~/Documents/GitHub/pomelo`）里编辑和发布：它直接读写 `src/content/`、`src/data/`（词表、外部链接、当下状态、About 图片、资源登记）和 `public/`；发布时先跑 `npm run qa`，再把全部改动提交并推到 `main`。
- **改内容格式前先问站主**：`content.config.ts` 的字段、`src/data/` 里 JSON 的结构、资源登记的格式、内容与上传文件的位置和命名，Pomelo 都照着读写，改了它要跟着改。

## 开发与验证

- Node.js 22 + npm 10；开始工作或更新 lockfile 前先 `nvm use`（版本来自 `.nvmrc`）。本地站点 `http://127.0.0.1:4328/`。
- Astro 7 发现是 AI Agent 在跑 `astro dev` 时会把它放到后台（JSON 日志）：用 `npx astro dev status|logs|stop` 管理，用完停掉。
- 日常修复只跑与改动直接相关的最小验证，不默认跑全站 QA、Lighthouse、axe 或真实浏览器矩阵。
- 完整 `npm run qa` 与双语、明暗、键盘、减弱动效、375 / 768 / 1280px 浏览器检查只用于阶段收尾、发布候选、部署前或站主明确要求；耗时检查先说明理由。依赖改动后必须跑完整 QA。
- 内容不刷新时先查 `InvalidContentEntryDataError`；确认缓存异常后再清理 `.astro`、`dist` 并重启。出现 Vite `504 Outdated Optimize Dep`：停掉 dev server，删 `node_modules/.vite`，重启。
- **视觉验收必须跑生产构建，dev server 不算数。** 生产构建会压缩 CSS：压缩器合并简写、重排声明，能让 `mask-composite` 这类被简写重置的属性静默改变含义（照片流的 1px 描边曾因此在 Vercel Preview 上变成满屏色雾）。本地用 `npm run preview`（`.claude/launch.json` 的 `prod-preview`，端口 4400）看构建产物。
- **移动端的布局问题不能拿 Chromium 代验。** 预览面板与 Claude in Chrome 都是 Blink，iPhone 上的浏览器全是 WebKit，两家在多栏溢出这类地方行为不一致（见 `DESIGN.md` §8）。要判定真机怎么排，临时 `swiftc` 一个几十行的 WKWebView 探针（加载 URL → 跑 JS → 用 `window.webkit.messageHandlers` 回传 JSON），放 scratchpad，不进仓库、不加依赖。`evaluateJavaScript` 不认 Promise，异步结果只能走 message handler；桌面 WebKit 没有 `Touch` 构造函数，触摸手势只能在 Blink 侧验。Android 用 Blink 验即可。
- 预览面板隐藏时浏览器会停掉 `requestAnimationFrame` 与 scroll 事件派发，动画、滚动驱动与指针手势**无法目视验证**。此类效果只做程序化验证（DOM 状态、投影坐标、计算样式、合成事件），并在交付说明里列出哪些未经目视，交站主人工复核。
- 依赖必须写成 `^x.y.z`，绝不用 `latest`。
- push、PR、部署、回滚、DNS 与新增外部或付费服务均须站主明确授权。

## 内容与数据护栏

- 内容文件使用 `<slug>.zh.md` / `<slug>.en.md`；单例使用 `zh.md` / `en.md`，小写连字符命名。
- 单例读取走 `requireEntry()`；生产缺内容应中止，开发降级提示，动态路由缺条目应重定向。
- schema 必须容忍空值与半填项，不能让单条坏数据冻结整个集合。
- 占位、测试或私人内容未经站主批准不得进入生产；已批准例外只看 `ROADMAP.md`。
- Wander 分类使用 `src/data/wander-taxonomy.json` 的稳定 ID；只改显示名，删除项需安全归一化。
- 同名 `.zh` / `.en` 是同一 Wander 作品；英文缺全文时使用 stub。年月只存 `YYYY-MM`，不得保存或派生具体日期。
- Wander 筛选保持 Topic 单选、Category 多选计数、AND 组合；无筛选仅显示最新 50 张。
- Gallery 页面态保持同色无框、固定区域与侧图滑入；放大态只看当前图并完整适配视口，不提供切换；解析须容忍半填行。
- 内容用到的图片和文档都在资源库：`public/assets/images`、`public/assets/documents`，每个文件在 `src/data/assets/` 登记一次；内容（封面、画廊、正文图片、简历、About 图片）只引用资源库里的文件，不另存副本（`audit:assets`、`qa:refs` 会查）。网站自己的图标、分享图和状态插图不算内容，留在原处；Logo 源文件在 `design/brand/`，不发布。
- 图片不超过 1.5 MB，其他公开文件不超过 5 MB。
- 资源删除必须先预览引用并由站主确认；绝不自动删除已登记资源。
- Career 摘要与大模块可增删排序并支持简版 / 详版；每种语言的页面各自选简历。
- Vermilion 七个颜色角色未经批准不得调整；任何配色变化先过 `DESIGN.md` 的 APCA 门槛。

## 文档职责

- `AGENTS.md`：长期开发、安全与防返工规则（`CLAUDE.md` 指向本文件）。
- `ROADMAP.md`：当前状态、长期边界、待办、v2 队列与已拍板的决定。
- `CHANGELOG.md`：已完成且验证过的阶段结果，不写待办。
- `README.md`：项目结构、内容在哪里改、命令入口。
- `DESIGN.md`：已定视觉基线与仍待确认的设计点。
- `DEPLOY.md`：站主自用的发布与回滚手册（不进 Git）。
- 阶段收尾时按实际变化更新对应文档；不复制跨文件内容，不写过程流水账。已拍板的决定记在 `ROADMAP.md`，不重复询问。
