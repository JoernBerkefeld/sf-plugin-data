# `CREATE_ADDITIONS_UNSUPPORTED`

> A new data stream cannot be created together with additive field mappings. Remove them from the file, deploy to create the stream, then add the mappings and deploy again.

|              |                                                    |
| ------------ | -------------------------------------------------- |
| **Family**   | Data stream                                        |
| **Commands** | `sf data360 deploy` (also reported by `--preview`) |
| **Outcome**  | `blocked` — the data stream was not created        |

## What it means

The data stream file lists entries in `additiveFieldMappings`, but the stream does not exist in the target yet. The plugin creates a new Ingestion API stream with its primary key only; extra field mappings are supported as an update of an existing stream, not as part of the create.

## Why the plugin stops

The create request the plugin sends has been verified only in its primary-key-only form. Sending more in the same request could create a stream whose mappings the plugin cannot confirm, so it stops before any write.

## How to fix

1. Move the `additiveFieldMappings` entries out of `data360/data-stream/<ApiName>.data-stream-meta.json` (keep a copy).
2. Run `sf data360 deploy -m data-stream:<ApiName> --allow-processing` to create the stream.
3. Put the mappings back and run the same deploy again to add them.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:Orders_Stream; mutation: not-attempted.
CREATE_ADDITIONS_UNSUPPORTED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: A new data stream cannot be created together with additive field mappings. Remove them from the file, deploy to create the stream, then add the mappings and deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/CREATE_ADDITIONS_UNSUPPORTED.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`PROCESSING_ACKNOWLEDGEMENT_REQUIRED`](../general/PROCESSING_ACKNOWLEDGEMENT_REQUIRED.md) — creating a stream also needs `--allow-processing`.
- [`STREAM_EXISTING_BINDING_REQUIRES_UPDATE`](../data-stream/STREAM_EXISTING_BINDING_REQUIRES_UPDATE.md) — another refusal of the stream create route.
