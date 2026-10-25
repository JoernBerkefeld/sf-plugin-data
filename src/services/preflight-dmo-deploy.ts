import type { Connection } from '@salesforce/core';
import { buildDmoCreateRequestFromDocument } from '../artifacts/dmo-document.js';
import type { DmoCreateRequest } from '../artifacts/dmo-document.js';
import { ConnectClient, ConnectError } from '../transport/connect-client.js';
import { retrieveDmo } from './retrieve-other-dmo.js';

type ReadConnection = Pick<Connection, 'instanceUrl' | 'request' | 'metadata' | 'getApiVersion'>;

export type DmoDeployPreview = {
  outcome: 'create' | 'unchanged' | 'blocked-changes' | 'blocked';
  target: 'absent' | 'present' | 'unknown';
  absenceProof: 'complete-inventory' | 'none';
  diagnostics: Array<{ code: string; message: string }>;
};

const messages = {
  INVALID_SOURCE: 'Supply one valid authored-only DMO document bound to default.',
  INVALID_SCOPE: 'Use an explicit API 65.0 connection and default target data space.',
  TARGET_AUTHENTICATION_FAILED: 'Refresh target authentication, then repeat preview.',
  TARGET_INVENTORY_UNAVAILABLE: 'Obtain a complete valid target inventory, then repeat preview.',
  TARGET_UNQUALIFIED:
    'Resolve target detail, Metadata, generated semantics and relationship qualification before deploying.',
  OBJECT_CHANGED: 'Object label, description or date designation differs; update is not supported.',
  CATEGORY_CHANGED: 'Object category differs; category migration is not supported.',
  FIELD_SET_CHANGED:
    'Authored field identities differ; adding, removing or renaming fields is not supported.',
  FIELD_CHANGED: 'Authored field configuration differs; field updates are not supported.',
  IMMUTABLE_FIELD_CHANGED:
    'Field type or primary-key designation differs; immutable changes are not supported.',
  UPDATE_UNSUPPORTED:
    'Existing changes are blocked until the PATCH contract is proven; no delete/recreate fallback.',
} as const;
type Code = keyof typeof messages;

/**
 * Construct deterministic payload-free diagnostics, never remote errors or authored values.
 * @param {string} outcome Preview classification.
 * @param {string} target Established target state.
 * @param {Code[]} codes Ordered diagnostic codes.
 * @returns {DmoDeployPreview} Internal preview, not mutation authorization.
 */
function preview(
  outcome: DmoDeployPreview['outcome'],
  target: DmoDeployPreview['target'],
  codes: Code[] = [],
): DmoDeployPreview {
  return {
    outcome,
    target,
    absenceProof: target === 'absent' ? 'complete-inventory' : 'none',
    diagnostics: codes.map((code) => ({ code, message: messages[code] })),
  };
}

/**
 * Compare allowlisted authored meaning; exact field identities, not array positions, bind fields.
 * Optional-property absence remains distinct from an explicitly supplied empty value.
 * @param {DmoCreateRequest} source Independently mapped authored input.
 * @param {DmoCreateRequest} target Independently mapped qualified target.
 * @returns {Code[]} Deterministically ordered change reasons, without payload values.
 */
export function compareDmoMeaning(source: DmoCreateRequest, target: DmoCreateRequest): Code[] {
  const codes: Code[] = [];
  if (
    (['label', 'description', 'eventDateTimeFieldName', 'recordModifiedFieldName'] as const).some(
      (key) => source[key] !== target[key],
    )
  )
    codes.push('OBJECT_CHANGED');
  if (source.category !== target.category) codes.push('CATEGORY_CHANGED');
  const fields = new Map(target.fields.map((field) => [field.name, field]));
  if (
    source.fields.length !== fields.size ||
    source.fields.some((field) => !fields.has(field.name))
  )
    codes.push('FIELD_SET_CHANGED');
  let immutable = false;
  let modified = false;
  for (const field of source.fields) {
    const current = fields.get(field.name);
    if (!current) continue;
    immutable ||=
      field.dataType !== current.dataType || field.isPrimaryKey !== current.isPrimaryKey;
    modified ||= (['label', 'description', 'category', 'isDynamicLookup'] as const).some(
      (key) => field[key] !== current[key],
    );
  }
  if (immutable) codes.push('IMMUTABLE_FIELD_CHANGED');
  if (modified) codes.push('FIELD_CHANGED');
  return codes;
}

/**
 * Read-only preflight for one authored standalone DMO; never discovers files or mutates an org.
 * Only the complete inventory contract proves absence; no HTTP error is treated as missing.
 * Existing targets must pass the same full common retrieval semantics as authored export.
 * @param {unknown} document One explicitly selected authored-only DMO document.
 * @param {ReadConnection} connection Explicit authenticated target connection (core owns tokens).
 * @param {unknown} apiVersion Explicit supported API version.
 * @param {unknown} dataSpace Explicit target data space.
 * @returns {Promise<DmoDeployPreview>} Deterministic payload-free classification and remediation.
 */
export async function preflightDmoDeploy(
  document: unknown,
  connection: ReadConnection,
  apiVersion: unknown,
  dataSpace: unknown,
): Promise<DmoDeployPreview> {
  let source: DmoCreateRequest;
  try {
    // Map before any read and detach the source from caller edits across asynchronous acquisition.
    source = buildDmoCreateRequestFromDocument(document, 'default');
  } catch {
    return preview('blocked', 'unknown', ['INVALID_SOURCE']);
  }
  try {
    if (
      apiVersion !== '65.0' ||
      dataSpace !== 'default' ||
      connection.getApiVersion() !== apiVersion
    )
      return preview('blocked', 'unknown', ['INVALID_SCOPE']);
    const client = new ConnectClient(connection, apiVersion);
    const inventory = await client.listDataModelObjects();
    const apiName = `${source.name}__dlm`;
    if (!inventory.some((item) => item.dataSpaceName === dataSpace && item.name === apiName))
      return preview('create', 'absent');
    try {
      const acquired = await retrieveDmo(connection, apiName, apiVersion, dataSpace);
      const target = buildDmoCreateRequestFromDocument(acquired.candidate, dataSpace);
      const codes = compareDmoMeaning(source, target);
      return codes.length === 0
        ? preview('unchanged', 'present')
        : preview('blocked-changes', 'present', [...codes, 'UPDATE_UNSUPPORTED']);
    } catch {
      // Inventory presence is not enough to infer authored equality or update feasibility.
      return preview('blocked', 'present', ['TARGET_UNQUALIFIED']);
    }
  } catch (error: unknown) {
    return preview('blocked', 'unknown', [
      error instanceof ConnectError && error.code === 'AUTHENTICATION_FAILED'
        ? 'TARGET_AUTHENTICATION_FAILED'
        : 'TARGET_INVENTORY_UNAVAILABLE',
    ]);
  }
}
