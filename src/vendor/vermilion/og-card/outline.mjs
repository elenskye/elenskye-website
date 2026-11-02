// 文字转曲线：fontsource 包按 unicode-range 拆成多个文件，按字符取对应的那个，再用 fontkit 排字。
// 排法与浏览器排 SVG <text> 一致：连续落在同一个字体文件里的字一起排（带 GPOS 字偶距），每个字后面再加字距；
// 字距不为 0 时和浏览器一样不用连字。
// tooling/marks/derive.mjs 与 card.mjs 共用；card.mjs 会同步到消费方，所以这里只依赖 fontkit 与 Node 自带模块。
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import * as fontkit from 'fontkit';

const require = createRequire(import.meta.url);

const faceCache = new Map();
const parsed = new Map();

function faces(pkg, weight) {
  const key = `${pkg}@${weight}`;
  if (!faceCache.has(key)) {
    const dir = path.dirname(require.resolve(`${pkg}/package.json`));
    const css = readFileSync(path.join(dir, `${weight}.css`), 'utf8');
    faceCache.set(key, [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => ({
      file: path.join(dir, 'files', body.match(/url\(\.\/files\/([^)]+\.woff)\)/)[1]),
      ranges: body.match(/unicode-range:\s*([^;]+);/)[1].split(',').map((r) => {
        const [a, b] = r.trim().slice(2).split('-');
        return [parseInt(a, 16), parseInt(b ?? a, 16)];
      }),
    })));
  }
  return faceCache.get(key);
}

/** 这个字该用哪个字体文件；字体没有这个字时返回 null。 */
export function findFont(pkg, weight, ch) {
  const cp = ch.codePointAt(0);
  const face = faces(pkg, weight).find((f) => f.ranges.some(([a, b]) => cp >= a && cp <= b));
  if (!face) return null;
  if (!parsed.has(face.file)) parsed.set(face.file, fontkit.create(readFileSync(face.file)));
  const font = parsed.get(face.file);
  return font.hasGlyphForCodePoint(cp) ? font : null;
}

/**
 * 把一串 { font, text } 排到一条基线上，返回路径与宽度。
 * text 已按字体分好段；x、y 是起点与基线。
 */
export function layoutRuns(runs, { size, x = 0, y = 0, letterSpacing = 0 }) {
  const features = letterSpacing ? { liga: false, clig: false } : undefined;
  let cx = x;
  const parts = [];
  for (const { font, text } of runs) {
    const s = size / font.unitsPerEm;
    const { glyphs, positions } = font.layout(text, features);
    glyphs.forEach((g, i) => {
      const p = positions[i];
      const d = g.path.scale(s, -s).translate(cx + p.xOffset * s, y - p.yOffset * s).toSVG();
      if (d) parts.push(d);
      cx += p.xAdvance * s + letterSpacing;
    });
  }
  return { d: parts.join(''), width: cx - x };
}

/** 一行文字 → 路径，只用一个字体包。字体没有的字直接报错（资产里不该缺字）。 */
export function textToPath(text, { pkg, weight, size, x, y, letterSpacing = 0 }) {
  const runs = [];
  for (const ch of text) {
    const font = findFont(pkg, weight, ch);
    if (!font) throw new Error(`${pkg} ${weight} 没有字符「${ch}」`);
    if (runs.at(-1)?.font === font) runs.at(-1).text += ch;
    else runs.push({ font, text: ch });
  }
  return layoutRuns(runs, { size, x, y, letterSpacing }).d;
}
