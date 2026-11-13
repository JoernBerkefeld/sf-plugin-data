# `UNSUPPORTED_STREAM_DATASPACE`

> Data stream create and update support only the default data space. Set identity.dataSpace to default in the stream file.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data stream                     |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The create and update requests are built only for streams in the `default` data space. This code means `identity.dataSpace` in the document is something else.

The deploy command normally refuses such a file earlier with `INVALID_SCOPE`, so this code is a second guard at the point where the request body is built.

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
