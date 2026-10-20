# CHANGELOG.md

这里只记录已完成且验证过的阶段结果；状态与待办见 `ROADMAP.md`。

## 2026-10-20 —— 拿掉 Keystatic，内容改由 Pomelo 编辑与发布

- 内容的编辑、预览和发布都搬进了 Pomelo 的「呦呦漫游」；网站里删掉 Keystatic（`keystatic.config.ts`、`@keystatic/*`、开发时的资源引用预览接口），以及只为它在线模式准备的 `build:remote-check`、`qa-remote-build.mjs` 和 `@astrojs/vercel`。
- 图标从 `lucide-react` 换成同版本（1.26.0）的 `@lucide/astro`，`react`、`react-dom`、`@astrojs/react` 随之移除；没有 `.mdx` 内容，`@astrojs/mdx` 移除，内容只认 `.md`。
- `qa:admin` 改名 `qa:refs`（`scripts/qa-references.mjs`）；`qa-career` 不再检查 Keystatic 配置；改词表后不必再重启 dev server（只有 Keystatic 的下拉框需要）。
- **验证**：改前改后各构建一次逐页比对，全部 31 个页面（含本地的 design-preview）除 SVG 属性顺序外完全一致；Node 22 + npm 10 从 lockfile 干净安装后完整 `npm run qa` 通过；Pomelo 的编辑、发布与本地预览测试在副本上通过。

## 2026-08-28 —— Phase 18 收尾，Personal Website v1 完成并部署

站主提供的生日信终稿逐字接入（9 段正文 + 两行落款，落款改为 `你的，` / `呦呦`），构建产物与源文本逐字符比对一致。Phase 18 就此收尾，v1 全部完成并部署。

**收尾验证**：真 WebKit（WKWebView）跑完 13 组视口 × 2 种工具栏状态 = 26 组 —— `320×568` 到 `1440×900`，含横屏与桌面；每组都翻到末页、逐页检查有没有中间空白页、确认银河印记完整落在视口内、再逐页翻回首页并确认折角显隐，**全部通过**，分页救生圈一次未触发，每次翻页都发出一声音效。Blink 侧用合成 touch 事件在小米 13 尺寸（`393 × 873`）复跑横划往返，同样全绿。`tsc`、`npm run build`、`qa-build`、`qa:admin`、`audit:assets` 通过。

## 2026-08-27 至 08-28 —— Phase 18 `/love-shuyu/` 移动端修复

站主在 iPhone 17 上实测后分三轮提出的八条。durable 规则都在 `DESIGN.md` §8「移动端」，这里只留结论。

**最贵的一条：信纸在手机上完全无法翻页。** 前两轮的诊断都不对，直到临时用 `swiftc` 写了个 WKWebView 探针（加载页面 → 跑 JS → `messageHandlers` 回传 JSON，放 scratchpad，不进仓库）拿真引擎量，才看到真因：`column-count: 1` 时 **WebKit 根本不把盒子当多栏容器**，不生成任何溢出栏，内容直接向下漏（实测 `scrollWidth === clientWidth`、`scrollHeight` 2964px）；`column-count ≥ 2` 才正常。而这一页移动端每页正好只有一栏 —— `pageCount` 算成 1，于是两个折角被 `applyPage()` 收掉（「看不见」）、横划被 `flipTo()` 的边界判断挡掉（「没反应」）、信只剩第一页。桌面是双栏，落在能正常工作的那一档，所以验收时完全没暴露。**教训写进了 `AGENTS.md`：移动端布局问题不能拿 Chromium 代验。**

改法是不再指望溢出栏：`wish.ts` 先迭代求出总栏数（每轮量信末银河印记的位置，`sealColumn` 捕获 Blink 的横向溢出、`spill` 捕获 WebKit 的纵向下漏，差值先除掉祖先缩放），再把 `column-count` 与 `.letter-body` 的盒宽一起写死。完全指定的多栏盒子两家引擎结果一致。另加救生圈：迭代 8 轮不收敛就退成竖向可滚动的单栏，宁可失掉翻页观感也不让信有一半读不到（正常路径走不到）。

其余七条：

