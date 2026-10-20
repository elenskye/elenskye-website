/**
 * Gallery resolution, kept in plain JS so the QA scripts can exercise the real
 * implementation. Importing the `.ts` modules from Node pulls in `astro:content`
 * and cannot run outside a build — the same reason `wander-filter.js` and
 * `wander-taxonomy.js` live here as JS.
 *
 * `toPublicAssetUrl` lives here rather than in `assets.ts` so there is exactly
 * one implementation; `assets.ts` re-exports it for the existing call sites.
 */

/** Convert library references (`public/…`) into browser-facing URLs. */
export function toPublicAssetUrl(path) {
  if (!path) return undefined;
  if (path.startsWith('public/')) return `/${path.slice('public/'.length)}`;
  return path;
}

/**
 * Resolve a work's `gallery` frontmatter into renderable images.
 *
 * Rows are tolerated in whatever half-filled state they were saved in: a
 * row without an `imageRef` is dropped rather than rendered as a broken
 * image.
 *
 * `alt` falls back to the work's own title so a gallery is never unlabelled;
 * authors are still asked for a real description when editing.
 */
export function resolveGalleryImages(gallery, fallbackAlt) {
  return (gallery ?? []).flatMap((item) => {
    const src = toPublicAssetUrl(item.imageRef);
    if (!src) return [];
    return [{ src, alt: item.alt?.trim() || fallbackAlt, caption: item.caption?.trim() || undefined }];
  });
}
