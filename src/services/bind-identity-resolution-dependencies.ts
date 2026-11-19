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
import { projectDlo, unwrapDlo } from '../artifacts/dlo-document.js';
import { isDataSpaceName } from '../artifacts/data-space-field.js';
import { explainInput } from './operation-diagnostic.js';
import type { IdentityResolutionTargetConnection } from './preflight-identity-resolution-deploy.js';
import type { DocumentMode } from '../artifacts/verbatim-document.js';
import { retrieveIdentityResolution } from './retrieve-identity-resolution.js';

export type IdentityResolutionOutputBinding = {
  identity: IdentityResolutionOutputIdentity;
  targetApiName: string;
  targetId: string;
  creationType?: string;
};
type Acquisition = { detail: unknown };
type Acquire = (name: string, kind?: 'dlo') => Promise<Acquisition>;

/**
 * Require exact independently observed compatibility, never an assumed default.
 * @param {unknown} condition Required compatibility invariant.
 */
function requireProof(condition: unknown): asserts condition {
  if (!condition) throw new IdentityResolutionError('IDENTITY_RESOLUTION_BINDING_UNQUALIFIED');
}

/**
 * Read a record without accepting absent or array-shaped responses.
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
 * Read the native API 68 DMO (in the ruleset's data space) or DLO detail.
 * @param {IdentityResolutionTargetConnection} connection Existing family connection.
 * @param {string} dataSpace The ruleset's data space.
 * @returns {Acquire} Native68 reader.
 */
function reader(connection: IdentityResolutionTargetConnection, dataSpace: string): Acquire {
  return async (name, kind) => ({
    detail: await new ConnectClient(connection, '68.0').get(
      kind === 'dlo'
        ? `/services/data/v68.0/ssot/data-lake-objects/${name}`
        : `/services/data/v68.0/ssot/data-model-objects/${name}?dataspace=${encodeURIComponent(dataSpace)}`,
    ),
  });
}

/**
 * The refusal of a ruleset that names a component of another data space than its own.
 * @param {string} what What the ruleset names (`the DMO X`, `the DLO X`).
 * @param {unknown} found The data space the org names for it (or the DLO's list).
 * @param {string} dataSpace The ruleset's data space.
 * @returns {IdentityResolutionError} IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE.
 */
