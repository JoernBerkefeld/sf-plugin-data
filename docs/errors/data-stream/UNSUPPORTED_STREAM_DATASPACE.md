# `UNSUPPORTED_STREAM_DATASPACE`

> Data streams are supported only in the default data space: deploy refuses another identity.dataSpace, and retrieve does not write a stream whose DLO is in another space.

|              |                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                                                |
| **Commands** | `sf data360 deploy`, `sf data360 retrieve`                                                                                                 |
| **Outcome**  | `blocked` on deploy — nothing was changed; `failed` for that stream on retrieve — no file was written, the other items are still retrieved |

## What it means

The create and update requests are built only for streams in the `default` data space. This code means `identity.dataSpace` in the document is something else.

The deploy command normally refuses such a file earlier with `INVALID_SCOPE`, so this code is a second guard at the point where the request body is built.

On retrieve it means the landing DLO of the stream is in another data space. Selection is per data space, so that stream is an item failure rather than a file written as-is.

## Why the plugin stops

The plugin has only checked stream requests in the default data space and does not send them for other spaces.

## How to fix

1. Set `"dataSpace": "default"` in `identity` of the stream file.
2. Run the deploy without `--dataspace`, or with `--dataspace default`.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
UNSUPPORTED_STREAM_DATASPACE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: Data stream create and update support only the default data space. Set identity.dataSpace to default in the stream file.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/UNSUPPORTED_STREAM_DATASPACE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`INVALID_SCOPE`](../general/INVALID_SCOPE.md) — the general check on data space and API version.
- [`INVALID_STREAM_BINDING`](../data-stream/INVALID_STREAM_BINDING.md) — the same rule when finding the stream.
