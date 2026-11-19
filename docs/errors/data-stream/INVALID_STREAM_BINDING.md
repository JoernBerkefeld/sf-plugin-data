# `INVALID_STREAM_BINDING`

> A stream, connection, event or primary key name of the stream selection is not a valid developer name. Use the exact names from a retrieved stream file, then rerun.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                                                                          |

## What it means

To find a stream in the org, the plugin needs a stream name, a connection name, an event name and a primary key name that are valid developer names (a letter first, then letters, digits or underscores). This code means one of them is not.

## Why the plugin stops

A name outside the allowed pattern could not be matched safely against the org.

## How to fix

1. Check `identity.apiName`, `spec.connectionName`, `spec.event` and `spec.newDlo.primaryKey.name` in the stream file: each must start with a letter and use only letters, digits and underscores.
2. Rerun the command.

## Example output

```text
Delete: blocked.
INVALID_STREAM_BINDING: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: A stream, connection, event or primary key name of the stream selection is not a valid developer name. Use the exact names from a retrieved stream file, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_BINDING.md
```

## Related codes

- [`INVALID_SCOPE`](../general/INVALID_SCOPE.md) — the general check on data space and API version.
- [`UNSUPPORTED_STREAM_DATASPACE`](../data-stream/UNSUPPORTED_STREAM_DATASPACE.md) — the stream's DLO is not in the run's data space.
- [`INVALID_STREAM_NAME`](../data-stream/INVALID_STREAM_NAME.md) — a name in the stream file is not valid.
