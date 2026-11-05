import { mkdtemp, writeFile } from 'node:fs/promises';
import { connectReceiptDiagnostic, retainConnectDiagnostic } from './connect-diagnostic.js';
import os from 'node:os';
import path from 'node:path';
import { NativeDmoError, nativeDmoName } from '../artifacts/native-dmo-document.js';
import { runProjectMetadata, verifyTemporaryDirectory } from './project-metadata.js';
import type { MetadataRunner } from './project-metadata.js';

export type DmoClient = {
  get: (apiName: string) => Promise<unknown>;
  create: (body: Record<string, unknown>) => Promise<unknown>;
  update: (targetApiName: string, body: Record<string, unknown>) => Promise<unknown>;
  delete: (targetApiName: string) => Promise<void>;
};

import { nativeApiVersion } from './api-version.js';

/**
 * Build a single-attempt native client with receipt-proven HTTP status.
 * @param {string} targetOrg Explicit authenticated alias or username.
 * @param {string} apiVersion Numeric >=61 or default/auto 68; admission is not live qualification.
 * @param {MetadataRunner} runner Injectable installed CLI runner.
 * @returns {DmoClient} Name-bound operations; all scratch is retained.
 */
export function createDmoClient(
  targetOrg: string,
  apiVersion = '68.0',
  runner: MetadataRunner = runProjectMetadata,
): DmoClient {
  const version = nativeApiVersion(apiVersion);
  const endpoint = `/services/data/v${version}/ssot/data-model-objects`;
  if (
    !targetOrg ||
    targetOrg.startsWith('-') ||
    [...targetOrg].some((character) => character.codePointAt(0)! < 32)
  )
    throw new NativeDmoError('UNSUPPORTED_DMO_SELECTION');

  /**
   * Validate a full API name, never a resource ID.
   * @param {string} apiName Exact full DMO name.
   * @returns {string} Safe URL suffix.
   */
  function nameSuffix(apiName: string): string {
    if (!nativeDmoName.test(apiName)) throw new NativeDmoError('INVALID_DMO_NAME');
    return `/${apiName}`;
  }

  /**
   * Execute one native operation without retrying writes.
   * @param {string} method HTTP verb.
   * @param {string} suffix Validated exact name suffix.
   * @param {Record<string, unknown>} body Optional native input.
   * @returns {Promise<unknown>} Parsed response; PATCH is not persistence proof.
   */
  async function request(
    method: string,
    suffix: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    verifyTemporaryDirectory();
    const root = await mkdtemp(path.join(os.tmpdir(), 'data360-native-dmo-'));
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
    if (!match) throw new NativeDmoError('DMO_REQUEST_UNCONFIRMED');
    const status = Number(match[1]);
    const payload = receipt.stdout
      .slice(match[0].length)
      .replace(/^(?:[^\r\n]+:[^\r\n]*\r?\n|\r?\n)*/u, '')
      .trim();
    if (status < 200 || status >= 300)
      throw retainConnectDiagnostic(
        new NativeDmoError('DMO_HTTP_ERROR', status),
        connectReceiptDiagnostic(receipt.stdout),
      );
    if (receipt.exitCode !== 0) throw new NativeDmoError('DMO_REQUEST_UNCONFIRMED', status);
    if (method === 'DELETE') {
      if (status !== 204 || payload) throw new NativeDmoError('DMO_DELETE_UNCONFIRMED', status);
      return;
    }
    if (status !== (method === 'POST' ? 201 : 200))
      throw new NativeDmoError('DMO_REQUEST_UNCONFIRMED', status);
    try {
      return JSON.parse(payload) as unknown;
    } catch {
      throw new NativeDmoError('INVALID_DMO_RESPONSE', status);
    }
  }

  return {
    get: async (apiName) => request('GET', nameSuffix(apiName)),
    create: async (body) => request('POST', '', body),
    update: async (targetApiName, body) => request('PATCH', nameSuffix(targetApiName), body),
    delete: async (targetApiName) => {
      await request('DELETE', nameSuffix(targetApiName));
    },
  };
}
