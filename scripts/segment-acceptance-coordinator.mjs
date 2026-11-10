import './check-temporary.mjs';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { createSegmentAcceptanceRunner } from './segment-acceptance-runner.mjs';
import {
  admitOriginalOwner,
  compareFinal,
  bindArtifact,
  assertArtifactUnchanged,
} from './segment-acceptance-baseline.mjs';

const phase = (name, operation, orgProcesses, metadataJobs, logicalReads, milliseconds) =>
  Object.freeze({
    name,
    operation,
    cost: Object.freeze({ orgProcesses, metadataJobs, logicalReads, milliseconds }),
  });
// Complete bounded operation envelopes, including descendants and metadata polls.
export const SEGMENT_ACCEPTANCE_SCHEDULE = Object.freeze([
  phase('baseline', 'historical-launcher', 2, 1, 10, 370_000),
  phase('retrieve', 'segment-retrieve', 2, 1, 10, 370_000),
  phase('repeat', 'segment-retrieve', 2, 1, 10, 370_000),
  phase('preview', 'segment-preview', 2, 1, 10, 370_000),
  phase('deploy', 'segment-deploy', 5, 4, 40, 600_000),
  phase('final', 'historical-launcher', 2, 1, 10, 370_000),
]);
const finalCost = SEGMENT_ACCEPTANCE_SCHEDULE.at(-1).cost;
const decode = (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const fail = (reason) => {
  throw new Error(`SEGMENT_ACCEPTANCE_COORDINATOR: ${reason}`);
};
const healthy = (audit) => {
  if (!audit || audit.stopped || audit.pending.length > 0 || audit.activeJobs.length > 0)
    fail('unhealthy or unsettled ledger');
};
const kernel = (receipt) => {
  const evidence = receipt?.evidence;
  if (
    !receipt?.id ||
    evidence?.assignedBeforeResume !== true ||
    evidence.rootExited !== true ||
    evidence.activeProcessesZero !== true ||
    evidence.outputDrained !== true ||
    evidence.outputTruncated !== false
  )
    fail('missing kernel receipt');
};

/**
 * Decode the actual retained native stdout, including the oclif --json wrapper.
 * @param {object} receipt Completed runner receipt.
 * @param {object} profile Pinned org/selection.
 * @param {object} artifact Bound installed package identity.
 * @param {string} name Fixed phase name.
 * @returns {object} Checked single public result item.
 */
function publicItem(receipt, profile, artifact, name) {
  const retrieve = name === 'retrieve' || name === 'repeat';
  const operation = retrieve ? 'retrieve' : 'deploy';
  const stdout = receipt.evidence.stdout;
  if ((!Buffer.isBuffer(stdout) && typeof stdout !== 'string') || stdout.length === 0)
    fail('missing public stdout');
  const decoded = JSON.parse(
    Buffer.isBuffer(stdout) ? new TextDecoder('utf-8', { fatal: true }).decode(stdout) : stdout,
  );
  const envelope = decoded?.result;
  const equal = (actual, expected) => {
    if (!isDeepStrictEqual(actual, expected)) fail(`invalid public ${name} result`);
  };
  equal(Object.keys(decoded).toSorted(), ['status', 'result', 'warnings'].toSorted());
  equal(
    Object.keys(envelope ?? {}).toSorted(),
    [
      'contract',
      'contractVersion',
      'status',
      'metadata',
      'diagnostics',
      'provenance',
      'result',
    ].toSorted(),
  );
  equal(decoded.status, 0);
  equal(decoded.warnings, []);
  equal(envelope?.contract, `sf-data360-${operation}`);
  equal(envelope.contractVersion, '1.0.0');
  equal(envelope.status, 'success');
  equal(envelope.metadata, {
    operation,
    ...(retrieve ? {} : { preview: name === 'preview' }),
    plugin: artifact.packageIdentity,
    apiVersion: '65.0',
    soapApiVersion: '65.0',
  });
  equal(envelope.diagnostics, { warnings: [], errors: [] });
  const provenance = envelope.provenance;
  equal(
    Object.keys(provenance ?? {}).toSorted(),
    [
      'producer',
      'pluginVersion',
      'command',
      'generatedAt',
      retrieve ? 'sourceOrgId' : 'targetOrgId',
    ].toSorted(),
  );
  equal(Object.keys(envelope.result ?? {}).toSorted(), ['scope', 'selection', 'items'].toSorted());
  equal(provenance?.producer, artifact.packageIdentity.name);
  equal(provenance.pluginVersion, artifact.packageIdentity.version);
  equal(provenance.command, `sf data360 ${operation}`);
  equal(provenance[retrieve ? 'sourceOrgId' : 'targetOrgId'], profile.orgId);
  if (
    typeof provenance.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(provenance.generatedAt))
  )
    fail('missing public timestamp');
  equal(envelope.result.scope, {
    dataSpace: 'default',
    ...(retrieve ? { outputDir: profile.cwd } : {}),
  });
  equal(
    envelope.result.selection,
    retrieve
      ? [`segment:${profile.segment}`]
      : { sourceDir: [], metadata: [`segment:${profile.segment}`] },
  );
  if (!Array.isArray(envelope.result.items) || envelope.result.items.length !== 1)
    fail('exactly one public item required');
  const item = envelope.result.items[0];
  equal(item?.identity, { dataSpace: 'default', apiName: profile.segment });
  equal(item.family, 'segment');
  equal(item.operation, retrieve ? 'retrieve' : name === 'preview' ? 'preview' : 'execute');
  if (
    typeof item.path !== 'string' ||
    !path.win32.isAbsolute(item.path) ||
    (!item.path.endsWith(
      `/marketSegmentDefinitions/${profile.segment}.marketSegmentDefinition-meta.xml`,
    ) &&
      !item.path.endsWith(
        `\\marketSegmentDefinitions\\${profile.segment}.marketSegmentDefinition-meta.xml`,
      ))
  )
    fail('invalid public pair path');
  const file = path.win32.resolve(item.path);
  const relative = path.win32.relative(profile.cwd, file);
  if (!relative || relative.startsWith('..') || path.win32.isAbsolute(relative))
    fail('public pair outside project');
  if (retrieve) {
    if (
      !['retrieved', 'unchanged'].includes(item.outcome) ||
      (name === 'repeat' && item.outcome !== 'unchanged')
    )
      fail('invalid public retrieve outcome');
    const base = path.win32.dirname(path.win32.dirname(file));
    equal(
      path.win32.resolve(item.companionPath ?? ''),
      path.win32.join(base, 'data360', 'segments', `${profile.segment}.segment.json`),
    );
    equal(
      Object.keys(item).toSorted(),
      ['identity', 'family', 'operation', 'outcome', 'path', 'companionPath'].toSorted(),
    );
  } else {
    equal(item.outcome, 'unchanged');
    equal(item.requiredEffects, []);
    equal(item.diagnostics, []);
    equal(item.route, {
      apiVersion: '65.0',
      method: name === 'preview' ? 'GET' : 'PATCH',
      resource: 'segments',
    });
    const preview = {
      outcome: 'unchanged',
      target: 'present',
      absenceProof: 'none',
      diagnostics: [],
    };
    if (name === 'preview') {
      equal(item.target, preview.target);
      equal(item.absenceProof, preview.absenceProof);
    } else {
      equal(item.mutation, 'not-attempted');
      equal(item.preflight, preview);
    }
    equal(
      Object.keys(item).toSorted(),
      [
        'identity',
        'family',
        'operation',
        'outcome',
        'path',
        'route',
        'requiredEffects',
        'diagnostics',
        ...(name === 'preview' ? ['target', 'absenceProof'] : ['mutation', 'preflight']),
      ].toSorted(),
    );
  }
  return item;
}

