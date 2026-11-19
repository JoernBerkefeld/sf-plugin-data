# Delete (`sf data360 delete`)

`sf data360 delete` removes Data Cloud components from an org. One command takes any mix of
types and deletes them in reverse dependency order, so a component is never deleted while a
selected component that needs it still exists. Components are chosen by name with `-m`, or
from the files a Git range deleted with `--changed-since`. Evidence for each type's delete
behaviour is on the sfmc.guide [Data Cloud DevOps](https://sfmc.guide/next/data-cloud-devops/)
pages.

## Commands

- `sf data360 delete -m <type>:<Name> [-m …] --preview` to see what would happen
- `sf data360 delete -m <type>:<Name> [-m …]` to delete
- `sf data360 delete --changed-since <ref> --preview` and
  `sf data360 delete --changed-since <ref> --confirm-delete`
- `sf data360 delete -m dmo:<Name__dlm> --field <Field__c>` to remove single DMO fields (see
  [DMOs](dmo.md))

## Selectors

Every component is named exactly, and `-m` is repeatable:

| Selector                                   | Type page                                     |
| ------------------------------------------ | --------------------------------------------- |
| `data-graph:<Name>`                        | [Data graphs](data-graph.md)                  |
| `identity-resolution:<Name>`               | [Identity resolution](identity-resolution.md) |
| `calculated-insight:<Name__cio>`           | [Calculated insights](calculated-insight.md)  |
| `segment:<Name>`                           | [Segments](segment.md)                        |
| `data-transform:<Name>`                    | [Data transforms](data-transform.md)          |
| `relationship:<SourceDmo__dlm>:<Name>`     | [Relationships](relationship.md)              |
| `mapping:<Name>`                           | [Mappings](mapping.md)                        |
| `dmo:<Name__dlm>` (alone with `--field`)   | [DMOs](dmo.md)                                |
| `dlo:<Name__dll>`                          | [DLOs](dlo.md)                                |
| `data-stream:<Name>` (with `--delete-dlo`) | [Data streams](data-stream.md)                |

There is no wildcard and no bare type: a delete always names its components. A relationship is
named with its source DMO; a bare `relationship:<Name>` is refused.

## One delete across families

`sf data360 delete` takes any mix of families in one command and runs them in reverse dependency
order, one phase after the other:

1. data graphs;
2. identity resolution, calculated insights and Segments, each dependent before the component
   it needs (a graph, calculated insight or Segment on the unified or link DMO of a selected
   ruleset counts as its dependent);
3. data transforms;
4. relationships, mappings, DMOs, then DLOs;
5. data streams.

- A phase starts only after every item of the previous one settled.
- A blocked, failed or unconfirmed item stops the run.
- An item Salesforce accepted but is still deleting (`deletion-processing`) stops the later
  phases with
  [`DELETE_PHASE_NOT_SETTLED`](../errors/general/DELETE_PHASE_NOT_SETTLED.md). Rerun the same
  delete once it reads absent; the items already gone then report `unchanged`.
- Each family keeps its own checks. Every result item carries `family`.

### What is read before anything is deleted

A `-m` delete reads no local file (a mapping is the one exception, see below). Before the first
delete, the current definition of each selected transform, Segment, identity resolution
ruleset, calculated insight and graph is read from the org by name. This read is read-only and
also runs with `--preview`; the family checks compare against it.

- A component the org does not have reports `unchanged` with mutation `not-attempted`.
- A data transform name is resolved to its record ID through the complete transform list,
  ignoring letter case. No match is `unchanged`; two or more are refused
  ([`TRANSFORM_TARGET_NOT_RESOLVED`](../errors/data-transform/TRANSFORM_TARGET_NOT_RESOLVED.md)).
- A mapping is found the way deploy finds it, by the source DLO and target DMO in its local
  `data360/mapping/<Name>.mapping-meta.json` file. See [Mappings](mapping.md).

### Components selected together

- A stream selected together with its landing DLO is deleted once, with `--delete-dlo`
  semantics; the DLO is never deleted on its own. The DLO item reports
  `removedWith: data-stream:<Name>` and the stream's outcome.
- A custom DMO selected together with its last mapping: only the DMO is deleted, which removes
  the mapping (Salesforce does not delete that mapping on its own). The mapping item reports
  `removedWith: dmo:<Name>` and the DMO's outcome; no delete request is sent for it. After the
  DMO deletion is confirmed, the mapping is read again: only a `404` keeps it `deleted` /
  `confirmed-deleted`. A mapping that stays readable is `deletion-unconfirmed` with
  [`MAPPING_DELETION_UNCONFIRMED`](../errors/mapping/MAPPING_DELETION_UNCONFIRMED.md).

### No confirmation flag for `-m`

A `-m` delete runs without a confirmation flag: check it with `--preview` first.
`--confirm-delete` belongs to `--changed-since` only.

```sh
sf data360 delete -o target -m data-graph:ExampleGraph -m identity-resolution:Individual_5810 --preview
sf data360 delete -o target -m data-graph:ExampleGraph -m identity-resolution:Individual_5810
```

## Preview

`--preview` runs every phase read-only and writes nothing, in the org or on disk.

- An item whose selected dependents an earlier phase deletes (the ruleset above, whose unified
  DMO the graph uses) is reported `planned-dependencies` with
  [`DEPENDENCIES_PLANNED`](../errors/dependency/DEPENDENCIES_PLANNED.md) naming them, without
  being checked further. The real run checks again once the earlier phases have deleted them.
- The local files an execution would remove are listed as `localFiles`, each with `exists`.
- With `--json`, `provenance.targetOrgId` names the ID of the org the run resolved, on a preview
  as on a real delete, so a confirmation can show it before deleting. It is `null` when the run
  stopped before an org was resolved.

## Delete what a Git range deleted

`--changed-since <ref>` deletes in the org the components whose canonical plugin files were
deleted since the merge base with `<ref>` (committed or staged; an unstaged deletion blocks).
Files changed or added in the range are not part of a delete. It cannot be combined with `-m`
and always needs `--confirm-delete`, even for one family; `--preview` runs without it.

```sh
sf data360 delete -o target --changed-since main --preview
sf data360 delete -o target --changed-since main --confirm-delete
```

- The deleted files run through the same phases. Identity and definition come from each file's
  merge-base content, not from its name, and each family keeps its checks. Right before each
  phase, every deleted path must still be absent
  ([`BLOCKED_GIT_LIFECYCLE`](../errors/general/BLOCKED_GIT_LIFECYCLE.md)).
- A path deleted and added again is not a delete. A rename (also one split across commit,
  index and worktree: one component deleted at one path and added at another), a conflict or a
  deleted file of no known family blocks before any org call (`BLOCKED_GIT_LIFECYCLE`).
- A relationship takes its source DMO from the base content. When its name is gone from the org
  but the same binding exists under another name, the delete is refused with
  `RELATIONSHIP_NAME_MISMATCH`.
- A data transform is found by name in the org's transform list, like a `-m` one: no match
  reports `unchanged` (also when the delete is run again after the transform was deleted), two
  or more are refused (`TRANSFORM_TARGET_NOT_RESOLVED`).
- A stream file deleted together with its landing DLO file is one stream delete with that DLO;
  a stream deleted alone keeps its DLO. `--delete-dlo` is refused here.
- No local file is listed or removed: the files are already gone. A range without deleted
  plugin files succeeds without an org call.

## Local files after delete

After a confirmed deletion, `sf data360 delete` removes the deleted component's local file at
its canonical path, found by name (no folder is searched). This happens on outcome `deleted`
(mutation `confirmed-deleted`) and on `deletion-processing` (mutation `acknowledged-processing`:
Salesforce accepted the deletion and is finishing it). Pass `--keep-local-files` to keep the
files.

The name in the file path and in the result is the org's spelling when the org matched the
selector ignoring case (`-m data-transform:copy` deletes `Copy` and removes
`Copy.dataTransform.json`). A component the org does not have keeps the selector's spelling.

| Family                                                                              | File removed (under `data360/` in the current directory)                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dlo`, `dmo`, `relationship`, `data-stream`, `data-transform`, `calculated-insight` | its file (`data360/dataTransforms/<Name>.dataTransform.json` for a transform; both `data360/calculatedInsights/<Name>.calculatedInsight-meta.json` and `.calculatedInsight-meta.sql` for a calculated insight); with `--delete-dlo` (or its landing DLO selected) also the linked DLO's file |
| `mapping`                                                                           | `data360/mapping/<Name>.mapping-meta.json`, or the hand-written mapping file whose binding matches                                                                                                                                                                                           |
| `segment`, `identity-resolution`, `data-graph`                                      | `data360/segments/<Name>.segment.json` together with every `<Name>.segment.*.sql` beside it, `data360/identityResolution/<Name>.identityResolution.json`, `data360/dataGraphs/<Name>.native-dataGraph.json`                                                                                  |

- Files are removed one at a time and only when they are regular files. Directories, symbolic
  links, junctions, files reached through a linked folder, hard-linked files and any path
  outside the project's `data360` folder are refused.
- Each result item lists `removedLocalFiles` with the outcome of every file: `removed`,
  `not-present`, `kept` or `failed`.
- A failed removal keeps the confirmed org outcome; the command then exits nonzero with
  [`LOCAL_FILE_REMOVAL_FAILED`](../errors/general/LOCAL_FILE_REMOVAL_FAILED.md). Remove that
  file by hand; do not repeat the delete.
- Nothing is removed by `--preview`, which lists the files as `localFiles` with `exists`, nor
  for the outcomes `unchanged`, `blocked`, `failed`, `rejected` and `deletion-unconfirmed` or an
  `unknown` mutation.
- Mapping files of mappings that Salesforce removes together with a deleted DMO stay, unless
  the mapping is an item of the command (`removedWith` the DMO).
- Field-level delete (`--field`) removes no file; it refreshes the existing DMO and mapping
  files instead.
- A `--changed-since` delete removes no file.

```sh
sf data360 delete -o target -m mapping:ExampleMapping --preview --json
sf data360 delete -o target -m dlo:Example__dll --keep-local-files
```

## Data spaces

A delete runs in the run's data space (`--dataspace`, `default` when omitted; see
[Data spaces](../../README.md#data-spaces)). A component of another data space is refused before
any write. A stream is deleted when its DLO belongs to the run's data space, and a DLO that also
belongs to another data space is not deleted, also with `--delete-dlo`
([`DLO_DELETE_OTHER_DATASPACES`](../errors/dlo/DLO_DELETE_OTHER_DATASPACES.md)).

## Per-type notes

Each type keeps its own checks; the type pages hold the details.

- **Data graphs**: the definition and its dependency lists are checked again right before the
  DELETE; unknown or nonempty dependencies block. See [Data graphs](data-graph.md).
- **Identity resolution**: refused while `PUBLISHING` or `DELETING`; usually reports
  `deletion-processing` first. See [Identity resolution](identity-resolution.md).
- **Calculated insights**: deleted by name in any status. See
  [Calculated insights](calculated-insight.md).
- **Segments**: deletion by name, confirmed by reading it again. See [Segments](segment.md).
- **Data transforms**: a transform that is `PROCESSING` is refused before the DELETE
  ([`TRANSFORM_DELETE_PROCESSING`](../errors/data-transform/TRANSFORM_DELETE_PROCESSING.md)). See
  [Data transforms](data-transform.md).
- **Relationships**: run first in their phase, before mappings, DMOs and DLOs. See
  [Relationships](relationship.md).
- **Mappings**: the whole mapping is deleted; the last mapping of a custom DMO is refused
  ([`MAPPING_LAST_MAPPING_DELETE_BLOCKED`](../errors/mapping/MAPPING_LAST_MAPPING_DELETE_BLOCKED.md)),
  so delete the DMO instead. See [Mappings](mapping.md).
- **DMOs**: a whole-DMO delete is sent for every DMO and Salesforce decides; `--field` removes
  single fields. See [DMOs](dmo.md).
- **DLOs**: see [DLOs](dlo.md).
- **Data streams**: the landing DLO is kept unless `--delete-dlo` is given (or the DLO is
  selected too); other dependents block the delete
  ([`STREAM_DELETE_DEPENDENCIES_BLOCKED`](../errors/data-stream/STREAM_DELETE_DEPENDENCIES_BLOCKED.md)).
  See [Data streams](data-stream.md).

No delete retries a write that may have reached Salesforce, and nothing is rolled back.

## Error codes

The full list, grouped by family: [docs/errors](../errors/README.md).
