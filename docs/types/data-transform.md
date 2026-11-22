# Data transforms

A data transform reads Data Cloud objects and writes the result into output Data Lake Objects (DLOs), as a batch or streaming job. The plugin retrieves the transform definition and its schedule into one JSON file, deploys that file by name and deletes a transform by name.

Transforms use API 68 (`--api-version auto` or `68.0`) in the run's data space. They never start a run.

## Commands

- `sf data360 retrieve -m data-transform:<Name>` reads one transform; bare `-m data-transform` reads every transform the API lists in the run's data space.
- `sf data360 deploy -m data-transform:<Name>` creates or updates the transform and its schedule. Select it by `-m`, by file or folder with `--source-dir`, or with `--changed-since`. `--allow-processing` is not needed.
- `sf data360 delete -m data-transform:<Name>` deletes the transform.

```sh
sf data360 retrieve -m data-transform:Example --target-org SOURCE_ALIAS --api-version 68.0 --json
sf data360 deploy -m data-transform:Example --preview --target-org TARGET_ALIAS --json
sf data360 deploy -m data-transform:Example --target-org TARGET_ALIAS --json
```

A retrieve or deploy can hold several transforms, alone or beside other types.

## File

Each transform is one file: `data360/dataTransforms/<Name>.dataTransform.json`.

The file holds the transform's native input as Salesforce returns it: `name`, `label`, `description`, `type`, `dataSpaceName`, `fullRunFrequency`, `definition` or `definitions`, and `parameters`, `tags`, `capabilities`, `currencyIsoCode` and `primarySource` when present. STL node graphs, DCSQL manifests, several outputs, `writeMode`, `dedupOrder` and the output object definitions stay as read. Left out are the definition's own `schedule` (the schedule has its own route, see below) and the `id`, `createdDate`, `lastModifiedDate` and `status` of each output object.

The plugin checks only that the file is plain JSON with a valid name, exactly one of `definition` and `definitions`, only the input keys above, a `schedule` that is an object and, when `dataSpaceName` is present, a data space name that `c__dataSpace` names too. A failed check is `UNSUPPORTED_TRANSFORM_INPUT` or `INVALID_DATASPACE_FIELD`, naming the key; everything else is sent as written and Salesforce decides.

Retrieve keeps what the plugin does not model:

- A top-level key of the GET that is neither an input key nor server-owned (`id`, `status`, `creationType`, `createdBy`, `createdDate`, `lastModifiedBy`, `lastModifiedDate`, `actionUrls`, `url`, `namespace`, `lastRun*`) stays in the file, and deploy refuses the file, naming the key.
- A `null` `definition` or `definitions` beside the other one is left out. A transform with both is written as Salesforce returns it, with that check as reason, and deploy refuses it.
- System transforms (`creationType` `SYSTEM`, such as the `Dg_…` transform a data graph makes, whose definition reads only as `STL_HIDDEN`) and packaged (namespaced) transforms are written like custom ones.

### Output DLOs

Salesforce decides about outputs. It refuses, for example, an STL output DLO that does not exist, an output equal to its source DLO and a `STREAMING` transform with an STL definition. An STL transform can write to a DLO created directly with a [DLO deploy](dlo.md); no data stream is needed for that output. Precreating is not needed for every transform: a DCSQL definition creates the output DLOs it declares, and that DLO stays when the transform is deleted.

## Schedule

The file's top-level `schedule` holds the transform schedule, read with `GET …/data-transforms/{name}/schedule` and reduced to the keys its PUT takes: `frequency`, `interval`, `daysOfWeek`, and `time` with `hour`, `minute` and `timeZone`.

```json
"schedule": { "frequency": "Daily", "interval": 1, "time": { "hour": 3, "minute": 15, "timeZone": "GMT" } }
```

- A transform without a schedule (`frequency` `None`, or an empty schedule) gets no `schedule` key. A system transform has one schedule per definition; retrieve keeps that map.
- `shouldForceSpecifiedMinutes` is write-only: a file may carry it and deploy sends it, but it is never compared.
- The schedule read is best effort on retrieve: when it fails, the file has no `schedule` and a warning says so.

Deploy treats `schedule` as the desired schedule. Without the key, the schedule is left alone. With it, deploy compares it with the org's schedule (frequency ignoring letter case). When it differs, deploy sends it as written with one `PUT …/schedule` after the definition and reads it back (`TRANSFORM_READBACK_MISMATCH` when the frequency differs). When only the schedule differs, that PUT is the only write.

- `{ "frequency": "None" }` turns the schedule off. Write it explicitly; retrieve never writes it.
- Salesforce takes `Hourly` (with `daysOfWeek`), `Daily` (with `interval`) and `None`, and refuses `Weekly` for a custom transform.
- A schedule deployed to another org makes the transform run there, so preview and deploy report `TRANSFORM_SCHEDULE_CHANGE` whenever the schedule is sent. Remove `schedule` from the file to keep the target org's schedule.
- After a definition write the transform is `PROCESSING`, and Salesforce refuses a schedule PUT until it is active. Deploy reads the transform every 5 seconds for at most 5 minutes. If it is still processing, the schedule is not sent (`TRANSFORM_SCHEDULE_NOT_SENT`); a 4xx answer to the schedule PUT is `TRANSFORM_SCHEDULE_REJECTED`. In both cases the item is `failed` with mutation `confirmed-created` or `confirmed-updated`: the definition was written, the schedule was not.

