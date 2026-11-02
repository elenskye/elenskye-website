// 文章分享图的生成模块：给一个标题，按模板（方案的 marks/og-card/template.json）排成 SVG，再渲染成 PNG。
// 同步到消费方，在消费方构建时运行，所以不依赖浏览器：文字用 fontkit 转曲线，PNG 用 resvg（wasm 版，各平台同一份）。
// 换行不用 Intl.Segmenter（结果随 ICU 版本变），只按下面的规则断行，同一个标题永远得到同一张图。
//
//   renderCardSvg(template, title)  → { svg, layout, lineWidths }
//   renderCardPng(template, title)  → Uint8Array（PNG）
//   cardKey(template, title)        → 短哈希：标题或模板变了就变，放进文件名，转发平台才不会一直用旧图
//
// 模板的字段：
//   version                  模板的版本，改了版式就加一
//   width, height            画布
//   background, base, lockup 底色、已上好色的底图与字标（SVG 片段）
//   title.color, x, maxWidth 标题的颜色、左边、最大行宽
//   title.baseline           最后一行的基线：标题从这里往上长，行数变了字标与纸山都不用动
//   title.stack              字体栈 [{ package, weight }]，按顺序取第一个有这个字的
//   title.lineHeight         { cjk, latin }：标题含中文用 cjk，否则用 latin
//   title.sizes              [{ size, maxLines }]，从大到小，取第一个放得下的；都放不下时用最后一档并截断
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { findFont, layoutRuns } from './outline.mjs';

const require = createRequire(import.meta.url);

const CJK = /[⺀-鿿豈-﫿＀-￯\u{20000}-\u{2FFFF}]/u;
// 不放行首的（标点粘在前一个字后面）与不放行尾的（粘在后一个字前面）
export const NO_START = new Set('，。！？；：、）》」』】〉〕］｝”’…—–·・,.!?;:)]}%');
export const NO_END = new Set('（《「『【〈〔［｛“‘([{');
// 这些字之后断行最自然：小标题、分句
const GOOD_BREAK_AFTER = /[：:；;。！？!?，,、|｜]$/;
const SEPARATOR = new Set('|｜');
const ELLIPSIS = '…';

const faceOf = (stack, ch) => {
  for (const { package: pkg, weight } of stack) {
    const font = findFont(pkg, weight, ch);
    if (font) return font;
  }
  return null;
};

/** 整理标题：合并空白，去掉字体里没有的字（比如 Emoji），返回干净的标题与去掉的字。 */
function cleanTitle(stack, title) {
  const missing = [];
  let out = '';
  for (const ch of String(title ?? '').normalize('NFC')) {
    if (/\s/.test(ch)) out += ' ';
    else if (faceOf(stack, ch)) out += ch;
    else missing.push(ch);
  }
  return { text: out.replace(/ {2,}/g, ' ').trim(), missing };
}

/** 按字体分段，排出路径与宽度。 */
function shape(stack, text, opts) {
  const runs = [];
  for (const ch of text) {
    const font = faceOf(stack, ch);
    if (runs.at(-1)?.font === font) runs.at(-1).text += ch;
    else runs.push({ font, text: ch });
  }
  return layoutRuns(runs, opts);
}

/** 切成不可再分的小块，块与块之间才能断行：中文一字一块，拉丁文一词一块，标点按禁则粘在邻字上。 */
function toAtoms(text) {
  const atoms = [];
  let cur = '';
  const flush = () => { if (cur) atoms.push({ text: cur }); cur = ''; };
  const onlyOpening = () => [...cur].every((c) => NO_END.has(c));
  for (const ch of text) {
    if (ch === ' ') { flush(); atoms.push({ text: ' ', space: true }); continue; }
    if (NO_START.has(ch)) {
      if (cur) cur += ch;
      else if (atoms.length && !atoms.at(-1).space) atoms.at(-1).text += ch;
      else cur = ch;
      if (ch === '—' || ch === '–') flush();
      continue;
    }
    if (CJK.test(ch) && !NO_END.has(ch)) {
      if (cur && !onlyOpening()) flush();
      cur += ch;
      flush();
      continue;
    }
    if (NO_END.has(ch) && cur && !onlyOpening()) flush();
    cur += ch;
    if (ch === '-' || ch === '/') flush();
  }
  flush();
  return atoms;
}

/** 放不进一行的长词，拆成一个个字符（等于网页的 overflow-wrap: anywhere）。 */
function splitLongAtoms(atoms, widthOf, maxWidth) {
  return atoms.flatMap((a) => (!a.space && widthOf(a.text) > maxWidth ? [...a.text].map((c) => ({ text: c })) : [a]));
}

