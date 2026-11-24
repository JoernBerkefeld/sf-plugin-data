# Data Lake Objects (DLOs)

A Data Lake Object (DLO, API name ending `__dll`) is the storage table that data lands in
before it is mapped onto a Data Model Object ([dmo.md](dmo.md)). The plugin manages the DLO
definition: its label, category, fields, primary key and data spaces. It does not manage
connectors, streams, source credentials or the rows in the DLO.

## Commands

- `sf data360 retrieve -m dlo:<Name>__dll` saves one DLO; `-m dlo` saves every DLO of the data space.
- `sf data360 deploy -m dlo:<Name>__dll` creates or updates a DLO from its file.
- `sf data360 delete -m dlo:<Name>__dll` deletes a DLO.
- Add `--preview` to `deploy` or `delete` to see the plan without writing anything.

```sh
sf data360 retrieve -m dlo:CustomerSource__dll -o SOURCE_ALIAS --output-dir ./project --json
sf data360 deploy -m dlo:CustomerSource__dll -o TARGET_ALIAS --preview --json
sf data360 deploy -m dlo:CustomerSource__dll -o TARGET_ALIAS --json
sf data360 delete -m dlo:CustomerSource__dll -o TARGET_ALIAS --preview --json
```

Default/`auto` uses API `68.0`; explicit numeric pins from `61.0` are kept as given, and
`--api-version latest` is not accepted.

## The file

Each DLO is one file, `data360/dlo/<FullApiName>__dll.dlo-meta.json`, beneath the project root
(`--output-dir`, default: the current directory). The full API name, including `__dll`, is
the file name and the identity.

```json
{
  "schemaVersion": 1,
  "kind": "dlo",
  "c__dataSpace": ["dataspace2", "default"],
  "identity": { "apiName": "CustomerSource__dll" },
  "spec": { "label": "Customer Source", "category": "Profile", "fields": [] }
}
```

- `c__dataSpace` lists every data space the DLO belongs to, sorted by name.
- `spec` holds the label, the category, the fields with their primary key and, where set,
  `eventDateTimeFieldName` and `recordModifiedFieldName`.
- The source record ID, runtime values and the read-only `capabilities` of a DLO are never
  saved. Salesforce accepts only an empty `capabilities` object from customer users, so it
  stays out of the file.

### Fields Salesforce generates

Salesforce adds some fields itself. Retrieve leaves them out of the file and deploy keeps them
as they are in the org, so a retrieved or hand-written file with only the authored fields
deploys back `unchanged`:

- `cdp_sys_SourceVersion__c`, `DataSource__c`, `DataSourceObject__c`, `InternalOrganization__c`;
- `cdp_sys_PartitionDate__c`, the DateTime field Salesforce adds to Engagement DLOs;
- the key qualifier `KQ_<Name>__c` of another field: `KQ_Id__c` for the primary key on create,
  and `KQ_RefId__c` once a relationship uses `RefId__c` as its source.

A field named by `eventDateTimeFieldName` or `recordModifiedFieldName` always stays in the file.
A key qualifier combines an ID with source context to avoid collisions; leaving it out of the
file is not a field removal.

## Retrieve

- `-m dlo:<Name>__dll` reads one DLO. Several selectors may be given.
- `-m dlo` (alone or beside other types) and a retrieve with no `-m` at all list every DLO the
  Data 360 API returns in the run's data space, connector- and stream-created ones included,
  and save each one. The plugin does not filter that list.
- A DLO whose read or file fails gets its own diagnostic with its name; the others are still
  written and the run ends `partial` (exit code 68).
- Identical bytes are reported `unchanged`; replacing a differing file needs `--overwrite`.

## Deploy: create and update

Deploy looks up the exact API name in the target org.

- **Not found.** Only an authoritative not-found answer leads to a create (POST).
  Authentication, permission, malformed-response and other lookup failures stop the item.
- **Found, with a supported difference.** One PATCH by the resolved ID. A failed PATCH never
  falls back to POST.
- **Found and equal.** An equal label and field inventory report `unchanged` /
  `not-attempted`; field order and the missing generated fields do not cause a write.

### Create

Creation sends the authored fields with the intended primary key, never the generated
qualifier and system fields.

