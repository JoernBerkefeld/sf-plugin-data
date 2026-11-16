import { mkdtemp, writeFile } from 'node:fs/promises';
import { retainMetadataProblems } from './connect-diagnostic.js';
import os from 'node:os';
import path from 'node:path';
import {
  NativeDmoError,
  nativeDmoFieldName,
  nativeDmoName,
} from '../artifacts/native-dmo-document.js';
import { runProjectMetadata, verifyTemporaryDirectory } from './project-metadata.js';
import type { MetadataRunner } from './project-metadata.js';
import { openBoundSsot } from './bound-ssot.js';
import type { BoundSsot } from './bound-ssot.js';
import { dmoFailure } from './dmo-native-rest.js';

export type DmoClient = {
  get: (apiName: string) => Promise<unknown>;
  create: (body: Record<string, unknown>) => Promise<unknown>;
  update: (targetApiName: string, body: Record<string, unknown>) => Promise<unknown>;
  delete: (targetApiName: string) => Promise<void>;
  /** One Metadata API destructive deployment; absent on clients without a Metadata route. */
  removeFields?: (targetApiName: string, fieldNames: string[]) => Promise<void>;
};

import { nativeApiVersion } from './api-version.js';

/**
 * Render a Metadata API package manifest from already validated content lines.
 * @param {string} version Numeric API version.
 * @param {string[]} lines Indented type entries; empty for the required empty package.xml.
 * @returns {string} Manifest XML ending with LF.
 */
export function manifest(version: string, lines: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
    ...lines,
    `    <version>${version}</version>`,
    '</Package>',
    '',
  ].join('\n');
}

/**
 * Build a native client on the bound in-process connection; writes are never resent after they
 * may have reached Salesforce.
 * @param {string} targetOrg Explicit authenticated alias or username.
 * @param {string} apiVersion Numeric >=61 or default/auto 68; admission is not live qualification.
 * @param {MetadataRunner} runner Installed CLI runner, used only for the destructive field removal.
 * @param {BoundSsot} [sender] The command's shared sender; defaults to one opened for targetOrg.
 * @returns {DmoClient} Name-bound operations; field-removal scratch is retained.
 */
export function createDmoClient(
  targetOrg: string,
  apiVersion = '68.0',
  runner: MetadataRunner = runProjectMetadata,
  sender?: BoundSsot,
): DmoClient {
  const version = nativeApiVersion(apiVersion);
  const endpoint = `/services/data/v${version}/ssot/data-model-objects`;
  if (
    !targetOrg ||
    targetOrg.startsWith('-') ||
    [...targetOrg].some((character) => character.codePointAt(0)! < 32)
  )
    throw new NativeDmoError('UNSUPPORTED_DMO_SELECTION');
  const bound = sender ?? openBoundSsot(targetOrg, version);

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
   * Send one request on the bound connection, mapping failures to DMO codes. A write is never
   * resent once it may have reached Salesforce; the caller's read-back decides what it did.
   * @param {'GET' | 'POST' | 'PATCH' | 'DELETE'} method HTTP verb.
   * @param {string} suffix Validated exact name suffix.
   * @param {Record<string, unknown>} [body] Native input.
   * @returns {Promise<unknown>} Parsed non-array object, or nothing for a DELETE (HTTP 204).
   */
  async function request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    suffix: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const noContent = Symbol('dmo-no-content');
    let response: unknown;
    try {
      response = await bound.request(method, endpoint + suffix, noContent, body);
    } catch (error) {
      throw dmoFailure(error);
    }
    if (method === 'DELETE') {
      if (response !== noContent) throw new NativeDmoError('DMO_DELETE_UNCONFIRMED');
      return;
    }
    if (response === noContent) throw new NativeDmoError('DMO_REQUEST_UNCONFIRMED', 204);
    if (typeof response !== 'object' || response === null || Array.isArray(response))
      throw new NativeDmoError('INVALID_DMO_RESPONSE');
    return response;
  }

  /**
   * Remove custom fields with one Metadata API destructive deployment; never retried.
   * This is the one DMO write left on the child `sf project deploy start` runner: the bound
   * connection has no deploy-and-poll route yet, and the user chose to keep it here for now.
   * @param {string} targetApiName Exact full DMO name.
   * @param {string[]} fieldNames Exact field names ending in __c.
   * @returns {Promise<void>} Resolves only when every member is reported deleted.
   */
  async function removeFields(targetApiName: string, fieldNames: string[]): Promise<void> {
    if (!nativeDmoName.test(targetApiName)) throw new NativeDmoError('INVALID_DMO_NAME');
    if (
      fieldNames.length === 0 ||
      new Set(fieldNames).size !== fieldNames.length ||
      fieldNames.some((name) => typeof name !== 'string' || !nativeDmoFieldName.test(name))
    )
      throw new NativeDmoError('INVALID_DMO_FIELD');
    // Only names that matched the identifier patterns above reach the XML.
    const members = fieldNames.map((name) => `${targetApiName}.${name}`);
    verifyTemporaryDirectory();
    const root = await mkdtemp(path.join(os.tmpdir(), 'data360-dmo-field-removal-'));
    await writeFile(path.join(root, 'package.xml'), manifest(version, []), { flag: 'wx' });
    await writeFile(
      path.join(root, 'destructiveChanges.xml'),
      manifest(version, [
        '    <types>',
        ...members.map((member) => `        <members>${member}</members>`),
        '        <name>CustomField</name>',
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
    const successes = list(details.componentSuccesses);
    if (
      receipt.exitCode === 0 &&
      envelope.status === 0 &&
      result?.success === true &&
      result.status === 'Succeeded' &&
      members.every((member) =>
        successes.some(
          (entry) =>
            entry.fullName === member &&
            entry.componentType === 'CustomField' &&
            entry.deleted === true,
        ),
      )
    )
      return;
    throw retainMetadataProblems(new NativeDmoError('DMO_FIELD_REMOVAL_FAILED'), [
      ...list(details.componentFailures).map((failure) => failure.problem),
      result?.errorMessage,
      envelope.message,
    ]);
  }

  return {
    removeFields,
    get: async (apiName) => request('GET', nameSuffix(apiName)),
    create: async (body) => request('POST', '', body),
    update: async (targetApiName, body) => request('PATCH', nameSuffix(targetApiName), body),
    delete: async (targetApiName) => {
      await request('DELETE', nameSuffix(targetApiName));
    },
  };
}
