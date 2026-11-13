# `STREAM_SNAPSHOT_PENDING`

> The stream or its DLO switched between ACTIVE and PROCESSING between two reads. Wait until processing is finished, then rerun.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` on deploy and delete — nothing was changed; `failed` on retrieve — no file was written                         |

## What it means

The plugin compares reads of the stream taken a moment apart. When the only difference is the processing status of the stream or its DLO changing between `ACTIVE` and `PROCESSING`, it reports this code instead of a drift.

While the plugin waits for a create, update or delete to finish, it treats this as "still in progress" and reads again. You only see the code when it happens during the checks before a write, or on retrieve.

## Why the plugin stops

A status change shows that Salesforce is still working on the stream. Comparing or writing at that moment could give a wrong result, so the plugin stops.

## How to fix

1. Wait until the stream and its DLO show `ACTIVE` in Data Cloud Setup.
2. Rerun the command.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
STREAM_SNAPSHOT_PENDING: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The stream or its DLO switched between ACTIVE and PROCESSING between two reads. Wait until processing is finished, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_SNAPSHOT_PENDING.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`STREAM_NOT_READY`](../data-stream/STREAM_NOT_READY.md) — the stream or DLO was not active.
- [`STREAM_BINDING_DRIFT`](../data-stream/STREAM_BINDING_DRIFT.md) — the reads differed in more than the status.