/**
 * Check the public pair against independently admitted raw state, not installed projection code.
 * @param {object} pair Reader-supplied exact {jsonBytes,xmlBytes} from the public paths.
 * @param {object} baseline Independently admitted baseline.
 * @returns {object} Detached bytes for repeat comparison.
 */
function publicPair(pair, baseline) {
  if (
    !Buffer.isBuffer(pair?.jsonBytes) ||
    !Buffer.isBuffer(pair?.xmlBytes) ||
    pair.jsonBytes.length > 1_048_576 ||
    pair.xmlBytes.length > 1_048_576
  )
    fail('missing or oversized public pair');
  const segment = baseline.raw.runtime.segments[0];
  const dependency = {
    kind: 'dmo',
    dataSpace: 'default',
    apiName: baseline.expectedForward.dmoApiName,
  };
  const expected = {
    schemaVersion: 1,
    kind: 'segment',
    identity: { dataSpace: 'default', apiName: segment.apiName },
    spec: {
      displayName: segment.displayName,
      description: segment.description,
      segmentType: segment.segmentType,
      segmentOn: dependency,
      models: segment.includeDbt.models,
      dependencies: [{ ...dependency, fields: [baseline.expectedForward.fieldApiName] }],
      publishInterval: segment.publishInterval,
      lookbackPeriod: segment.lookbackPeriod,
    },
  };
  if (
    !isDeepStrictEqual(JSON.parse(decode(pair.jsonBytes)), expected) ||
    decode(pair.xmlBytes) !== baseline.raw.definitionXml
  )
    fail('public pair differs from independent baseline');
  return { jsonBytes: Buffer.from(pair.jsonBytes), xmlBytes: Buffer.from(pair.xmlBytes) };
}

