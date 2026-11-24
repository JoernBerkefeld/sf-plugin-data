# `INVALID_SCOPE`

> This family does not support the requested --api-version, or the run could not use the data space. Use --api-version auto (or a version the family allows), then rerun.

|              |                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`, `sf data360 publish`, `sf data360 segment members export` |
| **Outcome**  | `blocked` — nothing was read, written or deleted                                                                           |

## What it means

Each family supports a fixed set of API versions and data spaces. Native DLO, DMO, mapping and relationship routes accept `auto` (API 68) or a numeric version from `61.0`. Data graphs, data streams, data transforms, Segments, calculated insights and identity resolutions accept only `auto` or their own fixed version. Every family works in any data space of the org. `INVALID_SCOPE` means the requested `--api-version` is outside that set, or a component could not be used in the run's data space.

`sf data360 retrieve` without `-m` selects every family. With an explicit `--api-version` other than `68.0`, the families fixed at API 68 refuse it, so that run is refused with this code. Name the families you want with `-m`, for example `-m dlo -m dmo -m mapping --api-version 64.0`.

## Why the plugin stops

The plugin has verified each family only on specific routes. Using an unverified version could read or write differently from what the plugin checks.

## How to fix

1. Drop `--api-version`, or set it to `auto`.
2. Check that `--dataspace` names the data space of the selected files.
3. If you mix families, split them into separate runs when their supported versions differ.
4. For a retrieve with a pinned `--api-version`, pass `-m` with the native families.

## Example output

```text
Deploy execution: blocked (INVALID_SCOPE). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_SCOPE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: This family does not support the requested --api-version, or the run could not use the data space. Use --api-version auto (or a version the family allows), then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_SCOPE.md
```

## Related codes

- [`INVALID_DRAFT_SCOPE`](../general/INVALID_DRAFT_SCOPE.md) — scope rule specific to `--draft`.
- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — the selection itself is not valid.
- [`INVALID_NATIVE_DATA_GRAPH_SCOPE`](../data-graph/INVALID_NATIVE_DATA_GRAPH_SCOPE.md) — the data graph scope check.
