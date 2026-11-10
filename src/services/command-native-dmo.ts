import { operationDiagnostic, replaceExplanation } from './operation-diagnostic.js';
import { NativeDmoError } from '../artifacts/native-dmo-document.js';
import { nativeMappingName } from '../artifacts/native-mapping-document.js';
import { preflightNativeDmo, deployNativeDmo, mappedFieldRemoval } from './native-dmo.js';
import type { NativeDmoDeployOptions } from './native-dmo.js';
import type { DmoClient } from '../transport/dmo-rest.js';
import type { MappingClient } from '../transport/mapping-rest.js';

/** A mapped field the file omits and the mappings whose pair targets it; empty when unidentified. */
export type MappedField = { field: string; mappings: string[] };

/** What a refused mapped-field removal needs to name the mappings and the exact commands. */
export type MappedFieldGuide = {
  /** Read-only mapping inventory of the target; built only after a refusal. */
  mappings: () => Pick<MappingClient, 'list'>;
  /** Target org exactly as passed to the command; omitted from the commands when absent. */
  targetOrg?: string;
  /** Data space exactly as passed to the command; omitted from the commands when absent. */
  dataspace?: string;
};

export type DmoCommandOptions = NativeDmoDeployOptions & { mappedFieldGuide?: MappedFieldGuide };

export type DmoPreview = {
  family: 'dmo';
  outcome: 'create' | 'update' | 'unchanged';
  target: 'absent' | 'existing';
  absenceProof: 'confirmed-404' | 'none';
  /** Custom target fields a deploy with --allow-field-removal removes. */
  removeFields?: string[];
  diagnostics: Array<{ code: string; message: string }>;
};

const identified = new WeakMap<Error, MappedField[]>();

/**
 * Read the mapped fields and their mappings recorded for a refused field removal.
 * @param {unknown} error Caught error.
 * @returns {MappedField[] | undefined} Recorded fields, or nothing for any other error.
 */
export function mappedFieldMappings(error: unknown): MappedField[] | undefined {
  return error instanceof Error ? identified.get(error) : undefined;
}

/**
 * Render one command-line value, quoting it only when a shell would split it.
 * @param {string} value Alias, username or data space as the user passed it.
 * @returns {string} Copyable argument; a value a shell could expand is never echoed.
 */
function argument(value: string): string {
  if (/^[\w.@+-]+$/u.test(value)) return value;
  return /^[\w.@+\- ]+$/u.test(value) ? `"${value}"` : '<value>';
}

/**
 * List, read-only, which mappings targeting the DMO hold a pair for each mapped field.
 * @param {string} apiName Exact DMO full name.
 * @param {string[]} fields Mapped fields the file omits.
 * @param {MappedFieldGuide} guide Mapping inventory source.
 * @returns {Promise<MappedField[]>} Each field with its mapping names in inventory order.
 */
async function findMappings(
  apiName: string,
  fields: string[],
  guide: MappedFieldGuide,
): Promise<MappedField[]> {
  const response = (await guide.mappings().list(apiName)) as {
    objectSourceTargetMaps?: unknown;
  } | null;
  const maps = response?.objectSourceTargetMaps;
  if (!Array.isArray(maps)) throw new TypeError('Mapping inventory was not returned.');
  const found = fields.map((field) => ({ field, mappings: [] as string[] }));
  for (const entry of maps as Array<Record<string, unknown> | null>) {
    // Names are echoed into commands, so anything outside the mapping-name grammar is skipped.
    if (
      typeof entry?.developerName !== 'string' ||
      !nativeMappingName.test(entry.developerName) ||
      entry.targetEntityDeveloperName !== apiName ||
      !Array.isArray(entry.fieldMappings)
    )
      continue;
    const targets = new Set(
      (entry.fieldMappings as Array<Record<string, unknown> | null>).map(
        (pair) => pair?.targetFieldDeveloperName,
      ),
    );
    for (const item of found)
      if (targets.has(item.field) && !item.mappings.includes(entry.developerName))
        item.mappings.push(entry.developerName);
  }
  return found;
}

