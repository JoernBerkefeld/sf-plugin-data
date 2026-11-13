# `INVALID_STREAM_DELETE_SELECTION`

> Data stream deletion needs only exact data-stream:ApiName selectors. Remove other families and bare data-stream from -m, then rerun the delete.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data stream                     |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

A delete selection that contains any `data-stream` selector must contain only exact `data-stream:<ApiName>` selectors. This code means the selection also contained another family (such as `dlo:` or `dmo:`), the bare `data-stream` type without a name, or a stream name that is not a valid developer name.

## Why the plugin stops

Stream deletion has its own checks and can delete the linked DLO. Mixing it with other deletions, or deleting every stream by type, would make the scope unclear, so the plugin refuses the selection before reading the org.

## How to fix

1. List each stream explicitly: `sf data360 delete -o <org> -m data-stream:<ApiName>`.
2. Delete other components in a separate run.
3. Add `--delete-dlo` only if the stream's linked DLO should be deleted as well.

## Example output

```text
Delete: blocked.
INVALID_STREAM_DELETE_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: Data stream deletion needs only exact data-stream:ApiName selectors. Remove other families and bare data-stream from -m, then rerun the delete.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_DELETE_SELECTION.md
```

## Related codes

- [`STREAM_DELETE_DLO_REQUIRES_STREAM_SELECTION`](../data-stream/STREAM_DELETE_DLO_REQUIRES_STREAM_SELECTION.md) — `--delete-dlo` was used without a stream selector.
- [`DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED`](../data-stream/DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED.md) — the same rule for deploy.
