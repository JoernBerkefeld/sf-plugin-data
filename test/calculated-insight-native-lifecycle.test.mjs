import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Deploy from '../lib/commands/data360/deploy.js';
import {
  calculatedInsightInputBody,
  calculatedInsightMatches,
  calculatedInsightReference,
  observeNativeCalculatedInsight,
  parseNativeCalculatedInsight,
  serializeNativeCalculatedInsight,
} from '../lib/artifacts/native-calculated-insight-document.js';
import { documentDependencyNode } from '../lib/artifacts/dependency-selection.js';
import { writeNativeCalculatedInsightDocument } from '../lib/artifacts/write-native-calculated-insight.js';
import {
  captureDeployInputDigest,
  readDeployInputs,
  verifyCalculatedInsightInputDigest,
} from '../lib/artifacts/read-deploy-input.js';
import { createCalculatedInsightClient } from '../lib/transport/calculated-insight-rest.js';
import { ConnectError } from '../lib/transport/connect-client.js';
import { connectDiagnostic, retainConnectDiagnostic } from '../lib/transport/connect-diagnostic.js';
import { preflightCalculatedInsightDeploy } from '../lib/services/preflight-calculated-insight-deploy.js';
import { executeCalculatedInsightDeploy } from '../lib/services/execute-calculated-insight-deploy.js';
import { publishCalculatedInsight } from '../lib/services/publish-calculated-insight.js';
import { deleteCalculatedInsight } from '../lib/services/delete-calculated-insight.js';

// eslint-disable-next-line unicorn/no-null -- The API 68 GET reports unset fields as null.
const nil = null;
const apiName = 'SyntheticNative__cio';
const table = 'ssot__DeviceApplicationEngagement__dlm';
const sql = `SELECT COUNT(${table}.ssot__DeviceId__c) AS device_count__c, ${table}.ssot__SoftwareApplicationId__c AS app_id__c FROM ${table} WHERE ${table}.ssot__EngagementChannelActionId__c = 'APP_OPEN' GROUP BY app_id__c`;
const version = { requested: '68.0', restSelector: 'v68.0', soapNumeric: '68.0' };
const origin = 'https://synthetic.my.salesforce.com';

/**
 * One API 68 GET body with server fields; the expression is HTML-escaped as Salesforce returns it.
 * @param {object} overrides Changed keys.
 * @returns {object} Raw GET body.
 */
const raw = (overrides = {}) => ({
  apiName,
  calculatedInsightStatus: 'ACTIVE',
  creationType: 'Custom',
  dataSpace: 'default',
  definitionStatus: 'IN_USE',
  definitionType: 'CALCULATED_METRIC',
  description: nil,
  dimensions: [{ apiName: 'app_id__c' }],
  displayName: 'Synthetic native',
  expression: sql.replaceAll("'", '&#39;'),
  historyPublishScheduleInterval: nil,
  historyPublishScheduleTimeZone: nil,
  historyPublishTime: nil,
  isEnabled: true,
  isFromPackage: false,
  lastRunDateTime: '2026-11-01T00:00:00.000Z',
  lastRunStatus: 'SUCCESS',
  measures: [{ apiName: 'device_count__c' }],
  publishScheduleEndDate: nil,
  publishScheduleInterval: 'SYSTEM_MANAGED',
  publishScheduleStartDateTime: nil,
  publishScheduleTimeZone: nil,
  queryDialect: 'ANSI_SQL',
  sourceCiDevName: nil,
  sourceCiId: nil,
  sourceCiName: nil,
  subType: nil,
  ...overrides,
});
/**
 * The retrieved file form of {@link raw}.
 * @param {object} overrides Changed keys.
 * @returns {object} File document.
 */
const file = (overrides = {}) => ({ ...observeNativeCalculatedInsight(raw()), ...overrides });
const notFound = () => new ConnectError('REQUEST_FAILED', 404, 'ITEM_NOT_FOUND');

