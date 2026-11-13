# `INVALID_STREAM_BINDING`

> The stream selection is outside the supported scope: data streams work only in the default data space with valid developer names. Remove --dataspace or use default.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                                                                          |

## What it means

To find a stream in the org, the plugin needs a stream name, a connection name, an event name and a primary key name that are valid developer names (a letter first, then letters, digits or underscores), and the data space `default`.

On `sf data360 delete`, this code appears when `--dataspace` names a data space other than `default`. On deploy and retrieve, those cases are usually caught earlier with `INVALID_SCOPE`, so this code here means a name in the file or selection is not a valid developer name.

## Why the plugin stops

Data streams are supported only in the default data space. A name outside the allowed pattern could not be matched safely against the org.

## How to fix

1. Run the command without `--dataspace`, or with `--dataspace default`.
2. Check `identity.apiName`, `spec.connectionName`, `spec.event` and `spec.newDlo.primaryKey.name` in the stream file: each must start with a letter and use only letters, digits and underscores.
3. Rerun the command.

## Example output

```text
Delete: blocked.
INVALID_STREAM_BINDING: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The stream selection is outside the supported scope: data streams work only in the default data space with valid developer names. Remove --dataspace or use default.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_BINDING.md
```

## Related codes

- [`INVALID_SCOPE`](../general/INVALID_SCOPE.md) — the general check on data space and API version.
- [`INVALID_STREAM_NAME`](../data-stream/INVALID_STREAM_NAME.md) — a name in the stream file is not valid.
