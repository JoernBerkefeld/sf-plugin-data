import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectCalculatedInsight,
  observeCalculatedInsight,
  validateCalculatedInsightDocument,
  serializeCalculatedInsightDocument,
  buildCalculatedInsightUpdateDelta,
} from '../lib/artifacts/calculated-insight-document.js';

// eslint-disable-next-line unicorn/no-null -- Synthetic API65 fixtures preserve explicit wire null values.
const wireNull = null;
const table = 'ssot__DeviceApplicationEngagement__dlm';
const device = `${table}.ssot__DeviceId__c`;
const application = `${table}.ssot__SoftwareApplicationId__c`;
const original = `SELECT APPROX_COUNT_DISTINCT(${device}) AS device_count__c, ${application} AS app_id__c FROM ${table} WHERE 1 = 0 GROUP BY ${application}`;
const edited = original.replace('WHERE 1 = 0', `WHERE 1 = 0 AND ${device} IS NOT NULL`);
const runtime = (expression = original) => ({
  apiName: 'SyntheticInsight__cio',
  dataSpace: 'default',
  calculatedInsightStatus: 'ACTIVE',
  creationType: 'Custom',
  definitionStatus: 'IN_USE',
  definitionType: 'CALCULATED_METRIC',
  description: wireNull,
  displayName: 'Synthetic insight',
  expression,
  isEnabled: true,
  dimensions: [
    {
      apiName: 'app_id__c',
      creationType: 'Custom',
      dataSource: wireNull,
      dataType: 'Text',
      dateGranularity: wireNull,
      displayName: 'app_id',
      fieldRole: 'DIMENSION',
      formula: application,
    },
  ],
  measures: [
    {
      apiName: 'device_count__c',
      creationType: 'Custom',
      dataSource: wireNull,
      dataType: 'Number',
      displayName: 'device_count',
      fieldAggregationType: 'NONAGGREGATABLE',
      fieldRole: 'MEASURE',
      formula: `APPROX_COUNT_DISTINCT(${device})`,
    },
  ],
  publishScheduleEndDate: wireNull,
  publishScheduleInterval: 'SYSTEM_MANAGED',
  publishScheduleStartDateTime: wireNull,
  subType: wireNull,
  lastCalcInsightStatusDateTime: '2026-10-28T10:00:00.000Z',
  lastCalcInsightStatusErrorCode: wireNull,
  lastRunDateTime: wireNull,
  lastRunStatus: wireNull,
  lastRunStatusDateTime: wireNull,
  lastRunStatusErrorCode: wireNull,
});
const metadata = (expression = original) => ({
  fullName: 'SyntheticInsight',
  creationType: 'Custom',
  expression,
  masterLabel: 'Synthetic insight',
});
const document = (expression = original) =>
  projectCalculatedInsight(runtime(expression), metadata(expression)).document;
const delta = (desired = document(), raw = runtime(), definition = metadata(), space = 'default') =>
  buildCalculatedInsightUpdateDelta(desired, raw, definition, space);

test('complete fixed projection is detached and stable with explicit attribution observations', () => {
  const raw = runtime();
  const result = projectCalculatedInsight(raw, metadata());
  raw.dimensions[0].formula = 'changed';
  assert.equal(result.document.spec.dimensions[0].formula, application);
  assert.deepEqual(result.observations.derivedAttribution, {
    dimensions: [wireNull],
    measures: [wireNull],
  });
  assert.equal(
    serializeCalculatedInsightDocument(result.document),
    serializeCalculatedInsightDocument(document()),
  );
  assert.doesNotMatch(
    serializeCalculatedInsightDocument(result.document),
    /dataSource|lastRun|lastCalcInsight|ACTIVE/u,
  );
  assert.deepEqual(result.document.spec.dependencies, [
    {
      kind: 'dmo',
      dataSpace: 'default',
      apiName: table,
      fields: ['ssot__DeviceId__c', 'ssot__SoftwareApplicationId__c'],
    },
  ]);
});

