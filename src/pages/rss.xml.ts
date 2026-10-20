import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { compareWanderMonths, groupWanderWorks } from '../lib/wander';
import { toChineseFeedItem } from '../lib/wander-feed';

export async function GET(context: { site?: URL }) {
  const entries = await getCollection('wander');
  const items = groupWanderWorks(entries)
    .sort((a, b) => compareWanderMonths(a.zh?.data.month, b.zh?.data.month))
    .map(toChineseFeedItem)
    .filter((item) => item !== undefined);

  return rss({
    title: '呦呦漫游 · Elen Skye',
    description: 'Elen Skye 的中文写作、项目、画作与探索。',
    site: context.site ?? new URL('https://elenskye.com'),
    items,
    customData: '<language>zh-CN</language>',
  });
}
