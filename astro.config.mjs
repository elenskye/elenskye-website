import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';
import remarkMarkdocTable from './src/lib/remark-markdoc-table.mjs';
import assetReferencePreview from './src/integrations/asset-reference-preview.mjs';

const isProductionBuild = process.env.NODE_ENV === 'production';
const useGitHubStorage = process.env.KEYSTATIC_STORAGE === 'github';
const useVercelRuntime = process.env.DEPLOY_TARGET === 'vercel';

// Local development keeps the file-writing admin by default. A production
// build only includes Keystatic when GitHub storage is explicitly selected;
// its API routes then require the Vercel adapter. Public pages remain on
// Astro's default static/prerendered output.
const enableKeystatic = !isProductionBuild || useGitHubStorage;
const enableLocalAssetPreview = !isProductionBuild && !useGitHubStorage;

if (isProductionBuild && useGitHubStorage && !useVercelRuntime) {
  throw new Error('GitHub-mode Keystatic requires DEPLOY_TARGET=vercel for its on-demand API routes.');
}

export default defineConfig({
  site: 'https://elenskye.com',
  output: 'static',
  adapter: useVercelRuntime ? vercel() : undefined,
  server: { host: '127.0.0.1', port: 4328 },
  vite: {
    // Keep even the smallest unicode-range font files out of the render-
    // blocking CSS bundle. Fontsource's default `swap` keeps the selected
    // families authoritative once their sliced files finish loading.
    build: { assetsInlineLimit: 0 },
    // lucide-react 1.x is ESM-first; bundle it during Astro's static SSR pass
    // instead of letting Node resolve its legacy CommonJS entry.
    ssr: { noExternal: ['lucide-react'] },
  },
  integrations: [
    mdx(),
    react(),
    ...(enableKeystatic ? [keystatic()] : []),
    ...(enableLocalAssetPreview ? [assetReferencePreview()] : []),
  ],
  markdown: {
    // Convert Keystatic's Markdoc tables and registered shared-image blocks
    // into regular Markdown AST nodes before Astro renders the content.
    // Keep straight quotes as-authored. Smart quote substitution turns English
    // apostrophes into a CJK-spaced glyph in the self-hosted serif font
    // (for example `I'm` visually becomes `I' m`). Dashes and ellipses keep
    // their normal smart-typography handling.
    processor: unified({
      remarkPlugins: [remarkMarkdocTable],
      smartypants: { quotes: false },
    }),
    // Dual-theme code highlighting; token colors switch with the site's
    // data-theme, block background is styled in global.css (.prose).
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    },
  },
});
