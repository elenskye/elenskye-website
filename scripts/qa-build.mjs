import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : path;
    })
  );
  return files.flat();
}

const required = [
  'index.html',
  'en/index.html',
  'career/index.html',
  'en/career/index.html',
  'now/index.html',
  'en/now/index.html',
  'about/index.html',
  'en/about/index.html',
  'search/index.html',
  'en/search/index.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  'rss.xml',
  'en/rss.xml',
  'pagefind/pagefind.js',
  'scripts/site-search.js',
  'favicon.svg',
  'images/og/default.png',
  'images/status/wander-error-cloud-pages-404.png',
  'images/status/wander-empty-cloud-pages-oops.png',
];

for (const path of required) await access(join(dist, path));

// Pages that ship in the build but are not production content pages. They carry
// no description/canonical/OG metadata and no unique h1 by design, and they are
// deliberately absent from the sitemap, so they must not affect release metadata
// checks or URL counts.
//   - design-preview: the owner's local visual lab, gitignored.
//   - love-shuyu: the Phase 18 hidden page. noindex, nofollow, no in-site entry
//     point, excluded from sitemap, RSS and Pagefind by design.
const localOnlyHtml = new Set([
  join(dist, 'design-preview/index.html'),
  join(dist, 'love-shuyu/index.html'),
]);
const distFiles = await walk(dist);
const htmlFiles = distFiles.filter((file) => file.endsWith('.html') && !localOnlyHtml.has(file));
const errors = [];

const checkPng = async (relativePath, expectedWidth, expectedHeight, maxBytes, requiresTransparency = false) => {
  const data = await readFile(join(dist, relativePath));
  const isPng =
    data.length >= 24 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isPng) {
    errors.push(`${relativePath}: expected a valid PNG`);
    return;
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const colorType = data[25];
  if (width !== expectedWidth || height !== expectedHeight) {
    errors.push(
      `${relativePath}: expected ${expectedWidth}x${expectedHeight}, found ${width}x${height}`
    );
  }
  if (data.length > maxBytes) {
    errors.push(`${relativePath}: expected at most ${maxBytes} bytes, found ${data.length}`);
  }
  if (requiresTransparency && colorType !== 4 && colorType !== 6) {
    errors.push(`${relativePath}: expected a PNG with an alpha channel`);
    return;
  }
  if (requiresTransparency) {
    const idatChunks = [];
    for (let offset = 8; offset + 12 <= data.length; ) {
      const length = data.readUInt32BE(offset);
      const type = data.toString('ascii', offset + 4, offset + 8);
      if (type === 'IDAT') idatChunks.push(data.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
      if (type === 'IEND') break;
    }
    const firstScanline = inflateSync(Buffer.concat(idatChunks));
    const alphaOffset = colorType === 6 ? 4 : 2;
    if (firstScanline[alphaOffset] !== 0) {
      errors.push(`${relativePath}: expected a transparent outer background`);
    }
  }
};

await checkPng('images/og/default.png', 1200, 630, 300_000);
await checkPng('images/status/wander-error-cloud-pages-404.png', 640, 420, 100_000, true);
await checkPng('images/status/wander-empty-cloud-pages-oops.png', 480, 300, 100_000, true);

const targetForPath = (pathname) => {
  const decoded = decodeURIComponent(pathname);
  if (decoded === '/') return join(dist, 'index.html');
  if (decoded.endsWith('/')) return join(dist, decoded.slice(1), 'index.html');
  return join(dist, decoded.slice(1));
};

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const label = file.slice(dist.length + 1);
  const requiredMeta = [
    /<meta name="description" content="[^"]+"/,
    /<link rel="canonical" href="https:\/\/elenskye\.com\/[^"]*"/,
    /<meta property="og:title" content="[^"]+"/,
    /<meta property="og:description" content="[^"]+"/,
    /<meta property="og:image" content="https:\/\/elenskye\.com\/[^"]+"/,
    /<meta property="og:image:alt" content="[^"]+"/,
    /<meta name="twitter:card" content="summary_large_image"/,
    /<meta name="twitter:image:alt" content="[^"]+"/,
  ];
  for (const pattern of requiredMeta) {
    if (!pattern.test(html)) errors.push(`${label}: missing metadata ${pattern}`);
  }
  if ((html.match(/<h1(?:\s|>)/g) ?? []).length !== 1) errors.push(`${label}: expected exactly one h1`);
  if (/<img(?![^>]*\salt=)[^>]*>/.test(html)) errors.push(`${label}: image without alt attribute`);
  if (label === '404.html' && !/<meta name="robots" content="noindex, nofollow"/.test(html)) {
    errors.push('404.html: missing noindex');
  }
  if (
    label === '404.html' &&
    !html.includes('src="/images/status/wander-error-cloud-pages-404.png"')
  ) {
    errors.push('404.html: missing the approved 404 illustration');
  }
  if (
    ['index.html', 'en/index.html', 'search/index.html', 'en/search/index.html'].includes(label) &&
    !html.includes('src="/images/status/wander-empty-cloud-pages-oops.png"')
  ) {
    errors.push(`${label}: missing the approved empty-state illustration`);
  }

  // Résumé downloads are documents of the library.
  if (label === 'career/index.html' || label === 'en/career/index.html') {
    const resumeTargets = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*\bdownload\b/g)].map((match) => match[1]);
    if (resumeTargets.length === 0) errors.push(`${label}: expected at least one resume download`);
    if (resumeTargets.some((target) => !target.startsWith('/assets/documents/'))) {
      errors.push(`${label}: a resume download is not a library document`);
    }
  }

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const reference = match[1];
    if (!reference.startsWith('/') || reference.startsWith('//')) continue;
    const pathname = reference.split(/[?#]/)[0];
    try {
      await access(targetForPath(pathname));
    } catch {
      errors.push(`${label}: missing local target ${pathname}`);
    }
  }
}

