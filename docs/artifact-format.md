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
  relationships is not evidence of absence. The separate raw acquisition helper
  below is not yet bound to this projection.
- Unknown keys, nested semantic values, accessors, duplicate names, unsupported
  creation variants and invalid candidates throw payload-free `DmoDocumentError`.

Raw object observations excluded from configuration are exactly `id`,
`hasExternalDataLakeObjectMappings`, `isEditable`, `isEnabled`, `isSegmentable`.
All other admitted object keys are configuration. Field configuration includes
`name`, `label`, `description`, `category`, `type`, `isPrimaryKey`,
`isDynamicLookup`, `creationType`, `keyQualifierName`, `isDistinct`, `usageTag`.
No field-ID exemption or generic unknown-metadata stripping exists.

## Strict Connect/Metadata Other diagnostic slice

`projectDmoConnectMetadata(connect: unknown, metadata: unknown, relationships: unknown):
DmoConnectMetadataProjection` joins the exact DMO identity and every field's
Connect `name` to Metadata `fullName`, independently of field-array order. Only
one proven API 65 Other variant is admitted: two authored fields (Text primary,
DateTime nonprimary), four System Text fields including one explicit qualifier,
no relationships, disabled/unsegmentable/unmapped custom schema. Profile and
Engagement are not accepted by this helper.

Metadata `primaryIndexOrder: '1'` and `isDynamicLookup: 'false'` are authoritative;
Connect flags, if present, must agree. Qualifiers bind only through exact
`keyQualifierName` to `refAttrDeveloperName`, then the joined generated field
identity. No suffix conversion or field-name inference occurs. Required false,
Text length 60, DateTime length absence, usage tags, distinctness, labels and
creation types are checked. Unknown properties, nonempty Metadata collections,
extra/missing/duplicate fields and incompatible semantics throw payload-free
`DmoDocumentError` rather than being discarded. These constraints describe the
observed narrow variant, not all valid Salesforce schemas.

The result has `status: 'projected'`, `blockers: []`, a two-field `candidate`,
`createIdentity: { status: 'verified', name, sourceApiName }`, `qualifierBindings`,
and independently copied full `expectations: { connect, metadata }`. Only after
all existing profile checks pass, `name` removes exactly one terminal case-sensitive
`__dlm` from the validated qualified `sourceApiName`. The base starts with an ASCII
letter, contains only ASCII letters/digits and internal single underscores, and
cannot start with SSOT (case-insensitive). Missing/wrong/repeated suffixes,
namespace-like doubles, invalid characters and trailing underscores reject;
there is no sanitization, case folding or internal replacement. Candidate and
both expectations retain the original qualified name. Metadata `fullName` equals
Connect `name`; no separate developerName is inferred.

Expectations retain generated fields, primary/dynamic attributes, length/required
presence and all admitted readback metadata; they are not writable Metadata API
input. The source Connect ID remains an observation. `projected` establishes only
this offline profile projection and identity, not general deployment support.
The candidate must never be detached and presented as deployable. No request
builder exists: the nested field request-name contract remains a separate checkpoint.

Offline evidence inspected 2026-10-25: a separately authorized Other experiment
reported full Connect/Metadata equality across orgs, excluding only Connect ID
and field-array ordering, with no source drift. This gate is satisfied only for
that fixture and does not establish repeat no-op/update behavior,
Profile/Engagement support or generic generated schemas.
No live calls occur in this helper or its independently authored synthetic tests.

## Authoritative contract evidence (2026-10-25)

The coordinator's resolved official naming research uses the
[Connect Data Model Object Input contract](https://developer.salesforce.com/docs/data/connectapi/references/spec?meta=type%3AData+Model+Object+Input):
its paired create/read example maps `CustomDMO` to `CustomDMO__dlm`. Documented
name diagnostics require a leading letter, alphanumeric/underscore characters,
no consecutive or trailing underscores, and no custom SSOT prefix. The official
object reference identifies the `__dlm` DMO suffix. Together these support the
narrow inverse above for the already admitted non-namespaced custom profile,
without retaining an old create request or introducing a provenance subsystem.
This slice uses that supplied research offline; it performs no online/org calls.

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
Its description/example disagree about suffixes; the separate official naming
contract below resolves only the object create identity, not nested field request
names or version-specific runtime acceptance. The wider object schema also
exposes additional categories and SQL/flex settings; these are explicitly blocked
rather than added to this bounded custom-schema slice.

`payload_examples('d360_dmo_relationship_list')` independently describes a
separate source-or-target relationship list, required `dataModelObjectName`,
optional `dataspace`, `status`, `creationType`. No org call was executed.

## Read-only relationship acquisition

The full official endpoint section (checked 2026-10-25) establishes API 64.0
`GET /ssot/data-model-objects/{dataModelObjectName}/relationships`, covering the
selected DMO as either source or target. Query parameters: `creationType`,
`dataspace` (server default is default), `limit` (default 20), `offset`, `orderBy`,
`sortBy`, `status`. Acquisition deliberately omits status/creation filters.
The documented response has `relationships`, `count`, `totalSize`, `sortBy` and
current/next/previous page token/URL pairs. Its sample links use an older v63
route absent from the operation table; no equivalence is inferred from those URLs.

`ConnectClient.listDataModelObjectRelationships(dataModelObjectName: string,
dataSpace: string): Promise<Array<Record<string, unknown>>>` uses explicit scope,
API >=64.0 and the documented route only. It requests 20 rows, offsets 0..2000,
ASC/DeveloperName; 2000 is a local budget, not an endpoint limit claim. It ignores
response links/tokens for navigation and never forwards them. A terminal page
requires accumulated rows equal totalSize and absent/null/empty next URL/token.
Missing total, inconsistent optional count, changing totals, overlap, out-of-scope records, unknown
envelope keys, premature short pages or budget exhaustion block without returning
partial data. The helper accepts only identifier-form data spaces and DMO names
ending __dlm (including namespaces); other names block before network access.

Raw entry fields, including unknown nested metadata, qualifiers, cardinality,
status, owner, generated names and optional/absent targetField, survive untouched.
This is transport preservation, not approval of unknown semantics for portable
export. Entries require unique nonblank names and sourceObject/targetObject names;
at least one endpoint must match the requested DMO. Data-space scope relies on
the server query, not an invented per-record data-space field. Offset pagination
has no snapshot guarantee and equal-total concurrent changes can evade detection.
Read-only API 65.0 acceptance on 2026-10-25 corrected the reference sample's
assumptions: count/sortBy are absent, endpoints are sourceObject/targetObject,
and the empty synthetic DMO returns HTTP 204. The helper uses JSforce's private
noContentResponse sentinel to distinguish 204 from a missing/malformed JSON body;
204 is accepted only on the initial page, never after an advertised nonzero total.
A standard DMO returned 142 records across eight pages of limit 20, ending with
two records and no next URL. Qualifier properties were null in that inspected set;
this is not evidence that populated qualifier structures may be discarded.

The prior synthetic custom Engagement DMO has two custom and four system fields,
a qualifier reference lacking the __c suffix of its generated field, and no
eventDateTimeFieldName in detail. Its projection therefore fails closed: a single
DateTime field does not prove event-time designation. No suffix-based binding or
portable output is claimed. The next prerequisite is an authoritative metadata
source for the designated event field (and record-modified designation), followed
by generated-qualifier replay evidence. No rows or org changes were used.
