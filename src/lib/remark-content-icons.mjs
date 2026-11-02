import { localeFromPath, splitContentIcons } from './content-icons.mjs';

// Content bridge: turn `:name:` content-icon shortcodes in Markdown text into
// inline icons (see content-icons.mjs). Only plain text nodes are rewritten,
// so code spans, code blocks and raw HTML keep the shortcode as written. The
// label language follows the content file (`*.zh.md` / `*.en.md`).

const SKIP = new Set(['code', 'inlineCode', 'html', 'yaml']);

function rewrite(node, locale) {
  if (!Array.isArray(node.children)) return;
  const next = [];
  for (const child of node.children) {
    if (child.type === 'text' && child.value.includes(':')) {
      const parts = splitContentIcons(child.value, locale);
      if (parts.some((part) => 'html' in part)) {
        for (const part of parts) {
          next.push('html' in part ? { type: 'html', value: part.html } : { type: 'text', value: part.text });
        }
        continue;
      }
    } else if (!SKIP.has(child.type)) {
      rewrite(child, locale);
    }
    next.push(child);
  }
  node.children = next;
}

export default function remarkContentIcons() {
  return (tree, file) => {
    rewrite(tree, localeFromPath(file?.path ?? file?.history?.[0]));
  };
}
