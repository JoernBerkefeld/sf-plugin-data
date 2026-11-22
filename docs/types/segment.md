# Segments

A segment selects the members of a DMO (for example individuals) by SQL, by criteria built in the segment canvas or by combining other segments. The plugin retrieves a segment into a JSON file plus one SQL file per model, deploys it by name, deletes it by name, publishes it and exports its members.

Segments use API 68 only: `--api-version auto` or `68.0`; any other version is refused with `INVALID_SCOPE`. They work in the run's data space.

## Commands

- `sf data360 retrieve -m segment:<Name>` reads one segment; bare `-m segment` reads every segment of the run's data space the API lists (200 per page; one failing segment never blocks the others).
- `sf data360 deploy -m segment:<Name>` (or `--source-dir <file>`) creates or updates the segment. Create and update need `--allow-processing`.
- `sf data360 delete -m segment:<Name>` deletes the segment.
- `sf data360 publish -m segment:<Name>` publishes the segment and waits for the result; `--async` starts the publish and returns at once.
- `sf data360 segment members export -m segment:<value>` writes the members of a published segment as CSV or JSON rows.

## Files

Each segment is one `data360/segments/<Name>.segment.json` and, beside it, one `<Name>.segment.<model>.sql` per model holding that model's SQL as plain text. For example `Example_Segment.segment.json` and `Example_Segment.segment.Example_Segment.sql`:

```json
{
  "schemaVersion": 1,
  "kind": "segment",
  "c__dataSpace": "default",
  "identity": { "apiName": "Example_Segment" },
  "spec": {
    "displayName": "Example Segment",
    "description": "",
    "segmentType": "DBT",
    "segmentOn": { "kind": "dmo", "apiName": "ssot__Individual__dlm" },
    "models": [{ "name": "Example_Segment" }],
    "lookbackPeriod": "P90D"
  }
}
```

```sql
SELECT ssot__Individual__dlm.ssot__Id__c FROM ssot__Individual__dlm WHERE ssot__Individual__dlm.ssot__FirstName__c IS NOT NULL
```

- Deploy, delete and `--changed-since` join the JSON with exactly one SQL file per model. The JSON or any of its SQL files selects the segment. A missing or extra `<Name>.segment.*` file, or a `sql` key left in the JSON, is refused with `INVALID_SOURCE`.
- A model name starts with a letter or digit and holds only letters, digits and underscores; two model names may not differ only in letter case (`INVALID_SEGMENT_DOCUMENT`).
- The SQL file holds plain SQL as Salesforce stores it: the plugin asks Salesforce for plain text, and the read after a deploy compares that SQL with the file. Deploy sends the plain SQL, which Salesforce stores as sent.
- A repeat retrieve of an unchanged segment writes nothing (`unchanged`). With `--overwrite` the SQL file of a model the segment no longer has is removed.
- The plugin checks the structure only: the keys above, plain text values and a list of models with a name and SQL. The SQL, the model names and whether the DMO suits the segment are not checked locally; the file is sent as written and Salesforce decides. Salesforce requires every SQL column fully qualified as `Table.column` with the DMO API name as the table (for example `ssot__Individual__dlm.ssot__Id__c`) and refuses unqualified columns and table aliases.
- The lookback (`lookbackPeriod`) is sent as written; Salesforce decides which periods it takes.
- An unknown key stays in the file, and deploy refuses it (`UNKNOWN_SEGMENT_CONFIGURATION`).
- The file holds no `parameters`, because the API has no write for them. A segment with parameters is retrieved as-is (`UNSUPPORTED_SEGMENT_VARIANT`). Segment XML input is not supported.

### Schedule

A segment that refreshes on a schedule gets a `schedule` key in `spec`, in the shape the write takes:

```json
"schedule": {
  "frequency": "Weekly",
  "interval": 1,
  "daysOfWeek": ["Monday"],
  "startDateTime": "2030-01-07T03:00:00.000Z"
}
```