/**
 * A synthetic org holding at most this one insight. A write stores the sent document over the
 * server fields; `--draft` makes it DRAFT, otherwise ACTIVE.
 * @param {object | undefined} initial Raw GET body, or undefined for absent.
 * @returns {object} Read context, client and call journal.
 */
const org = (initial) => {
  let state = initial;
  const calls = [];
  const store = (document, status) => {
    state = {
      ...raw(),
      ...state,
      ...document,
      expression: document.expression.replaceAll("'", '&#39;'),
      calculatedInsightStatus: status,
    };
  };
  return {
    calls,
    state: () => state,
    set: (value) => {
      state = value;
    },
    context: {
      dataSpace: 'default',
      check() {},
      async get(name) {
        calls.push(`GET ${name}`);
        if (!state) throw notFound();
        return structuredClone(state);
      },
    },
    client: {
      async create(document, options) {
        calls.push({ create: document, options });
        store(document, options?.draft ? 'DRAFT' : 'ACTIVE');
      },
      async update(document, options) {
        calls.push({ update: document, options });
        store(
          document,
          options?.draft === true ? 'DRAFT' : options?.draft === false ? 'ACTIVE' : 'ACTIVE',
        );
      },
      async delete(name) {
        calls.push({ delete: name });
        state = undefined;
      },
    },
  };
};
const connection = { instanceUrl: origin, getApiVersion: () => '68.0' };
const fast = { delay: async () => {} };
const deploy = (target, document, options = {}) =>
  executeCalculatedInsightDeploy(document, connection, version, 'default', {
    context: target.context,
    nativeClient: target.client,
    verifyInput: async () => {},
    ...fast,
    ...options,
  });
const writes = (target) => target.calls.filter((call) => typeof call !== 'string');

test('the request body keeps every authored key and translates only the input names', () => {
  const document = file({ publishScheduleInterval: 'TWENTY_FOUR', futureKey: 'kept as authored' });
  assert.deepEqual(calculatedInsightInputBody(document, 'create'), {
    apiName,
    createdFromPackage: false,
    dataSpaceName: 'default',
    definitionType: 'CalculatedMetric',
    displayName: 'Synthetic native',
    expression: sql,
    futureKey: 'kept as authored',
    publishScheduleInterval: 'TwentyFour',
    queryDialect: 'AnsiSql',
  });
  const update = calculatedInsightInputBody(document, 'update');
  assert.equal(update.apiName, undefined);
  assert.equal(update.dataSpaceName, 'default');
  // Salesforce refuses any definitionType on PATCH: an unchanged one is left out, a changed
  // one is sent so Salesforce answers.
  assert.equal(calculatedInsightInputBody(document, 'update', file()).definitionType, undefined);
  assert.equal(
    calculatedInsightInputBody(file({ definitionType: 'STREAMING_METRIC' }), 'update', file())
      .definitionType,
    'StreamingMetric',
  );
  assert.equal(
    calculatedInsightInputBody(document, 'create', file()).definitionType,
    'CalculatedMetric',
  );
  // Only the enum keys are translated, and only UPPER_SNAKE values.
  assert.equal(
    calculatedInsightInputBody(file({ displayName: 'NOT_AN_ENUM' }), 'create').displayName,
    'NOT_AN_ENUM',
  );
  assert.equal(
    calculatedInsightInputBody(file({ queryDialect: 'DcSql' }), 'create').queryDialect,
    'DcSql',
  );
  assert.equal(
    calculatedInsightInputBody(file({ sourceCiDevName: 'Source__cio' }), 'create')
      .sourceDeveloperName,
    'Source__cio',
  );
});

