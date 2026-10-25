# Internal DMO field contract

The approved Git artifact is the authored-only document below. Runtime source
expectations and joined projections remain internal, never part of that file.
The validator/serializer, mappers and raw field projection are offline helpers;
request mapping alone does not establish deployment acceptance. Explicit CLI
retrieval now delegates to the existing service and writer; filesystem discovery,
published JSON Schema and deployment request execution remain unimplemented. The future layout remains
`data360/<logical-data-space>/<family>/<api-name>.json`. The internal bounded
DMO writer below implements only `default/dmo`; explicit CLI retrieval is wired
to the service and this writer without adding command-level profile restrictions.

## Internal read-only deploy input resolver

`readDeployInputs({cwd, sourceDir?, metadata?})` returns sorted
`Array<{path: string, document: DmoDocument}>`. Exactly one nonempty mode is required:
explicit files/directories, or exact `dmo:ApiName` selectors resolving
`<cwd>/data360/default/dmo/<ApiName>.json`. Repeated identical selections and
overlapping paths coalesce; distinct files with case-conflicting identities reject.
Metadata filenames must exactly match their document identity. No implicit all or
bare-type selection exists. The CLI wiring remains pending; these are internal
input semantics, not a new public command.

All directory descendants are selected, so non-JSON members reject rather than
silently narrowing a directory. Limits: 256 files, 1024 visited entries, 16 nested
levels and 1 MiB per file. Absolute or cwd-relative explicit paths are supported;
wildcards, parent traversal, drive-relative paths, filesystem roots as directory
selections, links/junctions/aliased ancestors and hardlinked files reject. Existing
paths only: no mkdir, artifact, report or scratch writes. File handles are bounded
and checked against observed identity/size/timestamps; ancestor checks narrow but
do not eliminate hostile concurrent filesystem replacement races.

UTF-8 must decode strictly, without a BOM. JSON must parse with unique object keys
(including escaped equivalents), and pass both authored validation and independent
default-space mapping. Raw projections, observations and unknown keys reject.
Payload-free `DeployInputError` codes: INVALID_SELECTION, UNSAFE_SOURCE,
INVALID_SOURCE, DUPLICATE_IDENTITY. No connection or mutation transport is used.

## Internal read-only deploy preflight

`preflightDmoDeploy(document: unknown, connection: ReadConnection,
apiVersion: unknown, dataSpace: unknown): Promise<DmoDeployPreview>` accepts one
standalone authored document and explicit API 65.0/default target binding. It maps
the source independently before reads and detaches the mapped request in memory.
No CLI, file discovery, saved plan or mutation route is introduced.

The result is `{outcome, target, absenceProof, diagnostics}`. Outcomes are `create`,
`unchanged`, `blocked-changes` or `blocked`; target is `absent`, `present` or
`unknown`. Only a successful complete offset inventory filtered by exact default
space/API-name identity yields `absenceProof: 'complete-inventory'`; otherwise it
is `none`. No 404 or other error establishes absence. Existing inventory entries
require common `retrieveDmo` qualification including Metadata and relationships.
A race after inventory acquisition fails closed on retrieval; inventory is not a
transactional snapshot or permission to execute a later create.

Comparison uses fixed authored properties and exact identity-keyed fields, ignoring
field array order but preserving absent versus empty strings, case, primary/type,
category, dynamic flags and date designations. Static reasons distinguish object,
category, field-set, field and immutable changes; every difference appends
`UPDATE_UNSUPPORTED`. Unqualified target semantics produce `blocked`, never no-op.
Diagnostics contain code/message only, without authored values or remote payloads.
The public command will later enforce CMS-style explicit deploy selection; no
selector/discovery semantics change here.

## Internal common authored DMO file writer

`writeDmoDocument(value: unknown, projectRoot: string, overwrite: boolean)`
returns `{ path: string, outcome: 'retrieved' | 'unchanged' }`. First independently
validate through `buildDmoCreateRequestFromDocument(value, 'default')`, then
use `serializeDmoDocument`. Persist only the approved authored document, never
expectations, source IDs or runtime observations. Output is exactly
`<project-root>/data360/default/dmo/<api-name>.json`; the CLI must supply cwd when
`-d` is absent. No stale-file deletion or directory discovery exists.

