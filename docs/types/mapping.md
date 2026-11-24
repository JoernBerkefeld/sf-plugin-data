# DLO-to-DMO mappings

A mapping connects the fields of one Data Lake Object ([dlo.md](dlo.md)) to the fields of one
Data Model Object ([dmo.md](dmo.md)): each pair says which DLO field fills which DMO field. The
plugin keeps the mapping as a list of field pairs and makes the org match that list. Deleting
a mapping removes it as a whole.

## Commands

- `sf data360 retrieve -m mapping:<Name>` saves one mapping; `-m mapping` saves every mapping of
  the data space.
- `sf data360 deploy -m mapping:<Name>` (or `--source-dir <file>`) creates a mapping or makes its
  pairs and label match the file.
- `sf data360 delete -m mapping:<Name>` deletes the whole mapping.
- Add `--preview` to `deploy` or `delete` to see the plan without writing anything.

```sh
sf data360 retrieve -o SOURCE_ALIAS -m mapping:ExactMappingName --json
sf data360 deploy -m mapping:CustomerMapping -m dmo:Customer__dlm -m dlo:CustomerSource__dll -o TARGET_ALIAS --preview --json
sf data360 deploy --source-dir ./data360/mapping/ExactMappingName.mapping-meta.json -o TARGET_ALIAS --json
sf data360 delete -m mapping:ExactTargetMappingName -o TARGET_ALIAS --preview --json
```

Default/`auto` uses API `68.0`; explicit numeric pins are preserved from `61.0` on, and
`latest` is not accepted. Pair removal and whole-mapping deletion work at the same versions.

## The file

Each mapping is one file, `data360/mapping/<name>.mapping-meta.json`, beneath `--output-dir`
(default: the current directory). It holds `schemaVersion: 1`, `kind: "mapping"`,
`c__dataSpace`, the logical `identity` and a `spec` with:

- the source DLO and target DMO developer names;
- `spec.fieldMappings`, the authored field pairs (`sourceFieldDeveloperName`,
  `targetFieldDeveloperName`, plus the field selectors retrieve saved);
- an optional `spec.label`.

Source record IDs and runtime values are not saved.

### Generated pairs and the key pair

Salesforce adds some pairs itself: three system pairs and the key-qualifier pair. On a custom
DMO they are same-name pairs (`DataSource__c`, `DataSourceObject__c`,
`InternalOrganization__c`, and `KQ_<Key>__c` for the source primary key, plus the key
qualifier of any other field the DMO names in `keyQualifierName`, such as `KQ_RefId__c` for a
relationship source field). On a standard DMO they target `ssot__DataSourceId__c`,
`ssot__DataSourceObjectId__c`, `ssot__InternalOrganizationId__c` and `KQ_Id__c`.

- Retrieve leaves the generated pairs out of the file; the authored key pair stays.
- Deploy takes the generated pairs from the org's copy and treats them as part of the file, so
  they are never sent and never removed. A file may list them or leave them out.
- Retrieve and deploy decide which pairs are generated with one rule, from fresh reads of the
  source DLO and target DMO, so a pair left out of a retrieved file is never read as a removal.
  When those reads fail, retrieve refuses the mapping with `MAPPING_GENERATED_PAIRS_UNPROVEN`
  and writes nothing for it.
