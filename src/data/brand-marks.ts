/**
 * Official third-party brand marks for the footer's social entries.
 *
 * Lucide deliberately ships no third-party trademarks, so these paths come
 * from each platform's own brand resources. They are trademarks of their
 * respective owners and are used here only to link to the site owner's own
 * profile on that platform (nominative use).
 *
 * Rules when adding a mark:
 * - take the path from the platform's official brand page, never redraw it;
 * - keep the original 24x24 viewBox and proportions;
 * - fill-only, no stroke — these are solid marks, not line icons;
 * - do not add borders, shadows, or effects.
 *
 * Brand artwork is drawn to wildly different margins — GitHub's Octocat fills
 * its whole 24-grid while LinkedIn's bug only occupies the middle 16 — so
 * rendering both at 24px makes one look much smaller than the other, and both
 * look wrong next to Lucide. Each mark therefore records the tight bounding
 * box of its own artwork, and `brandMarkViewBox()` derives a viewBox that
 * scales the art to the same optical size Lucide uses.
 */
export interface BrandMark {
  /** Accessible name used when the link has no better label. */
  title: string;
  /** Bounding box of the drawn artwork, `[x, y, width, height]`, measured in
   *  the source file's own coordinate system via `SVGGraphicsElement.getBBox()`. */
  bounds: [number, number, number, number];
  path: string;
  /** Where the artwork came from, so it can be re-verified later. */
  source: string;
}

/** Lucide draws a 24px icon inside a 20px box, i.e. a 2px margin all round.
 *  Matching that ratio is what makes a filled brand mark sit correctly in a
 *  row of line icons. */
const LUCIDE_ART_RATIO = 20 / 24;

/**
 * Build a viewBox that renders `mark` at Lucide's optical size, centred.
 * The longer edge of the artwork is what gets normalised, so non-square marks
 * keep their aspect ratio instead of being stretched.
 */
export function brandMarkViewBox(mark: BrandMark): string {
  const [x, y, width, height] = mark.bounds;
  const box = Math.max(width, height) / LUCIDE_ART_RATIO;
  const minX = x + width / 2 - box / 2;
  const minY = y + height / 2 - box / 2;
  const round = (value: number) => Number(value.toFixed(3));
  return `${round(minX)} ${round(minY)} ${round(box)} ${round(box)}`;
}

export const brandMarks: Record<string, BrandMark> = {
  github: {
    title: 'GitHub',
    bounds: [0, 0.3, 24, 23.41],
    source: 'https://github.com/logos',
    path: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  },
  linkedin: {
    title: 'LinkedIn',
    // The bug only fills the middle 16 of its 24-grid; without normalisation it
    // renders about a third smaller than the GitHub mark beside it.
    bounds: [4, 4, 16, 16],
    // Owner-supplied file (linkedin-svgrepo-com.svg). NOTE: this is SVG Repo's
    // redraw of the LinkedIn bug, not the file from brand.linkedin.com —
    // LinkedIn does not permit third-party packages to redistribute the mark,
    // which is why no icon library ships it. Visually equivalent and fine for
    // linking to the owner's own profile; swap in the official asset if strict
    // brand compliance is ever required.
    source: 'https://www.svgrepo.com/ (redraw) · official: https://brand.linkedin.com/',
    path: 'M18.72 3.99997H5.37C5.19793 3.99191 5.02595 4.01786 4.86392 4.07635C4.70189 4.13484 4.55299 4.22471 4.42573 4.34081C4.29848 4.45692 4.19537 4.59699 4.12232 4.75299C4.04927 4.909 4.0077 5.07788 4 5.24997V18.63C4.01008 18.9901 4.15766 19.3328 4.41243 19.5875C4.6672 19.8423 5.00984 19.9899 5.37 20H18.72C19.0701 19.9844 19.4002 19.8322 19.6395 19.5761C19.8788 19.32 20.0082 18.9804 20 18.63V5.24997C20.0029 5.08247 19.9715 4.91616 19.9078 4.76122C19.8441 4.60629 19.7494 4.466 19.6295 4.34895C19.5097 4.23191 19.3672 4.14059 19.2108 4.08058C19.0544 4.02057 18.8874 3.99314 18.72 3.99997ZM9 17.34H6.67V10.21H9V17.34ZM7.89 9.12997C7.72741 9.13564 7.5654 9.10762 7.41416 9.04768C7.26291 8.98774 7.12569 8.89717 7.01113 8.78166C6.89656 8.66615 6.80711 8.5282 6.74841 8.37647C6.6897 8.22474 6.66301 8.06251 6.67 7.89997C6.66281 7.73567 6.69004 7.57169 6.74995 7.41854C6.80986 7.26538 6.90112 7.12644 7.01787 7.01063C7.13463 6.89481 7.2743 6.80468 7.42793 6.74602C7.58157 6.68735 7.74577 6.66145 7.91 6.66997C8.07259 6.66431 8.2346 6.69232 8.38584 6.75226C8.53709 6.8122 8.67431 6.90277 8.78887 7.01828C8.90344 7.13379 8.99289 7.27174 9.05159 7.42347C9.1103 7.5752 9.13699 7.73743 9.13 7.89997C9.13719 8.06427 9.10996 8.22825 9.05005 8.3814C8.99014 8.53456 8.89888 8.6735 8.78213 8.78931C8.66537 8.90513 8.5257 8.99526 8.37207 9.05392C8.21843 9.11259 8.05423 9.13849 7.89 9.12997ZM17.34 17.34H15V13.44C15 12.51 14.67 11.87 13.84 11.87C13.5822 11.8722 13.3313 11.9541 13.1219 12.1045C12.9124 12.2549 12.7546 12.4664 12.67 12.71C12.605 12.8926 12.5778 13.0865 12.59 13.28V17.34H10.29V10.21H12.59V11.21C12.7945 10.8343 13.0988 10.5225 13.4694 10.3089C13.84 10.0954 14.2624 9.98848 14.69 9.99997C16.2 9.99997 17.34 11 17.34 13.13V17.34Z',
  },
};
