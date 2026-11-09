// Content icons (Vermilion, synced from visual-atelier into src/vendor/vermilion/icons/).
// Authors write `:name:` in Markdown bodies and in some frontmatter text (the
// career page's buttons and entries); it becomes a small inline icon with a
// screen-reader label in the page's language. Only names listed in icons.json
// are replaced — `10:30`, `:abc:` and anything else stay as written.
import iconData from '../vendor/vermilion/icons/icons.json' with { type: 'json' };

const byName = new Map(iconData.icons.map((icon) => [icon.name, icon]));
const SHORTCODE = /:([a-z][a-z0-9-]*):/g;

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Content-file language from its path: `x.zh.md`, `zh.md`, `2026-10.en.md`. */
export function localeFromPath(path = '') {
  return /(?:^|[/.])en\.mdx?$/.test(path) ? 'en' : 'zh';
}

/** Inline icon markup; the SVG itself is aria-hidden, the wrapper carries the label. */
export function contentIconHtml(name, locale = 'zh') {
  const icon = byName.get(name);
  if (!icon) return null;
  const label = icon.label[locale] ?? icon.label.zh;
  return `<span class="va-icon" role="img" aria-label="${escapeHtml(label)}">${icon.svg}</span>`;
}

/** Split text into plain runs and icon markup, in order. */
export function splitContentIcons(text, locale = 'zh') {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(SHORTCODE)) {
    const html = contentIconHtml(match[1], locale);
    if (!html) continue;
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ html });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Frontmatter text → HTML (escaped text plus icons), for `set:html`. */
export function renderContentIconText(text, locale = 'zh') {
  return splitContentIcons(text ?? '', locale)
    .map((part) => ('html' in part ? part.html : escapeHtml(part.text)))
    .join('');
}

/** Plain-text contexts (meta description, card excerpts, search): drop the shortcodes. */
export function stripContentIcons(text) {
  if (!text) return text;
  return text
    .replace(SHORTCODE, (match, name) => (byName.has(name) ? ' ' : match))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