- The key pair (source primary key onto target primary key, whatever their names and types, as
  the org's `isPrimaryKey` flags say) must stay in the file (`MAPPING_PROTECTED_PAIR_REQUIRED`).

## Retrieve

- A retrieve with no `-m` retrieves all types; `-m mapping` retrieves every mapping of the run's
  data space; exact selectors are sorted and deduplicated.
- `-m mapping` lists the mappings of up to six DMOs at once and reads up to six mappings at
  once; a source DLO or target DMO that several mappings name is read once per run. Files,
  items and diagnostics keep the name order.
- A mapping the inventory lists but whose read answers 404 was deleted during the retrieve: it
  is skipped with a warning (one named with `mapping:<Name>` still fails).
- `spec.label` is read with the Metadata API (`readMetadata` of `ObjectSourceTargetMap`, up to
  10 names per call), because the native routes carry no label. A label equal to the mapping's
  own name is Salesforce's default and is left out. When that read fails, the label is left out
  with a warning.
- Identical bytes are `unchanged`; a differing file is replaced. Other
  mappings still save when one fails, and the run exits nonzero.

## Deploy

Deploy takes exact selectors, files or directories, or `--changed-since`; bare types and
wildcards are refused.

### Order and parents

Native batches run DLO, then DMO, then mapping (then relationship), whatever the selector
order. Each parent is read back and settled before its mappings are written: a DLO must be
`ACTIVE` with its desired definition; a DMO GET has no status field, so its identity, schema,
key and other required properties are checked instead. If a preview depends on parents the
same selection only plans to create, it reports `planned-dependencies`
(`MAPPING_DEPENDENCIES_PLANNED`): the target is unknown and nothing is compared yet.

### Create

Creation looks up the exact DLO/DMO pair in the target and uses the mapping name Salesforce
generates, not the file's name; the created item reports that name as `targetApiName`. An
existing mapping that already equals the file is a zero-write repeat (`unchanged`).

Create and update send the pairs the file lists; Salesforce decides. The plugin applies no
local rule on field data types, source and target names, `KQ_` names, one source field mapped
onto several targets, or a target another mapping of the DMO also holds.

- A pair whose source and target data types differ is sent; the preview carries the
  non-blocking diagnostic `MAPPING_FIELD_TYPES_DIFFER`, naming `Source (Type) -> Target (Type)`.
- A pair naming a field that does not exist is refused with `MAPPING_FIELD_NOT_FOUND`, which
  names the pair, the missing field and its object.
- A new mapping without a pair joining the two primary keys is rejected by Salesforce with
  HTTP 400 `MISSING_ARGUMENT: Unable to find Primary Key of DLO in POST request of Mapping Creation`,
  reported as `MAPPING_HTTP_ERROR` with that detail. Add the key pair to the file.

### Update: the file is the desired pair set

On an existing mapping, `spec.fieldMappings` is the desired pair set:

- Authored pairs the file no longer lists are unmapped one by one, using fresh target
  selectors. Then new pairs are added in one names-only, selector-free PATCH.
- Any authored pair can be dropped, whatever its names, data type or target field (custom or
  standard); Salesforce decides whether the removal is accepted. The generated pairs and the
  key pair are never removed.
- To retarget a pair, replace it in the file with the new pair: deploy removes the old
  connection first, then adds the new one. This never changes the mapping's source DLO or
  target DMO.
- A pair is removed even when another mapping of the same DMO targets the same field; the
  field then stays `isMapped: true` until the last mapping has dropped its pair.
- When the key pair cannot be identified, removal is refused with
  `MAPPING_PROTECTED_LAYOUT_UNPROVEN` before any write, and so is a dropped pair onto a system or
  key-qualifier field that is not recognised as generated.
- All checks run before the first removal. Preview lists removals before additions and writes
  nothing. Final pairs, parents and inventory are read back; a partial or unknown result stops
  at once, without retry or rollback.
- Removing a pair removes the connection between the two fields, not the DMO field. To remove a
  mapped DMO field, see [Removing a mapped field](dmo.md#removing-a-mapped-field).

### Label

A file without `spec.label` leaves the org's label alone. When the label differs, or for a
mapping the deploy creates, deploy sends one Metadata API `updateMetadata` of the
`ObjectSourceTargetMap` record after the pair writes have settled. It carries the new
`masterLabel` and every pair the mapping currently has, and no other (a pair left out of that
update would be kept, a pair in it added). A `readMetadata` then confirms the label and the pairs
(`MAPPING_PERSISTENCE_UNCONFIRMED` otherwise).

- Preview shows the planned change as `labelChange` (`from`, `to`).
- Salesforce's refusal is `MAPPING_LABEL_UPDATE_REJECTED`: mutation `rejected` when the label
  was the only change, `unknown` after a create or pair write.
- A failed Metadata API read is `MAPPING_LABEL_READ_FAILED`; nothing is sent for the label.

### Standard DMO as target

Any DMO may be the target, for example the standard `ssot__Brand__dlm`, and Salesforce decides.
It refuses a mapping onto a DMO it generates for identity resolution or a data graph (400
`INVALID_INPUT` "Unsupported DMO Creation Type used for mapping"); that answer is reported.

- Authored pairs may target standard and custom fields of the DMO; one pair must join the two
  primary keys, for example `Id__c` to `ssot__Id__c`.
- A standard DMO that was never mapped reads `isEnabled: false` and category `UNASSIGNED`. Its
  first mapping enables it for good: its category becomes `OTHER` and Salesforce adds
  `KQ_Id__c`. Deleting the mapping does not undo this. When the target read does not say
  `isEnabled: true`, the preview and created items carry the information-only diagnostic
  `MAPPING_ACTIVATES_STANDARD_DMO`.

A typical create body onto a standard DMO:

```json
{
  "sourceEntityDeveloperName": "Source__dll",
  "targetEntityDeveloperName": "ssot__Brand__dlm",
  "fieldMapping": [
    { "sourceFieldDeveloperName": "Id__c", "targetFieldDeveloperName": "ssot__Id__c" },
    { "sourceFieldDeveloperName": "Name__c", "targetFieldDeveloperName": "ssot__Name__c" }
  ]
}
```

### Human output

Without `--json`, a confirmed update prints `Deleted field mappings: source -> target, ...` and
`Added field mappings: source -> target, ...`. Preview lines start with `Planned`. A deploy ends
with `Deployed: n (x created / y updated / z failed)`, counting only confirmed creates and
updates. A retrieve prints `Downloaded mapping: n`.

## Delete

```sh
sf data360 delete -m mapping:ExactTargetMappingName -o TARGET_ALIAS --preview --json
sf data360 delete -m mapping:ExactTargetMappingName -o TARGET_ALIAS --json
```

`sf data360 delete -m mapping:<Name>` deletes the whole mapping with one Metadata API
destructive deployment: type `ObjectSourceTargetMap`, member the mapping developer name. It
does not unmap pairs first and sends no native DELETE. Any mapping is deleted this way,
whatever pairs it holds, including pairs onto standard fields and mappings onto standard DMOs.
Deletion is admitted at every native API version from `61.0`; default/`auto` is `68.0`.

- **Which mapping.** When `data360/mapping/<Name>.mapping-meta.json` exists, it must be a valid
  mapping file whose `identity.apiName` is `<Name>` (`INVALID_SOURCE` otherwise). Then the org
  mapping is found the way deploy finds it, by the file's source DLO and target DMO, whatever
  name Salesforce gave it. The result keeps the file's name and reports the org name as
  `targetApiName`. No org mapping with that binding is `unchanged`; two or more are refused
  with `AMBIGUOUS_MAPPING_TARGET` before any write. A `--changed-since` delete takes the binding
  from the deleted file's base content. Without a file, `<Name>` is the exact org name.
- **Reads first.** The plugin reads the mapping, all mappings of its target DMO and the DMO. The
  mapping must be among the DMO's mappings (`MAPPING_INVENTORY_UNCONFIRMED` otherwise). A
  mapping whose own read answers `404` is already gone: it reports `unchanged` with mutation
  `not-attempted`, and the delete continues.
- **The one refusal.** The last mapping of a custom DMO is refused before any write with
  `MAPPING_LAST_MAPPING_DELETE_BLOCKED`, because Salesforce cannot delete it (internal error
  from the Metadata API, HTTP `500` from the native DELETE). Delete the DMO instead
  (`sf data360 delete -m dmo:<Dmo__dlm>`), which removes its mapping; selected together with
  that DMO, the mapping is reported `removedWith` the DMO. The last mapping of a DLO is no
  obstacle, and the last mapping of a standard DMO is deleted normally; that DMO stays enabled
  with its `KQ_Id__c` field and no mapped fields.
- **Preview.** `--preview` performs zero writes: it runs the same reads and the same refusal and
  reports the single planned step `delete`.
- **The write.** One deployment of a temporary manifest (an empty `package.xml` and a
  `destructiveChanges.xml` naming the mapping), sent once and never retried. A deployment that
  Salesforce does not confirm as succeeded with the mapping deleted ends with
  `MAPPING_DELETE_FAILED` and Salesforce's problem text.
- **Confirmation.** The plugin polls (up to 6 reads, 5 seconds apart) until the mapping read
  returns a typed selected-mapping `404`. It then requires that the DMO's other mappings (pairs
  and selectors) and its field names are exactly as before; any difference is
  `MAPPING_DELETE_SIDE_EFFECT`. A mapping still readable after the last poll gives
  `MAPPING_DELETION_UNCONFIRMED`.
- Nothing is rolled back and no parent object is deleted. Reads are sent at most once: no token
  refresh, no HTTP retry, redirects refused; an expired session stops with HTTP 401.
- After a confirmed deletion the local file is removed; see
  [Local files after delete](../../README.md#local-files-after-delete) and
  [delete.md](delete.md).

## Data spaces

A mapping belongs to one data space, named as a string in `c__dataSpace`. Every mapping and
relationship REST request names the run's data space in the `dataspace` query (`default` when
`--dataspace` is left out). The Metadata API calls (delete and label) use record names, which
are unique in the org. See [Data spaces](../../README.md#data-spaces) and the sfmc.guide
[Data Spaces page](https://sfmc.guide/next/data-spaces/).

- Deploy and delete refuse a file of another data space (`MAPPING_DATASPACE_MISMATCH`); the
  message names both data spaces.
- Only if you have more than one data space: `--allow-cross-dataspace` deploys a mapping
  file of another data space. The target DMO and its fields are renamed by rule
  (`ssot__Individual__dlm` to `ds2_Individual__dlm`, `ssot__FirstName__c` to `FirstName__c`);
  the DLO side stays. After the deploy the translated file is written under the name
  Salesforce gave the mapping. See [Deploy from another data space](../../README.md#deploy-from-another-data-space-only-if-you-have-more-than-one-data-space).
- **First mapping onto a standard DMO copy.** In a non-default data space a standard DMO is a
  copy (`ds2_X__dlm`) that exists only once something is mapped onto it. When the copy reads
  404 in the run's data space, the plugin reads `ssot__X__dlm` (the prefix comes from the
  org's data space list) and checks the pairs against its fields under the copy's names
  (`ssot__F__c` as `F__c`). The create is sent as the file names it; if Salesforce answers
  404 "DMO not found", it is sent once more with the target `ssot__X__dlm` and each target
  field under its default name. Salesforce stores the mapping under the copy, and the plugin
  reads it back under the copy name. Any other answer is reported as is.
- **Fields a copy does not have yet.** A copy holds only its mapped fields, and Salesforce adds a
  field when a mapping names it. A file may name such a field: the plugin finds it on
  `ssot__X__dlm`; a field neither object has is `MAPPING_FIELD_NOT_FOUND`.
- **Deleting a mapping of a copy.** Salesforce drops a copy field when its last mapping goes,
  so the delete check accepts that the fields only the deleted mapping targeted are gone.
  Salesforce refuses to delete the last mapping onto a standard DMO copy: the destructive
  deployment fails with "An unexpected error occurred" and the item is reported `rejected`.

## Error codes you act on

| Code                                                                                              | What to do                                                      |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`MAPPING_PROTECTED_PAIR_REQUIRED`](../errors/mapping/MAPPING_PROTECTED_PAIR_REQUIRED.md)         | Put the key pair back into the file.                            |
| [`MAPPING_PROTECTED_LAYOUT_UNPROVEN`](../errors/mapping/MAPPING_PROTECTED_LAYOUT_UNPROVEN.md)     | Retrieve the mapping again and keep its key and system pairs.   |
| [`MAPPING_FIELD_NOT_FOUND`](../errors/mapping/MAPPING_FIELD_NOT_FOUND.md)                         | Fix the field name, or deploy the field first.                  |
| [`MAPPING_FIELD_TYPES_DIFFER`](../errors/mapping/MAPPING_FIELD_TYPES_DIFFER.md)                   | Information only; Salesforce decides.                           |
| [`MAPPING_HTTP_ERROR`](../errors/mapping/MAPPING_HTTP_ERROR.md)                                   | Read Salesforce's detail, for example add the primary-key pair. |
| [`MAPPING_GENERATED_PAIRS_UNPROVEN`](../errors/mapping/MAPPING_GENERATED_PAIRS_UNPROVEN.md)       | Check that the DLO and DMO can be read, then retrieve again.    |
| [`MAPPING_LAST_MAPPING_DELETE_BLOCKED`](../errors/mapping/MAPPING_LAST_MAPPING_DELETE_BLOCKED.md) | Delete the DMO instead.                                         |
| [`AMBIGUOUS_MAPPING_TARGET`](../errors/mapping/AMBIGUOUS_MAPPING_TARGET.md)                       | Delete by the exact org name without a local file.              |
| [`MAPPING_DELETE_FAILED`](../errors/mapping/MAPPING_DELETE_FAILED.md)                             | Read Salesforce's problem text; the mapping is still there.     |
| [`MAPPING_DELETE_SIDE_EFFECT`](../errors/mapping/MAPPING_DELETE_SIDE_EFFECT.md)                   | Inspect the DMO and its other mappings.                         |
| [`MAPPING_DELETION_UNCONFIRMED`](../errors/mapping/MAPPING_DELETION_UNCONFIRMED.md)               | Check later with a read-only retrieve.                          |
| [`MAPPING_DATASPACE_MISMATCH`](../errors/mapping/MAPPING_DATASPACE_MISMATCH.md)                   | Run with the file's `--dataspace`.                              |

The full list is in [docs/errors/README.md](../errors/README.md). The API evidence behind these
rules is on the sfmc.guide
[DLO-to-DMO mapping page](https://sfmc.guide/next/data-cloud-devops/dlo-dmo-mapping/) of the
[Data Cloud DevOps guide](https://sfmc.guide/next/data-cloud-devops/).