- **网页图标在手机上不显示** —— 只给了 SVG icon，而 iOS 全线是 WebKit，标签页与书签只认位图。补 `favicon-32.png`、`favicon-192.png`、`apple-touch-icon.png`（由 `favicon.svg` 与新增的 `app-icon-180.svg` 光栅化，主屏图标不做圆角、星占 60% 留遮罩安全边）。
- **爱心变成系统红心** —— `❤`（U+2764）不带变体选择符时被按 emoji 渲染。两处改为 `.has-hearts` 伪元素，`mask-image` 出形状、`background-color: currentColor` 取色，因此永远是 `--warm`；伪元素也不会被生日态改写 `textContent` 刷掉。
- **底部交互元素被浏览器工具栏吃掉** —— 固定层铺的是「工具栏收起时」的布局视口。新增 `viewport.ts` 实测遮挡写进 `--chrome-bottom`，折角、正文、中缝、滚动提示、照片流与第一幕下内边距都叠上它。
- **折角在触屏上几乎看不见** —— `clip-path` 会把它那道 `box-shadow` 一起裁掉。`@media (hover: none), (pointer: coarse)` 下热区放大到 `clamp(64px, 18vw, 88px)`、斜边内侧补折痕的影、整片比纸底亮一档，并在第二幕第一次落定时明显掀两下；桌面一行不动。第二幕另加横划翻页，折角退回成提示而不是唯一入口。
- **翻页音效不响** —— 交互音原本走 `<audio>` 接 `MediaElementSource`，iOS 上 `preload` 被忽略、每个元素要各自被手势解锁、还要 AudioContext 真的 running。改成 `fetch` + `decodeAudioData` 解成 AudioBuffer，每次触发现开一个 `BufferSource`。背景音乐仍走元素 —— 几 MB 的曲子不适合整段解码。
- **正文越往下越飘、最后一行冲出信纸** —— `--rule` 同时是 `line-height` 和横线渐变的条纹周期，而原式算出来带小数（`393 × 852` 上 `37.488px`）。渐变按小数走，行盒不按：WebKit 把行盒向下取整成 `37px`，每行上飘 `0.488px`。新增 `snapRule()` 把行高向下取整后写回行内 `--rule`，行盒与条纹共用同一个整数。
- **Android（小米 13）适配** —— `text-size-adjust: 100%`（字体自动放大会让分页全错）、`-webkit-tap-highlight-color: transparent`、`overscroll-behavior-y: none`（页首下拉会触发刷新，而第一幕正好停在页首）；按钮统一 `touch-action: manipulation` + `user-select: none`。另修掉一处坐标系错配：照片流显隐判定拿 `window.innerHeight` 比 `getBoundingClientRect`，手机上两者差着一整条工具栏。
- **拉绳下方多出一枚金色光环** —— 是键盘焦点环。进祝福页时脚本会把焦点交给拉绳（读屏与键盘需要），而 WebKit 把程序化 focus 也判成 `:focus-visible`。整条规则锁进 `@media (hover: hover) and (pointer: fine)`。顺带把银河印记的上边距从 `var(--rule)` 收到 `calc(var(--rule) * 0.4)`，贴近落款。

## 2026-08-15 —— Phase 18 `/love-shuyu/` 隐藏页

一次会话内经站主五轮反馈迭代到当前形态。参数与「不要这样做」的规则见 `DESIGN.md` §8。

**主页面两幕**：银河带从左上边界外延入、开场粒子聚拢、11 节点时间线、尾段归束进 `CakeSlice` 星门。常驻动效只有呼吸与心跳两项。节点卡片入场用软边遮罩 + 独立透明度曲线（硬 `clip-path` 会留下看得见的直边），退场是「收回星点」——整张卡片绕节点星缩放淡出，卡面／描边／引光不再各走各的（此前观感是「卡片没了只剩一条金边在飘」）。竖屏点击节点先按实测卡片高度让位下滚再播动效。稀疏微星铺在 `220vh` 虚拟天幕上做视差（此前钉在 fixed 视口上像贴图），四角星与小圆点混排。

**三段转场各自独立**（此前三段共用同一个「暖白光晕涨开」）：主页面→祝福页是镜头推进 + 片元着色器把粒子沿「离开星门」方向拉成青绿／暖金光条、收进暖金光流；祝福页灯→信是拉灯（绳拉长 → 灯先沉后飞 → 只留双层台灯光池 → 墨迹渗现）；祝福页→主页面是信纸碎成粒子散开并**交棒给银河的开场聚拢**，落点是主页面最开始的状态。

