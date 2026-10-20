import { createHash } from 'node:crypto';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const registryDirectories = [
  fileURLToPath(new URL('../src/data/assets/images/', import.meta.url)),
  fileURLToPath(new URL('../src/data/assets/documents/', import.meta.url)),
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

for (const directory of registryDirectories) {
  for (const registryFile of await walk(directory)) {
    if (extname(registryFile) !== '.json') continue;
    const record = JSON.parse(await readFile(registryFile, 'utf8'));
    const stored = record.asset?.value?.file;
    if (!stored) {
      missingRegistrations.push(`${relative(projectRoot, registryFile)}: 未登记实际文件`);
      continue;
    }
    let target;
    if (stored.startsWith('public/')) target = resolve(projectRoot, stored);
    else if (stored.startsWith('/')) target = join(root, stored.slice(1));
    else {
      const directoryName = record.asset.discriminant === 'image' ? 'assets/images' : 'assets/documents';
      target = join(root, directoryName, stored);
    }
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

if (duplicateRegistrations.length) {
  console.error('Multiple resource registrations point to the same file:');
  for (const paths of duplicateRegistrations) console.error(`- ${paths.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Duplicate resource registrations: none');
}
