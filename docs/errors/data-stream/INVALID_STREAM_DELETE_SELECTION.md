# `INVALID_STREAM_DELETE_SELECTION`

> A data stream is selected for deletion as exact data-stream:ApiName, and --delete-dlo is not taken with --changed-since. Fix -m or the flags, then rerun the delete.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data stream                     |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Each stream in a delete is named exactly as `data-stream:<ApiName>`. This code means `-m` held the bare `data-stream` type without a name, or a stream name that is not a valid developer name. Other families may be selected in the same delete; streams run in the last phase.

It also means `--delete-dlo` was passed with `--changed-since`. There the deleted files decide: a stream whose landing DLO file was deleted in the same range is deleted together with that DLO, otherwise the DLO is kept.

## Why the plugin stops

Stream deletion has its own checks and can delete the linked DLO. Deleting every stream by type would make the scope unclear, so the plugin refuses the selection before reading the org.

## How to fix

1. List each stream explicitly: `sf data360 delete -o <org> -m data-stream:<ApiName>`.
2. Add `--delete-dlo` only if the stream's linked DLO should be deleted as well, or select that DLO in the same delete (`-m dlo:<Name>__dll`), which deletes it with the stream. With `--changed-since`, drop `--delete-dlo` and delete the DLO file in the same range instead.

## Example output

```text
Delete: blocked.
INVALID_STREAM_DELETE_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: A data stream is selected for deletion as exact data-stream:ApiName, and --delete-dlo is not taken with --changed-since. Fix -m or the flags, then rerun the delete.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_DELETE_SELECTION.md
```

## Related codes

- [`STREAM_DELETE_DLO_REQUIRES_STREAM_SELECTION`](../data-stream/STREAM_DELETE_DLO_REQUIRES_STREAM_SELECTION.md) — `--delete-dlo` was used without a stream selector.