test('the API 68 client sends the translated body on the exact routes, single attempt', async () => {
  const requests = [];
  const target = {
    instanceUrl: origin,
    _refreshDelegate: {},
    async request(request, options) {
      assert.equal(this._refreshDelegate, undefined);
      assert.equal(options.retry.maxRetries, 0);
      requests.push({ ...request, body: request.body && JSON.parse(request.body) });
      return {};
    },
  };
  const client = createCalculatedInsightClient(target, '68.0', 'default');
  await client.get(apiName);
  await client.create(file());
  await client.create(file(), { draft: true });
  await client.update(file());
  await client.update(file(), { draft: true });
  await client.update(file(), { draft: false });
  await client.update(file(), { observed: file() });
  await client.delete(apiName);
  const endpoint = `${origin}/services/data/v68.0/ssot/calculated-insights`;
  const create = calculatedInsightInputBody(file(), 'create');
  const update = calculatedInsightInputBody(file(), 'update');
  assert.deepEqual(
    requests.map(({ method, url, body }) => [method, url, body]),
    [
      ['GET', `${endpoint}/${apiName}`, undefined],
      ['POST', endpoint, create],
      ['POST', endpoint, { ...create, draft: true }],
      ['PATCH', `${endpoint}/${apiName}`, update],
      ['PATCH', `${endpoint}/${apiName}`, { ...update, draft: true }],
      ['PATCH', `${endpoint}/${apiName}`, { ...update, draft: false }],
      [
        'PATCH',
        `${endpoint}/${apiName}`,
        Object.fromEntries(Object.entries(update).filter(([key]) => key !== 'definitionType')),
      ],
      ['DELETE', `${endpoint}/${apiName}`, undefined],
    ],
  );
  for (const pin of ['64.0', '65.0', '66.0', '67.0', '69.0'])
    assert.throws(() => createCalculatedInsightClient(target, pin, 'default'), {
      code: 'INVALID_CI_SCOPE',
    });
  assert.throws(() => createCalculatedInsightClient(target, '68.0', 'other'), {
    code: 'INVALID_CI_SCOPE',
  });
});

test('a retrieved file matches its org insight; a shorter file too; a changed key does not', () => {
  const observed = observeNativeCalculatedInsight(raw());
  assert.equal(observed.expression, sql);
  assert.equal(calculatedInsightMatches(file(), observed), true);
  assert.equal(
    calculatedInsightMatches(
      { apiName, dataSpace: 'default', displayName: 'Synthetic native', expression: sql },
      observed,
    ),
    true,
  );
  assert.equal(calculatedInsightMatches(file({ expression: `${sql} ` }), observed), false);
  // The final line break of the .sql file (LF or CRLF) is not part of the compared expression.
  for (const text of [`${sql}\n`, `${sql}\r\n`]) {
    const { json } = serializeNativeCalculatedInsight(file());
    assert.equal(
      calculatedInsightMatches(
        parseNativeCalculatedInsight(json, [{ extension: 'sql', text }]),
        observed,
      ),
      true,
    );
  }
  assert.equal(calculatedInsightMatches(file({ description: 'new' }), observed), false);
});

test('the planning view lists the DMOs and other insights the SQL names, for ordering', () => {
  const reference = calculatedInsightReference(
    file({
      expression: `SELECT Other__cio.a__c, ${apiName}.b__c FROM ${table} JOIN Zeta__dlm ON 1 = 1 JOIN ${table} ON 1 = 1`,
    }),
  );
  assert.deepEqual(reference, {
    kind: 'calculated-insight',
    identity: { dataSpace: 'default', apiName },
    spec: {
      dependencies: [
        { kind: 'calculated-insight', dataSpace: 'default', apiName: 'Other__cio' },
        { kind: 'dmo', dataSpace: 'default', apiName: 'Zeta__dlm' },
        { kind: 'dmo', dataSpace: 'default', apiName: table },
      ],
    },
  });
  assert.deepEqual(documentDependencyNode(reference).dependencies, reference.spec.dependencies);
});

