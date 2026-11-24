// Library entry `sf-plugin-data/api`: functions other plugins call over a Connection they hold.
// Nothing here prints or exits; refusals are thrown as typed errors with a `code`.
export { SegmentError } from './artifacts/segment-document.js';
export { listSegments, resolveSegment } from './services/segment-lookup.js';
export type { LookupConnection, SegmentLookup, SegmentRow } from './services/segment-lookup.js';
export { crossSpaceContext } from './services/cross-space-context.js';
export { DataSpaceError } from './services/data-space-check.js';
export { listDataSpaces } from './services/list-data-spaces.js';
export type { DataSpaceListing } from './services/list-data-spaces.js';
export { CrossSpaceError } from './services/cross-dataspace-deploy.js';
export type { CrossSpaceContext } from 'salesforce-data360-rules';
export { exitCodeOf } from './exit-code.js';