Identical bytes preserve the existing file even without overwrite; differing
bytes require explicit overwrite. All existing ancestors are checked with lstat
and canonical path checks; symlinks/junctions, directory destinations and file
ancestors reject. Parents may be created but failed publication is never success.
Complete flushed staging is created under verified OS temp, then atomically
renamed for replacement or exclusively hard-linked for a new destination. The
staging file entry is removed after hard-link publication, leaving no writable
staging alias. Roots/ownership markers are retained; no recursive cleanup occurs.
Cross-volume publication fails closed (no copy fallback). The caller must report
OUTPUT_FAILED as failure and inspect the destination before retrying: publication
may have completed before a subsequent filesystem failure. Rechecking ancestors
and prior bytes narrows but cannot eliminate concurrent path-replacement races;
this is not a filesystem sandbox against a hostile concurrent local process.
Payload-free DmoWriteError codes: UNSAFE_PATH, OVERWRITE_REQUIRED, OUTPUT_FAILED.

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
Do not serialize this incomplete candidate as a portable retrieval result.
Only a separately qualified strict retrieval may emit the approved authored document.

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

## Common object projection (retrieval-integrated)

`projectCommonDmoConnectMetadata(connect: unknown, metadata: unknown,
relationships: unknown): DmoCommonProjection` returns status `projected` or
`incomplete`, blockers, optional validated candidate, verified local createIdentity,
exact qualifierBindings and independent expectations containing all three inputs.
Candidate is absent for missing Engagement event designation; it is diagnostic
only whenever blockers remain. Inputs must be complete separately acquired
collections; the projector cannot establish acquisition completeness itself.

One common path composes the shared field join for all authored types/counts.
Exact object name/label/description/default space and creation type must agree.
Unknown meaningful properties reject, not disappear. The observed Other taxonomy
and disabled/unmapped defaults qualify; unfamiliar taxonomy/category, execution,
metrics and mapping semantics have specific blockers. Explicit Connect event and
modified references must resolve exactly to authored DateTime fields. No Metadata
designation key is invented. Missing Engagement event returns
`ENGAGEMENT_EVENT_DESIGNATION_UNAVAILABLE`, even with one DateTime field.

The retained cross-org Other experiment establishes the generated recipe: three
standard system Text defaults and the explicit primary-key qualifier, joined by
metadata reference, with their observed labels/usage/default storage semantics.
The common recognizer checks those identities and defaults, not merely a System
tag or suffix. Recognition resolves generated/qualifier and observed length-60
storage blockers, without requiring two authored or six total fields. Other Text
lengths, required/distinct semantics and unfamiliar generated variants stay blocked.
Synthetic varied-count/type success is offline qualification, not new live proof.
No-generated shapes also retain an unverified recipe blocker. Complete nonempty
relationships remain retained with `RELATIONSHIP_REPLAY_UNSUPPORTED`; malformed,
foreign or unknown relationship shapes reject. Empty auxiliary Metadata
collections are checked, not silently dropped. The read service now runs this common
projection and requires projected status, empty blockers and a common-mapper-validated
candidate before returning success. The command repeats the completeness gate; the
writer independently validates authored JSON, never a runtime projection.

## Common offline field join (composed by common projection)

`joinDmoConnectMetadataFields(connectFields: unknown, metadataFields: unknown):
DmoJoinedFields` returns `{ fields, qualifierBindings, blockers, expectations }`.
It is the shared field-level slice, **not** a complete DMO projection, portable
export or deployment gate. Existing narrow compatibility helpers are unchanged.

Complete collections join one-to-one by exact qualified Connect `name` / Metadata
`fullName`, regardless of order. Any nonempty count and all 12 authored types are
admitted. Labels/types/creation semantics must agree; optional descriptions and
categories preserve presence and value. Exactly one authored primary is designated
by Metadata `primaryIndexOrder: '1'`; a supplied Connect flag must agree. Dynamic
lookup uses a supplied Metadata string boolean or a supplied Connect boolean;
conflicts or absence in both sources reject, never silently default false.

System fields never enter authored `fields`. Explicit qualifier references bind
Connect `keyQualifierName` to unique Metadata `refAttrDeveloperName`, then exact
System field identity, with complete reference consumption. Multiple qualifiers
and no qualifiers are supported without suffix inference or fixed field counts.
Unknown keys, unsupported usage/creation values, nonempty summary semantics,
ambiguous/dangling references and incomplete collections throw payload-free
`DmoDocumentError`. Other admitted non-authored semantics remain diagnostics:
required true, arbitrary positive Text storage length, distinct true, generated
fields, generated qualifiers and generated descriptions/categories add specific
`*_REPLAY_UNVERIFIED` blockers. Even an empty blocker array proves only this field
join; it does not qualify object taxonomy, relationships or generated recreation.
Independent full admitted collections remain in `expectations`.