- End dates are kept as `endDate` and `endDateTime`, and a refresh without schedule details (an hourly interval) as `publishInterval`; deploy sends them as `publishScheduleEndDate`, `publishScheduleEndDateTime` and `publishSchedule`. An optional `time` (`{ "hour": 3, "minute": 0, "timeZone": "UTC" }`) is sent too, but Salesforce does not read it back, so it is not compared and a change of the time alone is not deployed.
- Retrieve leaves the key out for a segment that does not refresh. A file without `schedule` leaves the org schedule alone.
- Otherwise only the keys the file states are compared with the org schedule; a key left out keeps its org value. When one differs, the create or PATCH carries the keys of the file, and the read after the write checks that dates the file leaves out are unchanged (`SEGMENT_READBACK_MISMATCH` otherwise).
- `{ "frequency": "None" }` turns the schedule off. A `null` schedule value is refused (`INVALID_SEGMENT_DOCUMENT`).
- Salesforce decides about the values (a weekly schedule takes exactly one day). It clears the schedule of a UI segment but refuses every way to clear the schedule of a DBT segment; only deleting the segment removes it. That refusal is reported as `rejected`.
- A deployed schedule makes the segment publish on it in the target org, so preview and deploy report `SEGMENT_SCHEDULE_CHANGE`.
- Schedule details the plugin does not know are retrieved as-is (`UNSUPPORTED_SEGMENT_VARIANT`); a file without `schedule` still updates such a segment and keeps its schedule.

### Segment canvas (UI) segments

A segment built in the segment canvas (`segmentType` `UI`) has no SQL files. Its file holds the criteria as a JSON object in `spec.includeCriteria` instead of `models`:

```json
"segmentType": "UI",
"segmentOn": { "kind": "dmo", "apiName": "UnifiedssotIndividualMkt__dlm" },
"includeCriteria": {
  "type": "TextComparison",
  "subject": { "objectApiName": "UnifiedssotIndividualMkt__dlm", "fieldApiName": "ssot__FirstName__c" },
  "operator": "equal",
  "values": ["Example"]
},
"lookbackPeriod": "P90D"
```

- Salesforce returns the criteria as a JSON string (the plugin asks for plain text); retrieve stores it as a JSON object, and deploy sends it back as a plain JSON string with `segmentCreationFlow` `Headless`, which the API requires.
- The criteria are not checked locally; Salesforce decides. It adds its own keys to the stored criteria (`selfReference`, `subjectFieldDataType` and similar). A deploy is confirmed when every key of the file holds the same value in the org; retrieve afterwards to keep the stored form, and a repeat deploy of that file is `unchanged`.
- Salesforce refuses a PATCH while the segment is still `PROCESSING` after a create (HTTP 403 `ENTITY_SAVE_ERROR`); deploy again once it is `ACTIVE`.
- Criteria that are not a JSON object are retrieved as-is (`UNSUPPORTED_SEGMENT_VARIANT`). A key the plugin does not know (for example exclusion criteria) stays in the file and is refused on deploy. Criteria over related objects may be refused by Salesforce.

### Other segment types

Other types (for example `Waterfall`, `Dynamic` or `EinsteinGptSegmentsUI`) use the same keys without SQL files, with the lookback only when the segment has one. Deploy sends them as written and Salesforce decides.

- A Waterfall lists its child segments by API name, in priority order: `"childSegments": ["Example_Gold", "Example_Silver"]`. Salesforce stores each child by its ID, which differs between orgs: retrieve names the children with one read of the segment list, and deploy reads each child in the target org and sends its ID there.
- A child must exist in the target org or be selected in the same deploy, which deploys the child first (preview reports the Waterfall as `planned-dependencies`). Children outside the selection are read before the first write of the run; a missing one stops the run before any write (`SEGMENT_CHILD_NOT_FOUND`).
- A Waterfall file without `childSegments` leaves the children of the org segment alone.
- A child retrieve cannot name, and criteria of other types (`includeCriteria` of a Dynamic or Einstein segment), are kept as read, and deploy refuses that file (`UNKNOWN_SEGMENT_CONFIGURATION`).
- Salesforce refuses every update of an `EinsteinGptSegmentsUI` segment (400) and refuses to delete one through the segments route (`DELETE_NOT_ALLOWED`). The plugin reports both answers.

