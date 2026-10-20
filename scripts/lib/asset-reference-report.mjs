import { access, readFile, readdir } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

const registryRoots = [
  { kind: 'image', directory: join(projectRoot, 'src/data/assets/images') },
  { kind: 'document', directory: join(projectRoot, 'src/data/assets/documents') },
];
const scanRoots = [join(projectRoot, 'src'), join(projectRoot, 'public')];
const rootFiles = ['astro.config.mjs', 'keystatic.config.ts', 'vercel.json'].map((file) =>
  join(projectRoot, file)
);
const textExtensions = new Set([
  '.astro',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mdx',
  '.mjs',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
]);

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

function physicalAssetFile(record) {
  const stored = record.asset?.value?.file;
  if (!stored) return undefined;
  if (stored.startsWith('public/')) return resolve(projectRoot, stored);
  if (stored.startsWith('/')) return join(projectRoot, 'public', stored.slice(1));
  const directory = record.asset.discriminant === 'image' ? 'assets/images' : 'assets/documents';
  return join(projectRoot, 'public', directory, stored);
}

export async function loadAssetRecords() {
  const records = [];
  for (const registry of registryRoots) {
    for (const filepath of await walk(registry.directory)) {
      if (extname(filepath) !== '.json') continue;
      const data = JSON.parse(await readFile(filepath, 'utf8'));
      records.push({
        kind: registry.kind,
        slug: data.title || basename(filepath, '.json'),
        filepath,
        data,
        physicalFile: physicalAssetFile(data),
      });
    }
  }
  return records;
}

function publicReferences(physicalFile) {
  if (!physicalFile) return [];
  const publicRoot = join(projectRoot, 'public');
  const insidePublic = relative(publicRoot, physicalFile);
  if (insidePublic.startsWith('..')) return [];
  const posixPath = insidePublic.split('\\').join('/');
  return [`public/${posixPath}`, `/${posixPath}`];
}

async function searchableFiles() {
  const nested = (await Promise.all(scanRoots.map(walk))).flat();
  const candidates = [...nested, ...rootFiles];
  const output = [];
  for (const file of candidates) {
    if (!textExtensions.has(extname(file).toLowerCase())) continue;
    try {
      await access(file);
      output.push(file);
    } catch {
      // Optional root files may not exist in every checkout.
    }
  }
  return output;
}

function imageRole(line) {
  return /^\s*thumbnail(?:Ref)?\s*:/.test(line) ? 'Cover' : 'Body';
}

export async function createReferenceReport(record) {
  const direct = publicReferences(record.physicalFile);
  const escapedSlug = record.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sharedTag = new RegExp(`\\{%\\s*sharedImage\\b[^%]*\\bimage=["']${escapedSlug}["']`);
  const citations = new Map();

  for (const file of await searchableFiles()) {
    if (file === record.filepath) continue;
    const text = await readFile(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const isSharedReference = record.kind === 'image' && sharedTag.test(line);
      const isDirectReference = direct.some((needle) => line.includes(needle));
      if (!isSharedReference && !isDirectReference) continue;

      const path = relative(projectRoot, file).split('\\').join('/');
      const role = record.kind === 'image' ? imageRole(line) : undefined;
      citations.set(`${path}:${role ?? ''}`, { path, role });
    }
  }

  return {
    kind: record.kind,
    slug: record.slug,
    log: relative(projectRoot, record.filepath).split('\\').join('/'),
    act: record.physicalFile
      ? relative(projectRoot, record.physicalFile).split('\\').join('/')
      : '(missing)',
    citations: [...citations.values()].sort((a, b) => {
      const byPath = a.path.localeCompare(b.path, 'en');
      if (byPath !== 0) return byPath;
      return (a.role ?? '').localeCompare(b.role ?? '', 'en');
    }),
  };
}

export function formatReferenceReport(report) {
  const lines = [
    `[${report.kind}] ${report.slug}`,
    `Log: ${report.log}`,
    `Act: ${report.act}`,
    'Citation:',
  ];
  if (report.citations.length === 0) {
    lines.push('- None');
  } else {
    for (const citation of report.citations) {
      lines.push(`- ${citation.path}${citation.role ? ` -- ${citation.role}` : ''}`);
    }
  }
  return lines.join('\n');
}

export async function findAssetRecord(kind, slug) {
  const records = await loadAssetRecords();
  return records.find((record) => record.kind === kind && record.slug === slug);
}

