# Artifact formats

## Public Graph document

Retrieve writes each data graph as `data360/dataGraphs/Name.native-dataGraph.json` at the
project root: `schemaVersion: 1`, `kind: native-data-graph`, `apiVersion: 68.0`, the
graph's data space in `c__dataSpace` and the `definition` as the API 68 GET returns it
(name, label, description, data space, root object, type, schedules, real-time settings, and
the root node with its fields, joins (`path`) and related objects), without server facts such
as IDs, status and dates. The file name must equal `definition.name`.

`c__dataSpace` must equal `definition.dataspaceName` when the definition names it
(`INVALID_DATASPACE_FIELD` otherwise); a definition without `dataspaceName` takes it from
`c__dataSpace`, and the create sends it. The file's data space must be the run's
(`--dataspace`, `default` when omitted; `DATA_GRAPH_DATASPACE_MISMATCH` otherwise, also for an
org graph of that name in another data space: graph names are unique in the org). Object
names are the names Salesforce stores in that data space (`ds2_Individual__dlm` for a
standard DMO copy outside `default`).

Deploy treats the file as the desired state of an existing graph. Fields and related objects
are sent as the file lists them, so a field or related object the file leaves out is not
sent; Salesforce decides and, at API 68, refuses removals, a root change and another related
object in place of an existing one with 400, reported as rejected. Key-qualifier fields that
Salesforce added (`KQ_` fields named by another field's `keyQualifierName`) are kept when
the file leaves them out. Generated names (node and field `devName`, join `devName`,
`fragmentDMOName` and the graph's generated DMO, mapping and transform names) are taken
from the org for objects it already holds and left out for new ones. Omitted settings keep
the org values. The plugin refuses, before any write, a join change of an existing related
object (`DATA_GRAPH_JOIN_CHANGE`: Salesforce accepts it but keeps the old join) and a
different type, reference or projected name of an existing node (assigned by Salesforce).
A node's `type` may be left out: a create then sends none and Salesforce assigns it, and an
update keeps the org value. The name and the data space identify the graph; a file with
another name addresses another graph.

## Public identity resolution file

Retrieve writes each ruleset as
`data360/identityResolution/<Name>.identityResolution.json` at the project root:
`schemaVersion: 1`, `kind: identity-resolution`, the ruleset's data space in `c__dataSpace`,
`identity: {apiName}` and `spec` with the configuration. Its references (the secondary DMO,
the match and reconciliation entities and fields, the DLO sources and the unified and link
outputs) carry no data space: they are all in the ruleset's data space and named as
Salesforce stores them there. Outside `default` that is `<prefix>_<type>_<rulesetId>` for the
ruleset (`ds2_Individual_cx2a`), `ds2_Individual__dlm` with `FirstName__c` for a standard DMO
copy and its fields. The old `identity.dataSpace` and a `dataSpace` key in a reference are
refused (`LEGACY_DATASPACE_KEY`). The file's data space must be the run's
(`IDENTITY_RESOLUTION_DATASPACE_MISMATCH` otherwise, also for an org ruleset of that name in
another data space), and a non-default file whose name lacks the prefix of the org's data
space list is refused before any write (`IDENTITY_RESOLUTION_NAME_NOT_STORED`).

## Public calculated insight files

Retrieve writes each calculated insight as
`data360/calculatedInsights/Name__cio.calculatedInsight-meta.json` (the API 68 GET body,
key names and enums as returned, without status, run and derived fields) and
`data360/calculatedInsights/Name__cio.calculatedInsight-meta.sql` (the expression as
plain SQL, ending with one LF), under the project root. Trailing line breaks of the SQL
file are not part of the `expression` that deploy sends and compares.

The JSON names the insight's data space in the top-level `c__dataSpace` string instead of
Salesforce's `dataSpace` key: retrieve checks that the GET names the run's data space and
writes it there, and deploy sends it as `dataSpaceName`. A file that still has `dataSpace`
is refused (`LEGACY_DATASPACE_KEY`), a missing or blank `c__dataSpace` is
`INVALID_DATASPACE_FIELD`, and one that is not the run's data space (`--dataspace`,
`default` when omitted) is `CI_DATASPACE_MISMATCH`.

Deploy, publish and delete read the same two files. Either file or the exact selector
selects the insight; the JSON is joined with exactly its SQL file. A missing JSON or
SQL file, an `expression` kept in the JSON, any other `Name__cio.calculatedInsight-meta.*`
file beside them, duplicate keys, a name that differs from the file name, links and
hard links block. A length-prefixed SHA256 digest binds the bytes of both files;
revalidation checks bytes and the frozen document before dispatch. Any key, status,
schedule and SQL is admitted; deploy sends the document as written (input key names and
enum forms translated, an unchanged `definitionType` left out of a PATCH) and Salesforce
decides.

## Public segment files

Retrieve writes each segment as
`data360/segments/<Name>.segment.json` at the project root (identity, label,
description, segment type, `segmentOn` DMO, lookback, an optional `schedule`, and the list
of model names) and one `<Name>.segment.<model>.sql` per model beside it (that model's
`sql`, plain text, bytes as returned). A UI segment holds its criteria as a JSON object in
`includeCriteria` instead of models; other types (for example Waterfall or Dynamic) hold
neither, and the lookback only when the segment has one. A Waterfall holds its child
segments as `childSegments`, a list of segment API names in priority order (Salesforce
stores definition IDs; retrieve names them, deploy sends the IDs of the target org). A
file without `childSegments` leaves the children of the org segment alone; an empty list
is refused (`INVALID_SEGMENT_DOCUMENT`). `schedule` is the refresh
schedule in the shape the write takes (`frequency`, `interval`, `daysOfWeek` as a list,
`startDateTime`, `endDate`, `endDateTime`, optional `time` with `hour`, `minute` and
`timeZone`, or an hourly `publishInterval` when the read has no schedule details);
retrieve leaves it out for a segment that does not refresh, and `nextScheduledDate` is not
kept. On deploy, a file without `schedule` leaves the org schedule alone; one with it is
sent when a key it states differs from the org schedule (keys it leaves out keep their org
value), and `{"frequency": "None"}` turns it off.
The top-level `c__dataSpace` string names the segment's data space (the old
`identity.dataSpace` and `spec.segmentOn.dataSpace` keys are `LEGACY_DATASPACE_KEY`); the
`segmentOn` DMO and every Waterfall child are in that data space. `identity.apiName` and the
file name are the name Salesforce stores: `<prefix>_<Name>` in a non-default data space
(`ds2_Spring` in `dataspace2`), sent unchanged as `developerName` on create (Salesforce keeps a
name that has the prefix); a file there without the prefix is `SEGMENT_NAME_NOT_STORED`, and a
file of another data space than the run's is `SEGMENT_DATASPACE_MISMATCH`.
The file holds no `parameters` (the API has no write for them). A model name must start with a letter or digit and hold only
letters, digits and underscores, and two model names may not differ only in case; another
name is refused with `INVALID_SEGMENT_DOCUMENT`. A repeat retrieve of an unchanged segment
writes nothing (`unchanged`); with `--overwrite`, the SQL file of a model the segment no
longer has is removed.

