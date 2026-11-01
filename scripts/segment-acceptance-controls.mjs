import './check-temporary.mjs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const SEGMENT_ACCEPTANCE_LIMITS = Object.freeze({
  orgProcesses: 16,
  metadataJobs: 9,
  logicalReads: 100,
  milliseconds: 1_800_000,
  subprocessMilliseconds: 600_000,
});
const dimensions = ['orgProcesses', 'metadataJobs', 'logicalReads', 'milliseconds'];
const minimumReserve = { orgProcesses: 1, metadataJobs: 1, logicalReads: 4, milliseconds: 300_000 };
const metadataNamespace = 'http://soap.sforce.com/2006/04/metadata';
const soapNamespace = 'http://schemas.xmlsoap.org/soap/envelope/';
const fail = (reason) => {
  throw new Error(`SEGMENT_ACCEPTANCE: ${reason}`);
};
const exactKeys = (value, keys) => {
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !isDeepStrictEqual(Reflect.ownKeys(value).toSorted(), keys.toSorted())
  )
    fail('unexpected descriptor fields');
};
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const identifier = (value) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/u.test(value);
const operationId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/u.test(value);
const cost = (value) => {
  exactKeys(value, dimensions);
  for (const key of dimensions) if (!integer(value[key])) fail('invalid cost');
  return { ...value };
};
const absolute = (value) => {
  if (
    typeof value !== 'string' ||
    !(path.isAbsolute(value) || path.win32.isAbsolute(value)) ||
    /[\r\n\0]/u.test(value) ||
    value.split(/[\\/]/u).some((part) => part === '..' || part === '.')
  )
    fail('invalid pinned path');
};

/**
 * Detach a fixed selection; profile values are trusted admission inputs, not observed request data.
 * @param {object} input Pinned execution and selection identity.
 * @returns {object} Immutable profile.
 */
export function validateSegmentAcceptanceProfile(input) {
  exactKeys(input, [
    'executable',
    'cliEntry',
    'launcherEntry',
    'importOrigin',
    'cwd',
    'orgId',
    'targetOrg',
    'origin',
    'apiVersion',
    'segment',
    'dmo',
    'field',
  ]);
  for (const key of ['executable', 'cliEntry', 'launcherEntry', 'importOrigin', 'cwd'])
    absolute(input[key]);
  if (
    !['node', 'node.exe'].includes(path.win32.basename(input.executable)) ||
    !/^00D[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u.test(input.orgId) ||
    typeof input.targetOrg !== 'string' ||
    !/^[A-Za-z0-9_@.+-]+$/u.test(input.targetOrg) ||
    input.targetOrg.startsWith('-') ||
    input.apiVersion !== '65.0' ||
    !['segment', 'dmo', 'field'].every((key) => identifier(input[key]))
  )
    fail('invalid selection identity');
  const origin = new URL(input.origin);
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== input.origin ||
    origin.username ||
    origin.password
  )
    fail('invalid source origin');
  return Object.freeze({ ...input });
}

/**
 * Build complete supported argv, never accept caller-provided command fragments.
 * @param {object} profile Validated pinned profile.
 * @param {string} operation Known local operation.
 * @returns {string[]} Complete Node argv.
 */
export function buildSegmentAcceptanceArgv(profile, operation) {
  const p = validateSegmentAcceptanceProfile(profile);
  const common = ['--target-org', p.targetOrg, '--api-version', '65.0'];
  switch (operation) {
    case 'historical-launcher': {
      return [p.launcherEntry, '--target-org', p.targetOrg, '--segment', p.segment];
    }
    case 'segment-retrieve': {
      return [
        p.cliEntry,
        'data360',
        'retrieve',
        '--metadata',
        `segment:${p.segment}`,
        ...common,
        '--json',
      ];
    }
    case 'segment-preview':
    case 'segment-deploy': {
      return [
        p.cliEntry,
        'data360',
        'deploy',
        '--metadata',
        `segment:${p.segment}`,
        ...common,
        ...(operation === 'segment-preview' ? ['--preview'] : []),
        '--json',
      ];
    }
    case 'metadata-retrieve': {
      return [
        p.cliEntry,
        'project',
        'retrieve',
        'start',
        '--metadata',
        `MarketSegmentDefinition:${p.segment}`,
        ...common,
        '--wait',
        '5',
        '--json',
      ];
    }
    default: {
      return fail('unknown process operation');
    }
  }
}

