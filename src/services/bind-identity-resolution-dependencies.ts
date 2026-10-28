import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  IdentityResolutionError,
  projectIdentityResolution,
  validateIdentityResolutionDocument,
} from '../artifacts/identity-resolution-document.js';
import type { IdentityResolutionOutputIdentity } from '../artifacts/identity-resolution-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient } from '../transport/connect-client.js';
import type { IdentityResolutionOutputBinding } from './execute-identity-resolution-deploy.js';
import type { IdentityResolutionTargetConnection } from './preflight-identity-resolution-deploy.js';
import { readDmoMetadata } from './retrieve-other-dmo.js';
import { retrieveIdentityResolution } from './retrieve-identity-resolution.js';

type Acquisition = { detail: unknown; metadata: unknown };
type Acquire = (name: string) => Promise<Acquisition>;

/**
 * Require exact independently observed compatibility, never an assumed default.
 * @param {unknown} condition Required compatibility invariant.
 */
function requireProof(condition: unknown): asserts condition {
  if (!condition) throw new IdentityResolutionError('IDENTITY_RESOLUTION_BINDING_UNQUALIFIED');
}

/**
 * Read a record without interpreting absent or array-shaped responses as metadata.
 * @param {unknown} value Untrusted response data.
 * @returns {Record<string, unknown>} Required record.
 */
function record(value: unknown): Record<string, unknown> {
  requireProof(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

/**
 * Enforce the command's API67 scope while fixing both independent dependency reads at API65.
 * @param {IdentityResolutionTargetConnection} connection Existing API67 connection.
 * @param {ApiVersionSelection} selection Explicit family version selection.
 */
function scope(
  connection: IdentityResolutionTargetConnection,
  selection: ApiVersionSelection,
): void {
  requireProof(
    selection?.requested === '67.0' &&
      selection.restSelector === 'v67.0' &&
      selection.soapNumeric === '67.0' &&
      connection.getApiVersion() === '67.0',
  );
}

/**
 * Use an operation-local receiver: never mutate the caller's API67 connection or Metadata client.
 * @param {IdentityResolutionTargetConnection} connection Existing API67 connection.
 * @returns {Acquire} Exact API65 independent reader.
 */
function reader(connection: IdentityResolutionTargetConnection): Acquire {
  return async (name) => {
    const receiver = Object.create(connection) as Parameters<typeof readDmoMetadata>[0];
    Object.defineProperty(receiver, 'version', { value: '65.0' });
    Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
    return {
      detail: await new ConnectClient(connection, '65.0').get(
        `/services/data/v65.0/ssot/data-model-objects/${name}`,
      ),
      metadata: await readDmoMetadata(receiver, name),
    };
  };
}

/**
 * Bound and uniquely index fields; duplicates anywhere are ambiguity, not first-match admission.
 * @param {unknown} value Untrusted response data.
 * @param {string} key Field identity property.
 * @returns {Map<string, Record<string, unknown>>} Unique bounded field index.
 */
function fields(value: unknown, key: string): Map<string, Record<string, unknown>> {
  requireProof(Array.isArray(value) && value.length > 0 && value.length <= 4096);
  const result = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    const field = record(item);
    const name = field[key];
    requireProof(
      typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]*__c$/u.test(name) && !result.has(name),
    );
    result.set(name, field);
  }
  return result;
}

/**
 * Correlate exact object/space and required Text fields in independent REST and Metadata reads.
 * @param {Acquisition} acquired Independent raw representations.
 * @param {string} name Exact expected DMO name.
 * @param {string[]} required Qualified required field names.
 * @param {string} [creationType] Explicit generated role creation type.
 * @returns {object} Private compatible target identity and required fields.
 */
function compatible(
  acquired: Acquisition,
  name: string,
  required: string[],
  creationType?: string,
): {
  id: string;
  fields: Array<{ apiName: string; dataType: 'Text' }>;
  key: string | undefined;
} {
  const detail = record(acquired.detail);
  requireProof(Array.isArray(acquired.metadata) && acquired.metadata.length === 1);
  const metadata = record(acquired.metadata[0]);
  const attributes = record(metadata.mktDataModelAttributes);
  requireProof(
    detail.name === name &&
      metadata.fullName === name &&
      detail.dataSpaceName === 'default' &&
      attributes.dataSpaceName === 'default' &&
      typeof detail.id === 'string' &&
      detail.id.trim().length > 0 &&
      (!creationType ||
        (detail.creationType === creationType && attributes.creationType === creationType)),
  );
  const rawFields = fields(detail.fields, 'name');
  const metaFields = fields(metadata.fields, 'fullName');
  const verified = required.map((apiName) => {
    requireProof(
      rawFields.get(apiName)?.type === 'Text' && metaFields.get(apiName)?.type === 'Text',
    );
    return { apiName, dataType: 'Text' as const };
  });
  let key: string | undefined;
  if (!creationType) {
    // Input keys must be explicitly identified by Metadata, not inferred from a name alone.
    const primary = [...metaFields.entries()].filter(([, field]) => {
      // Observed Lookup relationships omit the bag; a present bag must still be a record.
      if (field.type === 'Lookup' && !Object.hasOwn(field, 'mktDataModelFieldAttributes'))
        return false;
      return record(field.mktDataModelFieldAttributes).primaryIndexOrder === '1';
    });
    requireProof(primary.length === 1 && primary[0][0] === 'ssot__Id__c');
    const rawKey = rawFields.get('ssot__Id__c');
    requireProof(
      rawKey?.type === 'Text' &&
        metaFields.get('ssot__Id__c')?.type === 'Text' &&
        (!Object.hasOwn(rawKey, 'isPrimaryKey') || rawKey.isPrimaryKey === true),
    );
    key = 'ssot__Id__c';
  }
  return { id: detail.id as string, fields: verified, key };
}

