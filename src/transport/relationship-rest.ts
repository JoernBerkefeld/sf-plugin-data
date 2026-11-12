import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  apiReceiptDiagnostic,
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from './connect-diagnostic.js';
import { ConnectError } from './connect-client.js';
import { runProjectMetadata, verifyTemporaryDirectory } from './project-metadata.js';
import type { MetadataRunner } from './project-metadata.js';
import { nativeApiVersion } from './api-version.js';
import type { BoundSsot } from './bound-ssot.js';
import {
  NativeRelationshipError,
  nativeRelationshipName,
  relationshipDmoName,
  validateNativeRelationshipDocument,
} from '../artifacts/native-relationship-document.js';
import type { NativeRelationshipSpec } from '../artifacts/native-relationship-document.js';

/** Proven page size; `nextPageUrl` repeats the current offset, so callers page by offset. */
export const relationshipPageSize = 200;

export type RelationshipClient = {
  readonly apiVersion: string;
  /** One page of every relationship the DMO is source or target of; undefined for 204. */
  list: (dmoName: string, offset: number) => Promise<unknown>;
  /** One POST creating exactly one relationship on its source DMO; never retried. */
  create: (relationship: NativeRelationshipSpec) => Promise<unknown>;
  /** One DELETE by exact relationship name; never retried. */
  remove: (relationshipName: string) => Promise<void>;
};

/**
 * Build a single-attempt native relationship client. GET and DELETE go through the bound sender
 * when one is given; POST stays on the installed CLI runner like the other native writes.
 * @param {string} targetOrg Explicit authenticated alias or username.
 * @param {string} apiVersion Validated numeric version, or default/auto 68.0.
 * @param {MetadataRunner} runner Injectable installed CLI runner.
 * @param {string} dataSpace Optional explicit request scope.
 * @param {BoundSsot} [sender] Bound single-attempt sender for GET and DELETE.
 * @returns {RelationshipClient} Raw operations; all scratch is retained.
 */
