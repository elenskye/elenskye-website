// 把站主提供的 love-memory 原图统一转换成照片流专用网页副本。
//
// 用法：
//   node scripts/love-memory-photos.mjs /absolute/path/to/love-memory
//
// 输出：public/love-shuyu/memories/01.jpg ...
// - 原目录不改动；
// - 全部统一为 JPEG，长边最多 1280px，不裁切、不拉伸；
// - 优先统一质量 76，只有超过 1.5 MB 的单图才按同一档位表继续压缩；
// - 不自动删除输出目录里的任何旧文件，遵守项目资源删除护栏。

import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const sourceDir = process.argv[2] ? resolve(process.argv[2]) : '';
const outputDir = fileURLToPath(new URL('../public/love-shuyu/memories/', import.meta.url));
const accepted = new Set(['.heic', '.heif', '.jpg', '.jpeg', '.png']);
const maxBytes = 1.5 * 1024 * 1024;
const targetBytes = Math.floor(maxBytes * 0.95);
const encodeSteps = [
  { longEdge: 1280, quality: 76 },
  { longEdge: 1280, quality: 68 },
  { longEdge: 1100, quality: 64 },
  { longEdge: 960, quality: 60 },
];

if (!sourceDir) {
  console.error('请传入 love-memory 原图目录的绝对路径。');
  process.exit(1);
}

const encode = async (source, destination, { longEdge, quality }) => {
  await run('sips', [
    '-s', 'format', 'jpeg',
    '-s', 'formatOptions', String(quality),
    '--resampleHeightWidthMax', String(longEdge),
    source,
    '--out', destination,
  ]);
};

/**
 * sips 会把部分 iPhone HDR / gain-map 照片直接解成黑图。先由 Quick Look
 * 生成保持方向和色调映射的 PNG，再交给 sips 做统一网页编码。
 */
const renderPreviews = async (sources) => {
  const previewDir = await mkdtemp(join(tmpdir(), 'love-memory-previews-'));
  try {
    await run(
      'qlmanage',
      ['-t', '-s', '1920', '-o', previewDir, ...sources],
      { maxBuffer: 16 * 1024 * 1024 },
    );

    for (const source of sources) {
      await access(join(previewDir, `${basename(source)}.png`));
    }
    return previewDir;
  } catch (error) {
    await rm(previewDir, { recursive: true, force: true });
    throw error;
  }
};

const inspect = async (path) => {
  const { stdout } = await run('sips', ['-g', 'format', '-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'orientation', path]);
  const value = (name) => stdout.match(new RegExp(`${name}:\\s*([^\\n]+)`))?.[1]?.trim() ?? '';
  return {
    format: value('format'),
    width: Number(value('pixelWidth')),
    height: Number(value('pixelHeight')),
    orientation: value('orientation'),
  };
};

await mkdir(outputDir, { recursive: true });
const entries = (await readdir(sourceDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && accepted.has(extname(entry.name).toLowerCase()))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));

if (entries.length === 0) {
  console.error(`没有在 ${sourceDir} 找到可处理的照片。`);
  process.exit(1);
}

console.log(`共 ${entries.length} 张照片 → ${outputDir}\n`);

const sources = entries.map((name) => join(sourceDir, name));
const previewDir = await renderPreviews(sources);

try {
  for (const [index, name] of entries.entries()) {
    const source = join(previewDir, `${name}.png`);
    const id = String(index + 1).padStart(2, '0');
    const destination = join(outputDir, `${id}.jpg`);
    let result = null;

    for (const step of encodeSteps) {
      await encode(source, destination, step);
      const { size } = await stat(destination);
      if (size <= targetBytes) {
        result = { ...step, size };
        break;
      }
    }

    if (!result) {
      console.error(`${name}：压到最低档仍超过 1.5 MB。`);
      process.exitCode = 1;
      continue;
    }

    const metadata = await inspect(destination);
    const validDimensions =
      Number.isFinite(metadata.width) &&
      Number.isFinite(metadata.height) &&
      metadata.width > 0 &&
      metadata.height > 0 &&
      Math.max(metadata.width, metadata.height) <= result.longEdge;
    if (metadata.format !== 'jpeg' || !validDimensions || result.size > maxBytes) {
      console.error(`${name}：输出 QA 失败（${JSON.stringify({ ...metadata, size: result.size })}）。`);
      process.exitCode = 1;
      continue;
    }

    const kb = Math.round(result.size / 1024);
    console.log(
      `${id}.jpg  ←  ${name}  ${metadata.width}×${metadata.height}  ${kb} KB  Q${result.quality}`,
    );
  }
} finally {
  await rm(previewDir, { recursive: true, force: true });
}

if (!process.exitCode) console.log('\n照片流素材转换与逐张 QA 完成。');