/**
 * Word the refusal: fields, mappings and the exact manual command sequence, or the generic
 * instruction when no mapping could be identified.
 * @param {string} apiName Exact DMO full name.
 * @param {MappedField[]} mapped Mapped fields with their identified mappings.
 * @param {boolean} lookupFailed Whether the mapping inventory could not be read.
 * @param {MappedFieldGuide} [guide] Target org and data space as passed.
 * @returns {string} One message; command lines stand on their own lines.
 */
function mappedRemovalMessage(
  apiName: string,
  mapped: MappedField[],
  lookupFailed: boolean,
  guide?: MappedFieldGuide,
): string {
  const fields = mapped.map(({ field }) => field).join(', ');
  const names = [...new Set(mapped.flatMap(({ mappings }) => mappings))];
  const lead = `Field removal refused for ${apiName}: `;
  if (names.length === 0)
    return `${lead}${fields} ${mapped.length === 1 ? 'is' : 'are'} mapped, and Salesforce would drop the mapping pair(s) together with the field(s). The mapping could not be identified (${lookupFailed ? 'the mapping lookup failed' : 'no mapping targeting this DMO lists a pair for the field(s)'}). Retrieve the mapping, remove the pair(s) whose targetFieldDeveloperName is ${fields} from its file and deploy it; then deploy this DMO again with --allow-field-removal.`;
  const scope =
    (guide?.targetOrg === undefined ? '' : ` -o ${argument(guide.targetOrg)}`) +
    (guide?.dataspace === undefined ? '' : ` --dataspace ${argument(guide.dataspace)}`);
  const selectors = names.map((name) => ` -m mapping:${name}`).join('');
  const unidentified = mapped
    .filter(({ mappings }) => mappings.length === 0)
    .map(({ field }) => field);
  const summary = mapped
    .map(({ field, mappings }) =>
      mappings.length > 0
        ? `${field} is mapped by ${mappings.join(', ')}`
        : `${field} is mapped by a mapping that could not be identified`,
    )
    .join('; ');
  const edits = [
    ...names.map(
      (name) =>
        `In data360/mapping/${name}.mapping-meta.json remove the pair(s) whose targetFieldDeveloperName is ${mapped
          .filter(({ mappings }) => mappings.includes(name))
          .map(({ field }) => field)
          .join(', ')}; keep all other pairs.`,
    ),
    `In data360/dmo/${apiName}.dmo-meta.json remove the field(s) ${fields}.`,
    ...(unidentified.length > 0
      ? [
          `Remove the pair(s) for ${unidentified.join(', ')} from the mapping that holds them in the same way.`,
        ]
      : []),
  ];
  return [
    `${lead}${summary}. Salesforce would drop the mapping pair(s) together with the field(s), so remove the pair(s) first:`,
    `sf data360 retrieve${scope}${selectors} -m dmo:${apiName} --overwrite`,
    edits.join(' '),
    `sf data360 deploy${scope}${selectors}`,
    `sf data360 deploy${scope} -m dmo:${apiName} --allow-field-removal`,
    '',
  ].join('\n');
}

/**
 * Complete a mapped-field removal refusal with the mappings and commands. The lookup is read-only
 * and never changes the refusal: when it fails or finds nothing, the generic instruction is kept.
 * @param {unknown} error Caught error; anything but DMO_FIELD_REMOVAL_MAPPED is left untouched.
 * @param {MappedFieldGuide} [guide] Mapping inventory source and command context.
 * @returns {Promise<MappedField[] | undefined>} Mapped fields with their mappings, for this refusal only.
 */
async function explainMappedRemoval(
  error: unknown,
  guide?: MappedFieldGuide,
): Promise<MappedField[] | undefined> {
  const refused = mappedFieldRemoval(error);
  if (!refused || !(error instanceof Error)) return undefined;
  let mapped = refused.fields.map((field) => ({ field, mappings: [] as string[] }));
  let lookupFailed = true;
  try {
    if (guide) {
      mapped = await findMappings(refused.apiName, refused.fields, guide);
      lookupFailed = false;
    }
  } catch {
    /* The refusal stands; only the mapping names are missing from its explanation. */
  }
  replaceExplanation(error, mappedRemovalMessage(refused.apiName, mapped, lookupFailed, guide));
  identified.set(error, mapped);
  return mapped;
}

