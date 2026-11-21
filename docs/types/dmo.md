# Data Model Objects (DMOs)

A Data Model Object (DMO, API name ending `__dlm`) is the harmonised object that DLO data is
mapped onto ([dlo.md](dlo.md), [mapping.md](mapping.md)) and that segments, calculated insights,
graphs and identity resolution read. The plugin manages the DMO definition: label,
description, category and fields. Custom DMOs are fully managed; standard and generated DMOs
are managed for their custom fields, labels and description.

## Commands

- `sf data360 retrieve -m dmo:<Name>__dlm` saves one DMO; `-m dmo` saves every DMO of the data space.
- `sf data360 deploy -m dmo:<Name>__dlm` creates or updates a DMO; add `--allow-field-removal` to
  remove custom fields that the file no longer lists.
- `sf data360 delete -m dmo:<Name>__dlm` deletes a whole DMO.
- `sf data360 delete -m dmo:<Name>__dlm --field <Field__c>` deletes single fields.
- Add `--preview` to `deploy` or `delete` to see the plan without writing anything.

```sh
sf data360 retrieve -o source -m dmo:Example__dlm -d ./project --json
sf data360 deploy -o target -m dmo:Example__dlm --preview --json
sf data360 deploy -o target -m dmo:Example__dlm --json
sf data360 deploy -o target -m dmo:Example__dlm --allow-field-removal --preview --json
sf data360 delete -o target -m dmo:Example__dlm --preview --json
```

Default/`auto` uses API `68.0`; explicit numeric pins from `61.0` are kept as given, and
`--api-version latest` is not accepted.

## The file

Each DMO is one file, `data360/dmo/<ApiName>__dlm.dmo-meta.json`, beneath the project root
(`-d/--output-dir`, default: the current directory).

```json
{
  "schemaVersion": 1,
  "kind": "dmo",
  "c__dataSpace": "dataspace2",
  "identity": { "apiName": "ds2_Individual__dlm" },
  "spec": { "label": "Individual", "category": "Profile", "fields": [] }
}
```

- `spec` holds a label, a category, an optional description and at least one field. Each
  field needs a unique name ending `__c`, a label, a `dataType` and a boolean `isPrimaryKey`.
- `spec` must not contain `name`, `dataSpaceName` or runtime keys such as `id` or `status`;
  the object identity comes from `identity` only.
- Fields are saved sorted by name, so a repeat retrieve writes the same bytes.
- Generated fields are left out: fields read as `System`, `DataSource__c`,
  `DataSourceObject__c`, `InternalOrganization__c` and `KQ_` names. Primary keys and the
  standard fields of a standard DMO are always saved. Deploy keeps the generated fields from
  the org, so a retrieved file deploys back `unchanged`.
- Keys that only reads return (`creationType`, `isDistinct`, `usageTag`, `keyQualifierName`)
  stay in the file and are never sent. A file value that differs from the org does not change
  the outcome; deploy warns with `DMO_FIELD_KEY_NOT_SENT`.
- The `isMapped` marker on mapped fields is kept in the file but belongs to the mapping: it is
  never sent, compared or required, so the same file deploys unchanged to an org where the DMO
  is not mapped yet.

## Retrieve

- `-m dmo:<Name>__dlm` selectors are repeatable; exact selectors are sorted and deduplicated
  without an inventory request.
- `-m dmo` retrieves every DMO of the run's data space from the complete inventory. A retrieve
  with no `-m` retrieves all types.
- The DMO list holds every data space, so each entry is kept by its own `dataSpaceName`. A DMO
  list entry without `dataSpaceName` stops the listing (`NATIVE_INVENTORY_UNCONFIRMED`).
- A failed object is not skipped silently: its diagnostic names it, the files already written
  stay, and the run exits nonzero.
- Identical bytes are `unchanged`; replacing a differing file needs `-x/--overwrite`.
- Standard, namespaced and generated DMOs can be retrieved.

## What the plugin checks and what Salesforce decides

