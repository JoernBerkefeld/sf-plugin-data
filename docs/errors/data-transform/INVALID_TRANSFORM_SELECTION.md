# `INVALID_TRANSFORM_SELECTION`

> A data transform must be deployed alone: one .dataTransform.json file, no --changed-since, --draft or --wait-timeout, and no other components. Narrow the selection and rerun.

|              |                                            |
| ------------ | ------------------------------------------ |
| **Family**   | Data transform                             |
| **Commands** | `sf data360 deploy`, `sf data360 retrieve` |
| **Outcome**  | `blocked` — nothing was changed            |

## What it means

The selection mixes a data transform with things it cannot be combined with. For deploy this means more than one transform, a transform together with other component types, `--changed-since` together with the transform flags, `--draft`, `--wait-timeout`, more than one `--metadata` value, or a `--source-dir` that is not exactly one `.dataTransform.json` file. It also fires when a transform name or ID does not have a valid format.

## Why the plugin stops

A transform deploy is a single, explicitly chosen create or update. Combining it with other inputs would make the order and outcome of writes harder to prove, so the plugin accepts only one transform per run.

## How to fix

1. Select exactly one transform: `--source-dir data360/dataTransforms/<Name>.dataTransform.json` or `--metadata data-transform:<Name>`.
2. Remove `--changed-since`, `--draft` and `--wait-timeout`.
3. Deploy other components in a separate run.
4. Rerun the command.

## Example output

```text
Deploy execution: blocked (INVALID_TRANSFORM_SELECTION). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_TRANSFORM_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: A data transform must be deployed alone: one .dataTransform.json file, no --changed-since, --draft or --wait-timeout, and no other components. Narrow the selection and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INVALID_TRANSFORM_SELECTION.md
```

## Related codes

- [`INVALID_TRANSFORM_FLAG_SCOPE`](../data-transform/INVALID_TRANSFORM_FLAG_SCOPE.md) — transform flags were given but no transform is selected.
- [`INVALID_TRANSFORM_SCOPE`](../data-transform/INVALID_TRANSFORM_SCOPE.md) — the API version or data space is not supported.
