export const WANDER_WALL_LIMIT = 50;

/**
 * @typedef {{ topics: string[], category: string, overflow: boolean }} WanderFilterCard
 * @typedef {{ topic: string | null, categories: Set<string>, expanded: boolean }} WanderFilterState
 */

/**
 * Pure visibility rule shared by the browser and the repeatable QA script.
 * Active filters search the entire collection; the 50-card cap only applies
 * to the unfiltered initial wall.
 *
 * @param {WanderFilterCard} card
 * @param {WanderFilterState} state
 */
export function isWanderCardVisible(card, state) {
  const topicMatches = !state.topic || card.topics.includes(state.topic);
  const categoryMatches = state.categories.size === 0 || state.categories.has(card.category);
  const hasActiveFilters = Boolean(state.topic) || state.categories.size > 0;
  const hiddenByInitialLimit = card.overflow && !state.expanded && !hasActiveFilters;

  return topicMatches && categoryMatches && !hiddenByInitialLimit;
}