- Create sends `spec.category` as the file states it and Salesforce decides. Its API lists
  `Profile`, `Engagement`, `Other`, `Directory_Table`, `Observability_Table`, `Insights`,
  `Vector_Embedding` and `Content`.
- An Engagement DLO needs `spec.eventDateTimeFieldName`, the full name of one of the listed
  fields (with `__c`). Create sends it without the suffix; retrieve saves it with it.
- `spec.recordModifiedFieldName` optionally names the field whose value tells which version of
  a record is newest (full name with `__c`). Create sends it without the suffix.
- Local validation accepts nonempty `dataType` strings rather than a Text-only allowlist, and
  Salesforce decides the type of a field.

A DLO can also be created directly as the output of a data transform; see
[data-transform.md](data-transform.md).

### Update

On an existing DLO, UPDATE admits label changes and ordinary nonprimary field additions while
keeping the existing fields and the primary-key configuration.

- `spec.recordModifiedFieldName` is sent only when it differs from the org. Salesforce sets it
  on a DLO that has none and answers HTTP 400 `Record modified field already present` once one
  is set; the plugin reports that as `DLO_HTTP_ERROR`. A file without the key leaves the org's
  value alone.
- A listed field is compared on the keys the file states; keys that only the org's copy
  carries are ignored.

### Refused before any write

Salesforce rejects a PATCH that names the category or the event field, so a changed category
is refused with `UNSUPPORTED_DLO_CATEGORY_CHANGE` and a changed event field with
`UNSUPPORTED_DLO_EVENT_FIELD_CHANGE`, both before any write.

Salesforce also rejects a changed existing field, and its Metadata API refuses to remove a
field of a DLO in use; the REST field delete route works only for external DLOs. Field
removal, existing-field changes and primary-key mutation are therefore refused with
`UNSUPPORTED_DLO_FIELD_CHANGE`, which says why. The same code covers a target field the file
omits (other than the generated fields above) and a stated field key that differs from the org.

### After the write

A POST or PATCH can answer `PROCESSING` before a read shows `ACTIVE`. The plugin reads the DLO
back until it holds the requested definition. A write is never repeated after an ambiguous
answer; inspect the target before another attempt. `--preview` runs the same lookup and
comparison and writes nothing.

## Data spaces

