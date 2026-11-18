import type { Connection } from '@salesforce/core';
import {
  displayableApiText,
  getConnectDiagnostic,
  retainConnectDiagnostic,
  retainMetadataProblems,
} from './connect-diagnostic.js';
import { manifest } from './dmo-rest.js';
import { ConnectClient, ConnectError } from './connect-client.js';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  NativeMappingError,
  mappingDloName,
  mappingDmoName,
  nativeMappingName,
  validateNativeMappingDocument,
} from '../artifacts/native-mapping-document.js';
import { runProjectMetadata, verifyTemporaryDirectory } from './project-metadata.js';
import type { MetadataRunner } from './project-metadata.js';
import { nativeApiVersion } from './api-version.js';
import { openBoundSsot } from './bound-ssot.js';
import type { BoundSsot } from './bound-ssot.js';
import { replaceExplanation } from '../services/operation-diagnostic.js';

export type MappingWriteBody = {
  sourceEntityDeveloperName: string;
  targetEntityDeveloperName: string;
  fieldMapping: { sourceFieldDeveloperName: string; targetFieldDeveloperName: string }[];
};
export type MappingClient = {
  readonly apiVersion: string;
  deleteField: (mappingDeveloperName: string, observedSelector: string) => Promise<void>;
  list: (dmoDeveloperName: string, dloDeveloperName?: string) => Promise<unknown>;
  get: (mappingDeveloperName: string) => Promise<unknown>;
  create: (body: MappingWriteBody) => Promise<unknown>;
  update: (mappingDeveloperName: string, body: MappingWriteBody) => Promise<unknown>;
  /** One Metadata API destructive deployment of the whole mapping; never retried. */
  remove: (mappingDeveloperName: string) => Promise<void>;
  /**
   * Metadata API records (`ObjectSourceTargetMap`) by exact name, up to 10 names per read, on
   * the bound Connection; a name without a record is left out. Absent without a Metadata API.
   */
  readDefinitions?: (names: string[]) => Promise<Array<Record<string, unknown>>>;
  /** One Metadata API `updateMetadata` of a whole record on the bound Connection; never retried. */
  updateDefinition?: (definition: Record<string, unknown>) => Promise<void>;
};

/** Metadata API type of a mapping; the record name is the mapping name. */
export const mappingMetadataType = 'ObjectSourceTargetMap';
/** Names per Metadata API read call (the API's limit). */
export const mappingReadBatch = 10;

/**
 * SOAP faults where Salesforce refused the request itself, so nothing was applied. The request
 * limit is not one of them here: it says nothing about the label, so it is reported apart.
 */
const clientFault =
  /^(?:soapenv:Client|sf:(?:INVALID_\w+|MALFORMED_\w+|INSUFFICIENT_ACCESS|API_DISABLED_FOR_ORG|UNSUPPORTED_API_VERSION))$/u;

/**
 * A Metadata API answer as a list of records.
 * @param {unknown} value One record or several.
 * @returns {unknown[]} Records.
 */
