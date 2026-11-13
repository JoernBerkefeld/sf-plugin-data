# `DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED`

> Data stream files must be deployed on their own. Select only data-stream files or data-stream:ApiName members, without --changed-since or other families.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data stream                     |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The deploy selection contains at least one data stream file together with files of another family (DLO, DMO, mapping, segment and so on), or the selection was made with `--changed-since`.

Data streams are not part of the ordered DLO → DMO → mapping batch and are not picked up from Git changes.

## Why the plugin stops

A stream creates and owns its landing DLO, so running it in the same batch as other families would mix two different change orders. The plugin refuses the whole selection before any read or write instead of deploying part of it.

## How to fix

1. Deploy the stream alone: `sf data360 deploy -o <org> -m data-stream:<ApiName> --allow-processing`.
2. Deploy the other files in a separate run, after the stream when they depend on its DLO.
3. Do not use `--changed-since` for streams; name them with `-m data-stream:<ApiName>` or `--source-dir`.

## Example output

```text
Deploy execution: blocked (DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: Data stream files must be deployed on their own. Select only data-stream files or data-stream:ApiName members, without --changed-since or other families.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/DATA_STREAM_MIXED_OR_GIT_SELECTION_UNSUPPORTED.md
```

## Related codes

- [`NATIVE_MIXED_SELECTION_UNSUPPORTED`](../general/NATIVE_MIXED_SELECTION_UNSUPPORTED.md) — the same rule for other native families.
- [`INVALID_STREAM_DELETE_SELECTION`](../data-stream/INVALID_STREAM_DELETE_SELECTION.md) — the same rule for `sf data360 delete`.