test('preview: absent is create, the same insight unchanged, another SQL update', async () => {
  const absent = await preflightCalculatedInsightDeploy(file(), connection, version, 'default', {
    context: org().context,
  });
  assert.equal(absent.outcome, 'create');
  assert.equal(absent.route.method, 'POST');
  assert.equal(absent.absenceProof, 'native-item-not-found');
  assert.equal('requiredEffects' in absent, false);
  const same = await preflightCalculatedInsightDeploy(file(), connection, version, 'default', {
    context: org(raw()).context,
  });
  assert.equal(same.outcome, 'unchanged');
  const changed = await preflightCalculatedInsightDeploy(
    file({ expression: 'SELECT 1 AS one__c FROM Other__dlm' }),
    connection,
    version,
    'default',
    { context: org(raw()).context },
  );
  assert.equal(changed.outcome, 'update');
  assert.equal(changed.route.method, 'PATCH');
});

test('preview blocks only a data space mismatch, a foreign answer or a failed read', async () => {
  const space = await preflightCalculatedInsightDeploy(
    file({ dataSpace: 'other' }),
    connection,
    version,
    'default',
    { context: org(raw()).context },
  );
  assert.equal(space.outcome, 'blocked');
  assert.equal(space.diagnostics[0].code, 'CI_ADMISSION_FAILED');
  const foreign = await preflightCalculatedInsightDeploy(file(), connection, version, 'default', {
    context: org(raw({ apiName: 'Foreign__cio' })).context,
  });
  assert.equal(foreign.diagnostics[0].code, 'CI_IDENTITY_CHANGED');
  const target = org(raw());
  target.context.get = async () => {
    throw retainConnectDiagnostic(new Error('private-secret'), connectDiagnostic(429));
  };
  const limited = await preflightCalculatedInsightDeploy(file(), connection, version, 'default', {
    context: target.context,
  });
  assert.equal(limited.diagnostics[0].code, 'CI_RUNTIME_UNKNOWN');
  assert.match(limited.diagnostics[0].message, /429 Too Many Requests/u);
  assert.doesNotMatch(JSON.stringify(limited), /private-secret/u);
});

for (const variant of ['scheduled with run history', 'packaged', 'any SQL'])
  test(`the plugin does not refuse a ${variant} insight`, async () => {
    const overrides =
      variant === 'packaged'
        ? { isFromPackage: true }
        : variant === 'any SQL'
          ? { expression: 'SELECT 1 AS one__c FROM Other__dlm' }
          : {
              publishScheduleInterval: 'TWENTY_FOUR',
              publishScheduleStartDateTime: '2026-11-15T01:00',
            };
    const target = org(raw({ lastRunStatus: 'FAILURE' }));
    const result = await deploy(target, file(overrides));
    assert.equal(result.outcome, 'updated', JSON.stringify(result.diagnostics));
    assert.equal(writes(target).length, 1);
  });

for (const draft of [false, true])
  test(`create ${draft ? 'with' : 'without'} --draft sends one POST and reads until it holds the file`, async () => {
    const target = org();
    const result = await deploy(target, file(), draft ? { draft: true } : {});
    assert.equal(result.outcome, 'created');
    assert.equal(result.mutation, 'confirmed-created');
    assert.equal(result.route.method, 'POST');
    assert.deepEqual(writes(target), [
      { create: file(), options: draft ? { draft: true } : undefined },
    ]);
    assert.equal(target.state().calculatedInsightStatus, draft ? 'DRAFT' : 'ACTIVE');
  });

test('a retrieved file deploys back unchanged without a write', async () => {
  const target = org(raw({ calculatedInsightStatus: 'DRAFT' }));
  const result = await deploy(target, file());
  assert.equal(result.outcome, 'unchanged');
  assert.deepEqual(writes(target), []);
});

