# Artifact formats

## Public Ingestion API DLO document

Exact `ingestion-dlo:Name__dll` writes
`<package>/main/default/data360/ingestionDlos/Name__dll.ingestionDlo.json`, with
`force-app` as the default package. The strict JSON shape is `schemaVersion:1`,
`kind:ingestion-dlo`, `identity:{dataSpace:default,apiName:Name__dll}` and
`spec:{connectionName,event:{name,label,fields:[{name,label,dataType:Text}]}}`.
Event field names are unsuffixed source names; the existing DLO identity is the
actual returned API name, not a derivation from connection/event names. Logical
connection identity is portable configuration, not proof that another target has
compatible ownership or provisioning. Runtime/generated IDs and raw responses
remain private. Unknown keys and unsupported event/field variants are rejected.

The writer uses bounded no-link/single-link paths and OS-temp staging, no-clobber
publication and guarded overwrite. Input admission rejects duplicate JSON keys,
noncanonical paths, identity mismatch and duplicate component aliases; recursively
frozen content is bound to exact SHA256 bytes. Explicit file/selector and Git routes
revalidate the same input. The only admitted edit is one additional Text field,
with all prior configuration preserved; no XML companion or request file is needed.

## Public Graph document

Exact `data-graph:ApiName` retrieval writes
`force-app/main/default/data360/dataGraphs/ApiName.dataGraph.json`; the configured
package directory replaces `force-app`. The single JSON document uses
`schemaVersion: 1`, `kind: data-graph`, exact default-space `identity.apiName` and
complete qualified `spec`: label, description, logical unified Individual root,
NONE type, seven-day full-refresh schedule, incremental disabled, and root source
with empty path/relatedObjects and ordered Text Id key/FirstName/optional appended
LastName. `sourceObject.devName` is the logical input root, not a generated GET name.

`creationMode` is request-only and forbidden in portable content. Omitted GET mode
is not synthesized or recovered from historical receipts. A returned mode is
inspected explicitly: only DEFAULT is admitted; null, DRAFT and unknown values
block. This does not establish universal historical-mode preservation. The qualified
existing-owner update omits mode entirely and allows only the exact LastName append.
Full computed GET/transform bodies and owner/node/field/output IDs stay private.
Unknown meaningful root/node/field/config properties block instead of being dropped.

Writer publication uses no-link paths, bounded single-link reads, owned OS-temp
staging, no-clobber publication and guarded overwrite. Identical bytes are unchanged.
File and Git admission bind strict unique-key JSON, canonical identity/path and
frozen document content to a SHA256 digest, rechecked before target reliance and
writes. No XML pair, request envelope, persistent receipt or generated identifiers
are exported. Create, reverse projection, nesting and settings changes remain blocked.

## Public calculated insight pairs

For exact `calculated-insight:Name__cio`, retrieve publishes independent standard
source XML at `force-app/main/default/mktCalcInsightObjectDefs/Name.mktCalcInsightObjectDef-meta.xml`
and a versioned companion at
`force-app/main/default/data360/calculatedInsights/Name__cio.calculatedInsight.json`.
Configured package directories replace `force-app`. The XML member omits `__cio`;
the JSON identity retains it. `schemaVersion: 1`, `kind: calculated-insight`, exact
default-space identity and complete qualified `spec` preserve SQL, schema and settings.
No runtime IDs/status/attribution or request envelopes enter portable content.

Either member or the exact selector resolves both; divergent SQL/label/identity,
missing/unsafe files, duplicate keys and meaningful unsupported fields block.
The length-prefixed SHA256 digest binds both original byte sequences; revalidation
checks byte and frozen-document identity before dispatch. Retrieve admits every
selected CI pair before publishing any selected output. The existing strict pair
writer preserves independent XML, overwrite/no-clobber/unchanged behavior and
partial-publication diagnostics. Standard XML is never predeployed to create or
convert a runtime owner. See the capability contract for the exact supported update.

## Public native DMO document

