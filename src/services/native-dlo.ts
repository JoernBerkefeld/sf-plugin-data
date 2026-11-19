import { sameEnum, sameRecord } from '../artifacts/enum-case.js';
import { explainInput, explainMismatch, printableKey } from './operation-diagnostic.js';
import {
  DloError,
  dloDataSpaces,
  dloName,
  dloSystemFields,
  isGeneratedDloField,
  normalizeDlo,
  projectDlo,
  unwrapDlo,
  validateDloDocument,
} from '../artifacts/dlo-document.js';
import type { DloDocument, DloField } from '../artifacts/dlo-document.js';
import { sortedDataSpaces } from '../artifacts/data-space-field.js';
import type { DloClient } from '../transport/dlo-rest.js';
import type { DocumentMode } from '../artifacts/verbatim-document.js';
import { getConnectDiagnostic, retainConnectDiagnostic } from '../transport/connect-diagnostic.js';
import { replaceExplanation } from './operation-diagnostic.js';
import { paceReadback, readbackPace } from './readback-pace.js';

/** Data spaces a deploy adds the DLO to and removes it from (both sorted). */
export type DloMembershipChange = { add: string[]; remove: string[] };

export type DloDeployPlan = {
  /** `update` also when only the data spaces change. */
  operation: 'create' | 'update' | 'unchanged';
  apiName: string;
  targetId?: string;
  /** POST or PATCH body of the definition; absent when the definition itself is unchanged. */
  body?: Record<string, unknown>;
  /** The org definition, when the definition is unchanged. */
  document?: DloDocument;
  /** Every data space of the file, sorted. */
  dataSpaces: string[];
  membership: DloMembershipChange;
};

/** What a DLO deploy may do besides the definition. */
export type DloDeployOptions = {
  /** Remove the DLO from org data spaces the file no longer lists (--allow-dataspace-removal). */
  allowDataspaceRemoval?: boolean;
};

/** Keys a data space member entry has (live API 68); any other key, such as a filter, refuses. */
const memberKeys: ReadonlySet<string> = new Set(['memberLabel', 'memberName', 'status']);
// Member list pages read at most; a server that keeps answering stops the read.
const memberPageLimit = 100;

/** Field keys Salesforce stores in its own letter case (`text` reads `Text`, live API 68). */
const dloFieldEnums: ReadonlySet<string> = new Set(['dataType']);

/**
 * Identify qualified generated qualifier/system fields, never generic Id-bearing fields.
 * @param {DloField} field Portable definition.
 * @returns {boolean} Whether native create generates this field.
 */
function generated(field: DloField): boolean {
  return dloSystemFields.has(field.name) || field.name.startsWith('KQ_');
}

/**
 * Convert the saved API field name to native input without losing definitions.
 * @param {DloField} field Saved field.
 * @returns {Record<string, unknown>} Native field input.
 */
function fieldInput(field: DloField): Record<string, unknown> {
  return { ...field, name: field.name.slice(0, -3) };
}

/**
 * Data space names as they may appear in a message.
 * @param {string[]} spaces Names.
 * @returns {string} Comma-separated printable names.
 */
function spaceList(spaces: string[]): string {
  return spaces.map((space) => printableKey(space)).join(', ');
}

/**
 * Resolve exactly the requested API name in the target, retaining only its current target ID.
 * @param {string} apiName Requested full API name.
 * @param {DloClient} client Target client.
 * @param {string} dataSpace The run's data space; the DLO must belong to it.
 * @param {DocumentMode} [mode] `retrieve` keeps what the plugin cannot deploy and admits a
 * 15-character ID.
 * @returns {Promise<{document: DloDocument, targetId: string}>} Definition and target identity.
 */
export async function resolveNativeDloTarget(
  apiName: string,
  client: Pick<DloClient, 'get'>,
  dataSpace: string,
  mode: DocumentMode = 'deploy',
): Promise<{ document: DloDocument; targetId: string; runtime: Record<string, unknown> }> {
  const raw = unwrapDlo(await client.get(apiName));
  const document = normalizeDlo(raw, dataSpace, mode);
  if (document.identity.apiName !== apiName) throw new DloError('DLO_TARGET_IDENTITY_MISMATCH');
  // A missing or unusual ID is a shape the plugin does not model, not another DLO.
  if (
    typeof raw.id !== 'string' ||
    !(mode === 'retrieve' ? /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/u : /^[A-Za-z0-9]{18}$/u).test(
      raw.id,
    )
  )
    throw new DloError('INVALID_DLO_TARGET_ID');
  return { document, targetId: raw.id, runtime: structuredClone(raw) };
}

