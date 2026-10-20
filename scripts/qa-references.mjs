import { access, readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const wanderDirectory = join(root, 'src/content/wander');
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

async function assertLocalPath(source, value) {
  if (!value || !value.startsWith('public/')) return;
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
  await assertLocalPath(file, record?.asset?.value?.file);
}

for (const file of await filesIn(join(root, 'src/data/assets/documents'))) {
  if (extname(file) !== '.json') continue;
  const record = JSON.parse(await readFile(file, 'utf8'));
  await assertLocalPath(file, record?.asset?.value?.file);
}

for (const file of await filesIn(wanderDirectory)) {
  if (extname(file) !== '.md') continue;
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/^thumbnailRef:\s*["']?([^"'\n]+)["']?\s*$/gm)) {
    await assertLocalPath(file, match[1].trim());
  }
  for (const match of source.matchAll(/\{%\s*sharedImage\b[\s\S]*?\bimage=(?:"([^"]+)"|'([^']+)')[\s\S]*?\/%\}/g)) {
    const slug = match[1] ?? match[2];
    if (!imageSlugs.has(slug)) {
      errors.push(`${relative(root, file)}: shared image resource "${slug}" is not registered`);
    }
  }
}

for (const file of [
  join(root, 'src/content/career/zh.md'),
  join(root, 'src/content/career/en.md'),
]) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/^\s*fileRef:\s*["']?([^"'\n]+)["']?\s*$/gm)) {
    await assertLocalPath(file, match[1].trim());
  }
}

const aboutImagesPath = join(root, 'src/data/about-images.json');
const aboutImages = JSON.parse(await readFile(aboutImagesPath, 'utf8'));
for (const value of [...(aboutImages.portraitRefs ?? []), ...(aboutImages.artworkRefs ?? [])]) {
  await assertLocalPath(aboutImagesPath, value);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Reference QA passed: optional paths resolve and shared-image relationships are registered');
}
