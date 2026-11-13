# `INVALID_STREAM_CONNECTION`

> The connection name used to list streams is not a valid developer name. Fix spec.connectionName so it starts with a letter and uses only letters, digits and underscores.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` on deploy and delete — nothing was changed; `failed` on retrieve — no file was written                         |

## What it means

The plugin lists a connection's data streams by the connection's developer name. Before it sends that request it checks the name: a letter first, then up to 199 letters, digits or underscores. This code means the name failed that check.

The stream file and the org's connection list are checked before this point, so in practice this points to a name the org returned in an unexpected form.

## Why the plugin stops

The name goes into the request URL. A name outside the pattern could change what the request asks for, so the plugin does not send it.

## How to fix

1. Check `spec.connectionName` in the stream file and the connection's developer name in Data Cloud Setup.
2. Correct the file so the two match exactly, then rerun the command.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: INVALID_STREAM_CONNECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: The connection name used to list streams is not a valid developer name. Fix spec.connectionName so it starts with a letter and uses only letters, digits and underscores.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_CONNECTION.md
Downloaded data-stream: 0
```

## Related codes

- [`AMBIGUOUS_STREAM_CONNECTION`](../data-stream/AMBIGUOUS_STREAM_CONNECTION.md) — the connection could not be found exactly once.
- [`INVALID_STREAM_NAME`](../data-stream/INVALID_STREAM_NAME.md) — the same check for stream and other names.
