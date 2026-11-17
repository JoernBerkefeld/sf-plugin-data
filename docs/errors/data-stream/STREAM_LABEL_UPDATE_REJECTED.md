# `STREAM_LABEL_UPDATE_REJECTED`

> Salesforce refused the Metadata API update of the stream label (DataStreamDefinition); the label was not changed. Read the message, correct the label in the file, then rerun.

|              |                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------ |
| **Family**   | Data stream (Salesforce CRM connector, Ingestion API)                                      |
| **Commands** | `sf data360 deploy`                                                                        |
| **Outcome**  | `failed` — `rejected` when it was the item's only write; `blocked` when no record was read |

## What it means

The file holds another stream label than the org. Salesforce ignores a label in a stream PATCH, so deploy changes the label with one Metadata API `updateMetadata` of the stream's `DataStreamDefinition` record: it reads the record, replaces `masterLabel` and sends the record back over the command's connection. Salesforce answered that update with an error (success `false`, or a client SOAP fault such as `soapenv:Client`, `sf:INVALID_…` or `sf:REQUEST_LIMIT_EXCEEDED`), or the read before it returned no `DataStreamDefinition` record of the stream's name (then nothing was sent and the item is `blocked`). A read that fails is [`STREAM_LABEL_READ_FAILED`](../data-stream/STREAM_LABEL_READ_FAILED.md). A server fault (`soapenv:Server`, `sf:UNKNOWN_EXCEPTION`) is not a refusal: the update may have been applied, so it is reported as [`STREAM_REQUEST_UNCONFIRMED`](../data-stream/STREAM_REQUEST_UNCONFIRMED.md).

The label update is sent before any other change of the same stream. When it is refused, the other changes are not sent.

## Why the plugin reports it

The plugin sends the label as written and lets Salesforce decide. The message carries Salesforce's code and text when they can be shown.

## How to fix

1. Read the message. A too long or otherwise invalid label is corrected in the file.
2. Rerun the deploy. To keep the org's label instead, retrieve the stream and use its label.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: data-stream:Pricebook_Home; mutation: rejected.
STREAM_LABEL_UPDATE_REJECTED: Salesforce refused the Metadata API update of the DataStreamDefinition Pricebook_Home: FIELD_INTEGRITY_EXCEPTION: Label is too long. The label was not changed. Salesforce rejected the write and nothing was written for this item; correct the input before another attempt.
```

## Related codes

- [`STREAM_CHANGE_NOT_APPLIED`](../data-stream/STREAM_CHANGE_NOT_APPLIED.md) — the update was accepted but the stream still reads another value.
- [`STREAM_HTTP_ERROR`](../data-stream/STREAM_HTTP_ERROR.md) — Salesforce refused the stream PATCH.