/** 断行：先求最少几行，再在这个行数里挑最匀称的断法（等于 text-wrap: balance），偏向在小标题、分句处断。 */
function breakLines(atoms, widthOf, maxWidth) {
  const n = atoms.length;
  const w = atoms.map((a) => widthOf(a.text));
  const prefix = [0];
  for (let i = 0; i < n; i++) prefix.push(prefix[i] + w[i]);
  // 行 [i, j)：行首行尾的空格不算
  const span = (i, j) => {
    while (i < j && atoms[i].space) i++;
    while (j > i && atoms[j - 1].space) j--;
    return [i, j];
  };
  const lineWidth = (i, j) => { const [a, b] = span(i, j); return prefix[b] - prefix[a]; };

  // 贪心得到最少行数
  let lines = 0;
  for (let i = 0; i < n;) {
    let j = i + 1;
    while (j < n && lineWidth(i, j + 1) <= maxWidth) j++;
    lines++;
    i = j;
    while (i < n && atoms[i].space) i++;
  }
  const breakCost = (j) => {
    if (j >= n) return 0;
    if (SEPARATOR.has(atoms[j].text) || SEPARATOR.has(atoms[j + 1]?.text)) return 1; // 分隔符不放行首
    const [a, b] = span(0, j);
    if (a === b) return 0;
    if (GOOD_BREAK_AFTER.test(atoms[b - 1].text)) return -0.3;
    return atoms[j - 1].space || atoms[j].space ? 0 : 0.04;
  };
  const target = lineWidth(0, n) / lines;
  // 动态规划：best[k][j] = 前 j 块排成 k 行的最小代价
  const best = Array.from({ length: lines + 1 }, () => new Array(n + 1).fill(Infinity));
  const from = Array.from({ length: lines + 1 }, () => new Array(n + 1).fill(-1));
  best[0][0] = 0;
  for (let k = 1; k <= lines; k++) {
    for (let j = 1; j <= n; j++) {
      for (let i = k - 1; i < j; i++) {
        if (best[k - 1][i] === Infinity) continue;
        const lw = lineWidth(i, j);
        if (lw > maxWidth || lw === 0) continue;
        const cost = best[k - 1][i] + ((target - lw) / target) ** 2 + breakCost(j);
        if (cost < best[k][j]) { best[k][j] = cost; from[k][j] = i; }
      }
    }
  }
  const cuts = [];
  for (let k = lines, j = n; k > 0; k--) { const i = from[k][j]; cuts.unshift([i, j]); j = i; }
  return cuts.map(([i, j]) => { const [a, b] = span(i, j); return atoms.slice(a, b).map((x) => x.text).join(''); });
}

/** 排不下时：能放几行放几行，最后一行放不下的换成省略号。 */
function truncateLines(atoms, widthOf, maxWidth, maxLines) {
  const out = [];
  let i = 0;
  for (let k = 0; k < maxLines && i < atoms.length; k++) {
    while (i < atoms.length && atoms[i].space) i++;
    let line = '';
    let j = i;
    const room = k === maxLines - 1 ? maxWidth - widthOf(ELLIPSIS) : maxWidth;
    while (j < atoms.length && widthOf((line + atoms[j].text).trimEnd()) <= room) line += atoms[j++].text;
    if (k === maxLines - 1 && j < atoms.length) line = `${line.trimEnd().replace(/[\s，、：；,:;·|｜—–-]+$/u, '')}${ELLIPSIS}`;
    out.push(line.trimEnd());
    i = j;
  }
  return out;
}

/** 选字号、断行。返回 { size, lines, truncated, lineHeight, missing }。 */
export function layoutTitle(template, title) {
  const t = template.title;
  const { text, missing } = cleanTitle(t.stack, title);
  if (!text) return { size: 0, lines: [], truncated: false, lineHeight: 0, missing };
  const lineHeight = CJK.test(text) ? t.lineHeight.cjk : t.lineHeight.latin;
  const widths = new Map();
  const fit = (size) => {
    const widthOf = (s) => {
      const key = `${size}|${s}`;
      if (!widths.has(key)) widths.set(key, shape(t.stack, s, { size }).width);
      return widths.get(key);
    };
    return { widthOf, atoms: splitLongAtoms(toAtoms(text), widthOf, t.maxWidth) };
  };
  for (const { size, maxLines } of t.sizes) {
    const { widthOf, atoms } = fit(size);
    const lines = breakLines(atoms, widthOf, t.maxWidth);
    if (lines.length <= maxLines) return { size, lines, truncated: false, lineHeight, missing };
  }
  const { size, maxLines } = t.sizes.at(-1);
  const { widthOf, atoms } = fit(size);
  return { size, lines: truncateLines(atoms, widthOf, t.maxWidth, maxLines), truncated: true, lineHeight, missing };
}

/** 标题 → 完整的 SVG。标题里没有一个能排的字时不排标题，只留底图与字标。 */
export function renderCardSvg(template, title) {
  const t = template.title;
  const layout = layoutTitle(template, title);
  const { size, lines, lineHeight } = layout;
  const step = size * lineHeight;
  const firstBaseline = t.baseline - step * (lines.length - 1);
  const shaped = lines.map((line, i) => shape(t.stack, line, { size, x: t.x, y: firstBaseline + step * i }));
  const paths = shaped.map((l) => l.d);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${template.width} ${template.height}">`,
    `<rect width="${template.width}" height="${template.height}" fill="${template.background}"/>`,
    template.base,
    template.lockup,
    ...(paths.length ? [`<path d="${paths.join('')}" fill="${t.color}"/>`] : []),
    '</svg>',
  ].join('\n');
  return { svg, layout, lineWidths: shaped.map((l) => l.width) };
}

let wasmReady;

/** 标题 → PNG 字节。同一个标题、同一份模板与依赖，两次结果逐字节一致。 */
export async function renderCardPng(template, title) {
  wasmReady ??= initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
  await wasmReady;
  const resvg = new Resvg(renderCardSvg(template, title).svg, { fitTo: { mode: 'width', value: template.width } });
  const image = resvg.render();
  const png = image.asPng();
  image.free();
  resvg.free();
  return png;
}

/** 放进文件名的短哈希：标题或模板版本变了就变。 */
export const cardKey = (template, title) => createHash('sha256').update(`${template.version}\n${title}`).digest('hex').slice(0, 8);
