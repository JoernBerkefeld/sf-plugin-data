// Library entry `sf-plugin-data/api`: functions other plugins call over a Connection they hold.
// Nothing here prints or exits; refusals are thrown as typed errors with a `code`.
export { SegmentError } from './artifacts/segment-document.js';
export { listSegments, resolveSegment } from './services/segment-lookup.js';
export type { LookupConnection, SegmentLookup, SegmentRow } from './services/segment-lookup.js';
