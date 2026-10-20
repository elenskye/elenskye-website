import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { discoveryPaths, pagePaths } from '../data/site';
import { groupWanderWorks } from '../lib/wander';

const escapeXml = (value: string) =>
  value.replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]!);

export const GET: APIRoute = async ({ site }) => {
  const origin = site ?? new URL('https://elenskye.com');
  const entries = await getCollection('wander');
  const urls = new Set<string>();

  for (const locale of ['zh', 'en'] as const) {
    for (const path of Object.values(pagePaths).map((paths) => paths[locale])) {
      urls.add(new URL(path, origin).toString());
    }
    urls.add(new URL(discoveryPaths.search[locale], origin).toString());
  }

  for (const work of groupWanderWorks(entries)) {
    if (work.zh) {
      urls.add(new URL(`/wander/${work.slug}/`, origin).toString());
    }
    const englishEntry = work.en ?? work.zh;
    if (englishEntry) {
      urls.add(new URL(`/en/wander/${work.slug}/`, origin).toString());
    }
  }

  const body = [...urls]
    .sort((a, b) => a.localeCompare(b))
    .map((loc) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`)
    .join('\n');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
