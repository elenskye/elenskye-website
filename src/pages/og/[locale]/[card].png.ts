import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { listOgCards } from '../../../lib/og-card';
import { renderCardPng } from '../../../vendor/vermilion/og-card/card.mjs';
import template from '../../../vendor/vermilion/og-card/template.json';

// One share image per Wander page, generated at build time (see lib/og-card.ts).
export const getStaticPaths = (async () => {
  const entries = await getCollection('wander');
  return listOgCards(entries).map(({ locale, card, title }) => ({ params: { locale, card }, props: { title } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  // One odd title must not stop every other page from publishing: fall back
  // to the template without a title, which still reads as the site's card.
  const png = await renderCardPng(template, props.title).catch((error: unknown) => {
    console.warn(`og-card: could not render "${props.title}"`, error);
    return renderCardPng(template, '');
  });
  return new Response(png as Uint8Array<ArrayBuffer>, { headers: { 'Content-Type': 'image/png' } });
};