for (const schedule of ['SYSTEM_MANAGED', 'NOT_SCHEDULED']) {
  test(`exact ${schedule} profile projects, serializes and preserves detached forward delta`, () => {
    const raw = { ...runtime(), publishScheduleInterval: schedule };
    const current = projectCalculatedInsight(raw, metadata()).document;
    const desired = structuredClone(current);
    desired.spec.expression = edited;
    const result = delta(desired, raw);
    assert.equal(result.status, 'candidate');
    assert.deepEqual(result.patch, { expression: edited });
    assert.equal(result.expected.spec.publishScheduleInterval, schedule);
    assert.deepEqual(JSON.parse(serializeCalculatedInsightDocument(current)), current);
    const detached = validateCalculatedInsightDocument(current);
    raw.publishScheduleInterval = 'changed';
    current.spec.publishScheduleInterval = 'changed';
    desired.spec.publishScheduleInterval = 'changed';
    assert.equal(detached.spec.publishScheduleInterval, schedule);
    assert.equal(result.expected.spec.publishScheduleInterval, schedule);
    assert.equal(
      delta(detached, { ...runtime(), publishScheduleInterval: schedule }).status,
      'unchanged',
    );
    assert.equal(
      delta(detached, { ...runtime(edited), publishScheduleInterval: schedule }, metadata(edited))
        .status,
      'blocked',
    );
  });
  for (const expression of [original, edited])
    test(`${schedule} schedule change with ${expression === original ? 'unchanged' : 'forward'} SQL is blocked`, () => {
      const desired = document(expression);
      desired.spec.publishScheduleInterval = schedule;
      const raw = {
        ...runtime(),
        publishScheduleInterval: schedule === 'SYSTEM_MANAGED' ? 'NOT_SCHEDULED' : 'SYSTEM_MANAGED',
      };
      assert.deepEqual(delta(desired, raw), {
        status: 'blocked',
        blockers: ['CI_NON_EXPRESSION_CHANGE'],
      });
    });
}
for (const schedule of [undefined, wireNull, 'SystemManaged', 'not_scheduled', 'UNKNOWN'])
  test(`schedule has no fallback: ${String(schedule)}`, () => {
    const desired = document();
    desired.spec.publishScheduleInterval = schedule;
    assert.throws(() => validateCalculatedInsightDocument(desired));
    assert.equal(
      delta(document(), { ...runtime(), publishScheduleInterval: schedule }).status,
      'blocked',
    );
    delete desired.spec.publishScheduleInterval;
    assert.throws(() => validateCalculatedInsightDocument(desired));
  });

test('identical settled baseline and edited definition produce pure zero-dispatch unchanged', () => {
  for (const expression of [original, edited]) {
    // No connection or writer is accepted by this API: this is synthetic offline proof only.
    const result = delta(document(expression), runtime(expression), metadata(expression));
    assert.equal(result.status, 'unchanged');
    assert.equal(Object.hasOwn(result, 'patch'), false);
    assert.deepEqual(result.expected, document(expression));
  }
});

test('only qualified forward predicate addition produces exact expression-only candidate', () => {
  const desired = document(edited);
  const result = delta(desired);
  assert.equal(result.status, 'candidate');
  assert.deepEqual(result.patch, { expression: edited });
  assert.deepEqual(result.expected, desired);
  desired.spec.expression = 'changed';
  assert.equal(result.expected.spec.expression, edited);
  assert.equal(delta(document(), runtime(edited), metadata(edited)).status, 'blocked');
});

for (const field of ['ssot__DeviceId__c', 'ssot__SoftwareApplicationId__c']) {
  test(`derived ${field} attribution stays visible but cannot redefine dependencies`, () => {
    const raw = runtime();
    for (const role of ['dimensions', 'measures'])
      raw[role][0].dataSource = { sourceApiName: field, type: 'STREAMING_DATA_MODEL' };
    const result = delta(document(), raw);
    assert.equal(result.status, 'unchanged');
    assert.deepEqual(
      result.observations.derivedAttribution.dimensions[0],
      raw.dimensions[0].dataSource,
    );
    assert.deepEqual(
      result.observations.derivedAttribution.measures[0],
      raw.measures[0].dataSource,
    );
    assert.deepEqual(result.expected.spec.dependencies, document().spec.dependencies);
    assert.equal(delta(document(edited), raw).status, 'candidate');
  });
}

