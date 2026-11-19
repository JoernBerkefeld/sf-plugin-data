# `TRANSFORM_DATASPACE_MISMATCH`

> The data transform (its file's c__dataSpace, or the transform of that name in the org) is in another data space than the run. A transform without any data space in the org is handled in default. Run with the --dataspace the message names, then rerun.

|              |                                                                         |
| ------------ | ----------------------------------------------------------------------- |
| **Family**   | Data transform                                                          |
| **Commands** | `sf data360 deploy`, `sf data360 delete`, `sf data360 retrieve`         |
| **Outcome**  | `blocked` — nothing was changed (retrieve: `failed` for this transform) |

## What it means

Every command runs in one data space: `--dataspace`, or `default` when you leave it out. A transform file names its data space in its top-level `c__dataSpace` key, which must equal Salesforce's own `definition.dataSpaceName` when the definition names one. A transform GET without `dataSpaceName` (one built on DLOs, or one with `definitions`) takes its data space from the org's MktDataTransform record, read with SOQL; a transform without any data space there (a system transform) is handled in `default` only. Transform names are unique in the org, and the transform list ignores a data space, so the plugin reads a transform by name and resolves its data space before anything is projected, written or deleted.

This code means the file, or the transform of that name in the org, is in another data space than the run's, or the org transform is in another data space than the file. A create of a file in a non-default data space whose definition names no `dataSpaceName` is refused too: the create cannot name the data space.

## Why the plugin stops

The plugin never filters a selected component out silently, and a transform does not move between data spaces. A transform of another data space is refused, so a command never changes one in a data space you did not ask for.

## How to fix

1. Check `c__dataSpace` (and `definition.dataSpaceName`) in the file, or the data space the message names.
2. Pass `--dataspace` with that value, or leave it out for `default` (also for a transform without any data space in the org).
3. Run transforms of different data spaces in separate commands.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Data space: dataspace2.
TRANSFORM_DATASPACE_MISMATCH: Data transform Example_Transform is in the data space default (c__dataSpace, or the org's transform; one without any data space is handled in default), but the run's data space is dataspace2. Run the command with --dataspace default. Deployment was refused before any write; nothing was sent to the org. Fix the reported cause, then rerun.
Hint: The data transform (its file's c__dataSpace, or the transform of that name in the org) is in another data space than the run. A transform without any data space in the org is handled in default. Run with the --dataspace the message names, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_DATASPACE_MISMATCH.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`INVALID_DATASPACE_FIELD`](../general/INVALID_DATASPACE_FIELD.md) — `c__dataSpace` does not agree with `definition.dataSpaceName`.
- [`CI_DATASPACE_MISMATCH`](../calculated-insight/CI_DATASPACE_MISMATCH.md) — the same check for calculated insights.
