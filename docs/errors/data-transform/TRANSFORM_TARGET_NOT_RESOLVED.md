# `TRANSFORM_TARGET_NOT_RESOLVED`

> A data transform deleted in the Git range is found in the org by its name, and exactly one transform must match. Nothing was deleted; check the transforms with that name in Data Cloud, then delete it with -m and --transform-target-id.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

`sf data360 delete --changed-since <ref>` deletes a data transform whose `.dataTransform.json` file was deleted in the Git range. There is no `--transform-target-id` in that case, so the plugin reads the full list of data transforms and looks for the name from the file's base content, ignoring case. It found no transform with that name, or more than one. The lookup runs for every such transform before any phase starts (also with `--preview`), so nothing in the range was deleted.

## Why the plugin stops

The record ID decides what gets deleted. With no match there is nothing to delete by that name; with several matches the plugin cannot tell which one the file described.

## How to fix

1. Look up the transforms with that name in Data Cloud.
2. If none exists, the transform is already gone; nothing needs to be deleted.
3. If several exist, restore the file from the base commit and delete the one you mean with `-m data-transform:<Name>`, `--source-dir` naming that file and `--transform-target-id <Id>`.

## Example output

```text
Delete: blocked.
TRANSFORM_TARGET_NOT_RESOLVED: The org has no data transform named Orders_Copy, so the transform deleted in the Git range cannot be resolved to one target ID. Nothing was deleted.
Hint: A data transform deleted in the Git range is found in the org by its name, and exactly one transform must match. Nothing was deleted; check the transforms with that name in Data Cloud, then delete it with -m and --transform-target-id.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_TARGET_NOT_RESOLVED.md
```

## Related codes

- [`TRANSFORM_DELETE_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_DELETE_IDENTITY_MISMATCH.md) — the list has no entry with the given ID and name together.
- [`INCOMPLETE_TRANSFORM_INVENTORY`](../data-transform/INCOMPLETE_TRANSFORM_INVENTORY.md) — the list itself could not be read completely.
