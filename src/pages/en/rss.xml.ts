import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { compareWanderMonths, groupWanderWorks } from '../../lib/wander';
import { toEnglishFeedItem } from '../../lib/wander-feed';

export async function GET(context: { site?: URL }) {
  const entries = await getCollection('wander');
  const items = groupWanderWorks(entries)
    .sort((a, b) =>
      compareWanderMonths((a.en ?? a.zh)?.data.month, (b.en ?? b.zh)?.data.month)
    )
    .map(toEnglishFeedItem)
    .filter((item) => item !== undefined);

  return rss({
    title: 'Elen Skye · Wander',
    description: 'Writing, projects, artwork, and explorations by Elen Skye.',
    site: context.site ?? new URL('https://elenskye.com'),
    items,
    customData: '<language>en</language>',
  });
}
