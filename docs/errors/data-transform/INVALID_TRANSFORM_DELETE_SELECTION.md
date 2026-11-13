# `INVALID_TRANSFORM_DELETE_SELECTION`

> A delete takes at most one data-transform:Name, with a --source-dir value naming its .dataTransform.json file and --transform-target-id; with --changed-since, no --transform-target-id. Fix the flags and rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Deleting a data transform needs a precise selection, and the flags given do not form one. Typical causes: more than one `data-transform:` selector, a selector that is not `data-transform:Name`, a missing or malformed `--transform-target-id`, no `--source-dir` value naming a `.dataTransform.json` file, or the file describing a different transform than the selector names. Other families may be selected in the same delete.

With `--changed-since`, a transform deleted in the Git range is resolved by its name, so `--transform-target-id` is refused there.

## Why the plugin stops

Deleting is irreversible. The plugin needs the API name, the matching local definition and the exact record ID together so it can prove they all describe the same transform before it sends anything.

## How to fix

1. Pass exactly one `--metadata data-transform:<Name>`.
2. Pass `--source-dir data360/dataTransforms/<Name>.dataTransform.json` for the same name.
3. Pass `--transform-target-id` with the transform record ID (it starts with `1dt` and is 18 characters long).
4. Rerun the command. The source and output DLOs are never deleted with the transform; select them with `-m dlo:<Name>__dll` to delete them after it.

## Example output

```text
Delete: blocked.
INVALID_TRANSFORM_DELETE_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: A delete takes at most one data-transform:Name, with a --source-dir value naming its .dataTransform.json file and --transform-target-id; with --changed-since, no --transform-target-id. Fix the flags and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INVALID_TRANSFORM_DELETE_SELECTION.md
```

## Related codes

- [`INVALID_TRANSFORM_SCOPE`](../data-transform/INVALID_TRANSFORM_SCOPE.md) — the selection is fine but the API version or data space is not supported.
- [`TRANSFORM_DELETE_CONFIRMATION_REQUIRED`](../data-transform/TRANSFORM_DELETE_CONFIRMATION_REQUIRED.md) — the selection is valid but `--confirm-delete` is missing.