/**
 * Retrieve a portable definition by its full API name, never saving the source ID. The file lists
 * every data space of the DLO; the DLO must belong to the run's data space.
 * @param {string} apiName Exact name ending in __dll.
 * @param {Pick<DloClient, 'get'>} client Authenticated target client.
 * @param {string} dataSpace The run's data space.
 * @param {DocumentMode} [mode] `retrieve` for the retrieve command; other callers stay strict.
 * @returns {Promise<DloDocument>} Portable definition.
 */
export async function retrieveNativeDlo(
  apiName: string,
  client: Pick<DloClient, 'get'>,
  dataSpace: string,
  mode: DocumentMode = 'deploy',
): Promise<DloDocument> {
  const target = await resolveNativeDloTarget(apiName, client, dataSpace, mode);
  return target.document;
}

/**
 * Read the complete member list of a data space (every page, by continuation token). The list is
 * complete only when its distinct member names number exactly the `totalSize` every page states;
 * every member must be ACTIVE or PROCESSING, carry only the keys the plugin knows (no filter) and
 * a DLO name. Anything else refuses with DLO_DATASPACE_MEMBERS_UNREADABLE, so a full-list PUT
 * never drops what the plugin could not read. This fails closed: an org whose member list states
 * one member more than it lists (seen live for `default`, totalSize 99 with 98 listed) cannot get
 * a DLO added to that data space by the plugin.
 * @param {string} dataSpace Data space name.
 * @param {Pick<DloClient, 'members'>} client Target client.
 * @returns {Promise<string[]>} Member names in list order.
 */
export async function readDataSpaceMembers(
  dataSpace: string,
  client: Pick<DloClient, 'members'>,
): Promise<string[]> {
  const unreadable = (detail: string): DloError =>
    explainInput(
      new DloError('DLO_DATASPACE_MEMBERS_UNREADABLE'),
      `The member list of data space ${printableKey(dataSpace)} ${detail}, so it was not changed.`,
    );
  const names: string[] = [];
  let total: number | undefined;
  let token: string | undefined;
  for (let page = 0; page < memberPageLimit; page++) {
    const body = (await client.members(dataSpace, token)) as {
      members?: unknown;
      continuationToken?: unknown;
      totalSize?: unknown;
    };
    if (!Array.isArray(body.members)) throw unreadable('could not be read in the expected form');
    if (
      typeof body.totalSize !== 'number' ||
      !Number.isSafeInteger(body.totalSize) ||
      (total !== undefined && body.totalSize !== total)
    )
      throw unreadable('states no stable member count (totalSize)');
    total = body.totalSize;
    for (const entry of body.members) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        throw unreadable('holds an entry that is not a member');
      const unknown = Object.keys(entry).find((key) => !memberKeys.has(key));
      if (unknown !== undefined)
        throw unreadable(
          `holds a member with the key ${printableKey(unknown)} (such as a filter), which the plugin does not read`,
        );
      const { memberName: name, status } = entry as { memberName?: unknown; status?: unknown };
      if (typeof name !== 'string' || !dloName.test(name))
        throw unreadable('holds a member without a DLO name');
      if (status !== 'ACTIVE' && status !== 'PROCESSING')
        throw unreadable(`holds the member ${name} in a state other than ACTIVE or PROCESSING`);
      if (names.includes(name)) throw unreadable(`lists the member ${name} twice`);
      names.push(name);
    }
    if (body.continuationToken === undefined || body.continuationToken === null) {
      if (names.length !== total)
        throw unreadable(`lists ${names.length} members but states ${total}`);
      return names;
    }
    if (typeof body.continuationToken !== 'string' || body.members.length === 0)
      throw unreadable('could not be read to its end');
    token = body.continuationToken;
  }
  throw unreadable('could not be read to its end');
}
/**
 * Preflight one native deploy: only authoritative absence selects create.
 * Updates permit label, record-modified field and ordinary field additions, refusing any
 * removed/changed field or key. The file's data space list (`c__dataSpace`) must hold the run's
 * data space; the DLO is added to listed spaces it is not in yet, and removed from org spaces the
 * file no longer lists only with `allowDataspaceRemoval`. The member list of every space the DLO
 * joins is read here, so an unreadable one refuses before any write.
 * @param {unknown} value Saved document.
 * @param {DloClient} client Authenticated target client.
 * @param {string} dataSpace The run's data space.
 * @param {DloDeployOptions} [options] Data space removal permission.
 * @returns {Promise<DloDeployPlan>} Target-bound write plan with no source IDs.
 */