for (const status of ['ACTIVE', 'DRAFT'])
  test(`a SQL-only change of an ${status} insight is one PATCH; a DRAFT stays a draft`, async () => {
    const target = org(raw({ calculatedInsightStatus: status }));
    const expression = sql.replace("'APP_OPEN'", "'APP_CLOSE'");
    const result = await deploy(target, file({ expression }));
    assert.equal(result.outcome, 'updated');
    assert.deepEqual(writes(target), [
      {
        update: file({ expression }),
        // Salesforce activates a DRAFT on a PATCH without draft: deploy sends draft true.
        options: { ...(status === 'DRAFT' ? { draft: true } : {}), observed: file() },
      },
    ]);
    assert.equal(target.state().calculatedInsightStatus, status);
    const repeat = await deploy(target, file({ expression }));
    assert.equal(repeat.outcome, 'unchanged');
  });

test('an update leaves out an unchanged definitionType; a changed one reaches Salesforce', async () => {
  const sent = [];
  const strict = org(raw());
  strict.client.update = async (document, options) => {
    const body = calculatedInsightInputBody(document, 'update', options?.observed);
    sent.push(body);
    // As live API 68: any definitionType on PATCH is refused.
    if ('definitionType' in body) throw new ConnectError('REQUEST_FAILED', 400);
    strict.set(raw({ ...document, expression: document.expression }));
  };
  const updated = await deploy(strict, file({ displayName: 'Renamed' }));
  assert.equal(updated.outcome, 'updated', JSON.stringify(updated.diagnostics));
  assert.equal('definitionType' in sent[0], false);
  const changed = await deploy(strict, file({ definitionType: 'STREAMING_METRIC' }));
  assert.equal(changed.mutation, 'rejected');
  assert.equal(sent[1].definitionType, 'StreamingMetric');
});

test('--draft on an update sends draft true', async () => {
  const target = org(raw());
  await deploy(target, file({ displayName: 'Renamed' }), { draft: true });
  assert.equal(writes(target)[0].options.draft, true);
});

test('a 4xx write answer is rejected and is not read again', async () => {
  const target = org();
  target.client.create = async () => {
    target.calls.push({ create: 'rejected' });
    throw new ConnectError('REQUEST_FAILED', 400);
  };
  const result = await deploy(target, file());
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mutation, 'rejected');
  assert.equal(result.diagnostics[0].code, 'REQUEST_FAILED');
  assert.equal(target.calls.filter((call) => typeof call === 'string').length, 1);
});

test('another write failure is unknown and never replayed', async () => {
  const target = org();
  target.client.create = async () => {
    target.calls.push({ create: 'lost' });
    throw retainConnectDiagnostic(new Error('private response'), connectDiagnostic(503));
  };
  const result = await deploy(target, file());
  assert.equal(result.mutation, 'unknown');
  assert.equal(result.diagnostics[0].code, 'CI_MUTATION_UNCONFIRMED');
  assert.equal(writes(target).length, 1);
  assert.doesNotMatch(JSON.stringify(result), /private response/u);
});

test('PROCESSING is waited for; an insight that never holds the file is a settlement mismatch', async () => {
  const processing = org(raw());
  let reads = 0;
  const get = processing.context.get;
  processing.context.get = async (name) => {
    const value = await get(name);
    return writes(processing).length > 0 && ++reads < 3
      ? { ...value, calculatedInsightStatus: 'PROCESSING' }
      : value;
  };
  const settled = await deploy(processing, file({ displayName: 'Renamed' }));
  assert.equal(settled.outcome, 'updated');
  assert.equal(reads, 3);
  const normalizing = org(raw());
  normalizing.client.update = async (document) => {
    normalizing.calls.push({ update: document });
    normalizing.set(raw({ displayName: `${document.displayName} (normalized)` }));
  };
  const mismatch = await deploy(normalizing, file({ displayName: 'Renamed' }));
  assert.equal(mismatch.mutation, 'unknown');
  assert.equal(mismatch.diagnostics[0].code, 'CI_SETTLEMENT_MISMATCH');
  assert.equal(normalizing.calls.filter((call) => typeof call === 'string').length, 13);
});

