import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WANDER_WALL_LIMIT, isWanderCardVisible } from '../src/lib/wander-filter.js';
import { resolveGalleryImages } from '../src/lib/gallery.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const astroCache = join(root, '.astro');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const target = join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : target;
    })
  );
  return files.flat();
}

const state = (overrides = {}) => ({
  topic: null,
  categories: new Set(),
  expanded: false,
  ...overrides,
});

const fixtures = Array.from({ length: 55 }, (_, index) => ({
  topics: index === 54 ? ['older-match'] : [index % 2 === 0 ? 'even' : 'odd'],
  category: index % 3 === 0 ? 'notes' : 'project',
  overflow: index >= WANDER_WALL_LIMIT,
}));

assert.equal(
  fixtures.filter((card) => isWanderCardVisible(card, state())).length,
  WANDER_WALL_LIMIT,
  'the unfiltered wall must stop at 50 cards'
);
assert.equal(
  fixtures.filter((card) => isWanderCardVisible(card, state({ expanded: true }))).length,
  fixtures.length,
  'expand-all must reveal every card'
);
assert.equal(
  fixtures.filter((card) => isWanderCardVisible(card, state({ topic: 'older-match' }))).length,
  1,
  'active filters must search beyond the initial 50 cards'
);
assert.equal(
  fixtures.filter((card) =>
    isWanderCardVisible(card, state({ topic: 'even', categories: new Set(['notes']) }))
  ).length,
  9,
  'Topic and Category filters must combine with AND logic'
);
assert.equal(
  fixtures.filter((card) =>
    isWanderCardVisible(card, state({ topic: 'older-match', categories: new Set(['notes']) }))
  ).length,
  1,
  'a matching Topic and Category combination must remain visible'
);
assert.equal(
  fixtures.filter((card) =>
    isWanderCardVisible(card, state({ topic: 'older-match', categories: new Set(['gallery']) }))
  ).length,
  0,
  'a non-matching combination must produce an empty result'
);

const builtFiles = await walk(dist);
const generatedFiles = [...builtFiles, ...(await walk(astroCache))];
const conflictCopies = generatedFiles.filter((file) => / \d+\.[^.]+$/.test(basename(file)));
assert.deepEqual(conflictCopies, [], 'generated output must not contain local conflict-copy filenames');

