import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DloError, dloName } from '../artifacts/dlo-document.js';
import { runProjectMetadata, verifyTemporaryDirectory } from './project-metadata.js';
import type { MetadataRunner } from './project-metadata.js';

export type DloClient = {
  get: (apiName: string) => Promise<unknown>;
  create: (body: Record<string, unknown>) => Promise<unknown>;
  update: (id: string, body: Record<string, unknown>) => Promise<unknown>;
  delete: (id: string) => Promise<void>;
};

const recordId = /^[A-Za-z0-9]{18}$/u;
import { nativeApiVersion } from './api-version.js';

/**
 * Build a minimal authenticated API68 client using real --include HTTP receipts.
 * No JSON CLI envelope is assumed, and only an actual HTTP 404 indicates absence.
 * @param {string} targetOrg Explicit authenticated org alias or username.
 * @param {string} apiVersion Numeric >=61 or default/auto 68; admission is not live qualification.
 * @param {MetadataRunner} runner Injectable installed CLI runner.
 * @returns {DloClient} Four single-attempt operations; scratch request bodies are retained.
 */
export function createDloClient(
  targetOrg: string,
  apiVersion = '68.0',
  runner: MetadataRunner = runProjectMetadata,
): DloClient {
  const version = nativeApiVersion(apiVersion);
  const endpoint = `/services/data/v${version}/ssot/data-lake-objects`;
  if (
    !targetOrg ||
    targetOrg.startsWith('-') ||
    [...targetOrg].some((character) => character.codePointAt(0)! < 32)
  )
    throw new DloError('UNSUPPORTED_DLO_SELECTION');

  /**
   * Execute one bounded native request and parse status before considering CLI exit state.
   * @param {string} method HTTP operation.
   * @param {string} suffix Validated exact name/ID suffix.
   * @param {Record<string, unknown>} body Optional write definition.
   * @returns {Promise<unknown>} Parsed native response, or undefined for HTTP 204.
   */
  async function request(
    method: string,
    suffix: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    verifyTemporaryDirectory();
    const root = await mkdtemp(path.join(os.tmpdir(), 'data360-native-dlo-'));
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
    // Real CLI receipts contain no blank separator between headers and JSON.
    const match = /^HTTP\/\d(?:\.\d)? (\d{3})[^\r\n]*\r?\n/u.exec(receipt.stdout);
    if (!match) throw new DloError('DLO_REQUEST_UNCONFIRMED');
    const status = Number(match[1]);
    const payload = receipt.stdout
      .slice(match[0].length)
      .replace(/^(?:[^\r\n]+:[^\r\n]*\r?\n|\r?\n)*/u, '')
      .trim();
    if (status < 200 || status >= 300) throw new DloError('DLO_HTTP_ERROR', status);
    if (receipt.exitCode !== 0) throw new DloError('DLO_REQUEST_UNCONFIRMED', status);
    if (method === 'DELETE') {
      if (status !== 204 || payload) throw new DloError('DLO_DELETE_UNCONFIRMED', status);
      return;
    }
    if (status !== (method === 'POST' ? 201 : 200))
      throw new DloError('DLO_REQUEST_UNCONFIRMED', status);
    try {
      return JSON.parse(payload) as unknown;
    } catch {
      throw new DloError('INVALID_DLO_RESPONSE', status);
    }
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
