# `INVALID_STREAM_READ`

> Salesforce returned a stream, connection or DLO answer that is not a JSON object where one was expected. Rerun the command; report it if it keeps happening.

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

The plugin expects each stream, connection, schema, DLO and dependency entry it reads to be a JSON object. This code means one was missing, `null`, a list or a plain value instead.

## Why the plugin stops

The plugin compares these reads field by field. A value it cannot read as an object cannot be compared, so it stops.

## How to fix

1. Rerun the command.
2. If it keeps happening, report it with the API version used.
3. If `mutation` is `unknown`, check the stream in Data Cloud Setup before you rerun a deploy or delete.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: INVALID_STREAM_READ: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: Salesforce returned a stream, connection or DLO answer that is not a JSON object where one was expected. Rerun the command; report it if it keeps happening.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_READ.md
Downloaded data-stream: 0
```

## Related codes

- [`UNSUPPORTED_STREAM_READ`](../data-stream/UNSUPPORTED_STREAM_READ.md) — the stream was read but is outside the supported profile.
- [`INVALID_STREAM_RESPONSE`](../data-stream/INVALID_STREAM_RESPONSE.md) — the answer to a create or update was not a JSON object.