for (const [label, mutate] of Object.entries({
  count: (d) => {
    d.spec.expression = edited.replace('APPROX_COUNT_DISTINCT', 'COUNT');
  },
  alias: (d) => {
    d.spec.expression = edited.replace('device_count__c', 'other_count__c');
  },
  formatting: (d) => {
    d.spec.expression = `${original}\n`;
  },
  predicate: (d) => {
    d.spec.expression = edited.replace(`${device} IS NOT NULL`, `${application} IS NOT NULL`);
  },
  unknown: (d) => {
    d.spec.extra = true;
  },
  nestedUnknown: (d) => {
    d.spec.dimensions[0].extra = true;
  },
  schemaAddition: (d) => {
    d.spec.measures.push(structuredClone(d.spec.measures[0]));
  },
  schemaDeletion: (d) => {
    d.spec.dimensions = [];
  },
  aggregation: (d) => {
    d.spec.measures[0].fieldAggregationType = 'SUM';
  },
  formula: (d) => {
    d.spec.measures[0].formula = `COUNT(${device})`;
  },
  dependency: (d) => {
    d.spec.dependencies[0].fields.reverse();
  },
  schedule: (d) => {
    d.spec.publishScheduleInterval = 'UNKNOWN';
  },
  enabled: (d) => {
    d.spec.isEnabled = false;
  },
  description: (d) => {
    d.spec.description = 'changed';
  },
  subtype: (d) => {
    d.spec.subType = 'changed';
  },
  space: (d) => {
    d.identity.dataSpace = 'other';
  },
})) {
  test(`authored admission rejects ${label} without exposing content`, () => {
    const desired = document();
    mutate(desired);
    assert.throws(() => validateCalculatedInsightDocument(desired));
    const result = delta(desired);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(Object.keys(result), ['status', 'blockers']);
    assert.doesNotMatch(JSON.stringify(result), /SELECT|Synthetic insight/u);
  });
}

for (const [label, mutate] of Object.entries({
  draft: (r) => {
    r.calculatedInsightStatus = 'DRAFT';
  },
  processing: (r) => {
    r.calculatedInsightStatus = 'PROCESSING';
  },
  failed: (r) => {
    r.calculatedInsightStatus = 'ERROR';
  },
  unknownStatus: (r) => {
    r.calculatedInsightStatus = 'other';
  },
  incomplete: (r) => {
    r.dimensions = [];
  },
  unknownRoot: (r) => {
    r.queryDialect = 'ANSI_SQL';
  },
  unknownSchema: (r) => {
    r.measures[0].extra = true;
  },
  missingAttribution: (r) => {
    delete r.dimensions[0].dataSource;
  },
  unknownAttribution: (r) => {
    r.measures[0].dataSource = { sourceApiName: 'Other__c', type: 'STREAMING_DATA_MODEL' };
  },
  extraAttribution: (r) => {
    r.measures[0].dataSource = {
      sourceApiName: 'ssot__DeviceId__c',
      type: 'STREAMING_DATA_MODEL',
      id: 'private',
    };
  },
  runtimeError: (r) => {
    r.lastCalcInsightStatusErrorCode = 'ERROR';
  },
  runError: (r) => {
    r.lastRunStatusErrorCode = 'ERROR';
  },
  hasRun: (r) => {
    r.lastRunStatus = 'SUCCESS';
  },
  timestamp: (r) => {
    r.lastCalcInsightStatusDateTime = 'not-a-date';
  },
  identity: (r) => {
    r.apiName = 'Other__cio';
  },
  label: (r) => {
    r.displayName = 'Other label';
  },
  scheduleBounds: (r) => {
    r.publishScheduleEndDate = '2026-12-31';
  },
  missing: (r) => {
    delete r.isEnabled;
  },
})) {
  test(`runtime ${label} blocks both unchanged and expression candidate`, () => {
    const raw = runtime();
    mutate(raw);
    for (const desired of [document(), document(edited)])
      assert.equal(delta(desired, raw).status, 'blocked');
  });
}