export function createRelationshipClient(
  targetOrg: string,
  apiVersion = '68.0',
  runner: MetadataRunner = runProjectMetadata,
  dataSpace?: string,
  sender?: BoundSsot,
): RelationshipClient {
  const version = nativeApiVersion(apiVersion);
  if (
    !targetOrg ||
    targetOrg.startsWith('-') ||
    [...targetOrg].some((character) => character.codePointAt(0)! < 32)
  )
    throw new NativeRelationshipError('UNSUPPORTED_RELATIONSHIP_SELECTION');
  const endpoint = `/services/data/v${version}/ssot/data-model-objects`;
  const scopeQuery =
    dataSpace === undefined ? '' : `?${new URLSearchParams({ dataspace: dataSpace })}`;
  const noContent = Symbol('relationship-no-content');

  /**
   * Execute once with receipt-proven HTTP status, without inferring settlement.
   * @param {'GET' | 'POST' | 'DELETE'} method HTTP verb.
   * @param {string} route Validated route and query.
   * @param {object} [body] Explicit create body.
   * @returns {Promise<unknown>} Raw response, `noContent` for 204, not persistence evidence.
   */
  async function request(
    method: 'GET' | 'POST' | 'DELETE',
    route: string,
    body?: object,
  ): Promise<unknown> {
    if (sender && method !== 'POST') return boundRequest(sender, method, route);
    verifyTemporaryDirectory();
    const root = await mkdtemp(path.join(os.tmpdir(), 'data360-native-relationship-'));
    const arguments_ = ['api', 'request', 'rest'];
    if (method === 'DELETE') {
      const file = path.join(root, 'request.json');
      await writeFile(
        file,
        JSON.stringify({ url: route, method, body: { mode: 'raw', raw: '' } }),
        { flag: 'wx' },
      );
      arguments_.push('--file', file);
    } else {
      arguments_.push(route, '--method', method);
      if (body) {
        const file = path.join(root, 'body.json');
        await writeFile(file, JSON.stringify(body), { flag: 'wx' });
        arguments_.push('--body', `@${file}`, '--header', 'Content-Type:application/json');
      }
    }
    arguments_.push('--target-org', targetOrg, '--include');
    const receipt = await runner(arguments_, root);
    const match = /^HTTP\/\d(?:\.\d)? (\d{3})[^\r\n]*\r?\n/u.exec(receipt.stdout);
    if (!match) throw new NativeRelationshipError('RELATIONSHIP_REQUEST_UNCONFIRMED');
    const status = Number(match[1]);
    const payload = receipt.stdout
      .slice(match[0].length)
      .replace(/^(?:[^\r\n]+:[^\r\n]*\r?\n|\r?\n)*/u, '')
      .trim();
    if (status < 200 || status >= 300)
      throw retainConnectDiagnostic(
        new NativeRelationshipError('RELATIONSHIP_HTTP_ERROR', status),
        apiReceiptDiagnostic(receipt.stdout),
      );
    if (
      receipt.exitCode !== 0 ||
      !(
        (method === 'GET' && (status === 200 || status === 204)) ||
        (method === 'POST' && (status === 200 || status === 201)) ||
        (method === 'DELETE' && (status === 200 || status === 204))
      )
    )
      throw new NativeRelationshipError('RELATIONSHIP_REQUEST_UNCONFIRMED', status);
    if (method === 'DELETE') return;
    if (status === 204) return noContent;
    try {
      return JSON.parse(payload) as unknown;
    } catch {
      throw new NativeRelationshipError('INVALID_RELATIONSHIP_RESPONSE', status);
    }
  }

  /**
   * Send one GET or DELETE on the bound connection: no child CLI, refresh, retry or redirect.
   * @param {BoundSsot} bound Bound sender.
   * @param {'GET' | 'DELETE'} method Read or exact delete.
   * @param {string} route Validated route and query.
   * @returns {Promise<unknown>} Parsed object or `noContent` for GET; nothing for DELETE.
   */
  async function boundRequest(
    bound: BoundSsot,
    method: 'GET' | 'DELETE',
    route: string,
  ): Promise<unknown> {
    let response: unknown;
    try {
      response = await bound.request(method, route, noContent);
    } catch (error) {
      if (!(error instanceof ConnectError)) throw error;
      const status = error.code === 'AUTHENTICATION_FAILED' ? 401 : error.statusCode;
      throw retainConnectDiagnostic(
        new NativeRelationshipError(
          status === undefined ? 'RELATIONSHIP_REQUEST_UNCONFIRMED' : 'RELATIONSHIP_HTTP_ERROR',
          status,
        ),
        getConnectDiagnostic(error),
      );
    }
    // Absence after a DELETE is proven by a later list, not by this body.
    if (method === 'DELETE') return;
    if (response === noContent) return noContent;
    if (typeof response !== 'object' || response === null || Array.isArray(response))
      throw new NativeRelationshipError('INVALID_RELATIONSHIP_RESPONSE');
    return response;
  }

  return {
    apiVersion: version,
    list: async (dmoName, offset) => {
      if (!relationshipDmoName.test(dmoName) || !Number.isSafeInteger(offset) || offset < 0)
        throw new NativeRelationshipError('INVALID_RELATIONSHIP_BINDING');
      const query = new URLSearchParams();
      if (dataSpace !== undefined) query.set('dataspace', dataSpace);
      query.set('limit', String(relationshipPageSize));
      query.set('offset', String(offset));
      const response = await request('GET', `${endpoint}/${dmoName}/relationships?${query}`);
      return response === noContent ? undefined : response;
    },
    create: async (relationship) => {
      const spec = validateNativeRelationshipDocument({
        schemaVersion: 1,
        kind: 'relationship',
        identity: { apiName: 'Input', dataSpace: 'default' },
        spec: relationship,
      }).spec;
      const response = await request(
        'POST',
        `${endpoint}/${spec.sourceObjectName}/relationships${scopeQuery}`,
        { relationships: [spec] },
      );
      return response === noContent ? undefined : response;
    },
    remove: async (relationshipName) => {
      if (!nativeRelationshipName.test(relationshipName))
        throw new NativeRelationshipError('INVALID_RELATIONSHIP_NAME');
      await request('DELETE', `${endpoint}/relationships/${relationshipName}${scopeQuery}`);
    },
  };
}