The plugin checks only the shape of the file (see [The file](#the-file)). There is no local
allowlist: category, field data types, label length, object and field descriptions and any
extra keys are sent as written. Salesforce decides, and its error is reported.

Salesforce's own rules, as the native DMO API applies them:

- **Categories.** Create accepts `Profile`, `Engagement` and `Other`. Spelling is
  case-insensitive; reads return upper case and the plugin saves `Profile`, `Engagement` or
  `Other`. A changed category is sent and Salesforce rejects it ("Data Object Category cannot
  be updated").
- **Engagement** DMOs need no event date key; `eventDateTimeFieldName` is rejected as unknown
  input.
- **Field data types.** `Number`, `Text`, `Date`, `DateTime`, `Url`, `Phone`, `Email`,
  `Percent`, `Boolean` and `Currency`. A `Currency` field adds the system field
  `cdp_sys_record_currency__c`.
- **Limits.** Object and field labels have at most 40 characters. Exactly one primary key is
  required. Salesforce generates the key qualifier (`KQ_<key>__c`, referenced by
  `keyQualifierName`).
- **Descriptions.** The object `description` round-trips. A field `description` and
  `isDynamicLookup` are accepted but never returned by reads (and the field description does
  not show in the Data Model UI either). The plugin sends both when a field is created or
  otherwise edited, but a change to only these keys is reported `unchanged`, because it cannot
  be detected.
- A PATCH response can still show the state before the change, so the plugin confirms every
  write with reads.

## Deploy: create and update

Deploy looks up the exact target name. A confirmed HTTP 404 leads to a create; any other
lookup failure stops. Create sends the authored category, fields, labels, descriptions and
extra keys, without generated fields. Every create and update body names the run's data space
in `dataSpaceName` (`default` when `--dataspace` is left out).

An existing custom DMO is compared and, if it differs, updated with one PATCH, which can:

- change the object label;
- set or clear the object description. A missing `spec.description` leaves the target value
  alone; an empty string clears it;
- change the labels of existing fields;
- add fields of any accepted type.

Other `spec` keys are sent on create, and on update only when Salesforce returns the same key
with another value. After every write the plugin reads the DMO (up to 6 reads, 5 seconds
apart) until the requested definition is confirmed and every removed field is gone. A write is
never repeated. If the reads do not confirm it, the item fails with
`DMO_PERSISTENCE_UNCONFIRMED`; inspect the target before another attempt.

### Standard, generated and namespaced DMOs

The plugin decides from the target's `creationType` what a deploy may write:

| Target                                                                                                                  | Deploy                                                                                      | Whole delete                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Custom` with a name without a double underscore before `__dlm`                                                         | Everything in [Deploy: create and update](#deploy-create-and-update).                       | Sent; Salesforce decides.                                                                |
| `Standard` (for example `ssot__Brand__dlm`)                                                                             | Custom fields (add, relabel, remove), labels of other fields, object label and description. | Sent; Salesforce decides.                                                                |
| Generated (`Adg`, `Bridge`, `Derived`, `Segment_Membership`, …), `Custom` under a namespaced name, or no `creationType` | Same as a standard DMO.                                                                     | Sent; Salesforce refuses a generated DMO while the graph or ruleset that owns it exists. |

For every DMO other than an unprefixed custom one:

- The plugin never creates it. Its category is ignored: not sent, not compared, not required
  on readback. Salesforce changes it itself (the first mapping of a standard DMO moves it from
  `UNASSIGNED` to `OTHER`, enables it and adds `KQ_Id__c`), so a retrieved file deploys back
  `unchanged`, also to an org where the DMO is not mapped yet.
- Standard, system and generated fields, including the standard primary key, are never removed
  by a deploy and may be left out of the file. When the file gives one another `label`, only
  that label is sent and Salesforce decides (it relabels system and graph fields, and refuses
  an `ssot__` field with 400 `INVALID_INPUT`, reported as rejected). Any other difference is
  refused with `UNSUPPORTED_DMO_FIELD_CHANGE`, naming the field and the property.
- A new field is added only when it is a plain custom field (no double underscore before
  `__c`, no `creationType` other than `Custom`); anything else, such as `ssot__New__c`, is
  refused with `UNSUPPORTED_DMO_FIELD_ADDITION`.
- A PATCH that adds one custom field sends
  `{"fields":[{"name":"<Name>","label":"<Label>","dataType":"Text","isPrimaryKey":false}]}`;
  a label change alone sends `{"label":"<Label>"}`.

## Removing fields with deploy

Leaving a custom field out of the file counts as a removal. The native DMO API has no route
for it, so the deploy is refused (`UNSUPPORTED_DMO_FIELD_CHANGE`) unless
`--allow-field-removal` is set. With the flag:

- Every custom target field missing from the file is removed with one Metadata API destructive
  change (`sf project deploy start --metadata-dir` with an empty `package.xml` and a
  `destructiveChanges.xml` listing `CustomField` members `<ObjectName>__dlm.<FieldName>__c`),
  at the native API version in use.
- The PATCH for label, description and field edits runs first; it is skipped when removals
  are the only change. If the removal then fails, the PATCH stays in place.
- The primary key is never removed: a file without it is refused with
  `UNSUPPORTED_DMO_FIELD_CHANGE`. Generated fields are never removed by a deploy.
- `--preview` lists the planned removals in `removeFields` and in a `DMO_FIELD_REMOVAL_PLANNED`
  diagnostic, and writes nothing.
- If Salesforce does not report every field as deleted, the item fails with
  `DMO_FIELD_REMOVAL_FAILED` and Salesforce's problem text. Nothing is retried or rolled back.

Removing a field deletes it and its values in Salesforce; the file is the only record of what
is kept.

### Removing a mapped field

A mapped field is removed with the same single destructive change. Salesforce drops the
field's mapping pairs itself and leaves every other pair, the mappings' `ACTIVE` status and
the rest of the DMO as they are. The removal is admitted only when the same command selects
every mapping that holds a pair for the field, each with a file that omits that pair:

```sh
sf data360 deploy -o target -m mapping:<MappingApiName> -m dmo:Example__dlm --allow-field-removal
```

- Before the first write the plugin checks read-only that the fields are present, the mappings
  `ACTIVE` and every pair on a removed field covered by a selected mapping file; a removal that
  would be refused stops the item as `blocked`/`not-attempted` with nothing written. Otherwise
  the whole batch is refused with `DMO_FIELD_REMOVAL_MAPPED`, whose message names every mapped
  field, the mappings holding its pair, the file edits and the one command to run (with
  `--json` also `mappedFields: [{"field": …, "mappings": […]}]`).
- The DMO then deploys in its normal position (data lake objects, DMOs, mappings): its PATCH,
  then the destructive change. Right before the destructive change it reads the DMO and its
  mappings again; a pair that is now held by an unselected mapping stops the item with
  `DMO_FIELD_REMOVAL_MAPPED` (an earlier PATCH stays).
- After the destructive change the plugin reads (up to 6 reads, 5 seconds apart) until the
  fields are gone and every mapping equals its earlier state minus exactly the removed
  fields' pairs, still `ACTIVE`. Any other change stops with `DMO_FIELD_REMOVAL_SIDE_EFFECT`;
  reads that do not settle stop with `DMO_PERSISTENCE_UNCONFIRMED` (a field still readable) or
  `MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED` (a pair still listed). The DMO item is then
  `failed` with mutation `unknown` and the mapping items are not deployed.
- The selected mapping files deploy afterwards and find the pairs already gone; a file whose
  only change was dropping them reports `unchanged`.
- The executed DMO item lists the removed fields in `removedFields` and the pairs Salesforce
  dropped in `droppedPairs` (`mapping`, `sourceFieldDeveloperName`,
  `targetFieldDeveloperName`).

A field that reads mapped while no mapping lists a pair for it (Salesforce marks every field of
a generated DMO as mapped) has no pair to lose and is removed normally. Selections that mix DMOs
with segment, calculated insight, data graph or identity resolution inputs cannot contain
mappings and refuse a mapped field.

There are three ways to remove a mapped field:

1. Edit both files and deploy once, as above.
2. Name the field: `sf data360 delete -m dmo:<Dmo__dlm> --field <Field__c>` (see
   [Delete single fields](#delete-single-fields)).
3. Deploy twice: the mapping without the pair, then the DMO without the field with
   `--allow-field-removal`.

## Refused before any write

| Situation                                                                                                                                   | Code                             |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Changing an existing field's data type or moving the primary key (Salesforce answers 200 and ignores it).                                   | `UNSUPPORTED_DMO_FIELD_CHANGE`   |
| Leaving out a custom field of the target without `--allow-field-removal`.                                                                   | `UNSUPPORTED_DMO_FIELD_CHANGE`   |
| Leaving out the target's primary-key field, with or without the flag.                                                                       | `UNSUPPORTED_DMO_FIELD_CHANGE`   |
| Removing a mapped field unless every mapping holding its pair is selected with a file that omits the pair.                                  | `DMO_FIELD_REMOVAL_MAPPED`       |
| Adding a generated field or a second primary key.                                                                                           | `UNSUPPORTED_DMO_FIELD_ADDITION` |
| On a standard, generated or namespaced DMO: a standard, system or generated field that differs in a comparable property other than `label`. | `UNSUPPORTED_DMO_FIELD_CHANGE`   |
| On a standard, generated or namespaced DMO: a new field that is not a plain custom field.                                                   | `UNSUPPORTED_DMO_FIELD_ADDITION` |
| Creating a DMO with a namespaced name (a double underscore before `__dlm`).                                                                 | `UNSUPPORTED_DMO_TARGET`         |
| Any write to a DMO whose read has no name.                                                                                                  | `UNSUPPORTED_DMO_TARGET`         |
| Creating a standard DMO copy of a non-default data space (deploy the mapping instead).                                                      | `UNSUPPORTED_DMO_TARGET`         |

## Delete a whole DMO

Delete addresses the exact name only, has no dependency check of its own and no prompt;
`--preview` reads only. The DELETE is sent for every DMO, including standard, generated and
namespaced ones and a read without `creationType`, and Salesforce decides. Salesforce may
remove the DMO's mappings with it; a selected mapping that is the last one of a custom DMO is
reported `removedWith` the DMO.

- After HTTP 204 one read by name settles the item: 404 reports `confirmed-deleted`; a
  `DELETING` state reports `deletion-processing`; a still-readable DMO or a failed read reports
  `deletion-unconfirmed` (exit 1, `DMO_DELETE_NOT_CONFIRMED`). Confirm final absence with a
  later read-only check.
- An HTTP 4xx answer is reported `rejected` and removes no local file (for example 412
  `MATCH_PRECONDITION_FAILED` for a generated DMO whose owner still exists). A DMO that is
  already gone is `unchanged`.
- Each request is sent at most once: no token refresh, no HTTP retry, redirects refused. An
  expired session stops the command (HTTP 401); log in again and rerun.
- A whole delete needs no local file; after a confirmed deletion it removes
  `data360/dmo/<Name>__dlm.dmo-meta.json` (see
  [Local files after delete](../../README.md#local-files-after-delete) and
  [delete.md](delete.md)).

## Delete single fields

```sh
sf data360 delete -o target -m dmo:Example__dlm --field Note__c --field Extra__c --output-dir ./project --preview --json
sf data360 delete -o target -m dmo:Example__dlm --field Note__c
```

`--field` removes the named fields from one DMO together with the mapping pairs that target
them, then refreshes the project files. It changes mappings the command line does not name, so
check it with `--preview` first; the preview writes nothing, neither in the org nor on disk.

- **Selection.** Exactly one `-m dmo:<Name__dlm>` and one or more `--field <Name__c>`.
  Another selector, `--changed-since` or `--delete-dlo` beside `--field`, and `--output-dir`
  without `--field`, are refused with `INVALID_FIELD_DELETE_SELECTION` before any org call.
- **Checks (reads only).** Every named field must exist (`DMO_FIELD_NOT_FOUND`) and must not be
  the primary key (`UNSUPPORTED_DMO_FIELD_CHANGE`). Standard, system and generated fields may
  be named on any DMO; this is the only way the plugin removes them, and Salesforce decides.
  The plugin collects every pair of the DMO's mappings that targets a named field. Each such
  mapping must be `ACTIVE` (`MAPPING_TARGET_NOT_SETTLED`) and its detail read must equal its
  list entry (`MAPPING_INVENTORY_UNCONFIRMED`). A field that reads mapped while the mapping list
  fails (other than with 404) is refused with `DMO_FIELD_REMOVAL_MAPPED`.
- **Write.** One Metadata API destructive change for all named fields, sent once. Salesforce
  drops the collected pairs with the fields; the plugin sends no request per pair. Right
  before it the plugin reads the DMO and its mappings again; if the pairs are no longer exactly
  the planned ones, it stops with `MAPPING_UNMAP_PLAN_CHANGED` and writes nothing.
- **Confirmation.** Reads (up to 6, 5 seconds apart) until the fields are gone and every
  mapping equals its earlier state minus exactly the collected pairs, still `ACTIVE`. Any other
  change stops with `DMO_FIELD_REMOVAL_SIDE_EFFECT`; reads that do not settle stop with
  `DMO_PERSISTENCE_UNCONFIRMED` or `MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED`.
- **Outcomes.** Nothing is rolled back. A stop before the write is `blocked` with mutation
  `not-attempted`; a destructive change Salesforce refused is `failed` with mutation
  `rejected`; a sent change without a confirmed result is `failed` with mutation `unknown`; a
  stop during the readback is `deletion-unconfirmed` with mutation `acknowledged`. No file is
  refreshed after a stop.
- **Local refresh.** After the org steps succeed, `data360/dmo/<Name__dlm>.dmo-meta.json` and
  the file of every mapping that lost a pair are read again from the org and overwritten under
  `--output-dir`. A mapping file with another name is found by its binding (source DLO, target
  DMO, data space) and keeps its name. A missing file is not created and is reported
  `not-present`. When a refresh fails, the item stays `deleted`, the file is reported `failed`
  and the command exits nonzero with `LOCAL_REFRESH_FAILED`: run
  `sf data360 retrieve --overwrite` for that file, do not repeat the delete.
- **Result.** One item with operation `delete-field`, `fields`, `removedFields`,
  `unmappedPairs` and `refreshedFiles` (`path` and outcome `refreshed`, `unchanged`,
  `not-present` or `failed`). Human output prints
  `dropped pair <Source> -> <Target> in mapping <MappingApiName>` per pair. A preview item has
  operation `preview`, a `plan` with one `unmap` step per pair and one `delete-field` step per
  field, and `localFiles` (`path`, `exists`); its human output prints
  `Planned pair drop (Salesforce removes it with the field): ...` per pair.
- A repeat after success finds no such field and is refused with `DMO_FIELD_NOT_FOUND`
  without a write.

## Data spaces

A DMO belongs to one data space, named as a string in `c__dataSpace`. Every command runs in
`--dataspace` (`default` when left out); see [Data spaces](../../README.md#data-spaces) and the
sfmc.guide [Data Spaces page](https://sfmc.guide/next/data-spaces/).

- Retrieve writes the run's data space into each file. Deploy and delete refuse a file of
  another data space (`DMO_DATASPACE_MISMATCH`); the message names both data spaces.
- In a non-default data space a standard DMO is a copy named `<prefix>_<Name>__dlm`
  (`ds2_Individual__dlm` for `ssot__Individual__dlm` in `dataspace2`) with fields without
  `ssot__` (`FirstName__c`). Files carry these stored names and deploy sends them unchanged.
- The copy exists only once something is mapped onto it. A DMO deploy never creates a copy;
  deploy the mapping instead (see [mapping.md](mapping.md)). A `ds2_<Name>__dlm` file counts
  as a copy when `ssot__<Name>__dlm` or `<Name>__dlm` is a standard DMO of `default` (such as
  `StaticCurrencyRates_Home__dlm`); otherwise it is a custom DMO and is created as one.
- A mapping deploy creates only the copy of an `ssot__<Name>__dlm` DMO. The plugin cannot
  create the copy of a standard DMO without `ssot__` (`ds2_StaticCurrencyRates_Home__dlm`)
  yet: it is created in Salesforce by mapping a DLO onto it in the data space.
- Only if you have more than one data space: the name of a custom DMO carries its data
  space's prefix (`ds2_Order__dlm` in `dataspace2`), and in `default` no other space's prefix.
  Deploy refuses a new DMO that breaks this before any write
  ([`DMO_PREFIX_MISMATCH`](../errors/dmo/DMO_PREFIX_MISMATCH.md)); for an existing one deploy
  and retrieve only warn. Standard DMOs, their copies and generated or namespaced DMOs are not
  checked. See [Name prefixes](../../README.md#name-prefixes-only-if-you-have-more-than-one-data-space).
- Only if you have more than one data space: `--allow-cross-dataspace` (`-c`) deploys a DMO
  file of another data space. A custom DMO gets the target prefix (`Order__dlm` becomes
  `ds2_Order__dlm`); a standard DMO becomes its copy and its fields lose `ssot__`. Towards
  `default`, a `ds2_<Name>__dlm` name is placed only when the file shows a custom DMO (fields
  with creationType `Custom`). After the deploy the translated file is written under the new
  name. See [Deploy from another data space](../../README.md#deploy-from-another-data-space-only-if-you-have-more-than-one-data-space).

## Order in a batch

Deploy runs DLOs, DMOs, mappings and relationships in that order, whatever order they are
selected in, and settles each parent before its dependents. A preview of an item whose parent
the same batch creates reports `planned-dependencies` instead of comparing it. Delete runs
relationships, mappings, DMOs, then DLOs.

## Error codes you act on

| Code                                                                                                  | What to do                                                                   |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`UNSUPPORTED_DMO_FIELD_CHANGE`](../errors/dmo/UNSUPPORTED_DMO_FIELD_CHANGE.md)                       | Restore the field in the file, or add `--allow-field-removal` for a removal. |
| [`UNSUPPORTED_DMO_FIELD_ADDITION`](../errors/dmo/UNSUPPORTED_DMO_FIELD_ADDITION.md)                   | Add only plain custom fields.                                                |
| [`UNSUPPORTED_DMO_TARGET`](../errors/dmo/UNSUPPORTED_DMO_TARGET.md)                                   | Use an unprefixed custom name, or deploy the mapping for a copy.             |
| [`DMO_FIELD_REMOVAL_MAPPED`](../errors/dmo/DMO_FIELD_REMOVAL_MAPPED.md)                               | Run the printed retrieve, edit both files, run the printed deploy.           |
| [`DMO_FIELD_REMOVAL_SIDE_EFFECT`](../errors/dmo/DMO_FIELD_REMOVAL_SIDE_EFFECT.md)                     | Inspect the DMO and its mappings before anything else.                       |
| [`DMO_FIELD_REMOVAL_FAILED`](../errors/dmo/DMO_FIELD_REMOVAL_FAILED.md)                               | Read Salesforce's problem text; the field is still there.                    |
| [`DMO_PERSISTENCE_UNCONFIRMED`](../errors/dmo/DMO_PERSISTENCE_UNCONFIRMED.md)                         | Retrieve the DMO and compare before deploying again.                         |
| [`MAPPING_UNMAP_PLAN_CHANGED`](../errors/mapping/MAPPING_UNMAP_PLAN_CHANGED.md)                       | Someone changed the mappings; preview again.                                 |
| [`MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED`](../errors/mapping/MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED.md) | Retrieve the mappings and check the pair later.                              |
| [`DMO_DATASPACE_MISMATCH`](../errors/dmo/DMO_DATASPACE_MISMATCH.md)                                   | Run with the file's `--dataspace`.                                           |
| [`DMO_DELETE_NOT_CONFIRMED`](../errors/dmo/DMO_DELETE_NOT_CONFIRMED.md)                               | Check the org with a read-only retrieve before trying again.                 |
| [`LOCAL_REFRESH_FAILED`](../errors/general/LOCAL_REFRESH_FAILED.md)                                   | Run `sf data360 retrieve --overwrite` for the named file.                    |

The full list is in [docs/errors/README.md](../errors/README.md). The API evidence behind these
rules is on the sfmc.guide
[Data Model Object page](https://sfmc.guide/next/data-cloud-devops/data-model-object/) of the
[Data Cloud DevOps guide](https://sfmc.guide/next/data-cloud-devops/).