**祝福页两幕**：第一幕是一盏挂着的八面手作纸灯（配色取自站主的参考图），第二幕是一封铺满整屏的信——`feTurbulence` 双层做磨砂质感、保留青色浸染、横线画在视口层、中文段落规范（称谓不缩进、正文首行缩进两字）、桌面双栏 + 中缝手绘分隔线、移动端单栏 + 折角翻页（分页靠多栏溢出，不靠 JS 切文本）。彩带碎纸与旧明信片版面已删除。

**背景音乐**：`sky.m4a`（112 kbps）与 `wish.m4a`（128 kbps）由 `afconvert` 从站主提供的 FLAC / MP3 转码，各在 5 MB 上限内。错开的交叉淡入淡出（旧曲 2.6s 淡出，新曲延后 1.9s 起步再 2.6s 淡入）。自动播放成功时零可见 UI，被拦下时第一幕出现音符提示。

**修掉的缺陷**（都在 `DESIGN.md` §8 留了规则）：

- `await context.resume()` 在没有用户激活时永远 pending 且从不 reject，把整条音乐链挂死——音符不出现、手势监听也没挂上。改为先 `await element.play()`、再 `void context.resume()` 只发不等，并给每次起播加 2.5s 限时与开场看门狗。
- `overflow: hidden` 的盒子仍是滚动容器，`focus()` 把信纸滚到最后一栏，同时滚出背景绘制区导致横线整片消失——两个症状一个根因。改为 `preventScroll` + 钉死 `scrollLeft`，并把横线移到视口层。
- 音符按钮留在文档流里，一消失就让垂直居中的第一幕整体下移半个高度。
- 退场遮罩被按边／按端规则的更高权重盖过，卡面停在「全隐藏」位置。
- `onPlaying` 去重会留下死结，音符永远等不到撤下的信号。
- 后台标签页里 rAF 会被**完全停掉**（3 秒 0 帧），所有「回调挂在补间结尾」的地方都补了 `duration + 320ms` 的定时器兜底。
- SVG 有来自 viewBox 的固有宽高比，`height: auto` 会让中缝分隔线算出 1000px 冲出视口；切换显隐必须动 `hidden` 属性本身。
- WebGL 画布只按灯体取景，拉绳被拉长后木珠与流苏落到画布下缘之外 `37px`，那一截读起来像被黑暗吃掉。画布向下多留 `16%` 渲染余量，相机按同一比例补偿，灯体成像不动。
- 展开层照片用 `object-fit: contain` 配 `46vh` 高度上限，竖图在较矮的手机上被缩到上限高度、左右各留 `31.9px` 暗边。改用 `cover`：宽度永远铺满，只裁掉纵向超出上限的部分，横图与高屏幕上的竖图都不受影响。
- 信纸的栏数写成「半栏宽的 `column-width`」，要浏览器自己反推栏数，而 `clientWidth` 取整后比值是 `1.9997` 不是 `2`——只要视口实际宽度带小数（`6vw` 内边距在窄于 `1267px` 时必然带），**整封信就塌成单栏**、文字压在中缝线上。改为把栏数直接写进 `column-count`。

**验证**：`tsc`、`npm run build`、`qa:workspace`、`audit:assets`、`qa:discovery` 全部通过；边界确认（进构建但不进 sitemap 与 RSS、`noindex, nofollow` 生效、Pagefind 未索引、无站内链接）。在 `1280 × 800` 与 `375 × 812` 下走完「主页面 → 灯 → 信 → 回主页面 → 再次进入」的完整往返，各步显隐、焦点流转、分页横移与滚动复位均正确。**动态观感与静态美观未经目视**——预览面板停掉了 rAF 与 CSS 动画，留待站主人工复核。

**同期完成的其余几件**：

