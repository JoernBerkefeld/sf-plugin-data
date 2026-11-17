# `STREAM_LABEL_READ_FAILED`

> The Metadata API read of the stream definition before its label update failed, so the update was not sent. Nothing was changed; rerun the deploy.

|              |                                                       |
| ------------ | ----------------------------------------------------- |
| **Family**   | Data stream (Salesforce CRM connector, Ingestion API) |
| **Commands** | `sf data360 deploy`                                   |
| **Outcome**  | `blocked` — mutation `not-attempted`                  |

## What it means

The file holds another stream label than the org. Deploy changes the label with one Metadata API `updateMetadata` of the stream's `DataStreamDefinition` record, and it reads that record first. That read failed (for example a network error or an expired session), so the update was never sent. The label update is the first change of the stream, so no other change was sent either.

## Why the plugin stops

The read supplies the record the update sends back. Without it there is nothing safe to send, and since nothing was written, the item is reported as not attempted rather than as an unknown write.

## How to fix

1. Check your org login and the connection.
2. Rerun the deploy.

## Example output

```text
Deploy execution: blocked.
Blocked: data-stream:Pricebook_Home; mutation: not-attempted.
STREAM_LABEL_READ_FAILED: The Metadata API read of the DataStreamDefinition Pricebook_Home before its label update failed, so the update was not sent. No write attempted; correct the reported check before another attempt.
```

## Related codes

- [`STREAM_LABEL_UPDATE_REJECTED`](../data-stream/STREAM_LABEL_UPDATE_REJECTED.md) — Salesforce refused the label update.
- [`STREAM_REQUEST_UNCONFIRMED`](../data-stream/STREAM_REQUEST_UNCONFIRMED.md) — the label update was sent but its outcome is unknown.
