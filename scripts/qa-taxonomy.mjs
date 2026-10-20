import assert from 'node:assert/strict';
import {
  getTaxonomyLabel,
  normalizeTaxonomyValue,
  normalizeTaxonomyValues,
} from '../src/lib/wander-taxonomy.js';

const categorySlugs = ['current-category'];
const topicSlugs = ['current-topic'];

assert.equal(
  normalizeTaxonomyValue('__retired-category__', categorySlugs),
  '',
  'a deleted Category must become unassigned instead of invalidating its work'
);
assert.deepEqual(
  normalizeTaxonomyValues(['current-topic', '__retired-topic__'], topicSlugs),
  ['current-topic'],
  'deleted Topics must be removed while current Topics remain'
);

const renamedTerms = [{ slug: 'notes', label: { zh: '随笔', en: 'Writing' } }];
assert.equal(
  getTaxonomyLabel(renamedTerms, 'notes', 'zh'),
  '随笔',
  'renaming a display label must update works that retain the stable slug'
);

console.log('Taxonomy QA passed: deleted terms decouple safely and display-name changes remain automatic');
