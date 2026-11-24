# Data streams

A data stream brings source data into Data Cloud and lands it in its own Data Lake Object (DLO), the landing DLO. The plugin retrieves a stream into one JSON file, deploys that file back by creating or updating the stream, and deletes a stream by name, optionally together with its landing DLO.

The plugin handles Ingestion API streams and streams of every other connector in a GET-shaped file. It uses API 68 (`--api-version auto` or `68.0`) in the run's data space.

## Commands

- `sf data360 retrieve -m data-stream:<Name>` reads one stream; bare `-m data-stream` reads every stream the API lists, each through the same exact path.
- `sf data360 deploy -m data-stream:<Name>` creates or updates the stream. Use `--preview` first; a create or update needs `--allow-processing`.
- `sf data360 delete -m data-stream:<Name>` deletes the stream and keeps its DLO; add `--delete-dlo` to delete the landing DLO too.

## File

Each stream is one file: `data360/data-stream/<Name>.data-stream-meta.json`.

- **Ingestion API streams** use a fixed document shape: identity, connection, event, labels and primary key, plus a read-only `observed` part. `spec.refreshMode` holds the refresh mode, `spec.newDlo.category` the DLO category (absent when the DLO has none), `spec.newDlo.eventDateTimeFieldName` the event time field of an Engagement DLO, `spec.additiveFieldMappings` each mapping of a source field onto another field and `spec.formulaMappings` each formula mapping (`targetFieldName`, `formula` as plain text, `targetFieldReturntype`). The partition-date formula Salesforce adds to an Engagement DLO is left out. Retrieve sorts `observed.mappings` by target field, then source field, so retrieving an unchanged stream again is `unchanged`.
- **Streams of every other connector** (`connectorInfo.connectorType`, for example `SalesforceDotCom` for Salesforce CRM) are written under `spec` in the shape of the stream GET, without what Salesforce owns or adds: record ID, status, run status, `isEnabled`, `dataSource`, the DLO ID and status, duplicate echoes such as `connectorDetails.type` and `dataLakeFieldInfoRepresentation`, source date formats and the system fields and mappings (`KQ_*`, `DataSource`, `DataSourceObject`, `SfdcOrganizationId`, `cdp_sys_*`). For a CRM stream the file-import refresh keys (`hasHeaders`, `shouldFetchImmediately`, `shouldTreatMissingFilesAsFailures`) are left out too; another connector keeps them as its settings. Formulas are stored decoded.
- A connection can feed several Ingestion API streams, one per event. The stream GET does not name its event, so retrieve matches the stream to its event from the generated name (`<connection>_<event>_<hash>`) or label (`<connection>-<event>`), and from the source fields when several events fit.
- A stream whose GET fits neither file shape (no connector type, a mapping the file cannot hold, drifted fields) is written as-is with the failed check as reason, and deploy does not send it. A stream whose source fields differ from its event schema (`STREAM_SOURCE_DRIFT`) or whose DLO fields differ from its own (`STREAM_DLO_DRIFT`) is one of these: the file holds neither the source fields nor the DLO fields, so a deploy could not reproduce them.

## Order: stream, DMO, then mapping

A stream creates its landing DLO. It does not create a DMO, DMO fields or a DLO-to-DMO mapping.

1. Deploy the stream. Do not create a standalone DLO as a substitute for its landing DLO.
2. Create or prepare the [DMO](dmo.md) and its fields. This can happen before, after or in parallel with step 1.
3. Deploy the [mapping](mapping.md) last, once both objects and their fields exist.

Salesforce ignores the authored name of a new Ingestion API stream: it names the stream `<connection>_<event>_<8 hex>` and the landing DLO after it. Deploy reports that name as `targetApiName`. Retrieve the stream by that name and keep the retrieved file; deploying the authored file again is blocked because the name no longer matches. Deploy finds an existing Ingestion API stream by connection and event, so a file retrieved from another org updates the stream of the same event there.

One deploy can hold streams, DLOs, DMOs and mappings: streams run first, then the DLO → DMO → mapping order. A mapping onto the landing DLO of a stream that does not exist yet needs the DLO name Salesforce gives it, so deploy a new stream first and map its reported DLO in a second run. Do not add a DLO file named like the landing DLO of a stream the same deploy creates: the new stream owns that DLO, and deploy refuses the pair before any write (`DATA_STREAM_DLO_COLLISION`). The DLO file of an existing stream deploys beside it.

## Create and update

