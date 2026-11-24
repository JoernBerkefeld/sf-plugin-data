// Library entry `sf-plugin-data/api`: functions other plugins call over a Connection they hold.
// Nothing here prints or exits; refusals are thrown as typed errors with a `code`, except the
// run* commands, which return the command's envelope (they throw only OptionError).
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
export { runRetrieve } from './services/run-retrieve.js';
export type { RetrieveOptions } from './services/run-retrieve.js';
export type { RetrieveEnvelope } from './commands/data360/retrieve.js';
export { runDeploy } from './services/run-deploy.js';
export type { DeployOptions } from './services/run-deploy.js';
export type { DeployEnvelope } from './commands/data360/deploy.js';
export { runDelete } from './services/run-delete.js';
export type { DeleteOptions } from './services/run-delete.js';
export type { DeleteEnvelope } from './commands/data360/delete.js';
export { OptionError } from './services/run-options.js';
