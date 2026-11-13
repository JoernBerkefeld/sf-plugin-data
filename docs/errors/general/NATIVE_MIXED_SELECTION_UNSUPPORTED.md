# `NATIVE_MIXED_SELECTION_UNSUPPORTED`

> Mappings and relationships deploy only together with DLO, DMO, mapping and relationship inputs, and never through --changed-since. Deploy other families in a separate run.

|              |                                  |
| ------------ | -------------------------------- |
| **Family**   | General                          |
| **Commands** | `sf data360 deploy`              |
| **Outcome**  | `blocked` — nothing was deployed |

## What it means

The selection contains a mapping or a relationship together with a family outside the native group (for example a Segment, calculated insight or identity resolution), or a native selection was combined with `--changed-since`. Mappings and relationships run on the native route, which deploys DLOs, then DMOs, then mappings, then relationships in that order and does not include other families.

## Why the plugin stops

The native route checks that each parent is ready before deploying the items that depend on it. Other families use a different route with different checks, so the two cannot be safely mixed in one run.

## How to fix

1. Deploy the DLO, DMO, mapping and relationship files in one run.
2. Deploy Segment, calculated insight, identity resolution and other files in a second run.
3. Select mappings and relationships explicitly with `--source-dir` or `-m`, not with `--changed-since`.

## Example output

```text
Deploy execution: blocked (NATIVE_MIXED_SELECTION_UNSUPPORTED). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
NATIVE_MIXED_SELECTION_UNSUPPORTED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: Mappings and relationships deploy only together with DLO, DMO, mapping and relationship inputs, and never through --changed-since. Deploy other families in a separate run.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/NATIVE_MIXED_SELECTION_UNSUPPORTED.md
```

## Related codes

- [`DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED`](../data-stream/DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED.md) — the same rule for data streams.
- [`NATIVE_GRAPH_SELECTION_UNSUPPORTED`](../data-graph/NATIVE_GRAPH_SELECTION_UNSUPPORTED.md) — the same rule for data graphs.
- [`NATIVE_PARENT_SETTLEMENT_UNCONFIRMED`](../general/NATIVE_PARENT_SETTLEMENT_UNCONFIRMED.md) — the parent check of the native route.
