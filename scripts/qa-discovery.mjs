import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const errors = [];

const required = [
  'search/index.html',
  'en/search/index.html',
  'rss.xml',
  'en/rss.xml',
  'pagefind/pagefind.js',
  'scripts/site-search.js',
];
for (const path of required) {
  try {
    await access(join(dist, path));
  } catch {
    errors.push(`missing discovery output: ${path}`);
  }
}

const zhSearch = await readFile(join(dist, 'search/index.html'), 'utf8');
const enSearch = await readFile(join(dist, 'en/search/index.html'), 'utf8');
const zhHome = await readFile(join(dist, 'index.html'), 'utf8');
const enHome = await readFile(join(dist, 'en/index.html'), 'utf8');
const zhFeed = await readFile(join(dist, 'rss.xml'), 'utf8');
const enFeed = await readFile(join(dist, 'en/rss.xml'), 'utf8');
const sitemap = await readFile(join(dist, 'sitemap.xml'), 'utf8');
const robots = await readFile(join(dist, 'robots.txt'), 'utf8');

for (const [label, html, lang, feed] of [
  ['Chinese search', zhSearch, 'zh-CN', '/rss.xml'],
  ['English search', enSearch, 'en', '/en/rss.xml'],
]) {
  if (!html.includes(`<html lang="${lang}">`)) errors.push(`${label}: wrong document language`);
  if (!html.includes('data-search-root')) errors.push(`${label}: missing search interface`);
  if (!html.includes('data-search-documents')) errors.push(`${label}: missing local fallback index`);
  if (!html.includes('data-pagefind-ready="true"')) errors.push(`${label}: production Pagefind flag is not enabled`);
  if (!html.includes('data-pagefind-ignore')) errors.push(`${label}: search interface must be excluded from its own index`);
  if (!html.includes('src="/scripts/site-search.js"')) errors.push(`${label}: missing unbundled search controller`);
  if (html.includes('__VITE_PRELOAD__')) errors.push(`${label}: contains a broken build-time Pagefind preload placeholder`);
  if (!html.includes(`type="application/rss+xml"`) || !html.includes(`href="${feed}"`)) {
    errors.push(`${label}: missing localized RSS discovery metadata`);
  }
}

const fallbackDocuments = (label, html) => {
  const match = html.match(/<script[^>]*data-search-documents[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    errors.push(`${label}: local fallback payload is missing`);
    return [];
  }
  try {
    return JSON.parse(match[1]);
  } catch {
    errors.push(`${label}: local fallback payload is invalid JSON`);
    return [];
  }
};

for (const [label, html, urlPattern] of [
  ['Chinese search', zhSearch, /^\/wander\/[^/]+\/$/],
  ['English search', enSearch, /^\/en\/wander\/[^/]+\/$/],
]) {
  const documents = fallbackDocuments(label, html);
  if (documents.length === 0) errors.push(`${label}: local fallback index is empty`);
  if (documents.some((document) => !urlPattern.test(document.url))) {
    errors.push(`${label}: local fallback index contains a non-Wander-detail page`);
  }
}

for (const [label, html, feed] of [
  ['Chinese footer', zhHome, '/rss.xml'],
  ['English footer', enHome, '/en/rss.xml'],
]) {
  if (!html.includes(`class="footer-rss-link" href="${feed}"`) || !html.includes('>RSS Feed</span>')) {
    errors.push(`${label}: missing RSS Feed button beneath the footer heading`);
  }
  const footerNavigation = html.match(/<nav class="footer-columns"[\s\S]*?<\/nav>/)?.[0] ?? '';
  if (footerNavigation.includes(`href="${feed}"`)) {
    errors.push(`${label}: RSS link still appears in the footer navigation columns`);
  }
}

for (const coreOutput of [
  'index.html',
  'career/index.html',
  'now/index.html',
  'about/index.html',
  'en/index.html',
  'en/career/index.html',
  'en/now/index.html',
  'en/about/index.html',
]) {
  const html = await readFile(join(dist, coreOutput), 'utf8');
  if (html.includes('data-pagefind-body')) {
    errors.push(`Pagefind scope: core page is still searchable: ${coreOutput}`);
  }
}

let detailCount = 0;
for (const localeDirectory of ['wander', 'en/wander']) {
  const slugs = await readdir(join(dist, localeDirectory), { withFileTypes: true });
  for (const slug of slugs.filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
    const output = `${localeDirectory}/${slug}/index.html`;
    const html = await readFile(join(dist, output), 'utf8');
    detailCount += 1;
    if (!html.includes('data-pagefind-body')) {
      errors.push(`Pagefind scope: Wander detail is missing from the index: ${output}`);
    }
  }
}

for (const removedCopy of [
  '在中文页面、文章与项目中寻找一条旧路径',
  '输入关键词后，搜索会在这台设备上完成。',
  'Find an old path',
  'search happens on this device',
]) {
  if (zhSearch.includes(removedCopy) || enSearch.includes(removedCopy)) {
    errors.push(`Search pages: removed helper copy returned: ${removedCopy}`);
  }
}

if (!zhFeed.includes('<language>zh-CN</language>')) errors.push('Chinese RSS: missing zh-CN policy');
if (!enFeed.includes('<language>en</language>')) errors.push('English RSS: missing en policy');
if (!zhFeed.includes('https://elenskye.com/wander/')) errors.push('Chinese RSS: missing stable Wander links');
if (zhFeed.includes('https://elenskye.com/en/wander/')) errors.push('Chinese RSS: contains English links');
if (!enFeed.includes('https://elenskye.com/en/wander/')) errors.push('English RSS: missing stable English/stub links');

for (const url of ['https://elenskye.com/search/', 'https://elenskye.com/en/search/']) {
  if (!sitemap.includes(`<loc>${url}</loc>`)) errors.push(`sitemap: missing ${url}`);
}
if (!robots.includes('Sitemap: https://elenskye.com/sitemap.xml')) errors.push('robots: missing sitemap discovery');

const pagefindFiles = await readdir(join(dist, 'pagefind'));
if (!pagefindFiles.some((name) => name.includes('zh-cn'))) errors.push('Pagefind: missing Chinese index');
if (!pagefindFiles.some((name) => name.includes('en'))) errors.push('Pagefind: missing English index');

const searchController = await readFile(join(dist, 'scripts/site-search.js'), 'utf8');
if (!searchController.includes("import('/pagefind/pagefind.js')")) {
  errors.push('Search controller: missing browser-time Pagefind import');
}
if (!searchController.includes('searchFallback')) {
  errors.push('Search controller: missing development/failure fallback');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  const itemCount = (xml) => (xml.match(/<item>/g) ?? []).length;
  console.log(`Discovery QA passed: ${detailCount} Wander-only search pages, ${itemCount(zhFeed)} Chinese RSS items, ${itemCount(enFeed)} English RSS items`);
}
