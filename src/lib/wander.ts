import type { CollectionEntry } from 'astro:content';
import { wanderCategories, wanderTopics, type Locale, type WanderCategorySlug } from '../data/site';
import { toPublicAssetUrl } from './assets';
import { resolveGalleryImages } from './gallery.js';
import { getSharedImage } from './shared-images';
import { getTaxonomyLabel, normalizeTaxonomyValue, normalizeTaxonomyValues } from './wander-taxonomy.js';

type WanderEntry = CollectionEntry<'wander'>;

export interface WanderCard {
  id: string;
  title: string;
  summary: string;
  category: WanderCategorySlug;
  categoryLabel?: string;
  topics: string[];
  topicLabels: string[];
  languageLabel: string;
  dateLabel?: string;
  href: string;
  thumbnail?: string;
}

const currentCategorySlugs = wanderCategories.map((category) => category.slug);
const currentTopicSlugs = wanderTopics.map((topic) => topic.slug);

export function getCategoryLabel(slug: string, locale: Locale): string | undefined {
  return getTaxonomyLabel(wanderCategories, slug, locale);
}

export function getTopicLabel(slug: string, locale: Locale): string | undefined {
  return getTaxonomyLabel(wanderTopics, slug, locale);
}

export const languageLabels = {
  zh: {
    zh: '中文',
    en: '英文',
  },
  en: {
    zh: 'Chinese',
    en: 'English',
  },
} as const;

