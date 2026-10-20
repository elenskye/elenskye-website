import { getCollection } from 'astro:content';
import type { Locale } from '../data/site';
import { groupWanderWorks, makeExcerpt, toWanderCards } from './wander';

export interface SearchDocument {
  url: string;
  title: string;
  excerpt: string;
  text: string;
}

export async function getSearchDocuments(locale: Locale): Promise<SearchDocument[]> {
  const wanderEntries = await getCollection('wander');
  const cards = toWanderCards(wanderEntries, locale);
  const works = new Map(groupWanderWorks(wanderEntries).map((work) => [work.slug, work]));

  return cards.map((card) => {
    const slug = card.href.split('/').filter(Boolean).at(-1) ?? '';
    const work = works.get(slug);
    const entry = locale === 'zh' ? work?.zh : (work?.en ?? work?.zh);
    const isEnglishStub = locale === 'en' && !work?.en && entry?.data.language === 'zh';
    const bodyText = isEnglishStub
      ? entry?.data.englishSummary ?? entry?.data.summary ?? ''
      : makeExcerpt(entry?.body, entry?.data.language ?? locale, 20_000);
    const excerpt = isEnglishStub
      ? entry?.data.englishSummary ?? card.summary
      : makeExcerpt(entry?.body, entry?.data.language ?? locale, 180) || card.summary;

    return {
      url: card.href,
      title: card.title,
      excerpt,
      text: [card.title, card.summary, card.categoryLabel, ...card.topicLabels, bodyText]
        .filter(Boolean)
        .join(' '),
    };
  });
}