Exact `dmo:ApiName__dlm` retrieval writes
`<project-root>/data360/dmo/<ApiName>__dlm.dmo-meta.json`. The full API name,
including `__dlm`, is kept in the filename and in the identity. This is the only
DMO artifact format.

```json
{
  "schemaVersion": 1,
  "kind": "dmo",
  "identity": { "apiName": "Customer__dlm", "dataSpace": "default" },
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

- The document has exactly `schemaVersion: 1`, `kind: "dmo"`, `identity` and `spec`.
- `identity` has exactly `apiName` (a letter, then letters, digits or underscores,
  ending `__dlm`) and a nonblank, trimmed `dataSpace`.
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
unchanged; a differing file requires `--overwrite`. A file saved for a different
data space is not replaced even with overwrite (`DMO_DATASPACE_COLLISION`). The
writer rejects linked paths and files above 1 MiB, stages the complete file under
the OS temp directory and publishes it by rename or exclusive hard link. Writer
codes: `UNSAFE_PATH`, `OVERWRITE_REQUIRED`, `OUTPUT_CHANGED`, `OUTPUT_FAILED`,
`PARTIAL_DMO_OUTPUT`.

### What deployment sends

- Object and field names are sent without their `__dlm` / `__c` suffix.
- `creationType`, `isDistinct`, `usageTag` and `keyQualifierName` are never sent.
- Generated fields (`DataSource__c`, `DataSourceObject__c`,
  `InternalOrganization__c`, names starting with `KQ_`, or `creationType: System`)
  are left out of a create. A definition may also omit them for an update; they
  are never removed.
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
- A mapping file (`data360/mapping/<MappingApiName>.mapping-meta.json`) may name a
  custom or a standard DMO in `spec.targetEntityDeveloperName`. On a standard DMO the
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
- A data lake object file (`data360/dlo/<FullApiName>__dll.dlo-meta.json`) for an
  existing data lake object may omit the fields Salesforce generated:
  `cdp_sys_SourceVersion__c`, `DataSource__c`, `DataSourceObject__c`,
  `InternalOrganization__c`, `cdp_sys_PartitionDate__c` on Engagement data lake
  objects and the key qualifier of the primary key (`KQ_<Key>__c`, for example
  `KQ_Id__c`). They stay as they are, and retrieve leaves them out of the file; the
  field named by `eventDateTimeFieldName` is always saved. Any other field of the target that the file
  omits is refused (`UNSUPPORTED_DLO_FIELD_CHANGE`). A listed field is compared on
  the keys the file states: keys only the org's copy carries are ignored, and a
  stated key that differs is refused with the same code.
- The data lake object `spec` holds `label`, `category`, `fields` and, optionally,
  `eventDateTimeFieldName`: the full name (with `__c`) of one of the listed fields
  that dates each record. Engagement data lake objects need it; create sends it
  without the suffix and retrieval saves it. The category is sent as written and
  Salesforce decides. Neither the category nor the event field can change after
  create: a changed value is refused with `UNSUPPORTED_DLO_CATEGORY_CHANGE` or
  `UNSUPPORTED_DLO_EVENT_FIELD_CHANGE` before any write.

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
- `sf data360 delete -m dmo:<Name__dlm> --field <Field__c> --confirm-delete` removes
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
(`UNSUPPORTED_DMO_FIELD_ADDITION`), any deploy or delete of a platform-generated
DMO or of a custom DMO under a namespaced name, creating a namespaced DMO, and
deleting a standard DMO (`UNSUPPORTED_DMO_TARGET`).

Field removal is observed at API 68 on empty custom DMOs, unmapped and mapped by two
mappings, and on one standard DMO. Removing a data-bearing field is not verified.
Standard DMO writes are observed at API 68 through the plugin on one standard DMO in
two orgs, active in only one of them (add and relabel a custom field; remove it with
`--allow-field-removal` and with `delete --field`; object description set and
cleared); a category change, standard DMOs in active use and platform-generated DMOs
are not tested.

The values Salesforce accepted in live verification at API 68 (categories, field
data types, label length and key rules) are listed in the README's Public DMO
workflow. That verification used empty, unmapped custom DMOs in the default data
space. Data-bearing DMOs, non-default data spaces, other API versions,
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
  "identity": {
    "apiName": "Order_CustomerId_map_Customer_Id_1794467679481",
    "dataSpace": "default"
  },
  "spec": {
    "sourceObjectName": "Order__dlm",
    "sourceFieldName": "CustomerId__c",
    "targetObjectName": "Customer__dlm",
    "targetFieldName": "Id__c",
    "cardinality": "ManyToOne",
    "relationshipOwner": "DataCloud"
  }
}
```