export async function preflightNativeDlo(
  value: unknown,
  client: DloClient,
  dataSpace: string,
  options: DloDeployOptions = {},
): Promise<DloDeployPlan> {
  const desired = validateDloDocument(value);
  const apiName = desired.identity.apiName;
  const dataSpaces = sortedDataSpaces(desired.c__dataSpace);
  if (!dataSpaces.includes(dataSpace))
    throw explainInput(
      new DloError('DLO_DATASPACE_MISMATCH'),
      `The file lists the data spaces ${spaceList(dataSpaces)} in c__dataSpace, not the run's data space ${printableKey(dataSpace)} (--dataspace, default "default").`,
    );
  let raw: Record<string, unknown>;
  try {
    raw = unwrapDlo(await client.get(apiName));
  } catch (error) {
    if (!(error instanceof DloError) || error.code !== 'DLO_HTTP_ERROR' || error.status !== 404)
      throw error;
    const fields = desired.spec.fields.filter((field) => !generated(field));
    if (fields.filter((field) => field.isPrimaryKey).length !== 1)
      throw new DloError('INVALID_DLO_PRIMARY_KEY');
    const add = dataSpaces.filter((space) => space !== dataSpace);
    for (const space of add) await readDataSpaceMembers(space, client);
    return {
      operation: 'create',
      apiName,
      // Create sends the run's space; whether a create takes several is not proven, so the
      // other listed spaces are added afterwards through the members route.
      body: {
        name: apiName.slice(0, -5),
        label: desired.spec.label,
        category: desired.spec.category,
        ...(desired.spec.eventDateTimeFieldName === undefined
          ? {}
          : { eventDateTimeFieldName: desired.spec.eventDateTimeFieldName.slice(0, -3) }),
        ...(desired.spec.recordModifiedFieldName === undefined
          ? {}
          : { recordModifiedFieldName: desired.spec.recordModifiedFieldName.slice(0, -3) }),
        dataspaceInfo: [{ name: dataSpace }],
        dataLakeFieldInputRepresentations: fields.map((field) => fieldInput(field)),
      },
      dataSpaces,
      membership: { add, remove: [] },
    };
  }
  const target = projectDlo(raw);
  if (target.identity.apiName !== apiName) throw new DloError('DLO_TARGET_IDENTITY_MISMATCH');
  if (typeof raw.id !== 'string' || !/^[A-Za-z0-9]{18}$/u.test(raw.id))
    throw new DloError('INVALID_DLO_TARGET_ID');
  const targetId = raw.id;
  const membership = {
    add: dataSpaces.filter((space) => !target.c__dataSpace.includes(space)),
    remove: target.c__dataSpace.filter((space) => !dataSpaces.includes(space)),
  };
  if (membership.remove.length > 0 && options.allowDataspaceRemoval !== true)
    throw explainInput(
      new DloError('DLO_DATASPACE_REMOVAL_NOT_ALLOWED'),
      `${apiName} belongs to the data spaces ${spaceList(membership.remove)} in the org, which c__dataSpace does not list. Removing a DLO from a data space needs --allow-dataspace-removal; otherwise add them to c__dataSpace.`,
    );
  // Neither can change after create: a PATCH naming them is rejected (HTTP 400, live API 68).
  // Salesforce stores the category and field types in its own letter case (`other` reads `Other`).
  if (!sameEnum(desired.spec.category, target.spec.category))
    throw new DloError('UNSUPPORTED_DLO_CATEGORY_CHANGE');
  if (
    desired.spec.eventDateTimeFieldName !== undefined &&
    desired.spec.eventDateTimeFieldName !== target.spec.eventDateTimeFieldName
  )
    throw explainMismatch(
      new DloError('UNSUPPORTED_DLO_EVENT_FIELD_CHANGE'),
      'event field preservation',
      apiName,
      target.spec.eventDateTimeFieldName,
      desired.spec.eventDateTimeFieldName,
      'spec.eventDateTimeFieldName',
      'The event field of a data lake object is set on create and cannot be changed.',
    );
  const existing = new Map(target.spec.fields.map((field) => [field.name, field]));
  const incoming = new Map(desired.spec.fields.map((field) => [field.name, field]));
  for (const [name, field] of existing) {
    // Fields Salesforce generated (system fields and the key qualifier of another field) stay
    // as they are when the file does not list them; retrieve leaves out exactly these.
    if (!incoming.has(name) && isGeneratedDloField(field, target.spec.fields)) continue;
    const listed = incoming.get(name);
    // A listed field is compared on the keys the file states; keys only the org adds are kept.
    const observed = listed
      ? Object.fromEntries(Object.entries(field).filter(([key]) => key in listed))
      : field;
    if (!listed || !sameRecord(observed, listed, dloFieldEnums))
      throw explainMismatch(
        new DloError('UNSUPPORTED_DLO_FIELD_CHANGE'),
        'update field preservation',
        apiName,
        field,
        incoming.get(name),
        `fields.${name}`,
        'Salesforce only adds fields to an existing data lake object: a changed field is rejected (HTTP 400), and removing one is refused by the Metadata API ("setup object in use"); only external data lake objects have a field delete route.',
      );
  }
  const added = desired.spec.fields.filter((field) => !existing.has(field.name));
  if (added.some((field) => generated(field) || field.isPrimaryKey))
    throw new DloError('UNSUPPORTED_DLO_FIELD_ADDITION');
  for (const space of membership.add) await readDataSpaceMembers(space, client);
  // Salesforce sets the record-modified field once: a PATCH naming one while the DLO has one is
  // answered with HTTP 400 "Record modified field already present" (live API 68), and that answer
  // is reported. A file without the key leaves the org's value as it is.
  const recordModified =
    desired.spec.recordModifiedFieldName !== undefined &&
    desired.spec.recordModifiedFieldName !== target.spec.recordModifiedFieldName
      ? { recordModifiedFieldName: desired.spec.recordModifiedFieldName.slice(0, -3) }
      : {};
  const definitionUnchanged =
    added.length === 0 &&
    desired.spec.label === target.spec.label &&
    Object.keys(recordModified).length === 0;
  const membershipUnchanged = membership.add.length === 0 && membership.remove.length === 0;
  if (definitionUnchanged)
    return {
      operation: membershipUnchanged ? 'unchanged' : 'update',
      apiName,
      targetId,
      document: target,
      dataSpaces,
      membership,
    };
  return {
    operation: 'update',
    apiName,
    targetId,
    body: {
      label: desired.spec.label,
      ...recordModified,
      ...(added.length > 0
        ? { dataLakeFieldInputRepresentations: added.map((field) => fieldInput(field)) }
        : {}),
    },
    dataSpaces,
    membership,
  };
}

