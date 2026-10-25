import { validateDmoDocument } from './dmo-document.js';
import type { DmoDocument, DmoField } from './dmo-document.js';

export type DmoUpdatePatch = {
  label?: string;
  description?: string;
  fields?: Array<Pick<DmoField, 'name' | 'label' | 'dataType' | 'description' | 'category'>>;
};

export type DmoUpdateDelta =
  | { status: 'blocked'; blockers: string[] }
  | { status: 'unchanged'; blockers: []; expected: DmoDocument }
  | { status: 'candidate'; blockers: []; patch: DmoUpdatePatch; expected: DmoDocument };

/**
 * Build an offline PATCH contract candidate, never execution authorization.
 * Current must already be qualified by the caller; authored JSON alone is not org evidence.
 * @param {unknown} desired Authored desired document.
 * @param {unknown} current Qualified current authored document.
 * @param {unknown} targetDataSpace Explicit default binding.
 * @returns {DmoUpdateDelta} Atomic candidate/overlay or payload-free blockers only.
 */
export function buildDmoUpdateDelta(
  desired: unknown,
  current: unknown,
  targetDataSpace: unknown,
): DmoUpdateDelta {
  const source = validateDmoDocument(desired);
  const target = validateDmoDocument(current);
  if (
    targetDataSpace !== 'default' ||
    source.identity.dataSpace !== 'default' ||
    target.identity.dataSpace !== 'default'
  )
    return { status: 'blocked', blockers: ['INVALID_SCOPE'] };
  if (source.identity.apiName !== target.identity.apiName)
    return { status: 'blocked', blockers: ['OBJECT_IDENTITY_CHANGED'] };

  const blockers = new Set<string>();
  const patch: DmoUpdatePatch = {};
  const expected = structuredClone(target);
  if (source.spec.category !== target.spec.category) blockers.add('CATEGORY_CHANGED');
  for (const key of ['eventDateTimeFieldName', 'recordModifiedFieldName'] as const)
    if (source.spec[key] !== target.spec[key]) blockers.add('DATE_DESIGNATION_CHANGED');
  if (source.spec.label !== target.spec.label) {
    patch.label = source.spec.label;
    expected.spec.label = source.spec.label;
  }
  if ('description' in source.spec && source.spec.description !== target.spec.description) {
    if (source.spec.description?.trim()) {
      patch.description = source.spec.description;
      expected.spec.description = source.spec.description;
    } else {
      blockers.add('DESCRIPTION_CLEAR_UNPROVEN');
    }
  }

  const existing = new Map(expected.spec.fields.map((field) => [field.name, field]));
  const foldedNames = new Set(target.spec.fields.map((field) => field.name.toLowerCase()));
  const changes: NonNullable<DmoUpdatePatch['fields']> = [];
  // Sort a fresh array so candidate order does not depend on the desired field order.
  // eslint-disable-next-line unicorn/no-array-sort -- The configured TypeScript target lacks toSorted.
  const fields = [...source.spec.fields].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const field of fields) {
    const prior = existing.get(field.name);
    if (!prior) {
      if (foldedNames.has(field.name.toLowerCase())) blockers.add('FIELD_IDENTITY_CHANGED');
      if (field.isPrimaryKey || field.isDynamicLookup) blockers.add('NEW_FIELD_FLAGS_UNSUPPORTED');
      if ('description' in field && !field.description?.trim())
        blockers.add('DESCRIPTION_CLEAR_UNPROVEN');
      const addition = {
        name: field.name,
        label: field.label,
        dataType: field.dataType,
        ...('description' in field ? { description: field.description } : {}),
        ...('category' in field ? { category: field.category } : {}),
      };
      changes.push(addition);
      expected.spec.fields.push(structuredClone(field));
      continue;
    }
    if (
      field.dataType !== prior.dataType ||
      field.isPrimaryKey !== prior.isPrimaryKey ||
      field.isDynamicLookup !== prior.isDynamicLookup ||
      field.category !== prior.category ||
      'category' in field !== 'category' in prior ||
      ('description' in field && field.description !== prior.description)
    )
      blockers.add('FIELD_CONFIGURATION_UNSUPPORTED');
    if (field.label !== prior.label) {
      // Provisional field-label contract: exact name and unchanged dataType identify the field.
      changes.push({ name: field.name, label: field.label, dataType: field.dataType });
      prior.label = field.label;
    }
  }
  if (blockers.size > 0) return { status: 'blocked', blockers: [...blockers] };
  if (changes.length > 0) patch.fields = changes;
  if (Object.keys(patch).length === 0) return { status: 'unchanged', blockers: [], expected };
  return { status: 'candidate', blockers: [], patch, expected };
}