- **内容接入**：11 个节点的地点、正文、图片描述与祝福信的 9 段正文、两行落款全部接入，逐字照录不改写。三段节点文字由可选改成必填 —— 漏填现在是 `tsc` 编译错误，而不是把「待填写」带上线。展开层区间新增可选的 `rangeStart`：`start` 同时是 `milestoneByStart` 的键，改它会弄丢里程碑样式，所以区间起点必须走新字段。
- **只在生产构建里犯的照片流色雾**：站主在 Vercel Preview 上发现 42 张回忆照片被青金雾糊住，本地 dev 正常。根因是那圈 1px 描边写成了 `mask:` 简写 + 单独的 `mask-composite: exclude` —— 简写会把 composite 重置回 `add`，而 CSS 压缩器把重复的 `mask` 与 `-webkit-mask` 合并成一条并把 composite 挪到前面，两层遮罩由相减变成相加。**任何 `astro build` 都会犯，dev server 因为不压缩才看不出来。** 改为长写法；`qa-build.mjs` 加了守卫，构建产物里出现任何 `mask:` 简写即报错。`.claude/launch.json` 增加 `prod-preview`（端口 4400），此后视觉验收一律走生产构建。
- **页面身份**：标题由匿名的 `· · ·` 改为 `致舒宇`，并有了自己的 favicon（深空底 + 暖金实心四芒星，复用页内那条自绘星形路径；刻意不做描边与渐变，16px 下只有实心剪影认得出）。中文首页标题由 `呦呦漫游 | Elen Skye` 简化为 `呦呦漫游`。
- **QA 例外与资源清理**（站主授权）：`qa-build.mjs` 把 `/love-shuyu/` 与 `design-preview` 列入 `localOnlyHtml`，另加断言保证前者永不进 sitemap；删掉 8 个空的悠哉字体私用区子集与对应 `@font-face`（删前确认全仓库零私用区字符、零其他引用）。
- **起点更正**：`startBeijing` 由 `2025-10-08 00:00` 改为站主确认的 `2025-10-03 00:00`。

## 2026-08-03 —— 阶段 16–17 与 v1 正式上线

- 发布候选通过 Node 22 + npm 10 的干净安装、完整 QA 与 Vercel Production 构建；修复 npm lockfile 的云端 `npm ci` 兼容问题，并确认生产不包含 Keystatic 后台或本地资源接口。
- 站主完成默认地址与正式域名人工验收；`https://elenskye.com` 正式上线，`www.elenskye.com` 以 308 永久重定向到根域名，GitHub `main` 成为 Vercel Production 基线。

## 2026-07-27 —— 阶段 15 内容确认与阶段 16 定向修复

- 确认当前 v1 内容例外，补齐 4 篇优先 Wander `.en` 全文；Wander 的保存、排序、页面与发现性元数据改为仅使用 `YYYY-MM`，不再保存或派生具体日期。
- 恢复 Topic 自然宽度、统一视觉间距与原按钮尺寸；Gallery 页面态使用同色无框固定区域与侧图滑入动画，放大态收口为当前单图完整适配视口；404 / 空状态插画改为透明外背景；同时修正 About 长内容字体、页脚紧凑布局与全站拉丁字形。

## 2026-07-26 —— 阶段 15 / 16 本地技术候选

- Career 摘要与可增删排序的双模式模块进入 Keystatic；接入 OG v2、404 / Oops、正式缩略图与本地生产边界，并完成当时范围内的全量 QA、Lighthouse、axe、键盘、减弱动效和三档响应式检查。
- 仓库移出 iCloud 后清理冲突副本与缓存问题；加入内容命名门禁、缺内容降级与依赖范围规则，升级至 Astro 7.1.3 / `@astrojs/mdx` 7.0.3。

## 2026-07-25 —— 阶段 13–15

- 完成 Gallery 内容模型、容错解析、缩略图优先级与首组摄影集；定案并实装 Vermilion、Logo A、品牌图形和微动效，建立本地 `/design-preview/`。

## 2026-07-24 —— 阶段 10–12

- 加固本地 Keystatic、稳定分类 ID、资源引用与删除预览、双语搜索、Pagefind、RSS 和发现性元数据；确定 v1 无分析、评论或邮件订阅。

## 2026-07-23 —— 阶段 9

- 完成 Wander Topic / Category 组合筛选、50 卡片上限、双语配对、stub、canonical、`hreflang` 与语言切换。

## 2026-07-09 至 2026-07-19 —— 阶段 1–8

- 搭建 Astro 双语站点，完成 Wander / Career / Now / About、主题排版、静态部署配置、SEO 与首轮自动化 QA。
