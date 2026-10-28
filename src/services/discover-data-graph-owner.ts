import { isDeepStrictEqual } from 'node:util';
import {
  graphRecord,
  graphRequire,
  graphText,
  projectDataGraph,
  dataGraphName,
} from '../artifacts/data-graph-document.js';
import { projectIdentityResolution } from '../artifacts/identity-resolution-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient } from '../transport/connect-client.js';
import { retrieveIdentityResolution } from './retrieve-identity-resolution.js';
import { bindDataGraphDependencies } from './bind-data-graph-dependencies.js';
import type { DataGraphDependencyBinding } from './bind-data-graph-dependencies.js';
import { dataGraphScope } from './retrieve-data-graph.js';
import type { DataGraphConnection } from './retrieve-data-graph.js';

/**
 * Discover an exact source owner using documented inventory output names, never suffix inference.
 * Inventory is a discovery hint only; independent owner/output/root qualification is mandatory.
 * @param {unknown} value Raw independently read Graph.
 * @param {string} apiName Exact selected Graph.
 * @param {DataGraphConnection} connection Source receiver.
 * @param {ApiVersionSelection} selection Fixed version.
 * @param {string} dataSpace Default space.
 * @param {object} [injected] Independent acquisition seams for offline qualification.
 * @param {Function} injected.owner Independent exact owner acquisition.
 * @param {Function} injected.bind Independent complete dependency qualification.
 * @returns {Promise<DataGraphDependencyBinding | undefined>} Qualified private binding or legacy root.
 */
export async function discoverDataGraphOwner(
  value: unknown,
  apiName: string,
  connection: DataGraphConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  injected?: { owner: typeof retrieveIdentityResolution; bind: typeof bindDataGraphDependencies },
): Promise<DataGraphDependencyBinding | undefined> {
  const services = injected ?? {
    owner: retrieveIdentityResolution,
    bind: bindDataGraphDependencies,
  };
  dataGraphScope(connection, selection, dataSpace);
  const raw = graphRecord(value);
  const name = raw.primaryObjectName;
  if (name === 'UnifiedssotIndividualMkt__dlm') return undefined;
  graphRequire(typeof name === 'string' && dataGraphName.test(name) && name.endsWith('__dlm'));
  const client = new ConnectClient(connection, '65.0');
  const inventory = graphRecord(
    await client.get('/services/data/v65.0/ssot/identity-resolutions'),
    ['identityResolutions'],
  );
  graphRequire(
    Array.isArray(inventory.identityResolutions) && inventory.identityResolutions.length <= 256,
  );
  const matches: string[] = [];
  const identities = new Set<string>();
  for (const value of inventory.identityResolutions) {
    const owner = graphRecord(value);
    graphRequire(
      typeof owner.objectApiName === 'string' && dataGraphName.test(owner.objectApiName),
    );
    graphRequire(!identities.has(owner.objectApiName));
    identities.add(owner.objectApiName);
    graphRequire(
      Array.isArray(owner.reconciliationRules) && owner.reconciliationRules.length <= 64,
    );
    for (const value of owner.reconciliationRules) {
      const rule = graphRecord(value);
      if (rule.unifiedDmoName !== name) continue;
      graphRequire(
        owner.dataSpaceName === 'default' && rule.entityName === 'ssot__Individual__dlm',
      );
      matches.push(owner.objectApiName);
    }
  }
  graphRequire(matches.length === 1);
  const acquired = await services.owner(connection, matches[0], selection, dataSpace);
  graphRequire(acquired.candidate && acquired.expectations && acquired.blockers.length === 0);
  const owner = projectIdentityResolution(
    acquired.expectations.facade,
    acquired.expectations.native,
    matches[0],
  );
  graphRequire(
    isDeepStrictEqual(acquired.identity, owner.candidate.identity) &&
      isDeepStrictEqual(owner.candidate, acquired.candidate) &&
      isDeepStrictEqual(owner.expectations, acquired.expectations),
  );
  const outputs = owner.expectations.outputs.filter((output) => output.sourceApiName === name);
  graphRequire(
    outputs.length === 1 &&
      outputs[0].identity.role === 'unified' &&
      outputs[0].identity.entity.apiName === 'ssot__Individual__dlm',
  );
  // Obtain an actual local ID for provisional projection, not an invented discovery token.
  // Neither inventory nor this projection is returned as qualification evidence.
  const detail = graphRecord(
    await client.get(`/services/data/v65.0/ssot/data-model-objects/${name}`),
  );
  graphRequire(detail.name === name);
  graphText(detail.id);
  const provisional = projectDataGraph(raw, apiName, undefined, {
    fingerprint: 'source-discovery-not-admission',
    root: { identity: outputs[0].identity, targetApiName: name, targetId: detail.id },
  });
  const binding = await services.bind(provisional.candidate, connection, selection, dataSpace);
  graphRequire(
    binding.root && binding.root.targetApiName === name && binding.root.targetId === detail.id,
  );
  dataGraphScope(connection, selection, dataSpace);
  return binding;
}