Every command runs in one data space: `--dataspace`, or `default` when it is left out. See
[Data spaces](../../README.md#data-spaces) and the sfmc.guide
[Data Spaces page](https://sfmc.guide/next/data-spaces/).

- **Retrieve** reads the DLOs of the run's data space and writes every data space each one
  belongs to.
- **Deploy** refuses a file whose `c__dataSpace` does not hold the run's data space
  (`DLO_DATASPACE_MISMATCH`). A new DLO is created in the run's data space and then added to
  the other listed ones.
- Only if you have more than one data space: with `--allow-cross-dataspace` (`-c`) such a file
  is deployed with the run's data space added to its list. Nothing is renamed and no copy file
  is written; the output shows the data space change. See [Deploy from another data space](../../README.md#deploy-from-another-data-space-only-if-you-have-more-than-one-data-space).
- An existing DLO is added to each listed data space it is not in yet with one
  `PUT /ssot/data-spaces/<space>/members` that names only this DLO; Salesforce keeps every
  other member. The plugin then reads the DLO until it lists the planned data spaces
  (`DLO_DATASPACE_NOT_SETTLED` otherwise). A member write Salesforce answers without success
  is `DLO_MEMBERSHIP_UPDATE_REJECTED`.
- A data space the org lists but the file leaves out is removed
  (`DELETE /ssot/data-spaces/<space>/members?memberNames=<Name>__dll`) only with
  `--allow-dataspace-removal`; without the flag the deploy is refused
  (`DLO_DATASPACE_REMOVAL_NOT_ALLOWED`).
- Preview and execution list the planned or applied membership changes as `dataSpaceChanges`.
- A create names only the run's data space; the other data spaces are added afterwards
  through the member route.
- A filtered membership `{ "name": …, "filter": … }` in the file is not deployed
  (`UNSUPPORTED_DATASPACE_FILTER`). A DLO whose org membership carries more than a data space
  name and label is retrieved as-is with the warning `UNSUPPORTED_DLO_MEMBERSHIP`.
- **Delete** removes a DLO from every data space at once, so a DLO that also belongs to another
  data space than the run's is refused before anything is deleted
  (`DLO_DELETE_OTHER_DATASPACES`). Deploy a shorter list with `--allow-dataspace-removal`
  instead.

## Delete

Delete runs without a confirmation prompt. `--preview` reads only. Execution resolves the
selected DLO and deletes that ID only: it does not clean up streams, sources or DMOs.

- **Dependencies.** Before the delete (and in `--preview`) the plugin reads what Salesforce
  lists as depending on the DLO, for example the DMO it is mapped onto. Salesforce refuses to
  delete a DLO with dependents (HTTP 412 `DEPENDENCY_EXISTS`), so a dependent that the same
  command does not delete stops the item before any write with `DLO_DEPENDENCY_EXISTS`,
  naming each dependent.
- A DMO dependent counts as deleted by the command when `dmo:<Name>` is selected, or when every
  mapping between the DLO and that DMO is selected as `mapping:<Name>`.
- The dependency lists of all selected DLOs are read before the first write of the command.
- Selections run relationships first, then mappings, DMOs and DLOs, in whatever order they are
  given. Before the DLO's DELETE the plugin waits (up to 6 reads, 3 seconds apart) until the
  dependency list is empty, otherwise `DLO_DEPENDENCY_PENDING`.
- After HTTP 204 one read by name settles the item: 404 reports `confirmed-deleted`; a
  `DELETING` state reports `deletion-processing`; a still-readable DLO or a failed read
  reports `deletion-unconfirmed` (exit 1, `DLO_DELETE_NOT_CONFIRMED`).
- An HTTP 4xx answer reports mutation `rejected`: nothing was deleted. A DLO that is already
  gone is `unchanged`.
- Each request is sent at most once: no token refresh, no HTTP retry, redirects refused. An
  expired session stops the command (HTTP 401) before any write; log in again and rerun.
- After a confirmed deletion the local file is removed; see
  [Local files after delete](../../README.md#local-files-after-delete) and
  [delete.md](delete.md).

## Error codes you act on

| Code                                                                                        | What to do                                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`UNSUPPORTED_DLO_CATEGORY_CHANGE`](../errors/dlo/UNSUPPORTED_DLO_CATEGORY_CHANGE.md)       | Keep the org's category, or create a new DLO.                             |
| [`UNSUPPORTED_DLO_EVENT_FIELD_CHANGE`](../errors/dlo/UNSUPPORTED_DLO_EVENT_FIELD_CHANGE.md) | Keep the org's event field, or create a new DLO.                          |
| [`UNSUPPORTED_DLO_FIELD_CHANGE`](../errors/dlo/UNSUPPORTED_DLO_FIELD_CHANGE.md)             | Restore the field in the file; only additions and label changes are sent. |
| [`DLO_DATASPACE_MISMATCH`](../errors/dlo/DLO_DATASPACE_MISMATCH.md)                         | Run with a `--dataspace` the file lists, or add it to `c__dataSpace`.     |
| [`DLO_DATASPACE_REMOVAL_NOT_ALLOWED`](../errors/dlo/DLO_DATASPACE_REMOVAL_NOT_ALLOWED.md)   | Add `--allow-dataspace-removal`, or list the data space again.            |
| [`DLO_DELETE_OTHER_DATASPACES`](../errors/dlo/DLO_DELETE_OTHER_DATASPACES.md)               | Remove the other data spaces by deploy first.                             |
| [`DLO_DEPENDENCY_EXISTS`](../errors/dlo/DLO_DEPENDENCY_EXISTS.md)                           | Select the dependent DMO or its mappings in the same delete.              |
| [`DLO_DELETE_NOT_CONFIRMED`](../errors/dlo/DLO_DELETE_NOT_CONFIRMED.md)                     | Check the org with a read-only retrieve before trying again.              |
| [`UNKNOWN_DATASPACE`](../errors/general/UNKNOWN_DATASPACE.md)                               | Fix the `--dataspace` value or the names in `c__dataSpace`.               |

The full list is in [docs/errors/README.md](../errors/README.md). The API evidence behind these
rules is on the sfmc.guide
[Data Lake Object page](https://sfmc.guide/next/data-cloud-devops/data-lake-object/) of the
[Data Cloud DevOps guide](https://sfmc.guide/next/data-cloud-devops/).