Create and update send the file as written and Salesforce decides. Its refusal is reported as `rejected` with Salesforce's text. An unchanged stream needs no `--allow-processing` and makes no write.

**Ingestion API streams.**

- Create sends only the primary key as DLO field (Salesforce adds every schema field with its type), the additive mappings, the formulas and, with formulas, the event's typed source fields. The refresh mode is sent as written; Salesforce creates an Ingestion API stream with `UPSERT` only and refuses other modes.
- An update is one PATCH with the added or changed additive mappings and formulas, and an empty formula for each mapping removed from the file. The file is the desired state of the mappings. Salesforce refuses changing or removing an existing mapping and a new field type (HTTP 400, reported as rejected).
- Each additive mapping needs an existing source-event field with that label. Refused before any write: an additive mapping whose source label names no event field, or several (`UNSUPPORTED_STREAM_MAPPING_SOURCE`). Salesforce would store such a mapping unchecked, and it would never carry data.

**Other connectors.**

- Deploy translates the file into the create input: `dataStreamType`, `dataSpaceInfo`, `fields` and `sourceFields[].datatype` become `datastreamType`, `dataspaceInfo` (name only), `dataLakeFieldInputRepresentations` and `dataType`. Plain field mappings are left out (Salesforce maps the source fields) and each formula is sent as `transformationFormula` with the DLO field's type.
- Absent (HTTP 404) creates the stream and its DLO. Otherwise one PATCH carries `datastreamType` and only the changed parts: formula mappings one by one (an empty formula removes one) and refresh settings key by key. A new return type of an existing formula is sent with the formula.
- On create Salesforce maps custom CRM fields to DLO fields without the double underscores (`Type__c` to `Type_c`, `FSL__Offset__c` to `FSL_Offset_c`) and refuses a DLO field named otherwise. Plain mappings that differ from what Salesforce maps are reported as `STREAM_CHANGE_NOT_APPLIED`.
- Salesforce checks each `sourceFields[].dataType` against the source object and refuses a change of `refreshConfig.refreshMode`.
- To add a formula field, add its mapping (`targetFieldName`, `formula`) and its DLO field to the file.
- Create and update are read back until the stream is `ACTIVE`.
- Salesforce CRM is the only other connector the plugin is tested with; others, such as S3 or streaming apps, are untested and sent as written. They use the same file and the same create and update.

**Label changes (all connectors).** A changed label is sent first, as one Metadata API `updateMetadata` of the stream's `DataStreamDefinition` over the command's connection, because Salesforce ignores a label in the PATCH. A refusal is `STREAM_LABEL_UPDATE_REJECTED`, a failed read of the record before it is `STREAM_LABEL_READ_FAILED` (nothing sent), and a label still unchanged after three reads is `STREAM_CHANGE_NOT_APPLIED`.

## Refused before any write

`UNSUPPORTED_STREAM_SETTINGS_CHANGE` stops these changes before anything is sent:

- a change of the refresh mode, DLO label, category, event time field or primary key of an existing stream. Salesforce answers 200 and keeps the old value, and the primary key has no write at all;
- for other connectors, a plain mapping that is added, removed or changed. The stream update takes no `sourceFieldName`, and the stream's Metadata API mapping record answers success to a removed or changed pair but keeps the old pair.

Also refused before any write: an additive mapping whose source label names no event field (`UNSUPPORTED_STREAM_MAPPING_SOURCE`), a new stream whose landing DLO collides with a selected DLO file (`DATA_STREAM_DLO_COLLISION`) and a file of another data space (`STREAM_DATASPACE_MISMATCH`).

## Add a landing DLO field through its stream

For a DLO that a stream owns, add fields through the stream, not through a [DLO](dlo.md) deploy. Retrieve the stream first:

```sh
sf data360 retrieve -o target -m data-stream:ExampleStream --api-version auto --output-dir . --json
```

Then append an entry to `spec.additiveFieldMappings`, keeping the existing entries. This is a fragment, not a complete file:

```json
{
  "sourceFieldLabel": "ContactEmail",
  "targetFieldName": "ExtraContactEmail",
  "targetFieldReturntype": "Text"
}
```

- `sourceFieldLabel` must be the label of an existing source-event field. The stream does not extend the source-event schema.
- `targetFieldName` is the new landing field without `__c`; the DLO field becomes `ExtraContactEmail__c`.
- `targetFieldReturntype` is the type of the new field, for example `Text` or `Number`.
- Salesforce decides on the source (the primary key is accepted), the type and the target (it refuses an existing field or a reserved name such as `KQ_*` or `DataSource`).