Deploy, delete and `--changed-since` read the same files. The JSON or any of its SQL files,
or the exact selector, selects the segment; the JSON is joined with exactly one SQL file
per model. A missing JSON or SQL file, a `sql` kept in the JSON, any other
`<Name>.segment.*` file beside them, duplicate keys, a name that differs from the file
name, links and hard links block (`INVALID_SOURCE`). A length-prefixed SHA256 digest binds
the bytes of all files; revalidation checks bytes and the frozen document before dispatch.

## Public data transform document

Retrieve writes each data transform as `data360/dataTransforms/<Name>.dataTransform.json`
under the project root, for custom, system and packaged transforms alike:

```json
{
  "apiVersion": "68.0",
  "c__dataSpace": "default",
  "definition": { "name": "Name", "label": "…", "type": "BATCH", "definition": { "…": "…" } },
  "kind": "data-transform",
  "schedule": {
    "frequency": "Daily",
    "interval": 1,
    "time": { "hour": 3, "minute": 15, "timeZone": "GMT" }
  },
  "schemaVersion": 1
}
```

`c__dataSpace` names the transform's data space and must agree with `definition.dataSpaceName`
when the definition names one (`INVALID_DATASPACE_FIELD` otherwise; kept and sent as written). A
transform whose GET has no `dataSpaceName` takes its data space from its MktDataTransform record
(SOQL); one without any data space there (a system transform) is in `default` only. A file of
another data space than the run's, or one whose name the org holds in another data space, is
`TRANSFORM_DATASPACE_MISMATCH`.

