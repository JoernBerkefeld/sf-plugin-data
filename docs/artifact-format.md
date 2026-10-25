# Initial portable DMO document

An internal validator and deterministic serializer now cover a deliberately narrow
custom DMO document. This is not yet a deployable/exportable format: no reader,
writer, discovery, raw projection, bindings or CLI integration exists. No public
JSON Schema is published until the first lossless DMO projection is established.
The future layout remains `data360/<logical-data-space>/<family>/<api-name>.json`;
identity validation does not establish filename escaping or collision safety.

## Exact current shape

- `schemaVersion: 1`, `kind: "dmo"`.
- `identity: { dataSpace, apiName }`: explicit logical data-space identifier and
  canonical custom object name ending `__dlm`. Namespaced/standard objects are
  outside this subset. Data-space identifiers start with a letter and contain
  only ASCII letters, digits and underscores; this is a local subset, not a claim
  about every server-valid data-space name.
- `spec`: required nonblank `label`, optional string `description`, required
  `category` (`Profile`, `Other`, `Engagement`) and nonempty ordered `fields`.
  Optional `eventDateTimeFieldName` and `recordModifiedFieldName` refer by exact
  name to a declared `DateTime` field. Engagement requires its event reference.
- Each field requires canonical custom `name` ending `__c`, nonblank `label`,
  `dataType` (`Date` or `DateTime` only), boolean `isPrimaryKey` and
  `isDynamicLookup: false`; string `description` is optional. Exactly one primary
  key and case-insensitively unique field names are local subset invariants.
- Custom name stems start with a letter, do not start with SSOT, and have no
  trailing or consecutive underscores. Input request names without suffixes are
  not portable identities. Conversion to create/update requests is not implemented.

Unknown properties at every document level are rejected, even when null/false;
there is no coercion or property stripping. Only ordinary JSON records are
accepted. Serialization recursively sorts object keys by code-unit comparison,
retains field-array order and all string contents, uses two-space indentation
and a final LF. Embedded CR/LF in descriptions survives JSON escaping; a future
writer must encode UTF-8. Validation and serialization do not mutate input.

## Official evidence and limits

Checked 2026-10-25 against the endpoint-specific sections in the
[Salesforce Data360 Connect REST reference](https://developer.salesforce.com/docs/data/connectapi/references/spec).
Local official mirrors did not contain this contract. `POST`/`PATCH
/ssot/data-model-objects` are documented from API 61.0. Their body table lists
`dataSpaceName`, `description`, `label`, `name`, `category`,
`eventDateTimeFieldName`, `fields`, `recordModifiedFieldName`, `type`, `status`.
The table uses title-case categories while its request example uses uppercase;
this artifact uses the table values and makes no server-normalization claim.
Endpoint samples demonstrate field `name`, `label`, `description`, `dataType`,
`isPrimaryKey`, `isDynamicLookup` and only Date/DateTime types. The available page
rendering does not expand the nested field schema. Broader types and attributes
remain evidence checkpoints, not an inferred universal enum. Dynamic lookup and
status/type changes are deliberately not accepted by this initial contract.
No selected API version or live request was verified by this slice.

Raw response keys are classified separately by `classifyDmoRawField`:

- Object configuration: `name`, `dataSpaceName`, `label`, `description`,
  `category`, `eventDateTimeFieldName`, `recordModifiedFieldName`, `fields`,
  `creationType`.
- Field configuration: `name`, `label`, `description`, `type`, `isPrimaryKey`,
  `isDynamicLookup`, `creationType`, `keyQualifierName`, `isDistinct`, `usageTag`.
- Object observations: `id`, `hasExternalDataLakeObjectMappings`, `isEditable`,
  `isEnabled`, `isSegmentable`. These are absent from the documented create
  input; observations still inform future preflight, never permission to enable.
- Every other key is unknown. No field-level IDs or generic metadata exemptions
  are assumed. Relationships are separate API resources, not silently omitted.

Classification is not projection and does not assert that configuration keys are
all directly writable. Qualifiers, distinctness, usage tags, generated fields
and relationships must be preserved/resolved or explicitly blocked before export;
none may be silently dropped to fit this subset. Read `type` versus write
`dataType`, canonical suffixes versus create stems, generated qualifier behavior,
and safe nondestructive PATCH semantics still need an adapter evidence slice.
