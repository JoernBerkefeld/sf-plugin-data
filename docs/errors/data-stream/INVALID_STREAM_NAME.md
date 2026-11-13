# `INVALID_STREAM_NAME`

> A stream, connection, event, DLO or field name is not a valid developer name. Use a letter first, then only letters, digits and underscores; DLO names end in __dll.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written          |

## What it means

Names in a stream document — `identity.apiName`, `spec.connectionName`, `spec.event`, `spec.newDlo.name`, the primary key name, mapping names and the names under `observed` — must start with a letter and contain only letters, digits and underscores (at most 200 characters). DLO names must end in `__dll`.

The same check runs before the plugin reads a stream by name or ID. This code means one of those names failed it.

## Why the plugin stops

Names go into request paths and must match the org exactly. A name outside the pattern could address the wrong resource, so the plugin does not use it.

## How to fix

1. Find the name in the stream file and correct it.
2. For a name that came from the org, compare it with Data Cloud Setup and report a mismatch.
3. Rerun the command.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: INVALID_STREAM_NAME: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: A stream, connection, event, DLO or field name is not a valid developer name. Use a letter first, then only letters, digits and underscores; DLO names end in __dll.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_NAME.md
Downloaded data-stream: 0
```

## Related codes

- [`INVALID_STREAM_DOCUMENT`](../data-stream/INVALID_STREAM_DOCUMENT.md) — the document structure is wrong.
- [`INVALID_STREAM_BINDING`](../data-stream/INVALID_STREAM_BINDING.md) — the selection names are outside the supported scope.