`definition` is the native create/update input as the API 68 GET returns it, without
server-owned keys, the schedule inside a definition, or the server-owned keys of each
output object. `schedule` is the schedule GET projected onto the keys its PUT takes:
`frequency`, `interval`, `daysOfWeek`, and `time` with `hour`, `minute` and `timeZone`
(from `time.timezone.zoneId`); `nextScheduledDate` and `type` are left out. A file may add
the write-only `shouldForceSpecifiedMinutes`: the PUT takes it, the GET never returns it,
and it is not compared. A transform that is never scheduled or turned
off gets no `schedule` key, so a deploy of the file leaves the target org's schedule alone. A system transform's per-definition map
(`{ "schedule": { "<Day0Name>": { … } }, "type": "Transform" }`) keeps the map with each
entry projected the same way and without the outer `type`. When the schedule read fails,
the file has no `schedule`, with a warning.

`schedule` is optional. Without it, deploy leaves the org schedule alone. With it, deploy
compares it with the org's projected schedule (frequency ignoring letter case,
`shouldForceSpecifiedMinutes` not compared) and, when it differs, sends it as written with
`PUT …/data-transforms/{name}/schedule`, then reads it back (it must have the file's
frequency). After a definition write it first waits, at most 5 minutes, until the transform
is no longer `PROCESSING` (`TRANSFORM_SCHEDULE_NOT_SENT` otherwise);
`TRANSFORM_SCHEDULE_REJECTED` reports Salesforce's refusal of that schedule PUT. `{ "frequency": "None" }`
turns the schedule off. A schedule that is not an object is refused
(`UNSUPPORTED_TRANSFORM_INPUT`). A schedule copied to another org makes the transform run
there (`TRANSFORM_SCHEDULE_CHANGE`).

## Public data stream document

Retrieve writes each data stream as `data360/data-stream/<ApiName>.data-stream-meta.json`
in one of two shapes, both with `schemaVersion: 1`, `kind: "data-stream"`, the top-level
`c__dataSpace` (every data space of the landing DLO, sorted, read from the DLO) and
`identity: {apiName}`. The list only mirrors the DLO: deploy refuses a list without the run's
data space, one that differs from the DLO's data spaces, and, for a new stream (whose create
puts the DLO into the run's data space), more than one entry (`STREAM_DATASPACE_MISMATCH`).
The old `identity.dataSpace` is refused (`LEGACY_DATASPACE_KEY`).

- **Ingestion API stream:** `spec` holds `connectorType` (`IngestApi`), `connectionName`,
  `event`, `datastreamType` (`INGEST_API`), `refreshMode`, `label`, `newDlo` (`name`,
  `label`, `category` when the DLO has one, `eventDateTimeFieldName`, `primaryKey`),
  `additiveFieldMappings` (`sourceFieldLabel`, `targetFieldName` without `__c`,
  `targetFieldReturntype`) and `formulaMappings` (`targetFieldName`, `formula` plain,
  `targetFieldReturntype`), plus the read-only `observed` section.