test('changed input files stop the deploy before the write', async () => {
  const target = org();
  let checks = 0;
  const result = await deploy(target, file(), {
    verifyInput: async () => {
      if (++checks === 2) throw new Error('changed');
    },
  });
  assert.equal(result.outcome, 'blocked');
  assert.deepEqual(writes(target), []);
});

const options = (target, extra = {}) => ({
  context: target.context,
  nativeClient: target.client,
  confirmDelete: true,
  verifyInput: async () => {},
  ...fast,
  ...extra,
});

test('publish sends the file with draft false; an equal ACTIVE insight is unchanged', async () => {
  const draft = org(raw({ calculatedInsightStatus: 'DRAFT' }));
  const preview = await publishCalculatedInsight(
    file(),
    connection,
    version,
    'default',
    options(draft, { preview: true }),
  );
  assert.equal(preview.outcome, 'publish');
  const published = await publishCalculatedInsight(
    file(),
    connection,
    version,
    'default',
    options(draft),
  );
  assert.equal(published.outcome, 'published');
  assert.deepEqual(writes(draft), [
    { update: file(), options: { draft: false, observed: file() } },
  ]);
  const again = await publishCalculatedInsight(
    file(),
    connection,
    version,
    'default',
    options(draft),
  );
  assert.equal(again.outcome, 'unchanged');
  assert.equal(writes(draft).length, 1);
  const absent = await publishCalculatedInsight(
    file(),
    connection,
    version,
    'default',
    options(org()),
  );
  assert.equal(absent.diagnostics[0].code, 'CI_NOT_FOUND');
});

test('delete sends one DELETE in any state, waits through DELETING and needs 404', async () => {
  const identity = { apiName, dataSpace: 'default' };
  const target = org(raw({ publishScheduleInterval: 'TWENTY_FOUR' }));
  let reads = 0;
  const get = target.context.get;
  target.context.get = async (name) => {
    if (writes(target).length > 0 && ++reads === 1)
      return raw({ calculatedInsightStatus: 'DELETING' });
    return get(name);
  };
  const deleted = await deleteCalculatedInsight(
    identity,
    connection,
    version,
    'default',
    options(target),
  );
  assert.equal(deleted.outcome, 'deleted');
  assert.deepEqual(writes(target), [{ delete: apiName }]);
  const repeat = await deleteCalculatedInsight(
    identity,
    connection,
    version,
    'default',
    options(target),
  );
  assert.equal(repeat.outcome, 'unchanged');
  const unconfirmed = org(raw());
  const blocked = await deleteCalculatedInsight(
    identity,
    connection,
    version,
    'default',
    options(unconfirmed, { confirmDelete: false }),
  );
  assert.equal(blocked.diagnostics[0].code, 'DESTRUCTIVE_CONFIRMATION_REQUIRED');
  const foreign = await deleteCalculatedInsight(
    identity,
    connection,
    version,
    'default',
    options(org(raw({ apiName: 'Foreign__cio' }))),
  );
  assert.equal(foreign.diagnostics[0].code, 'CI_IDENTITY_CHANGED');
});

/**
 * Deploy command on real files and the real services against a synthetic org.
 * @param {object} target Synthetic org.
 * @param {object} flags Extra flags.
 * @param {object[]} documents File documents to write.
 * @returns {Promise<object>} Command, flags and receipts.
 */