/**
 * Change the data spaces of a DLO as planned, then read it until it lists exactly the planned
 * spaces (a membership change answers PROCESSING and settles within seconds, live API 68).
 * Adding sends the space's complete member list, read right before, plus the DLO with one PUT;
 * removing sends one DELETE of that member. Nothing is resent.
 * @param {DloDeployPlan} plan Preflighted plan.
 * @param {DloClient} client Target client.
 * @param {string} dataSpace The run's data space.
 * @returns {Promise<DloDocument>} The DLO as read once it lists the planned spaces.
 */
async function changeDataSpaces(
  plan: DloDeployPlan,
  client: DloClient,
  dataSpace: string,
): Promise<DloDocument> {
  // The members each space had right before its PUT; all of them must still be there after it.
  const before = new Map<string, string[]>();
  for (const space of plan.membership.add) {
    const members = await readDataSpaceMembers(space, client);
    before.set(space, members);
    if (!members.includes(plan.apiName)) await client.putMembers(space, [...members, plan.apiName]);
  }
  for (const space of plan.membership.remove) await client.removeMember(space, plan.apiName);
  let observed: string[] = [];
  for (let attempt = 0; attempt < readbackPace.attempts; attempt++) {
    await paceReadback(attempt);
    const readback = unwrapDlo(await client.get(plan.apiName));
    observed = dloDataSpaces(readback);
    if (observed.join('\n') === plan.dataSpaces.join('\n')) {
      // Whether a PUT adds or replaces is not proven: every member read before it must remain.
      for (const [space, members] of before) {
        const after = await readDataSpaceMembers(space, client);
        const missing = [...members, plan.apiName].filter((name) => !after.includes(name));
        if (missing.length > 0)
          throw explainInput(
            new DloError('DLO_DATASPACE_MEMBERS_CHANGED'),
            `Data space ${printableKey(space)} no longer lists ${missing.join(', ')} after ${plan.apiName} was added. Check its members in the org and restore them before any further deploy.`,
          );
      }
      return normalizeDlo(readback, dataSpace);
    }
  }
  throw explainInput(
    new DloError('DLO_DATASPACE_NOT_SETTLED'),
    `${plan.apiName} still lists the data spaces ${spaceList(observed)} instead of ${spaceList(plan.dataSpaces)}. Read the DLO in the org before deploying again.`,
  );
}

