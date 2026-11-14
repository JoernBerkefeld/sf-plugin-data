# `INVALID_TRANSFORM_SELECTION`

> A data transform name or record ID has an invalid format. Use the API name as in the org (letters, digits, underscores) or the 18-character ID starting with 1dt, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data transform                  |
| **Commands** | `sf data360 retrieve`           |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

A transform is read by its API name or by its record ID. The value given does not have a valid format: an API name starts with a letter and holds only letters, digits and underscores (at most 200 characters); a record ID has 18 characters and starts with `1dt`.

## Why the plugin stops

The value becomes part of the request path. A malformed value could address a different resource, so the plugin refuses it before any request.

## How to fix

1. Check the name in `--metadata data-transform:<Name>` against the transform in Data Cloud.
2. Rerun the command.

## Example output

```text
Retrieve: blocked.
INVALID_TRANSFORM_SELECTION: Native Data Transform operation refused: INVALID_TRANSFORM_SELECTION.
Hint: A data transform name or record ID has an invalid format. Use the API name as in the org (letters, digits, underscores) or the 18-character ID starting with 1dt, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/INVALID_TRANSFORM_SELECTION.md
```

## Related codes

- [`INVALID_TRANSFORM_SCOPE`](../data-transform/INVALID_TRANSFORM_SCOPE.md) — the API version or data space is not supported.
- [`TRANSFORM_IDENTITY_MISMATCH`](../data-transform/TRANSFORM_IDENTITY_MISMATCH.md) — the read returned a different transform.