## Deploy

Deploy reads the complete transform list and looks for the name in the file, ignoring letter case: no match sends one create POST, one match updates that record with one PUT (or reports `unchanged` when the file equals the transform as retrieve writes it), and two or more matches are refused (`TRANSFORM_TARGET_NOT_RESOLVED`) before any write. A match whose name differs only in letter case is refused (`TRANSFORM_IDENTITY_MISMATCH`).

An update replaces the whole transform: a field the file leaves out is reset by Salesforce (`fullRunFrequency` to `DAILY`, `writeMode` to `OVERWRITE`), so keep the retrieved file complete. A definition PUT keeps the schedule.

- Salesforce stores a normalized form (upper-case values such as `WEEKLY`; a DCSQL definition without `version` and with empty `macros` and `sources`). Retrieve after deploying a hand-written file to keep the stored form.
- Values chosen from a fixed list (`type`, `fullRunFrequency`, an output's `category`, `type` and field `type`, `writeMode`) are sent as written and compared ignoring letter case, so `Daily` against a stored `DAILY` is `unchanged`. Any other difference from the stored form is sent again on each deploy.
- A transform of any owner is sent and Salesforce decides. It refuses writes to a system transform (an update with 400, a schedule PUT with 403, a create from its file with 400). A 4xx answer to the first write is reported as `failed` with mutation `rejected`: nothing was written.
- Writes to packaged (namespaced) transforms are untested.
- `--allow-processing` is not needed.
- Transforms run in their own phase, one after another: after streams and DLO, DMO, mapping and relationship items, and before identity resolution, calculated insights, segments and data graphs. The first transform that does not succeed stops the run.

**Preview and checks.** Preview reads only (the transform list and the target) and does not run Salesforce's validation. Create runs Salesforce's validation first; update skips it. An unchanged repeat makes no write. The file is read again after the preview reads and before the write, and an update checks the target definition and schedule again right before the first write. After the writes the transform is read back by ID and must have the same ID and name; Salesforce's stored definition is not compared with the file. A failure after a write was sent, other than Salesforce's refusal of the first write, is an unknown outcome and is never replayed.

## Delete

`sf data360 delete -m data-transform:Name` deletes one transform; one command may name several, each deleted on its own in the transform phase. `--preview` only reads.

- The name is resolved to the record ID through the complete transform list, ignoring letter case. No match is `unchanged`; two or more are refused (`TRANSFORM_TARGET_NOT_RESOLVED`).
- A transform whose status is `PROCESSING` is refused before the DELETE (`TRANSFORM_DELETE_PROCESSING`, also in `--preview`), because Salesforce answers such a DELETE but keeps the transform. Wait and rerun.
- A transform of any owner is sent. Salesforce refuses a system transform (403), reported as `failed` with mutation `rejected` (`REQUEST_FAILED`).
- One DELETE is sent without retry. The deletion is confirmed when the transform list omits both ID and name within 60 seconds; otherwise the result is `deletion-unconfirmed` (nonzero exit, never replayed). A 404 or a non-HTTP error is unconfirmed too.
- Delete removes no DLO, run or data. After a confirmed deletion the local file is removed unless you pass `--keep-local-files` (see [Local files after delete](../../README.md#local-files-after-delete) and [Delete](delete.md)).

## Data spaces

A transform's name is unique in the org, and the transform list ignores data spaces. The file names its data space in `c__dataSpace`, which must agree with `definition.dataSpaceName` when the definition names one (`INVALID_DATASPACE_FIELD` otherwise); deploy sends `dataSpaceName` as written.

- A transform whose GET names no `dataSpaceName` (one built in the UI on DLOs, or one with `definitions`) takes its data space from its `MktDataTransform` record, read once with SOQL over the command's connection (`TRANSFORM_DATASPACE_UNREADABLE` when that read fails). An output DLO such a transform creates belongs to no data space. A transform without any data space there (a system transform) is handled in `default` only.
- Bare retrieve keeps the transforms of the run's data space. Retrieve, deploy and delete refuse a file, or an org transform, of another data space (`TRANSFORM_DATASPACE_MISMATCH`). On retrieve that is a failed item that names both data spaces; the other selected transforms still run.
- A create outside `default` needs `definition.dataSpaceName`, the only way a create names its data space.
- Names are sent as stored. A transform SQL in a non-default data space that names the default spelling of a standard DMO reads the default object; the plugin does not rewrite it.
- Only if you have more than one data space: `--allow-cross-dataspace` (`-c`) deploys a DCSQL transform file of another data space, or an STL one made of load, join, formula, filter, SQL filter (`sqlFilter`), aggregate, append (`appendV2`) and output nodes. Its name gets the target prefix (`CopyOrders` becomes `ds2_CopyOrders`), `dataSpaceName` and the sample data space become the target, and the DMOs and fields of its nodes, output field mappings, join keys, filter, aggregate and append fields and output objects follow the DMO rules; DLO names stay. Formula and SQL filter expressions are rewritten name by name (a join side's field as `"R.Name__c"` follows that side), also when Salesforce returned them HTML-escaped (`&quot;`), and keep their form. The columns a formula or aggregate adds keep their names, except that an `ssot__` name from `default` drops it like the fields; towards `default` from an identity resolution output, where such a column would take `ssot__`, the file is refused. Salesforce does not check field names inside expressions, so any name that cannot be placed exactly is refused ([`CROSS_DATASPACE_UNRESOLVED`](../errors/general/CROSS_DATASPACE_UNRESOLVED.md)). A DCSQL transform gets the same name and data space changes; the SQL of each manifest node (`compiled_code`, and `raw_code` when present) is rewritten name by name like the SQL of a calculated insight, and each node's output (`relation_name`) and the output objects follow the DMO rules, a `dataspaceName` of an output object becomes the target; DLO names and fields stay. The top-level columns of a node land by name in the fields of the output object its `relation_name` names. A node whose `relation_name` names no output object is an intermediate model: its `relation_name` follows the DMO rules (a DLO keeps its name), and its columns are checked as below against that object's fields as the nodes reading it see them (a DLO keeps its fields, a DMO's follow its rule); a node without a `relation_name` is refused. An alias spelled like an output field follows that field (`AS ssot__Name__c` becomes `AS Name__c` when the field drops `ssot__`), and so do its uses in `ORDER BY` and `HAVING`; in `WHERE` and `GROUP BY` such a name is the table's column. A node's `config` (`materialized`) is kept; a value in it that holds an object or field name (such as `unique_key`) is refused. A column without an alias is refused when its name in the target differs from its field's name there, such as a column that keeps its name while its field changes, or a column whose name changes into an output DLO, which keeps its fields: write it with `AS` and the field name as the source data space spells it. `*` over a table that is not a DLO is refused too, and so is `*` over a DLO when the output object's fields change (a DLO's columns keep their names): list the columns. Any other STL node, a DCSQL node without SQL in `compiled_code`, and transforms of other types are refused before any write ([`CROSS_DATASPACE_UNSUPPORTED`](../errors/general/CROSS_DATASPACE_UNSUPPORTED.md)). After the deploy the translated file is written under the new name. See [Deploy from another data space](../../README.md#deploy-from-another-data-space-only-if-you-have-more-than-one-data-space).
- Only if you have more than one data space: a transform's name carries its data space's prefix (`ds2_CopyOrders` in `dataspace2`), and in `default` no other space's prefix. Deploy refuses a new transform that breaks this before any write ([`TRANSFORM_PREFIX_MISMATCH`](../errors/data-transform/TRANSFORM_PREFIX_MISMATCH.md)); for an existing one deploy and retrieve only warn. Transforms Salesforce generates (`Dg_…`) are not checked. See [Name prefixes](../../README.md#name-prefixes-only-if-you-have-more-than-one-data-space).

See [Data spaces](../../README.md#data-spaces) for the general rules.

## Error codes you act on

- [`UNSUPPORTED_TRANSFORM_INPUT`](../errors/data-transform/UNSUPPORTED_TRANSFORM_INPUT.md): remove or fix the key the message names, or retrieve again.
- [`TRANSFORM_SCHEDULE_CHANGE`](../errors/data-transform/TRANSFORM_SCHEDULE_CHANGE.md): the schedule will be sent and the transform will run in the target org.
- [`TRANSFORM_SCHEDULE_NOT_SENT`](../errors/data-transform/TRANSFORM_SCHEDULE_NOT_SENT.md), [`TRANSFORM_SCHEDULE_REJECTED`](../errors/data-transform/TRANSFORM_SCHEDULE_REJECTED.md): the definition was written; deploy again once the transform is active, or fix the schedule.
- [`TRANSFORM_TARGET_NOT_RESOLVED`](../errors/data-transform/TRANSFORM_TARGET_NOT_RESOLVED.md), [`TRANSFORM_IDENTITY_MISMATCH`](../errors/data-transform/TRANSFORM_IDENTITY_MISMATCH.md): fix the name so it matches exactly one transform.
- [`TRANSFORM_DELETE_PROCESSING`](../errors/data-transform/TRANSFORM_DELETE_PROCESSING.md): wait until the transform is no longer processing.
- [`TRANSFORM_DATASPACE_MISMATCH`](../errors/data-transform/TRANSFORM_DATASPACE_MISMATCH.md): run in the transform's data space.

All codes: [error codes](../errors/README.md). Evidence and API details: [Data Transforms on sfmc.guide](https://sfmc.guide/next/data-cloud-devops/data-transforms/) and the [Data Cloud DevOps guide](https://sfmc.guide/next/data-cloud-devops/).