// Plain-text excerpt from the start of a markdown body: strips markdown /
// markdoc syntax so cards can show the opening words of the piece itself.
export function makeExcerpt(body: string | undefined, language: 'zh' | 'en', maxChars = 66) {
  if (!body) return '';
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\{%[\s\S]*?%\}/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // Drop whole blockquote lines so cards start at the piece's own voice.
    .replace(/^\s{0,3}>.*$/gm, ' ')
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s{0,3}-{3,}\s*$/gm, ' ')
    .replace(/\*\*|__|~~|\*|`/g, '')
    .replace(/\\\s*$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return chars.slice(0, maxChars).join('').trimEnd() + (language === 'zh' ? '……' : '…');
}

// First image referenced in a markdown body, used as an automatic card
// thumbnail when the author hasn't set one explicitly.
export function extractFirstImage(body: string | undefined): string | undefined {
  if (!body) return undefined;
  const withoutCode = body.replace(/```[\s\S]*?```/g, ' ');
  const uploaded = /!\[[^\]]*\]\(([^)\s]+)/.exec(withoutCode);
  const shared = /\{%\s*sharedImage\b[\s\S]*?\bimage=(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')[\s\S]*?\/%\}/.exec(
    withoutCode
  );

  if (uploaded && (!shared || uploaded.index < shared.index)) return uploaded[1];
  if (!shared) return undefined;

  const slug = (shared[1] ?? shared[2] ?? '').replace(/\\([\\"'])/g, '$1');
  return getSharedImage(slug)?.src;
}

export interface GalleryImage {
  src: string;
  alt: string;
  caption?: string;
}

/**
 * Resolve a work's gallery into renderable images.
 * The tolerance rules live in `gallery.js`, which the QA scripts import too.
 */
export function getGalleryImages(entry: WanderEntry, fallbackAlt: string): GalleryImage[] {
  return resolveGalleryImages(entry.data.gallery, fallbackAlt);
}

export function formatWanderMonth(month: string | undefined, locale: Locale) {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return undefined;
  const [year, monthNumber] = month.split('-').map(Number);
  if (locale === 'zh') return `${year}年${monthNumber}月`;
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

export function compareWanderMonths(a: string | undefined, b: string | undefined) {
  return (b ?? '').localeCompare(a ?? '');
}

// Derive a clean slug from the source filename, dropping the `.zh`/`.en`
// language suffix. A `.zh` file and a `.en` file with the same base name are
// two language versions of ONE work: they share a slug, count once, and each
// language page shows its own version.
export function getWanderSlug(entry: WanderEntry) {
  const base = entry.filePath?.split('/').pop() ?? entry.id;
  return base.replace(/\.md$/, '').replace(/\.(zh|en)$/, '');
}

// Chinese pieces live at the root; English versions and English stubs for
// Chinese-only pieces live under /en.
export function getWanderDetailPath(entry: WanderEntry) {
  const prefix = entry.data.language === 'en' ? '/en/wander/' : '/wander/';
  return `${prefix}${getWanderSlug(entry)}/`;
}

export interface WanderWork {
  slug: string;
  zh?: WanderEntry;
  en?: WanderEntry;
}

export function groupWanderWorks(entries: WanderEntry[]): WanderWork[] {
  const works = new Map<string, WanderWork>();
  for (const entry of entries) {
    const slug = getWanderSlug(entry);
    const work = works.get(slug) ?? { slug };
    work[entry.data.language] = entry;
    works.set(slug, work);
  }
  return [...works.values()];
}

export function getUniqueWanderCount(entries: WanderEntry[]) {
  return groupWanderWorks(entries).length;
}

// Per-category counts over unique works (a zh/en pair counts once).
export function getCategoryCounts(entries: WanderEntry[]) {
  const counts: Record<string, number> = {};
  for (const work of groupWanderWorks(entries)) {
    const entry = work.zh ?? work.en;
    if (!entry) continue;
    const category = normalizeTaxonomyValue(entry.data.category, currentCategorySlugs);
    if (!category) continue;
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}

// The wall shows one card per work. Each language page prefers its own
// version; a Chinese-only work appears on the English wall with its
// translated title/summary, linking to the English stub page (never straight
// to the Chinese piece).
export function toWanderCards(entries: WanderEntry[], locale: Locale): WanderCard[] {
  return groupWanderWorks(entries)
    .map((work) => {
      const preferred = locale === 'zh' ? (work.zh ?? work.en) : (work.en ?? work.zh);
      return preferred ? { work, entry: preferred } : undefined;
    })
    .filter((item): item is { work: WanderWork; entry: WanderEntry } => Boolean(item))
    .sort((a, b) => {
      return compareWanderMonths(a.entry.data.month, b.entry.data.month);
    })
    .map(({ work, entry }) => {
      const isChineseOnlyOnEnglishPage = locale === 'en' && entry.data.language === 'zh';
      const title =
        isChineseOnlyOnEnglishPage && entry.data.englishTitle ? entry.data.englishTitle : entry.data.title;
      // Every card auto-excerpts the opening of its own body, in its own
      // language; a hand-written `summary` is only a fallback for pieces
      // without body content. The one case with no body to excerpt is a
      // Chinese-only work shown on the English wall (a stub card) — that
      // uses the translated `englishSummary` written on the Chinese entry.
      const summary = isChineseOnlyOnEnglishPage
        ? (entry.data.englishSummary ?? entry.data.summary ?? '')
        : makeExcerpt(entry.body, entry.data.language) || (entry.data.summary ?? '');
      const href = isChineseOnlyOnEnglishPage ? `/en/wander/${work.slug}/` : getWanderDetailPath(entry);
      const category = normalizeTaxonomyValue(entry.data.category, currentCategorySlugs);
      const topics = normalizeTaxonomyValues(entry.data.topics, currentTopicSlugs);

      return {
        id: entry.id,
        title,
        summary,
        category,
        categoryLabel: getCategoryLabel(category, locale),
        topics,
        topicLabels: topics.flatMap((topic) => getTopicLabel(topic, locale) ?? []),
        languageLabel: languageLabels[locale][entry.data.language],
        dateLabel: formatWanderMonth(entry.data.month, locale),
        href,
        // Explicit thumbnail wins, then a gallery's opening image (a gallery
        // work usually has no image in its body at all), then the first image
        // found in the piece's own body.
        thumbnail: toPublicAssetUrl(
          entry.data.thumbnailRef ??
            entry.data.thumbnail ??
            entry.data.gallery.find((item) => item.imageRef || item.image)?.imageRef ??
            entry.data.gallery.find((item) => item.imageRef || item.image)?.image ??
            extractFirstImage(entry.body)
        ),
      };
    });
}
