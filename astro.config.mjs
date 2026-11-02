import { unified } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import remarkContentIcons from './src/lib/remark-content-icons.mjs';
import remarkMarkdocTable from './src/lib/remark-markdoc-table.mjs';

export default defineConfig({
  site: 'https://elenskye.com',
  output: 'static',
  server: { host: '127.0.0.1', port: 4328 },
  vite: {
    // Keep even the smallest unicode-range font files out of the render-
    // blocking CSS bundle. Fontsource's default `swap` keeps the selected
    // families authoritative once their sliced files finish loading.
    build: { assetsInlineLimit: 0 },
  },
  markdown: {
    // Convert Markdoc-style tables and registered shared-image blocks in the
    // content into regular Markdown AST nodes before Astro renders them, and
    // `:name:` content-icon shortcodes into inline icons (Vermilion).
    // Keep straight quotes as-authored. Smart quote substitution turns English
    // apostrophes into a CJK-spaced glyph in the self-hosted serif font
    // (for example `I'm` visually becomes `I' m`). Dashes and ellipses keep
    // their normal smart-typography handling.
    processor: unified({
      remarkPlugins: [remarkMarkdocTable, remarkContentIcons],
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
