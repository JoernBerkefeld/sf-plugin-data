# Calculated insights

A calculated insight computes metrics and dimensions with SQL over Data Cloud objects. The plugin retrieves an insight into a JSON file plus a SQL file, deploys those files by name (as an active insight or as a draft), publishes a draft and deletes an insight by name.

Calculated insights use API 68 only: `--api-version auto` or `68.0`; any other version is refused with `INVALID_SCOPE`. No command needs `--allow-processing`.

## Commands

- `sf data360 retrieve -m calculated-insight:<Name>__cio` reads one insight; bare `-m calculated-insight` reads every insight the API lists in the run's data space.
- `sf data360 deploy -m calculated-insight:<Name>__cio` creates or updates the insight; add `--draft` to keep it a draft.
- `sf data360 publish -d <file>` activates a draft.
- `sf data360 delete -m calculated-insight:<Name>__cio` deletes the insight.

```sh
sf data360 retrieve -o source -m calculated-insight:ExampleInsight__cio --json
sf data360 deploy -o target -m calculated-insight:ExampleInsight__cio --draft --preview --json
sf data360 deploy -o target -m calculated-insight:ExampleInsight__cio --draft --json
sf data360 publish -o target -d data360/calculatedInsights/ExampleInsight__cio.calculatedInsight-meta.json --preview --json
sf data360 publish -o target -d data360/calculatedInsights/ExampleInsight__cio.calculatedInsight-meta.json --json
sf data360 delete -o target -m calculated-insight:ExampleInsight__cio --preview --json
sf data360 delete -o target -m calculated-insight:ExampleInsight__cio --json
```

## Files

Each insight is two files. Retrieve writes any insight the API returns, whatever its status, schedule or SQL.

- `data360/calculatedInsights/<Name>.calculatedInsight-meta.json`: the GET body with its key names and enum values as returned (for example `CALCULATED_METRIC`, `NOT_SCHEDULED`), with the data space in `c__dataSpace`. Left out is what the org sets or derives: status and run history (`calculatedInsightStatus`, `definitionStatus`, `isEnabled`, `lastCalcInsightStatus*`, `lastRun*`), `sourceCiId`, `sourceCiName`, `creationType`, `subType`, and the `dimensions` and `measures` Salesforce derives from the SQL.
- `data360/calculatedInsights/<Name>.calculatedInsight-meta.sql`: the `expression` as plain SQL. The GET returns it HTML-escaped (`&gt;`, `&#39;`); retrieve writes it unescaped, ending with one line feed. Trailing line breaks are not part of the `expression` that deploy sends and compares.

A repeated retrieve of an unchanged insight is `unchanged`; differing files need `--overwrite`. An insight the org does not have is `CI_NOT_FOUND`.

Deploy, publish and delete read both files: `-m calculated-insight:<Name>__cio`, or `-d` with either file, selects the insight, and the JSON is joined with its SQL. A missing SQL or JSON file, SQL kept in the JSON, or another `<Name>.calculatedInsight-meta.*` file beside them is refused with `INVALID_SOURCE`.

### SQL dialects and builders

- **Legacy SQL** insights store `queryDialect` `ANSI_SQL`.
- **SQL Insights Builder** insights use `queryDialect` `DC_SQL` and are sent as written, like any other insight. Retrieve, deploy and publish handle both dialects the same way.
- **Visual Builder** drafts have no SQL in the API (the GET returns a placeholder sentence). Retrieve writes such a draft as Salesforce returns it (a verbatim file with reason `CI_VISUAL_DRAFT_WITHOUT_SQL`, no SQL file), and deploy refuses that file. An insight whose GET has no SQL at all (`expression` null or empty) is written the same way with reason `INVALID_CI_DOCUMENT`. Once published, its generated `ANSI_SQL` retrieves like any other insight, and deploying that file creates a SQL insight with the same result; the visual layout is not carried.
- **Real-Time Insights** (`definitionType` `GRAPH_METRIC`, built on a Real-Time Data Graph) store generated `ANSI_SQL` with `publishScheduleInterval` `STREAMING`; the GET does not name the graph. Retrieve, update and delete work. Salesforce does not create one through the API ("The Definition Type is not supported", `ARGUMENT_OBJECT_PARSE_ERROR`, reported as `rejected`): create it in the UI, then retrieve it and deploy updates.
- **Streaming insights** (`definitionType` `STREAMING_METRIC`) use windows in their SQL (`WINDOW.START`, `window(<DateTime>, '5 MINUTE')`). Salesforce refuses every schedule field on their PATCH, so an update leaves out schedule fields that equal the org value. Their build can take longer than the 120-second wait, so publish can end with `CI_SETTLEMENT_TIMEOUT` while Salesforce is still building: rerun publish later.

## Deploy

Deploy reads the insight by name. Absent (HTTP 404 `ITEM_NOT_FOUND`) creates it with one POST. Present is `unchanged` when the org insight holds every key of the JSON and the SQL (a retrieved file deploys back unchanged; keys the file leaves out are not compared), and is updated with one PATCH otherwise. An insight Salesforce is still deleting (HTTP 404 `ENTITY_IS_DELETED`) reads absent too: deploy sends one POST and reports Salesforce's answer.

The file is sent as written, and any status, schedule and SQL is admitted; Salesforce decides. Only what the create and update input names differently is translated:

