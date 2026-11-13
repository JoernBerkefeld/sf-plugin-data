# `INVALID_TRANSFORM_SELECTION`

> A deploy takes at most one data transform, named exactly by -m data-transform:<Name> or its .dataTransform.json file, and not with --changed-since or --draft. Narrow the selection and rerun.

|              |                                            |
| ------------ | ------------------------------------------ |
| **Family**   | Data transform                             |
| **Commands** | `sf data360 deploy`, `sf data360 retrieve` |
| **Outcome**  | `blocked` — nothing was changed            |

## What it means

For deploy: the selection holds more than one data transform, more than one `data-transform:` member, a transform that is not named exactly (a `--source-dir` directory instead of its `.dataTransform.json` file), a transform changed in a `--changed-since` range, or `--draft`. The transform flags themselves are refused together with `--changed-since`. A transform may share the deploy with other families; it runs after streams and native DLO/DMO/mapping/relationship items and before identity resolution, calculated insights, Segments and graphs. For retrieve it fires when a transform name or ID does not have a valid format.

## Why the plugin stops

`--transform-operation` and `--transform-target-id` describe one explicitly chosen create or update. They cannot address several transforms, and `--changed-since` does not accept them, so a transform must be named in the command.

## How to fix

1. Name exactly one transform: `--source-dir data360/dataTransforms/<Name>.dataTransform.json` or `--metadata data-transform:<Name>`; other families may be selected beside it.
2. Deploy a transform changed in a Git range with an explicit selection instead of `--changed-since`, and remove `--draft`.
3. Deploy further transforms in separate runs.
4. Rerun the command.

## Example output

```text
Deploy execution: blocked (INVALID_TRANSFORM_SELECTION). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_TRANSFORM_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: A deploy takes at most one data transform, named exactly by -m data-transform:<Name> or its .dataTransform.json file, and not with --changed-since or --draft. Narrow the selection and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INVALID_TRANSFORM_SELECTION.md
```

## Related codes

- [`INVALID_TRANSFORM_FLAG_SCOPE`](../data-transform/INVALID_TRANSFORM_FLAG_SCOPE.md) — transform flags were given but no transform is selected.
- [`INVALID_TRANSFORM_SCOPE`](../data-transform/INVALID_TRANSFORM_SCOPE.md) — the API version or data space is not supported.
