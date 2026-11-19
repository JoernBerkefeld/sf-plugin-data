// Unit tests run offline: the once-per-command data space list read answers from this list
// instead of GET /ssot/data-spaces. Tests of the check itself replace or restore `read`.
import { dataSpaceDirectory } from '../../lib/services/data-space-check.js';

/** Every data space the unit tests name; anything else is unknown, as in an org. */
export const offlineDataSpaces = ['default', 'dataspace2', 'other', 'Other', 'Team', 'Team Space'];

dataSpaceDirectory.read = async () => [...offlineDataSpaces];