/**
 * Execute the sole ordered offline-qualified outcome boundary, never claim live acquisition proof.
 * Acquisition decodes independently obtained raw evidence from the completed historical root;
 * it must not dispatch additional work outside that root or delegate to installed services.
 * Factories/clocks are explicit synthetic test seams, not live adapter qualification.
 * @param {object} input Pinned profile and evidence acquisition functions.
 * @param {object} seams Synthetic runner/clock seams; production uses the owned runner.
 * @returns {Promise<object>} Outcome receipt only after every final audit succeeds.
 */
export async function coordinateSegmentAcceptance(input, seams = {}) {
  try {
    return await coordinatePrivate(input, seams);
  } catch {
    throw new Error('SEGMENT_ACCEPTANCE_COORDINATOR: acceptance refused');
  }
}

/**
 * Keep raw runner receipts and adapter failures inside the coordinator boundary.
 * @param {object} input Acceptance inputs.
 * @param {object} seams Synthetic runner/clock seams.
 * @returns {Promise<object>} Redacted outcome.
 */
async function coordinatePrivate(input, seams) {
  const allowed = [
    'profile',
    'originalOwner',
    'expectedForward',
    'artifactEvidence',
    'acquire',
    'readPair',
  ];
  if (
    !input ||
    Object.keys(input).some((key) => !allowed.includes(key)) ||
    allowed.some((key) => !Object.hasOwn(input, key)) ||
    typeof input.artifactEvidence !== 'function' ||
    typeof input.acquire !== 'function' ||
    typeof input.readPair !== 'function' ||
    typeof input.profile?.orgId !== 'string' ||
    typeof input.profile?.cwd !== 'string' ||
    Object.keys(seams).some((key) => !['createRunner', 'now', 'wallNow'].includes(key))
  )
    fail('invalid coordinator inputs or schedule override');
  if (
    input.expectedForward?.apiName !== input.profile?.segment ||
    input.expectedForward?.dmoApiName !== input.profile?.dmo ||
    input.expectedForward?.fieldApiName !== input.profile?.field
  )
    fail('baseline selection differs from pinned runner');
  const worstCase = SEGMENT_ACCEPTANCE_SCHEDULE.reduce(
    (total, step) => total + step.cost.milliseconds,
    0,
  );
  if (worstCase > 1_800_000) fail('declared schedule cannot fit all-in deadline');
  const now = seams.now ?? (() => Math.floor(performance.now()));
  const wallNow = seams.wallNow ?? Date.now;
  const startedAt = now(); // Includes runner/broker setup, artifact binding and evidence audits.
  if (!Number.isSafeInteger(startedAt) || startedAt < 0) fail('invalid monotonic start');
  const deadline = wallNow() + 1_800_000;
  let previous = startedAt;
  const checkTime = () => {
    const current = now();
    if (
      !Number.isSafeInteger(current) ||
      current < 0 ||
      current < previous ||
      current - startedAt >= 1_800_000
    )
      fail('all-in deadline or clock violation');
    previous = current;
    return 1_800_000 - (current - startedAt);
  };
  let runner;
  let runnerClosed = false;
  let baseline;
  let comparison;
  let finalStarted;
  let firstPair;
  let firstItem;
  let repeated = false;
  const receipts = [];
  try {
    checkTime();
    runner = await (seams.createRunner ?? createSegmentAcceptanceRunner)(input.profile, {
      now,
      startedAt,
    });
    checkTime();
    const artifact = bindArtifact(await input.artifactEvidence());
    checkTime();
    for (const step of SEGMENT_ACCEPTANCE_SCHEDULE) {
      if (step.name !== 'baseline' && !baseline) fail('independent baseline required');
      // Refuse drift before any public operation as well as in the final audit.
      assertArtifactUnchanged(artifact, await input.artifactEvidence());
      const remaining = checkTime();
      healthy(runner.audit());
      if (step.name !== 'final' && remaining <= finalCost.milliseconds + step.cost.milliseconds)
        fail('complete phase and final reserve unavailable');
      runner.beginPhase(step.name, step.cost, finalCost);
      const before = runner.audit();
      const phaseStarted = now();
      if (step.name === 'final') finalStarted = phaseStarted;
      const receipt = await runner.runRoot({
        operation: step.operation,
        timeoutMs: Math.min(step.cost.milliseconds - 20_000, 580_000),
        deadline,
      });
      kernel(receipt);
      checkTime();
      healthy(runner.audit());
      receipts.push(receipt);
      if (step.name === 'preview' && !repeated) fail('second public retrieve required');
      if (!['baseline', 'final'].includes(step.name)) {
        const item = publicItem(receipt, input.profile, artifact, step.name);
        if (
          firstItem &&
          (item.path !== firstItem.path ||
            (step.name === 'repeat' && item.companionPath !== firstItem.companionPath))
        )
          fail('public pair selection changed');
        if (step.name === 'retrieve') firstItem = structuredClone(item);
        if (step.name === 'retrieve' || step.name === 'repeat') {
          const pair = publicPair(
            await input.readPair({ phase: step.name, receipt, item }),
            baseline,
          );
          if (step.name === 'retrieve') firstPair = pair;
          else {
            if (
              !firstPair ||
              !pair.jsonBytes.equals(firstPair.jsonBytes) ||
              !pair.xmlBytes.equals(firstPair.xmlBytes)
            )
              fail('repeat public pair bytes changed');
            repeated = true;
          }
        }
      }
      if (step.name === 'baseline' || step.name === 'final') {
        const acquired = await input.acquire({ phase: step.name, receipt });
        if (acquired?.provenance?.acquisition?.implementation !== input.acquire)
          fail('independent acquisition identity required');
        if (step.name === 'baseline')
          baseline = admitOriginalOwner(
            input.originalOwner,
            acquired.raw,
            input.expectedForward,
            acquired.provenance,
          );
        else comparison = compareFinal(baseline, acquired.raw, acquired.provenance);
        // A complete raw audit needs root+child, one retrieve and at least six reads:
        // runtime, DMO detail, CustomObject, retrieve, status, terminal ZIP result.
        const after = runner.audit();
        healthy(after);
        if (
          after.used.orgProcesses - before.used.orgProcesses < 2 ||
          after.used.metadataJobs - before.used.metadataJobs !== 1 ||
          after.used.logicalReads - before.used.logicalReads < 6
        )
          fail('incomplete actual acquisition cost');
      }
      checkTime();
      if (now() - phaseStarted >= step.cost.milliseconds) fail('phase audit deadline');
    }
    if (!comparison?.equal || receipts.length !== SEGMENT_ACCEPTANCE_SCHEDULE.length)
      fail('missing final comparison');
    assertArtifactUnchanged(artifact, await input.artifactEvidence());
    checkTime();
    healthy(runner.audit());
    await runner.close();
    runnerClosed = true;
    checkTime();
    const audit = runner.audit();
    healthy(audit);
    if (now() - finalStarted >= finalCost.milliseconds) fail('final completion audit deadline');
    return Object.freeze({
      kind: 'segment-acceptance-outcome-v1',
      success: true,
      liveAcquisitionProven: false,
      artifactDigest: artifact.digest,
      comparison: Object.freeze({
        equal: comparison.equal,
        baselineDigest: comparison.baselineDigest,
        finalDigest: comparison.finalDigest,
        liveAcquisitionProven: false,
      }),
      receipts: Object.freeze(receipts.map(() => Object.freeze({ completed: true }))),
      audit: Object.freeze({
        used: Object.freeze({
          orgProcesses: audit.used.orgProcesses,
          metadataJobs: audit.used.metadataJobs,
          logicalReads: audit.used.logicalReads,
        }),
        authRequests: 'UNKNOWN',
        wireRequests: 'UNKNOWN',
      }),
    });
  } catch (error) {
    runner?.stop('coordinator refused');
    throw error;
  } finally {
    if (!runnerClosed) await runner?.close();
  }
}
