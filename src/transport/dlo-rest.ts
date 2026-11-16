import { DloError, dloName } from '../artifacts/dlo-document.js';
import { openBoundSsot } from './bound-ssot.js';
import type { BoundSsot } from './bound-ssot.js';
import { dloFailure } from './dlo-native-rest.js';
import { nativeApiVersion } from './api-version.js';

export type DloClient = {
  get: (apiName: string) => Promise<unknown>;
  create: (body: Record<string, unknown>) => Promise<unknown>;
  update: (id: string, body: Record<string, unknown>) => Promise<unknown>;
  delete: (id: string) => Promise<void>;
};

const recordId = /^[A-Za-z0-9]{18}$/u;

/**
 * Build a minimal API68 client on the bound in-process connection. Writes are never resent
 * after they may have reached Salesforce; only an actual HTTP 404 indicates absence.
 * @param {string} targetOrg Explicit authenticated org alias or username.
 * @param {string} apiVersion Numeric >=61 or default/auto 68; admission is not live qualification.
 * @param {BoundSsot} [sender] The command's shared sender; defaults to one opened for targetOrg.
 * @returns {DloClient} Four operations; the caller's read-back decides what a write did.
 */
export function createDloClient(
  targetOrg: string,
  apiVersion = '68.0',
  sender?: BoundSsot,
): DloClient {
  const version = nativeApiVersion(apiVersion);
  const endpoint = `/services/data/v${version}/ssot/data-lake-objects`;
  if (
    !targetOrg ||
    targetOrg.startsWith('-') ||
    [...targetOrg].some((character) => character.codePointAt(0)! < 32)
  )
    throw new DloError('UNSUPPORTED_DLO_SELECTION');
  const bound = sender ?? openBoundSsot(targetOrg, version);

  /**
   * Send one request on the bound connection, mapping failures to DLO codes.
   * @param {'GET' | 'POST' | 'PATCH' | 'DELETE'} method HTTP operation.
   * @param {string} suffix Validated exact name/ID suffix.
   * @param {Record<string, unknown>} [body] Write definition.
   * @returns {Promise<unknown>} Parsed non-array object, or nothing for a DELETE (HTTP 204).
   */
  async function request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    suffix: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const noContent = Symbol('dlo-no-content');
    let response: unknown;
    try {
      response = await bound.request(method, endpoint + suffix, noContent, body);
    } catch (error) {
      throw dloFailure(error);
    }
    if (method === 'DELETE') {
      if (response !== noContent) throw new DloError('DLO_DELETE_UNCONFIRMED');
      return;
    }
    if (response === noContent) throw new DloError('DLO_REQUEST_UNCONFIRMED', 204);
    if (typeof response !== 'object' || response === null || Array.isArray(response))
      throw new DloError('INVALID_DLO_RESPONSE');
    return response;
  }

  /**
   * Validate exact runtime target identity before mutating it.
   * @param {string} id Target-resolved record ID.
   * @returns {string} Safe URL suffix.
   */
  function idSuffix(id: string): string {
    if (!recordId.test(id)) throw new DloError('INVALID_DLO_TARGET_ID');
    return `/${id}`;
  }

  return {
    get: async (apiName) => {
      if (!dloName.test(apiName)) throw new DloError('INVALID_DLO_NAME');
      return request('GET', `/${apiName}`);
    },
    create: async (body) => request('POST', '', body),
    update: async (id, body) => request('PATCH', idSuffix(id), body),
    delete: async (id) => {
      await request('DELETE', idSuffix(id));
    },
  };
}