const cssFiles = builtFiles.filter((file) => file.endsWith('.css'));
const builtCss = (await Promise.all(cssFiles.map((file) => readFile(file, 'utf8')))).join('\n');
const jsFiles = builtFiles.filter((file) => file.endsWith('.js'));
const builtJs = (await Promise.all(jsFiles.map((file) => readFile(file, 'utf8')))).join('\n');
assert.match(
  builtCss,
  /\.wander-card\[hidden\]\{display:none!important\}/,
  'built CSS must keep hidden Wander cards out of layout'
);
assert.match(builtJs, /wanderReady/, 'built JavaScript must include the Wander filter logic');
assert.match(
  builtJs,
  /removeProperty\([`'"]grid-row-end[`'"]\)/,
  'built JavaScript must release masonry row spans in a single-column wall'
);
assert.match(
  builtCss,
  /\.gallery-lightbox-inner\{(?=[^}]*grid-template-columns:minmax\(0,1fr\))(?=[^}]*width:100%)(?=[^}]*height:100%)(?=[^}]*overflow:hidden)[^}]*\}/,
  'expanded image must use one viewport-sized column'
);
assert.match(
  builtCss,
  /\.gallery-lightbox-media img\{(?=[^}]*width:100%)(?=[^}]*height:100%)(?=[^}]*min-width:0)(?=[^}]*min-height:0)(?=[^}]*object-fit:contain)(?=[^}]*object-position:center)[^}]*\}/,
  'expanded images must fill the bounded viewport canvas and contain their full aspect ratio'
);
assert.match(
  builtCss,
  /\.gallery-frame\{[^}]*height:clamp\(360px,65svh,720px\)/,
  'gallery frame height must remain stable when image orientation changes'
);
assert.match(
  builtCss,
  /\.gallery-zoom\{(?=[^}]*border:0)(?=[^}]*background:var\(--color-page\))[^}]*\}/,
  'inline gallery frame must blend into the page without a border'
);
assert.match(
  builtCss,
  /\.gallery-lightbox\{(?=[^}]*background:var\(--color-page\))[^}]*\}/,
  'expanded gallery background must use the page colour'
);
assert.match(
  builtCss,
  /\.gallery-lightbox-media\{(?=[^}]*border:0)(?=[^}]*background:var\(--color-page\))[^}]*\}/,
  'expanded gallery media region must be borderless and page-coloured'
);
assert.match(
  builtCss,
  /\.gallery-motion-frame\{(?=[^}]*position:fixed)(?=[^}]*pointer-events:none)[^}]*\}/,
  'gallery must include a non-layout-shifting motion layer'
);
assert.match(
  builtCss,
  /\.about-desc\{(?=[^}]*font-family:var\(--font-serif\))[^}]*\}/,
  'About timeline descriptions must use the long-form serif stack'
);
assert.match(
  builtCss,
  /\.gallery-preview--prev img\{(?=[^}]*mask-image:linear-gradient)(?=[^}]*#000 42%)[^}]*\}/,
  'previous-image control must fade toward the outer edge'
);
assert.match(
  builtCss,
  /\.topic-chip\{(?=[^}]*margin-inline:-6px)(?=[^}]*padding:0 6px)(?![^}]*min-width)[^}]*\}/,
  'Topic chips must keep equal visual gaps without hidden minimum widths'
);
assert.match(
  builtCss,
  /\.topic-arrow:before\{(?=[^}]*width:30px)(?=[^}]*height:30px)[^}]*\}/,
  'Topic arrows must retain their original 30px visual circle'
);

for (const relativePath of ['index.html', 'en/index.html']) {
  const html = await readFile(join(dist, relativePath), 'utf8');
  assert.match(html, /data-topic="[^"]+"/, `${relativePath}: missing Topic controls`);
  assert.match(html, /data-category="[^"]+"/, `${relativePath}: missing card Category data`);
  assert.match(html, /data-topics="[^"]+"/, `${relativePath}: missing card Topic data`);
  assert.match(html, /aria-controls="wander-category-panel-(zh|en)"/, `${relativePath}: missing dropdown relationship`);
  assert.match(
    html,
    /wanderReady|<script type="module" src="\/_astro\/WanderWall[^"]+\.js">/,
    `${relativePath}: missing bundled filter logic`
  );
}

