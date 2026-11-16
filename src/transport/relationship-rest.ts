import {
  displayableApiText,
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from './connect-diagnostic.js';
import { replaceExplanation } from '../services/operation-diagnostic.js';
import { ConnectError } from './connect-client.js';
import { nativeApiVersion } from './api-version.js';
import { openBoundSsot } from './bound-ssot.js';
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
  /** One POST creating exactly one relationship on its source DMO; never resent once sent. */
  create: (relationship: NativeRelationshipSpec) => Promise<unknown>;
  /** One DELETE by exact relationship name; never retried. */
  remove: (relationshipName: string) => Promise<void>;
  /**
   * Metadata API records (`FieldSrcTrgtRelationship`) by exact name, on the bound Connection;
   * a name Salesforce returns no record for is left out. Absent without a bound sender.
   */
  readDefinitions?: (names: string[]) => Promise<Array<Record<string, unknown>>>;
  /** One Metadata API `updateMetadata` of a whole record on the bound Connection; never retried. */
  update?: (definition: Record<string, unknown>) => Promise<void>;
};

/** Metadata API type of a Data Cloud relationship; the record name is the relationship name. */
export const relationshipMetadataType = 'FieldSrcTrgtRelationship';
/** Names per Metadata API read call (the API's limit). */
const readBatch = 10;

/**
 * Salesforce's refusal of an update: nothing was changed. Codes and texts pass the display
 * filter of REST errors; a text that does not pass is left out.
 * @param {string} name Relationship name.
 * @param {Array<{code?: unknown; message?: unknown}>} problems Salesforce's answers.
 * @returns {NativeRelationshipError} RELATIONSHIP_UPDATE_REJECTED with an explanation.
 */
function updateRefusal(
  name: string,
  problems: Array<{ code?: unknown; message?: unknown }>,
): NativeRelationshipError {
  const parts = problems
    .slice(0, 3)
    .map(({ code, message }) =>
      [
        typeof code === 'string' && /^[\w:.-]{1,80}$/u.test(code) ? code : undefined,
        displayableApiText(message),
      ]
        .filter(Boolean)
        .join(': '),
    );
  const said = parts.filter(Boolean);
  const error = new NativeRelationshipError('RELATIONSHIP_UPDATE_REJECTED');
  replaceExplanation(
    error,
    `Salesforce refused the Metadata API update of the relationship ${name}${said.length > 0 ? `: ${said.join('; ')}` : ' without a text the plugin can show'}. Nothing was changed.`,
  );
  return error;
}

/**
 * A Metadata API answer as a list of records.
 * @param {unknown} value One record or several.
 * @returns {unknown[]} Records.
 */
function records(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Build a native relationship client on the bound in-process connection; the POST and DELETE
 * are never resent once they may have reached Salesforce.
 * @param {string} targetOrg Explicit authenticated alias or username.
 * @param {string} apiVersion Validated numeric version, or default/auto 68.0.
 * @param {string} dataSpace Optional explicit request scope.
 * @param {BoundSsot} [sender] The command's shared sender; defaults to one opened for targetOrg.
 * @returns {RelationshipClient} Raw operations.
 */
export function createRelationshipClient(
  targetOrg: string,
  apiVersion = '68.0',
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
  const bound = sender ?? openBoundSsot(targetOrg, version);

  /**
   * Send one request on the bound connection: no child CLI, token refresh or redirect, and the
   * POST is never resent once it may have reached Salesforce. Not settlement evidence.
   * @param {'GET' | 'POST' | 'DELETE'} method HTTP verb.
   * @param {string} route Validated route and query.
   * @param {object} [body] Explicit create body.
   * @returns {Promise<unknown>} Parsed object or `noContent` for GET/POST; nothing for DELETE.
   */
  async function request(
    method: 'GET' | 'POST' | 'DELETE',
    route: string,
    body?: object,
  ): Promise<unknown> {
    let response: unknown;
    try {
      response = await bound.request(method, route, noContent, body);
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
    ...(sender?.metadata ? metadataCalls(sender.metadata) : {}),
  };
}

/**
 * Metadata API read and update of relationships on the bound Connection.
 * @param {Function} open The bound sender's Metadata API.
 * @returns {Pick<RelationshipClient, 'readDefinitions' | 'update'>} Both calls.
 */
function metadataCalls(
  open: NonNullable<BoundSsot['metadata']>,
): Required<Pick<RelationshipClient, 'readDefinitions' | 'update'>> {
  return {
    readDefinitions: async (names) => {
      if (names.some((name) => !nativeRelationshipName.test(name)))
        throw new NativeRelationshipError('INVALID_RELATIONSHIP_NAME');
      const api = await open();
      const found: Array<Record<string, unknown>> = [];
      for (let start = 0; start < names.length; start += readBatch) {
        let answer: unknown;
        try {
          answer = await api.read(relationshipMetadataType, names.slice(start, start + readBatch));
        } catch (error) {
          const failure = new NativeRelationshipError('RELATIONSHIP_REQUEST_UNCONFIRMED');
          const text = displayableApiText((error as { message?: unknown } | null)?.message);
          replaceExplanation(
            failure,
            `The Metadata API read of ${relationshipMetadataType} failed${text ? `: ${text}` : ''}.`,
          );
          throw failure;
        }
        for (const entry of records(answer))
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
    update: async (definition) => {
      const name = definition.fullName;
      if (typeof name !== 'string' || !nativeRelationshipName.test(name))
        throw new NativeRelationshipError('INVALID_RELATIONSHIP_NAME');
      const api = await open();
      let answer: unknown;
      try {
        answer = await api.update(relationshipMetadataType, definition);
      } catch (error) {
        // A SOAP fault (soapenv:Client, sf:INVALID_...) is Salesforce refusing the request.
        const fault = error as { name?: unknown; message?: unknown } | null;
        if (typeof fault?.name === 'string' && /^(?:soapenv|sf):/u.test(fault.name))
          throw updateRefusal(name, [{ code: fault.name, message: fault.message }]);
        throw new NativeRelationshipError('RELATIONSHIP_REQUEST_UNCONFIRMED');
      }
      const [result] = records(answer) as Array<Record<string, unknown> | undefined>;
      if (result?.success === true) return;
      if (result?.success === false)
        throw updateRefusal(
          name,
          records(result.errors).map((entry) => {
            const problem = (entry ?? {}) as Record<string, unknown>;
            return { code: problem.statusCode, message: problem.message };
          }),
        );
      throw new NativeRelationshipError('RELATIONSHIP_REQUEST_UNCONFIRMED');
    },
  };
}