## Deploy

Check with `--preview` first. The segment is read by its exact name:

- HTTP 404 `ITEM_NOT_FOUND` creates it with one POST; an existing segment is updated with one PATCH of the whole definition; an identical one is `unchanged` without a write and needs no acknowledgement.
- Create and update need `--allow-processing`.
- The DMO named in `segmentOn` must exist in the target. One read binds its ID, and the segment read back after the write must be built on it.
- A 4xx refusal of the POST or PATCH is `failed` with mutation `rejected` (`REQUEST_FAILED`, or `SEGMENT_CREATE_CONFLICT` for 409): nothing was written, and Salesforce's message is shown.
- After the write the segment is read back until `ACTIVE`, or `PROCESSING` / `COUNTING` after an accepted write. The suffix `(server is still processing)` means accepted configuration, not completed computation. Nothing is retried or rolled back.
- The first segment on a DMO makes Salesforce generate the membership DMOs a few seconds after the create; the read after the create waits for them within its budget.

## Delete

`sf data360 delete --metadata segment:<Name>`; `--preview` is read-only and execution needs no confirmation flag.

- The segment is read from the org by name (one the org does not have is `unchanged`) and must agree with fresh identity, definition and source-DMO checks.
- One DELETE is sent. An independent exact read answering 404 confirms the deletion; Salesforce may instead report that it is still processing.
- Unknown outcomes stop without retry, replay, fallback or rollback.
- Generated membership DMOs are not deleted, and storage or credit cleanup is not covered.
- After a confirmed deletion the JSON file and every `<Name>.segment.*.sql` beside it are removed unless you pass `--keep-local-files` (see [Local files after delete](../../README.md#local-files-after-delete) and [Delete](delete.md)).

## Publish

`sf data360 publish` starts one publish of one segment and waits for its result, or, with `--async`, returns once it started.

```sh
sf data360 publish -o target -m segment:Example_Segment --preview --json
sf data360 publish -o target -m segment:Example_Segment --wait-timeout 3600
sf data360 publish -o target -m segment:Example_Segment --async --json
```

- `-m segment:<Name>` publishes the segment as the org holds it. `-d data360/segments/<Name>.segment.json` (or one of its SQL files) requires the org to hold the definition of the file (`SEGMENT_PUBLISH_DEFINITION_MISMATCH` otherwise: deploy it first). A file retrieved as-is is refused with `VERBATIM_NOT_DEPLOYABLE`.
- The segment is read by name (absent: `SEGMENT_PUBLISH_ADMISSION_FAILED`), then one POST `/ssot/segments/<marketSegmentId>/actions/publish` starts the publish. It needs no acknowledgement flag and is never resent.
- Salesforce decides whether the segment can be published now, also while it is `PROCESSING` or `COUNTING`. A refusal is `SEGMENT_PUBLISH_REJECTED` with Salesforce's text.
- The command then reads the segment every 30 seconds (progress on stderr) until `publishStatus` is `SUCCESS` (`published`) or `FAILED` (`SEGMENT_PUBLISH_FAILED`).
- `--wait-timeout <seconds>` sets that wait (default 1800). When it runs out, the result is `publishing` with status `processing` and exit code 0 (`SEGMENT_PUBLISH_STILL_PROCESSING`): still processing, not failed, and not resent.
- `--async` returns right after Salesforce accepted the POST and reads nothing afterwards: the result is `publishing` (mutation `acknowledged-processing`) with status `processing` and exit code 0 (`SEGMENT_PUBLISH_STARTED`): started, not finished, and not resent. Read the segment later for the result. `--async` and `--wait-timeout` cannot be combined; a refusal of the POST is reported as without `--async`.
- An answer or status read that cannot be confirmed is `SEGMENT_PUBLISH_UNCONFIRMED`; read the segment before publishing again.
- `--preview` reads the segment and reports what would be published without publishing.

## Export segment members

`sf data360 segment members export -m segment:<value>` writes the members of one segment as data rows: CSV by default, or a JSON array of row objects with `--result-format json`. The command only reads. Members exist only after a publish finished; before that the export is empty and warns.

```sh
sf data360 segment members export -o target -m segment:Example_Segment
sf data360 segment members export -o target -m segment:Example_Segment --result-format json --output-file members.json
sf data360 segment members export -o target -m segment:Example_Segment --include-details
sf data360 segment members export -o target -m "segment:Example Segment" --column-delimiter ";"
sf data360 segment members export -o target -m segment:1sgXXXXXXXXXXXXXXX --include-details --column-headers api-name
```

**Selecting the segment.** `<value>` is the segment's API name, its MarketSegment record ID (`1sg…`, as in the browser address bar) or its display name; quote values with spaces. An API name is read directly; otherwise the segment list of the run's data space is searched for the exact ID or display name (case matters; no match: `SEGMENT_MEMBERS_NOT_FOUND`). When several segments match, a terminal asks which one to use; with `--json` or without a terminal the export stops with `SEGMENT_SELECTION_AMBIGUOUS` and lists each display name, API name and ID. `--api-version` is `auto` (68.0), `67.0` or `68.0`.

**Output file.** The rows never go to a `data360/` folder. They go to `--output-file` (an existing file is replaced), by default `data/<data space>/<display name>-<YYYY-MM-DD_HH-mm-ss>.csv` below the working directory.

- The default name uses the display name. Characters a file name cannot hold on Windows or Linux (control characters and `< > : " / \ | ? *`) become `-`, whitespace runs become one `-`, leading and trailing dots and spaces are dropped, and a Windows device name such as `CON` gets the prefix `segment-`.
- A segment without a display name uses its API name; a second export in the same second gets `_2`, `_3`, ….
- Rows are written to a temporary file that replaces the output only when every page was read, so a failed export leaves no file.

**Basic mode** reads the members route page by page with `--limit` (rows per request, default 1000) and `--offset` (first row, default 0) until all rows are read. `--fields`, `--filters` and `--order-by` are sent as given and Salesforce decides; without them it returns the member ID, the delta and snapshot types and time stamps. Values are written as Salesforce returns them. A member count that changes between pages (a publish finished during the read) stops the export with `SEGMENT_MEMBERS_CHANGED`.

**`--include-details`** writes every field of the segment's DMO per member. The latest membership DMO is joined to that DMO through the relationship Salesforce lists between them, in one Data 360 SQL query whose rows are read page by page. A member with more than one detail row is `SEGMENT_MEMBER_DETAILS_AMBIGUOUS`.

- Column headers are the field labels (`--column-headers label`, the default; an empty label falls back to the API name, a repeated header gets `_2`, `_3`, …) or the API names (`--column-headers api-name`). Basic mode always uses the names Salesforce returns.
- `DATE` values are written as `YYYY-MM-DD`; `DATE_TIME` values use a space instead of the `T` and keep the offset.

**Other options and errors.**

- With `--include-details` the CSV header comes from the DMO fields and is written even when the segment has no members. In basic mode the header is the keys of the first row Salesforce returns, so a segment without members gives an empty file. JSON output without members is `[]`.
- `--column-delimiter` sets the CSV separator, as a name or the character itself: `COMMA`/`,` (default), `SEMICOLON`/`;`, `TAB`, `PIPE`/`|`, `CARET`/`^`, `BACKQUOTE`/`` ` ``.
- Reads retry after network errors, HTTP 429 and 503 (the detail query only when it provably never left). Any other Salesforce error ends the export with `SEGMENT_MEMBERS_READ_FAILED` and its HTTP status.

Create and delete of members do not exist by design: Salesforce computes the rows, and `sf data360 publish` recomputes them.

## Data spaces

A segment belongs to one data space, named as a string in `c__dataSpace`. Its DMO (`spec.segmentOn`) and its Waterfall children are always in the segment's own data space. The old `identity.dataSpace` and `spec.segmentOn.dataSpace` keys are refused with `LEGACY_DATASPACE_KEY`.

- **Names are what Salesforce stores.** In a non-default data space Salesforce stores a segment as `<prefix>_<Name>` (`ds2_Spring` in `dataspace2`) and keeps a name that already has the prefix. The file carries that stored name and deploy sends it unchanged; the plugin adds and strips nothing. A segment file of a non-default data space whose name lacks the prefix is refused before any write (`SEGMENT_NAME_NOT_STORED`), because Salesforce would create it under another name.
- A segment name is unique in the org: a read, update or delete by name finds the segment wherever it is, and the create names the data space.
- **Retrieve** keeps the segments of the run's data space; a selected segment of another data space is a failed item that names both data spaces (`SEGMENT_DATASPACE_MISMATCH`).
- **Deploy, delete and publish** refuse a segment file, or an org segment, of another data space (`SEGMENT_DATASPACE_MISMATCH`) before any write. A `segmentOn` DMO or Waterfall child of another data space is `SEGMENT_DEPENDENCY_OTHER_DATASPACE`. In SQL and UI criteria use the names of that data space (`ds2_Individual__dlm`, `FirstName__c`); a DBT segment takes its `segmentOn` DMO from the SQL `FROM`.
- **Members export** (`--dataspace`) reads the segment and runs the detail query in the run's data space.
- Only if you have more than one data space: `--allow-cross-dataspace` (`-c`) deploys a UI, Waterfall or SQL (DBT) segment file of another data space.
  - Its name, its DMO, the DMO and field names in its criteria and its Waterfall children are renamed by rule (`Audience` to `ds2_Audience`, `ssot__Individual__dlm` to `ds2_Individual__dlm`); compared values stay.
  - In a DBT segment, every model's SQL is renamed table by table and column by column; texts, comments and your own names (aliases, `WITH` blocks) stay. A name it cannot place exactly refuses the deploy before any write (`CROSS_DATASPACE_UNRESOLVED`), with the SQL file, line and column.
  - SQL holding an HTML entity such as `&#39;` outside texts and comments is refused (`CROSS_DATASPACE_UNRESOLVED`): write the character itself. If a fresh retrieve still shows the entity, Salesforce stores it that way: write the character itself in the file, or fix it in Data Cloud.
  - After the deploy the translated JSON and SQL files are written under the new name. See [Deploy from another data space](../../README.md#deploy-from-another-data-space-only-if-you-have-more-than-one-data-space).

See [Data spaces](../../README.md#data-spaces) for the general rules.

## Error codes you act on

- [`SEGMENT_CHILD_NOT_FOUND`](../errors/segment/SEGMENT_CHILD_NOT_FOUND.md): deploy the Waterfall's children first, or in the same command.
- [`SEGMENT_SCHEDULE_CHANGE`](../errors/segment/SEGMENT_SCHEDULE_CHANGE.md): the schedule will be sent and the segment will publish on it in the target org.
- [`SEGMENT_NAME_NOT_STORED`](../errors/segment/SEGMENT_NAME_NOT_STORED.md): use the stored `<prefix>_<Name>` of the data space.
- [`UNKNOWN_SEGMENT_CONFIGURATION`](../errors/segment/UNKNOWN_SEGMENT_CONFIGURATION.md), [`UNSUPPORTED_SEGMENT_VARIANT`](../errors/segment/UNSUPPORTED_SEGMENT_VARIANT.md): the file holds something the plugin cannot deploy.
- [`SEGMENT_PUBLISH_DEFINITION_MISMATCH`](../errors/segment/SEGMENT_PUBLISH_DEFINITION_MISMATCH.md): deploy the file before publishing it.
- [`SEGMENT_PUBLISH_STILL_PROCESSING`](../errors/segment/SEGMENT_PUBLISH_STILL_PROCESSING.md): the publish continues; check later instead of publishing again.
- [`SEGMENT_SELECTION_AMBIGUOUS`](../errors/segment/SEGMENT_SELECTION_AMBIGUOUS.md): export by API name or record ID.

All codes: [error codes](../errors/README.md). Evidence and API details: [Segments](https://sfmc.guide/next/data-cloud-devops/segments/) and [Segment members](https://sfmc.guide/next/data-cloud-devops/segment-members/) on sfmc.guide, and the [Data Cloud DevOps guide](https://sfmc.guide/next/data-cloud-devops/).
