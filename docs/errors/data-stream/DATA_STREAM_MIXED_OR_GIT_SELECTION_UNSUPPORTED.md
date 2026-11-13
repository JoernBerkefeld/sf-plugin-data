# `DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED`

> Data stream files must be deployed on their own. Select only data-stream files or data-stream:ApiName members, or a --changed-since range with only streams.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data stream                     |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The deploy selection contains at least one data stream file together with files of another family (DLO, DMO, mapping, segment and so on). This applies to explicit selections and to a `--changed-since` range alike.

Data streams are not part of the ordered DLO → DMO → mapping batch.

## Why the plugin stops

A stream creates and owns its landing DLO, so running it in the same batch as other families would mix two different change orders. The plugin refuses the whole selection before any read or write instead of deploying part of it.

## How to fix

1. Deploy the stream alone: `sf data360 deploy -o <org> -m data-stream:<ApiName> --allow-processing`.
2. Deploy the other files in a separate run, after the stream when they depend on its DLO.
3. With `--changed-since`, use a range whose only changed plugin files are streams, or name them with `-m data-stream:<ApiName>`.

## Example output

```text
Deploy execution: blocked (DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: Data stream files must be deployed on their own. Select only data-stream files or data-stream:ApiName members, or a --changed-since range with only streams.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED.md
```

## Related codes

- [`NATIVE_GRAPH_SELECTION_UNSUPPORTED`](../data-graph/NATIVE_GRAPH_SELECTION_UNSUPPORTED.md) — the same rule for data graphs.
- [`INVALID_STREAM_DELETE_SELECTION`](../data-stream/INVALID_STREAM_DELETE_SELECTION.md) — the same rule for `sf data360 delete`.
