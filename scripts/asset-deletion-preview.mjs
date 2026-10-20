import {
  createReferenceReport,
  formatReferenceReport,
  loadAssetRecords,
} from './lib/asset-reference-report.mjs';

const records = await loadAssetRecords();
const selectors = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const selected = [];
const errors = [];

if (selectors.length === 0) {
  selected.push(...records.filter((record) => record.data.deletionRequested === true));
} else {
  for (const selector of selectors) {
    const matches = records.filter(
      (record) => selector === record.slug || selector === `${record.kind}:${record.slug}`
    );
    if (matches.length === 0) {
      errors.push(`Resource not found: ${selector}`);
    } else if (matches.length > 1) {
      errors.push(`Ambiguous resource: ${selector} (use image:${selector} or document:${selector})`);
    } else if (!selected.includes(matches[0])) {
      selected.push(matches[0]);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}

if (selected.length === 0) {
  console.log('No resources selected.');
} else {
  const reports = await Promise.all(selected.map(createReferenceReport));
  console.log(reports.map(formatReferenceReport).join('\n\n'));
}

