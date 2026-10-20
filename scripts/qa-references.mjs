import { access, readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Content refers only to files of the library (public/assets/images, public/assets/documents; registered,
// see audit-assets.mjs): covers, gallery images, body images, résumés and About pictures.
const root = fileURLToPath(new URL('../', import.meta.url));
const contentDirectory = join(root, 'src/content');
const imageRegistryDirectory = join(root, 'src/data/assets/images');
const errors = [];

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : path;
  }));
  return nested.flat();
}

async function assertLibraryFile(source, value, folder) {
  if (!value.startsWith(`public/${folder}/`)) {
    errors.push(`${relative(root, source)}: ${value} is not in public/${folder}/`);
    return;
  }
  try {
    await access(join(root, value));
  } catch {
    errors.push(`${relative(root, source)}: missing referenced file ${value}`);
  }
}

const imageSlugs = new Set();
for (const file of await filesIn(imageRegistryDirectory)) {
  if (extname(file) !== '.json') continue;
  const record = JSON.parse(await readFile(file, 'utf8'));
  if (record.title) imageSlugs.add(record.title);
}

for (const file of await filesIn(contentDirectory)) {
  if (extname(file) !== '.md') continue;
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/^\s*(?:-\s+)?(?:thumbnailRef|imageRef):\s*["']?([^"'\n]+)["']?\s*$/gm)) {
    await assertLibraryFile(file, match[1].trim(), 'assets/images');
  }
  for (const match of source.matchAll(/^\s*(?:-\s+)?fileRef:\s*["']?([^"'\n]+)["']?\s*$/gm)) {
    await assertLibraryFile(file, match[1].trim(), 'assets/documents');
  }
  // body images on this site: ![alt](/assets/images/…)
  for (const match of source.matchAll(/!\[[^\]]*\]\((\/[^)\s]+)/g)) {
    await assertLibraryFile(file, `public${match[1]}`, 'assets/images');
  }
  for (const match of source.matchAll(/\{%\s*sharedImage\b[\s\S]*?\bimage=(?:"([^"]+)"|'([^']+)')[\s\S]*?\/%\}/g)) {
    const slug = match[1] ?? match[2];
    if (!imageSlugs.has(slug)) {
      errors.push(`${relative(root, file)}: shared image resource "${slug}" is not registered`);
    }
  }
}

const aboutImagesPath = join(root, 'src/data/about-images.json');
const aboutImages = JSON.parse(await readFile(aboutImagesPath, 'utf8'));
for (const value of [...(aboutImages.portraitRefs ?? []), ...(aboutImages.artworkRefs ?? [])]) {
  await assertLibraryFile(aboutImagesPath, value, 'assets/images');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Reference QA passed: content refers only to library files, and they all exist');
}
