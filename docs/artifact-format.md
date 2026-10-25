# Internal DMO field contract

The validator/serializer and raw field projection are internal offline helpers,
not an export/deploy format. No CLI integration, filesystem discovery, published
JSON Schema or request construction exists. The future layout remains
`data360/<logical-data-space>/<family>/<api-name>.json`; safe paths are unimplemented.

## Authored document

`validateDmoDocument(value: unknown): DmoDocument` checks without mutation;
`serializeDmoDocument(value: unknown): string` sorts object keys, preserves array
order and string contents, indents two spaces and appends LF. Only ordinary JSON
records with enumerated keys are accepted. Unknown keys block, even null/false.

- `schemaVersion: 1`, `kind: 'dmo'`.
- `identity: { dataSpace, apiName }`: explicit logical data space and canonical
  non-namespaced custom name ending `__dlm`.
- `spec`: nonblank `label`, optional string `description`, `category`
  (`Profile | Other | Engagement`), ordered nonempty `fields`. Optional
  `eventDateTimeFieldName` and `recordModifiedFieldName` resolve exactly to a
  DateTime field. Engagement requires its event reference.
- Fields: canonical custom `name` ending `__c`, nonblank `label`, `dataType`,
  boolean `isPrimaryKey`, boolean `isDynamicLookup`; optional string `description`
  and `category`. Types: `Number`, `Text`, `Date`, `DateTime`, `Url`, `Phone`,
  `Email`, `Percent`, `Boolean`, `Currency`, `ArrayOfFloats`, `ArrayOfTexts`.
- Exactly one primary key and case-insensitively unique field names are local
  subset constraints. Name stems begin with a letter, do not begin with SSOT,
  and have no trailing or consecutive underscores. Data-space identifiers use
  ASCII letters/digits/underscores and begin with a letter.

These are authored-shape constraints, not selected-version deployment acceptance.
Namespaced/standard objects, extra object categories, SQL/flex DMOs and object
execution/status inputs remain outside this subset.

## Lossless diagnostic projection, explicitly incomplete

`projectDmoRawFields(value: unknown): DmoFieldProjection` accepts custom raw detail
only and returns `{ status: 'incomplete', blockers, candidate, configuration }`.
It never returns a complete portable export. `candidate` is the writable-field
subset for inspection only. `configuration` independently retains every admitted
raw configuration property, including field order, original category spelling,
flag presence, custom qualifiers and all system fields. It is not deploy input.
Do not serialize the candidate alone as a portable retrieval result.

- Read `type` maps to candidate `dataType`; missing boolean flags become false
  only in the candidate. Explicit invalid flags block. Uppercase PROFILE/OTHER/
  ENGAGEMENT map to title-case only in the candidate. Original values survive.
- `creationType: System` fields remain in configuration, never silently disappear.
  They add `GENERATED_FIELD_REPLAY_UNVERIFIED`. No hardcoded name pattern proves
  generation; recreation and collisions still need target evidence.
- Custom `keyQualifierName`, `isDistinct` and `usageTag` are retained and add
  `FIELD_SEMANTICS_REPLAY_UNVERIFIED`, even when false or apparently default.
  The nested input contract does not make these directly writable.
- Every result includes `RELATIONSHIPS_NOT_ACQUIRED`. DMO detail does not establish
  incoming/outgoing relationship completeness. An empty detail field list of
  relationships is not evidence of absence. Separate acquisition is next.
- Unknown keys, nested semantic values, accessors, duplicate names, unsupported
  creation variants and invalid candidates throw payload-free `DmoDocumentError`.

Raw object observations excluded from configuration are exactly `id`,
`hasExternalDataLakeObjectMappings`, `isEditable`, `isEnabled`, `isSegmentable`.
All other admitted object keys are configuration. Field configuration includes
`name`, `label`, `description`, `category`, `type`, `isPrimaryKey`,
`isDynamicLookup`, `creationType`, `keyQualifierName`, `isDistinct`, `usageTag`.
No field-ID exemption or generic unknown-metadata stripping exists.

## Authoritative contract evidence (2026-10-25)

Local official mirrors had no nested field contract. The
[official Connect REST reference](https://developer.salesforce.com/docs/data/connectapi/references/spec)
provides the custom DMO endpoint from 61.0 and Date/DateTime examples, not a type
restriction. Its HTML links a YAML asset that returned HTTP 404; direct nested
rendering timed out. Search summaries mixed unrelated contracts and were not
used to infer the enum.

The official Salesforce Data360 MCP `payload_examples('d360_dmo_create')`
returned the nested `DataModelObjectInputRepresentation` schema. Its field item
has exactly `category`, `dataType` (the 12-value enum above), `description`,
`isDynamicLookup`, `isPrimaryKey`, `label`, `name`; no nested required list.
The tool schema is current metadata without per-property minimum API versions.
Its description/example disagree about suffixes, so no create-name conversion
or version-specific runtime acceptance is claimed. The wider object schema also
exposes additional categories and SQL/flex settings; these are explicitly blocked
rather than added to this bounded custom-schema slice.

`payload_examples('d360_dmo_relationship_list')` independently describes a
separate source-or-target relationship list, required `dataModelObjectName`,
optional `dataspace`, `status`, `creationType`. No org call was executed. Pagination,
response envelope, qualified references and complete incoming/outgoing acquisition
remain the next contract checkpoint. Generated qualifier replay and safe PATCH
semantics also remain unverified. No portable round trip is claimed.