/**
 * Resolve and preflight immediately before one write; no retries or cached-plan replay.
 * @param {unknown} value Portable document.
 * @param {DloClient} client Target client.
 * @param {string} dataSpace The run's data space.
 * @param {DloDeployOptions} [options] Data space removal permission.
 * @returns {Promise<{operation: 'create' | 'update' | 'unchanged', document: DloDocument}>} Accepted or unchanged definition, not terminal activation proof.
 */
export async function deployNativeDlo(
  value: unknown,
  client: DloClient,
  dataSpace: string,
  options: DloDeployOptions = {},
): Promise<{
  operation: 'create' | 'update' | 'unchanged';
  document: DloDocument;
  serverProcessing?: true;
}> {
  const desired = validateDloDocument(value);
  const plan = await preflightNativeDlo(desired, client, dataSpace, options);
  if (plan.operation === 'unchanged') return { operation: 'unchanged', document: plan.document! };
  let document = plan.document;
  let serverProcessing = false;
  if (plan.body !== undefined) {
    const response =
      plan.operation === 'create'
        ? await client.create(plan.body)
        : await client.update(plan.targetId!, plan.body);
    document = projectDlo(response);
    if (document.identity.apiName !== plan.apiName)
      throw new DloError('DLO_TARGET_IDENTITY_MISMATCH');
    // A create lands in the run's space only; an update keeps the spaces the DLO had.
    if (!document.c__dataSpace.includes(dataSpace) && plan.membership.add.length === 0)
      throw new DloError('DLO_DATASPACE_MISMATCH');
    serverProcessing = unwrapDlo(response).status === 'PROCESSING';
  }
  if (plan.membership.add.length > 0 || plan.membership.remove.length > 0)
    document = await changeDataSpaces(plan, client, dataSpace);
  return {
    operation: plan.operation,
    document: document!,
    ...(serverProcessing ? { serverProcessing: true as const } : {}),
  };
}

/**
 * Identity a delete needs from a DLO GET, without projecting the rest: the same name, membership
 * in the run's data space and an 18-character record ID. A DELETE removes the DLO from every data
 * space, so a DLO that also belongs to other spaces refuses (DLO_DELETE_OTHER_DATASPACES); deploy
 * a shorter c__dataSpace list with --allow-dataspace-removal instead. Fields, labels and keys the
 * plugin does not model never block a delete.
 * @param {string} apiName Requested full API name.
 * @param {Pick<DloClient, 'get'>} client Target client.
 * @param {string} dataSpace The run's data space.
 * @returns {Promise<{identity: {apiName: string; dataSpace: string}; targetId: string}>} Target.
 */
