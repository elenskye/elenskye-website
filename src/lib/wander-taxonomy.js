export function normalizeTaxonomyValue(value, allowedValues) {
  if (typeof value !== 'string') return '';
  return allowedValues.includes(value) ? value : '';
}

export function normalizeTaxonomyValues(values, allowedValues) {
  if (!Array.isArray(values)) return [];
  const allowed = new Set(allowedValues);
  return [...new Set(values.filter((value) => typeof value === 'string' && allowed.has(value)))];
}

export function getTaxonomyLabel(terms, slug, locale) {
  if (!slug) return undefined;
  return terms.find((term) => term.slug === slug)?.label[locale];
}