export function metadataRecords(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Salesforce's refusal of a mapping label update: the label was not changed.
 * @param {string} name Mapping name.
 * @param {Array<{code?: unknown; message?: unknown}>} problems Salesforce's answers.
 * @returns {NativeMappingError} MAPPING_LABEL_UPDATE_REJECTED with an explanation.
 */
function labelRefusal(
  name: string,
  problems: Array<{ code?: unknown; message?: unknown }>,
): NativeMappingError {
  const said = problems
    .slice(0, 3)
    .map(({ code, message }) =>
      [
        typeof code === 'string' && /^[\w:.-]{1,80}$/u.test(code) ? code : undefined,
        displayableApiText(message),
      ]
        .filter(Boolean)
        .join(': '),
    )
    .filter(Boolean);
  const error = new NativeMappingError('MAPPING_LABEL_UPDATE_REJECTED');
  replaceExplanation(
    error,
    `Salesforce refused the Metadata API update of the ${mappingMetadataType} ${name}${said.length > 0 ? `: ${said.join('; ').replace(/\.$/u, '')}` : ' without a text the plugin can show'}. The label was not changed.`,
  );
  return error;
}

/**
 * Metadata API read and update of mappings on the bound Connection.
 * @param {Function} open The bound sender's Metadata API.
 * @returns {Pick<MappingClient, 'readDefinitions' | 'updateDefinition'>} Both calls.
 */
function metadataCalls(
  open: NonNullable<BoundSsot['metadata']>,
): Required<Pick<MappingClient, 'readDefinitions' | 'updateDefinition'>> {
  return {
    readDefinitions: async (names) => {
      if (names.some((name) => !nativeMappingName.test(name)))
        throw new NativeMappingError('INVALID_MAPPING_NAME');
      const found: Array<Record<string, unknown>> = [];
      for (let start = 0; start < names.length; start += mappingReadBatch) {
        let answer: unknown;
        try {
          const api = await open();
          answer = await api.read(
            mappingMetadataType,
            names.slice(start, start + mappingReadBatch),
          );
        } catch (error) {
          const failure = new NativeMappingError('MAPPING_LABEL_READ_FAILED');
          const text = displayableApiText((error as { message?: unknown } | null)?.message);
          replaceExplanation(
            failure,
            `The Metadata API read of ${mappingMetadataType} failed${text ? `: ${text}` : ''}.`,
          );
          throw failure;
        }
        for (const entry of metadataRecords(answer))
          if (
            entry &&
            typeof entry === 'object' &&
            !Array.isArray(entry) &&
            typeof (entry as Record<string, unknown>).fullName === 'string'
          )
            found.push(entry as Record<string, unknown>);
      }
      return found;
    },
    updateDefinition: async (definition) => {
      const name = definition.fullName;
      if (typeof name !== 'string' || !nativeMappingName.test(name))
        throw new NativeMappingError('INVALID_MAPPING_NAME');
      let answer: unknown;
      try {
        const api = await open();
        answer = await api.update(mappingMetadataType, definition);
      } catch (error) {
        // Only a client fault is Salesforce refusing the request; a server fault (soapenv:Server,
        // sf:UNKNOWN_EXCEPTION) may follow an applied update, so it stays unconfirmed.
        const fault = error as { name?: unknown; message?: unknown } | null;
        if (typeof fault?.name === 'string' && clientFault.test(fault.name))
          throw labelRefusal(name, [{ code: fault.name, message: fault.message }]);
        const unconfirmed = new NativeMappingError('MAPPING_REQUEST_UNCONFIRMED');
        if (fault?.name === 'sf:REQUEST_LIMIT_EXCEEDED')
          replaceExplanation(
            unconfirmed,
            `Salesforce did not take the Metadata API update of the ${mappingMetadataType} ${name}: the org's API request limit is used up (sf:REQUEST_LIMIT_EXCEEDED), so the label was not changed. Rerun the deploy once the limit has reset; the file needs no change.`,
          );
        throw unconfirmed;
      }
      const [result] = metadataRecords(answer) as Array<Record<string, unknown> | undefined>;
      if (result?.success === true) return;
      if (result?.success === false)
        throw labelRefusal(
          name,
          metadataRecords(result.errors).map((entry) => {
            const problem = (entry ?? {}) as Record<string, unknown>;
            return { code: problem.statusCode, message: problem.message };
          }),
        );
      throw new NativeMappingError('MAPPING_REQUEST_UNCONFIRMED');
    },
  };
}

/**
 * Read filtered mapping inventories on the existing command-owned connection.
 * Only an explicit transport 404 is the typed no-map condition; other failures propagate.
 * @param {Pick<Connection, 'instanceUrl' | 'request'>} connection Authenticated command connection.
 * @param {string} apiVersion Admitted numeric native version.
 * @param {string} dataSpace Optional explicit request scope.
 * @returns {Pick<MappingClient, 'list'>} List-only reader without CLI startup or scratch files.
 */
export function createMappingInventoryReader(
  connection: Pick<Connection, 'instanceUrl' | 'request'>,
  apiVersion: string,
  dataSpace?: string,
): Pick<MappingClient, 'list'> {
  const version = nativeApiVersion(apiVersion);
  const client = new ConnectClient(connection, version);
  return {
    list: async (dmoDeveloperName, dloDeveloperName) => {
      if (
        !mappingDmoName.test(dmoDeveloperName) ||
        (dloDeveloperName !== undefined && !mappingDloName.test(dloDeveloperName))
      )
        throw new NativeMappingError('INVALID_MAPPING_BINDING');
      const query = new URLSearchParams();
      if (dataSpace !== undefined) query.set('dataspace', dataSpace);
      query.set('dmoDeveloperName', dmoDeveloperName);
      if (dloDeveloperName !== undefined) query.set('dloDeveloperName', dloDeveloperName);
      try {
        return await client.get(
          `/services/data/v${version}/ssot/data-model-object-mappings?${query}`,
        );
      } catch (error) {
        if (
          error instanceof ConnectError &&
          error.code === 'REQUEST_FAILED' &&
          error.statusCode === 404
        )
          throw new NativeMappingError('MAPPING_HTTP_ERROR', 404);
        throw error;
      }
    },
  };
}

/**
 * Require explicit operation input, never convert saved read evidence into a send policy.
 * @param {MappingWriteBody} body Explicit caller-selected pairs.
 */
function validateBody(body: MappingWriteBody): void {
  if (!body || Object.keys(body).length !== 3 || !Array.isArray(body.fieldMapping))
    throw new NativeMappingError('INVALID_MAPPING_BODY');
  validateNativeMappingDocument({
    schemaVersion: 1,
    kind: 'mapping',
    identity: { apiName: 'Input', dataSpace: 'default' },
    spec: {
      sourceEntityDeveloperName: body.sourceEntityDeveloperName,
      targetEntityDeveloperName: body.targetEntityDeveloperName,
      fieldMappings: body.fieldMapping,
    },
  });
  if (body.fieldMapping.some((field) => Object.keys(field).length !== 2))
    throw new NativeMappingError('INVALID_MAPPING_BODY');
}

/**
 * Build a native client on the bound in-process connection. Numeric admission is not
 * live-version qualification.
 * The caller owns target pair resolution; additions send names only, without a field selector.
 * @param {string} targetOrg Explicit authenticated alias or username.
 * @param {string} apiVersion Validated numeric version, or default/auto 68.0.
 * @param {MetadataRunner} runner Installed CLI runner, used only for the destructive `remove`.
 * @param {string} dataSpace Optional explicit request scope.
 * @param {BoundSsot} [sender] The command's shared sender; defaults to one opened for targetOrg.
 * @param {ReadonlyMap<string, unknown>} [listed] Entries of this run's mapping lists at the same
 * version and data space, by name. A listed name's GET answers with a copy of its entry, which
 * Salesforce returns byte for byte the same, instead of another request.
 * @returns {MappingClient} Raw operations; `remove` scratch is retained.
 */
export function createMappingClient(
  targetOrg: string,
  apiVersion = '68.0',
  runner: MetadataRunner = runProjectMetadata,
  dataSpace?: string,
  sender?: BoundSsot,
  listed?: ReadonlyMap<string, unknown>,
): MappingClient {
  const version = nativeApiVersion(apiVersion);
  if (
    !targetOrg ||
    targetOrg.startsWith('-') ||
    [...targetOrg].some((character) => character.codePointAt(0)! < 32)
  )
    throw new NativeMappingError('UNSUPPORTED_MAPPING_SELECTION');
  const bound = sender ?? openBoundSsot(targetOrg, version);
  const endpoint = `/services/data/v${version}/ssot/data-model-object-mappings`;
  const scopeQuery =
    dataSpace === undefined ? '' : `?${new URLSearchParams({ dataspace: dataSpace })}`;

  /**
   * Validate exact mapping names, never source IDs or guessed suffixes.
   * @param {string} name Native mapping developer name.
   * @returns {string} Exact item suffix.
   */
  function nameSuffix(name: string): string {
    if (!nativeMappingName.test(name)) throw new NativeMappingError('INVALID_MAPPING_NAME');
    return `/${name}`;
  }

  /**
   * Send one request on the bound connection: no child CLI, token refresh or redirect, and a
   * write is never resent once it may have reached Salesforce. Not settlement evidence.
   * @param {'GET' | 'POST' | 'PATCH' | 'DELETE'} method HTTP verb.
   * @param {string} suffix Validated route and query.
   * @param {MappingWriteBody} [body] Explicit operation input.
   * @returns {Promise<unknown>} Parsed non-array object; nothing for a successful DELETE.
   */
  async function request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    suffix: string,
    body?: MappingWriteBody,
  ): Promise<unknown> {
    if (body) validateBody(body);
    const noContent = Symbol('mapping-no-content');
    let response: unknown;
    try {
      response = await bound.request(method, endpoint + suffix, noContent, body);
    } catch (error) {
      if (!(error instanceof ConnectError)) throw error;
      const status = error.code === 'AUTHENTICATION_FAILED' ? 401 : error.statusCode;
      throw retainConnectDiagnostic(
        new NativeMappingError(
          status === undefined ? 'MAPPING_REQUEST_UNCONFIRMED' : 'MAPPING_HTTP_ERROR',
          status,
        ),
        getConnectDiagnostic(error),
      );
    }
    // DELETE accepts documented 200 and observed 204; the body is ignored because absence is
    // proven later by typed-404 settlement reads.
    if (method === 'DELETE') return;
    if (response === noContent) throw new NativeMappingError('MAPPING_REQUEST_UNCONFIRMED', 204);
    if (typeof response !== 'object' || response === null || Array.isArray(response))
      throw new NativeMappingError('INVALID_MAPPING_RESPONSE');
    return response;
  }

  /**
   * Delete one mapping with one Metadata API destructive deployment; never retried.
   * This is the one mapping write left on the child `sf project deploy start` runner: the bound
   * connection has no deploy-and-poll route yet, and the user chose to keep it here for now.
   * @param {string} name Exact native mapping developer name.
   * @returns {Promise<void>} Resolves only when the member is reported deleted.
   */
  async function remove(name: string): Promise<void> {
    // Only a name that matched the identifier pattern reaches the XML.
    if (!nativeMappingName.test(name)) throw new NativeMappingError('INVALID_MAPPING_NAME');
    verifyTemporaryDirectory();
    const root = await mkdtemp(path.join(os.tmpdir(), 'data360-mapping-delete-'));
    await writeFile(path.join(root, 'package.xml'), manifest(version, []), { flag: 'wx' });
    await writeFile(
      path.join(root, 'destructiveChanges.xml'),
      manifest(version, [
        '    <types>',
        `        <members>${name}</members>`,
        '        <name>ObjectSourceTargetMap</name>',
        '    </types>',
      ]),
      { flag: 'wx' },
    );
    const receipt = await runner(
      [
        'project',
        'deploy',
        'start',
        '--metadata-dir',
        root,
        '--target-org',
        targetOrg,
        '--wait',
        '10',
        '--json',
      ],
      root,
    );
    let envelope: { status?: unknown; message?: unknown; result?: Record<string, unknown> } = {};
    try {
      const parsed = JSON.parse(receipt.stdout) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        envelope = parsed as typeof envelope;
    } catch {
      /* An unreadable receipt confirms nothing. */
    }
    const result =
      envelope.result && typeof envelope.result === 'object' ? envelope.result : undefined;
    const details =
      result?.details && typeof result.details === 'object'
        ? (result.details as Record<string, unknown>)
        : {};
    const list = (value: unknown): Array<Record<string, unknown>> =>
      (Array.isArray(value) ? value : [value]).filter(
        (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object',
      );
    if (
      receipt.exitCode === 0 &&
      envelope.status === 0 &&
      result?.success === true &&
      result.status === 'Succeeded' &&
      list(details.componentSuccesses).some(
        (entry) =>
          entry.fullName === name &&
          entry.componentType === 'ObjectSourceTargetMap' &&
          entry.deleted === true,
      )
    )
      return;
    throw retainMetadataProblems(new NativeMappingError('MAPPING_DELETE_FAILED'), [
      ...list(details.componentFailures).map((failure) => failure.problem),
      result?.errorMessage,
      envelope.message,
    ]);
  }

  return {
    apiVersion: version,
    remove,
    deleteField: async (name, observedSelector) => {
      // Validate the observed selector through the existing artifact grammar, never synthesize it.
      validateNativeMappingDocument({
        schemaVersion: 1,
        kind: 'mapping',
        identity: { apiName: name, dataSpace: 'default' },
        spec: {
          sourceEntityDeveloperName: 'Input__dll',
          targetEntityDeveloperName: 'Input__dlm',
          fieldMappings: [
            {
              sourceFieldDeveloperName: 'Input__c',
              targetFieldDeveloperName: 'Input__c',
              developerName: observedSelector,
            },
          ],
        },
      });
      if (!observedSelector) throw new NativeMappingError('INVALID_MAPPING_FIELD');
      await request(
        'DELETE',
        `${nameSuffix(name)}/field-mappings/${observedSelector}${scopeQuery}`,
      );
    },
    list: async (dmoDeveloperName, dloDeveloperName) => {
      if (
        !mappingDmoName.test(dmoDeveloperName) ||
        (dloDeveloperName !== undefined && !mappingDloName.test(dloDeveloperName))
      )
        throw new NativeMappingError('INVALID_MAPPING_BINDING');
      const query = new URLSearchParams();
      if (dataSpace !== undefined) query.set('dataspace', dataSpace);
      query.set('dmoDeveloperName', dmoDeveloperName);
      if (dloDeveloperName !== undefined) query.set('dloDeveloperName', dloDeveloperName);
      return request('GET', `?${query}`);
    },
    get: async (name) => {
      const suffix = nameSuffix(name);
      const entry = listed?.get(name);
      if (entry !== undefined) return structuredClone(entry);
      return request('GET', `${suffix}${scopeQuery}`);
    },
    create: async (body) => request('POST', scopeQuery, body),
    update: async (name, body) =>
      request('PATCH', `${nameSuffix(name)}/field-mappings${scopeQuery}`, body),
    ...(bound.metadata ? metadataCalls(bound.metadata) : {}),
  };
}
