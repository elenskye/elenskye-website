import type { CollectionEntry } from 'astro:content';
import type { RSSFeedItem } from '@astrojs/rss';
import { getCategoryLabel, getTopicLabel, makeExcerpt, type WanderWork } from './wander';
import type { Locale } from '../data/site';
import { normalizeTaxonomyValue, normalizeTaxonomyValues } from './wander-taxonomy.js';
import { wanderCategories, wanderTopics } from '../data/site';

type WanderEntry = CollectionEntry<'wander'>;

const categorySlugs = wanderCategories.map((item) => item.slug);
const topicSlugs = wanderTopics.map((item) => item.slug);

function labelsFor(entry: WanderEntry, locale: Locale) {
  const category = normalizeTaxonomyValue(entry.data.category, categorySlugs);
  const topics = normalizeTaxonomyValues(entry.data.topics, topicSlugs);
  return [
    ...(category ? [getCategoryLabel(category, locale)] : []),
    ...topics.map((topic) => getTopicLabel(topic, locale)),
  ].filter((label): label is string => Boolean(label));
}

export function toChineseFeedItem(work: WanderWork): RSSFeedItem | undefined {
  const entry = work.zh;
  if (!entry) return undefined;
  return {
    title: entry.data.title,
    description: makeExcerpt(entry.body, 'zh', 180) || entry.data.summary || '',
    link: `/wander/${work.slug}/`,
    categories: labelsFor(entry, 'zh'),
  };
}

export function toEnglishFeedItem(work: WanderWork): RSSFeedItem | undefined {
  const entry = work.en ?? work.zh;
  if (!entry) return undefined;
  const isStub = !work.en && entry.data.language === 'zh';
  return {
    title: isStub ? entry.data.englishTitle || entry.data.title : entry.data.title,
    description: isStub
      ? entry.data.englishSummary || entry.data.summary || ''
      : makeExcerpt(entry.body, 'en', 180) || entry.data.summary || '',
    link: `/en/wander/${work.slug}/`,
    categories: labelsFor(entry, 'en'),
  };
}