/**
 * Check the executable, complete argv, launch API and pinned installed origin.
 * @param {object} profile Pinned selection.
 * @param {object} descriptor Complete launch descriptor; no shell/options bag is accepted.
 * @param {Set<string>} registeredScratch Parent-registered scratch roots.
 * @returns {object} Detached admission descriptor.
 */
export function validateSegmentProcess(profile, descriptor, registeredScratch = new Set()) {
  exactKeys(descriptor, [
    'id',
    'operation',
    'executable',
    'argv',
    'cwd',
    'importOrigin',
    'api',
    'shell',
    'timeoutMs',
  ]);
  if (
    !operationId(descriptor.id) ||
    descriptor.executable !== profile.executable ||
    (descriptor.cwd !== profile.cwd &&
      !(descriptor.operation === 'metadata-retrieve' && registeredScratch.has(descriptor.cwd))) ||
    descriptor.importOrigin !== profile.importOrigin ||
    !['spawn', 'execFile'].includes(descriptor.api) ||
    (descriptor.api === 'execFile' && descriptor.operation !== 'metadata-retrieve') ||
    descriptor.shell !== false ||
    !integer(descriptor.timeoutMs) ||
    descriptor.timeoutMs === 0 ||
    descriptor.timeoutMs > SEGMENT_ACCEPTANCE_LIMITS.subprocessMilliseconds ||
    !isDeepStrictEqual(descriptor.argv, buildSegmentAcceptanceArgv(profile, descriptor.operation))
  )
    fail('process not exactly admitted');
  return Object.freeze({ ...descriptor, argv: Object.freeze([...descriptor.argv]) });
}

/**
 * Check one semantic read before dispatch. Adapter must derive body from actual bytes.
 * @param {object} profile Pinned profile.
 * @param {object} request Exact logical request, not an HTTP options bag.
 * @param {Set<string>} activeJobs Previously admitted retrieve result IDs.
 * @returns {object} Validated detached request.
 */
export function validateSegmentRead(profile, request, activeJobs = new Set()) {
  exactKeys(request, ['id', 'method', 'url', 'orgId', 'apiVersion', 'redirect', 'body']);
  if (
    !operationId(request.id) ||
    request.orgId !== profile.orgId ||
    request.apiVersion !== '65.0' ||
    request.redirect !== 'error'
  )
    fail('request identity or redirect refused');
  const base = `${profile.origin}/services/data/v65.0`;
  const getUrls = [
    `${base}/ssot/segments/${profile.segment}`,
    `${base}/ssot/data-model-objects/${profile.dmo}`,
    `${base}/query?q=${encodeURIComponent(`SELECT Id FROM Organization WHERE Id = '${profile.orgId}'`)}`,
  ];
  if (request.method === 'GET' && request.body === undefined && getUrls.includes(request.url))
    return Object.freeze({ ...request });
  if (
    request.method !== 'POST' ||
    request.url !== `${profile.origin}/services/Soap/m/65.0/${profile.orgId}`
  )
    fail('unrecognized read route');
  const body = request.body;
  if (!body || body.namespace !== metadataNamespace) fail('metadata namespace refused');
  switch (body.operation) {
    case 'readMetadata': {
      exactKeys(body, ['namespace', 'operation', 'type', 'fullNames']);
      if (body.type !== 'CustomObject' || !isDeepStrictEqual(body.fullNames, [profile.dmo]))
        fail('unselected metadata read');
      break;
    }
    case 'retrieve': {
      exactKeys(body, ['namespace', 'operation', 'apiVersion', 'singlePackage', 'types']);
      if (
        body.apiVersion !== '65.0' ||
        body.singlePackage !== true ||
        !isDeepStrictEqual(body.types, [
          { name: 'MarketSegmentDefinition', members: [profile.segment] },
        ])
      )
        fail('unselected metadata retrieve');
      break;
    }
    case 'checkRetrieveStatus':
    case 'retrieveResult': {
      exactKeys(body, ['namespace', 'operation', 'jobId', 'includeZip']);
      if (!activeJobs.has(body.jobId) || body.includeZip !== (body.operation === 'retrieveResult'))
        fail('inactive or unknown metadata job');
      break;
    }
    default: {
      fail('unknown metadata operation');
    }
  }
  return Object.freeze(structuredClone(request));
}

