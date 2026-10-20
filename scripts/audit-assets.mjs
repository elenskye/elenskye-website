import { createHash } from 'node:crypto';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
// The library: every content file lives in public/assets/{images,documents} and is registered once in
// src/data/assets/{images,documents}; content refers to nothing else (qa-references.mjs).
const library = [
  { registry: fileURLToPath(new URL('../src/data/assets/images/', import.meta.url)), folder: 'assets/images' },
  { registry: fileURLToPath(new URL('../src/data/assets/documents/', import.meta.url)), folder: 'assets/documents' },
];
const imageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const maxImageBytes = 1.5 * 1024 * 1024;
const maxDocumentBytes = 5 * 1024 * 1024;

async function walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : path;
    })
  );
  return files.flat();
}

const files = (await walk(root)).filter((file) => !file.endsWith('.DS_Store'));
const byHash = new Map();
let totalBytes = 0;
const oversizedFiles = [];
let largestImage;

for (const file of files) {
  const [buffer, info] = await Promise.all([readFile(file), stat(file)]);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const paths = byHash.get(hash) ?? [];
  paths.push(relative(root, file));
  byHash.set(hash, paths);
  totalBytes += info.size;
  const path = relative(root, file);
  const isImage = imageExtensions.has(extname(file).toLowerCase());
  const limit = isImage ? maxImageBytes : maxDocumentBytes;
  if (info.size > limit) oversizedFiles.push({ file: path, size: info.size, limit });
  if (isImage && (!largestImage || info.size > largestImage.size)) {
    largestImage = { file: path, size: info.size };
  }
}

const duplicates = [...byHash.values()].filter((paths) => paths.length > 1);
const missingRegistrations = [];
const registrationsByFile = new Map();

for (const { registry, folder } of library) {
  for (const registryFile of await walk(registry)) {
    if (extname(registryFile) !== '.json') continue;
    const record = JSON.parse(await readFile(registryFile, 'utf8'));
    const stored = record.asset?.value?.file;
    if (!stored) {
      missingRegistrations.push(`${relative(projectRoot, registryFile)}: 未登记实际文件`);
      continue;
    }
    if (!stored.startsWith(`public/${folder}/`)) {
      missingRegistrations.push(`${relative(projectRoot, registryFile)}: 文件不在 public/${folder}/ 里（${stored}）`);
      continue;
    }
    const target = resolve(projectRoot, stored);
    try {
      await access(target);
    } catch {
      missingRegistrations.push(
        `${relative(projectRoot, registryFile)}: 找不到 ${relative(projectRoot, target)}`
      );
    }
    const registrations = registrationsByFile.get(target) ?? [];
    registrations.push(relative(projectRoot, registryFile));
    registrationsByFile.set(target, registrations);
  }
}

const duplicateRegistrations = [...registrationsByFile.values()].filter((paths) => paths.length > 1);
const unregisteredFiles = [];
for (const { folder } of library) {
  for (const file of await walk(join(root, folder))) {
    if (!file.endsWith('.DS_Store') && !registrationsByFile.has(file)) unregisteredFiles.push(relative(root, file));
  }
}
console.log(`Assets: ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
if (largestImage) {
  console.log(`Largest image: ${(largestImage.size / 1024 / 1024).toFixed(1)} MB  ${largestImage.file}`);
}

if (oversizedFiles.length) {
  console.error('Oversized assets found:');
  for (const item of oversizedFiles.sort((a, b) => b.size - a.size)) {
    console.error(
      `- ${(item.size / 1024 / 1024).toFixed(1)} MB  ${item.file} (limit ${(item.limit / 1024 / 1024).toFixed(1)} MB)`
    );
  }
  process.exitCode = 1;
} else {
  console.log('Oversized assets: none (images ≤1.5 MB; other files ≤5 MB)');
}

if (duplicates.length) {
  console.error('Exact duplicate assets found:');
  for (const paths of duplicates) console.error(`- ${paths.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Exact duplicate assets: none');
}

if (missingRegistrations.length) {
  console.error('Broken resource registrations found:');
  for (const item of missingRegistrations) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log(`Resource registrations: ${registrationsByFile.size} valid`);
}

if (unregisteredFiles.length) {
  console.error('Library files without a registration:');
  for (const file of unregisteredFiles) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log('Unregistered library files: none');
}

if (duplicateRegistrations.length) {
  console.error('Multiple resource registrations point to the same file:');
  for (const paths of duplicateRegistrations) console.error(`- ${paths.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Duplicate resource registrations: none');
}
