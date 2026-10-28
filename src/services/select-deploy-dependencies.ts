import { lstat } from 'node:fs/promises';
import path from 'node:path';
import type { DeployInput } from '../artifacts/read-deploy-input.js';
import {
  readDeployInputs,
  captureDeployInputDigest,
  verifySegmentInputDigest,
} from '../artifacts/read-deploy-input.js';
import {
  dependencyKey,
  dependencyLimits,
  DependencySelectionError,
  documentDependencyNode,
  orderDependencyNodes,
} from '../artifacts/dependency-selection.js';
import type { DependencyIdentity, SelectionReason } from '../artifacts/dependency-selection.js';

export type DeployDependencySelection = {
  inputs: DeployInput[];
  reasons: Map<string, SelectionReason>;
  verify: () => Promise<void>;
};

/**
 * Expand only admitted local DMO artifacts. Missing local prerequisites remain external bindings.
 * Original inputs (including Git pair digests) are retained, never reconstructed or replaced.
 * @param {DeployInput[]} roots Independently admitted explicit or Git roots.
 * @param {string} cwd Project root for exact conventional local dependencies.
 * @returns {Promise<DeployDependencySelection>} Bounded ordered inputs, reasons and fresh digest guard.
 */
export async function selectDeployDependencies(
  roots: DeployInput[],
  cwd: string,
): Promise<DeployDependencySelection> {
  const inputs = new Map<string, DeployInput>();
  const reasons = new Map<string, SelectionReason>();
  const nodes = new Map<string, ReturnType<typeof documentDependencyNode>>();
  const pending: Array<{ input: DeployInput; chain: DependencyIdentity[] }> = [];
  const external = new Set<string>();
  let acquisitions = 0;
  for (const input of roots) {
    const node = documentDependencyNode(input.document);
    const key = dependencyKey(node.identity);
    const prior = inputs.get(key);
    if (prior && prior.path !== input.path)
      throw new DependencySelectionError('DEPENDENCY_DUPLICATE_IDENTITY');
    if (prior) continue;
    inputs.set(key, input);
    reasons.set(key, { explicit: true, chains: [[node.identity]] });
    pending.push({ input, chain: [node.identity] });
  }
  for (let index = 0; index < pending.length; index++) {
    const { input, chain } = pending[index];
    if (chain.length > dependencyLimits.depth || inputs.size > dependencyLimits.nodes)
      throw new DependencySelectionError('DEPENDENCY_LIMIT_EXCEEDED');
    const node = documentDependencyNode(input.document);
    nodes.set(dependencyKey(node.identity), node);
    for (const dependency of node.dependencies) {
      const key = dependencyKey(dependency);
      if (chain.some((ancestor) => dependencyKey(ancestor) === key))
        throw new DependencySelectionError('DEPENDENCY_CYCLE');
      const reason = reasons.get(key);
      const nextChain = [...chain, dependency];
      if (reason) {
        reason.chains.push(nextChain);
        continue;
      }
      if (external.has(key)) continue;
      if (dependency.kind !== 'dmo')
        throw new DependencySelectionError('DEPENDENCY_FAMILY_UNSUPPORTED');
      if (++acquisitions > dependencyLimits.acquisitions)
        throw new DependencySelectionError('DEPENDENCY_LIMIT_EXCEEDED');
      const file = path.join(cwd, 'data360', 'default', 'dmo', `${dependency.apiName}.json`);
      try {
        await lstat(file);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        external.add(key);
        continue;
      }
      const added = await readDeployInputs({ cwd, metadata: [`dmo:${dependency.apiName}`] });
      if (
        added.length !== 1 ||
        dependencyKey(documentDependencyNode(added[0].document).identity) !== key
      )
        throw new DependencySelectionError('DEPENDENCY_IDENTITY_UNSUPPORTED');
      inputs.set(key, added[0]);
      reasons.set(key, { explicit: false, chains: [nextChain] });
      pending.push({ input: added[0], chain: nextChain });
    }
  }
  const ordered = orderDependencyNodes([...nodes.values()]).map((key) => inputs.get(key)!);
  const digests = await Promise.all(
    ordered.map(async (input) => ({ input, digest: await captureDeployInputDigest(input) })),
  );
  const verify = async (): Promise<void> => {
    for (const { input, digest } of digests) {
      if ('inputDigest' in input) await verifySegmentInputDigest(input);
      if ((await captureDeployInputDigest(input)) !== digest)
        throw new DependencySelectionError('DEPENDENCY_INPUT_CHANGED');
    }
  };
  await verify();
  return { inputs: ordered, reasons, verify };
}
