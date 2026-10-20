/**
 * Guard for singleton content entries (Career, About, and any future page
 * backed by exactly one entry per language).
 *
 * Why this exists: Astro's dev server rebuilds the content-layer store whenever
 * a content file changes. The editor saves a file on every edit, so any request
 * that lands during that rebuild sees an EMPTY collection — the dev log says
 * `The collection "career" does not exist or is empty`. Pages that did
 * `const [entry] = await getCollection(...)` then passed `undefined` straight
 * into `render()`, which throws `RenderUndefinedEntryError` and 500s the whole
 * page. One transient rebuild made every page on the site look broken until the
 * dev server was restarted.
 *
 * The two environments want opposite behaviour, so they get it:
 *
 * - **Build**: a missing entry is a real content bug. Throw with the collection
 *   and language named, so the build fails loudly rather than shipping a page
 *   with a blank body.
 * - **Dev**: almost always the rebuild race above, not a real problem. Return
 *   `undefined` and let the page render a short notice, so the author can just
 *   reload a second later instead of thinking they broke the site.
 */
export function requireEntry<T>(entry: T | undefined, collection: string, language: string): T | undefined {
  if (entry) return entry;

  if (import.meta.env.PROD) {
    throw new Error(
      `Content collection "${collection}" has no entry for language "${language}". ` +
        `Expected src/content/${collection}/${language}.md — check the file exists and its frontmatter passes the schema in src/content.config.ts.`
    );
  }

  console.warn(
    `[content] "${collection}" is empty for "${language}". This is normally Astro re-syncing after a save — reload in a moment. ` +
      `If it persists, check the terminal for InvalidContentEntryDataError.`
  );
  return undefined;
}

/** Localized copy for the dev-only placeholder shown in place of a missing entry. */
export const missingEntryNotice = {
  zh: '内容正在重新同步（通常发生在保存之后）。请稍候刷新。',
  en: 'Content is re-syncing (this usually follows a save). Reload in a moment.',
} as const;
