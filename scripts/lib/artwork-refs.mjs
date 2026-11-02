import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The images that get the artwork watermark: the `gallery` rows of Wander works
 * and the About page's artwork slot. Covers, body images, portraits and
 * third-party photos are left alone.
 *
 * Returns paths relative to public/ (and therefore to dist/). Tolerates
 * half-filled rows the same way the content schema does.
 */
export async function listArtworkFiles(root) {
  const refs = new Set();
  const wander = join(root, 'src/content/wander');
  for (const file of await readdir(wander)) {
    if (!file.endsWith('.md')) continue;
    const text = await readFile(join(wander, file), 'utf8');
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    for (const match of frontmatter.matchAll(/^\s*-?\s*imageRef:\s*(.+?)\s*$/gm)) {
      refs.add(match[1].replace(/^['"]|['"]$/g, ''));
    }
  }
  const about = JSON.parse(await readFile(join(root, 'src/data/about-images.json'), 'utf8'));
  for (const ref of about.artworkRefs ?? []) refs.add(ref);
  return [...refs]
    .filter((ref) => ref?.startsWith('public/'))
    .map((ref) => ref.slice('public/'.length))
    .sort();
}