/**
 * Strict canonical SOAP adapter seam. No DTD/entities/headers/unknown XML are accepted.
 * The observer must either use these exact envelopes or supply an independently strict parser.
 * @param {object} profile Pinned profile.
 * @param {string} xml Actual UTF-8 SOAP body without authentication headers.
 * @param {Set<string>} activeJobs Exact registered active jobs.
 * @returns {object} Semantic body for validateSegmentRead.
 */
export function parseSegmentReadSoap(profile, xml, activeJobs = new Set()) {
  if (typeof xml !== 'string' || xml.length > 16_384) fail('invalid SOAP bytes');
  const wrap = (body) =>
    `<soapenv:Envelope xmlns:soapenv="${soapNamespace}" xmlns:met="${metadataNamespace}"><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`;
  const bodies = [
    [
      {
        namespace: metadataNamespace,
        operation: 'readMetadata',
        type: 'CustomObject',
        fullNames: [profile.dmo],
      },
      `<met:readMetadata><met:type>CustomObject</met:type><met:fullNames>${profile.dmo}</met:fullNames></met:readMetadata>`,
    ],
    [
      {
        namespace: metadataNamespace,
        operation: 'retrieve',
        apiVersion: '65.0',
        singlePackage: true,
        types: [{ name: 'MarketSegmentDefinition', members: [profile.segment] }],
      },
      `<met:retrieve><met:retrieveRequest><met:apiVersion>65.0</met:apiVersion><met:singlePackage>true</met:singlePackage><met:unpackaged><met:types><met:members>${profile.segment}</met:members><met:name>MarketSegmentDefinition</met:name></met:types><met:version>65.0</met:version></met:unpackaged></met:retrieveRequest></met:retrieve>`,
    ],
  ];
  for (const jobId of activeJobs) {
    if (!/^09S[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u.test(jobId)) fail('invalid registered job');
    for (const includeZip of [false, true])
      bodies.push([
        {
          namespace: metadataNamespace,
          operation: includeZip ? 'retrieveResult' : 'checkRetrieveStatus',
          jobId,
          includeZip,
        },
        `<met:checkRetrieveStatus><met:asyncProcessId>${jobId}</met:asyncProcessId><met:includeZip>${includeZip}</met:includeZip></met:checkRetrieveStatus>`,
      ]);
  }
  const match = bodies.find(([, body]) => xml === wrap(body));
  if (!match) fail('SOAP not in exact canonical grammar');
  return match[0];
}

/**
 * Own the single authoritative acceptance ledger. Call before setup, share through the parent broker.
 * This ledger does not observe traffic itself; auth and physical wire counts remain UNKNOWN.
 * @param {object} input Fixed profile, never budget overrides.
 * @param {object} options Deterministic monotonic clock seam.
 * @param {Function} [options.now] Nondecreasing safe integer milliseconds from the shared clock.
 * @param {number} [options.startedAt] Start captured from that same clock before setup.
 * @returns {object} Immutable methods with detached audit snapshots.
 */
export function createSegmentAcceptance(input, { now, startedAt } = {}) {
  if (startedAt !== undefined && typeof now !== 'function') fail('invalid clock');
  now ??= () => Math.floor(performance.now());
  if (typeof now !== 'function') fail('invalid clock');
  const initialTime = now();
  const start = startedAt === undefined ? initialTime : startedAt;
  if (!integer(start) || !integer(initialTime) || initialTime < start) fail('invalid clock');
  const profile = validateSegmentAcceptanceProfile(input);
  let previousTime = initialTime;
  let stopped;
  let phase;
  let finalCost;
  let finalStarted = false;
  const used = { orgProcesses: 0, metadataJobs: 0, logicalReads: 0 };
  const ids = new Set();
  const phaseNames = new Set();
  const pending = new Map();
  const jobs = new Map();
  const registeredScratch = new Set();
  const stop = (reason) => {
    stopped ??= String(reason);
  };
  const refuse = (reason) => {
    stop(reason);
    fail(stopped);
  };
  const clock = () => {
    const time = now();
    if (
      !integer(time) ||
      time < previousTime ||
      time - start >= SEGMENT_ACCEPTANCE_LIMITS.milliseconds
    )
      refuse('deadline or clock violation');
    previousTime = time;
    for (const attempt of pending.values())
      if (attempt.kind === 'process' && time - attempt.startedAt >= attempt.descriptor.timeoutMs)
        refuse('subprocess deadline');
    if (phase && time - phase.startedAt >= phase.cost.milliseconds) refuse('phase deadline');
    return time;
  };
  const live = () => {
    if (stopped) fail(stopped);
    return clock();
  };
  const guarded = (action) => {
    live();
    try {
      return action();
    } catch (error) {
      stop(error.message);
      throw error;
    }
  };
  const snapshot = () =>
    Object.freeze({
      startedAt: start,
      stopped,
      phase: phase?.name,
      used: Object.freeze({ ...used }),
      limits: SEGMENT_ACCEPTANCE_LIMITS,
      activeJobs: Object.freeze([...jobs].filter(([, value]) => value.active).map(([key]) => key)),
      seenJobs: Object.freeze([...jobs.keys()]),
      pending: Object.freeze([...pending.keys()]),
      authRequests: 'UNKNOWN',
      wireRequests: 'UNKNOWN',
    });
  const reserve = () =>
    Object.fromEntries(
      dimensions.map((key) => [
        key,
        finalStarted ? 0 : Math.max(minimumReserve[key], finalCost[key]),
      ]),
    );
  const charge = (id, increment, kind, descriptor) => {
    const time = live();
    if (!phase || ids.has(id)) refuse('missing phase or replay');
    if (time - phase.startedAt >= phase.cost.milliseconds) refuse('phase deadline');
    const held = reserve();
    if (time - start + held.milliseconds >= SEGMENT_ACCEPTANCE_LIMITS.milliseconds)
      refuse('final time reserve exhausted');
    for (const key of ['orgProcesses', 'metadataJobs', 'logicalReads']) {
      const next = used[key] + (increment[key] ?? 0);
      if (
        !Number.isSafeInteger(next) ||
        next + held[key] > SEGMENT_ACCEPTANCE_LIMITS[key] ||
        phase.used[key] + (increment[key] ?? 0) > phase.cost[key]
      )
        refuse(`exhausted ${key}`);
    }
    for (const key of ['orgProcesses', 'metadataJobs', 'logicalReads']) {
      used[key] += increment[key] ?? 0;
      phase.used[key] += increment[key] ?? 0;
    }
    ids.add(id);
    pending.set(id, { kind, descriptor, phase: phase.name, startedAt: time });
    return snapshot();
  };
  return Object.freeze({
    beginPhase(name, completeCost, completeFinalCost) {
      return guarded(() => {
        if (
          typeof name !== 'string' ||
          !operationId(name) ||
          phaseNames.has(name) ||
          pending.size > 0 ||
          [...jobs.values()].some((job) => job.active) ||
          finalStarted
        )
          refuse('phase transition refused');
        const requested = cost(completeCost);
        const declaredFinal = cost(completeFinalCost);
        if (declaredFinal.orgProcesses < 2) refuse('final requires launcher and child');
        if (finalCost && !isDeepStrictEqual(finalCost, declaredFinal)) refuse('final cost changed');
        finalCost ??= declaredFinal;
        const isFinal = name === 'final';
        if (isFinal && !isDeepStrictEqual(requested, finalCost)) refuse('incomplete final phase');
        if (name === 'deploy' && (requested.metadataJobs < 4 || requested.orgProcesses < 5))
          refuse('incomplete deploy cost');
        finalStarted = isFinal;
        const held = reserve();
        for (const key of dimensions) {
          const spent = key === 'milliseconds' ? previousTime - start : used[key];
          if (spent + requested[key] + held[key] > SEGMENT_ACCEPTANCE_LIMITS[key])
            refuse(`phase cannot preserve ${key}`);
        }
        if (!requested.milliseconds) refuse('empty phase deadline');
        phaseNames.add(name);
        phase = {
          name,
          cost: requested,
          startedAt: previousTime,
          used: { orgProcesses: 0, metadataJobs: 0, logicalReads: 0 },
        };
        return snapshot();
      });
    },
    registerScratch(root) {
      return guarded(() => {
        absolute(root);
        registeredScratch.add(root);
      });
    },
    dispatchProcess(descriptor) {
      return guarded(() => {
        const admitted = validateSegmentProcess(profile, descriptor, registeredScratch);
        if (
          admitted.operation === 'segment-deploy' &&
          (!phase || phase.cost.metadataJobs < 4 || phase.cost.orgProcesses < 5)
        )
          refuse('incomplete deploy cost');
        const remaining = Math.min(
          SEGMENT_ACCEPTANCE_LIMITS.milliseconds - (previousTime - start) - reserve().milliseconds,
          phase ? phase.cost.milliseconds - (previousTime - phase.startedAt) : 0,
        );
        if (admitted.timeoutMs > remaining) refuse('subprocess exceeds remaining time');
        return charge(admitted.id, { orgProcesses: 1 }, 'process', admitted);
      });
    },
    dispatchRead(request) {
      return guarded(() => {
        const active = new Set(
          [...jobs]
            .filter(([, value]) => value.active && value.phase === phase?.name)
            .map(([key]) => key),
        );
        const admitted = validateSegmentRead(profile, request, active);
        return charge(
          admitted.id,
          { logicalReads: 1, metadataJobs: admitted.body?.operation === 'retrieve' ? 1 : 0 },
          'read',
          admitted,
        );
      });
    },
    registerMetadataJob(resultIdentity) {
      return guarded(() => {
        exactKeys(resultIdentity, ['operationId', 'jobId', 'orgId', 'apiVersion']);
        const { operationId: id, jobId } = resultIdentity;
        const attempt = pending.get(id);
        if (
          attempt?.descriptor.body?.operation !== 'retrieve' ||
          attempt.phase !== phase?.name ||
          jobs.has(jobId) ||
          !/^09S[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u.test(jobId) ||
          resultIdentity.orgId !== profile.orgId ||
          resultIdentity.apiVersion !== '65.0'
        )
          refuse('job registration refused');
        jobs.set(jobId, { active: true, phase: phase.name });
        pending.delete(id);
        return snapshot();
      });
    },
    observeResult(result) {
      return guarded(() => {
        exactKeys(
          result,
          result.completion === undefined ? ['id', 'outcome'] : ['id', 'outcome', 'completion'],
        );
        const attempt = pending.get(result.id);
        if (!attempt || !['success', 'failure', 'uncertain'].includes(result.outcome))
          refuse('unknown result');
        if (result.outcome !== 'success') refuse(result.outcome);
        const body = attempt.descriptor.body;
        if (result.completion !== undefined) {
          const evidence = result.completion;
          exactKeys(evidence, ['jobId', 'includeZip', 'done', 'outcome', 'zipPresent', 'closeJob']);
          if (
            !['checkRetrieveStatus', 'retrieveResult'].includes(body?.operation) ||
            evidence.jobId !== body.jobId ||
            !jobs.get(body.jobId)?.active ||
            evidence.includeZip !== body.includeZip ||
            evidence.outcome !== result.outcome ||
            !['done', 'zipPresent', 'closeJob'].every(
              (key) => typeof evidence[key] === 'boolean',
            ) ||
            evidence.closeJob !== (evidence.done && evidence.includeZip && evidence.zipPresent) ||
            (evidence.zipPresent && (!evidence.done || !evidence.includeZip)) ||
            (evidence.done && evidence.includeZip && !evidence.zipPresent)
          )
            refuse('inconsistent completion evidence');
        } else if (body?.operation === 'retrieveResult') refuse('missing completion evidence');
        pending.delete(result.id);
        if (
          attempt.kind === 'process' &&
          previousTime - attempt.startedAt >= attempt.descriptor.timeoutMs
        )
          refuse('subprocess deadline');
        if (attempt.descriptor.body?.operation === 'retrieve')
          refuse('retrieve requires job registration');
        if (result.completion?.closeJob) jobs.get(attempt.descriptor.body.jobId).active = false;
        return snapshot();
      });
    },
    stop(reason) {
      stop(reason);
      return snapshot();
    },
    audit() {
      if (!stopped) {
        try {
          clock();
        } catch {
          /* Audit retains stop evidence. */
        }
      }
      return snapshot();
    },
  });
}
