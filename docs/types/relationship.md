# DMO field relationships

A relationship links a field of one DMO (the source) to a field of another object (the
target), for example an order's customer reference to the customer's key. The target is a DMO
([dmo.md](dmo.md)) or a CRM object. The plugin retrieves, creates, updates and deletes these
relationships.

## Commands

- `sf data360 retrieve -m relationship:<Dmo__dlm>` saves every relationship whose source is that
  DMO; `-m relationship` does so for every DMO.
- `sf data360 deploy -m relationship:<Name>` (or `--source-dir <file>`) creates or updates a
  relationship.
- `sf data360 delete -m relationship:<Dmo__dlm>:<Name>` deletes a relationship.
- Add `--preview` to `deploy` or `delete` to see the plan without writing anything.

```sh
sf data360 retrieve -m relationship:Order__dlm -o SOURCE_ALIAS
sf data360 deploy -m relationship:Order_CustomerId_map_Customer_Id_1794467679481 -o TARGET_ALIAS --preview
sf data360 delete -m relationship:Order__dlm:Order_CustomerId_map_Customer_Id_1794467679481 -o TARGET_ALIAS --preview
```

Default/`auto` uses API `68.0`; numeric pins from `61.0` are kept.

## The file

Each relationship is one file, `data360/relationship/<Name>.relationship-meta.json`:

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

- The target is a DMO (owner `DataCloud`) or a CRM object such as `Account` with its field, for
  example `Id` (owner `SObject`); both are retrieved and deployed the same way.
- Salesforce generates the relationship name when it creates the relationship. A hand-written
  file may use any name.
- Cardinality, owner and the optional `label` are sent as written and Salesforce decides which
  values it accepts. A file without `label` leaves the org's label alone.
- The id, object and field labels, status and creation type are not saved.

## Retrieve

- `relationship:<Dmo__dlm>` writes every relationship whose source is that DMO, one file each,
  beneath `--output-dir` (default: the current directory). Several DMOs may be selected.
- A bare `relationship` selector reads the relationships of every DMO the Data 360 API lists in
  the data space, one DMO after another; one DMO failing never blocks the others.
- Salesforce has no read by relationship name, so the plugin reads each DMO's relationship list
  in pages of 200 by offset. The pages must add up to the reported `totalSize` without duplicate
  names, otherwise that DMO stops with `RELATIONSHIP_INVENTORY_INCOMPLETE`.
- Labels come from the Metadata API (`FieldSrcTrgtRelationship`), ten relationships per read,
  so a bare retrieve stays well below the org's hourly Metadata API request limit. A failed
  label read fails only the DMOs whose relationships it carried.
- Identical files are `unchanged`; a differing file needs `--overwrite`.

## Deploy

With `--source-dir`, the file must sit in a `data360/relationship/` folder and its name must
match `identity.apiName`. Two files with the same binding in one command are refused
(`DUPLICATE_IDENTITY`).

Deploy lists the source DMO's relationships; deploy finds the relationship by the file's name
first, otherwise by its binding (source object and field, target object and field):

- **Present with the file's values** (and its label, when the file states one): `unchanged`,
  nothing is written.
- **Absent:** one create request on the source DMO, then reads of the list until the
  relationship is `ACTIVE` with the requested cardinality and owner
  (`RELATIONSHIP_PERSISTENCE_UNCONFIRMED` otherwise; a status other than `ACTIVE` or `CREATING`
  stops the reads at once). The result names the created relationship in `targetApiName`. The
  create request carries no label; a file with a label gets it set by an update right after.
- **Present with other values:** updated (see below).

Salesforce requires the source DMO, and a target DMO, to be mapped. Otherwise the create
answers HTTP 400 `No ObjectSourceTargetMaps were found for the DMOs in the relationships.`,
reported as `RELATIONSHIP_HTTP_ERROR` with mutation `rejected`; the plugin does not check this
itself. Deploy the mappings first ([mapping.md](mapping.md)), or in the same command.

### Update

