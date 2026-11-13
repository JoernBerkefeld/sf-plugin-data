# `INVALID_SCOPE`

> This family does not support the requested --api-version or --dataspace. Use --api-version auto (or a version the family allows) and the default data space, then rerun.

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Family**   | General                                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`, `sf data360 publish` |
| **Outcome**  | `blocked` — nothing was read, written or deleted                                      |

## What it means

Each family supports a fixed set of API versions and data spaces. Native DLO, DMO, mapping and relationship routes accept `auto` (API 68) or a numeric version from `61.0`. Data graphs, data streams, data transforms, Segments, calculated insights and identity resolutions accept only `auto` or their own fixed version and only the `default` data space. `INVALID_SCOPE` means the requested `--api-version` or `--dataspace` is outside that set.

## Why the plugin stops

The plugin has verified each family only on specific routes. Using an unverified version or data space could read or write differently from what the plugin checks.

## How to fix

1. Drop `--api-version`, or set it to `auto`.
2. Drop `--dataspace` unless the family supports other data spaces, or set it to `default`.
3. If you mix families, split them into separate runs when their supported versions differ.

## Example output

```text
Deploy execution: blocked (INVALID_SCOPE). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_SCOPE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: This family does not support the requested --api-version or --dataspace. Use --api-version auto (or a version the family allows) and the default data space, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_SCOPE.md
```

## Related codes

- [`INVALID_DRAFT_SCOPE`](../general/INVALID_DRAFT_SCOPE.md) — scope rule specific to `--draft`.
- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — the selection itself is not valid.
- [`INVALID_NATIVE_DATA_GRAPH_SCOPE`](../data-graph/INVALID_NATIVE_DATA_GRAPH_SCOPE.md) — the data graph scope check.
