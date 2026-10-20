# `/love-shuyu/` 第三方资源

本目录中的第三方资源只用于 Phase 18 隐藏页；页面运行时全部由本站自托管，不请求第三方 CDN。

## 生日标题字体

- 当前页面字体：Kaushan Script Regular
- 官方收录：<https://github.com/google/fonts/tree/main/ofl/kaushanscript>
- 原作者：Pablo Impallari、Igino Marini
- 授权：SIL Open Font License 1.1；保留字体名 Kaushan Script
- `KaushanScript-Regular.ttf` SHA-256：`6d8d379d9bba98178bee476d68114c8f83812c18005ecccf679e70f60e03d8f6`
- 当前引用文件：`fonts/kaushan-script/kaushan-script.css`、`fonts/kaushan-script/KaushanScript-Regular.ttf`、`fonts/kaushan-script/OFL.txt`

## 信纸字体

- 当前页面字体：悠哉字体（Yozai Font）常规字重 `v0.868`
- 字体项目：<https://github.com/lxgw/yozai-font>
- 对应发布：<https://github.com/lxgw/yozai-font/releases/tag/v0.868>
- 授权：SIL Open Font License 1.1
- 原始 `Yozai-Regular.ttf` SHA-256：`25071998a0fe6a72f54c235e714986d259633e5ff670b1a2b5e264387f3316ac`
- 网页子集由 `cn-font-split`（Apache-2.0）在本地生成：<https://www.npmjs.com/package/cn-font-split>
- 当前引用文件：`fonts/yozai/yozai-regular.css`、`fonts/yozai/yozai-*.woff2`、`fonts/yozai/OFL.txt`、`fonts/yozai/VERSION`

上一版霞鹜文楷轻便版文件仍暂存在 `fonts/files/` 与字体目录根部，但页面不再引用；
依据项目的资源删除护栏，须经站主预览并明确确认后才能清理。

## 交互音效

### 拉灯

- 原作：`Desk Lamp - Chain Pull (Fast).wav`
- 作者：PhillipArthurSimmons
- 来源：<https://freesound.org/people/PhillipArthurSimmons/sounds/541762/>
- 授权：CC0 1.0
- 网页文件：`audio/pull-chain.m4a`；由官方 HQ MP3 试听文件转为 AAC M4A

### 翻页

- 原作：`BookFlip2.wav`，收录于 `Book Flip Sounds`
- 作者：Voltiment555
- 来源：<https://opengameart.org/content/book-flip-sounds>
- 授权：CC0 1.0
- 网页文件：`audio/page-turn.m4a`；由原始 WAV 转为 AAC M4A

原始下载文件保留在 `audio/_incoming/` 供本地复核，该目录按项目规则不进入 Git；网页只发布转码后的 `.m4a`。
