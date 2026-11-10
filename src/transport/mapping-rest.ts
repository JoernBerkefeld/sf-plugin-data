import type { Connection } from '@salesforce/core';
import {
  apiReceiptDiagnostic,
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from './connect-diagnostic.js';
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
import { isNativeMappingDeletionVersion, nativeApiVersion } from './api-version.js';
import type { BoundSsot } from './bound-ssot.js';

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
  delete: (mappingDeveloperName: string) => Promise<void>;
};

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
 * Build a single-attempt native client. Numeric admission is not live-version qualification.
 * The caller owns target pair resolution; additions send names only, without a field selector.
 * @param {string} targetOrg Explicit authenticated alias or username.
 * @param {string} apiVersion Validated numeric version, or default/auto 68.0.
 * @param {MetadataRunner} runner Injectable installed CLI runner.
 * @param {string} dataSpace Optional explicit request scope.
 * @param {BoundSsot} [sender] Bound single-attempt sender for GET and DELETE; POST/PATCH stay on runner.
 * @returns {MappingClient} Raw operations; all scratch is retained.
 */
export function createMappingClient(
  targetOrg: string,
  apiVersion = '68.0',
  runner: MetadataRunner = runProjectMetadata,
  dataSpace?: string,
  sender?: BoundSsot,
): MappingClient {
  const version = nativeApiVersion(apiVersion);
  if (
    !targetOrg ||
    targetOrg.startsWith('-') ||
    [...targetOrg].some((character) => character.codePointAt(0)! < 32)
  )
    throw new NativeMappingError('UNSUPPORTED_MAPPING_SELECTION');
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
   * Execute once with receipt-proven HTTP status, without inferring settlement.
   * @param {string} method HTTP verb.
   * @param {string} suffix Validated route and query.
   * @param {MappingWriteBody} body Explicit optional operation input.
   * @returns {Promise<unknown>} Raw response, not persistence evidence.
   */
  async function request(
    method: string,
    suffix: string,
    body?: MappingWriteBody,
  ): Promise<unknown> {
    if (sender && (method === 'GET' || method === 'DELETE'))
      return boundRequest(sender, method, suffix);
    if (body) validateBody(body);
    verifyTemporaryDirectory();
    const root = await mkdtemp(path.join(os.tmpdir(), 'data360-native-mapping-'));
    const arguments_ = ['api', 'request', 'rest'];
    if (method === 'DELETE') {
      const file = path.join(root, 'request.json');
      await writeFile(
        file,
        JSON.stringify({ url: endpoint + suffix, method, body: { mode: 'raw', raw: '' } }),
        { flag: 'wx' },
      );
      arguments_.push('--file', file);
    } else {
      arguments_.push(endpoint + suffix, '--method', method);
      if (body) {
        const file = path.join(root, 'body.json');
        await writeFile(file, JSON.stringify(body), { flag: 'wx' });
        arguments_.push('--body', `@${file}`, '--header', 'Content-Type:application/json');
      }
    }
    arguments_.push('--target-org', targetOrg, '--include');
    const receipt = await runner(arguments_, root);
    const match = /^HTTP\/\d(?:\.\d)? (\d{3})[^\r\n]*\r?\n/u.exec(receipt.stdout);
    if (!match) throw new NativeMappingError('MAPPING_REQUEST_UNCONFIRMED');
    const status = Number(match[1]);
    const payload = receipt.stdout
      .slice(match[0].length)
      .replace(/^(?:[^\r\n]+:[^\r\n]*\r?\n|\r?\n)*/u, '')
      .trim();
    if (status < 200 || status >= 300)
      throw retainConnectDiagnostic(
        new NativeMappingError('MAPPING_HTTP_ERROR', status),
        apiReceiptDiagnostic(receipt.stdout),
      );
    if (
      receipt.exitCode !== 0 ||
      (status !== 200 &&
        !(method === 'POST' && status === 201) &&
        !(method === 'DELETE' && status === 204))
    )
      throw new NativeMappingError('MAPPING_REQUEST_UNCONFIRMED', status);
    if (method === 'DELETE') return;
    try {
      return JSON.parse(payload) as unknown;
    } catch {
      throw new NativeMappingError('INVALID_MAPPING_RESPONSE', status);
    }
  }

  /**
   * Send one GET or DELETE on the bound connection: no child CLI, refresh, retry or redirect.
   * @param {BoundSsot} bound Bound sender.
   * @param {'GET' | 'DELETE'} method Read or exact delete.
   * @param {string} suffix Validated route and query.
   * @returns {Promise<unknown>} Parsed non-array object for GET; nothing for a successful DELETE.
   */
  async function boundRequest(
    bound: BoundSsot,
    method: 'GET' | 'DELETE',
    suffix: string,
  ): Promise<unknown> {
    const noContent = Symbol('mapping-no-content');
    let response: unknown;
    try {
      response = await bound.request(method, endpoint + suffix, noContent);
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
    // Like the runner path, DELETE accepts documented 200 and observed 204; the body is
    // ignored because absence is proven later by typed-404 settlement reads.
    if (method === 'DELETE') return;
    if (response === noContent) throw new NativeMappingError('MAPPING_REQUEST_UNCONFIRMED', 204);
    if (typeof response !== 'object' || response === null || Array.isArray(response))
      throw new NativeMappingError('INVALID_MAPPING_RESPONSE');
    return response;
  }

  return {
    apiVersion: version,
    deleteField: async (name, observedSelector) => {
      if (!isNativeMappingDeletionVersion(version))
        throw new NativeMappingError('MAPPING_UNMAP_VERSION_UNQUALIFIED');
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
    get: async (name) => request('GET', `${nameSuffix(name)}${scopeQuery}`),
    create: async (body) => request('POST', scopeQuery, body),
    update: async (name, body) =>
      request('PATCH', `${nameSuffix(name)}/field-mappings${scopeQuery}`, body),
    delete: async (name) => {
      await request('DELETE', `${nameSuffix(name)}${scopeQuery}`);
    },
  };
}