- **Any other connector** (Salesforce CRM `SalesforceDotCom` tested live; others such as
  S3 untested): `spec` is the stream GET without server-owned keys, system fields and
  system mappings, with `connectorInfo.connectorType` naming the connector. Its
  `dataLakeObjectInfo.dataSpaceInfo` (Salesforce's own list) must name the same data spaces
  as `c__dataSpace` (`STREAM_DATASPACE_MISMATCH`); deploy fills it from `c__dataSpace` when
  the file leaves it out.

Create and update send the file as written and Salesforce decides; its 4xx answer to the
first write is reported as rejected, and a failure after an earlier write as unknown. Of
the Ingestion API file, the plugin itself refuses only an additive mapping whose
`sourceFieldLabel` names no event field, or several (`UNSUPPORTED_STREAM_MAPPING_SOURCE`:
Salesforce stores it unchecked as a mapping that never carries data), and a change of
`refreshMode`, the DLO label, category, event time field or primary key of an existing
stream (`UNSUPPORTED_STREAM_SETTINGS_CHANGE`: Salesforce answers 200 and keeps the old
value). A mapping left out of the file is sent as a removal (an empty formula). Of the
other-connector file, a plain mapping change is refused (`UNSUPPORTED_STREAM_SETTINGS_CHANGE`):
the stream update takes no `sourceFieldName`.

## Public native DMO document

Exact `dmo:ApiName__dlm` retrieval writes
`<project-root>/data360/dmo/<ApiName>__dlm.dmo-meta.json`. The full API name,
including `__dlm`, is kept in the filename and in the identity. This is the only
DMO artifact format.

```json
{
  "schemaVersion": 1,
  "kind": "dmo",
  "c__dataSpace": "default",
  "identity": { "apiName": "Customer__dlm" },
  "spec": {
    "label": "Customer",
    "category": "Profile",
    "description": "Customer master records",
    "fields": [
      { "name": "CustomerId__c", "label": "Customer Id", "dataType": "Text", "isPrimaryKey": true },
      { "name": "SignupDate__c", "label": "Signup Date", "dataType": "Date", "isPrimaryKey": false }
    ]
  }
}
```

### Shape checks

The plugin validates the shape only:

- The document has exactly `schemaVersion: 1`, `kind: "dmo"`, `c__dataSpace`, `identity`
  and `spec`.
- `c__dataSpace` is the DMO's data space: a nonblank, trimmed name. It must be the run's
  data space (`--dataspace`, `default` when omitted; `DMO_DATASPACE_MISMATCH` otherwise).
  The old `identity.dataSpace` key is refused (`LEGACY_DATASPACE_KEY`); any other invalid
  value is `INVALID_DATASPACE_FIELD`.
- `identity` has exactly `apiName` (a letter, then letters, digits or underscores,
  ending `__dlm`). In a non-default data space it is the name Salesforce stores there: a
  standard DMO copy is `<prefix>_<Name>__dlm` (`ds2_Individual__dlm`) with fields without
  `ssot__`, and a custom DMO keeps its own name.
- `spec` needs a nonblank `label`, a nonblank `category`, an optional string
  `description` and a nonempty `fields` array. Other `spec` keys are allowed.
- Each field needs a `name` ending `__c` that is unique regardless of case, a
  nonblank `label`, a nonempty string `dataType` and a boolean `isPrimaryKey`. Other
  field keys are allowed, except the runtime keys `id`, `recordId`, `recordID`,
  `createdDate`, `lastModifiedDate`, `isEnabled`, `isEditable`, `isSegmentable`,
  `status` and `type`.

Shape failures are reported as `INVALID_DMO_DOCUMENT` or `INVALID_DMO_FIELD`. There
is no allowlist for categories, data types, label length, the number of primary
keys or extra keys. Those values are sent as authored and Salesforce decides.

### What retrieval saves

- The object label, category, a nonempty description and all returned fields.
  The category is saved in the input spelling (`Profile`, `Engagement`, `Other`),
  although reads return upper case.
- The field `type` returned by reads is saved as `dataType`. A missing
  `isPrimaryKey` is saved as `false`. The runtime keys listed above are dropped.
- Generated fields are left out: fields read as `creationType` `System`, the
  system fields `DataSource__c`, `DataSourceObject__c` and
  `InternalOrganization__c`, and names starting with `KQ_`. A primary key is always
  saved, and so are the standard fields of a standard DMO. Keys that only reads
  return (`creationType`, `isDistinct`, `usageTag`, `keyQualifierName`) are kept.
- Record IDs and other runtime observations of the object are not saved.

The file is indented with two spaces and ends with LF. Identical bytes are
unchanged; a differing file requires `--overwrite` (DMO names are unique in the org,
so the file at the path is the same DMO whatever data space it names). The
writer rejects linked paths and files above 1 MiB, stages the complete file under
the OS temp directory and publishes it by rename or exclusive hard link. Writer
codes: `UNSAFE_PATH`, `OVERWRITE_REQUIRED`, `OUTPUT_CHANGED`, `OUTPUT_FAILED`,
`PARTIAL_DMO_OUTPUT`.

### What deployment sends

- Object and field names are sent without their `__dlm` / `__c` suffix.
- `creationType`, `isDistinct`, `usageTag` and `keyQualifierName` are never sent. A
  file value that differs from the org is reported with the warning
  `DMO_FIELD_KEY_NOT_SENT`; the outcome stays `created`, `updated` or `unchanged`.
- Generated fields (`DataSource__c`, `DataSourceObject__c`,
  `InternalOrganization__c`, names starting with `KQ_`, or `creationType: System`)
  are left out of a create. A definition may also omit them for an update; a deploy
  never removes them (`delete --field` does on request).
- An absent `spec.description` is not managed: an update leaves the target value as
  is. An explicit empty string clears it.
- Field `description` and `isDynamicLookup` are accepted by the API but never
  returned by reads, and a field description does not appear in the Data Model UI.
  They are sent when a field is created or otherwise edited; a change to them alone
  cannot be detected or confirmed.
- An update sends the object label, a changed description, a changed category
  (Salesforce rejects category changes), changed extra `spec` keys, and the edited
  and added fields.
- A standard DMO (`creationType` `Standard` in the target, for example
  `ssot__Brand__dlm`) uses the same file. An update sends only the edited and added
  custom fields, the label when it differs, a changed description and changed extra
  `spec` keys. `spec.category` is required by the file shape but ignored: it is
  never sent or compared. Standard and system fields may be left out of
  `spec.fields`; one that is listed must equal the target (`isMapped` and
  `keyQualifierName` are not compared), otherwise the deploy is refused with
  `UNSUPPORTED_DMO_FIELD_CHANGE`. A new field must be a plain custom field: no double
  underscore before `__c` and no `creationType` other than `Custom`
  (`UNSUPPORTED_DMO_FIELD_ADDITION`).
- A mapping file (`data360/mapping/<MappingApiName>.mapping-meta.json`) holds
  `schemaVersion` 1, `kind` `mapping`, the top-level `c__dataSpace` (the mapping's data
  space, which must be the run's: `MAPPING_DATASPACE_MISMATCH` otherwise;
  `LEGACY_DATASPACE_KEY` for the old `identity.dataSpace`), `identity` with `apiName`
  only, and `spec`. Mapping names are unique in the org, so the file at the path is the
  same mapping whatever data space it names (`--overwrite` replaces it). It may name a
  custom or a standard DMO in `spec.targetEntityDeveloperName`, under the name Salesforce
  stores in the mapping's data space (`ds2_ContactPointEmail__dlm` with `EmailAddress__c`
  for a standard DMO copy in `dataspace2`). The first mapping onto a standard DMO copy that
  does not exist yet is sent once more in the default spelling when Salesforce answers the
  copy spelling with 404 (see [mapping reference](types/mapping.md)). On a standard DMO the
  authored pairs use the standard field names (for example `Id__c` to `ssot__Id__c`)
  and the generated pairs read `DataSource__c` to `ssot__DataSourceId__c`,
  `DataSourceObject__c` to `ssot__DataSourceObjectId__c`, `InternalOrganization__c`
  to `ssot__InternalOrganizationId__c` and `KQ_Id__c` to `KQ_Id__c`; on a custom DMO
  the generated pairs are same-name. Retrieve saves the authored pairs only and deploy
  never sends generated pairs. Both decide which pairs are generated with one rule,
  from fresh reads of the source data lake object and the target DMO, so a pair that
  retrieve leaves out is never read as a removal. When those reads fail, retrieve
  refuses the mapping with `MAPPING_GENERATED_PAIRS_UNPROVEN` and writes nothing for
  it. The authored key pair is always saved. A file may list only the authored pairs, for a create and for a
  deploy onto the existing mapping alike: the generated pairs are taken from the
  org's copy and treated as part of the file. The authored primary-key pair must stay
  in the file (`MAPPING_PROTECTED_PAIR_REQUIRED`). A deploy removes every authored
  pair that the file no longer lists, including a pair onto a standard field; the
  generated pairs and the key pair (source primary key onto target primary key, any
  name and type) stay in the mapping. Pairs are sent as the file lists them, whatever
  their data types and names, one source onto several targets and targets another
  mapping also holds; Salesforce decides. Pairs whose data types differ get the
  preview notice `MAPPING_FIELD_TYPES_DIFFER`. Salesforce requires a pair joining the
  two primary keys when a mapping is created.
  `sf data360 delete -m mapping:<MappingApiName>` deletes a mapping whatever pairs it
  holds and then removes its local file (see Local files after delete). Only the last mapping of a custom DMO is refused
  (`MAPPING_LAST_MAPPING_DELETE_BLOCKED`); delete the DMO instead. Creating the first mapping onto a standard
  DMO that is not yet enabled activates it permanently; preview and create report
  `MAPPING_ACTIVATES_STANDARD_DMO`. A pair may be removed from a mapping file even
  when another mapping targets the same field. Observed at API 68 through the plugin:
  a mapping created onto an already active standard DMO from a file with two authored
  pairs, the retrieved file deploying back unchanged, the activation notice in a
  preview, a first mapping created onto an inactive standard DMO, a pair onto a
  standard field removed by deploying the retrieved file without it, the removal
  of a field shared by two mappings of a custom DMO, and hand-written mapping files
  with the authored pairs only deploying back unchanged onto a custom and a standard
  DMO, one of them adding a pair and dropping another.
  The optional `spec.label` is the mapping's label (Metadata API `masterLabel` of
  `ObjectSourceTargetMap`, which the native routes do not carry). Retrieve fills it,
  except when it equals the mapping's own name (the default Salesforce gives a mapping
  created without one) or when its Metadata API read fails (then with a warning). A
  file without `spec.label` leaves the org's label alone; a different label is set by
  one Metadata API `updateMetadata` after the pair writes, carrying every pair the
  mapping currently has and no other (a pair left out is kept, a pair sent is added).
