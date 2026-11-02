// 作品水印的生成模块：给一张图，按模板（方案的 marks/watermark/template.json）在角落加一个小标记，输出同格式、同尺寸的新图。
// 同步到消费方，在消费方运行；只依赖 sharp。不改原文件，不保留 EXIF（包括拍摄地点），保留色彩配置。
//
//   watermarkImage(template, input, { corner })  → { data, info } 或 { skipped: 原因 }
//     input   文件路径或 Buffer
//     corner  auto（默认）、bottom-right、bottom-left
//     info    { format, width, height, corner, rect, ink, mean, bytes, quality }；mean 是水印所在区域的平均灰度（0–255）
//   watermarkFile(template, src, dest, { corner })  → info 或 { skipped: 原因 }：读 src，写 dest；src 不动
//
// 模板的字段：
//   version                 模板的版本
//   art, viewBox            标记的 SVG 片段（颜色写 currentColor）与它的取景框
//   heightRatio, minHeight  标记高度 = 短边 × heightRatio，不小于 minHeight 像素
//   marginRatio             到画面边缘的距离 = 短边 × marginRatio
//   minShortSide            短边比这还小就不加（缩略图、小图）
//   ink.onLight, ink.onDark 亮处用的深色、暗处用的浅色，都来自方案的 token
//   opacity                 标记的不透明度
//   halo                    { opacity, blurRatio }：垫在标记下面的一层反色柔光，在杂乱的画面上也认得出
//   busyBias                auto 时默认放右下角；右下角的杂乱度超过左下角这么多倍才换到左下角
//   maxBytes, quality       体积上限；quality 从高到低试，取第一个不超限的
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const FORMATS = new Set(['jpeg', 'png', 'webp']);

/** sRGB 灰度（0–255）→ 相对亮度 Y（0–1）。 */
const linear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const hexY = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** 量一块区域：平均灰度与杂乱度（相邻像素差的平均值）。 */
async function measure(input, rect) {
  const { data, info } = await sharp(input, { autoOrient: true }).extract(rect).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0, diff = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const v = data[y * info.width + x];
      sum += v;
      if (x + 1 < info.width) diff += Math.abs(v - data[y * info.width + x + 1]);
      if (y + 1 < info.height) diff += Math.abs(v - data[(y + 1) * info.width + x]);
    }
  }
  return { mean: sum / data.length, busy: diff / (2 * data.length) };
}

function overlaySvg(template, { width, height, ink, halo, blur }) {
  const [vx, vy, vw, vh] = template.viewBox;
  const art = (color) => template.art.replaceAll('currentColor', color);
  return Buffer.from([
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${vx} ${vy} ${vw} ${vh}">`,
    `<defs><filter id="h" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>`,
    `<g opacity="${template.halo.opacity}" filter="url(#h)">${art(halo)}</g>`,
    `<g opacity="${template.opacity}">${art(ink)}</g>`,
    '</svg>',
  ].join(''));
}

/** 从高到低试质量，取第一个不超限的。PNG 无损，超限时才退到调色板。 */
async function encode(pipeline, format, template) {
  const q = format === 'png' ? [null, 'palette'] : template.quality;
  let out;
  for (const quality of q) {
    const p = pipeline.clone().keepIccProfile();
    if (format === 'jpeg') p.jpeg({ quality, chromaSubsampling: '4:4:4' });
    else if (format === 'webp') p.webp({ quality });
    else p.png({ compressionLevel: 9, palette: quality === 'palette' });
    out = { data: await p.toBuffer(), quality };
    if (out.data.length <= template.maxBytes) return out;
  }
  throw new Error(`加水印后超过 ${(template.maxBytes / 1048576).toFixed(1)} MB（${(out.data.length / 1048576).toFixed(2)} MB）`);
}

/** 给一张图加水印。不支持的格式与太小的图返回 { skipped }，不算出错。 */
export async function watermarkImage(template, input, { corner = 'auto' } = {}) {
  const meta = await sharp(input, { autoOrient: true }).metadata();
  const { format } = meta;
  const { width, height } = meta.autoOrient ?? meta;
  if (!FORMATS.has(format)) return { skipped: `不支持 ${format}（只处理 JPEG、PNG、WebP）` };
  if ((meta.pages ?? 1) > 1) return { skipped: '动图不处理' };
  const short = Math.min(width, height);
  if (short < template.minShortSide) return { skipped: `太小（短边 ${short}px，要求 ≥ ${template.minShortSide}px）` };

  const [, , vw, vh] = template.viewBox;
  const markH = Math.max(template.minHeight, Math.round(short * template.heightRatio));
  const markW = Math.round((vw / vh) * markH);
  const margin = Math.round(short * template.marginRatio);
  const rects = {
    'bottom-right': { left: width - markW - margin, top: height - markH - margin, width: markW, height: markH },
    'bottom-left': { left: margin, top: height - markH - margin, width: markW, height: markH },
  };
  if (!rects[corner] && corner !== 'auto') throw new Error(`不认识的位置：${corner}`);

  const right = await measure(input, rects['bottom-right']);
  const left = await measure(input, rects['bottom-left']);
  const chosen = corner !== 'auto' ? corner : right.busy > left.busy * template.busyBias && right.busy - left.busy > 4 ? 'bottom-left' : 'bottom-right';
  const here = chosen === 'bottom-left' ? left : right;

  // 取色：局部亮度上，哪种墨对比度高就用哪种
  const Y = linear(here.mean);
  const { onLight, onDark } = template.ink;
  const useDark = contrast(Y, hexY(onLight)) >= contrast(Y, hexY(onDark));
  const ink = useDark ? onLight : onDark;
  const halo = useDark ? onDark : onLight;

  const overlay = overlaySvg(template, { width: markW, height: markH, ink, halo, blur: +(vh * template.halo.blurRatio).toFixed(2) });
  const pipeline = sharp(input, { autoOrient: true }).composite([{ input: overlay, left: rects[chosen].left, top: rects[chosen].top }]);
  const { data, quality } = await encode(pipeline, format, template);
  return { data, info: { format, width, height, corner: chosen, rect: rects[chosen], ink, mean: +here.mean.toFixed(1), bytes: data.length, quality } };
}

/** 读一个文件，把带水印的版本写到另一个文件。src 与 dest 不能是同一个文件，原图不动。 */
export async function watermarkFile(template, src, dest, options) {
  if (path.resolve(src) === path.resolve(dest)) throw new Error('输出不能覆盖原图');
  const result = await watermarkImage(template, src, options);
  if (result.skipped) return result;
  await writeFile(dest, result.data);
  return result.info;
}
