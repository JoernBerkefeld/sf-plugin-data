# `INVALID_TRANSFORM_FLAG_SCOPE`

> --transform-operation or --transform-target-id was given, but no data transform is selected. Select a .dataTransform.json file or remove these flags, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The flags `--transform-operation` and `--transform-target-id` only apply when the deploy selection contains a data transform. The selection resolved to other component types only, so these flags have nothing to act on.

## Why the plugin stops

An unused flag usually means the selection is not what you intended. The plugin stops rather than silently ignoring an instruction about a transform it is not deploying.

## How to fix

1. To deploy a transform, select it with `--source-dir data360/dataTransforms/<Name>.dataTransform.json` or `--metadata data-transform:<Name>`.
2. Otherwise remove `--transform-operation` and `--transform-target-id`.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked (INVALID_TRANSFORM_FLAG_SCOPE). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_TRANSFORM_FLAG_SCOPE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: --transform-operation or --transform-target-id was given, but no data transform is selected. Select a .dataTransform.json file or remove these flags, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INVALID_TRANSFORM_FLAG_SCOPE.md
```

## Related codes

- [`INVALID_TRANSFORM_DEPLOY_SELECTION`](../data-transform/INVALID_TRANSFORM_DEPLOY_SELECTION.md) — the transform flags themselves are incomplete or contradictory.
- [`INVALID_TRANSFORM_SELECTION`](../data-transform/INVALID_TRANSFORM_SELECTION.md) — the transform is selected together with inputs it cannot be combined with.