/**
 * Compare an exact native DMO without mutation.
 * @param {unknown} value Portable definition.
 * @param {DmoClient} client Target client.
 * @param {string} [requestScope] Optional explicit data space.
 * @param {DmoCommandOptions} [options] Opt-in field removal and its refusal guide.
 * @returns {Promise<DmoPreview>} Payload-free comparison naming any planned field removals.
 */
export async function preflightDmo(
  value: unknown,
  client: DmoClient,
  requestScope?: string,
  options: DmoCommandOptions = {},
): Promise<DmoPreview> {
  const { mappedFieldGuide, ...deployOptions } = options;
  let plan: Awaited<ReturnType<typeof preflightNativeDmo>>;
  try {
    plan = await preflightNativeDmo(value, client, requestScope, deployOptions);
  } catch (error) {
    // The same refusal is rethrown; only its explanation gains the mappings and commands.
    await explainMappedRemoval(error, mappedFieldGuide);
    throw error;
  }
  const removeFields = plan.operation === 'update' ? plan.removeFields : undefined;
  return {
    family: 'dmo',
    outcome: plan.operation,
    target: plan.operation === 'create' ? 'absent' : 'existing',
    absenceProof: plan.operation === 'create' ? 'confirmed-404' : 'none',
    ...(removeFields ? { removeFields } : {}),
    diagnostics: removeFields
      ? [
          {
            code: 'DMO_FIELD_REMOVAL_PLANNED',
            message: `Fields missing from the file are removed with one Metadata API destructive change: ${removeFields.join(', ')}.`,
          },
        ]
      : [],
  };
}
/**
 * Execute at most one PATCH and one field removal with conservative dispatch evidence and
 * independent readback.
 * @param {unknown} value Portable definition.
 * @param {DmoClient} client Target client.
 * @param {string} [requestScope] Optional explicit data space.
 * @param {DmoCommandOptions} [options] Opt-in field removal and its refusal guide.
 * @returns {Promise<object>} Payload-free outcome.
 */
export async function executeDmo(
  value: unknown,
  client: DmoClient,
  requestScope?: string,
  options: DmoCommandOptions = {},
) {
  const { mappedFieldGuide, ...deployOptions } = options;
  let dispatched = false;
  const remove = client.removeFields;
  const guarded: DmoClient = {
    ...client,
    create: async (body) => {
      dispatched = true;
      return client.create(body);
    },
    update: async (name, body) => {
      dispatched = true;
      return client.update(name, body);
    },
    ...(remove
      ? {
          removeFields: async (name: string, fieldNames: string[]) => {
            dispatched = true;
            return remove(name, fieldNames);
          },
        }
      : {}),
  };
  try {
    const result = await deployNativeDmo(value, guarded, requestScope, undefined, deployOptions);
    if (result.operation === 'unchanged')
      return {
        outcome: 'unchanged' as const,
        mutation: 'not-attempted' as const,
        diagnostics: [],
      };
    return {
      outcome: result.operation === 'create' ? ('created' as const) : ('updated' as const),
      mutation:
        result.operation === 'create'
          ? ('confirmed-created' as const)
          : ('confirmed-updated' as const),
      ...(result.removedFields ? { removedFields: result.removedFields } : {}),
      diagnostics: [],
    };
  } catch (error) {
    // Preflight raises this refusal before any dispatch; the mapping lookup is read-only.
    const mappedFields = await explainMappedRemoval(error, mappedFieldGuide);
    return {
      outcome: dispatched ? ('failed' as const) : ('blocked' as const),
      mutation: dispatched ? ('unknown' as const) : ('not-attempted' as const),
      diagnostics: [
        {
          code: error instanceof NativeDmoError ? error.code : 'DMO_REQUEST_UNCONFIRMED',
          message: operationDiagnostic(
            error,
            dispatched
              ? 'Write outcome is unknown; inspect target before another attempt. No automatic retry.'
              : 'No write attempted; correct the reported check before another attempt.',
          ),
          ...(mappedFields ? { mappedFields } : {}),
        },
      ],
    };
  }
}