- A data lake object file (`data360/dlo/<FullApiName>__dll.dlo-meta.json`) for an
  existing data lake object may omit the fields Salesforce generated:
  `cdp_sys_SourceVersion__c`, `DataSource__c`, `DataSourceObject__c`,
  `InternalOrganization__c`, `cdp_sys_PartitionDate__c` on Engagement data lake
  objects and the key qualifier `KQ_<Name>__c` of another field (`KQ_Id__c` for the
  primary key, `KQ_RefId__c` for a relationship source field). They stay as they
  are, and retrieve leaves them out of the file; the fields named by
  `eventDateTimeFieldName` and `recordModifiedFieldName` are always saved. Any other field of the target that the file
  omits is refused (`UNSUPPORTED_DLO_FIELD_CHANGE`). A listed field is compared on
  the keys the file states: keys only the org's copy carries are ignored, and a
  stated key that differs is refused with the same code.
- A data lake object file holds `schemaVersion` 1, `kind` `dlo`, the top-level key
  `c__dataSpace` (every data space the DLO belongs to: a list of names sorted by name, at
  least one, none repeated), `identity` with `apiName` only, and `spec`. The old
  `identity.dataSpace` key is refused (`LEGACY_DATASPACE_KEY`); a filtered membership
  `{ "name": …, "filter": … }` is recognised but refused until a filter is proven live
  (`UNSUPPORTED_DATASPACE_FILTER`); any other invalid value is `INVALID_DATASPACE_FIELD`.
  The list must hold the run's data space (`--dataspace`, `default` when omitted;
  `DLO_DATASPACE_MISMATCH` otherwise). Deploy adds the DLO to listed data spaces it is not
  in, and removes it from unlisted ones only with `--allow-dataspace-removal`.
