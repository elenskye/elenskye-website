/**
 * Content file naming check — the first step of `npm run qa`.
 *
 * Every content file must be named `<slug>.zh.md` / `<slug>.en.md` (the
 * singleton pages use plain `zh.md` / `en.md`). Anything else is either a
 * mistake or a leftover — a duplicate, an editor backup, a merge remnant — and
 * the content glob would happily turn it into a real page with a broken slug.
 *
 * This ran as a rescue during the 2026-07-26 incident, when an iCloud conflict
 * copy named `abandon-photo-set-1.zh 2.md` became a phantom work. iCloud sync
 * is off now, but the check is cheap and still catches ordinary slips, so it
 * stays.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

const CONTENT_DIRECTORIES = ['wander', 'now', 'career', 'about'];
// Wander uses `<slug>.<zh|en>.md`; the singleton pages use `<zh|en>.md`.
const VALID_NAME = /^([a-z0-9][a-z0-9-]*\.)?(zh|en)\.(md|mdx)$/;

const problems = [];
let checked = 0;

for (const directory of CONTENT_DIRECTORIES) {
  let files;
  try {
    files = await readdir(join(root, 'src/content', directory));
  } catch {
    continue;
  }

  for (const file of files) {
    if (file.startsWith('.')) continue;
    checked += 1;
    if (!VALID_NAME.test(file)) {
      problems.push(`src/content/${directory}/${file}`);
    }
  }
}

assert.equal(
  problems.length,
  0,
  `Content files with an invalid name:\n  ${problems.join('\n  ')}\n\n` +
    `Expected <slug>.zh.md / <slug>.en.md (lowercase, hyphens), or zh.md / en.md\n` +
    `for the single-entry pages. Rename or delete them — otherwise each one\n` +
    `becomes a separate page with a broken slug.`
);

// npm 11 can preserve an incomplete optional-dependency placeholder that npm
// 10 (bundled with the production Node 22 runtime) rejects as "Invalid
// Version" before the build even starts. Keep this check dependency-free so
// it can also be run while diagnosing a failed clean install.
const lockfile = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const incompletePackages = Object.entries(lockfile.packages ?? {})
  .filter(([path, entry]) => path && (typeof entry.version !== 'string' || entry.version.length === 0))
  .map(([path]) => path);

assert.deepEqual(
  incompletePackages,
  [],
  `package-lock.json contains package records without a version:\n  ${incompletePackages.join('\n  ')}\n` +
    `Regenerate the lockfile with the Node 22 / npm 10 toolchain before deployment.`
);

console.log(`Workspace QA passed: ${checked} content files correctly named; package-lock entries complete`);
