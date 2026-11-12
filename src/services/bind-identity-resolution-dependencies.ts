import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  IdentityResolutionError,
  projectNativeIdentityResolution,
  validateIdentityResolutionDocument,
} from '../artifacts/identity-resolution-document.js';
import type { IdentityResolutionOutputIdentity } from '../artifacts/identity-resolution-document.js';
import type { ApiVersionSelection } from '../transport/api-version.js';
import { ConnectClient } from '../transport/connect-client.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { normalizeDlo, unwrapDlo } from '../artifacts/dlo-document.js';
import type { IdentityResolutionTargetConnection } from './preflight-identity-resolution-deploy.js';
import { readDmoMetadata } from './read-metadata.js';
import { retrieveIdentityResolution } from './retrieve-identity-resolution.js';

export type IdentityResolutionOutputBinding = {
  identity: IdentityResolutionOutputIdentity;
  targetApiName: string;
  targetId: string;
  creationType?: string;
};
type Acquisition = { detail: unknown; metadata: unknown };
type Acquire = (name: string, kind?: 'dlo') => Promise<Acquisition>;

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
 * Admit exact native68 binding only.
 * @param {IdentityResolutionTargetConnection} connection Existing family connection.
 * @param {ApiVersionSelection} selection Explicit family version selection.
 */
function scope(
  connection: IdentityResolutionTargetConnection,
  selection: ApiVersionSelection,
): void {
  requireProof(
    selection?.requested === '68.0' &&
      selection.restSelector === 'v68.0' &&
      selection.soapNumeric === '68.0' &&
      connection.getApiVersion() === '68.0',
  );
}

/**
 * Use an operation-local API68 receiver without mutating the caller's connection or Metadata client.
 * @param {IdentityResolutionTargetConnection} connection Existing family connection.
 * @returns {Acquire} Native68 reader.
 */
function reader(connection: IdentityResolutionTargetConnection): Acquire {
  return async (name, kind) => {
    const receiver = Object.create(connection) as Parameters<typeof readDmoMetadata>[0];
    Object.defineProperty(receiver, 'version', { value: '68.0' });
    Object.defineProperty(receiver, '_refreshDelegate', { value: undefined });
    return {
      detail: await new ConnectClient(connection, '68.0').get(
        `/services/data/v68.0/ssot/${kind === 'dlo' ? 'data-lake-objects' : 'data-model-objects'}/${name}`,
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
      typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/u.test(name) && !result.has(name),
    );
    result.set(name, field);
  }
  return result;
}

/**
 * Correlate exact object/space and referenced fields in independent REST and Metadata reads.
 * Field types and keys are recorded as observed; the API decides what it accepts.
 * @param {Acquisition} acquired Independent raw representations.
 * @param {string} name Exact expected DMO name.
 * @param {string[]} required Fields the definition references.
 * @returns {object} Private target identity, referenced fields and observed keys.
 */
function compatible(
  acquired: Acquisition,
  name: string,
  required: string[],
): {
  id: string;
  creationType: unknown;
  fields: Array<{ apiName: string; dataType: unknown }>;
  keys: string[];
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
      detail.id.trim().length > 0,
  );
  const rawFields = fields(detail.fields, 'name');
  const metaFields = fields(metadata.fields, 'fullName');
  const verified = required.map((apiName) => {
    requireProof(rawFields.has(apiName) && metaFields.has(apiName));
    return { apiName, dataType: rawFields.get(apiName)?.type };
  });
  const keys = [...metaFields.entries()]
    .filter(([, field]) => {
      const bag = field.mktDataModelFieldAttributes;
      return Boolean(
        bag &&
        typeof bag === 'object' &&
        (bag as Record<string, unknown>).primaryIndexOrder === '1',
      );
    })
    .map(([key]) => key);
  return { id: detail.id as string, creationType: detail.creationType, fields: verified, keys };
}