- The data lake object `spec` holds `label`, `category`, `fields` and, optionally,
  `eventDateTimeFieldName`: the full name (with `__c`) of one of the listed fields
  that dates each record. Engagement data lake objects need it; create sends it
  without the suffix and retrieval saves it. The category is sent as written and
  Salesforce decides. Neither the category nor the event field can change after
  create: a changed value is refused with `UNSUPPORTED_DLO_CATEGORY_CHANGE` or
  `UNSUPPORTED_DLO_EVENT_FIELD_CHANGE` before any write.
- The data lake object `spec` may also hold `recordModifiedFieldName`, the full name
  (with `__c`) of the field that marks the newest version of a record. Create sends
  it without the suffix; an update sends it only when it differs from the org, and
  Salesforce decides (it sets the field on a DLO without one and refuses a change once
  one is set). The data model object file never holds `isSegmentable`: Salesforce
  derives it and rejects it as input.

- A custom field that exists in the target and is missing from the file is a
  removal. `sf data360 deploy --allow-field-removal` removes such fields with one
  Metadata API destructive change for `CustomField`
  `<ObjectName>__dlm.<FieldName>__c`, after the PATCH for other changes. The
  primary-key field must stay in the file. A field that is currently mapped is
  removed only when the same command also deploys every
  `data360/mapping/<MappingApiName>.mapping-meta.json` file whose mapping holds a
  pair with that `targetFieldDeveloperName`, with the pair removed from the file.
  The removal runs in the DMO position; Salesforce drops the field's pairs with it,
  and those mapping files deploy afterwards and find the pairs already gone.
  Otherwise the deploy is refused with `DMO_FIELD_REMOVAL_MAPPED` before any write,
  naming those files and the single command.
