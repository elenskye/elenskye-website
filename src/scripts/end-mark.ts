// Article end mark (Vermilion `end-mark`, synced from visual-assets): picks one
// of the three marks at random on every page view and writes it once when it
// first scrolls into view (calm, 640ms). Static under reduced motion.
import { initEndMark } from '../vendor/vermilion/end-mark/end-mark.js';

document.querySelectorAll<HTMLElement>('.va-end-mark').forEach((mark) => initEndMark(mark));