// The Phase 16 performance fixes are intentional release invariants: fonts are
// non-blocking and swap to the selected families, the first Wander image is discoverable at high
// priority, and the one-column wall leaves the masonry row sizing behind.
const homepage = await readFile(join(dist, 'index.html'), 'utf8');
if (
  !/<link rel="stylesheet" href="\/_astro\/fonts\.[^"]+\.css" media="print" onload="this\.media='all'">/.test(
    homepage
  )
) {
  errors.push('index.html: font stylesheet must load without blocking first paint');
}
if (!/<img[^>]+loading="eager"[^>]+fetchpriority="high"[^>]*>/.test(homepage)) {
  errors.push('index.html: first Wander image must be eager and high priority');
}
if (!homepage.includes('-card.webp')) {
  errors.push('index.html: expected a registered performance thumbnail');
}

const cssFiles = distFiles.filter((file) => file.endsWith('.css'));
const css = (await Promise.all(cssFiles.map((file) => readFile(file, 'utf8')))).join('\n');
const fontCssFiles = cssFiles.filter((file) => /[/\\]fonts\.[^.]+\.css$/.test(file));
if (fontCssFiles.length !== 1) {
  errors.push(`dist/_astro: expected one sliced font stylesheet, found ${fontCssFiles.length}`);
} else {
  const fontCss = await readFile(fontCssFiles[0], 'utf8');
  if (!fontCss.includes('font-display:swap') || fontCss.includes('font-display:optional')) {
    errors.push('dist/_astro: self-hosted fonts must use font-display: swap');
  }
  if (!fontCss.includes('font-family:Work Sans') || fontCss.includes('font-family:Inter')) {
    errors.push('dist/_astro: English sans must contain Work Sans and no longer ship Inter');
  }
}
if (
  !/\.site-header\{[^}]*font-family:var\(--font-sans\)/.test(css) ||
  !/\.site-footer\{[^}]*font-family:var\(--font-sans\)/.test(css)
) {
  errors.push('dist/_astro: missing explicit page-chrome font scopes');
}
if (
  !/:root\{[^}]*--font-sans:"Work Sans",\s*"Noto Sans SC"/.test(css) ||
  !/:root\{[^}]*--font-serif:"Source Serif 4",\s*"Noto Serif SC"/.test(css) ||
  /html\[lang=en\]\{[^}]*--font-(?:sans|serif)/.test(css)
) {
  errors.push('dist/_astro: Latin font companions must apply from :root in both locales');
}
if (
  !/\.footer-social\{[^}]*display:flex(?:;|})/.test(css) ||
  !/\.footer-social\{[^}]*gap:0(?:;|})/.test(css)
) {
  errors.push('dist/_astro: footer social entries must keep their compact layout');
}
if (!css.includes('grid-auto-rows:auto')) {
  errors.push('dist/_astro: one-column Wander wall must reset masonry row sizing');
}

// `mask` is a shorthand: it resets mask-composite to `add`. The CSS minifier
// merges duplicated `mask` / `-webkit-mask` declarations and hoists the separate
// composite above the merged shorthand, which silently turns every `exclude`
// into `add` in the production build only (the dev server serves CSS verbatim,
// so the bug is invisible locally). It cost one deploy cycle on the
// /love-shuyu/ photo strip: the 1px ring became a full-bleed wash over 42
// photos. Always write mask-image / mask-clip / mask-composite longhands.
const maskShorthand = /(?:^|[;{])(?:-webkit-)?mask:/.exec(css);
if (maskShorthand) {
  errors.push(
    'dist/_astro: use mask-image / mask-clip / mask-composite longhands — the `mask` shorthand resets mask-composite and the minifier reorders it',
  );
}

const sitemap = await readFile(join(dist, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expectedSitemapUrls = htmlFiles.filter((file) => file !== join(dist, '404.html')).length;
if (sitemapUrls.length !== expectedSitemapUrls) {
  errors.push(`sitemap.xml: expected ${expectedSitemapUrls} content URLs, found ${sitemapUrls.length}`);
}
if (sitemapUrls.some((url) => url.includes('/404'))) errors.push('sitemap.xml: 404 must not be indexed');
if (sitemapUrls.some((url) => url.includes('/design-preview'))) {
  errors.push('sitemap.xml: local design preview must not be indexed');
}
if (sitemapUrls.some((url) => url.includes('/love-shuyu'))) {
  errors.push('sitemap.xml: the hidden love-shuyu page must not be indexed');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Build QA passed: ${htmlFiles.length} HTML pages, ${sitemapUrls.length} sitemap URLs, local targets resolved`);
}
