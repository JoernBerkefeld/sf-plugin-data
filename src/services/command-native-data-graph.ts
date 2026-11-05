import { isDeepStrictEqual } from 'node:util';
import { graphRequire } from '../artifacts/data-graph-document.js';
import { observeNativeDataGraph } from '../artifacts/native-data-graph-document.js';
import { graphRecord } from '../artifacts/data-graph-document.js';
import { validateNativeDataGraphDocument } from '../artifacts/native-data-graph-document.js';
import {
  acquireNativeDataGraph,
  bindNativeGraphRoot,
  nativeDataGraphLifecycle,
  settleNativeDataGraph,
} from './native-data-graph-crd.js';
import type { NativeGraphContext } from './native-data-graph-crd.js';
import type { DataGraphClient } from '../transport/data-graph-rest.js';

/**
 * Project independently read native runtime configuration into a distinct authored artifact.
 * @param {string} name Exact selected graph.
 * @param {NativeGraphContext} context Scoped independent readers.
 * @returns {Promise<import('../artifacts/native-data-graph-document.js').NativeDataGraphDocument>} Portable intent without generated identities.
 */
export async function retrieveNativeDataGraph(
  name: string,
  context: NativeGraphContext,
): Promise<import('../artifacts/native-data-graph-document.js').NativeDataGraphDocument> {
  context.check();
  const root = await bindNativeGraphRoot(context);
  const read = await context.get(name);
  graphRequire(read.status === 200);
  const raw = graphRecord(read.body);
  graphRequire(raw.name === name);
  const node = graphRecord(raw.sourceObject);
  graphRequire(Array.isArray(node.fields));
  const document = validateNativeDataGraphDocument({
    schemaVersion: 1,
    kind: 'native-data-graph',
    apiVersion: '68.0',
    definition: {
      name,
      label: raw.label,
      description: raw.description,
      dataspaceName: raw.dataspaceName,
      primaryObjectName: raw.primaryObjectName,
      type: 'NONE',
      sourceObject: {
        name: node.name,
        devName: 'Individual',
        label: node.label,
        jsonPath: '$',
        path: [],
        type: 'standard',
        relatedObjects: [],
        fields: node.fields.map((value, index) => {
          const field = graphRecord(value);
          return {
            devName: `Projected${index}`,
            sourceFieldName: field.sourceFieldName,
            dataType: 'Text',
            isKeyColumn: index === 0,
            isProjected: true,
            usageTag: index === 1 ? 'KEY_QUALIFIER' : 'NONE',
          };
        }),
      },
    },
  });
  const observed = observeNativeDataGraph(raw, document);
  graphRequire(observed.status === 'ready');
  graphRequire(
    isDeepStrictEqual(
      { state: 'present', observation: observed },
      await acquireNativeDataGraph(context, document),
    ) && isDeepStrictEqual(root, await bindNativeGraphRoot(context)),
  );
  return document;
}

export const nativeGraphLimitations =
  'Native dependency and related-segment arrays are explicitly empty; exhaustive external-consumer exclusion is unverified. Definition absence does not establish generated DMO, mapping or transform cleanup, computation success, storage reclamation or credit savings.';
export type NativeGraphOperationResult = {
  outcome: 'create' | 'delete' | 'created' | 'deleted' | 'unchanged' | 'blocked' | 'failed';
  mutation: 'not-attempted' | 'confirmed-created' | 'confirmed-deleted' | 'unknown';
};

/**
 * Bind one invocation to fresh target identity and root; never import creation ownership.
 * @param {unknown} value Exact local native intent.
 * @param {NativeGraphContext} context Independently org-bound readers.
 * @param {DataGraphClient} client Single-attempt writer.
 * @param {object} options Explicit operation intent and immutable source verifier.
 * @param {'deploy' | 'delete'} options.operation Requested product operation.
 * @param {boolean} options.preview Zero-write comparison.
 * @param {boolean} options.confirmed Explicit processing/deletion acknowledgement.
 * @param {Function} options.verifyInput Re-admit exact local bytes and flags.
 * @param {Function} [options.pause] Read-only polling seam.
 * @returns {Promise<NativeGraphOperationResult>} Truthful mutation evidence.
 */