| In the file (GET form)                                                                                              | Sent as                                       |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `c__dataSpace`                                                                                                      | `dataSpaceName`                               |
| `isFromPackage`                                                                                                     | `createdFromPackage`                          |
| `sourceCiDevName`                                                                                                   | `sourceDeveloperName`                         |
| UPPER_SNAKE values of `definitionType`, `publishScheduleInterval`, `historyPublishScheduleInterval`, `queryDialect` | PascalCase (`NOT_SCHEDULED` → `NotScheduled`) |
| `null` values                                                                                                       | left out                                      |
| `apiName` on update                                                                                                 | left out (it is in the route)                 |
| `definitionType` and the schedule fields on update, when they equal the org value                                   | left out                                      |

Salesforce's rules behind this table: it does not accept `dataSpace` or `isFromPackage` as input, needs PascalCase schedule values, accepts either form of `definitionType` and `queryDialect` on create, and refuses any `definitionType` on update ("Cannot change the calculated insight definition type"). A changed `definitionType` is still sent, so that refusal is reported as `rejected`.

- A 4xx answer is reported as `rejected` with Salesforce's text; nothing was written.
- After any other answer the insight is read again (at most 12 reads one second apart, within 120 seconds) until it is no longer `PROCESSING` and holds the file. Otherwise the outcome is unknown (`CI_SETTLEMENT_MISMATCH`, `CI_SETTLEMENT_TIMEOUT`).
- An insight runs after the DMOs, identity resolutions (through their unified DMOs) and other insights whose names (`<Name>__dlm`, `<Name>__cio`) appear in its SQL, when the same command deploys them. A missing object is Salesforce's answer.
- Each write is sent once; an unknown outcome stops without retry or rollback.

## Drafts and publish

- `--draft` creates a draft (`draft: true`) and sends `draft: true` on an update.
- Salesforce activates a draft on a PATCH without `draft`, so an update of a DRAFT insight always sends `draft: true`. Deploy never publishes.
- `sf data360 publish` activates the insight: an ACTIVE insight that holds the file is `unchanged`; otherwise one PATCH sends the file with `draft: false` and the insight is read until it is ACTIVE and holds the file. With `--async` the insight is not read after Salesforce accepted the PATCH: the result is `publishing` (mutation `acknowledged-processing`) with status `processing` and exit code 0 (`CI_PUBLISH_STARTED`); run publish with `--preview` later (`unchanged` means ACTIVE). `--async` does not combine with `--wait-timeout`. An insight the org does not have is `CI_NOT_FOUND`; create it with deploy first.
- ACTIVE means Salesforce accepted the definition, not that a calculation has run.

## Delete

Delete takes the exact selector and works in any status, schedule or SQL.

- The insight is read from the org by name; one the org does not have is `unchanged`.
- The read before the DELETE must answer with that name and data space (`CI_IDENTITY_CHANGED` otherwise).
- One DELETE is sent, then the insight is read until it answers 404 (`DELETING` is waited for). It never cascades.
- After a confirmed deletion the JSON and SQL files are removed unless you pass `--keep-local-files` (see [Local files after delete](../../README.md#local-files-after-delete) and [Delete](delete.md)).

## Data spaces

An insight belongs to one data space. Its JSON file names it as a string in `c__dataSpace` instead of Salesforce's `dataSpace` key; a file with `dataSpace` is refused with `LEGACY_DATASPACE_KEY`.

- Retrieve lists the insights with `?dataspace=` and checks that each GET names the run's data space. An insight of another data space is a failed item that names both data spaces (`CI_IDENTITY_CHANGED`); the other selected insights still run.
- Deploy refuses a file of another data space (`CI_DATASPACE_MISMATCH`) and sends `c__dataSpace` as `dataSpaceName` in every create and update. Publish (`--dataspace`) and delete work in the run's data space.
- Names are what Salesforce stores (insight names are unique in the org), and the SQL is sent as written. SQL names carry no data space, so the dependencies an insight's SQL names are taken from the insight's own data space.

See [Data spaces](../../README.md#data-spaces) for the general rules.

## Error codes you act on

- [`CI_NOT_FOUND`](../errors/calculated-insight/CI_NOT_FOUND.md): deploy the insight before publishing it, or check the name.
- [`CI_VISUAL_DRAFT_WITHOUT_SQL`](../errors/calculated-insight/CI_VISUAL_DRAFT_WITHOUT_SQL.md): publish the Visual Builder insight in the UI, then retrieve it again.
- [`CI_SETTLEMENT_TIMEOUT`](../errors/calculated-insight/CI_SETTLEMENT_TIMEOUT.md), [`CI_SETTLEMENT_MISMATCH`](../errors/calculated-insight/CI_SETTLEMENT_MISMATCH.md): Salesforce has not settled yet; retrieve or rerun later.
- [`CI_DATASPACE_MISMATCH`](../errors/calculated-insight/CI_DATASPACE_MISMATCH.md): run in the insight's data space, or fix `c__dataSpace`.
- [`INVALID_SOURCE`](../errors/general/INVALID_SOURCE.md): keep exactly one JSON and one SQL file per insight.

All codes: [error codes](../errors/README.md). Evidence and API details: [Calculated insights on sfmc.guide](https://sfmc.guide/next/data-cloud-devops/calculated-insights/) and the [Data Cloud DevOps guide](https://sfmc.guide/next/data-cloud-devops/).