Preview, then deploy with the processing acknowledgement:

```sh
sf data360 deploy -o target -m data-stream:ExampleStream --api-version auto --preview --json
sf data360 deploy -o target -m data-stream:ExampleStream --api-version auto --allow-processing --json
```

The stream does not create DMO fields or mappings. Prepare the DMO field and deploy the mapping as separate steps.

## Delete

Preview the delete first. By default the landing DLO stays; `--delete-dlo` deletes it with the stream.

- The stream is read from the org and identity, binding and dependency checks run right before the DELETE. Completion is confirmed by independent reads, not by HTTP success alone.
- The DELETE is sent once, on the same authenticated connection as the reads, without token refresh, HTTP retry or redirects. An expired session stops with HTTP 401; sign in again and rerun.
- A stream whose first read answers `404` is already gone: it reports `unchanged` with mutation `not-attempted`, with or without `--delete-dlo`, so the same delete can be rerun.
- Delete is refused while anything other than the stream depends on the stream or its landing DLO (`STREAM_DELETE_DEPENDENCIES_BLOCKED`). When the same command also deletes exactly those dependent mappings and DMOs, the preview reports `planned-dependencies` (`DEPENDENCIES_PLANNED`), and the real run checks the dependencies again after the earlier phases deleted them.
- After a confirmed deletion the stream file is removed, and with `--delete-dlo` the DLO file too, unless you pass `--keep-local-files` (see [Local files after delete](../../README.md#local-files-after-delete) and [Delete](delete.md)).

## Data spaces

A stream belongs to the data spaces of its landing DLO. Its file lists them in `c__dataSpace` like a DLO file, and that list only mirrors the DLO: change data spaces through the [DLO file](dlo.md), never through a stream file.

- **Retrieve** reads the streams whose DLO belongs to the run's data space and writes every data space of the DLO. A GET-shaped file also keeps Salesforce's own list in `spec.dataLakeObjectInfo.dataSpaceInfo`, which must name the same spaces. A stream outside the run's data space, or whose data spaces cannot be read, is a failed item and no file is written.
- **Deploy** refuses a file whose list does not hold the run's data space or, for an existing stream, differs from the DLO's data spaces (`STREAM_DATASPACE_MISMATCH`). A new stream creates its landing DLO in the run's data space only, so its file lists that data space alone; add the others through the DLO file afterwards and retrieve the stream again. A GET-shaped file without `dataSpaceInfo` gets it from `c__dataSpace`.
- **Delete** works for a stream whose DLO belongs to the run's data space. `--delete-dlo` is refused when the DLO also belongs to another data space (`DLO_DELETE_OTHER_DATASPACES`).

See [Data spaces](../../README.md#data-spaces) for the general rules.

## Error codes you act on

- [`DATA_STREAM_DLO_COLLISION`](../errors/data-stream/DATA_STREAM_DLO_COLLISION.md): remove the DLO file named like the landing DLO of a new stream.
- [`UNSUPPORTED_STREAM_MAPPING_SOURCE`](../errors/data-stream/UNSUPPORTED_STREAM_MAPPING_SOURCE.md): use the label of one existing source-event field.
- [`UNSUPPORTED_STREAM_SETTINGS_CHANGE`](../errors/data-stream/UNSUPPORTED_STREAM_SETTINGS_CHANGE.md): keep the stream settings and plain mappings as retrieved.
- [`STREAM_DATASPACE_MISMATCH`](../errors/data-stream/STREAM_DATASPACE_MISMATCH.md): run in the stream's data space, or fix `c__dataSpace`.
- [`STREAM_DELETE_DEPENDENCIES_BLOCKED`](../errors/data-stream/STREAM_DELETE_DEPENDENCIES_BLOCKED.md): delete the dependents first, or in the same command.
- [`STREAM_LABEL_UPDATE_REJECTED`](../errors/data-stream/STREAM_LABEL_UPDATE_REJECTED.md), [`STREAM_CHANGE_NOT_APPLIED`](../errors/data-stream/STREAM_CHANGE_NOT_APPLIED.md): retrieve the stream and compare before deploying again.

All codes: [error codes](../errors/README.md). Evidence and API details: [Data Streams on sfmc.guide](https://sfmc.guide/next/data-cloud-devops/data-stream-definition/) and the [Data Cloud DevOps guide](https://sfmc.guide/next/data-cloud-devops/).
