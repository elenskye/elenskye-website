/**
 * Artwork watermark (Vermilion `watermark`, synced from visual-assets).
 *
 *   npm run watermark -- <image…> [--corner bottom-left]
 *     One image in, one watermarked image out, next to the original as
 *     <name>-watermarked.<ext>. The original is never touched. For trying the
 *     watermark on your own work; nothing here writes into the repository.
 *
 *   npm run watermark:dist
 *     Runs inside `npm run build`, after Astro. Replaces the artwork in dist/
 *     (see lib/artwork-refs.mjs) with a watermarked copy. It always starts from
 *     the original in public/, which stays clean, so running it twice is safe
 *     and a style change only needs a rebuild.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { watermarkFile, watermarkImage } from '../src/vendor/vermilion/watermark/watermark.mjs';
import { listArtworkFiles } from './lib/artwork-refs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const template = JSON.parse(await readFile(join(root, 'src/vendor/vermilion/watermark/template.json'), 'utf8'));
const args = process.argv.slice(2);

async function watermarkDist() {
  const files = await listArtworkFiles(root);
  let marked = 0;
  for (const rel of files) {
    // One unusual image must not stop every other page from publishing: it
    // ships as it is, and the build log and qa-build.mjs say so.
    try {
      const result = await watermarkImage(template, join(root, 'public', rel));
      if (result.skipped) {
        console.warn(`Watermark skipped ${rel}: ${result.skipped}`);
        continue;
      }
      await writeFile(join(root, 'dist', rel), result.data);
      marked += 1;
    } catch (error) {
      console.warn(`Watermark failed on ${rel}: ${error.message}`);
    }
  }
  console.log(`Watermark: ${marked} of ${files.length} artwork images`);
}

async function watermarkOne(src, corner) {
  const ext = extname(src);
  const dest = join(dirname(src), `${basename(src, ext)}-watermarked${ext}`);
  const info = await watermarkFile(template, src, dest, { corner });
  if (info.skipped) {
    console.log(`${basename(src)}：没有加（${info.skipped}）`);
    return;
  }
  const where = info.corner === 'bottom-left' ? '左下' : '右下';
  const ink = info.ink === template.ink.onLight ? '深色' : '浅色';
  console.log(`${basename(src)} → ${dest}（${where}，${ink}，${(info.bytes / 1048576).toFixed(2)} MB）`);
}

if (args.includes('--dist')) {
  await watermarkDist();
} else {
  const corner = args.includes('--corner') ? args[args.indexOf('--corner') + 1] : undefined;
  const files = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--corner');
  if (files.length === 0) {
    console.log('用法：npm run watermark -- <图片…> [--corner bottom-left]');
    process.exit(1);
  }
  for (const file of files) {
    await watermarkOne(resolve(file), corner).catch((error) => {
      console.error(`${basename(file)}：没有加（${error.message}）`);
      process.exitCode = 1;
    });
  }
}
