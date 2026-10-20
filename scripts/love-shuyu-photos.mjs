// 把 /love-shuyu/ 时间线的原始照片压到仓库上限内。
//
// 用法：把原图（任意文件名，扩展名 jpg/jpeg/png/heic/webp）放进
//   public/love-shuyu/photos/_incoming/
// 文件名以节点 ID 开头即可，例如 `03.jpeg`、`03-西湖.HEIC`。然后运行：
//   node scripts/love-shuyu-photos.mjs
// 输出写到 public/love-shuyu/photos/<id>.<ext>。SVG 占位图保留为可恢复备份，
// 等站主单独审核资源删除预览后才能删除。
//
// 零新增依赖：优先用系统已装的 cwebp 输出 WebP；没有就回退到 macOS 内置的
// sips 输出 JPEG。两条路径都保留原始比例，只在需要时缩小长边。
//
// 这个脚本只在本地跑，不进 npm run qa，也不参与构建。

import { execFile } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

const photosDir = fileURLToPath(new URL('../public/love-shuyu/photos/', import.meta.url));
const incomingDir = join(photosDir, '_incoming');

// 和 scripts/audit-assets.mjs 的图片上限保持一致。留 5% 余量，避免卡在边界上。
const maxBytes = 1.5 * 1024 * 1024;
const targetBytes = Math.floor(maxBytes * 0.95);

// 逐档缩小长边并降质量，直到进入预算。
const longEdgeSteps = [2560, 2048, 1600, 1280, 1024];
const qualitySteps = [82, 74, 66, 58, 50];

const has = async (command) => {
  try {
    await run('which', [command]);
    return true;
  } catch {
    return false;
  }
};

const encodeWebp = async (source, destination, longEdge, quality) => {
  await run('cwebp', ['-quiet', '-q', String(quality), '-resize', String(longEdge), '0', source, '-o', destination]);
};

const encodeJpeg = async (source, destination, longEdge, quality) => {
  // sips 的 --resampleHeightWidthMax 按长边等比缩放，不裁切。
  await run('sips', [
    '-s', 'format', 'jpeg',
    '-s', 'formatOptions', String(quality),
    '--resampleHeightWidthMax', String(longEdge),
    source,
    '--out', destination,
  ]);
};

const main = async () => {
  await mkdir(incomingDir, { recursive: true });

  const entries = (await readdir(incomingDir)).filter((name) => !name.startsWith('.'));
  if (entries.length === 0) {
    console.log(`没有待处理的照片。把原图放进 ${incomingDir} 后再运行。`);
    return;
  }

  const useWebp = await has('cwebp');
  const useSips = await has('sips');
  if (!useWebp && !useSips) {
    console.error('找不到 cwebp，也找不到 sips；无法压缩。请先安装 cwebp（brew install webp）。');
    process.exitCode = 1;
    return;
  }

  const extension = useWebp ? '.webp' : '.jpg';
  console.log(`编码器：${useWebp ? 'cwebp → .webp' : 'sips → .jpg'}\n`);

  for (const name of entries.sort()) {
    const source = join(incomingDir, name);
    const id = basename(name, extname(name)).split(/[-_ ]/)[0];
    if (!/^\d{2}$/.test(id)) {
      console.error(`跳过 ${name}：文件名必须以两位节点 ID 开头，例如 03.jpeg`);
      process.exitCode = 1;
      continue;
    }

    const destination = join(photosDir, `${id}${extension}`);
    let written = null;

    // longEdge 外层、quality 内层：优先保住尺寸，不够再降质量。
    outer: for (const longEdge of longEdgeSteps) {
      for (const quality of qualitySteps) {
        if (useWebp) await encodeWebp(source, destination, longEdge, quality);
        else await encodeJpeg(source, destination, longEdge, quality);

        const { size } = await stat(destination);
        if (size <= targetBytes) {
          written = { longEdge, quality, size };
          break outer;
        }
      }
    }

    if (!written) {
      console.error(`${name}：压到最低档仍超过 1.5 MB，请先手工缩小原图。`);
      process.exitCode = 1;
      continue;
    }

    const mb = (written.size / 1024 / 1024).toFixed(2);
    console.log(`${id}  ←  ${name}   ${mb} MB   长边 ${written.longEdge}  质量 ${written.quality}`);
  }

  console.log('\n完成。记得把 src/data/love-shuyu-timeline.ts 里对应节点的 photo 扩展名改成 ' + extension);
};

await main();