/**
 * Freshly bind the referenced inputs. This is bounded compatibility, not complete DMO schema admission.
 * @param {unknown} value Complete portable IR document.
 * @param {IdentityResolutionTargetConnection} connection Command-owned API68 connection.
 * @param {ApiVersionSelection} selection Explicit API68 family route.
 * @param {string} dataSpace Explicit normalized default space; omissions never default.
 * @param {Function} acquire Independent detail and Metadata acquisition seam.
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
  const acquisitions = new Map<string, Acquisition>();
  const acquireOnce: Acquire = async (name, kind) => {
    const cacheKey = `${kind ?? 'dmo'}:${name}`;
    const cached = acquisitions.get(cacheKey);
    if (cached) return cached;
    const acquired = kind ? await acquire(name, kind) : await acquire(name);
    acquisitions.set(cacheKey, acquired);
    return acquired;
  };
  const bindings = [];
  const ids = new Set<string>();
  for (const rule of document.spec.reconciliationRules) {
    const name = rule.entity.apiName;
    const required = [
      ...new Set([
        ...document.spec.matchRules
          .flatMap((match) => match.criteria)
          .filter((item) => item.field.parentApiName === name)
          .map((item) => item.field.apiName),
        ...rule.fields.map((override) => override.field.apiName),
      ]),
    ];
    const proof = compatible(await acquireOnce(name), name, required);
    requireProof(!ids.has(proof.id));
    ids.add(proof.id);
    const priorities = [];
    for (const settings of [rule, ...rule.fields]) {
      const sources = [];
      for (const source of settings.sources) {
        const acquired = await acquireOnce(source.apiName, 'dlo');
        const raw = unwrapDlo(acquired.detail);
        const portable = normalizeDlo(raw, 'default');
        requireProof(
          portable.identity.apiName === source.apiName &&
            raw.status === 'ACTIVE' &&
            typeof raw.id === 'string' &&
            raw.id.trim().length > 0,
        );
        requireProof(Array.isArray(acquired.metadata) && acquired.metadata.length === 1);
        const metadata = record(acquired.metadata[0]);
        requireProof(metadata.fullName === source.apiName);
        const rawFields = fields(raw.dataLakeFieldInfoRepresentation ?? raw.fields, 'name');
        const metaFields = fields(metadata.fields, 'fullName');
        requireProof(rawFields.size === metaFields.size);
        for (const [name, field] of rawFields) {
          const metadataType = metaFields.get(name)?.type;
          // Native DLO Boolean fields are represented as Checkbox in Metadata reads.
          requireProof(
            metadataType === field.dataType ||
              (field.dataType === 'Boolean' && metadataType === 'Checkbox'),
          );
        }
        sources.push({
          identity: source,
          targetId: raw.id,
          fields: portable.spec.fields.map(({ name, dataType, isPrimaryKey }) => ({
            name,
            dataType,
            isPrimaryKey,
          })),
        });
        scope(connection, selection);
      }
      priorities.push({ field: 'field' in settings ? settings.field : undefined, sources });
    }
    bindings.push({
      identity: rule.entity,
      ...proof,
      ...(priorities.some((entry) => entry.sources.length > 0) ? { priorities } : {}),
    });
    scope(connection, selection);
  }
  return { fingerprint: createHash('sha256').update(JSON.stringify(bindings)).digest('hex') };
}

/**
 * Re-read the exact settled target owner, then bind each generated definition it names
 * (identity, data space and unique ID; the creation type is recorded as observed).
 * @param {object} owner Explicit target owner binding, never a source identity.
 * @param {string} owner.targetApiName Exact target owner API name.
 * @param {string} owner.targetId Independently acquired target owner ID.
 * @param {string} owner.dataSpace Explicit default data space.
 * @param {object[]} outputs Ordered target-owner-returned names and logical owner/entity/role identities.
 * @param {IdentityResolutionTargetConnection} connection Command-owned connection.
 * @param {ApiVersionSelection} selection Explicit family route.
 * @param {Function} acquire Independent detail and Metadata acquisition seam.
 * @param {Function} acquireOwner Independent native target owner acquisition seam.
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
      typeof owner.targetApiName === 'string' &&
      /^[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(owner.targetApiName) &&
      Array.isArray(outputs),
  );
  // Snapshot caller-owned identities/names before asynchronous reads; no generated name is constructed.
  const requested = structuredClone(outputs);
  const target = { ...owner };
  requireProof(requested.every((output) => output.identity.owner.apiName === target.targetApiName));
  const acquired = await acquireOwner(
    connection,
    target.targetApiName,
    { ...selection },
    'default',
  );
  if (!acquired.expectations || !acquired.candidate || acquired.blockers.length > 0)
    throw retainConnectDiagnostic(
      new IdentityResolutionError('IDENTITY_RESOLUTION_BINDING_UNQUALIFIED'),
      getConnectDiagnostic(acquired),
    );
  const projection = projectNativeIdentityResolution(
    acquired.expectations.native,
    target.targetApiName,
  );
  const expected = projection.expectations.outputs.map(({ identity, sourceApiName }) => ({
    identity,
    targetApiName: sourceApiName,
  }));
  requireProof(
    projection.expectations.native.id === target.targetId && isDeepStrictEqual(requested, expected),
  );
  const bindings: IdentityResolutionOutputBinding[] = [];
  const ids = new Set<string>([target.targetId]);
  for (const output of requested) {
    const proof = compatible(await acquire(output.targetApiName), output.targetApiName, []);
    requireProof(!ids.has(proof.id));
    ids.add(proof.id);
    bindings.push({
      ...output,
      targetId: proof.id,
      ...(typeof proof.creationType === 'string' ? { creationType: proof.creationType } : {}),
    });
    scope(connection, selection);
  }
  const final = await acquireOwner(connection, target.targetApiName, { ...selection }, 'default');
  if (!final.expectations || !final.candidate || final.blockers.length > 0)
    throw retainConnectDiagnostic(
      new IdentityResolutionError('IDENTITY_RESOLUTION_BINDING_UNQUALIFIED'),
      getConnectDiagnostic(final),
    );
  const finalProjection = projectNativeIdentityResolution(
    final.expectations.native,
    target.targetApiName,
  );
  requireProof(isDeepStrictEqual(finalProjection, projection));
  scope(connection, selection);
  return bindings;
}