export async function resolveDloDeleteTarget(
  apiName: string,
  client: Pick<DloClient, 'get'>,
  dataSpace: string,
): Promise<{ identity: { apiName: string; dataSpace: string }; targetId: string }> {
  const raw = unwrapDlo(await client.get(apiName));
  if (raw.name !== apiName) throw new DloError('DLO_TARGET_IDENTITY_MISMATCH');
  const memberships = dloDataSpaces(raw);
  if (!memberships.includes(dataSpace)) throw new DloError('UNSUPPORTED_DLO_DATASPACE');
  const others = memberships.filter((space) => space !== dataSpace);
  if (others.length > 0)
    throw explainInput(
      new DloError('DLO_DELETE_OTHER_DATASPACES'),
      `${apiName} also belongs to the data spaces ${spaceList(others)}, and a delete would remove it from all of them. To take it out of one data space only, deploy its file with a shorter c__dataSpace list and --allow-dataspace-removal.`,
    );
  if (typeof raw.id !== 'string' || !/^[A-Za-z0-9]{18}$/u.test(raw.id))
    throw new DloError('INVALID_DLO_TARGET_ID');
  return { identity: { apiName, dataSpace }, targetId: raw.id };
}

/**
 * Read-only delete preview: the identity a delete would remove, from the same checks.
 * @param {string} apiName Requested full API name.
 * @param {Pick<DloClient, 'get'>} client Target client.
 * @param {string} dataSpace The run's data space.
 * @returns {Promise<{identity: {apiName: string; dataSpace: string}}>} Identity to delete.
 */
export async function previewDeleteNativeDlo(
  apiName: string,
  client: Pick<DloClient, 'get'>,
  dataSpace: string,
): Promise<{ identity: { apiName: string; dataSpace: string } }> {
  const { identity } = await resolveDloDeleteTarget(apiName, client, dataSpace);
  return { identity };
}

/**
 * Delete only a freshly resolved exact target ID, without cascade or retry.
 * The command executes by default; its preview path never invokes this operation.
 * One name read after the DELETE settles the result: 404 confirms deletion; the same target
 * in a DELETING state is acknowledged-processing; anything else (still readable, or the read
 * failed) is acknowledged but unconfirmed (DLO_DELETE_NOT_CONFIRMED). Nothing is replayed.
 * @param {string} apiName Confirmed full API name.
 * @param {Pick<DloClient, 'get' | 'delete'>} client Authenticated target client.
 * @param {string} dataSpace The run's data space.
 * @returns {Promise<{apiName: string, targetId: string, dataSpace: string, processing?: true}>} Exact deleted target identity.
 */
export async function deleteNativeDlo(
  apiName: string,
  client: Pick<DloClient, 'get' | 'delete'>,
  dataSpace: string,
): Promise<{ apiName: string; targetId: string; dataSpace: string; processing?: true }> {
  const { targetId, identity } = await resolveDloDeleteTarget(apiName, client, dataSpace);
  await client.delete(targetId);
  const deleted = { apiName, targetId, dataSpace: identity.dataSpace };
  let readback: unknown;
  try {
    readback = await client.get(apiName);
  } catch (error) {
    if (error instanceof DloError && error.code === 'DLO_HTTP_ERROR' && error.status === 404)
      return deleted;
    // Keep the read failure's API detail (status, Retry-After) for the printed diagnostic.
    throw retainConnectDiagnostic(
      new DloError('DLO_DELETE_NOT_CONFIRMED'),
      getConnectDiagnostic(error),
    );
  }
  let observed: Record<string, unknown> | undefined;
  try {
    observed = unwrapDlo(readback);
  } catch {
    observed = undefined;
  }
  if (
    observed?.id === targetId &&
    typeof observed.status === 'string' &&
    observed.status.startsWith('DELETING')
  )
    return { ...deleted, processing: true };
  throw new DloError('DLO_DELETE_NOT_CONFIRMED', 200);
}

/** One entry of a DLO's dependency list, as Salesforce reports it. */
export type DloDependent = { componentType: string; name: string };