const sourceFiles = await readdir(join(root, 'src/content/wander'));
const works = new Map();
for (const file of sourceFiles) {
  const match = /^(.*)\.(zh|en)\.(md|mdx)$/.exec(file);
  if (!match) continue;
  const [, slug, locale] = match;
  const source = await readFile(join(root, 'src/content/wander', file), 'utf8');
  assert.doesNotMatch(source, /^date:/m, `${file}: Wander metadata must not store a full date`);
  const month = /^month:\s*['"]?(\d{4}-(?:0[1-9]|1[0-2]))['"]?\s*$/m.exec(source)?.[1];
  assert.ok(month, `${file}: missing valid YYYY-MM month metadata`);
  const work = works.get(slug) ?? { zh: false, en: false, months: {} };
  work[locale] = true;
  work.months[locale] = month;
  works.set(slug, work);
}

for (const [slug, work] of works) {
  if (work.zh && work.en) {
    assert.equal(work.months.zh, work.months.en, `${slug}: Chinese and English twins must share a month`);
  }
}

const requiredEnglishFullText = new Set([
  'can-ai-replace-teachers',
  'human-nature',
  'ielts-excel-ai',
  'invention-is-not-innovation',
]);
for (const slug of requiredEnglishFullText) {
  assert.equal(works.get(slug)?.en, true, `${slug}: priority research/learning work needs full English text`);
}

const alternateTag = (language, url) => `<link rel="alternate" hreflang="${language}" href="${url}">`;
const languageSwitch = (path) => `<a class="icon-toggle" href="${path}"`;

for (const [slug, work] of works) {
  const chineseUrl = `https://elenskye.com/wander/${slug}/`;
  const englishUrl = `https://elenskye.com/en/wander/${slug}/`;
  const chinesePath = `/wander/${slug}/`;
  const englishPath = `/en/wander/${slug}/`;
  const englishHtml = await readFile(join(dist, 'en/wander', slug, 'index.html'), 'utf8');
  assert.doesNotMatch(
    englishHtml,
    /property="article:published_time"/,
    `${slug} en: month-only works must not invent a full publication date`
  );

  if (work.zh) {
    const chineseHtml = await readFile(join(dist, 'wander', slug, 'index.html'), 'utf8');
    assert.doesNotMatch(
      chineseHtml,
      /property="article:published_time"/,
      `${slug} zh: month-only works must not invent a full publication date`
    );
    for (const [language, url] of [
      ['zh-CN', chineseUrl],
      ['en', englishUrl],
      ['x-default', chineseUrl],
    ]) {
      assert.ok(chineseHtml.includes(alternateTag(language, url)), `${slug} zh: missing ${language} alternate`);
      assert.ok(englishHtml.includes(alternateTag(language, url)), `${slug} en: missing ${language} alternate`);
    }
    assert.ok(chineseHtml.includes(languageSwitch(englishPath)), `${slug} zh: language switch loses work context`);
    assert.ok(englishHtml.includes(languageSwitch(chinesePath)), `${slug} en: language switch loses work context`);
  } else {
    assert.doesNotMatch(englishHtml, /rel="alternate"/, `${slug} en-only: must not claim a missing translation`);
    assert.ok(englishHtml.includes(languageSwitch('/')), `${slug} en-only: language switch must return to Chinese Wander`);
  }

  if (work.en) {
    assert.doesNotMatch(englishHtml, /class="wander-article-original"/, `${slug}: full English work rendered as a stub`);
  } else {
    assert.match(englishHtml, /class="wander-article-original"/, `${slug}: Chinese-only work is missing its English stub`);
    assert.ok(englishHtml.includes(`href="${chinesePath}"`), `${slug}: English stub does not link to Chinese original`);
  }

  if (slug === 'ielts-excel-ai') {
    const chineseHtml = await readFile(join(dist, 'wander', slug, 'index.html'), 'utf8');
    assert.ok(chineseHtml.includes('2025年5月'), `${slug} zh: missing year-month date label`);
    assert.doesNotMatch(chineseHtml, /2025年5月20日/, `${slug} zh: visible date must not include the day`);
    assert.ok(englishHtml.includes('May 2025'), `${slug} en: missing year-month date label`);
    assert.doesNotMatch(englishHtml, /May 20, 2025/, `${slug} en: visible date must not include the day`);
  }
}

for (const metadataFile of ['rss.xml', 'en/rss.xml', 'sitemap.xml']) {
  const xml = await readFile(join(dist, metadataFile), 'utf8');
  assert.doesNotMatch(
    xml,
    /<(?:pubDate|lastmod)>/,
    `${metadataFile}: month-only works must not emit day-precision metadata`
  );
}

// --- Gallery ---------------------------------------------------------------
// getGalleryImages has to survive whatever half-filled rows Keystatic can
// save, because a thrown error here freezes the whole content collection.
assert.deepEqual(resolveGalleryImages([], 'fallback'), [], 'empty gallery must yield no images');

assert.deepEqual(
  resolveGalleryImages([{ imageRef: 'public/images/wander/a.jpg', alt: 'A' }], 'fallback'),
  [{ src: '/images/wander/a.jpg', alt: 'A', caption: undefined }],
  'single image: imageRef must resolve to a public URL'
);

assert.deepEqual(
  resolveGalleryImages(
    [
      { imageRef: 'public/images/wander/a.jpg', image: 'public/images/wander/ignored.jpg', alt: 'A' },
      { image: 'public/images/wander/b.jpg', alt: '', caption: 'B caption' },
    ],
    'fallback'
  ),
  [
    { src: '/images/wander/a.jpg', alt: 'A', caption: undefined },
    { src: '/images/wander/b.jpg', alt: 'fallback', caption: 'B caption' },
  ],
  'multi image: imageRef wins over image, blank alt falls back to the title'
);

assert.deepEqual(
  resolveGalleryImages([{ alt: 'orphan' }, { image: '', imageRef: '' }], 'fallback'),
  [],
  'rows with no usable image path must be dropped, not rendered broken'
);

// Every gallery image referenced by real content must exist in the build, in
// both locales — a broken path here would ship as a silently missing photo.
let galleryPageCount = 0;
for (const [slug, work] of works) {
  const candidates = [join(dist, 'en/wander', slug, 'index.html')];
  if (work.zh) candidates.unshift(join(dist, 'wander', slug, 'index.html'));

  for (const page of candidates) {
    const html = await readFile(page, 'utf8');
    const section = /<section class="wander-gallery"[\s\S]*?<\/section>/.exec(html)?.[0];
    if (!section) continue;
    galleryPageCount += 1;

    assert.ok(section.includes('data-gallery-lightbox'), `${slug}: gallery is missing its lightbox`);
    assert.ok(section.includes('data-gallery-lightbox-mode="single"'), `${slug}: expanded view must show one image only`);
    assert.ok(section.includes('data-gallery-animation="slide"'), `${slug}: gallery is missing slide animation semantics`);
    assert.ok(section.includes('gallery-lightbox-media'), `${slug}: gallery is missing its bounded image region`);
    assert.ok(section.includes('data-gallery-preview-offset="-1"'), `${slug}: missing previous-image preview`);
    assert.ok(section.includes('data-gallery-preview-offset="1"'), `${slug}: missing next-image preview`);
    assert.doesNotMatch(section, /gallery-arrow/, `${slug}: legacy arrow controls must not return`);
    const lightboxMarkup = section.slice(section.indexOf('<div class="gallery-lightbox"'));
    assert.doesNotMatch(
      lightboxMarkup,
      /gallery-preview--lightbox|data-gallery-step=/,
      `${slug}: expanded view must not include image switching controls`
    );
    assert.ok(html.includes('animateGalleryStep'), `${slug}: gallery is missing its position-based slide transition`);

    // Only the slide images; the lightbox's own <img> starts empty by design.
    const slideImages = [...section.matchAll(/<figure class="gallery-slide"[\s\S]*?<img[^>]*>/g)].map(
      ([figure]) => /<img[^>]*>/.exec(figure)[0]
    );
    assert.ok(slideImages.length > 0, `${slug}: gallery rendered with no images`);

    for (const tag of slideImages) {
      const src = /src="([^"]+)"/.exec(tag)?.[1];
      assert.ok(src, `${slug}: gallery image tag has no src`);
      assert.match(tag, /alt="[^"]+"/, `${slug}: gallery image ${src} has no alt text`);
      // Throws ENOENT if the build never emitted the file.
      await readFile(join(dist, src.replace(/^\//, '')));
    }
  }
}

console.log(
  `Wander QA passed: filter logic, 50-card limit, ` +
    `${[...works.values()].filter((work) => work.en).length} full English works, ` +
    `${[...works.values()].filter((work) => !work.en).length} English stubs, ` +
    `${galleryPageCount} gallery pages, and clean build output`
);
