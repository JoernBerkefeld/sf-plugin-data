# Identity resolution (`identity-resolution`)

An identity resolution ruleset tells Data Cloud how to match profiles from different sources
and how to reconcile their values into unified profiles. Salesforce generates a unified DMO and
a link DMO for each ruleset. The plugin retrieves, creates, updates and deletes rulesets in the
run's data space with the native Data Cloud API 68. Evidence for the API behaviour is on the
sfmc.guide [Data Cloud DevOps](https://sfmc.guide/next/data-cloud-devops/) pages, see
[Identity Resolution](https://sfmc.guide/next/data-cloud-devops/identity-resolution/).

## Commands

- `sf data360 retrieve -m identity-resolution:<Name>` (or bare `-m identity-resolution` for
  every ruleset of the run's data space)
- `sf data360 deploy --source-dir <file or folder> --allow-processing` (add `--async` to return
  without waiting for publishing)
- `sf data360 delete -m identity-resolution:<Name>`
- `--preview` on deploy and delete

## Selector and API version

- `identity-resolution:<Name>` selects one ruleset by its API name, for example
  `identity-resolution:Individual_ir01`. Bare `identity-resolution` reads the ruleset list once
  and retrieves every ruleset of the run's data space; one failing ruleset never blocks the
  others.
- Retrieve, deploy and delete accept `--api-version auto` (the default) or `68.0`.

## File

Retrieve writes `data360/identityResolution/<Name>.identityResolution.json`. Every ruleset the
API returns is supported: any configuration type and name, automatic run on or off, case
sensitivity, secondary DMO, filters, trusted sources, match rules, reconciliation rules, and
rulesets that are not published yet.

The file holds:

- label and description, the automatic-run and case settings;
- the match criteria;
- the object reconciliation defaults, ordered source priorities and explicit field overrides;
- the ruleset's data space in `c__dataSpace`.

Rules for the content:

- Source order is meaningful and is kept as written, not sorted.
- An empty field-override list resets those fields to the object's defaults.
- A file without `trustedSources` deploys like one with an empty list.
- Emptying filters or trusted sources sends the empty list, and Salesforce decides.
- Run statistics (`lastJobStatus`, `knownUnifiedProfiles` and similar) are not part of the file.
- Dependencies are matched again in the target: DMOs, fields and mapped DLO sources are looked
  up there, instead of reusing source IDs or guessing generated output names.

## Create and update

Deploy by name:

- absent: one POST creates the ruleset;
- present with a difference: one full-settings PATCH;
- present, settled and equal: `unchanged`, with no write.

CREATE and PATCH publish the ruleset automatically and can start processing even with automatic
run off, so deploy needs `--allow-processing` (for a create this includes the generated unified
and link DMOs). Preview is read-only.

After the write, deploy waits until Salesforce reports the ruleset `PUBLISHED`, then reads it
again: the settings must equal the file and the generated unified and link outputs must be bound
as expected. Salesforce's acknowledgement alone is not success. Waiting is bounded; an outcome
that cannot be confirmed is reported as `unknown` and stops the batch, with no automatic retry
or rollback. Inspect that ruleset in the target before deciding what to do next.

Refused before any write:

- changing `configurationType` or the secondary DMO of an existing ruleset (`blocked-changes`),
  because a PATCH cannot carry that change;
- a new ruleset whose name is not `<configurationType>` or `<configurationType>_<rulesetId>`,
  the name Salesforce gives it
  ([`IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH`](../errors/identity-resolution/IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH.md));
- a ruleset that is `PUBLISHING` or `DELETING`
  ([`IDENTITY_RESOLUTION_NOT_SETTLED`](../errors/identity-resolution/IDENTITY_RESOLUTION_NOT_SETTLED.md)),
  because the plugin could not tell its own change from the one already running. Rerun the
  deploy once the ruleset has settled.

## Return without waiting: `--async`

With `--async`, deploy runs every check before the write as usual, sends the one POST or PATCH,
checks that Salesforce's immediate answer names this ruleset (its API name, or on an update its
existing ID), and returns without waiting for `PUBLISHED`.

```sh
sf data360 deploy --source-dir data360/identityResolution/Individual_ir01.identityResolution.json --target-org target --allow-processing --async --json
```

- The item reports `creation-processing` or `update-processing` with mutation
  `acknowledged-processing`, the command exits 0, and human output ends with
  `accepted, still processing: 1`.
- `--async` applies to identity resolution only. A selection without a ruleset is refused with
  [`INVALID_ASYNC_SCOPE`](../errors/general/INVALID_ASYNC_SCOPE.md) (exit 1); that includes a
  `--changed-since` run whose change set holds no ruleset, so drop `--async` there.
- A selection that also holds a calculated insight, Segment or data graph using the ruleset's
  unified or link DMO is refused with
  [`IDENTITY_RESOLUTION_ASYNC_DEPENDENTS`](../errors/identity-resolution/IDENTITY_RESOLUTION_ASYNC_DEPENDENTS.md),
  because those need the published ruleset.
- Other items in the same batch still wait as usual. With `--preview`, `--async` changes nothing.

What it saves: the wait for publishing and the checks after it. You can deploy several rulesets
one after another and check them later. The checks before the write still run.

What it costs:

- Nothing confirms that publishing succeeded, that the settings stuck, or that the unified and
  link DMOs exist. `acknowledged-processing` only means Salesforce accepted the request.
- Steps that need the published ruleset fail if run right away. For example, a data graph
  preview on the unified DMO reports `DATA_GRAPH_OWNER_NOT_PUBLISHED` until then.
- Deploying the same file again reports `IDENTITY_RESOLUTION_NOT_SETTLED` while the ruleset is
  `PUBLISHING`: nothing is written, and the run is `processing` (exit code 69) when nothing
  else failed.
- A failed publish looks like a slow one until you deploy again.

To check the result, run the same deploy again (with or without `--async`); it runs the full
checks. `IDENTITY_RESOLUTION_NOT_SETTLED` means it is still publishing; `unchanged` means it
settled with the file's settings and verified outputs. Any other answer means it did not settle
as written: retrieve the ruleset and inspect it.

## Delete

`sf data360 delete -m identity-resolution:<Name>` deletes one ruleset, read from the org by name
first. Preview is read-only. Execution needs neither a confirmation flag nor
`--allow-processing`.

```sh
sf data360 delete -m identity-resolution:Individual_ir01 --target-org target --preview --json
sf data360 delete -m identity-resolution:Individual_ir01 --target-org target --json
```

- The ruleset must be settled (automatic run on or off); one that is `PUBLISHING` or `DELETING`
  is refused with `IDENTITY_RESOLUTION_NOT_SETTLED`. Source, settings, outputs and dependencies
  are checked, and a fresh target ID is resolved before the one DELETE.
- Salesforce finishes the deletion in the background. While it reads `DELETING`, the item
  reports `deletion-processing` with mutation `acknowledged-processing`, and human output says
  `(server is still processing)`. Only when the ruleset reads not found by ID and by name is it
  `deleted` / `confirmed-deleted`.
- A ruleset the org does not have reports `unchanged` with no write, so the same delete can be
  rerun to check that it is gone. Do not delete it in another way while it is still processing.
- A delete never cascades: the unified and link DMOs are not deleted by the plugin, no run is
  started, and no fallback to another API is used.
- In a delete across families, a graph, calculated insight or Segment that uses the ruleset's
  unified or link DMO is deleted before the ruleset. See [Delete](delete.md).

The file is the intended settings, not permission to delete: check the known consumers before
deleting a ruleset.

## Data spaces

A ruleset belongs to one data space, named in `c__dataSpace`. Its references (secondary DMO,
match and reconciliation entities and fields, DLO sources, unified and link outputs) carry no
data space of their own: they are all in the ruleset's data space, and the file names them as
Salesforce stores them there. The old `identity.dataSpace` key and a reference's `dataSpace` are
refused ([`LEGACY_DATASPACE_KEY`](../errors/general/LEGACY_DATASPACE_KEY.md)). See
[Data spaces](../../README.md#data-spaces) for `--dataspace`.

- **Names are what Salesforce stores.** Outside `default` the ruleset is named
  `<prefix>_<type>_<rulesetId>` (for example `ds2_Individual_cx2a`), its rules use the copy
  spelling (`ds2_Individual__dlm` with `FirstName__c`), and its outputs are, for example,
  `ds2_UnifiedIndividualCx2a__dlm` and `ds2_UnifiedLinkIndividualCx2a__dlm`. Only mapped entities
  get outputs.
- A deploy of a non-default file whose name lacks the prefix from the org's data space list, or
  in an org whose list names no prefix, is refused before any write
  ([`IDENTITY_RESOLUTION_NAME_NOT_STORED`](../errors/identity-resolution/IDENTITY_RESOLUTION_NAME_NOT_STORED.md)).
  The create sends the ruleset ID after `<prefix>_<type>_` and `dataSpaceName`.
- Retrieve reads a ruleset by name and checks its `dataSpaceName` first. One of another data
  space is a failed item
  ([`IDENTITY_RESOLUTION_DATASPACE_MISMATCH`](../errors/identity-resolution/IDENTITY_RESOLUTION_DATASPACE_MISMATCH.md)).
  The ruleset list returns every data space, so bare `identity-resolution` keeps each entry by
  its `dataSpaceName`.
- Deploy and delete refuse a file, or an org ruleset, of another data space before any write.
  The entity and output DMOs are read in the ruleset's data space. A DMO the read names in
  another data space, or a DLO source that does not belong to it, is
  [`IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE`](../errors/identity-resolution/IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE.md).
- Only if you have more than one data space: `--allow-cross-dataspace` (`-c`) deploys a ruleset
  file of another data space. It is renamed by rule with its ruleset ID kept (`Individual_t1`
  becomes `ds2_Individual_t1`), and its secondary DMO, match and reconciliation entities and
  fields follow the standard DMO rules (`ssot__Individual__dlm` with `ssot__FirstName__c` becomes
  `ds2_Individual__dlm` with `FirstName__c`). DLO sources keep their names. A filter or other
  reference the translation does not cover refuses the file before any write. A graph or
  transform deployed with it uses its translated outputs. After the deploy the translated file
  is written under the new name. See [Deploy from another data space](../../README.md#deploy-from-another-data-space-only-if-you-have-more-than-one-data-space).

## Error codes

The full list, grouped by family (identity resolution codes included):
[docs/errors](../errors/README.md).
