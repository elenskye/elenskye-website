import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { normalizeCareerSections } from '../src/lib/career-sections.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');

assert.deepEqual(normalizeCareerSections(undefined), [], 'missing sections must be safe');
assert.deepEqual(
  normalizeCareerSections([
    {
      title: ' Work Experience ',
      content: {
        discriminant: 'simple',
        value: [
          { heading: 'Focus', items: 'Delivery and research' },
          { heading: '', items: 'half-filled row' },
        ],
      },
    },
    {
      title: 'Projects',
      content: {
        discriminant: 'detailed',
        value: [
          {
            period: '2026',
            role: 'Lead',
            org: 'Team',
            bullets: [' Built a thing ', '', null],
          },
          {
            period: '',
            role: 'Undated role',
            org: '',
            bullets: [],
          },
          {},
        ],
      },
    },
    { title: '', content: { discriminant: 'simple', value: [] } },
    { title: 'Unknown', content: { discriminant: 'retired', value: [] } },
  ]),
  [
    {
      title: 'Work Experience',
      mode: 'simple',
      items: [{ heading: 'Focus', items: 'Delivery and research' }],
    },
    {
      title: 'Projects',
      mode: 'detailed',
      entries: [
        {
          period: '2026',
          role: 'Lead',
          org: 'Team',
          bullets: ['Built a thing'],
        },
        {
          period: '',
          role: 'Undated role',
          org: '',
          bullets: [],
        },
      ],
    },
  ],
  'both Career modes and half-filled Keystatic rows must normalize safely'
);

const decodeHtml = (value) =>
  value.replace(/&(?:#(\d+)|#x([\da-f]+)|amp|quot|apos|lt|gt);/gi, (entity, decimal, hexadecimal) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
    return {
      '&amp;': '&',
      '&quot;': '"',
      '&apos;': "'",
      '&lt;': '<',
      '&gt;': '>',
    }[entity.toLowerCase()];
  });

const normalizeWhitespace = (value) => value.replace(/\s+/g, ' ').trim();

for (const [relativePath, contentPath, pageSourcePath] of [
  ['career/index.html', 'src/content/career/zh.md', 'src/pages/career.astro'],
  ['en/career/index.html', 'src/content/career/en.md', 'src/pages/en/career.astro'],
]) {
  const contentSource = await readFile(join(root, contentPath), 'utf8');
  const frontmatter = contentSource.match(/^---\n([\s\S]*?)\n---/)?.[1];
  assert.ok(frontmatter, `${contentPath}: missing frontmatter`);
  const data = yaml.load(frontmatter);
  const expectedSections = normalizeCareerSections(data.sections);
  const html = await readFile(join(dist, relativePath), 'utf8');
  const renderedTitles = [...html.matchAll(/<section class="cv-section" aria-label="([^"]*)">/g)].map((match) =>
    normalizeWhitespace(decodeHtml(match[1]))
  );
  assert.deepEqual(
    renderedTitles,
    expectedSections.map((section) => section.title),
    `${relativePath}: rendered Career modules differ from the editable content`
  );

  const simpleCount = [...html.matchAll(/class="cv-skills"/g)].length;
  const detailedEntryCount = [...html.matchAll(/class="cv-entry(?: cv-entry--undated)?"/g)].length;
  assert.equal(
    simpleCount,
    expectedSections.filter((section) => section.mode === 'simple').length,
    `${relativePath}: simple Career module count differs from content`
  );
  assert.equal(
    detailedEntryCount,
    expectedSections
      .filter((section) => section.mode === 'detailed')
      .reduce((total, section) => total + section.entries.length, 0),
    `${relativePath}: detailed Career entry count differs from content`
  );

  const expectedSummary = normalizeWhitespace(data.summary || '');
  assert.ok(expectedSummary, `${contentPath}: editable Career summary must not be empty in the release candidate`);
  const descriptions = [
    html.match(/<meta name="description" content="([^"]*)"/)?.[1],
    html.match(/<meta property="og:description" content="([^"]*)"/)?.[1],
    html.match(/<meta name="twitter:description" content="([^"]*)"/)?.[1],
    html.match(/<p class="page-intro">([\s\S]*?)<\/p>/)?.[1],
  ].map((value) => normalizeWhitespace(decodeHtml(value || '')));
  assert.deepEqual(
    descriptions,
    [expectedSummary, expectedSummary, expectedSummary, expectedSummary],
    `${relativePath}: editable Career summary is not shared by the page and metadata`
  );

  const pageSource = await readFile(join(root, pageSourcePath), 'utf8');
  assert.match(
    pageSource,
    /entry\?\.data\.summary\.trim\(\)/,
    `${pageSourcePath}: Career summary no longer comes from editable content`
  );
}

const keystaticSource = await readFile(join(root, 'keystatic.config.ts'), 'utf8');
assert.match(keystaticSource, /summary:\s*fields\.text\(/, 'Keystatic is missing the editable Career summary');
assert.match(
  keystaticSource,
  /sections:\s*fields\.array\([\s\S]*?content:\s*fields\.conditional\(/,
  'Keystatic is missing dynamic Career sections with selectable modes'
);

const careerComponentSource = await readFile(join(root, 'src/components/CareerCv.astro'), 'utf8');
const globalCss = await readFile(join(root, 'src/styles/global.css'), 'utf8');
assert.match(
  careerComponentSource,
  /!entry\.period\s*&&\s*['"]cv-entry--undated['"]/,
  'undated detailed Career entries need a single-column layout marker'
);
assert.match(
  globalCss,
  /\.cv-entry--undated\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  'undated detailed Career entries need a single-column CSS rule'
);

console.log('Career QA passed: editable summary, fully dynamic modules, both content modes, undated layout, and tolerant rows');
