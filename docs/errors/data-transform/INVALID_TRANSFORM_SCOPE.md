# `INVALID_TRANSFORM_SCOPE`

> Data transforms are only supported with API version auto or 68.0 in the default data space. Remove other --api-version or data space values and rerun.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data transform                           |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

The command was asked to work on a data transform with an API version other than `auto` or `68.0`, or in a data space other than `default`. Data transforms are only handled through API 68 in the default data space.

## Why the plugin stops

The plugin only reads and writes data transforms through the API version and data space it has checked. Sending the request elsewhere could change a transform under rules the plugin does not know.

## How to fix

1. Use `--api-version auto` (the default) or `--api-version 68.0`.
2. Remove any data space selection, or set it to `default`.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked (INVALID_TRANSFORM_SCOPE). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_TRANSFORM_SCOPE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: Data transforms are only supported with API version auto or 68.0 in the default data space. Remove other --api-version or data space values and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INVALID_TRANSFORM_SCOPE.md
```

## Related codes

- [`INVALID_TRANSFORM_SELECTION`](../data-transform/INVALID_TRANSFORM_SELECTION.md) — the selection itself cannot be combined with a transform.
- [`INVALID_TRANSFORM_DELETE_SELECTION`](../data-transform/INVALID_TRANSFORM_DELETE_SELECTION.md) — delete flags do not form a valid transform selection.
