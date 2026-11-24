# Data graphs (`data-graph`)

A data graph joins a root object (a DMO, standard or unified) with related objects into one
precomputed structure that Data Cloud keeps up to date on a schedule. The plugin retrieves,
creates, updates and deletes graph definitions in the run's data space with the native
Data Cloud API 68. Evidence for the API behaviour is on the sfmc.guide
[Data Cloud DevOps](https://sfmc.guide/next/data-cloud-devops/) pages, see
[Data Graphs](https://sfmc.guide/next/data-cloud-devops/data-graphs/).

## Commands

- `sf data360 retrieve -m data-graph:<Name>` (or bare `-m data-graph` for every graph of the
  run's data space)
- `sf data360 deploy --source-dir <file or folder> --allow-processing`
- `sf data360 delete -m data-graph:<Name>`
- `--preview` on deploy and delete, `--wait <minutes>` (`-w`) on deploy

## Selector and API version

- `data-graph:<Name>` selects one graph; bare `data-graph` lists the graphs of the run's data
  space and retrieves each one.
- Retrieve, deploy and delete accept `--api-version auto` (the default) or `68.0`. Any other
  version is refused with [`INVALID_SCOPE`](../errors/general/INVALID_SCOPE.md).
- Retrieve takes any number of graphs, alone or beside other families. Deploy takes any number
  of graphs too, alone or beside other families (also through `--changed-since`).

## File

Retrieve writes `data360/dataGraphs/<Name>.native-dataGraph.json` at the project root. It is a
`kind: native-data-graph`, `apiVersion: 68.0` document holding:

- the root object (any root: standard, such as `ssot__Individual__dlm`, or unified, such as
  `UnifiedssotIndividualMkt__dlm`);
- the related objects with their join paths;
- the fields of every node (all field types) and their settings;
- label, description, refresh schedule and incremental refresh;
- the graph's data space in `c__dataSpace`, next to Salesforce's own
  `definition.dataspaceName`.

Source-org record IDs are not carried over: bindings are matched to the target again on deploy.

A Real-Time Data Graph (`type` `REALTIME`) uses the same file. It also holds the settings of the
UI page "Real-Time Consumption Limits" (`isRealTimeToggleEnabled`, `processIngestionApi`,
`processSalesforceCrm`, `isRecordCachingDisabled`, `sessionEnd`, `sessionEndTimeUnit`,
`cacheDurationInDays`, `maxRecordsCached`). They are sent as written on create and update, and
Salesforce decides.

Written as-is (not deployable, see [`VERBATIM_NOT_DEPLOYABLE`](../errors/general/VERBATIM_NOT_DEPLOYABLE.md)):

- a draft graph (never built), with reason
  [`DATA_GRAPH_DRAFT`](../errors/data-graph/DATA_GRAPH_DRAFT.md). Salesforce does not let the
  API edit a draft, and a normal file would build it. Deleting it by name, or deleting the file
  and running `--changed-since`, removes the draft;
- a graph whose schedule the file format does not hold.

## Create

A graph that does not exist is created from the file as written (root, related objects, fields,
schedule). Creating needs `--allow-processing`, because Salesforce starts building the graph.

- Salesforce adjusts what it stores: it adds the key-qualifier field to related objects and can
  report another node `type` (a unified root reads `derived`). On a unified root it also renames
  the root object (devName) and its fields. Retrieve after a create and keep the retrieved file.
- Node labels are set by Salesforce: every node gets the label of its object, whatever label the
  file holds. A graph copied from another data space therefore shows the target objects' labels.
- A node's `type`, reference and projected name are assigned by Salesforce. A hand-written
  create file may leave the node `type` out; none is sent then.
- Deploy waits while Salesforce builds the graph, up to `--wait` (default `30`
  minutes), with progress on stderr. Building can take many minutes, longer with related
  objects.
- When a check after the request cannot confirm the graph, the item reports `failed` with
  mutation `unknown` and
  [`DATA_GRAPH_CREATE_UNCONFIRMED`](../errors/data-graph/DATA_GRAPH_CREATE_UNCONFIRMED.md),
  naming the step (`request`, `response`, `settlement`, `identity`, or `deadline` when
  `--wait` ran out). The graph may exist: retrieve it, or deploy the same file again
  (`unchanged` once the graph is built), instead of creating it again.

## Update

For an existing graph: edit the retrieved file, run `--preview`, then deploy with
`--allow-processing`. The file is the desired state and goes to Salesforce in one PUT; Salesforce
decides. The graph's label, description, refresh schedule, incremental refresh, the fields and
related objects as listed, field settings and the root object are sent as written.

- A field or related object left out of the file is not sent. Salesforce refuses removed fields
  and related objects, a root change and another related object in place of an existing one
  (HTTP 400). The item is then `rejected` with Salesforce's answer
  ([`REQUEST_FAILED`](../errors/general/REQUEST_FAILED.md)), and nothing is written. Setting a
  field to `isProjected: false` counts as removing it.
- The plugin refuses join changes, because Salesforce accepts them but keeps the old join. A
  join change of an existing related object stops before any write with
  [`DATA_GRAPH_JOIN_CHANGE`](../errors/data-graph/DATA_GRAPH_JOIN_CHANGE.md)
  (`DEPLOY_PREVIEW_BLOCKED` in preview, `DEPLOY_EXECUTION_BLOCKED` in deploy).
- A graph read back with another join than the one sent is
  [`DATA_GRAPH_CHANGE_NOT_APPLIED`](../errors/data-graph/DATA_GRAPH_CHANGE_NOT_APPLIED.md),
  never `updated`.
- Key-qualifier fields Salesforce added are kept when the file leaves them out.
- A node's label is not sent: Salesforce keeps its own label even when a PUT names another one,
  and a related object added by the update gets its object's label. Node labels alone never make
  an update. The graph's own label is sent.
- Settings left out of the file (description, schedule, a node's criteria, field settings) keep
  their org values. To clear one, give it an explicit value.
- On an update, a stated node `type` must match the org. A related object added without `type`
  is sent without one.
- The name and data space identify the graph. A file with another name creates or addresses
  another graph; the old graph is not renamed (a PUT cannot rename one).
- An identical, ready definition reports `unchanged` with no write and needs no
  `--allow-processing`.

Before the PUT, deploy requires the graph to be ready (item `ready`, metadata `Ready`, the
DataGraph record `READY` / `ACTIVE`) and bound to the expected target. After the write, it reads
the graph again: only a ready graph whose definition matches the file is `updated` /
`confirmed-updated`. Processing can take seconds to many minutes; deploy warns about this on
stderr before an update.

## Preview checks

Preview is read-only. Because no Salesforce answer exists there, it checks the root:

- a missing root DMO is
  [`DATA_GRAPH_ROOT_NOT_FOUND`](../errors/data-graph/DATA_GRAPH_ROOT_NOT_FOUND.md);
- for a unified (derived) root it reads the identity resolution rulesets and reports
  [`DATA_GRAPH_OWNER_NOT_FOUND`](../errors/data-graph/DATA_GRAPH_OWNER_NOT_FOUND.md),
  [`DATA_GRAPH_OWNER_NOT_PUBLISHED`](../errors/data-graph/DATA_GRAPH_OWNER_NOT_PUBLISHED.md), or
  the owning ruleset as [`DATA_GRAPH_OWNER`](../errors/data-graph/DATA_GRAPH_OWNER.md).

Deploy itself does not check the owner; Salesforce decides. A graph on a unified DMO needs a
`PUBLISHED` [identity resolution](identity-resolution.md) ruleset.

## Waiting and resending

- `--wait <minutes>` (`-w`, positive whole minutes, default `30`) covers readiness, the write and
  settlement of each selected graph. It is refused when the selection holds no graph. Polling
  waits at least 20 seconds between reads, within the remaining time.
- A graph write (create POST, update PUT, DELETE) answered with HTTP 429 or 503 was not
  processed. The plugin waits (`Retry-After` when Salesforce sends it, otherwise 20 seconds,
  with a line on stderr) and sends the same write again until the wait budget ends; then the
  item is `failed` / `not-attempted`. Timeouts and other uncertain outcomes are never resent.
- Progress stays on stderr; `--json` keeps stdout clean.

## Deploy order

Deploy runs graphs as the last phase of any selection, explicit or `--changed-since`, after the
objects they read from.

## Delete

`sf data360 delete -m data-graph:<Name>` reads the graph from the org by name, then deletes it.
No `--allow-processing` or confirmation flag is needed; run `--preview` first.

- A graph the org does not have is `unchanged`. That needs all reads to agree: the item read and
  the metadata read say not found, and neither the graph list nor SOQL holds the name. When any
  of them still holds it, the delete stops before any deletion.
- Before the DELETE, the plugin checks again: ready state, org, identity, created date, full
  definition, root, and that the native dependency and related-segment lists are explicitly
  empty. Unknown or nonempty dependencies block.
- The DELETE's answer decides: 2xx is `deleted` / `confirmed-deleted`, a 4xx is `failed` /
  `rejected` with Salesforce's error, a 429 or 503 that never gets through within the
  120-second delete budget is `failed` / `not-attempted`, and any other 5xx or a transport
  failure is `failed` / `unknown`. Nothing is read back afterwards, because the by-name metadata
  read keeps returning a stale copy of a deleted graph for minutes.
- A graph delete never cascades. The DMOs, mappings and transforms Salesforce generated for the
  graph are not deleted by the plugin.
- In a delete across families, graphs run in the first phase. See [Delete](delete.md).

## Data spaces

A graph belongs to one data space, named in `c__dataSpace`. See
[Data spaces](../../README.md#data-spaces) for `--dataspace`.

- A graph's name is unique in the org. A second create of the same name in another data space
  would be taken as an update of the first graph, and Salesforce refuses it.
- `c__dataSpace` and `definition.dataspaceName` must agree
  ([`INVALID_DATASPACE_FIELD`](../errors/general/INVALID_DATASPACE_FIELD.md) otherwise). A file
  whose definition leaves `dataspaceName` out takes it from `c__dataSpace`, which the create
  sends.
- Retrieve takes the graph's data space from its GET before anything is written. A graph of
  another data space is a failed item that names both data spaces
  ([`DATA_GRAPH_DATASPACE_MISMATCH`](../errors/data-graph/DATA_GRAPH_DATASPACE_MISMATCH.md)),
  never an as-is file.
- Deploy and delete refuse a file of another data space before any step, and an org graph of
  that name in another data space before any write. A root DMO that the read names in another
  data space is
  [`DATA_GRAPH_DEPENDENCY_OTHER_DATASPACE`](../errors/data-graph/DATA_GRAPH_DEPENDENCY_OTHER_DATASPACE.md).
- Related objects are sent as written, with the names stored in that data space
  (`ds2_Individual__dlm` for a standard DMO copy), and Salesforce decides.
- A draft graph outside `default` is only checked for its root; its field paths are not checked.
- Only if you have more than one data space: a graph's name carries its data space's prefix
  (`ds2_OrderGraph` in `dataspace2`), and in `default` no other space's prefix. Deploy refuses
  a new graph that breaks this before any write
  ([`DATA_GRAPH_PREFIX_MISMATCH`](../errors/data-graph/DATA_GRAPH_PREFIX_MISMATCH.md)); for an
  existing one deploy and retrieve only warn. See
  [Name prefixes](../../README.md#name-prefixes-only-if-you-have-more-than-one-data-space).
- Only if you have more than one data space: `--allow-cross-dataspace` deploys a graph
  file of another data space. Its name gets the target prefix (`PhoneGraph` becomes
  `ds2_PhoneGraph`); the root, every related object, field, join field and criteria field follow
  the DMO rules (`ssot__ContactPointPhone__dlm` with `ssot__TelephoneNumber__c` becomes
  `ds2_ContactPointPhone__dlm` with `TelephoneNumber__c`). An identity resolution output is
  placed by its ruleset. The generated names (helper DMOs, transform, join and field developer
  names) are left out. Salesforce accepts a graph left in the `default` spelling in another
  data space, so a name the translation does not cover, or one still in the old spelling, refuses
  the file before any write
  ([`CROSS_DATASPACE_UNRESOLVED`](../errors/general/CROSS_DATASPACE_UNRESOLVED.md)). After the
  deploy the translated file is written under the new name. See [Deploy from another data space](../../README.md#deploy-from-another-data-space-only-if-you-have-more-than-one-data-space).

## Error codes

The full list, grouped by family (data graph codes included): [docs/errors](../errors/README.md).