export async function operateNativeDataGraph(
  value: unknown,
  context: NativeGraphContext,
  client: DataGraphClient,
  options: {
    operation: 'deploy' | 'delete';
    preview: boolean;
    confirmed: boolean;
    verifyInput: () => Promise<void>;
    pause?: Parameters<typeof settleNativeDataGraph>[3];
  },
): Promise<NativeGraphOperationResult> {
  let attempted = false;
  const original = context;
  const end = Date.now() + 120_000;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  context = {
    ...original,
    check: () => {
      original.check();
      graphRequire(!expired && Date.now() < end && context.orgId === original.orgId);
    },
  };
  // Guard the actual dispatch, including CREATE delegated to the fixture lifecycle.
  const writer: DataGraphClient = {
    get: (name) => client.get(name),
    create: (definition) => {
      context.check();
      attempted = true;
      return client.create(definition);
    },
    delete: (name) => {
      context.check();
      attempted = true;
      return client.delete(name);
    },
  };
  const work = async (): Promise<NativeGraphOperationResult> => {
    context.check();
    const document = validateNativeDataGraphDocument(value);
    const orgId = context.orgId;
    await options.verifyInput();
    const root = await bindNativeGraphRoot(context);
    const before = await acquireNativeDataGraph(context, document);
    context.check();
    graphRequire(context.orgId === orgId);
    if (before.state === 'absent' && options.operation === 'delete')
      return { outcome: 'unchanged', mutation: 'not-attempted' };
    if (
      before.state === 'present' &&
      before.observation.status === 'ready' &&
      options.operation === 'deploy'
    ) {
      await options.verifyInput();
      graphRequire(
        isDeepStrictEqual(before, await acquireNativeDataGraph(context, document)) &&
          isDeepStrictEqual(root, await bindNativeGraphRoot(context)),
      );
      return { outcome: 'unchanged', mutation: 'not-attempted' };
    }
    graphRequire(
      options.operation === 'deploy'
        ? before.state === 'absent'
        : before.state === 'present' && before.observation.status === 'ready',
    );
    await options.verifyInput();
    graphRequire(
      isDeepStrictEqual(before, await acquireNativeDataGraph(context, document)) &&
        isDeepStrictEqual(root, await bindNativeGraphRoot(context)) &&
        context.orgId === orgId,
    );
    if (options.preview)
      return {
        outcome: options.operation === 'deploy' ? 'create' : 'delete',
        mutation: 'not-attempted',
      };
    graphRequire(options.confirmed === true);
    if (options.operation === 'deploy') {
      // Reuse the qualified create settlement; fixture ownership is not public delete authority.
      const lifecycle = nativeDataGraphLifecycle(document, context, writer, {
        record: async (phase) => {
          await options.verifyInput();
          if (phase === 'create-attempt')
            graphRequire(
              isDeepStrictEqual(root, await bindNativeGraphRoot(context)) &&
                isDeepStrictEqual(before, await acquireNativeDataGraph(context, document)),
            );
        },
        safeToDelete: async () => false,
        pause: options.pause,
      });
      const result = await lifecycle.create(true);
      return {
        outcome:
          result.outcome === 'created'
            ? 'created'
            : result.outcome === 'unknown'
              ? 'failed'
              : 'blocked',
        mutation:
          result.outcome === 'created'
            ? 'confirmed-created'
            : result.mutation === 'attempted'
              ? 'unknown'
              : 'not-attempted',
      };
    }
    // Observation validation requires explicit empty native node/field dependencies and segments.
    // Compare all captured identity/date/definition fields again after local admission, immediately before dispatch.
    await options.verifyInput();
    graphRequire(
      isDeepStrictEqual(before, await acquireNativeDataGraph(context, document)) &&
        isDeepStrictEqual(root, await bindNativeGraphRoot(context)),
    );
    context.check();
    graphRequire(context.orgId === orgId);
    try {
      await writer.delete(document.definition.name as string);
    } catch {
      /* GET-only reconciliation; never replay DELETE. */
    }
    const settled = await settleNativeDataGraph(context, document, 'absent', options.pause);
    graphRequire(settled.state === 'absent');
    return { outcome: 'deleted', mutation: 'confirmed-deleted' };
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error('Native Graph deadline'));
        }, 120_000);
      }),
    ]);
  } catch {
    return {
      outcome: attempted ? 'failed' : 'blocked',
      mutation: attempted ? 'unknown' : 'not-attempted',
    };
  } finally {
    expired = true;
    clearTimeout(timer);
  }
}