- `sf data360 delete -m dmo:<Name__dlm> --field <Field__c>` removes
  named custom fields in the org with one destructive change (Salesforce drops their
  mapping pairs with them), then overwrites this file
  and the `data360/mapping/<MappingApiName>.mapping-meta.json` file of every mapping
  that lost a pair with the current definition. Only files that already exist under
  `--output-dir` (default: current directory) are refreshed in the same form retrieve
  writes; none is created or removed.
- The `isMapped` marker on a field is saved as retrieved but describes the mapping,
  not the DMO: it is never sent, compared or required.

Refused before any write: changing an existing field's `dataType` or
`isPrimaryKey`, omitting a custom field that exists in the target without
`--allow-field-removal`, omitting the target's primary-key field
(`UNSUPPORTED_DMO_FIELD_CHANGE`), adding a generated field or a second primary key
(`UNSUPPORTED_DMO_FIELD_ADDITION`) and creating a namespaced DMO
(`UNSUPPORTED_DMO_TARGET`). A whole-DMO delete is sent for every DMO, standard ones
included, and Salesforce decides. Every DMO other than a standard one and an
unprefixed custom one (platform-generated and namespaced DMOs included) is written
like a standard DMO, and Salesforce decides the rest.

Field removal is observed at API 68 on empty custom DMOs, unmapped and mapped by two
mappings, and on one standard DMO. Removing a data-bearing field is not verified.
Standard DMO writes are observed at API 68 through the plugin on one standard DMO in
two orgs, active in only one of them (add and relabel a custom field; remove it with
`--allow-field-removal` and with `delete --field`; object description set and
cleared); a category change and standard DMOs in active use are not tested. Writes to
platform-generated DMOs are observed at API 68 through the raw API.

The values Salesforce accepted in live verification at API 68 (categories, field
data types, label length and key rules) are listed in the [DMO reference](types/dmo.md).
That verification used empty, unmapped custom DMOs in the default data space.
Data-bearing DMOs, non-default data spaces, other API versions,
relationships and SQL/flex DMOs are not qualified.

DMOs use only `data360/dmo/<ApiName>__dlm.dmo-meta.json`.

## Public native relationship document

`sf data360 retrieve -m relationship:<Dmo__dlm>` writes one file per relationship
whose source is that DMO, at
`<project-root>/data360/relationship/<Name>.relationship-meta.json`.

```json
{
  "schemaVersion": 1,
  "kind": "relationship",
  "c__dataSpace": "default",
  "identity": {
    "apiName": "Order_CustomerId_map_Customer_Id_1794467679481"
  },
  "spec": {
    "sourceObjectName": "Order__dlm",
    "sourceFieldName": "CustomerId__c",
    "targetObjectName": "Customer__dlm",
    "targetFieldName": "Id__c",
    "cardinality": "ManyToOne",
    "relationshipOwner": "DataCloud",
    "label": "Order to customer"
  }
}
```

Shape checks:

