# `STREAM_DLO_DRIFT`

> The stream's DLO fields or identity differ from what the stream reports. Wait until the DLO is not being changed, then rerun; inspect the org first if mutation is unknown.

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

The stream read lists its DLO fields, and the plugin reads the DLO itself as well. Each stream field `X` should match DLO field `X__c` with the same label, type and primary key flag. Before a delete, the DLO read by name must also equal the DLO read by ID, and after a create the new DLO must keep the same ID between reads.

This code means one of those comparisons failed. The message names the check and the first difference.

## Why the plugin stops

A DLO that does not match its stream points to a change in progress or a change made outside the stream. The plugin compares these to protect the DLO, so it stops.

## How to fix

1. Read the difference in the message.
2. Check the DLO in Data Cloud Setup and make sure nobody is changing it.
3. Rerun. If `mutation` is `unknown`, check the stream and DLO before rerunning a deploy or delete.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: STREAM_DLO_DRIFT: Plugin verification failed during retrieve linked DLO field agreement for "WebOrders_Order_1a2b3c4d__dll": fields.length: expected 3; observed 4. Data stream retrieval did not complete; no write attempted.
Hint: The stream's DLO fields or identity differ from what the stream reports. Wait until the DLO is not being changed, then rerun; inspect the org first if mutation is unknown.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_DLO_DRIFT.md
Downloaded data-stream: 0
```

## Related codes

- [`INVALID_STREAM_DLO`](../data-stream/INVALID_STREAM_DLO.md) — the DLO could not be read as exactly one.
- [`STREAM_BINDING_DRIFT`](../data-stream/STREAM_BINDING_DRIFT.md) — the stream itself differed between reads.