for (const key of ['fullName', 'creationType', 'expression', 'masterLabel']) {
  test(`independent Metadata ${key} disagreement blocks`, () => {
    const definition = metadata();
    definition[key] = 'different';
    for (const desired of [document(), document(edited)])
      assert.equal(delta(desired, runtime(), definition).status, 'blocked');
  });
}

test('unknown Metadata, authored label edit, mismatched identity and nondefault target block', () => {
  assert.equal(delta(document(), runtime(), { ...metadata(), extra: true }).status, 'blocked');
  const desired = document();
  desired.spec.displayName = 'Different label';
  assert.deepEqual(delta(desired).blockers, ['CI_NON_EXPRESSION_CHANGE']);
  desired.spec.displayName = 'Synthetic insight';
  desired.identity.apiName = 'Other__cio';
  assert.deepEqual(delta(desired).blockers, ['CI_IDENTITY_CHANGED']);
  assert.deepEqual(delta(document(), runtime(), metadata(), 'other').blockers, ['INVALID_SCOPE']);
});

const nativeNullKeys = [
  'historyPublishScheduleInterval',
  'historyPublishScheduleTimeZone',
  'historyPublishTime',
  'publishScheduleTimeZone',
  'sourceCiDevName',
  'sourceCiId',
  'sourceCiName',
];
const nativeRuntime = (status = 'ACTIVE', expression = original) => ({
  ...runtime(expression),
  ...Object.fromEntries(nativeNullKeys.map((key) => [key, wireNull])),
  calculatedInsightStatus: status,
  publishScheduleInterval: 'NOT_SCHEDULED',
  isFromPackage: status === 'DRAFT' ? wireNull : false,
  queryDialect: 'ANSI_SQL',
  ...(status === 'DRAFT' ? { dimensions: [], measures: [] } : {}),
});
const nativeProfile = { apiVersion: '68.0' };

for (const expression of [original, edited]) {
  for (const status of ['DRAFT', 'PROCESSING', 'ACTIVE']) {
    test(`API68 ${status} observes only qualified SQL ${expression === original ? 'original' : 'edited'}`, () => {
      const raw = nativeRuntime(status, expression);
      const observed = observeCalculatedInsight(raw, '68.0');
      assert.equal(observed.status, status);
      assert.equal(observed.document.spec.expression, expression);
      assert.deepEqual(observed.observations.nativeProfile, {
        isFromPackage: status === 'DRAFT' ? wireNull : false,
        schema: status === 'DRAFT' ? 'unmaterialized' : 'materialized',
      });
      assert.throws(() => observeCalculatedInsight(raw));
      assert.doesNotMatch(
        serializeCalculatedInsightDocument(observed.document),
        /isFromPackage|queryDialect|sourceCi|historyPublish|unmaterialized|DRAFT/u,
      );
      if (status === 'PROCESSING') {
        for (const expectedStatus of ['DRAFT', 'ACTIVE'])
          assert.throws(() =>
            projectCalculatedInsight(raw, metadata(expression), {
              ...nativeProfile,
              expectedStatus,
            }),
          );
      } else {
        const projected = projectCalculatedInsight(raw, metadata(expression), {
          ...nativeProfile,
          expectedStatus: status,
        });
        assert.deepEqual(projected.document, observed.document);
        assert.throws(() =>
          projectCalculatedInsight(raw, metadata(expression), {
            ...nativeProfile,
            expectedStatus: status === 'DRAFT' ? 'ACTIVE' : 'DRAFT',
          }),
        );
        if (status === 'DRAFT')
          assert.throws(() => projectCalculatedInsight(raw, metadata(expression), nativeProfile));
        else
          assert.deepEqual(
            projectCalculatedInsight(raw, metadata(expression), nativeProfile),
            projected,
          );
      }
    });
  }
}

for (const status of ['DRAFT', 'PROCESSING']) {
  test(`API68 ${status} preserves both evidenced package observations`, () => {
    for (const isFromPackage of [wireNull, false]) {
      const result = observeCalculatedInsight({ ...nativeRuntime(status), isFromPackage }, '68.0');
      assert.equal(result.observations.nativeProfile.isFromPackage, isFromPackage);
    }
  });
}

