# `STREAM_DELETE_PARENT_DRIFT`

> The stream was deleted, but its kept DLO changed or could not be read the same way. Check the DLO in the org before anything else.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Data stream                   |
| **Commands** | `sf data360 delete`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

Without `--delete-dlo`, the stream's DLO is kept. After the delete, the plugin reads the DLO by name and by ID and expects it to be exactly as before. This code means it was not: it is missing, or a field, status or other value differs.

## Why the plugin stops

The delete request was sent and the stream is likely gone, but the DLO that should have stayed has changed. The plugin cannot tell whether the delete caused it, so it reports the result as unknown.

## How to fix

1. Check in Data Cloud Setup whether the stream is gone and the DLO still exists.
2. Retrieve the DLO with `sf data360 retrieve -m dlo:<Name>__dll` and compare it with your files.
3. Do not rerun the delete without checking first.

## Example output

```text
Delete: failed.
Failed: data-stream:WebOrders_Order_1a2b3c4d; mutation: unknown.
STREAM_DELETE_PARENT_DRIFT: Plugin verification failed during delete retained parent preservation for "WebOrders_Order_1a2b3c4d__dll": parents.0.fields.length: expected 4; observed 5. Deletion outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: The stream was deleted, but its kept DLO changed or could not be read the same way. Check the DLO in the org before anything else.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_DELETE_PARENT_DRIFT.md
```

## Related codes

- [`STREAM_DELETE_SETTLEMENT_UNCONFIRMED`](../data-stream/STREAM_DELETE_SETTLEMENT_UNCONFIRMED.md) — the deletion itself could not be confirmed.
- [`STREAM_DELETE_DEPENDENCIES_BLOCKED`](../data-stream/STREAM_DELETE_DEPENDENCIES_BLOCKED.md) — the kept DLO still has dependencies.
