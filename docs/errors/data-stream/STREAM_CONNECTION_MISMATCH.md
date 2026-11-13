# `STREAM_CONNECTION_MISMATCH`

> The stream's Ingestion API connection was found but is not connected or its details differ. Check the connection's status in the org, then rerun.

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

After finding the connection in the list, the plugin reads it again by ID. This code means that read did not confirm it: the ID or name differs from the list entry, the connector type is not Ingestion API, or its status is not `CONNECTED`.

## Why the plugin stops

A stream on a connection that is not connected, or on one whose details changed between reads, cannot be checked or created safely.

## How to fix

1. Open the connection in Data Cloud Setup and check its status.
2. Finish its setup so it shows as connected.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
STREAM_CONNECTION_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The stream's Ingestion API connection was found but is not connected or its details differ. Check the connection's status in the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_CONNECTION_MISMATCH.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`AMBIGUOUS_STREAM_CONNECTION`](../data-stream/AMBIGUOUS_STREAM_CONNECTION.md) — the connection could not be found exactly once.