for (const [label, mutate] of Object.entries({
  ...Object.fromEntries(
    nativeNullKeys.map((key) => [
      key,
      (raw) => {
        raw[key] = 'unqualified';
      },
    ]),
  ),
  unknown: (raw) => {
    raw.extra = true;
  },
  missing: (raw) => {
    delete raw.queryDialect;
  },
  dialect: (raw) => {
    raw.queryDialect = 'SQL';
  },
  package: (raw) => {
    raw.isFromPackage = true;
  },
  schedule: (raw) => {
    raw.publishScheduleInterval = 'SYSTEM_MANAGED';
  },
  hasRun: (raw) => {
    raw.lastRunDateTime = '2026-11-04T10:00:00.000Z';
  },
  runStatus: (raw) => {
    raw.lastRunStatus = 'SUCCESS';
  },
  runError: (raw) => {
    raw.lastRunStatusErrorCode = 'ERROR';
  },
  statusError: (raw) => {
    raw.lastCalcInsightStatusErrorCode = 'ERROR';
  },
  schema: (raw) => {
    raw.dimensions.push({});
  },
  expression: (raw) => {
    raw.expression = 'SELECT COUNT(*) FROM Synthetic__dlm';
  },
})) {
  test(`API68 rejects ${label} in every admitted state`, () => {
    for (const status of ['DRAFT', 'PROCESSING', 'ACTIVE']) {
      const raw = nativeRuntime(status);
      mutate(raw);
      assert.throws(() => observeCalculatedInsight(raw, '68.0'));
      assert.equal(
        buildCalculatedInsightUpdateDelta(document(), raw, metadata(), 'default', {
          ...nativeProfile,
          expectedStatus: status === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
        }).status,
        'blocked',
      );
    }
  });
}

test('API68 draft schema never masquerades as materialized publication or deletion', () => {
  assert.throws(() =>
    observeCalculatedInsight(
      { ...nativeRuntime('DRAFT'), dimensions: runtime().dimensions },
      '68.0',
    ),
  );
  assert.throws(() => observeCalculatedInsight({ ...nativeRuntime(), dimensions: [] }, '68.0'));
  assert.throws(() =>
    observeCalculatedInsight({ ...nativeRuntime(), isFromPackage: wireNull }, '68.0'),
  );
  for (const status of ['DELETING', 'ERROR', 'OTHER'])
    assert.throws(() => observeCalculatedInsight(nativeRuntime(status), '68.0'));
  assert.throws(() => observeCalculatedInsight(nativeRuntime(), '69.0'));
  assert.throws(() =>
    projectCalculatedInsight(nativeRuntime(), metadata(), {
      ...nativeProfile,
      expectedStatus: 'DELETING',
    }),
  );
  assert.throws(() =>
    projectCalculatedInsight(
      nativeRuntime('DRAFT'),
      { ...metadata(), expression: edited },
      { ...nativeProfile, expectedStatus: 'DRAFT' },
    ),
  );
});

for (const status of ['DRAFT', 'ACTIVE']) {
  test(`API68 ${status} supports both exact expression directions without widening API65`, () => {
    for (const [current, desired] of [
      [original, edited],
      [edited, original],
    ]) {
      const raw = nativeRuntime(status, current);
      const profile = { ...nativeProfile, expectedStatus: status };
      const expected = observeCalculatedInsight(nativeRuntime(status, desired), '68.0').document;
      const result = buildCalculatedInsightUpdateDelta(
        expected,
        raw,
        metadata(current),
        'default',
        profile,
      );
      assert.equal(result.status, 'candidate');
      assert.deepEqual(result.patch, { expression: desired });
      assert.equal(
        buildCalculatedInsightUpdateDelta(
          expected,
          nativeRuntime(status, desired),
          metadata(desired),
          'default',
          profile,
        ).status,
        'unchanged',
      );
      assert.equal(delta(document(), runtime(edited), metadata(edited)).status, 'blocked');
    }
  });
}