The Connect API has no relationship update, so deploy changes a relationship through the
Metadata API: one `updateMetadata` of the whole `FieldSrcTrgtRelationship` record (the org's
record, read first, with the file's label, cardinality, owner, source and target), sent over the
command's connection.

- The plugin then reads the relationship (and, for a label, the Metadata API record) until it
  holds the file (`RELATIONSHIP_PERSISTENCE_UNCONFIRMED` otherwise). The result is `updated`
  with mutation `confirmed-updated`; the preview lists the differing keys in `changes`.
- The relationship keeps its name.
- Salesforce accepts changes of label, cardinality and source field, and refuses changes of
  target field, target object and owner. A refusal is `RELATIONSHIP_UPDATE_REJECTED` with
  Salesforce's answer and mutation `rejected`; nothing is written. To change those values,
  delete the relationship and deploy the file again.
- An `UNKNOWN_EXCEPTION` answer when the org is unchanged is sent once more.

Deploy never deletes relationships.

### Order in a batch

Relationships run after DLOs, DMOs and mappings, so one command can create both objects, their
mappings and the relationship. A preview of a relationship whose DMO the same batch creates
reports `planned-dependencies` (`RELATIONSHIP_DEPENDENCIES_PLANNED`): nothing is compared until
the DMO exists.

## Delete

The selector names the source DMO and the relationship as the org knows it:
`sf data360 delete -m relationship:Order__dlm:<Name>`. A bare `relationship:<Name>` is refused
with `INVALID_SELECTION`.

- Delete reads no local file. It lists the source DMO's relationships and looks for the name,
  ignoring letter case.
- No match is `unchanged`, and so is a source DMO that does not exist (HTTP 404
  `ITEM_NOT_FOUND`), so a rerun after the DMO was deleted finishes. Any other list error stops
  the delete.
- Two matches are refused (`AMBIGUOUS_RELATIONSHIP_TARGET`); a match whose source object is
  another DMO is refused (`RELATIONSHIP_TARGET_BINDING_MISMATCH`, naming the right selector).
- In a `--changed-since` delete the source DMO and binding come from the deleted file's base
  content. When no relationship has that name but one with that binding exists under another
  generated name, the command refuses with `RELATIONSHIP_NAME_MISMATCH`, deletes nothing and
  names that relationship.
- Otherwise it sends one DELETE (`ssot/data-model-objects/relationships/{name}`) and reads the
  list until the relationship is gone (`RELATIONSHIP_DELETION_UNCONFIRMED` otherwise). An HTTP
  4xx answer reports mutation `rejected`. Salesforce allows deleting custom relationships; the
  plugin sends the request and reports the answer.
- In a delete command relationships run first, before mappings, DMOs and DLOs.
- `--preview` only reads. There is no confirmation prompt.
- After a confirmed deletion the local file is removed unless `--keep-local-files` is set; see
  [Local files after delete](../../README.md#local-files-after-delete) and
  [delete.md](delete.md).

## Data spaces

A relationship belongs to one data space, named as a string in `c__dataSpace`. Every
relationship REST request names the run's data space in the `dataspace` query (`default` when
`--dataspace` is left out); the Metadata API calls use record names, which are unique in the
org. Deploy and delete refuse a file of another data space
(`UNSUPPORTED_RELATIONSHIP_DATASPACE`); the message names both data spaces. See
[Data spaces](../../README.md#data-spaces).

## Error codes you act on

| Code                                                                                                     | What to do                                                    |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`RELATIONSHIP_HTTP_ERROR`](../errors/relationship/RELATIONSHIP_HTTP_ERROR.md)                           | Read Salesforce's answer; usually map the DMOs first.         |
| [`RELATIONSHIP_UPDATE_REJECTED`](../errors/relationship/RELATIONSHIP_UPDATE_REJECTED.md)                 | Delete the relationship and deploy the file again.            |
| [`RELATIONSHIP_INVENTORY_INCOMPLETE`](../errors/relationship/RELATIONSHIP_INVENTORY_INCOMPLETE.md)       | Retry the retrieve later; the list changed while it was read. |
| [`RELATIONSHIP_NAME_MISMATCH`](../errors/relationship/RELATIONSHIP_NAME_MISMATCH.md)                     | Delete by the name the message gives.                         |
| [`RELATIONSHIP_TARGET_BINDING_MISMATCH`](../errors/relationship/RELATIONSHIP_TARGET_BINDING_MISMATCH.md) | Use the selector the message names.                           |
| [`AMBIGUOUS_RELATIONSHIP_TARGET`](../errors/relationship/AMBIGUOUS_RELATIONSHIP_TARGET.md)               | Check the source DMO's relationships for duplicates.          |
| [`RELATIONSHIP_PERSISTENCE_UNCONFIRMED`](../errors/relationship/RELATIONSHIP_PERSISTENCE_UNCONFIRMED.md) | Retrieve the relationship and compare before deploying again. |
| [`RELATIONSHIP_DELETION_UNCONFIRMED`](../errors/relationship/RELATIONSHIP_DELETION_UNCONFIRMED.md)       | Check later with a read-only retrieve.                        |
| [`UNSUPPORTED_RELATIONSHIP_DATASPACE`](../errors/relationship/UNSUPPORTED_RELATIONSHIP_DATASPACE.md)     | Run with the file's `--dataspace`.                            |

The full list is in [docs/errors/README.md](../errors/README.md). The API evidence behind these
rules is on the sfmc.guide
[field relationship page](https://sfmc.guide/next/data-cloud-devops/field-source-target-relationship/)
of the [Data Cloud DevOps guide](https://sfmc.guide/next/data-cloud-devops/).
