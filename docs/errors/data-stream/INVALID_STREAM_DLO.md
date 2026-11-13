# `INVALID_STREAM_DLO`

> The stream's linked DLO could not be read as exactly one matching DLO in the default data space. Check the DLO in the org, then rerun.

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

Every Ingestion API stream writes into a landing DLO. The plugin reads that DLO by name and expects exactly one result with the same name, a record ID, category `Other`, the `default` data space and a field list.

This code means the read returned no DLO, several DLOs, or one that differs on one of those points.

## Why the plugin stops

The stream file describes the DLO's fields and primary key, and deletes may remove the DLO. If the DLO cannot be identified exactly, the plugin cannot compare or protect it, so it stops.

## How to fix

1. Open the stream in Data Cloud Setup and note the name of its DLO.
2. Check that the DLO exists, is in the default data space and has category Other.
3. Rerun the command. If `mutation` is `unknown`, check the stream and DLO before you rerun a deploy or delete.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: INVALID_STREAM_DLO: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: The stream's linked DLO could not be read as exactly one matching DLO in the default data space. Check the DLO in the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_DLO.md
Downloaded data-stream: 0
```

## Related codes

- [`STREAM_DLO_DRIFT`](../data-stream/STREAM_DLO_DRIFT.md) — the DLO was found but its fields differ from the stream.
- [`UNSUPPORTED_STREAM_READ`](../data-stream/UNSUPPORTED_STREAM_READ.md) — the stream itself is outside the supported profile.