The common object projector composes this join with object/category/taxonomy
validation, explicit event/modified references and complete relationship inputs.
The common retrieval service acquires those inputs; missing Engagement designation
is a specific blocker rather than field-count/type inference. Live acceptance is
not expanded beyond retained evidence.

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
The projection itself is not a Git artifact. After strict retrieval qualification,
only the authored candidate belongs in the approved Git file; its runtime source
expectations remain internal. A detached document is not proof of runtime source
state or deployment acceptance. No request execution exists. The bounded offline
mappers below distinguish source revalidation from authored-file mapping.

Offline evidence inspected 2026-10-25: a separately authorized Other experiment
reported full Connect/Metadata equality across orgs, excluding only Connect ID
and field-array ordering, with no source drift. This gate is satisfied only for
that fixture and does not establish repeat no-op/update behavior,
Profile/Engagement support or generic generated schemas.
No live calls occur in this helper or its independently authored synthetic tests.

## Bounded offline Other create request

`buildOtherDmoCreateRequest(value: unknown, targetDataSpace: unknown):
OtherDmoCreateRequest` accepts the complete joined projection, not a detached
portable candidate. It re-runs the existing strict profile against the independent
Connect/Metadata expectations and checks candidate, create identity, qualifier
binding and empty blocker agreement. Relationships must already have been acquired
and checked by the projection caller; this pure mapper performs no acquisition.
It does not authenticate the origin of supplied JSON or prove an org snapshot.

Both source and explicit target must equal case-sensitive `default`. Other spaces,
missing bindings and implicit fallback reject; cross-space remapping is not proven.
The fresh body contains only `name` (verified unsuffixed object base), `label`,
optional `description`, `dataSpaceName`, `category: 'Other'`, and exactly the two
authored `fields` with `name`, `label`, `dataType`, `isPrimaryKey`,
`isDynamicLookup`. Exact authored custom `__c` names survive unchanged. Generated
fields/qualifier references, org IDs, usage/distinctness, taxonomy, length/required
and other readback metadata never enter the request. No POST, update/no-op,
Profile/Engagement, CLI wiring or general deployment acceptance is implemented.

Nested-name reconciliation checked 2026-10-25: local text mirrors have no nested
input contract. The official reference linked below labels `fields` as Data Object
Field Input and its paired example submits unsuffixed field names. That example
shows one accepted spelling, not an explicit prohibition of qualified names.
Direct nested-page retrieval timed out; indexed full reference text was inspected,
not unrelated mapping/stream search synthesis. The existing separately authorized
API 65 experiment submitted `ContractKey__c` and `ObservedAt__c` unchanged and
read back identical authored identities, plus all four generated identities, in
both orgs. Its comparison passed with no source drift. That observed evidence
resolves this exact Other/default profile: field-name inversion is unnecessary.
It does not establish every naming form, arbitrary spaces or every API version.
No live org call or write was made while implementing this mapper.

## Common authored-document request mapper

`buildDmoCreateRequestFromDocument(value: unknown, targetDataSpace: unknown):
DmoCreateRequest` independently validates authored schemaVersion/kind/identity/spec.
It maps all three authored categories, all 12 documented nested types, any nonempty
field count, one primary key, and true/false dynamic lookup. Field category and
field/object description retain absence versus empty strings. Explicit event and
record-modified names retain exact spelling and must resolve to DateTime fields;
Engagement requires an event reference. Source and explicit target remain default.
Unsupported scope errors name only the affected property, never its supplied value.
Unknown/runtime properties still reject through the existing strict validator.

The fresh allowlisted object maps identity.apiName to the terminal-suffix-stripped
name, explicit target to dataSpaceName, and spec label/description/category/date
references individually. Each fresh field maps only name/label/dataType/description/
category/isPrimaryKey/isDynamicLookup. No spec spread, generated fields, response
flags, source expectations or relationships are accepted. Existing narrow Other
mappers and their compatibility tests remain unchanged but no longer drive retrieval.
Service/writer/command now use the common path. No new runtime acceptance is implied
by construction.