/**
 * Freshly bind the six exact logical inputs. This is bounded compatibility, not complete DMO schema admission.
 * @param {unknown} value Complete portable IR document.
 * @param {IdentityResolutionTargetConnection} connection Command-owned API67 connection.
 * @param {ApiVersionSelection} selection Explicit API67 family route.
 * @param {string} dataSpace Explicit normalized default space; omissions never default.
 * @param {Function} acquire Independent API65 detail and Metadata acquisition seam.
 * @returns {Promise<{fingerprint: string}>} Stable ordered target-local identity/required-field/key digest.
 */
export async function bindIdentityResolutionDependencies(
  value: unknown,
  connection: IdentityResolutionTargetConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  acquire: Acquire = reader(connection),
): Promise<{ fingerprint: string }> {
  const document = validateIdentityResolutionDocument(value);
  selection = { ...selection };
  scope(connection, selection);
  requireProof(dataSpace === 'default');
  const bindings = [];
  const ids = new Set<string>();
  for (const rule of document.spec.reconciliationRules) {
    const name = rule.entity.apiName;
    const required = [
      'ssot__Id__c',
      ...document.spec.matchRules[0].criteria
        .filter((item) => item.field.parentApiName === name)
        .map((item) => item.field.apiName),
    ];
    const proof = compatible(await acquire(name), name, required);
    requireProof(!ids.has(proof.id));
    ids.add(proof.id);
    bindings.push({ identity: rule.entity, ...proof });
    scope(connection, selection);
  }
  return { fingerprint: createHash('sha256').update(JSON.stringify(bindings)).digest('hex') };
}

/**
 * Re-read the exact settled target owner, then verify only its twelve ordered generated definitions.
 * Required generated fields are exactly the qualified subset: unified Id and link UnifiedRecordId.
 * @param {object} owner Explicit target owner binding, never a source identity.
 * @param {string} owner.targetApiName Exact target owner API name.
 * @param {string} owner.targetId Independently acquired target owner ID.
 * @param {string} owner.dataSpace Explicit default data space.
 * @param {object[]} outputs Ordered target-owner-returned names and logical owner/entity/role identities.
 * @param {IdentityResolutionTargetConnection} connection Command-owned API67 connection.
 * @param {ApiVersionSelection} selection Explicit API67 family route.
 * @param {Function} acquire Independent API65 detail and Metadata acquisition seam.
 * @param {Function} acquireOwner Independent facade/native target owner acquisition seam.
 * @returns {Promise<IdentityResolutionOutputBinding[]>} Independently verified private target bindings.
 */
export async function verifyIdentityResolutionOutputs(
  owner: { targetApiName: string; targetId: string; dataSpace: 'default' },
  outputs: Array<{ identity: IdentityResolutionOutputIdentity; targetApiName: string }>,
  connection: IdentityResolutionTargetConnection,
  selection: ApiVersionSelection,
  acquire: Acquire = reader(connection),
  acquireOwner = retrieveIdentityResolution,
): Promise<IdentityResolutionOutputBinding[]> {
  selection = { ...selection };
  scope(connection, selection);
  requireProof(
    owner?.dataSpace === 'default' &&
      typeof owner.targetId === 'string' &&
      owner.targetId.trim() &&
      /^Individual_[A-Za-z0-9]{4}$/u.test(owner.targetApiName) &&
      Array.isArray(outputs) &&
      outputs.length === 12,
  );
  // Snapshot caller-owned identities/names before asynchronous reads; no generated name is constructed.
  const requested = structuredClone(outputs);
  const target = { ...owner };
  const logicalName = requested[0].identity.owner.logicalName;
  const acquired = await acquireOwner(
    connection,
    target.targetApiName,
    logicalName,
    { ...selection },
    'default',
  );
  requireProof(acquired.expectations && acquired.candidate && acquired.blockers.length === 0);
  const projection = projectIdentityResolution(
    acquired.expectations.facade,
    acquired.expectations.native,
    target.targetApiName,
    logicalName,
  );
  const expected = projection.expectations.outputs.map(({ identity, sourceApiName }) => ({
    identity,
    targetApiName: sourceApiName,
  }));
  requireProof(
    projection.expectations.facade.id === target.targetId && isDeepStrictEqual(requested, expected),
  );
  const bindings: IdentityResolutionOutputBinding[] = [];
  const ids = new Set<string>([target.targetId]);
  for (const output of requested) {
    const creationType = output.identity.role === 'unified' ? 'Derived' : 'Bridge';
    const field = output.identity.role === 'unified' ? 'ssot__Id__c' : 'UnifiedRecordId__c';
    const proof = compatible(
      await acquire(output.targetApiName),
      output.targetApiName,
      [field],
      creationType,
    );
    requireProof(!ids.has(proof.id));
    ids.add(proof.id);
    bindings.push({ ...output, targetId: proof.id, creationType, fields: proof.fields });
    scope(connection, selection);
  }
  const final = await acquireOwner(
    connection,
    target.targetApiName,
    logicalName,
    { ...selection },
    'default',
  );
  requireProof(final.expectations && final.candidate && final.blockers.length === 0);
  const finalProjection = projectIdentityResolution(
    final.expectations.facade,
    final.expectations.native,
    target.targetApiName,
    logicalName,
  );
  requireProof(isDeepStrictEqual(finalProjection, projection));
  scope(connection, selection);
  return bindings;
}