const command = async (target, flags = {}, documents = [file()]) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'data360-ci-native-deploy-'));
  await writeFile(path.join(cwd, '.owner'), randomUUID());
  const receipts = [];
  for (const document of documents)
    receipts.push(await writeNativeCalculatedInsightDocument(document, cwd, false));
  const instance = Object.create(Deploy.prototype);
  const all = {
    preview: false,
    'source-dir': receipts.map((receipt) => receipt.path),
    'api-version': 'auto',
    dataspace: 'default',
    ...flags,
  };
  const receiver = { instanceUrl: origin, getApiVersion: () => '68.0' };
  all['target-org'] = {
    getOrgId: () => 'synthetic',
    getUsername: () => 'synthetic@example.invalid',
    getConnection: () => receiver,
  };
  instance.parse = async () => ({ flags: all });
  instance.jsonEnabled = () => true;
  instance.captureInput = captureDeployInputDigest;
  instance.verifyCalculatedInsightInput = verifyCalculatedInsightInputDigest;
  instance.resolveInputs = async () =>
    readDeployInputs({ cwd, sourceDir: receipts.map((receipt) => receipt.path) });
  instance.calculatedInsightContext = () => target.context;
  instance.preflightCalculatedInsight = preflightCalculatedInsightDeploy;
  instance.executeCalculatedInsight = (document, connection_, selection, space, options) =>
    executeCalculatedInsightDeploy(document, connection_, selection, space, {
      ...options,
      ...fast,
      nativeClient: target.client,
    });
  return { instance, flags: all, receipts };
};
const execute = async (instance) => {
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    return await instance.run();
  } finally {
    process.exitCode = previous;
  }
};

test('deploy creates without --allow-processing; preview is read-only; repeat is unchanged', async () => {
  const target = org();
  const preview = await command(target, { preview: true });
  const planned = await execute(preview.instance);
  assert.equal(planned.status, 'success', JSON.stringify(planned));
  assert.equal(planned.result.items[0].outcome, 'create');
  assert.deepEqual(writes(target), []);
  const { instance } = await command(target);
  const created = await execute(instance);
  assert.equal(created.status, 'success', JSON.stringify(created.diagnostics));
  assert.equal(created.result.items[0].outcome, 'created');
  assert.doesNotMatch(JSON.stringify(created), /PROCESSING_ACKNOWLEDGEMENT_REQUIRED|65\.0/u);
  assert.deepEqual(
    created.result.items[0].routes.map((route) => [route.operation, route.apiVersion]),
    [
      ['calculated-insight.deploy', '68.0'],
      ['calculated-insight.get', '68.0'],
    ],
  );
  const again = await command(target);
  const repeat = await execute(again.instance);
  assert.equal(repeat.result.items[0].outcome, 'unchanged');
  assert.equal(writes(target).length, 1);
});

test('deploy of a retrieved file is unchanged; a SQL file edit is one PATCH', async () => {
  const target = org(raw());
  const first = await command(target);
  const unchanged = await execute(first.instance);
  assert.equal(unchanged.result.items[0].outcome, 'unchanged');
  const edited = await command(target);
  await writeFile(edited.receipts[0].companionPath, sql.replace("'APP_OPEN'", "'APP_CLOSE'"));
  const updated = await execute(edited.instance);
  assert.equal(updated.result.items[0].outcome, 'updated', JSON.stringify(updated.diagnostics));
  assert.equal(writes(target)[0].update.expression, sql.replace("'APP_OPEN'", "'APP_CLOSE'"));
});

test('an unknown CI write stops the next selected insight', async () => {
  const target = org();
  target.client.create = async () => {
    target.calls.push({ create: 'lost' });
    throw new Error('lost');
  };
  const { instance } = await command(target, {}, [
    file({ apiName: 'First__cio', displayName: 'First' }),
    file({ apiName: 'Second__cio', displayName: 'Second' }),
  ]);
  const result = await execute(instance);
  assert.equal(result.status, 'failed');
  assert.equal(writes(target).length, 1);
  assert.equal(result.result.items[1].mutation, 'not-attempted');
});

test('deploy help: CI needs no --allow-processing and names the translation', () => {
  assert.match(Deploy.description, /dataSpace as dataSpaceName/u);
  assert.match(
    Deploy.description,
    /Publication is never implicit \(sf data360 publish\)\. --allow-processing is not needed\./u,
  );
  assert.doesNotMatch(Deploy.description, /CI create\/update requires --allow-processing|API65/u);
  assert.match(Deploy.flags['allow-processing'].summary, /calculated insights do not need it/u);
});
