import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.vercel/output');
const config = await readFile(join(output, 'config.json'), 'utf8');
const errors = [];

if (!config.includes('/api/keystatic')) errors.push('remote build: missing Keystatic API route');
if (!config.includes('/keystatic')) errors.push('remote build: missing Keystatic UI route');
if (config.includes('__keystatic/asset-reference-preview')) {
  errors.push('remote build: local-only asset reference preview was exposed');
}

for (const path of [
  'static/index.html',
  'static/search/index.html',
  'static/en/search/index.html',
  'static/rss.xml',
  'static/en/rss.xml',
  'static/pagefind/pagefind.js',
  'static/scripts/site-search.js',
]) {
  try {
    await access(join(output, path));
  } catch {
    errors.push(`remote build: missing prerendered/static output ${path}`);
  }
}

const chunksDirectory = join(output, '_functions/chunks');
const chunkNames = (await readdir(chunksDirectory)).filter((name) => name.startsWith('keystatic-api_'));
const chunks = await Promise.all(chunkNames.map((name) => readFile(join(chunksDirectory, name), 'utf8')));
if (!chunks.some((source) => source.includes('branchPrefix: "content/"'))) {
  errors.push('remote build: Keystatic config was not bundled in GitHub/content-branch mode');
}
if (chunks.some((source) => source.includes('/__keystatic/asset-reference-preview'))) {
  errors.push('remote build: local deletion-preview client was bundled into the hosted API');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Remote build QA passed: static public site/search/feed, GitHub-mode Keystatic routes, no local deletion preview');
}