function otherSpace(what: string, found: unknown, dataSpace: string): IdentityResolutionError {
  return explainInput(
    new IdentityResolutionError('IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE'),
    `The ruleset names ${what}, which is in the data space ${typeof found === 'string' && found ? found : '(none named)'}, not in the ruleset's data space ${dataSpace}. Name the component of the ruleset's data space (outside default a standard DMO copy is <prefix>_<Name> with fields without ssot__); nothing was written.`,
  );
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
 * Check the object's identity, data space and referenced fields in its native API 68 detail.
 * Field types and primary keys are recorded as observed; the API decides what it accepts.
 * @param {Acquisition} acquired Native DMO detail.
 * @param {string} name Exact expected DMO name.
 * @param {string[]} required Fields the definition references.
 * @param {string} dataSpace The ruleset's data space; a DMO the read names in another one is
 * IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE.
 * @returns {object} Private target identity, referenced fields and observed keys.
 */
function compatible(
  acquired: Acquisition,
  name: string,
  required: string[],
  dataSpace: string,
): {
  id: string;
  creationType: unknown;
  fields: Array<{ apiName: string; dataType: unknown }>;
  keys: string[];
} {
  const detail = record(acquired.detail);
  if (detail.name === name && detail.dataSpaceName !== dataSpace)
    throw otherSpace(`the DMO ${name}`, detail.dataSpaceName, dataSpace);
  requireProof(
    detail.name === name && typeof detail.id === 'string' && detail.id.trim().length > 0,
  );
  const rawFields = fields(detail.fields, 'name');
  const verified = required.map((apiName) => {
    requireProof(rawFields.has(apiName));
    return { apiName, dataType: rawFields.get(apiName)?.type };
  });
  const keys = [...rawFields.entries()]
    .filter(([, field]) => field.isPrimaryKey === true)
    .map(([key]) => key);
  return { id: detail.id as string, creationType: detail.creationType, fields: verified, keys };
}

/**
 * Freshly bind the referenced inputs. This is bounded compatibility, not complete DMO schema admission.
 * @param {unknown} value Complete portable IR document.
 * @param {IdentityResolutionTargetConnection} connection Command-owned API68 connection.
 * @param {ApiVersionSelection} selection Explicit API68 family route.
 * @param {string} dataSpace The run's data space; the ruleset's c__dataSpace must name it.
 * @param {Function} acquire Native API 68 detail acquisition seam.
 * @param {DocumentMode} [mode] How the IR is checked: `retrieve` admits a retrieved file (delete).
 * @returns {Promise<{fingerprint: string}>} Stable ordered target-local identity/required-field/key digest.
 */
export async function bindIdentityResolutionDependencies(
  value: unknown,
  connection: IdentityResolutionTargetConnection,
  selection: ApiVersionSelection,
  dataSpace: string,
  acquire: Acquire = reader(connection, dataSpace),
  mode: DocumentMode = 'deploy',
): Promise<{ fingerprint: string }> {
  const document = validateIdentityResolutionDocument(value, mode);
  selection = { ...selection };
  scope(connection, selection);
  requireProof(document.c__dataSpace === dataSpace);
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
    const proof = compatible(await acquireOnce(name), name, required, dataSpace);
    requireProof(!ids.has(proof.id));
    ids.add(proof.id);
    const priorities = [];
    for (const settings of [rule, ...rule.fields]) {
      const sources = [];
      for (const source of settings.sources) {
        const acquired = await acquireOnce(source.apiName, 'dlo');
        const raw = unwrapDlo(acquired.detail);
        // A DLO source must belong to the ruleset's data space (it may belong to others too).
        const portable = projectDlo(raw);
        if (raw.name === source.apiName && !portable.c__dataSpace.includes(dataSpace))
          throw otherSpace(
            `the DLO ${source.apiName}`,
            portable.c__dataSpace.join(', '),
            dataSpace,
          );
        requireProof(
          portable.identity.apiName === source.apiName &&
            raw.status === 'ACTIVE' &&
            typeof raw.id === 'string' &&
            raw.id.trim().length > 0,
        );
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
 * @param {string} owner.dataSpace The ruleset's data space (the run's).
 * @param {object[]} outputs Ordered target-owner-returned names and logical owner/entity/role identities.
 * @param {IdentityResolutionTargetConnection} connection Command-owned connection.
 * @param {ApiVersionSelection} selection Explicit family route.
 * @param {Function} acquire Native API 68 detail acquisition seam.
 * @param {Function} acquireOwner Independent native target owner acquisition seam.
 * @param {DocumentMode} [mode] How the owner GET is read: `retrieve` keeps keys the plugin does not
 * model (delete).
 * @returns {Promise<IdentityResolutionOutputBinding[]>} Independently verified private target bindings.
 */
export async function verifyIdentityResolutionOutputs(
  owner: { targetApiName: string; targetId: string; dataSpace: string },
  outputs: Array<{ identity: IdentityResolutionOutputIdentity; targetApiName: string }>,
  connection: IdentityResolutionTargetConnection,
  selection: ApiVersionSelection,
  acquire: Acquire = reader(connection, owner?.dataSpace),
  acquireOwner = retrieveIdentityResolution,
  mode: DocumentMode = 'deploy',
): Promise<IdentityResolutionOutputBinding[]> {
  selection = { ...selection };
  scope(connection, selection);
  requireProof(
    isDataSpaceName(owner?.dataSpace) &&
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
    target.dataSpace,
    mode,
  );
  if (!acquired.expectations || !acquired.candidate || acquired.blockers.length > 0)
    throw retainConnectDiagnostic(
      new IdentityResolutionError('IDENTITY_RESOLUTION_BINDING_UNQUALIFIED'),
      getConnectDiagnostic(acquired),
    );
  const projection = projectNativeIdentityResolution(
    acquired.expectations.native,
    target.targetApiName,
    mode,
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
    const proof = compatible(
      await acquire(output.targetApiName),
      output.targetApiName,
      [],
      target.dataSpace,
    );
    requireProof(!ids.has(proof.id));
    ids.add(proof.id);
    bindings.push({
      ...output,
      targetId: proof.id,
      ...(typeof proof.creationType === 'string' ? { creationType: proof.creationType } : {}),
    });
    scope(connection, selection);
  }
  const final = await acquireOwner(
    connection,
    target.targetApiName,
    { ...selection },
    target.dataSpace,
    mode,
  );
  if (!final.expectations || !final.candidate || final.blockers.length > 0)
    throw retainConnectDiagnostic(
      new IdentityResolutionError('IDENTITY_RESOLUTION_BINDING_UNQUALIFIED'),
      getConnectDiagnostic(final),
    );
  const finalProjection = projectNativeIdentityResolution(
    final.expectations.native,
    target.targetApiName,
    mode,
  );
  requireProof(isDeepStrictEqual(finalProjection, projection));
  scope(connection, selection);
  return bindings;
}
