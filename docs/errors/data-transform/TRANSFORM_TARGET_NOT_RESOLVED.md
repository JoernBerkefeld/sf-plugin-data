# `TRANSFORM_TARGET_NOT_RESOLVED`

> Two or more data transforms in the org have this name when letter case is ignored, so it does not resolve to one transform. Nothing was deleted; rename or remove the duplicate in Data Cloud, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

`sf data360 delete` finds a data transform by its API name: from `-m data-transform:<Name>`, or with `--changed-since` from the base content of the deleted `.dataTransform.json` file. It reads the full list of data transforms and looks for that name, ignoring letter case. It found more than one. The lookup runs before any phase starts (also with `--preview`), so nothing was deleted.

When no transform has that name, there is nothing to delete: the item reports `unchanged`, also when a Git delete is run again after the transform was already deleted.

## Why the plugin stops

The record ID decides what gets deleted. With several matches the plugin cannot tell which transform the name means.

## How to fix

1. Look up the transforms with that name in Data Cloud.
2. Rename or remove the one you do not want to delete, then rerun the delete with `--preview` first.

## Example output

```text
Delete: blocked.
TRANSFORM_TARGET_NOT_RESOLVED: The org has 2 data transforms named Orders_Copy (ignoring case), so the name does not resolve to one target ID. Nothing was deleted.
Hint: Two or more data transforms in the org have this name when letter case is ignored, so it does not resolve to one transform. Nothing was deleted; rename or remove the duplicate in Data Cloud, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_TARGET_NOT_RESOLVED.md
```

## Related codes

- [`TRANSFORM_DELETE_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_DELETE_IDENTITY_MISMATCH.md) — the list has no entry with the resolved ID and name together.
- [`INCOMPLETE_TRANSFORM_INVENTORY`](../data-transform/INCOMPLETE_TRANSFORM_INVENTORY.md) — the list itself could not be read completely.
