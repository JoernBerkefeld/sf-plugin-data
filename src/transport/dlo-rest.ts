import { DloError, dloName } from '../artifacts/dlo-document.js';
import { isDataSpaceName } from '../artifacts/data-space-field.js';
import { openBoundSsot } from './bound-ssot.js';
import type { BoundSsot } from './bound-ssot.js';
import { dloFailure } from './dlo-native-rest.js';
import { nativeApiVersion } from './api-version.js';

export type DloClient = {
  get: (apiName: string) => Promise<unknown>;
  create: (body: Record<string, unknown>) => Promise<unknown>;
  update: (id: string, body: Record<string, unknown>) => Promise<unknown>;
  delete: (id: string) => Promise<void>;
  /** Add DLOs to a data space with one PUT; members it does not name stay (live API 68). */
  putMembers: (dataSpace: string, memberNames: string[]) => Promise<unknown>;
  /** Remove one DLO from a data space; the DLO itself is kept. */
  removeMember: (dataSpace: string, memberName: string) => Promise<unknown>;
};

const recordId = /^[A-Za-z0-9]{18}$/u;
// The data space member routes, proven live on API 68 only (DB entry
// data360:dlo-dataspace-membership-20261118.api68), whatever version the DLO routes use.
const dataSpacesEndpoint = '/services/data/v68.0/ssot/data-spaces';

/**
 * Build a minimal API68 client on the bound in-process connection. Writes are never resent
 * after they may have reached Salesforce; only an actual HTTP 404 indicates absence.
 * @param {string} targetOrg Explicit authenticated org alias or username.
 * @param {string} apiVersion Numeric >=61 or default/auto 68; admission is not live qualification.
 * @param {BoundSsot} [sender] The command's shared sender; defaults to one opened for targetOrg.
 * @param {ReadonlyMap<string, unknown>} [listed] Entries of this run's DLO listing at the same
 * version, by name. A listed name's GET answers with its entry in the item GET's envelope,
 * which Salesforce returns byte for byte the same, instead of another request.
 * @returns {DloClient} Four operations; the caller's read-back decides what a write did.
 */
export function createDloClient(
  targetOrg: string,
  apiVersion = '68.0',
  sender?: BoundSsot,
  listed?: ReadonlyMap<string, unknown>,
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

  /**
   * Send one data space member request; its answer is an object (also for the DELETE).
   * @param {'GET' | 'PUT' | 'DELETE'} method HTTP operation.
   * @param {string} suffix Route below /ssot/data-spaces.
   * @param {Record<string, unknown>} [body] PUT body.
   * @returns {Promise<unknown>} Parsed object.
   */
  async function member(
    method: 'GET' | 'PUT' | 'DELETE',
    suffix: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    let response: unknown;
    try {
      response = await bound.request(method, dataSpacesEndpoint + suffix, undefined, body);
    } catch (error) {
      throw dloFailure(error);
    }
    if (typeof response !== 'object' || response === null || Array.isArray(response))
      throw new DloError('INVALID_DLO_RESPONSE');
    return response;
  }

  return {
    get: async (apiName) => {
      if (!dloName.test(apiName)) throw new DloError('INVALID_DLO_NAME');
      const entry = listed?.get(apiName);
      if (entry !== undefined) return { dataLakeObjects: [structuredClone(entry)] };
      return request('GET', `/${apiName}`);
    },
    create: async (body) => request('POST', '', body),
    update: async (id, body) => request('PATCH', idSuffix(id), body),
    delete: async (id) => {
      await request('DELETE', idSuffix(id));
    },
    putMembers: async (dataSpace, memberNames) => {
      if (memberNames.length === 0 || memberNames.some((name) => !dloName.test(name)))
        throw new DloError('INVALID_DLO_NAME');
      const answer = await member('PUT', `/${spaceSegment(dataSpace)}/members`, {
        members: { members: memberNames.map((memberName) => ({ memberName })) },
      });
      // Live API 68 answers {success: "true", errors: []}; anything else is Salesforce's refusal.
      const { success, errors } = answer as { success?: unknown; errors?: unknown };
      if (
        !(success === true || success === 'true') ||
        (errors !== undefined && !(Array.isArray(errors) && errors.length === 0))
      )
        throw new DloError('DLO_MEMBERSHIP_UPDATE_REJECTED');
      return answer;
    },
    removeMember: async (dataSpace, memberName) => {
      if (!dloName.test(memberName)) throw new DloError('INVALID_DLO_NAME');
      const answer = await member(
        'DELETE',
        `/${spaceSegment(dataSpace)}/members?memberNames=${encodeURIComponent(memberName)}`,
      );
      // Live API 68 answers {results: [{dataSpaceMemberName, errors: {}, success: true}]}.
      const results = (answer as { results?: unknown }).results;
      if (
        !Array.isArray(results) ||
        results.length === 0 ||
        results.some((result) => (result as { success?: unknown } | null)?.success !== true)
      )
        throw new DloError('DLO_MEMBERSHIP_UPDATE_REJECTED');
      return answer;
    },
  };
}

/**
 * A data space name as one URL path segment.
 * @param {string} dataSpace Data space name.
 * @returns {string} Encoded segment.
 */
function spaceSegment(dataSpace: string): string {
  if (!isDataSpaceName(dataSpace)) throw new DloError('UNSUPPORTED_DLO_DATASPACE');
  return encodeURIComponent(dataSpace);
}
