/**
 * @typedef {{ heading?: unknown, items?: unknown }} SimpleCareerItem
 * @typedef {{ period?: unknown, role?: unknown, org?: unknown, bullets?: unknown }} DetailedCareerItem
 * @typedef {{
 *   title?: unknown,
 *   content?: {
 *     discriminant?: unknown,
 *     value?: unknown,
 *   }
 * }} CareerSectionInput
 */

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Keep the Career page resilient to half-filled rows saved from Keystatic.
 * Incomplete rows are ignored until they contain enough information to render,
 * while an intentionally empty, titled module remains visible.
 *
 * @param {unknown} value
 */
export function normalizeCareerSections(value) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    /** @type {CareerSectionInput} */
    const section = candidate && typeof candidate === 'object' ? candidate : {};
    const title = cleanText(section.title);
    const content = section.content;
    if (!title || !content || typeof content !== 'object') return [];

    if (content.discriminant === 'simple') {
      const source = Array.isArray(content.value) ? content.value : [];
      const items = source.flatMap((candidateItem) => {
        /** @type {SimpleCareerItem} */
        const item = candidateItem && typeof candidateItem === 'object' ? candidateItem : {};
        const heading = cleanText(item.heading);
        const details = cleanText(item.items);
        return heading && details ? [{ heading, items: details }] : [];
      });
      return [{ title, mode: 'simple', items }];
    }

    if (content.discriminant === 'detailed') {
      const source = Array.isArray(content.value) ? content.value : [];
      const entries = source.flatMap((candidateEntry) => {
        /** @type {DetailedCareerItem} */
        const entry = candidateEntry && typeof candidateEntry === 'object' ? candidateEntry : {};
        const period = cleanText(entry.period);
        const role = cleanText(entry.role);
        const org = cleanText(entry.org);
        const bullets = Array.isArray(entry.bullets)
          ? entry.bullets.map(cleanText).filter(Boolean)
          : [];
        return period || role || org || bullets.length ? [{ period, role, org, bullets }] : [];
      });
      return [{ title, mode: 'detailed', entries }];
    }

    return [];
  });
}