/**
 * Read the dependency list of a DLO; anything but the documented shape confirms nothing.
 * @param {unknown} response Native dependencies response.
 * @returns {DloDependent[]} Dependents by type and name.
 */
export function dloDependents(response: unknown): DloDependent[] {
  const list = (response as { dependencies?: unknown } | null)?.dependencies;
  if (!Array.isArray(list)) throw new DloError('DLO_DEPENDENCIES_UNCONFIRMED');
  return list.map((entry) => {
    const value = entry as { componentType?: unknown; name?: unknown } | null;
    if (typeof value?.componentType !== 'string' || typeof value.name !== 'string')
      throw new DloError('DLO_DEPENDENCIES_UNCONFIRMED');
    return { componentType: value.componentType, name: value.name };
  });
}

/**
 * Name the dependents a command does not delete.
 * @param {string} apiName Exact DLO name.
 * @param {DloDependent[]} open Uncovered dependents.
 * @returns {DloError} DLO_DEPENDENCY_EXISTS refusal.
 */
function dependencyRefusal(apiName: string, open: DloDependent[]): DloError {
  const error = new DloError('DLO_DEPENDENCY_EXISTS');
  replaceExplanation(
    error,
    `${apiName} cannot be deleted while Salesforce lists dependents: ${open
      .map((dependent) => `${dependent.componentType} ${dependent.name}`)
      .join(
        ', ',
      )}. Delete them first, or select them in the same command (a data model object as dmo:<Name>, or every mapping between this data lake object and it as mapping:<Name>).`,
  );
  return error;
}

const sameDependent = (a: DloDependent, b: DloDependent): boolean =>
  a.componentType === b.componentType && a.name === b.name;

/**
 * Salesforce refuses to delete a DLO that something depends on (HTTP 412 DEPENDENCY_EXISTS), so
 * the plugin reads the dependency list once, before the command's first write: a dependent the
 * same command does not delete refuses with DLO_DEPENDENCY_EXISTS naming each one.
 * @param {string} apiName Exact DLO name.
 * @param {object} client Dependency reader.
 * @param {Function} client.dependencies Reads the dependency list of a DLO by name.
 * @param {Function} covered Whether the same command deletes a dependent.
 * @returns {Promise<DloDependent[]>} The dependents the command deletes.
 */
export async function admitDloDependents(
  apiName: string,
  client: { dependencies: (apiName: string) => Promise<unknown> },
  covered: (dependent: DloDependent) => Promise<boolean>,
): Promise<DloDependent[]> {
  const dependents = dloDependents(await client.dependencies(apiName));
  const open: DloDependent[] = [];
  for (const dependent of dependents) if (!(await covered(dependent))) open.push(dependent);
  if (open.length > 0) throw dependencyRefusal(apiName, open);
  return dependents;
}

/**
 * Wait (bounded) until the dependents the command deleted are no longer listed. A dependent
 * that was not admitted before the first write refuses; one still listed after the last read
 * gives DLO_DEPENDENCY_PENDING. No DELETE is sent here.
 * @param {string} apiName Exact DLO name.
 * @param {object} client Dependency reader.
 * @param {Function} client.dependencies Reads the dependency list of a DLO by name.
 * @param {DloDependent[]} admitted Dependents admitted before the command's first write.
 * @returns {Promise<void>} Resolves when the list is empty.
 */
export async function waitForDloDependents(
  apiName: string,
  client: { dependencies: (apiName: string) => Promise<unknown> },
  admitted: DloDependent[],
): Promise<void> {
  for (let attempt = 0; attempt < readbackPace.attempts; attempt++) {
    await paceReadback(attempt);
    const dependents = dloDependents(await client.dependencies(apiName));
    if (dependents.length === 0) return;
    const open = dependents.filter(
      (dependent) => !admitted.some((known) => sameDependent(known, dependent)),
    );
    if (open.length > 0) throw dependencyRefusal(apiName, open);
  }
  const error = new DloError('DLO_DEPENDENCY_PENDING');
  replaceExplanation(
    error,
    `${apiName} was not deleted: the dependents deleted by this command are still listed by Salesforce. Read the data lake object's dependencies and delete it again once the list is empty.`,
  );
  throw error;
}
