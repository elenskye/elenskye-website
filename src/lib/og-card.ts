import type { CollectionEntry } from 'astro:content';
import type { Locale } from '../data/site';
import { cardKey } from '../vendor/vermilion/og-card/card.mjs';
import template from '../vendor/vermilion/og-card/template.json';
import { getWanderSlug, groupWanderWorks } from './wander';

// Per-article share images (Vermilion `og-card`): every Wander page shares a
// PNG generated from its title at build time, by src/pages/og/[locale]/[card].png.ts.
// The title's hash is part of the file name, so a retitled article gets a new
// URL instead of a stale preview from the WeChat / LinkedIn image caches.

export const ogCardSize = { width: template.width, height: template.height };

const ogCardName = (slug: string, title: string) => `${slug}-${cardKey(template, title)}`;

export function ogCardPath(locale: Locale, slug: string, title: string) {
  return `/og/${locale}/${ogCardName(slug, title)}.png`;
}

/** One card per Wander page: the same pages and titles as the two [slug].astro routes. */
export function listOgCards(entries: CollectionEntry<'wander'>[]) {
  const zh = entries
    .filter((entry) => entry.data.language === 'zh')
    .map((entry) => ({ locale: 'zh' as const, slug: getWanderSlug(entry), title: entry.data.title }));
  const en = groupWanderWorks(entries).map((work) => ({
    locale: 'en' as const,
    slug: work.slug,
    title: work.en?.data.title ?? work.zh?.data.englishTitle ?? work.zh?.data.title ?? '',
  }));
  return [...zh, ...en].map(({ locale, slug, title }) => ({ locale, card: ogCardName(slug, title), title }));
}