Shape checks:

- The document has exactly `schemaVersion: 1`, `kind: "relationship"`, `identity`
  and `spec`; `identity` has exactly `apiName` (a letter, then letters, digits or
  underscores) and a nonblank, trimmed `dataSpace`.
- `spec` has exactly the six keys shown. Object names end `__dlm`, field names end
  `__c`. `cardinality` and `relationshipOwner` are nonblank strings sent as written;
  Salesforce decides which values it accepts.
- The file name must equal `identity.apiName` and the file must sit in a
  `data360/relationship/` folder. Shape failures are reported as
  `INVALID_RELATIONSHIP_DOCUMENT`.

Salesforce generates the relationship name (the example's shape). Retrieval saves
that name and the six authored values; the id, labels, status and creation type are
not saved. A hand-written file may use any valid name, because deploy finds the
relationship by its binding: source object and field, target object and field. Two
files with the same binding in one command are refused (`DUPLICATE_IDENTITY`).
Delete uses the file to learn the source DMO, and the selector name must be the
org's relationship name; if the binding exists only under another name, delete
refuses with `RELATIONSHIP_NAME_MISMATCH` and names it.

The file is indented with two spaces and ends with LF. Identical bytes are
unchanged; a differing file requires `--overwrite`, and a file saved for a different
data space is not replaced (`RELATIONSHIP_DATASPACE_COLLISION`). Writer codes:
`UNSAFE_PATH`, `OVERWRITE_REQUIRED`, `OUTPUT_CHANGED`, `OUTPUT_FAILED`,
`PARTIAL_RELATIONSHIP_OUTPUT`.

## Local files after delete

After a confirmed deletion, `sf data360 delete` removes the deleted component's local
file: on the outcome `deleted` (mutation `confirmed-deleted`) and on
`deletion-processing` (mutation `acknowledged-processing`, Salesforce accepted the
deletion and is finishing it). Removed are the files under `data360/` in the current
directory for `dlo`, `dmo` and `relationship`, and `data-stream` (with
`--delete-dlo` also the linked data lake object's file); for a mapping the file of
that name or the hand-written file whose binding matches; and for a data transform,
segment, identity resolution, data graph or calculated insight the `--source-dir`
file (both members of a calculated insight pair). When `--source-dir` names a folder,
nothing is removed for that family and a warning says so. Mapping files of mappings
Salesforce removes together with a deleted DMO are not removed, because those
mappings are not items of the command.

Each file is removed on its own with one unlink. Only regular files are removed:
directories, symbolic links, junctions, files reached through a linked folder and
hard-linked files are refused (`UNSAFE_PATH`), as is any path outside the project's
`data360` folder or other than the exact `--source-dir` file. Each result item lists
`removedLocalFiles` with an outcome per file: `removed`, `not-present`, `kept` or
`failed`. A failed removal keeps the confirmed org result, and the command exits
nonzero with `LOCAL_FILE_REMOVAL_FAILED`. `--keep-local-files` keeps every file
(outcome `kept`). `--preview` removes nothing and lists the files as `localFiles` with
`exists`. The outcomes unchanged, blocked, failed, unknown, rejected and
deletion-unconfirmed remove
nothing. `delete --field` removes no file; it refreshes the DMO and mapping files.
