// Single implementation lives in gallery.js so the QA scripts can import it
// from plain Node; re-exported here to keep the existing call sites unchanged.
export { toPublicAssetUrl } from './gallery.js';