- The document has exactly `schemaVersion: 1`, `kind: "relationship"`, `c__dataSpace`,
  `identity` and `spec`; `c__dataSpace` is the relationship's data space (the run's,
  `UNSUPPORTED_RELATIONSHIP_DATASPACE` otherwise; `LEGACY_DATASPACE_KEY` for the old
  `identity.dataSpace`), and `identity` has exactly `apiName` (a letter, then letters,
  digits or underscores).
- `spec` has the six keys shown and may have `label` (a nonblank, trimmed text). The source object ends `__dlm` and the
  source field `__c`; the target object and field are any API names: a DMO and its
  custom field, or a CRM object and field with `relationshipOwner` `SObject` (for
  example `Account` and `Id`). `cardinality` and `relationshipOwner` are nonblank strings sent as written;
  Salesforce decides which values it accepts.
- The file name must equal `identity.apiName` and the file must sit in a
  `data360/relationship/` folder. Shape failures are reported as
  `INVALID_RELATIONSHIP_DOCUMENT`.

Salesforce generates the relationship name (the example's shape). Retrieval saves
that name, the six authored values and the label (the Metadata API `masterLabel`;
left out when there is no record); the id, object and field labels, status and
creation type are not saved. A hand-written file may use any valid name, because
deploy finds the relationship by the file's name and otherwise by its binding:
source object and field, target object and field. A file without `label` leaves the
org's label as it is. Other values than the org's are sent as one Metadata API
`updateMetadata` of the whole record; Salesforce decides which it accepts. Two
files with the same binding in one command are refused (`DUPLICATE_IDENTITY`).
Delete uses the file to learn the source DMO, and the selector name must be the
org's relationship name; if the binding exists only under another name, delete
refuses with `RELATIONSHIP_NAME_MISMATCH` and names it.

The file is indented with two spaces and ends with LF. Identical bytes are
unchanged; a differing file requires `--overwrite` (relationship names are unique in the
org). Writer codes:
`UNSAFE_PATH`, `OVERWRITE_REQUIRED`, `OUTPUT_CHANGED`, `OUTPUT_FAILED`,
`PARTIAL_RELATIONSHIP_OUTPUT`.

## Local files after delete

After a confirmed deletion, `sf data360 delete` removes the deleted component's local
file: on the outcome `deleted` (mutation `confirmed-deleted`) and on
`deletion-processing` (mutation `acknowledged-processing`, Salesforce accepted the
deletion and is finishing it). Removed are the files under `data360/` in the current
directory for `dlo`, `dmo` and `relationship`, and `data-stream` (with
`--delete-dlo` also the linked data lake object's file); for a mapping the file of
that name or the hand-written file whose binding matches; for a data transform
`data360/dataTransforms/<Name>.dataTransform.json` and for a calculated insight both
`data360/calculatedInsights/<Name>.calculatedInsight-meta.json` and
`.calculatedInsight-meta.sql` in the current directory; for a segment
`data360/segments/<Name>.segment.json` and every `<Name>.segment.*.sql` beside it; and for
an identity resolution or data graph its canonical file
(`data360/identityResolution/<Name>.identityResolution.json`,
`data360/dataGraphs/<Name>.native-dataGraph.json`), all in the current directory. Files are found by name at these paths; only the
segments folder is listed, for the segment's SQL files. Mapping files of mappings
Salesforce removes together with a deleted DMO are not removed, because those
mappings are not items of the command.

Each file is removed on its own with one unlink. Only regular files are removed:
directories, symbolic links, junctions, files reached through a linked folder and
hard-linked files are refused (`UNSAFE_PATH`), as is any path outside the project's
`data360` folder. Each result item lists
`removedLocalFiles` with an outcome per file: `removed`, `not-present`, `kept` or
`failed`. A failed removal keeps the confirmed org result, and the command exits
nonzero with `LOCAL_FILE_REMOVAL_FAILED`. `--keep-local-files` keeps every file
(outcome `kept`). `--preview` removes nothing and lists the files as `localFiles` with
`exists`. The outcomes unchanged, blocked, failed, unknown, rejected and
deletion-unconfirmed remove
nothing. `delete --field` removes no file; it refreshes the DMO and mapping files.
