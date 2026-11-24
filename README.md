# Data360 Salesforce CLI plugin

`sf-plugin-data` adds the `sf data360` commands to Salesforce CLI. They copy Data Cloud (Data 360) configuration between an org and files on your disk: you retrieve components into JSON
files, keep them in Git, edit them, preview what a deploy would change and deploy them to the
same or another org. The plugin can also delete components, publish segments and calculated
insights, and export the members of a segment.

What it is not:

- **Not a backup, restore or migration tool.** It handles the component types listed in the
  [type overview](#type-overview), not everything Data Cloud holds, and never copies data rows.
- **Not side-effect free.** Deploying a stream, a segment, a graph or an identity resolution
  ruleset can start processing in the org. Run `--preview` first.

Background, evidence and the Salesforce behaviour behind each type are on sfmc.guide:
[Data Cloud DevOps](https://sfmc.guide/next/data-cloud-devops/) and
[Data spaces](https://sfmc.guide/next/data-spaces/).

## Install and sign in

You need Salesforce CLI, Node.js `^22.22.2 || ^24.15.0` and npm. Until the package is
published, install it from a checkout of this repository:

```sh
npm ci
npm run build
sf plugins link .
sf data360 --help
```

Sign in to a Data Cloud org with the usual Salesforce CLI login and pass its alias with
`--target-org` (or `-o`):

```sh
sf org login web --alias source
```

Your user needs the Data Cloud permissions for the components you work with. Linking the plugin
does not grant any org access. `datacloud`, `d360` and `dc` work as aliases of `data360`, for
example `sf dc retrieve`.

## Use it in VS Code

- **Data 360 DevTools** (pre-release, not yet published) runs these commands from right-click menus
  and the Command Palette in VS Code, and groups your files by data space in a side panel.
- It brings its own copy of this plugin, so no `sf plugins install` or link is needed there.

## Quick start

```sh
# 1. Retrieve components into ./data360/
sf data360 retrieve -o source -m dlo -m dmo -m mapping

# 2. Edit the files, then see what a deploy would do (read-only)
sf data360 deploy -o target -m dmo:Customer__dlm -m mapping:Customer_Map --preview

# 3. Deploy
sf data360 deploy -o target -m dmo:Customer__dlm -m mapping:Customer_Map

# Delete a component by name (preview first)
sf data360 delete -o target -m segment:Old_Segment --preview
sf data360 delete -o target -m segment:Old_Segment

# Deploy what changed in Git since main, and delete what was deleted
sf data360 deploy -o target --changed-since main --preview
sf data360 delete -o target --changed-since main --confirm-delete
```

The commands:

| Command                             | What it does                                                             |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `sf data360 retrieve`               | Saves components from the org as files under `data360/`.                 |
| `sf data360 deploy`                 | Creates or updates components from files; `--preview` only compares.     |
| `sf data360 delete`                 | Deletes components by name, or the ones whose files a Git range deleted. |
| `sf data360 publish`                | Publishes one segment or one calculated insight.                         |
| `sf data360 segment members export` | Writes the members of a published segment to a CSV or JSON file.         |

Every command has `--help` with all flags, and `--json` for machine-readable output.

## Type overview

Each row is one component type. The first cell links to the type's reference page and names the
selector you use with `-m`. **Available** means the plugin has that operation; **Unavailable**
means the plugin has none (it does not mean Salesforce lacks it). Every type works in any data
space of the org; see [Data spaces](#data-spaces).

| Type                                                                            | Retrieve    | Create      | Update      | Delete      | More                                                                         |
| ------------------------------------------------------------------------------- | ----------- | ----------- | ----------- | ----------- | ---------------------------------------------------------------------------- |
| [Data streams](docs/types/data-stream.md), `data-stream`                        | Available   | Available   | Available   | Available   | `--delete-dlo` deletes the landing DLO with the stream; `--allow-processing` |
| [Data Lake Objects (DLOs)](docs/types/dlo.md), `dlo`                            | Available   | Available   | Available   | Available   | Data space membership; `--allow-dataspace-removal`                           |
| [Data Model Objects (DMOs)](docs/types/dmo.md), `dmo`                           | Available   | Available   | Available   | Available   | Field delete (`delete --field`); `--allow-field-removal`                     |
| [DLO-to-DMO mappings](docs/types/mapping.md), `mapping`                         | Available   | Available   | Available   | Available   | Mapping label                                                                |
| [DMO field relationships](docs/types/relationship.md), `relationship`           | Available   | Available   | Available   | Available   | Retrieve by source DMO (`relationship:<Dmo__dlm>`)                           |
| [Data transforms](docs/types/data-transform.md), `data-transform`               | Available   | Available   | Available   | Available   | Schedule                                                                     |
| [Calculated insights](docs/types/calculated-insight.md), `calculated-insight`   | Available   | Available   | Available   | Available   | `sf data360 publish`; `--draft`                                              |
| [Segments](docs/types/segment.md), `segment`                                    | Available   | Available   | Available   | Available   | `sf data360 publish`; schedule; `--allow-processing`                         |
| [Segment members](docs/types/segment.md#export-segment-members)                 | Available   | Unavailable | Available   | Unavailable | Read: `sf data360 segment members export`; update: `sf data360 publish`      |
| [Data graphs](docs/types/data-graph.md), `data-graph`                           | Available   | Available   | Available   | Available   | Schedule; `--allow-processing`; `--wait-timeout`                             |
| [Identity resolution](docs/types/identity-resolution.md), `identity-resolution` | Available   | Available   | Available   | Available   | `--async`; `--allow-processing`                                              |
| Source object definitions                                                       | Unavailable | Unavailable | Unavailable | Unavailable | Connectors and credentials are not handled                                   |
| Kit templates                                                                   | Unavailable | Unavailable | Unavailable | Unavailable | Data kits are not handled                                                    |
| Kit definitions                                                                 | Unavailable | Unavailable | Unavailable | Unavailable | Data kits are not handled                                                    |
| Kit membership                                                                  | Unavailable | Unavailable | Unavailable | Unavailable | Data kits are not handled                                                    |

Segment members are the rows Salesforce computes when a segment is published, so they cannot be
created or deleted. Cross-type deletes, the delete order and local file removal are described in
[Delete](docs/types/delete.md).

## What it does that the Data Cloud UI does not

- **Change an existing relationship's label and cardinality in place.** The UI only lets you
  activate or delete an existing relationship.
- **Create, update and delete SQL (DBT) segments**, with the SQL in its own `.sql` file. The UI
  builds segments only visually.
- **Retrieve many components in one command** into files you keep in Git.
- **Deploy only what changed in a Git range** with `--changed-since`, and delete what the range
  deleted.
- **Deploy or delete related components of several types in one command**, in dependency order:
  for example DLOs, DMOs, mappings and a relationship in one deploy, or data graphs before the
  identity resolution ruleset they use in one delete.

## How it works

### Files on disk

Retrieve writes one folder per type under `data360/` in the current directory (or
`--output-dir`). Each component is one JSON file named after it; segments and calculated
insights keep their SQL in separate `.sql` files next to the JSON.

| Type                | File                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Data stream         | `data360/data-stream/<Name>.data-stream-meta.json`                                                |
| DLO                 | `data360/dlo/<Name>__dll.dlo-meta.json`                                                           |
| DMO                 | `data360/dmo/<Name>__dlm.dmo-meta.json`                                                           |
| Mapping             | `data360/mapping/<Name>.mapping-meta.json`                                                        |
| Relationship        | `data360/relationship/<Name>.relationship-meta.json`                                              |
| Data transform      | `data360/dataTransforms/<Name>.dataTransform.json`                                                |
| Calculated insight  | `data360/calculatedInsights/<Name>.calculatedInsight-meta.json` and `.calculatedInsight-meta.sql` |
| Segment             | `data360/segments/<Name>.segment.json` and `<Name>.segment.<model>.sql`                           |
| Data graph          | `data360/dataGraphs/<Name>.native-dataGraph.json`                                                 |
| Identity resolution | `data360/identityResolution/<Name>.identityResolution.json`                                       |

The files hold what you need to recreate a component in another org: no record IDs, no
values Salesforce generates, no status. Fields and mapping pairs that Salesforce adds by itself
are left out, and deploy keeps them. The exact layout of each file is on its type page and in
[artifact format](docs/artifact-format.md).

### Selecting components

- `-m <type>:<Name>` selects one component; repeat `-m` to select several, of any types.
- For retrieve, a bare type (`-m dmo`) selects every component of that type the org lists.
  Retrieve without `-m` selects every component of every type in the run's data space, as if
  each type were named bare; `-m` narrows the run.
- Deploy and delete always name their components, or take them from Git with
  `--changed-since`. Deploy also takes files and folders with `--source-dir` (`-d`).

### Preview first

`sf data360 deploy --preview` and `sf data360 delete --preview` read the org and report, per
component, what would happen: `create`, `update`, `unchanged`, `delete`, or `blocked` with the
reason. They never write to the org and never change local files. When a component needs another
component that the same command creates first, the preview cannot compare it yet and reports
`planned-dependencies` for it.

### Deploy

- **Order.** One deploy can hold components of several types; the plugin sorts them by
  dependency. Data streams go first, then the native objects in the order DLO, DMO, mapping,
  relationship, then transforms, calculated insights, segments and identity resolution, and data
  graphs last. Each component settles before the next one that depends on it is written.
- **Sent as written, Salesforce decides.** The plugin sends the file as you wrote it and reports
  Salesforce's answer as the component's error. It keeps no list of allowed values of its own.
  It refuses a change before any write only where Salesforce would accept the request but not
  apply it, or where the change cannot be undone (for example removing fields); the type pages
  list these refusals.
- **Size.** One deploy takes at most 256 components and 512 links between them. A larger
  selection stops before any write with `DEPENDENCY_LIMIT_EXCEEDED`; split it into smaller
  deploys and run them one after another.
- **Unchanged components are not written.** Deploying the same file again reports `unchanged`.
  Values that differ only in letter case (`Text` and `text`) count as equal.
- **Processing.** Creating or updating a data stream, segment, data graph or identity resolution
  ruleset makes Salesforce start processing, so these need `--allow-processing`. Transforms and
  calculated insights do not, but a deployed schedule makes them run in the target org; preview
  warns about that.
- **Stops on the first problem.** A blocked, failed or unknown result stops the deploy; later
  components report `not-attempted`. Components already written stay written: there is no
  rollback.
- **Unknown outcome.** When the plugin cannot tell whether a write happened (for example the
  connection dropped), the result says `unknown`. Check the org before you run the deploy
  again; the plugin never repeats such a write by itself.

### Retrieve is lenient, deploy is strict

- Retrieve never refuses a component because the org returns something the plugin does not
  recognise. One failing component never stops the others.
- A setting the plugin does not recognise stays in the retrieved file. Deploy refuses such a
  file and names the setting.
- A component the file format cannot hold is saved exactly as Salesforce returned it, with a
  warning. Deploy skips such a file in a folder or Git deploy and refuses it when you name it
  (error `VERBATIM_NOT_DEPLOYABLE`). You can still delete the component by name.

### Delete

`sf data360 delete` takes any mix of types and deletes them in reverse dependency order: graphs
first, then identity resolution, calculated insights and segments, transforms, relationships,
mappings, DMOs, DLOs, and data streams last. Each phase finishes before the next starts.

- Components are selected by name with `-m`. A delete reads no local file, except for a mapping,
  which it finds through its local file like deploy does. A `-m` delete needs
  no confirmation flag, so check it with `--preview` first.
- `--changed-since <ref>` deletes the components whose files were deleted in that Git range. It
  always needs `--confirm-delete` (not with `--preview`).
- A component the org does not have reports `unchanged`.
- A data stream keeps its landing DLO unless you add `--delete-dlo`.
- `sf data360 delete -m dmo:<Name>__dlm --field <Field__c>` removes single fields of a DMO.

Details, including what is read before anything is deleted: [Delete](docs/types/delete.md).

### Local files after delete

After a confirmed deletion, `sf data360 delete` also removes the deleted component's local file
(and its `.sql` files) at its usual path under `data360/`. It does the same when Salesforce has
accepted the deletion and is still finishing it. Pass `--keep-local-files` to keep the files.

- `--preview` removes nothing; it lists the files that would go.
- Only regular files inside the project's `data360` folder are removed, one at a time.
- If a file cannot be removed, the org result stays as it is and the command exits with an
  error; remove that file by hand instead of repeating the delete.
- A `--changed-since` delete removes no file: its files are already gone in Git.
- A field delete (`--field`) removes no file; it refreshes the DMO and mapping files.

The JSON fields and every case are in [Delete](docs/types/delete.md#local-files-after-delete).

### Output, JSON and error codes

Human output prints one line per component, such as `created dmo Customer__dlm`. The suffix
` (server is still processing)` means Salesforce accepted the change and is still working on it.
The exit code is 0 only when every component was created, updated, deleted or unchanged.

Every problem carries a plugin error code, a short hint and a link to the code's page:

```text
IDENTITY_RESOLUTION_NOT_SETTLED: <message, including Salesforce's own detail when there is one>
Hint: <what went wrong and what to do>
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v<version>/docs/errors/identity-resolution/IDENTITY_RESOLUTION_NOT_SETTLED.md
```

With `--json`, each diagnostic has the same `hint` and `docs` fields next to `code` and
`message`. The full list, grouped by type, is in [docs/errors/README.md](docs/errors/README.md).

When Salesforce refuses a request, the message shows its HTTP status, error code and
explanation. HTTP 429 and 503 mean rate limits or availability problems: wait and try again.
Reads are retried a few times by themselves; writes are not.

### API version

Every type uses Data Cloud API 68 by default (`--api-version auto`). DLOs, DMOs, mappings and
relationships also accept an explicit version from `61.0` up, which the plugin keeps instead of
upgrading. The other types accept `auto` or `68.0`. `--api-version latest` is not accepted.

## Data spaces

Every command runs in one data space, chosen with the optional `--dataspace NAME`;
`--data-space` is a compatibility alias. Neither spelling has a CLI default of its own: leave
both out and the command works in `default`. A command never works on all data spaces at once,
and an unknown data space stops it before any read or write.

- **The file names its data space.** Every file carries the top-level key `c__dataSpace`. Deploy
  and delete refuse a file of another data space than the run's, before any write. Deploy can
  translate some of them with `--allow-cross-dataspace` (below).
- **DLOs follow the run's data space** and can belong to several data spaces. Their file lists
  all of them in `c__dataSpace`. Deploy adds the DLO to the listed data spaces it is not in yet.
  It removes the DLO from a data space the file no longer lists only with
  `--allow-dataspace-removal`. Delete refuses a DLO that also belongs to another data space.
- **Data streams** belong to the data spaces of their landing DLO; change them through the DLO
  file.
- **Names are what Salesforce stores.** Every data space has a prefix, chosen when it was
  created. Outside `default`, Salesforce puts that prefix in front of some names: in a data
  space with the prefix `ds2`, a standard DMO is a copy such as `ds2_Individual__dlm` (fields
  without `ssot__`), a segment is stored as `ds2_<Name>`, and an identity resolution ruleset as
  `ds2_<type>_<rulesetId>`. Files carry these names, and the plugin adds or removes no prefix.
- **First mapping onto a standard DMO copy.** The copy exists only once something is mapped
  onto it in that data space. Deploy the mapping, not a DMO file, to create it; the plugin
  sends the mapping the way Salesforce takes it. This works for the copy of an `ssot__` DMO;
  the copy of a standard DMO without `ssot__` (`ds2_StaticCurrencyRates_Home__dlm`) the plugin
  cannot create yet: map a DLO onto it in the data space in Salesforce.

### Name prefixes (only if you have more than one data space)

Custom DMOs, calculated insights, data transforms and data graphs have names that are unique in
the whole org, whatever their data space. So their names carry the prefix of their data space,
as Salesforce does itself for segments and identity resolution rulesets. This keeps names from
clashing between data spaces and shows at a glance where a component belongs. Examples for
`dataspace2` with the prefix `ds2`:

- Custom DMO: `ds2_Order__dlm`
- Calculated insight: `ds2_Spend__cio`
- Data transform: `ds2_CopyOrders`
- Data graph: `ds2_OrderGraph`

What the plugin does:

- In a data space other than `default`, the name must start with that space's prefix and an
  underscore. In `default`, it must not start with the prefix of another data space.
- **Deploy of a new component** with a name that breaks the rule is refused before the first
  write of the whole deploy (`DMO_PREFIX_MISMATCH`, `CI_PREFIX_MISMATCH`,
  `TRANSFORM_PREFIX_MISMATCH`, `DATA_GRAPH_PREFIX_MISMATCH`).
- **Deploy of an existing component** and **retrieve** only warn; the plugin never renames
  anything in the org.
- Only what you make yourself is checked. Standard DMOs and their copies, objects Salesforce
  generates and packaged components are not.
- With only the `default` data space nothing is checked and nothing extra is read.

### Deploy from another data space (only if you have more than one data space)

`sf data360 deploy --dataspace <target> --allow-cross-dataspace` (short `-c`) deploys files of
another data space into `<target>`. Each file's `c__dataSpace` says where it comes from. Without
the flag such a file is refused, and the message names the flag.

```bash
# See every rename first; nothing is written
sf data360 deploy -o myOrg --dataspace dataspace2 -c -d data360/dmo/Order__dlm.dmo-meta.json -d data360/segments/Audience.segment.json --preview
# Then deploy
sf data360 deploy -o myOrg --dataspace dataspace2 -c -d data360/dmo/Order__dlm.dmo-meta.json -d data360/segments/Audience.segment.json --allow-processing
```

- **What is translated:** DMOs, mappings, relationships, UI, Waterfall and SQL (DBT)
  segments, calculated insights (classic and SQL Insights Builder), data graphs, identity
  resolution rulesets, STL data transforms (load, join, formula, filter, SQL filter, aggregate,
  append and output nodes) and DCSQL data transforms. A DLO is added to the target data space;
  nothing in it is renamed.
- **How names change:** by fixed rules, with the prefixes from the org's list of data spaces.
  - Custom DMOs and segments get, lose or swap the prefix: `Order__dlm` becomes
    `ds2_Order__dlm`, `Audience` becomes `ds2_Audience`.
  - A standard DMO becomes its copy and its fields lose `ssot__`: `ssot__Individual__dlm`
    becomes `ds2_Individual__dlm`, `ssot__FirstName__c` becomes `FirstName__c`.
  - Data graphs, data transforms and rulesets get, lose or swap the prefix: `PhoneGraph`
    becomes `ds2_PhoneGraph`, ruleset `Individual_t1` becomes `ds2_Individual_t1` (the ruleset
    ID stays).
  - Identity resolution outputs: when their ruleset is in the same deploy,
    `UnifiedssotIndividual<Id>__dlm` becomes `ds2_UnifiedIndividual<Id>__dlm`. Otherwise deploy
    reads the org's ruleset list once and takes the output of the one ruleset of the same type
    in the target data space; none or several are refused. The outputs of the oldest `default`
    ruleset have no suffix (`UnifiedIndividual__dlm`) and are always placed from that list.
  - The names Salesforce generates for one graph (its helper DMOs and transform, join and field
    developer names) are left out; Salesforce generates new ones. A node developer name is
    rebuilt as Salesforce builds it: `ds2_PhoneGraph_ds2_ContactPointPhone`.
  - In a transform, a field after a join written with the side's qualifier (`R.FirstName__c`)
    is placed by that side. Output DLO names stay, and a DLO has only one writing transform
    across data spaces: give the copy another output object, or delete the source transform.
  - A mapping keeps its DLO side; it is found by its DLO and DMO, as always.
  - Calculated insights get, lose or swap the prefix: `Spend__cio` becomes `ds2_Spend__cio`.
- **SQL is renamed name by name** (calculated insights, DBT segment models and DCSQL transforms):
  - Tables follow the rules above. A DLO (`__dll`) keeps its name. Another insight (`__cio`)
    gets the prefix.
  - A column follows the rules of its table, through the table name, its alias, a `WITH` block
    or a subquery: `i.ssot__FirstName__c` on `ssot__Individual__dlm i` becomes
    `i.FirstName__c`.
  - A column without a table in front is renamed only when every table of the query spells it
    the same way. Otherwise write the table or alias in front of it.
  - Texts in single quotes and comments never change. `WITH` block names, aliases and column
    aliases are your names and stay. Double quotes and backticks are names.
  - A column alias works without `AS` after a closing bracket, a field, a number or a text
    (`SUM(x) total__c`, `i.FirstName__c fn__c`), as Salesforce accepts it. Right after an
    operator word such as `NOT`, `OR`, `IS`, `BETWEEN … AND` or `EXISTS`, the next name is a
    column to rename, not an alias: write `AS` there if you mean an alias. An alias still
    spelled like the old data space (`COUNT(x) ssot__Total__c`) is refused.
  - SQL ignores case, the rules do not: a name with its rule part in another case
    (`SSOT__ID__C`, `Individual__DLM`) is refused. Write `ssot__`, `__c` and `__dlm` in lower case.
  - Salesforce accepts an insight left in the `default` spelling in another data space, then
    fails it about three minutes after activation without a message. So after the rewrite
    every name of the SQL outside texts and comments must be placed, and none may keep the old
    spelling.
  - A name equal to a column alias reads that alias in `ORDER BY` and `HAVING` (also `SORT BY`,
    `DISTRIBUTE BY`, `CLUSTER BY`, `QUALIFY`), as Spark reads it. In `WHERE` and `GROUP BY` it
    reads the table's column. After `UNION`, `ORDER BY` reads the names of the first branch
    (its aliases and its columns): a name the first branch does not put out is refused there.
  - In a DCSQL transform the columns land by name in the fields of the node's output object
    (`relation_name`). An alias spelled like an output field follows that field, and so do its
    uses in `ORDER BY` and `HAVING`
    (`AS ssot__Name__c` becomes `AS Name__c` when the field becomes `Name__c`). A `GROUP BY`
    name equal to such a renamed alias is refused, because Spark reads it as a
    table column when one exists and as the alias otherwise: group by the expression itself. An
    alias of the column of the same name (`s.Id__c AS Id__c`) is not refused, since that column
    exists. A column without
    an alias is refused when its name and its field's name no longer match in the target (an
    output DLO keeps its fields, so `SELECT ssot__Id__c …` into it is refused): write it with
    `AS` and the field name as the source data space spells it. `*` over a table that is not a
    DLO is refused too, and so is `*` over a DLO when the output fields change: list the columns.
  - A DCSQL node whose `relation_name` names no output object of the transform is an
    intermediate model: its `relation_name` follows the object rules, and its columns are
    checked the same way against that object's fields as the other nodes read them (a DLO keeps
    its fields; a DMO's fields follow its rule, and a custom DMO's never change, so `*` over a DLO
    into one is kept). A node without a `relation_name` is refused. A node's `config`
    (`materialized: table`) is kept, but a value in it that holds an object or field name
    (`unique_key: Id__c`) is refused.
  - Positions are reported per SQL file, line and column.
- **Nothing is guessed.** A name no rule places exactly is listed, and the whole deploy is
  refused before any write (`CROSS_DATASPACE_UNRESOLVED`). For example, `ds2_Order__dlm`
  towards `default` can be a standard copy or a custom DMO: select its retrieved DMO file too.
- **Graphs, rulesets and transforms are checked completely.** Salesforce accepts a graph left in
  the `default` spelling in another data space and builds it on the `default` objects. So after
  the translation every object and field name must be covered, and none may keep the old
  spelling; otherwise the file is refused (`CROSS_DATASPACE_UNRESOLVED`).
- **Not translated yet:** STL transforms with any other node, transforms of other types (such
  as streaming SQL), and data streams. Under the flag they are refused before any write
  (`CROSS_DATASPACE_UNSUPPORTED`).
- **`--preview`** lists every rename (file, place in the file, old and new name, rule) and the
  copy files it would write. It writes nothing.
- **Copy files:** after an item has deployed, deploy writes its translated file under the new
  name, for example `data360/dmo/ds2_Order__dlm.dmo-meta.json`, and for an insight or DBT
  segment its SQL files beside it. Your original files never change.
  - A copy goes only to a new path. An existing file with the same content is reused; one with
    other content stops the deploy before any write (`CROSS_DATASPACE_COPY_CONFLICT`).
  - A mapping or relationship copy takes the name Salesforce gave it. A mapping copy holds the
    mapping as Salesforce stores it, the same file a retrieve of the target data space writes.
    That name is known only after the deploy, so another file already at that path does not stop
    the deploy: the copy is reported as not written, in the output and in the `--json` warnings.
  - A copy file selected beside its original (for example `-d data360` after an earlier `-c`
    run) would deploy the same item twice; the deploy is refused before any write
    (`DUPLICATE_IDENTITY`) and names both files.
  - A DLO gets no copy file; the output shows its new data space.

Each type page has a "Data spaces" section with its own rules. The
[Data spaces guide on sfmc.guide](https://sfmc.guide/next/data-spaces/) explains the concept and
the Salesforce behaviour.

## Per-type notes

The few things to know per type. Each type page has the full rules and error codes.

### Data streams

- Create the stream first: it creates its landing DLO. Then create the DMO, then the mapping.
- Salesforce gives a new Ingestion API stream a name of its own. Deploy shows that name in its
  result (`targetApiName` in JSON output); retrieve the stream under that name and keep that
  file.
- Ingestion API streams and Salesforce CRM streams are tested; other connectors are sent as
  written.
- Delete keeps the landing DLO unless you add `--delete-dlo`, and is refused while something
  else still uses the stream or its DLO.
- Reference: [Data streams](docs/types/data-stream.md).

### DLOs

- Category and, for Engagement DLOs, the event time field cannot change after create.
- An existing DLO takes label changes and new fields; other field changes are refused.
- For a stream's landing DLO, add fields through the stream.
- Reference: [DLOs](docs/types/dlo.md).

### DMOs

- Custom DMOs are fully managed. Standard and generated DMOs take custom fields, labels and the
  description; the plugin never creates a standard DMO.
- Fields missing from the file are removed only with `--allow-field-removal`. A mapped field is
  removed only when the same deploy also updates every mapping that uses it.
- `delete --field` removes single fields, also standard and generated ones.
- Reference: [DMOs](docs/types/dmo.md).

### Mappings

- The file is the list of field pairs the mapping should have; deploy adds and removes pairs to
  match it. Pairs Salesforce generates stay.
- The first mapping onto a standard DMO that is not enabled yet enables it permanently; preview
  warns about it.
- The last mapping of a custom DMO cannot be deleted on its own: delete the DMO instead.
- Reference: [Mappings](docs/types/mapping.md).

### Relationships

- Retrieve takes the source DMO: `relationship:<Dmo__dlm>` saves all of its relationships.
- Label, cardinality and source field can change in place. Deploy never deletes relationships.
- Both objects must be mapped before Salesforce accepts a relationship.
- Reference: [Relationships](docs/types/relationship.md).

### Data transforms

- The file holds the transform as Salesforce returns it, plus its schedule. A file without a
  schedule leaves the org's schedule alone.
- A deployed schedule makes the transform run in the target org. Deploy never starts a run.
- Formula, SQL filter and DCSQL SQL are written plain: the plugin asks Salesforce for plain
  text. Salesforce never decodes HTML entities it is sent, so deploy refuses an expression
  holding one outside texts (`&gt;`, `&#39;`): write the character itself.
- Deploy refuses a file whose text is an HTML-escaped copy of the org's text
  (`HTML_ESCAPED_FILE`, all types): Salesforce would store the entities literally.
- A DLO is written by one transform only, whatever the data space. A transform copied into
  another data space keeps its output DLO names, so it needs another output object, or the
  source transform deleted first. Salesforce's validation issues are shown with
  `TRANSFORM_VALIDATION_FAILED`.
- A SQL filter refuses `<>`; write `!=`.
- Reference: [Data transforms](docs/types/data-transform.md).

### Calculated insights

- The SQL is kept in its own `.sql` file. `--draft` deploys a draft; `sf data360 publish`
  activates it.
- Some SQL is accepted by Salesforce but fails a few minutes after publish without a message,
  for example a table alias or a `--` comment in a classic insight. Deploy warns about each such
  spot with file, line and column, and still deploys
  ([`CI_SQL_FAILS_SILENTLY`](docs/errors/calculated-insight/CI_SQL_FAILS_SILENTLY.md)).
- Reference: [Calculated insights](docs/types/calculated-insight.md).

### Segments

- SQL (DBT) segments keep each model in its own `.sql` file; segments built in the canvas keep
  their criteria in the JSON file.
- Create and update need `--allow-processing`. A deployed schedule makes the segment publish in
  the target org.
- The DMO the segment is built on must exist in the target org.
- `sf data360 publish -m segment:<Name>` publishes and waits for the result (`--async` starts
  it and returns at once); `sf data360 segment members export -m segment:<Name>` writes the members as CSV or JSON.
- Reference: [Segments](docs/types/segment.md).

### Data graphs

- Salesforce refuses removing fields or related objects and changing the root. The plugin
  refuses join changes, which Salesforce would accept but not apply.
- A file with another name creates another graph; graphs are not renamed.
- Graphs deploy last and are deleted first.
- Reference: [Data graphs](docs/types/data-graph.md).

### Identity resolution

- Create and update wait until the ruleset is published, which can take minutes. `--async`
  returns as soon as Salesforce accepts the change; run the same deploy again later to check.
- The configuration type and the secondary DMO cannot change.
- Reference: [Identity resolution](docs/types/identity-resolution.md).

## Safety and limits

- Run `--preview` before every deploy and delete.
- Use a sandbox or test org first. Deploys of streams, segments, graphs and identity resolution
  start processing; deletes cannot be undone.
- Retrieve, delete and field delete write files only below `data360/` and refuse symbolic links
  and paths outside it; `segment members export` writes its CSV or JSON to `--output-file`
  (by default under `data/<data space>/`). A differing existing file is replaced only with
  `--overwrite` (`-x`) on retrieve.
- No retry and no rollback of writes: after an `unknown` result, check the org first.
- Not every Salesforce behaviour is tested for every type, data space or org; the type pages
  name what is untested.

## Use it from another plugin

Other plugins can import `sf-plugin-data/api` and call it with a `Connection` from
`@salesforce/core` (`(await Org.create({ aliasOrUsername })).getConnection()`). The functions read
with API 68, print nothing and never exit; a refusal is thrown as an error with a `code` that has
a page under [docs/errors](docs/errors/README.md).

- `listSegments(connection, { dataSpace })`: every segment of one data space with `apiName`,
  `marketSegmentId` (the record ID, `1sg…`), `dataSpace`, `segmentOnApiName`, `segmentStatus` and
  `publishStatus`. An incomplete list fails with `SEGMENT_ACQUISITION_FAILED`.
- `resolveSegment(connection, { dataSpace, apiName })` or `{ dataSpace, marketSegmentId }`: one
  segment, matched exactly. A segment of another data space fails with `SEGMENT_OTHER_DATASPACE`,
  no segment at all with `SEGMENT_NOT_FOUND`.
- `crossSpaceContext(connection, { from, to, names? })`: what the rename rules of
  [salesforce-data360-rules](https://www.npmjs.com/package/salesforce-data360-rules) need to turn
  names of one data space into those of another (`placeDmo` for DMO names, `translateSegmentName`, …): the org's
  data spaces with their prefixes and, when a name in `names` is an identity resolution output
  (or `names` is left out), its rulesets. A data space the org lacks fails with
  `UNKNOWN_DATASPACE`.
- `runRetrieve(connection, { dataspace?, metadata?, outputDir?, overwrite?, apiVersion? })`: runs
  `sf data360 retrieve` with those flags and returns the same envelope `--json` shows. It does
  not throw for a refusal; the envelope's `status` and diagnostics say what happened, and
  `exitCodeOf(envelope)` gives the exit code the command would use. The connection's API version
  is restored afterwards.

## Local development

```sh
npm ci
npm run build
npm run lint
npm test
node bin/run.js data360 --help
```

`bin/run.js` runs the commands from the checkout without installing them into Salesforce CLI.
The tests run offline and never contact an org. `npm run smoke` runs the quick command and
documentation checks; `npm run smoke:package` packs the plugin and checks the package in an
isolated installation.

To try an installed copy, use a separate Salesforce CLI profile rather than your everyday one:
other plugins installed there may claim the same `data360` command names.

## More documentation

- [Type reference pages](docs/types/): one page per type, plus [Delete](docs/types/delete.md).
- [Error codes](docs/errors/README.md).
- [Artifact format](docs/artifact-format.md): the file layout.
- [Git workflow](docs/git-workflow.md): `--changed-since` and review flow.
- [Capabilities](docs/capabilities.md): the status of each type.
- [Data Cloud DevOps on sfmc.guide](https://sfmc.guide/next/data-cloud-devops/) and
  [Data spaces on sfmc.guide](https://sfmc.guide/next/data-spaces/).

Release notes are in GitHub Releases.