Evidence rechecked 2026-10-25 after local mirror gaps: official nested page fetches
timed out. Indexed full official [Connect endpoint reference](https://developer.salesforce.com/docs/data/connectapi/references/spec?meta=type%3AData+Model+Object+Input)
explicitly lists the three title-case categories, eventDateTimeFieldName and
recordModifiedFieldName as input (object base properties from 59.0; fields/category/
references from 60.0; custom DMO POST from 61.0). Its uppercase example is not used
as the enum. Official Data360 MCP payload_examples for d360_dmo_create independently
confirms the seven nested properties, optional string category/description,
boolean dynamic/primary flags and all 12 enum types. That schema omits the object
date references, so the endpoint contract supplies those mappings. It provides
no nested per-property minimum versions; true dynamic lookup and additional types
are schema-level mappings, not newly observed API 65 behavior. Exact authored
qualified field names retain the earlier naming evidence without claiming a live
round trip for every category/type/flag combination. SQL/flex/extra categories
remain outside the authored contract, not silently dropped.

## Standalone authored-document Other mapper

`buildOtherDmoCreateRequestFromDocument(value: unknown, targetDataSpace: unknown):
OtherDmoCreateRequest` first calls `validateDmoDocument`. It accepts the standalone
approved `{ schemaVersion, kind, identity, spec }` JSON after serialize/parse,
without a projection, source expectations, qualifier binding or fabricated metadata.
The existing `buildOtherDmoCreateRequest` remains the separate strict runtime
projection revalidator; its forged-projection checks are unchanged.

Source and explicit target must both equal case-sensitive `default`. The supported
spec is exactly Other with two authored fields: one Text primary key and one
DateTime nonprimary, both `isDynamicLookup: false`. Field description/category and
object event/record-modified references are rejected even if empty. Unknown keys,
relationships and runtime projection keys reject rather than disappear.

The fresh request derives the object base using the already validated terminal
`__dlm` rule, preserves exact authored `__c` field names, labels and array order,
and preserves optional object description presence, including empty text. It does
not mutate or share field objects with its input. No expectations are fabricated.
This is offline request construction only: deployment must independently validate
the authored file and later compare actual target readback, with internal runtime
expectations acquired as needed. It does not provide CLI/file handling, transport,
target preflight, create/update/no-op orchestration or general DMO acceptance.

## Internal common read-only DMO retrieval

`retrieveDmo(connection: ReadConnection, objectApiName: unknown,
apiVersion: unknown, dataSpace: unknown): Promise<DmoCommonProjection & { candidate: DmoDocument }>`
is internal; ReadConnection is a Pick of core Connection's instanceUrl, request,
metadata and getApiVersion. Caller supplies existing authenticated core connection.
Both explicit API and the connection version must be 65.0; data space must be
case-sensitive default; object identity must be the supported local custom __dlm
form. Unsupported inputs fail before acquisition, without version mutation.

The service uses ConnectClient GET for exact detail, core
`connection.metadata.read('CustomObject', [objectApiName])`, then the existing
complete incoming/outgoing relationship helper with explicit default scope.
Installed core/JSforce source confirms array input returns the decoded records
array, not a SOAP result/records wrapper, using the connection's SOAP API version.
Exactly one record with exact fullName is mandatory; empty, missing, wrapped,
foreign and ambiguous responses block. Every admitted Metadata property reaches
the strict projector unchanged; there is no property-stripping envelope adapter.
The retained successful API 65 Other experiment used the same core metadata.read
seam with scalar input. No new live execution was needed here.

Common joined projection and buildDmoCreateRequestFromDocument both run before success.
Return value retains complete independent expectations, create identity and
qualifier binding; no detached candidate or create request is returned instead.
Acquisition errors have payload-free diagnostics; failures never return a partial
projection. Existing ConnectError/DmoDocumentError remain intact; other failures
become DmoRetrieveError with ACQUISITION_FAILED. INVALID_SCOPE and
INVALID_METADATA identify rejected scope or decoded record cardinality/identity.
Incomplete variants expose a specific projector blocker (missing Engagement event
is preferred when present), not a candidate. No snapshot consistency, authenticity
of arbitrary JSON, general category acceptance, request execution or mutation is
claimed. Existing module paths remain unchanged; common export names replace the
unpublished narrow service/writer names without compatibility aliases.

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
contract resolves object create identity; the bounded API 65 Other replay above
independently resolves preservation of the exact authored nested field names.
Neither establishes general version-specific runtime acceptance. The wider object schema also
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
