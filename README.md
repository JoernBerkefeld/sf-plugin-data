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
npm ci --no-workspaces
npm run build --no-workspaces
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
  Retrieve without `-m` selects every DLO, DMO and mapping.
- Deploy and delete always name their components, or take them from Git with
  `--changed-since`. Deploy also takes files and folders with `--source-dir` (`-d`).

### Preview first

`sf data360 deploy --preview` and `sf data360 delete --preview` read the org and report, per
component, what would happen: `create`, `update`, `unchanged`, `delete`, or `blocked` with the
reason. They never write to the org and never change local files. A component whose parent is
created by the same command reports `planned-dependencies`, because its target cannot be
compared yet.

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
  model. One failing component never stops the others.
- A key the plugin does not know stays in the retrieved file. Deploy refuses such a file and
  names the key.
- A component the file format cannot represent is saved as Salesforce returned it, with a
  warning. Such a file is skipped by a folder or Git deploy and refused when named
  (`VERBATIM_NOT_DEPLOYABLE`), but you can still delete the component by name.

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

Every command runs in one data space: pass the optional `--dataspace NAME`, or leave it out to
work in `default`. `--data-space` is a compatibility alias. Neither spelling has a CLI default
value of its own; the plugin uses `default`. A command never works on
all data spaces at once, and an unknown data space stops it before any read or write.

- **The file names its data space.** Every file carries the top-level key `c__dataSpace`. Deploy
  and delete refuse a file of another data space than the run's, before any write.
- **DLOs follow the run's data space** and can belong to several data spaces. Their file lists
  all of them in `c__dataSpace`. Deploy adds the DLO to the listed data spaces it is not in yet.
  It removes the DLO from a data space the file no longer lists only with
  `--allow-dataspace-removal`. Delete refuses a DLO that also belongs to another data space.
- **Data streams** belong to the data spaces of their landing DLO; change them through the DLO
  file.
- **Names are what Salesforce stores.** Outside `default`, Salesforce gives some components the
  data space's prefix (chosen when the data space was created; `ds2` in these examples): a standard DMO is a copy such as `ds2_Individual__dlm` (fields without `ssot__`), a
  segment is stored as `ds2_<Name>`, and an identity resolution ruleset as
  `ds2_<type>_<rulesetId>`. Files carry these names, and the plugin adds or removes no prefix.
- **First mapping onto a standard DMO copy.** The copy exists only once something is mapped
  onto it in that data space. Deploy the mapping, not a DMO file, to create it; the plugin
  sends the mapping the way Salesforce takes it.

Each type page has a "Data spaces" section with its own rules. The
[Data spaces guide on sfmc.guide](https://sfmc.guide/next/data-spaces/) explains the concept and
the Salesforce behaviour.

## Per-type notes

The few things to know per type. Each type page has the full rules and error codes.

### Data streams

- Create the stream first: it creates its landing DLO. Then create the DMO, then the mapping.
- Salesforce renames a new Ingestion API stream. Deploy reports the new name as
  `targetApiName`; retrieve the stream under that name and keep that file.
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
- Reference: [Data transforms](docs/types/data-transform.md).

### Calculated insights

- The SQL is kept in its own `.sql` file. `--draft` deploys a draft; `sf data360 publish`
  activates it.
- Reference: [Calculated insights](docs/types/calculated-insight.md).

### Segments

- SQL (DBT) segments keep each model in its own `.sql` file; segments built in the canvas keep
  their criteria in the JSON file.
- Create and update need `--allow-processing`. A deployed schedule makes the segment publish in
  the target org.
- The DMO the segment is built on must exist in the target org.
- `sf data360 publish -m segment:<Name>` publishes and waits for the result;
  `sf data360 segment members export -m segment:<Name>` writes the members as CSV or JSON.
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

## Local development

```sh
npm ci --no-workspaces
npm run build
npm run lint
npm test
node bin/run.js data360 --help
```

`bin/run.js` runs the commands from the checkout without installing them into Salesforce CLI.
The tests run offline and never contact an org.

## More documentation

- [Type reference pages](docs/types/): one page per type, plus [Delete](docs/types/delete.md).
- [Error codes](docs/errors/README.md).
- [Artifact format](docs/artifact-format.md): the file layout.
- [Git workflow](docs/git-workflow.md): `--changed-since` and review flow.
- [Capabilities](docs/capabilities.md): the status of each type.
- [Data Cloud DevOps on sfmc.guide](https://sfmc.guide/next/data-cloud-devops/) and
  [Data spaces on sfmc.guide](https://sfmc.guide/next/data-spaces/).

Release notes are in GitHub Releases.
